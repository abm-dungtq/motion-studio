import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { PIN } from "../lib/lemo/fetch.mjs";
import { callTool, toolEnv } from "../lib/tools.mjs";
import { fakePlugin } from "./fake-plugin.mjs";
import { FAKE_LEMO, makeLibrary } from "./fixtures/lemo/make.mjs";

const A = await adapterFor({});
const MANIFEST = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const TOKEN = "l".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_LEMO_CACHE", "LEMO_MY_STYLES", "MOTION_STUDIO_STATE", "FAKE_LEMO_LOG", "FAKE_LEMO_ADD", "FAKE_LEMO_SLEEP"];
let tmp, root, plugin, server, port, saved, log, reqLog;

// The fake plugin's manifest loader reads project.json; its request queue appends to a file.
function plugin4() {
  const d = fakePlugin({ schema: A.NEED.schema, api: 4, extra: `export const COMMANDS = { lemo: ${JSON.stringify(FAKE_LEMO)} };` });
  const f = join(d, "scripts", "studio-api.mjs");
  const src = readFileSync(f, "utf8")
    .replace("export const load = () => null;", `import { appendFileSync as _a, readFileSync as _r } from "node:fs";\nexport const load = (dir) => ({ ...JSON.parse(_r(dir + "/project.json", "utf8")), version: 7 });`)
    .replace("export const enqueue = () => null;", `export const enqueue = (dir, r) => { _a(${JSON.stringify(reqLog)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", status: "queued", ...r }; };`);
  writeFileSync(f, src);
  return d;
}

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "lemo-routes-")));
  log = join(tmp, "lemo.log");
  reqLog = join(tmp, "requests.jsonl");
  const cache = join(tmp, "cache");
  makeLibrary(join(cache, PIN.sha));
  writeFileSync(join(cache, PIN.sha, ".pin.json"), JSON.stringify({ sha: PIN.sha }));
  writeFileSync(join(tmp, "studio.json"), JSON.stringify({ director: { runner: "mcp" } }));
  plugin = plugin4();
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_LEMO_CACHE: cache, LEMO_MY_STYLES: join(tmp, "my-styles"), MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_LEMO_LOG: log });
  root = join(tmp, "root");
  mkdirSync(root);
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});
beforeEach(() => {
  rmSync(join(root, "demo"), { recursive: true, force: true });
  cpSync(MANIFEST, join(root, "demo"), { recursive: true });
  writeFileSync(join(root, "demo", "BRIEF.md"), "---\ntitle: Demo\n---\n\n# Brief\n");
  writeFileSync(log, ""); writeFileSync(reqLog, "");
  delete process.env.FAKE_LEMO_ADD; delete process.env.FAKE_LEMO_SLEEP;
});

function http(method, path, { body, token, p = port } = {}) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port: p, method, path, headers: { host: `127.0.0.1:${p}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c));
      r.on("end", () => { const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ } res({ status: r.statusCode, type: r.headers["content-type"], buf, json }); });
    });
    req.on("error", rej); req.end(data ?? undefined);
  });
}
const post = (path, body, token = TOKEN) => http("POST", path, { body, token });
const dir = () => join(root, "demo");
const brief = () => readFileSync(join(dir(), "BRIEF.md"), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const queued = () => readFileSync(reqLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const lemo = () => JSON.parse(readFileSync(join(dir(), ".opus", "lemo.json"), "utf8"));

test("styles without a provider: the library and no canvas layer", async () => {
  const savedHome = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  const s = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const r = await http("GET", "/api/lemo/styles", { p: s.address().port });
    assert.equal(r.status, 200);
    assert.equal(r.json.fetched, true);
    assert.equal(r.json.rows.length, 3);
    assert.ok(r.json.rows.every((x) => x.layer === false));
    assert.equal(r.json.layer_available, false);
    assert.match(r.json.credit.text, /LemoLab, CC BY 4\.0/);
  } finally { s.closeAllConnections?.(); s.close(); process.env.OPUS_VIDEO_HOME = savedHome; }
});

test("styles with the provider mark the verified canvas layer styles", async () => {
  const r = await http("GET", "/api/lemo/styles?name=demo");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.rows.filter((x) => x.layer).map((x) => x.slug), ["watercolor"]);
  assert.equal(r.json.warnings.length, 1);
  assert.equal(r.json.project.vertical, false);
  const q = await http("GET", `/api/lemo/styles?q=${encodeURIComponent("thuỷ màu")}`);
  assert.deepEqual(q.json.rows.map((x) => x.slug), ["watercolor"]);
});

test("frames: traversal 403, unknown 404, not a JPEG 415, a frame 200 image/jpeg", async () => {
  assert.equal((await http("GET", "/api/lemo/frame/..%2Fx.jpg")).status, 403);
  assert.equal((await http("GET", "/api/lemo/frame/mine/..%2F..%2Fx.jpg")).status, 403);
  assert.equal((await http("GET", "/api/lemo/frame/nope.jpg")).status, 404);
  assert.equal((await http("GET", "/api/lemo/frame/ink-wash.jpg")).status, 415);
  const ok = await http("GET", "/api/lemo/frame/watercolor.jpg");
  assert.equal(ok.status, 200);
  assert.equal(ok.type, "image/jpeg");
  assert.equal(ok.buf[0], 0xff);
});

test("guide answers STYLE.md as text", async () => {
  const r = await http("GET", "/api/lemo/guide?slug=ukiyoe");
  assert.equal(r.status, 200);
  assert.match(r.json.text, /Fixture style prompt for ukiyoe/);
  assert.equal((await http("GET", "/api/lemo/guide?slug=..")).status, 400);
});

test("POST without the token is 403", async () => {
  assert.equal((await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer" }, null)).status, 403);
  assert.equal((await post("/api/lemo/keep", { name: "demo" }, null)).status, 403);
  assert.equal((await post("/api/lemo/fetch", {}, null)).status, 403);
});

test("apply layer: add runs, BRIEF.md gets lemo_style, lemo.json and a request with the next: line", async () => {
  const r = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(brief(), /^lemo_style: watercolor$/m);
  assert.match(brief(), /^title: Demo$/m);
  assert.deepEqual(lemo().project.mode, "layer");
  assert.equal(lemo().layer.slug, "watercolor");
  assert.ok(calls().some((a) => a.join(" ") === `add --project ${dir()} --style watercolor`));
  const [q] = queued();
  assert.equal(q.scope, "project");
  assert.equal(q.base, 7);
  assert.match(q.text, /next: read styles\/watercolor\/STYLE\.md/);
  assert.ok(existsSync(join(dir(), "assets", "lemo", "CREDITS")));
  const p = await http("GET", "/api/lemo/project?name=demo");
  assert.equal(p.json.layer_files, true);
  assert.equal(p.json.project.slug, "watercolor");
});

test("apply layer: a missing engine cache runs fetch, then add once more", async () => {
  process.env.FAKE_LEMO_ADD = "4,0";
  const r = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer", shot: "s2" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(calls().map((a) => a[0]), ["add", "fetch", "add"]);
  assert.equal(lemo().shots.s2.mode, "layer");
  assert.match(queued()[0].text, /win\["s2"\]/);
  assert.equal(queued()[0].target, "s2");
});

test("apply layer: missing markers answer code markers and leave BRIEF.md as it was", async () => {
  process.env.FAKE_LEMO_ADD = "3";
  const before = sha(brief());
  const r = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer" });
  assert.equal(r.json.code, "markers");
  assert.equal(sha(brief()), before);
  assert.deepEqual(queued(), []);
  const m = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "markers" });
  assert.equal(m.status, 200);
  assert.match(queued()[0].text, /LEMO-LAYER:BEGIN/);
});

test("apply layer: an existing layer is code exists; replace removes it first", async () => {
  process.env.FAKE_LEMO_ADD = "5";
  const r = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer" });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "exists");
  process.env.FAKE_LEMO_ADD = "5,0";
  const again = await post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer", replace: true });
  assert.equal(again.status, 200, JSON.stringify(again.json));
  assert.deepEqual(calls().map((a) => a[0]), ["add", "remove", "add"]);
});

test("apply layer with a style that is not verified is 422 and runs no add", async () => {
  const before = sha(brief());
  const r = await post("/api/lemo/apply", { name: "demo", slug: "ukiyoe", mode: "layer" });
  assert.equal(r.status, 422);
  assert.equal(sha(brief()), before);
  assert.ok(!calls().some((a) => a[0] === "add"));
});

test("apply grammar leaves BRIEF.md alone and points the director at STYLE.md", async () => {
  const before = sha(brief());
  const r = await post("/api/lemo/apply", { name: "demo", slug: "ukiyoe", mode: "grammar" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(sha(brief()), before);
  assert.equal(lemo().project.mode, "grammar");
  const s = await post("/api/lemo/apply", { name: "demo", slug: "ukiyoe", mode: "grammar", shot: "s2" });
  assert.equal(s.status, 200);
  assert.equal(lemo().shots.s2.slug, "ukiyoe");
  assert.equal(lemo().project.slug, "ukiyoe", "the project style stays");
  const [p, q] = queued();
  assert.ok(p.text.includes(join(process.env.MOTION_STUDIO_LEMO_CACHE, PIN.sha, "styles", "ukiyoe", "STYLE.md")));
  assert.equal(q.scope, "shot");
  assert.match(q.text, /shot s2/);
  assert.equal(sha(brief()), before);
  assert.deepEqual(calls(), []);
  assert.equal((await post("/api/lemo/apply", { name: "demo", slug: "ukiyoe", mode: "grammar", shot: "s9" })).status, 400);
});

test("two applies at once on one project: the second is 409", async () => {
  process.env.FAKE_LEMO_SLEEP = "400";
  const [a, b] = await Promise.all([
    post("/api/lemo/apply", { name: "demo", slug: "watercolor", mode: "layer" }),
    new Promise((r) => setTimeout(r, 100)).then(() => post("/api/lemo/apply", { name: "demo", slug: "ukiyoe", mode: "grammar" })),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(b.status, 409);
  assert.equal(b.json.code, "busy");
});

test("keep copies lemo-style/ into the own-styles folder; the style then leads the list", async () => {
  const d = join(dir(), "lemo-style");
  mkdirSync(d);
  writeFileSync(join(d, "style.json"), JSON.stringify({ slug: "my-wave", en: "My Wave", cn: "我的浪", based_on: "ukiyoe", line: "Waves, warmer" }));
  writeFileSync(join(d, "STYLE.md"), "# My Wave\n");
  writeFileSync(join(d, "CHANGES.md"), "| a | b | c | d |\n");
  const p = await http("GET", "/api/lemo/project?name=demo");
  assert.equal(p.json.draft.style.slug, "my-wave");
  const r = await post("/api/lemo/keep", { name: "demo" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(existsSync(join(process.env.LEMO_MY_STYLES, "my-wave", "STYLE.md")));
  assert.match(readFileSync(join(process.env.LEMO_MY_STYLES, "README.md"), "utf8"), /\| my-wave \|/);
  const s = await http("GET", "/api/lemo/styles");
  assert.equal(s.json.rows[0].slug, "my-wave");
  assert.equal(s.json.rows[0].source, "mine");
  assert.equal((await post("/api/lemo/keep", { name: "demo" })).status, 409, "kept once");
  writeFileSync(join(d, "style.json"), JSON.stringify({ slug: "ukiyoe", en: "Copy" }));
  const c = await post("/api/lemo/keep", { name: "demo" });
  assert.equal(c.status, 409);
  assert.equal(c.json.code, "conflict");
});

test("tools search the styles and read a guide", async () => {
  const env = toolEnv({ root });
  const r = await callTool("lemo_styles", { q: "thuy mau" }, env);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.result.styles.map((s) => s.slug), ["watercolor"]);
  const g = await callTool("lemo_style_guide", { slug: "ukiyoe" }, env);
  assert.equal(g.ok, true);
  assert.match(g.result.text, /ukiyoe/);
  assert.equal((await callTool("lemo_style_guide", { slug: "nope" }, env)).ok, false);
});
