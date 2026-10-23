import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProvider } from "../lib/provider.mjs";
import { buildPrompt, claudeArgs, reader, STUDIO_PREFIX, studioMcp, studioMcpFile, studioToolNames } from "../director.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const SERVER = fileURLToPath(new URL("../mcp/studio-mcp.mjs", import.meta.url));
const P = await loadProvider();
const req = { id: "r-20261023090000-abcd", scope: "project", target: null, t: null, base: 1, text: "x" };
let root, dir, saved;

before(() => {
  root = mkdtempSync(join(tmpdir(), "ms-dmcp-"));
  dir = join(root, "demo");
  cpSync(FIXTURE, dir, { recursive: true });
  saved = process.env.MOTION_STUDIO_STATE;
  process.env.MOTION_STUDIO_STATE = join(root, "studio.json");
});
after(() => {
  if (saved === undefined) delete process.env.MOTION_STUDIO_STATE; else process.env.MOTION_STUDIO_STATE = saved;
  rmSync(root, { recursive: true, force: true });
});

const between = (a, from, to) => a.slice(a.indexOf(from) + 1, a.indexOf(to));

test("claudeArgs points --mcp-config at a config file for Studio's server and allows its tools", () => {
  const mcp = studioMcp(P, dir, req);
  assert.ok(mcp);
  assert.equal(mcp.file, studioMcpFile(dir));
  const a = claudeArgs(P, "prompt", null, mcp);
  const file = a[a.indexOf("--mcp-config") + 1];
  assert.ok(existsSync(file), file);
  assert.ok(!a.includes("--strict-mcp-config"), "the provider's MCP server still loads");
  const allowed = between(a, "--allowedTools", "--disallowedTools");
  assert.ok(allowed.includes(`${STUDIO_PREFIX}receipts_list`));
  for (const t of P.director.allowedTools) assert.ok(allowed.includes(t), t);
  const theirs = P.director.mcpTools.map((t) => t.slice(P.director.toolPrefix.length));
  assert.ok(theirs.includes("project_get"));
  for (const t of theirs) assert.ok(!allowed.includes(`${STUDIO_PREFIX}${t}`), `no second ${t}`);
  const cfg = JSON.parse(readFileSync(file, "utf8")).mcpServers["motion-studio"];
  assert.equal(cfg.command, process.execPath);
  assert.deepEqual(cfg.args, [SERVER, "--profile", "director", "--root", root, "--request", req.id]);
  assert.deepEqual(claudeArgs(P, "prompt", "s1").slice(-2), ["--resume", "s1"]);
  assert.ok(!claudeArgs(P, "prompt", null).includes("--mcp-config"));
});

test("the config file starts a server that lists exactly the director's Studio tools", async () => {
  const { file } = studioMcp(P, dir, req);
  const cfg = JSON.parse(readFileSync(file, "utf8")).mcpServers["motion-studio"];
  const child = spawn(cfg.command, cfg.args, { stdio: ["pipe", "pipe", "inherit"] });
  let out = "";
  const got = new Promise((res) => child.stdout.on("data", (c) => { out += c; if (out.split("\n").filter(Boolean).length >= 2) res(); }));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
  await got;
  child.stdin.end();
  await new Promise((r) => child.on("exit", r));
  const tools = JSON.parse(out.split("\n")[1]).result.tools.map((t) => STUDIO_PREFIX + t.name);
  assert.deepEqual(tools, studioToolNames(P));
});

test("the prompt gains one rule about receipts; studio_mcp false turns the server off", () => {
  const p = buildPrompt(P, dir, req);
  assert.match(p, /^12\. Thao tác media \(sinh ảnh, ffmpeg\) dùng tool motion-studio \(project "demo"\) để có biên nhận; ghi id biên nhận trong receipt cuối\.$/m);
  assert.match(p, /^11\. BRIEF\.md và DEMO\.md/m, "the other rules keep their numbers");
  writeFileSync(process.env.MOTION_STUDIO_STATE, JSON.stringify({ director: { studio_mcp: false } }));
  try {
    assert.equal(studioMcp(P, dir, req), null);
    assert.doesNotMatch(buildPrompt(P, dir, req), /motion-studio/);
  } finally { rmSync(process.env.MOTION_STUDIO_STATE, { force: true }); }
});

test("the init line reports missing Studio tools like the provider's", () => {
  const studio = studioToolNames(P);
  const read = reader(P, dir, {}, studio);
  const init = (tools) => read(JSON.stringify({ type: "system", subtype: "init", session_id: "s-1", tools }), "stdout");
  assert.match(init([...P.director.mcpTools, ...studio]), new RegExp(`đủ ${P.director.mcpTools.length} .* \\+ ${studio.length} tool motion-studio$`));
  assert.equal(init(P.director.mcpTools), `THIẾU tool MCP: ${studio.join(", ")}`);
  assert.equal(read(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: `${STUDIO_PREFIX}receipts_list` }] } }), "stdout"), "→ receipts_list");
});
