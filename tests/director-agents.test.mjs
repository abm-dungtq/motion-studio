import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { loadProvider } from "../lib/provider.mjs";
import { dropCache } from "../lib/agents/index.mjs";
import { codexRules, directorAgents, opencodeConfig, opencodeUserServers, plainRules, planRun, prefixWords, readerFor, selectable } from "../lib/director-agents.mjs";
import { demoLines, fixDemo, guardGates, rebase, studioWrite } from "../lib/gate-guard.mjs";
import { pump, savedSession } from "../director.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const P = await loadProvider();
const { enqueue, list } = P.requests;
const REQUESTS = P.requests.module;
const TOKEN = "e".repeat(64);
let root, bin, calls, server, port, saved;

// A stand-in for the Codex CLI: version, login status, and `exec [resume <id>] --json … <prompt>`,
// which prints codex's JSON events and behaves by a tag in the prompt.
const FAKE_CODEX = `#!${process.execPath}
const fs = require("fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("codex-cli 0.163.0"); process.exit(0); }
if (a[0] === "login") { console.error("Logged in using ChatGPT"); process.exit(0); }
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(a) + "\\n");
const prompt = a.at(-1);
const resume = a[1] === "resume" ? a[2] : null;
const out = (o) => console.log(JSON.stringify(o));
out({ type: "thread.started", thread_id: resume ?? "th-1" });
const id = process.env.OPUS_STUDIO_REQUEST;
setTimeout(async () => {
  out({ type: "item.started", item: { type: "mcp_tool_call", server: "prov", tool: "project_get" } });
  if (prompt.includes("[brief]")) fs.writeFileSync("BRIEF.md", "---\\ndirection: tu-chon\\n---\\n");
  if (prompt.includes("[approve]")) fs.writeFileSync("DEMO.md", "# DEMO\\napproval: director tự duyệt\\n");
  if (prompt.includes("[slow]")) await new Promise((r) => setTimeout(r, 600));
  if (!prompt.includes("[silent]")) {
    const { finish } = await import(${JSON.stringify(REQUESTS)});
    finish(process.cwd(), id, { ok: true, receipt: "Đã đổi s2", runner: process.env.OPUS_STUDIO_RUNNER });
  }
  out({ type: "item.completed", item: { type: "agent_message", text: "Biên nhận cuối" } });
  out({ type: "turn.completed" });
}, 10);
`;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "director-agents-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  writeFileSync(join(root, "demo", "BRIEF.md"), "---\ntopic: thử\n---\n");
  bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "codex"), FAKE_CODEX);
  chmodSync(join(bin, "codex"), 0o755);
  calls = join(root, "calls.jsonl");
  saved = Object.fromEntries(["PATH", "MOTION_STUDIO_STATE", "MOTION_STUDIO_AGENT_PATH", "FAKE_CALLS"].map((k) => [k, process.env[k]]));
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.MOTION_STUDIO_AGENT_PATH = `${bin}:/usr/bin:/bin`;
  process.env.MOTION_STUDIO_STATE = join(root, "studio.json");
  process.env.FAKE_CALLS = calls;
  dropCache();
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  dropCache();
  rmSync(root, { recursive: true, force: true });
});

function call(method, path, body) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, "x-studio-token": TOKEN, ...(data ? { "content-type": "application/json" } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, json: JSON.parse(s || "null") }));
    });
    req.on("error", rej); req.end(data ?? undefined);
  });
}
const dir = () => join(root, "demo");
async function ended(id) {
  for (let i = 0; i < 200; i++) {
    const r = list(dir()).find((x) => x.id === id);
    if (r && (r.status === "done" || r.status === "failed")) return r;
    await new Promise((x) => setTimeout(x, 50));
  }
  throw new Error(`request ${id} did not end`);
}
const lastCall = () => JSON.parse(readFileSync(calls, "utf8").trim().split("\n").at(-1));

test("the provider's Claude Code rules become plain shell and edit rules", () => {
  const r = plainRules(["Read", "Bash(node /ov/scripts/*)", "Bash(npx hyperframes:*)", "mcp__x__project_get"], ["WebFetch", "Edit(//ov/**)", "Edit(BRIEF.md)", "Bash(cp *)", "Bash(*gflow*)"]);
  assert.deepEqual(r.shellAllow, ["node /ov/scripts/*", "npx hyperframes*"]);
  assert.deepEqual(r.shellDeny, ["cp *", "*gflow*"]);
  assert.deepEqual(r.editDeny, ["/ov/**", "BRIEF.md"]);
  assert.equal(r.web, false);
});

test("codex rules forbid the denied commands that start with plain words, and only those", () => {
  assert.deepEqual(prefixWords("cp *"), ["cp"]);
  assert.deepEqual(prefixWords("node /ov/scripts/make-pitch.mjs choose*"), ["node", "/ov/scripts/make-pitch.mjs", "choose"]);
  assert.equal(prefixWords("node /ov/scripts/*../*"), null);
  assert.equal(prefixWords("*gflow*"), null);
  const rules = codexRules(["cp *", "mv *", "*gflow*", "node /ov/scripts/*../*"]);
  assert.match(rules, /prefix_rule\(pattern = \["cp"\], decision = "forbidden"/);
  assert.match(rules, /\["mv"\]/);
  assert.doesNotMatch(rules, /gflow|scripts\/"/);
  assert.equal(codexRules(["*x*"]), "");
});

test("OpenCode gets shell denied but the provider's commands, the gates and the plugin not editable, no web", () => {
  const c = opencodeConfig({ servers: { "prov": { command: "/n", args: ["/ov/mcp/server.mjs"], env: { OPUS_STUDIO_RUNNER: "cli" } } }, rules: plainRules(["Bash(node /ov/scripts/*)"], ["WebFetch", "Edit(BRIEF.md)", "Edit(DEMO.md)", "Bash(cp *)"]) });
  assert.deepEqual(c.permission.bash, { "*": "deny", "node /ov/scripts/*": "allow", "cp *": "deny" });
  assert.equal(c.permission.edit["BRIEF.md"], "deny");
  assert.equal(c.permission.edit["DEMO.md"], "deny");
  assert.equal(c.permission.edit[".opencode/**"], "deny");
  assert.equal(c.permission.webfetch, "deny");
  assert.equal(c.permission.external_directory, "deny");
  assert.deepEqual(c.mcp.servers["prov"], { type: "local", command: ["/n", "/ov/mcp/server.mjs"], environment: { OPUS_STUDIO_RUNNER: "cli" }, disabled: false });
});

test("OpenCode turns off the user's own MCP servers, read from a commented config", () => {
  const xdg = mkdtempSync(join(tmpdir(), "oc-xdg-"));
  try {
    mkdirSync(join(xdg, "opencode"));
    writeFileSync(join(xdg, "opencode", "opencode.jsonc"), '{\n  // mine\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": { "servers": { "blender": { "type": "local", "command": ["x"] }, "prov": {}, }, },\n}\n');
    const names = opencodeUserServers({ XDG_CONFIG_HOME: xdg });
    assert.deepEqual(names.sort(), ["blender", "prov"]);
    const c = opencodeConfig({ servers: { "prov": { command: "/n", args: [] } }, rules: plainRules([], []), userServers: names });
    assert.deepEqual(c.mcp.servers.blender, { type: "local", command: ["false"], disabled: true });
    assert.equal(c.mcp.servers["prov"].disabled, false);
    assert.deepEqual(opencodeUserServers({ XDG_CONFIG_HOME: join(xdg, "none") }), []);
  } finally { rmSync(xdg, { recursive: true, force: true }); }
});

test("a Codex run: sandboxed, no approvals, no web, both MCP servers, the rules file; resume puts the id after exec", () => {
  const d = mkdtempSync(join(tmpdir(), "codex-plan-"));
  try {
    const ctx = { id: "codex", bin: "/x/codex", dir: d, prompt: "làm đi", sid: null, servers: { "prov": { command: "/n", args: ["/ov/s.mjs"], env: { A: "1" } }, "motion-studio": { command: "/n", args: ["/st.mjs"] } }, allowed: [], denied: ["Bash(cp *)"] };
    const p = planRun(ctx);
    assert.equal(p.cmd, "/x/codex");
    assert.deepEqual(p.args.slice(0, 4), ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config"]);
    const cs = p.args.filter((_, i) => p.args[i - 1] === "-c");
    for (const kv of ['sandbox_mode="workspace-write"', 'approval_policy="never"', "sandbox_workspace_write.network_access=false", 'web_search="disabled"',
      'mcp_servers.prov.command="/n"', 'mcp_servers.prov.args=["/ov/s.mjs"]', 'mcp_servers.prov.env={ A = "1" }', 'mcp_servers.motion_studio.args=["/st.mjs"]']) assert.ok(cs.includes(kv), kv);
    assert.equal(p.args.at(-1), "làm đi");
    assert.match(readFileSync(join(d, ".codex", "rules", "motion-studio.rules"), "utf8"), /\["cp"\]/);
    assert.deepEqual(planRun({ ...ctx, sid: "th-9" }).args.slice(0, 3), ["exec", "resume", "th-9"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("agy, Gemini CLI and cursor-agent cannot be planned", () => {
  for (const id of ["agy", "gemini", "cursor-agent"]) assert.throws(() => planRun({ id, dir: tmpdir(), prompt: "x", servers: {}, allowed: [], denied: [] }), /không chạy được đạo diễn/);
});

test("readers keep the session, the last answer and errors", () => {
  const s = { session: null, result: null, isError: false };
  const r = readerFor("codex", s);
  assert.equal(r('{"type":"thread.started","thread_id":"th-2"}', "stdout"), "Phiên th-2");
  assert.equal(r('{"type":"item.started","item":{"type":"mcp_tool_call","tool":"project_patch"}}', "stdout"), "→ project_patch");
  assert.equal(r('{"type":"item.completed","item":{"type":"agent_message","text":"xong"}}', "stdout"), "xong");
  assert.equal(r("plain line", "stdout"), "plain line");
  assert.deepEqual(s, { session: "th-2", result: "xong", isError: false });
  r('{"type":"turn.failed","error":{"message":"hết quota"}}', "stdout");
  assert.equal(s.isError, true);
  const o = { session: null, result: null, isError: false };
  const ro = readerFor("opencode", o);
  ro('{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"biên nhận"}}', "stdout");
  assert.deepEqual(o, { session: "ses_1", result: "biên nhận", isError: false });
});

test("selectable: blocked, missing, logged out, and a provider without an MCP server", () => {
  assert.equal(selectable("agy", { found: true, logged_in: true }, P).selectable, false);
  assert.match(selectable("codex", { found: false }, P).reason, /Chưa cài/);
  assert.match(selectable("codex", { found: true, logged_in: false }, P).reason, /chưa đăng nhập/);
  assert.equal(selectable("codex", { found: true, logged_in: true }, P).selectable, true);
  assert.match(selectable("codex", { found: true, logged_in: true }, { director: {} }).reason, /MCP server/);
  assert.equal(selectable("claude", { found: true, logged_in: null }, { director: {} }).selectable, true);
  assert.match(selectable("codex-pool", { found: true, logged_in: true, quota: { accounts: [{ name: "acct1", ok: false }], next: null } }, P).reason, /quota/);
  assert.equal(selectable("codex-pool", { found: true, logged_in: true, quota: { accounts: [{ name: "acct1", ok: true }], next: "acct1" } }, P).selectable, true);
  const rows = directorAgents({ agents: [{ id: "codex", found: true, logged_in: true, version: "0.163.0" }] }, P, "codex");
  assert.deepEqual(rows.map((r) => r.id), ["claude", "codex-pool", "codex", "opencode", "agy", "gemini", "cursor-agent"]);
  assert.deepEqual(rows.find((r) => r.id === "codex"), { id: "codex", label: "Codex CLI", guard: "sandbox", guard_label: "Sandbox + Studio", found: true, version: "0.163.0", logged_in: true, chosen: true, selectable: true, reason: null });
});

test("DEMO.md: approval may go back to pending, audio_review may be dropped; anything else is put back", () => {
  const base = demoLines("# DEMO\naudio_review: u 1 h\napproval: user@studio 2026 ok\n");
  assert.deepEqual(fixDemo("# DEMO\napproval: pending\n", base).bad, []);
  const forged = fixDemo("# DEMO\naudio_review: director 2 h2\napproval: director ok\n", base);
  assert.deepEqual(forged.bad, ["approval:", "audio_review:"]);
  assert.equal(forged.text, "# DEMO\naudio_review: u 1 h\napproval: user@studio 2026 ok\n");
  const none = demoLines("# DEMO\napproval: pending\n");
  const added = fixDemo("# DEMO\naudio_review: director now\napproval: pending\n", none);
  assert.deepEqual(added.bad, ["audio_review:"]);
  assert.doesNotMatch(added.text, /audio_review/);
});

test("the guard puts BRIEF.md back, reports it once, and takes Studio's own write as the new baseline", async () => {
  const d = mkdtempSync(join(tmpdir(), "guard-"));
  try {
    writeFileSync(join(d, "BRIEF.md"), "gốc\n");
    const seen = [];
    const g = guardGates(d, { onViolation: (v) => seen.push(...v) });
    writeFileSync(join(d, "BRIEF.md"), "đạo diễn sửa\n");
    // fs.watch, or the one-second poll when macOS drops the watch event.
    for (let i = 0; i < 120 && !seen.length; i++) await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(seen, ["BRIEF.md"]);
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), "gốc\n");
    writeFileSync(join(d, "BRIEF.md"), "Studio ghi\n");
    rebase(d);
    assert.deepEqual(g.close(), ["BRIEF.md"]);
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), "Studio ghi\n");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a provider command Studio runs to write BRIEF.md is not taken for the director's", async () => {
  const d = mkdtempSync(join(tmpdir(), "guard-"));
  try {
    writeFileSync(join(d, "BRIEF.md"), "gốc\n");
    const g = guardGates(d);
    await studioWrite(d, async () => {
      writeFileSync(join(d, "BRIEF.md"), "direction: b\n");
      await new Promise((r) => setTimeout(r, 1300)); // past a poll and the watch debounce
      assert.deepEqual(g.check(), []);
    });
    assert.deepEqual(g.close(), []);
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), "direction: b\n");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the choice is listed, refused for an agent that cannot run, saved in studio.json and shown by /api/agent", async () => {
  const g = await call("GET", "/api/director/agents?refresh=1");
  assert.equal(g.status, 200);
  assert.equal(g.json.agent, "claude");
  const codex = g.json.agents.find((a) => a.id === "codex");
  assert.equal(codex.selectable, true);
  assert.equal(g.json.agents.find((a) => a.id === "opencode").found, false);
  const agy = await call("POST", "/api/director/agent", { id: "agy" });
  assert.equal(agy.status, 409);
  assert.match(agy.json.error, /MCP/);
  assert.equal((await call("POST", "/api/director/agent", { id: "nope" })).status, 400);
  const ok = await call("POST", "/api/director/agent", { id: "codex" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.agent, "codex");
  assert.equal(JSON.parse(readFileSync(process.env.MOTION_STUDIO_STATE, "utf8")).director.agent, "codex");
  const a = await call("GET", "/api/agent");
  assert.deepEqual({ id: a.json.director.id, label: a.json.director.label, guard: a.json.director.guard, found: a.json.director.found, logged_in: a.json.director.logged_in }, { id: "codex", label: "Codex CLI", guard: "sandbox", found: true, logged_in: true });
});

test("the director runs on Codex: request done, session kept for Codex only, resumed next time", async () => {
  const r = enqueue(dir(), { scope: "project", target: null, t: null, base: 1, text: "đổi s2" });
  pump(P, "demo", dir());
  const done = await ended(r.id);
  assert.equal(done.status, "done", JSON.stringify(done));
  const a = lastCall();
  assert.equal(a[0], "exec");
  assert.ok(a.includes("--json"));
  assert.match(a.at(-1), /SKILL\.md/);
  assert.equal(savedSession(dir(), "codex"), "th-1");
  assert.equal(savedSession(dir(), "claude"), null);
  const r2 = enqueue(dir(), { scope: "project", target: null, t: null, base: 1, text: "thêm" });
  for (let i = 0; i < 40 && !pump(P, "demo", dir()); i++) await new Promise((x) => setTimeout(x, 50));
  await ended(r2.id);
  assert.deepEqual(lastCall().slice(0, 3), ["exec", "resume", "th-1"]);
});

test("a director that writes BRIEF.md or approves DEMO.md is stopped, its request failed and the file put back", async () => {
  const brief = readFileSync(join(dir(), "BRIEF.md"), "utf8");
  const r = enqueue(dir(), { scope: "project", target: null, t: null, base: 1, text: "[brief] [slow] [silent]" });
  for (let i = 0; i < 40 && !pump(P, "demo", dir()); i++) await new Promise((x) => setTimeout(x, 50));
  const f = await ended(r.id);
  assert.equal(f.status, "failed");
  assert.match(f.error, /BRIEF\.md/);
  assert.equal(readFileSync(join(dir(), "BRIEF.md"), "utf8"), brief);
  writeFileSync(join(dir(), "DEMO.md"), "# DEMO\napproval: pending\n");
  const r2 = enqueue(dir(), { scope: "project", target: null, t: null, base: 1, text: "[approve] [slow] [silent]" });
  for (let i = 0; i < 40 && !pump(P, "demo", dir()); i++) await new Promise((x) => setTimeout(x, 50));
  const f2 = await ended(r2.id);
  assert.equal(f2.status, "failed");
  assert.match(f2.error, /DEMO\.md approval:/);
  assert.match(readFileSync(join(dir(), "DEMO.md"), "utf8"), /^approval: pending$/m);
  assert.ok(existsSync(join(dir(), ".codex", "rules", "motion-studio.rules")));
});
