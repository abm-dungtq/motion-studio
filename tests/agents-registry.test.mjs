import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { dropCache, generateImage, listAgents, probeDir, readVerified, slotsOf, summarize } from "../lib/agents/index.mjs";
import { detectBin, exec, firstJson, which } from "../lib/agents/run.mjs";
import { redact, MASK } from "../lib/agents/redact.mjs";
import { parseStatus } from "../lib/agents/cli/codex-pool.mjs";
import { parseModels } from "../lib/agents/cli/agy.mjs";
import { fakeAgents } from "./fake-cli.mjs";

const byId = (scan) => Object.fromEntries(scan.agents.map((a) => [a.id, a]));

test("listAgents finds the CLIs on the path with version, login state and caps; missing ones are found: false", async () => {
  const f = fakeAgents();
  try {
    const scan = await listAgents({ env: f.env, refresh: true });
    const a = byId(scan);
    assert.equal(a.claude.found, true);
    assert.equal(a.claude.version, "2.1.304");
    assert.equal(a.claude.logged_in, true);
    assert.equal(a.codex.version, "codex-cli 0.163.0");
    assert.equal(a.codex.logged_in, true);
    assert.equal(a.codex.method, "ChatGPT");
    assert.equal(a["codex-pool"].found, true);
    assert.equal(a["codex-pool"].version, "codex-cli 0.163.0", "codex-pool shows the codex it drives");
    assert.equal(a["codex-pool"].logged_in, true);
    assert.equal(a.agy.version, "1.4.5");
    assert.equal(a.agy.logged_in, true);
    assert.deepEqual(a.agy.models, ["gemini-4-argon-medium", "claude-opus-5-5-low"]);
    assert.equal(a.opencode.version, "v2.0.32");
    assert.equal(a.opencode.method, "2 provider");
    for (const id of ["gemini", "cursor-agent", "goose", "hermes"]) assert.equal(a[id].found, false, id);
    assert.deepEqual(a.claude.caps, { text: "yes", vision: "yes", image: "no" });
    assert.deepEqual(a.agy.caps, { text: "yes", vision: "unknown", image: "unknown" });
    assert.deepEqual(scan.order.image, ["codex-pool", "codex", "agy", "gemini"]);
    assert.deepEqual(summarize(scan).find((x) => x.id === "claude"), { id: "claude", label: "Claude Code", found: true, version: "2.1.304", logged_in: true, caps: a.claude.caps, error: undefined });
  } finally { f.rm(); }
});

test("codex-pool status gives per-account quota for OK and exhausted accounts", async () => {
  const ok = parseStatus("acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)\nacct2: OK   ok; no usage data yet\npin=auto -> next: acct2\n");
  assert.deepEqual(ok.accounts[0], { name: "acct1", state: "OK", ok: true, reason: "ok", h5: 38, reset_h5: "22/10 20:47", week: 12, reset_week: "29/10 10:36" });
  assert.equal(ok.accounts[1].h5, null);
  assert.equal(ok.next, "acct2");
  assert.equal(ok.pin, "auto");
  const f = fakeAgents({ vars: { FAKE_POOL: "exhausted" } });
  try {
    const pool = byId(await listAgents({ env: f.env, refresh: true }))["codex-pool"];
    assert.equal(pool.quota.accounts.length, 2);
    assert.deepEqual(pool.quota.accounts.map((x) => [x.name, x.ok, x.h5, x.week]), [["acct1", false, 100, 40], ["acct2", false, null, null]]);
    assert.equal(pool.quota.accounts[0].reason, "exhausted until 24/10 03:00");
    assert.equal(pool.quota.next, null);
    assert.equal(pool.logged_in, true, "one account still has a login");
  } finally { f.rm(); }
  assert.equal(parseStatus("nothing here"), null);
  assert.deepEqual(parseModels("a-1\tA One\nFetching available models...\n"), [{ id: "a-1", name: "A One" }]);
});

test("a broken shim is found with an error and the other CLIs are still listed", async () => {
  const f = fakeAgents({ only: ["claude"], broken: ["hermes"] });
  f.link("goose", `${f.dir}/missing-goose`);
  try {
    const a = byId(await listAgents({ env: f.env, refresh: true }));
    assert.equal(a.hermes.found, true);
    assert.match(a.hermes.error, /exit \d+/);
    assert.equal(a.goose.found, true, "a dangling symlink is a broken install, not a missing one");
    assert.match(a.goose.error, /không chạy được/);
    assert.equal(a.claude.found, true);
    assert.equal(a.claude.error, null);
  } finally { f.rm(); }
});

test("a CLI that hangs past its timeout is killed and reported as timeout", async () => {
  const f = fakeAgents({ only: [], slow: ["slowcli"] });
  try {
    const t0 = Date.now();
    const d = await detectBin(["slowcli"], { env: f.env, timeout: 300 });
    assert.deepEqual([d.found, d.error], [true, "timeout"]);
    assert.ok(Date.now() - t0 < 5000, "killed well before the script's own 30 s");
    const r = await exec(which("slowcli", f.env).path, [], { env: f.env, timeout: 200 });
    assert.equal(r.timedOut, true);
    assert.equal(r.error, "timeout");
  } finally { f.rm(); }
});

test("secrets in CLI output never reach the scan result", async () => {
  const f = fakeAgents();
  try {
    const text = JSON.stringify(await listAgents({ env: f.env, refresh: true }));
    assert.doesNotMatch(text, /sk-ant-fake|eyJhbGci|someone@example\.com|me@example\.com/);
    assert.ok(text.includes(MASK), "the auth method the fake claude reports is masked, not dropped silently");
  } finally { f.rm(); }
  assert.equal(redact("Bearer abcdefghijklmnop and ghp_0123456789abcdefABCDEF and ya29.a0AfH6SMBxxxxxxxxxx"), `${MASK} and ${MASK} and ${MASK}`);
  assert.equal(redact('"api_key": "0123456789abcdef0123456789abcdef01"'), `"api_key": "${MASK}"`);
  assert.equal(redact("plain words 12% ok"), "plain words 12% ok");
});

test("firstJson reads a fenced block, a bare object or one inside text", () => {
  assert.deepEqual(firstJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(firstJson('The answer is {"b":"x}y"} done'), { b: "x}y" });
  assert.deepEqual(firstJson("[1,2]"), [1, 2]);
  assert.equal(firstJson("no json"), null);
});

// "s" for each start of an exec run of cli and "e" for each end, in log order (FAKE_DELAY on).
const runs = (f, cli) => f.calls().split("\n").filter((l) => l.startsWith(`${cli} exec `) || l === `end ${cli}`).map((l) => (l.startsWith("end") ? "e" : "s")).join("");
const twoImages = (f, dir, agent = null) => Promise.all(["a", "b"].map((n) => generateImage({ env: f.env, prompt: `image ${n}`, out: join(dir, `${n}.png`), project: dir, agent })));

test("codex-pool runs as many images at once as it has accounts that can run; other agents one at a time", async () => {
  const two = fakeAgents({ vars: { FAKE_DELAY: "0.5" } });
  const dir = mkdtempSync(join(tmpdir(), "ms-slots-"));
  try {
    assert.equal(await slotsOf("codex-pool", { env: two.env, scan: await listAgents({ env: two.env, refresh: true }) }), 2);
    assert.equal(await slotsOf("codex", { env: two.env }), 1);
    const r = await twoImages(two, dir);
    assert.ok(r.every((x) => x.ok && x.agent === "codex-pool"), JSON.stringify(r));
    assert.equal(runs(two, "codex-pool"), "ssee", "two accounts: the runs overlap");
    const c = await twoImages(two, dir, "codex");
    assert.ok(c.every((x) => x.ok && x.agent === "codex"));
    assert.equal(runs(two, "codex"), "sese", "plain codex keeps one run at a time");
  } finally { two.rm(); }
  const one = fakeAgents({ vars: { FAKE_DELAY: "0.5", FAKE_POOL: "one" } });
  try {
    assert.equal(await slotsOf("codex-pool", { env: one.env, scan: await listAgents({ env: one.env, refresh: true }) }), 1);
    await twoImages(one, dir);
    assert.equal(runs(one, "codex-pool"), "sese", "one account: one after the other");
    writeFileSync(one.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { parallel: { "codex-pool": 2 } } }));
    assert.equal(await slotsOf("codex-pool", { env: one.env }), 2, "studio.json agents.parallel wins");
    await twoImages(one, dir);
    assert.equal(runs(one, "codex-pool"), "sese" + "ssee", "the log keeps the first pair; with the setting the second pair overlaps");
    writeFileSync(one.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { parallel: { "codex-pool": 9 } } }));
    assert.equal(await slotsOf("codex-pool", { env: one.env }), 1, "a setting outside 1–4 is ignored");
  } finally { one.rm(); rmSync(dir, { recursive: true, force: true }); }
});

const call = (port, method, path, body, token) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  if (data) req.write(data);
  req.end();
});

test("/api/agents works without a provider; a probe job makes a PNG with a receipt and records the result", async () => {
  const f = fakeAgents();
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { OPUS_VIDEO_HOME: "/nonexistent" });
  dropCache();
  const root = mkdtempSync(join(tmpdir(), "ms-agents-root-"));
  const TOKEN = "a".repeat(64);
  const server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const g = await call(port, "GET", "/api/agents");
    assert.equal(g.status, 200, g.text);
    assert.equal(g.json.agents.find((a) => a.id === "claude").version, "2.1.304");
    assert.equal(g.json.probe, null);
    const chip = await call(port, "GET", "/api/agent");
    assert.equal(chip.json.agents.find((a) => a.id === "codex-pool").found, true, "the chip gets the cached scan");
    assert.equal((await call(port, "POST", "/api/agents/probe", { id: "codex-pool", cap: "image" })).status, 403);
    assert.equal((await call(port, "POST", "/api/agents/probe", { id: "nope", cap: "image" }, TOKEN)).status, 400);
    assert.equal((await call(port, "POST", "/api/agents/probe", { id: "claude", cap: "fly" }, TOKEN)).status, 400);
    assert.equal((await call(port, "POST", "/api/agents/probe", { id: "goose", cap: "text" }, TOKEN)).status, 400, "detect-only agents are not run");
    const p = await call(port, "POST", "/api/agents/probe", { id: "codex-pool", cap: "image" }, TOKEN);
    assert.equal(p.status, 200, p.text);
    assert.equal(p.json.job.kind, "agent-probe");
    let job;
    for (let i = 0; i < 100; i++) {
      job = (await call(port, "GET", "/api/agents")).json.probe;
      if (job && job.status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "exited", JSON.stringify(job));
    assert.equal(job.code, 0, job.tail.join("\n"));
    assert.ok(job.tail.some((l) => l.startsWith("OK ")), job.tail.join("\n"));
    const pngs = readdirSync(probeDir(f.env)).filter((x) => x.endsWith(".png"));
    assert.equal(pngs.length, 1);
    assert.ok(existsSync(join(probeDir(f.env), ".opus", "receipts")));
    assert.equal(readVerified(f.env)["codex-pool"].image.ok, true);
    const after = await call(port, "POST", "/api/agents/refresh", {}, TOKEN);
    assert.deepEqual(after.json.agents.find((a) => a.id === "codex-pool").verified.image.ok, true);
    // The image_generate tool goes through the running Studio: a project "image" job.
    mkdirSync(join(root, "pj"));
    writeFileSync(join(root, "pj", "project.json"), "{}");
    const env = toolEnv({ root, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) });
    const t = await callTool("image_generate", { project: "pj", prompt: "a cat", out: "assets/cat.png" }, env);
    assert.equal(t.ok, true, t.error);
    assert.equal(t.result.ok, true, JSON.stringify(t.result));
    assert.equal(t.result.file, join(realpathSync(root), "pj", "assets", "cat.png"));
    assert.match(t.result.receipt, /^\.opus\/receipts\/\d{8}\/image-generate-/);
    const bad = await call(port, "POST", "/api/agents/image", { name: "pj", prompt: "x", out: "../x.png" }, TOKEN);
    assert.equal(bad.status, 400);
  } finally {
    server.closeAllConnections?.(); server.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    dropCache();
    rmSync(root, { recursive: true, force: true }); f.rm();
  }
});
