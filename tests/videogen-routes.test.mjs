// The videogen routes over HTTP with a fake provider (gateway: set_shot) and a fake G-Labs:
// status, one clip end to end (attached, Undo-able version), one job at a time, cancel, the
// daily cap, G-Labs down, no key, the duplicate guard for an unknown result, and resume.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { getVideogen, newVideogenIntent, updateVideogen } from "../lib/ledger.mjs";
import { normalizeSpec } from "../lib/videogen/spec.mjs";
import { fakePlugin } from "./fake-plugin.mjs";
import { fakeGlabs } from "./fake-glabs.mjs";

const A = await adapterFor({});
const TOKEN = "a".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "G_LABS_WEBHOOK_API_KEY"];
let tmp, plugin, root, ep, server, port, saved, fake, stateFile;

function http(method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitJob(id) {
  for (let i = 0; i < 600; i++) {
    const j = (await http("GET", "/api/jobs?name=ep")).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await sleep(50);
  }
  throw new Error(`job ${id} did not end`);
}
async function until(fn, what) {
  for (let i = 0; i < 400; i++) { if (fn()) return; await sleep(20); }
  throw new Error(`timed out: ${what}`);
}
const settings = (videogen) => writeFileSync(stateFile, JSON.stringify({ director: { runner: "mcp" }, videogen: { glabs_url: fake.url, daily_clips: 2, ...videogen } }));
const version = async () => (await http("GET", "/api/project?name=ep")).json.version;
const shot = async (prompt, extra = {}) => http("POST", "/api/videogen/shot", { name: "ep", shot: "s1", base: await version(), prompt, seconds: 6, poll_ms: 50, ...extra });
const items = async () => (await http("GET", "/api/videogen/items?name=ep")).json.items;
const reset = (o = {}) => fake.set({ submit: "accept", statuses: ["completed"], ...o });

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-vg-routes-")));
  const ff = spawnSync(ffmpegBin(), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "6", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  assert.equal(ff.status, 0, String(ff.stderr));
  fake = await fakeGlabs();
  fake.set({ file: join(tmp, "clip.mp4") });
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, gateway: true });
  stateFile = join(tmp, "state", "studio.json");
  mkdirSync(join(tmp, "state"));
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: stateFile, G_LABS_WEBHOOK_API_KEY: fake.key });
  settings({});
  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(ep, { recursive: true });
  writeFileSync(join(ep, "project.json"), JSON.stringify({ schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 6, html: "index.html", capabilities: { editable: true }, shots: [{ id: "s1", start: 0, end: 6 }], lines: [], music: [], assets: [], version: 1 }));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(async () => {
  server.closeAllConnections?.(); server.close();
  await fake?.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("status: G-Labs up, key present, nothing sent today", async () => {
  const r = await http("GET", "/api/videogen/status");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.up, true); assert.equal(r.json.key, true);
  assert.equal(r.json.today, 0); assert.equal(r.json.cap, 2);
});

test("a clip end to end: one POST, attached as a new version by the human", async () => {
  reset();
  const r = await shot("route 2: biển lúc bình minh");
  assert.equal(r.status, 200, r.text);
  await waitJob(r.json.job.id);
  const its = await items();
  assert.equal(its.length, 1);
  assert.equal(its[0].state, "attached", JSON.stringify(its[0]));
  const m = JSON.parse(readFileSync(join(ep, "project.json"), "utf8"));
  assert.equal(m.version, 2);
  assert.ok(m.shots[0].assets.some((a) => /^assets\/gen\/video\/s1-[0-9a-f]{8}-720p\.mp4$/.test(a)), JSON.stringify(m.shots[0]));
  const patches = readFileSync(join(ep, ".patches.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(patches.some((p) => p.actor === "human" && p.ops[0].op === "set_shot"));
  assert.equal(fake.posts.length, 1);
});

test("one job at a time, and cancel stops that task", async () => {
  reset({ statuses: ["running"] });
  fake.posts.length = 0; fake.statusCalls = 0;
  const r = await shot("route 3: đang chạy");
  assert.equal(r.status, 200, r.text);
  await until(() => fake.posts.length === 1 && fake.statusCalls >= 1, "task polled");
  const second = await shot("route 3b: lần hai");
  assert.equal(second.status, 409, second.text);
  const c = await http("POST", "/api/videogen/cancel", { name: "ep" });
  assert.equal(c.status, 200, c.text);
  await waitJob(r.json.job.id);
  assert.equal(fake.stops.length, 1);
  assert.equal((await items()).find((x) => x.prompt_head.startsWith("route 3:")).state, "cancelled");
  reset();
});

test("over the daily cap: 403 and no POST", async () => {
  const before = fake.posts.length;
  assert.equal((await http("GET", "/api/videogen/status")).json.today, 2);
  const r = await shot("route 4: vượt trần");
  assert.equal(r.status, 403, r.text);
  assert.equal(fake.posts.length, before);
  settings({ daily_clips: 50 });
});

test("G-Labs closed: 503 naming G-Labs", async () => {
  const s = netServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const dead = `http://127.0.0.1:${s.address().port}`;
  await new Promise((r) => s.close(r));
  settings({ daily_clips: 50, glabs_url: dead });
  try {
    const r = await shot("route 5: đóng");
    assert.equal(r.status, 503, r.text);
    assert.match(r.json.error, /G-Labs/);
  } finally { settings({ daily_clips: 50 }); }
});

test("no key: 412", async () => {
  delete process.env.G_LABS_WEBHOOK_API_KEY;
  try {
    assert.equal(existsSync(join(tmp, "state", "glabs.env")), false);
    const r = await shot("route 6: thiếu khoá");
    assert.equal(r.status, 412, r.text);
  } finally { process.env.G_LABS_WEBHOOK_API_KEY = fake.key; }
});

test("an unknown result guards the same request until the user says again", async () => {
  reset({ statuses: "gone" });
  try {
    const first = await shot("route 7: chưa rõ");
    assert.equal(first.status, 200, first.text);
    await waitJob(first.json.job.id);
    const it = (await items()).find((x) => x.prompt_head === "route 7: chưa rõ");
    assert.equal(it.state, "indeterminate");
    const dup = await shot("route 7: chưa rõ");
    assert.equal(dup.status, 409, dup.text);
    assert.equal(dup.json.code, "DUPLICATE"); assert.equal(dup.json.id, it.id);
    const again = await shot("route 7: chưa rõ", { again: it.id });
    assert.equal(again.status, 200, again.text);
    await waitJob(again.json.job.id);
  } finally { reset(); }
});

test("resume follows a submitted task without a new POST", async () => {
  reset();
  const res = await fetch(`${fake.url}/api/video/generate`, { method: "POST", headers: { "X-API-Key": fake.key, "content-type": "application/json" }, body: JSON.stringify({ prompt: "route 8: theo dõi", resolution: ["720p"] }) });
  const { task_id } = await res.json();
  const before = fake.posts.length;
  const spec = normalizeSpec(ep, { shot: "s1", prompt: "route 8: theo dõi", seconds: 6 });
  const it = newVideogenIntent({ project: ep, shot: "s1", digest: "d8", prompt: spec.prompt });
  updateVideogen(it.id, { state: "submitted", task_id, spec_summary: { ...spec, prompt_head: spec.prompt } });
  const r = await http("POST", "/api/videogen/resume", { name: "ep", id: it.id, poll_ms: 50 });
  assert.equal(r.status, 200, r.text);
  await waitJob(r.json.job.id);
  assert.equal(getVideogen(it.id).state, "attached");
  assert.equal(fake.posts.length, before);
});
