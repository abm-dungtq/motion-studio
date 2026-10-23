import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterFor } from "../lib/provider.mjs";
import { fakePlugin } from "./fake-plugin.mjs";
import { parseArgs, toolsForProfile } from "../mcp/studio-mcp.mjs";
import { LATEST } from "../lib/mcp/protocol.mjs";

const SERVER = fileURLToPath(new URL("../mcp/studio-mcp.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const A = await adapterFor({});
let root, plugin;

before(() => {
  root = mkdtempSync(join(tmpdir(), "ms-mcp-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  plugin = fakePlugin({ schema: A.NEED.schema });
});
after(() => { rmSync(root, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true }); });

// A JSON-RPC client over the server's stdio: send(obj | raw line) and wait for the reply by id.
function client(args, env = {}) {
  const child = spawn(process.execPath, [SERVER, "--root", root, ...args], { env: { ...process.env, MOTION_STUDIO_STATE: join(root, "studio.json"), ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const waiting = new Map();
  const replies = [];
  let buf = "", errText = "";
  child.stdout.on("data", (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      replies.push(msg);
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    }
  });
  child.stderr.on("data", (c) => (errText += c));
  let n = 0;
  const exited = new Promise((r) => child.on("exit", (code) => r(code)));
  return {
    child, replies, exited, stderr: () => errText,
    raw(line) { child.stdin.write(line + "\n"); },
    call(method, params) {
      const id = ++n;
      const p = new Promise((res, rej) => {
        waiting.set(id, res);
        setTimeout(() => rej(new Error(`no reply to ${method}: ${errText}`)), 15000).unref();
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      return p;
    },
    note(method) { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"); },
    end() { child.stdin.end(); return exited; },
  };
}

const textOf = (r) => JSON.parse(r.result.content[0].text);

test("initialize answers the protocol version and the tools capability; tools/list has the Studio tools", async () => {
  const c = client(["--profile", "external"], { OPUS_VIDEO_HOME: plugin });
  try {
    const init = await c.call("initialize", { protocolVersion: LATEST, capabilities: {}, clientInfo: { name: "test", version: "0" } });
    assert.equal(init.result.protocolVersion, LATEST);
    assert.ok(init.result.capabilities.tools);
    assert.equal(init.result.serverInfo.name, "motion-studio");
    assert.equal((await c.call("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, LATEST, "an unknown version gets the latest");
    c.note("notifications/initialized");
    const tools = (await c.call("tools/list", {})).result.tools;
    const names = tools.map((t) => t.name);
    assert.equal(tools.find((t) => t.name === "project_get").annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === "project_patch").annotations.readOnlyHint, false);
    for (const t of ["project_get", "project_summary", "project_patch", "receipts_list", "receipt_get", "media_check"]) assert.ok(names.includes(t), t);
    const list = await c.call("tools/call", { name: "receipts_list", arguments: { project: "demo" } });
    assert.equal(list.result.isError, false);
    assert.deepEqual(textOf(list), []);
  } finally { assert.equal(await c.end(), 0, c.stderr()); }
});

test("profile director hides the tools the provider's server already has", async () => {
  const c = client(["--profile", "director", "--request", "r-20261023090000-abcd"], { OPUS_VIDEO_HOME: plugin });
  try {
    await c.call("initialize", { protocolVersion: LATEST });
    const names = (await c.call("tools/list", {})).result.tools.map((t) => t.name);
    assert.ok(!names.includes("project_get"), "the fake provider serves project_get");
    assert.ok(names.includes("receipts_list") && names.includes("project_patch"));
    const call = await c.call("tools/call", { name: "project_get", arguments: { project: "demo" } });
    assert.equal(call.error.code, -32602, "a hidden tool is unknown here");
  } finally { await c.end(); }
});

test("missing arguments are a tool error, bad JSON is -32700 and the server keeps going, stdin end exits", async () => {
  const c = client([], { OPUS_VIDEO_HOME: plugin });
  try {
    const r = await c.call("tools/call", { name: "receipt_get", arguments: { project: "demo" } });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /thiếu id/);
    const bad = await c.call("tools/call", { name: "receipts_list", arguments: { project: "../etc" } });
    assert.equal(bad.result.isError, true);
    c.raw("{not json");
    const pong = await c.call("ping", {});
    assert.deepEqual(pong.result, {});
    assert.ok(c.replies.some((m) => m.error?.code === -32700 && m.id === null));
    assert.equal((await c.call("nope/method", {})).error.code, -32601);
    assert.equal((await c.call("tools/call", { name: "no_such_tool", arguments: {} })).error.code, -32602);
  } finally { assert.equal(await c.end(), 0, "the server exits when the client closes stdin"); }
});

test("argv and profile filtering", () => {
  assert.deepEqual(parseArgs([]), { root: null, profile: "external", request: null });
  assert.equal(parseArgs(["--profile", "director", "--request", "r-1"]).request, "r-1");
  assert.throws(() => parseArgs(["--profile", "x"]), /--profile/);
  assert.throws(() => parseArgs(["--root"]), /cần một giá trị/);
  assert.throws(() => parseArgs(["--what"]), /không hiểu/);
  const tools = [{ name: "project_get" }, { name: "receipts_list" }];
  const P = { director: { toolPrefix: "mcp__x__", mcpTools: ["mcp__x__project_get"] } };
  assert.deepEqual(toolsForProfile("director", tools, P).map((t) => t.name), ["receipts_list"]);
  assert.deepEqual(toolsForProfile("external", tools, P).map((t) => t.name), ["project_get", "receipts_list"]);
  assert.deepEqual(toolsForProfile("director", tools, null).map((t) => t.name), ["project_get", "receipts_list"]);
});
