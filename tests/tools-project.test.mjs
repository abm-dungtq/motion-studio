import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { loadProvider } from "../lib/provider.mjs";
import { callTool, toolEnv } from "../lib/tools.mjs";
import { actorFor } from "../mcp/studio-mcp.mjs";
import { mcpConfig, stableNode } from "../routes/mcp.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const SERVER = fileURLToPath(new URL("../mcp/studio-mcp.mjs", import.meta.url));
const TOKEN = "m".repeat(64);
const P = await loadProvider();
let root, server, port;
const noStudio = { get: async () => { throw new Error("no studio"); }, post: async () => { throw new Error("no studio"); } };
const env = (extra = {}) => ({ ...toolEnv({ root, P, studio: noStudio }), actor: "director", ...extra });

before(async () => {
  root = mkdtempSync(join(tmpdir(), "ms-tools-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  cpSync(FIXTURE, join(root, "media"), { recursive: true });
  mkdirSync(join(root, "empty-folder"));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => { server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true }); });

function http(method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, json: JSON.parse(s || "null") }));
    });
    req.on("error", rej); req.end(data ?? undefined);
  });
}

test("project_patch with a stale base is a CONFLICT; with the base just read it makes v+1 as actor director", async () => {
  const list = await callTool("project_list", {}, env());
  assert.ok(list.ok);
  assert.deepEqual(list.result.map((p) => p.name), ["demo", "media"], "folders without a manifest are not projects");
  const sum = await callTool("project_summary", { project: "demo" }, env());
  assert.equal(sum.result.version, 1);
  assert.deepEqual(sum.result.shots.map((s) => s.id), ["s1", "s2", "s3"]);

  const op = { op: "set_shot", id: "s1", field: "name", value: "Mở đầu" };
  const stale = await callTool("project_patch", { project: "demo", base: 0, ops: [op] }, env());
  assert.equal(stale.ok, false);
  assert.match(stale.error, /CONFLICT/);
  const missing = await callTool("project_patch", { project: "demo", ops: [op] }, env());
  assert.match(missing.error, /thiếu base/);

  const ok = await callTool("project_patch", { project: "demo", base: 1, ops: [op], note: "đổi tên" }, env({ request: "r-20261023090000-abcd" }));
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.result.version, 2);
  const log = await callTool("project_log", { project: "demo", limit: 1 }, env());
  assert.equal(log.result[0].actor, "director");
  assert.equal(log.result[0].v, 2);
  assert.match(log.result[0].note, /đổi tên · yêu cầu Studio r-20261023090000-abcd/);
  assert.equal((await callTool("project_get", { project: "demo" }, env())).result.shots[0].name, "Mở đầu");

  const undo = await callTool("project_undo", { project: "demo", base: 2 }, env());
  assert.equal(undo.result.version, 3);
  assert.equal((await callTool("project_get", { project: "demo" }, env())).result.shots[0].name, "Tiêu đề");
  assert.match((await callTool("project_get", { project: "empty-folder" }, env())).error, /chưa có project\.json/);
  assert.match((await callTool("project_get", { project: "nope" }, env())).error, /không có dự án/);
});

test("an outside client edits as director until the gateway knows an agent actor", () => {
  assert.equal(actorFor("external", P), P.gateway.ACTORS.includes("agent") ? "agent" : "director");
  assert.equal(actorFor("external", { gateway: { ACTORS: ["human", "director", "agent"] } }), "agent");
  assert.equal(actorFor("director", { gateway: { ACTORS: ["agent"] } }), "director");
});

test("receipt routes: list, one receipt, a check on demand; the MCP config route", async () => {
  const clip = join(root, "media", "assets", "clip.mp4");
  mkdirSync(join(root, "media", "assets"), { recursive: true });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=d=2:s=320x240:r=30", "-pix_fmt", "yuv420p", clip]);
  const c = await http("POST", "/api/media/check", { name: "media", files: ["assets/clip.mp4"], expected: { width: 320, height: 240, fps: 30, duration: 2 } });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal(c.json.op, "media-check");
  assert.equal(c.json.actor, "human");
  assert.equal(c.json.verdict, "pass", JSON.stringify(c.json.checks));
  assert.ok(c.json.checks.some((x) => x.id === "resolution-fps" && x.pass && /khớp/.test(x.detail)));
  const l = await http("GET", "/api/receipts?name=media");
  assert.equal(l.json.receipts[0].id, c.json.id);
  assert.equal(l.json.receipts[0].verdict, "pass");
  assert.deepEqual(l.json.receipts[0].outputs, ["assets/clip.mp4"]);
  const one = await http("GET", `/api/receipt?name=media&id=${c.json.id}`);
  assert.equal(one.json.id, c.json.id);
  assert.ok(one.json.checks.every((x) => x.level === "fail" || x.level === "warn"));
  assert.equal((await http("GET", "/api/receipt?name=media&id=zzzzzzzz-000000")).status, 404);
  assert.equal((await http("GET", "/api/receipt?name=media&id=../x")).status, 400);
  assert.equal((await http("POST", "/api/media/check", { name: "media", files: ["../demo/project.json"] })).status, 400);
  assert.equal((await http("POST", "/api/media/check", { name: "media", files: "x" })).status, 400);
  assert.equal((await http("GET", "/api/receipts?name=nope")).status, 404);

  const m = await http("GET", "/api/mcp/config");
  assert.equal(m.status, 200);
  assert.deepEqual(m.json.args, [SERVER, "--profile", "external", "--root", m.json.root]);
  assert.match(m.json.claude, /^claude mcp add motion-studio -- \S+ \S+studio-mcp\.mjs --profile external --root /);
  assert.match(m.json.codex_toml, /^\[mcp_servers\.motion-studio\]\ncommand = ".+"\nargs = \[".+studio-mcp\.mjs", "--profile", "external"/);
  assert.match(m.json.agy, /^agy mcp add motion-studio -- /);
  assert.equal(mcpConfig({ root: "/a b", node: "/n" }).claude.endsWith("--root '/a b'"), true, "paths with spaces are quoted");
  const link = join(root, "node-link");
  symlinkSync(process.execPath, link);
  assert.equal(stableNode(process.execPath, [join(root, "none"), link]), link, "a stable link to the same node is preferred");
  assert.equal(stableNode("/nope/node", [link]), "/nope/node");
});
