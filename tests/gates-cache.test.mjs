// GET /api/gates keeps the final preflight's answer while the project's files are unchanged
// (lib/gates-cache.mjs): a second call does not run the check, an edit does, cached=1 never
// starts one, fresh=1 always does, and the answer survives a restart through .opus/gates-cache.json.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { gateSignature } from "../lib/gates-cache.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const A = await adapterFor({});
const TOKEN = "a".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "FAKE_LOG"];
let tmp, plugin, root, ep, saved, log, server, port;

// Final preflight: logs the call and rewrites the onset cache, as the real one does while it runs.
const PREFLIGHT = `import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
appendFileSync(process.env.FAKE_LOG, "preflight\\n");
const dir = process.argv[process.argv.indexOf("--project") + 1];
writeFileSync(join(dir, "assets", "sfx-onsets.json"), JSON.stringify({ at: Date.now() }));
console.log(JSON.stringify({ pass: true, errors: [], warnings: [] }));
`;
const runs = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length : 0);

function http(path) {
  return new Promise((res, rej) => {
    const req = request({ host: "127.0.0.1", port, method: "GET", path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, json: JSON.parse(s) }));
    });
    req.on("error", rej);
    req.end();
  });
}

async function start() {
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
}
function stop() { server.closeAllConnections?.(); server.close(); }

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-gates-cache-")));
  log = join(tmp, "calls.log");
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, gateway: true });
  writeFileSync(join(plugin, "scripts", "check-preflight.mjs"), PREFLIGHT);
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_LOG: log });
  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(join(ep, "assets", "voice"), { recursive: true });
  writeFileSync(join(ep, "BRIEF.md"), "---\ntitle: Thử\n---\n");
  writeFileSync(join(ep, "index.html"), "<div></div>\n");
  writeFileSync(join(ep, "assets", "voice", "l1.mp3"), "x");
  writeFileSync(join(ep, "project.json"), JSON.stringify({ schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 6, html: "index.html", capabilities: { editable: true }, shots: [{ id: "s1", start: 0, end: 6 }], lines: [], music: [], assets: [], version: 1 }));
  mkdirSync(join(root, "other"));
  writeFileSync(join(root, "other", "project.json"), readFileSync(join(ep, "project.json")));
  await start();
});
after(() => {
  stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("gateSignature ignores the onset cache and .tmp files, and sees an added asset", () => {
  const sig = gateSignature(ep);
  writeFileSync(join(ep, "assets", "sfx-onsets.json"), "{}");
  writeFileSync(join(ep, "assets", "x.json.tmp"), "{}");
  assert.equal(gateSignature(ep), sig);
  rmSync(join(ep, "assets", "x.json.tmp"));
  writeFileSync(join(ep, "assets", "voice", "l2.mp3"), "y");
  assert.notEqual(gateSignature(ep), sig);
  rmSync(join(ep, "assets", "voice", "l2.mp3"));
});

test("cached=1 before any check answers pending and starts nothing", async () => {
  const r = await http("/api/gates?name=ep&cached=1");
  assert.deepEqual(r.json, { pending: true });
  assert.equal(runs(), 0);
});

test("a second call answers from the cache although the check rewrote the onset cache", async () => {
  const first = await http("/api/gates?name=ep");
  assert.equal(first.json.pass, true);
  assert.equal(first.json.cached, false);
  assert.equal(runs(), 1);
  const second = await http("/api/gates?name=ep");
  assert.equal(second.json.cached, true);
  assert.equal(second.json.pass, true);
  assert.equal(runs(), 1, "no second check");
  assert.equal((await http("/api/gates?name=ep&cached=1")).json.cached, true);
});

test("touching index.html or adding a voice file runs the check again", async () => {
  const before = runs();
  const t = new Date(Date.now() + 5000);
  utimesSync(join(ep, "index.html"), t, t);
  assert.equal((await http("/api/gates?name=ep&cached=1")).json.pending, true, "stale: no kept answer");
  await http("/api/gates?name=ep");
  assert.equal(runs(), before + 1);
  writeFileSync(join(ep, "assets", "voice", "l3.mp3"), "z");
  await http("/api/gates?name=ep");
  assert.equal(runs(), before + 2);
  await http("/api/gates?name=ep");
  assert.equal(runs(), before + 2);
});

test("fresh=1 always runs the check", async () => {
  const before = runs();
  const r = await http("/api/gates?name=ep&fresh=1");
  assert.equal(r.json.cached, false);
  assert.equal(runs(), before + 1);
});

test("after a restart cached=1 reads .opus/gates-cache.json; a project never checked stays pending", async () => {
  stop();
  await start();
  const before = runs();
  const r = await http("/api/gates?name=ep&cached=1");
  assert.equal(r.json.cached, true);
  assert.equal(r.json.pass, true);
  assert.deepEqual((await http("/api/gates?name=other&cached=1")).json, { pending: true });
  assert.equal(runs(), before);
});
