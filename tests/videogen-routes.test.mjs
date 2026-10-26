// The videogen routes over HTTP with a fake provider (gateway: set_shot) and tests/fake-gflow.mjs as
// gflow: status without email, missing binary, WAF block, separate caps for clips and images, the
// 30 s gap between images, the duplicate and recoverable guards, recover, auth, a clip and an image
// end to end, cancel after the submit with its automatic reconcile, no reconcile when Studio stops,
// import, and items a dead runner left behind.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { stopAll } from "../jobs.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { getVideogen, newVideogenIntent, setVideogenWaf, updateVideogen } from "../lib/ledger.mjs";
import { normalizeSpec, specDigest } from "../lib/videogen/spec.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FAKE = fileURLToPath(new URL("./fake-gflow.mjs", import.meta.url));
const A = await adapterFor({});
const TOKEN = "a".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "FAKE_GFLOW", "FAKE_GFLOW_DIR", "FAKE_GFLOW_MP4", "FAKE_GFLOW_AUTH"];
let tmp, plugin, root, ep, server, port, saved, stateFile, fdir;

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
const jobs = async () => (await http("GET", "/api/jobs?name=ep")).json;
// No videogen job left (a cancel after the prompt was typed starts a reconcile job by itself).
const idle = async () => {
  await sleep(100);
  await until(async () => !(await jobs()).some((j) => j.kind === "videogen" && (j.status === "running" || j.status === "cancelling")), "videogen idle");
};
async function waitJob(id) {
  for (let i = 0; i < 600; i++) {
    const j = (await jobs()).find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await sleep(50);
  }
  throw new Error(`job ${id} did not end`);
}
async function until(fn, what) {
  for (let i = 0; i < 400; i++) { if (await fn()) return; await sleep(25); }
  throw new Error(`timed out: ${what}`);
}
const settings = (videogen) => writeFileSync(stateFile, JSON.stringify({ director: { runner: "mcp" }, videogen: { gflow_bin: FAKE, profile: "p1", daily_clips: 50, daily_images: 50, ...videogen } }));
const version = async () => (await http("GET", "/api/project?name=ep")).json.version;
const shot = async (prompt, extra = {}) => http("POST", "/api/videogen/shot", { name: "ep", shot: "s1", base: await version(), prompt, seconds: 6, ...extra });
const image = async (prompt, extra = {}) => http("POST", "/api/videogen/image", { name: "ep", shot: "s1", base: await version(), prompt, aspect: "16:9", ...extra });
const items = async () => (await http("GET", "/api/videogen/items?name=ep")).json.items;
const manifest = () => JSON.parse(readFileSync(join(ep, "project.json"), "utf8"));
const scenario = (s) => { process.env.FAKE_GFLOW = s; };
// No image sent in the last 30 s: the gap guard reads the ledger.
const clearImageGap = () => { for (const x of [...(globalThis.__vgImages ?? [])]) updateVideogen(x, { created: "2000-01-01T00:00:00.000Z" }); };
const noteImages = async () => { globalThis.__vgImages = (await items()).filter((x) => x.kind === "image").map((x) => x.id); };

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-vg-routes-")));
  const ff = spawnSync(ffmpegBin(), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "6", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  assert.equal(ff.status, 0, String(ff.stderr));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, gateway: true });
  stateFile = join(tmp, "state", "studio.json");
  mkdirSync(join(tmp, "state"));
  fdir = join(tmp, "fake");
  mkdirSync(fdir);
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: stateFile, FAKE_GFLOW: "ok", FAKE_GFLOW_DIR: fdir, FAKE_GFLOW_MP4: join(tmp, "clip.mp4") });
  delete process.env.FAKE_GFLOW_AUTH;
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
  await stopAll();
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

// An item of the digest the route computes for the same request.
async function itemFor(prompt, patch, { kind = "video" } = {}) {
  const spec = normalizeSpec(ep, kind === "image" ? { kind, shot: "s1", prompt, aspect: "16:9" } : { shot: "s1", prompt, seconds: 6 });
  const it = newVideogenIntent({ project: ep, shot: "s1", digest: await specDigest(ep, spec), prompt, kind, model: spec.model, profile: "p1", flow_project: "proj-x" });
  updateVideogen(it.id, { spec_summary: { kind, shot: "s1" }, ...patch });
  return it;
}

test("status: binary, version, profile and counts, no email", async () => {
  const r = await http("GET", "/api/videogen/status");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.found, true);
  assert.equal(r.json.version, "0.90.0");
  assert.equal(r.json.tested, true);
  assert.equal(r.json.profile, "p1");
  assert.equal(r.json.today, 0); assert.equal(r.json.cap, 50);
  assert.equal(r.json.images_today, 0); assert.equal(r.json.image_cap, 50);
  assert.equal(r.text.includes("@"), false);
});

test("missing binary: 503 naming the path", async () => {
  settings({ gflow_bin: join(tmp, "no-gflow") });
  try {
    const r = await shot("route: thiếu gflow");
    assert.equal(r.status, 503, r.text);
    assert.match(r.json.error, /no-gflow/);
  } finally { settings({}); }
});

test("a clip end to end: collected, attached as one new version by the human", async () => {
  scenario("ok");
  const v0 = await version();
  const r = await shot("route: biển lúc bình minh");
  assert.equal(r.status, 200, r.text);
  await waitJob(r.json.job.id);
  const it = (await items()).find((x) => x.prompt_head === "route: biển lúc bình minh");
  assert.equal(it.state, "attached", JSON.stringify(it));
  assert.equal("prompt" in it, false);
  const m = manifest();
  assert.equal(m.version, v0 + 1);
  assert.ok(m.shots[0].assets.some((a) => /^assets\/gen\/video\/s1-.+\.mp4$/.test(a)), JSON.stringify(m.shots[0]));
  const patches = readFileSync(join(ep, ".patches.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(patches.some((p) => p.actor === "human" && p.ops[0].op === "set_shot"));
});

test("an image end to end; a second image within 30 s is refused", async () => {
  scenario("ok");
  const r = await image("route: ảnh biển");
  assert.equal(r.status, 200, r.text);
  await waitJob(r.json.job.id);
  const it = (await items()).find((x) => x.prompt_head === "route: ảnh biển");
  assert.equal(it.state, "attached", JSON.stringify(it));
  assert.ok(manifest().shots[0].assets.some((a) => /^assets\/gen\/image\/s1-.+\.png$/.test(a)));
  const soon = await image("route: ảnh thứ hai");
  assert.equal(soon.status, 429, soon.text);
  await noteImages();
  clearImageGap();
});

test("caps for clips and images are separate", async () => {
  const s = (await http("GET", "/api/videogen/status")).json;
  assert.equal(s.today, 1); assert.equal(s.images_today, 1);
  settings({ daily_clips: 1 });
  try {
    const v = await shot("route: vượt trần clip");
    assert.equal(v.status, 403, v.text);
    const i = await image("route: ảnh khi clip đủ trần");
    assert.equal(i.status, 200, i.text);
    await waitJob(i.json.job.id);
    await noteImages(); clearImageGap();
    settings({ daily_clips: 50, daily_images: 2 });
    const i2 = await image("route: vượt trần ảnh");
    assert.equal(i2.status, 403, i2.text);
  } finally { settings({}); }
});

test("WAF block: 429 until it ends", async () => {
  setVideogenWaf(new Date(Date.now() + 60e3).toISOString());
  try {
    const r = await shot("route: bị chặn");
    assert.equal(r.status, 429, r.text);
    assert.ok((await http("GET", "/api/videogen/status")).json.waf_until);
  } finally { setVideogenWaf(new Date(Date.now() - 1000).toISOString()); }
});

test("an unknown result guards the same request until the user says again", async () => {
  const it = await itemFor("route: chưa rõ", { state: "indeterminate", charge: "indeterminate" });
  const dup = await shot("route: chưa rõ");
  assert.equal(dup.status, 409, dup.text);
  assert.equal(dup.json.code, "DUPLICATE"); assert.equal(dup.json.id, it.id);
  scenario("ok");
  const again = await shot("route: chưa rõ", { again: it.id });
  assert.equal(again.status, 200, again.text);
  await waitJob(again.json.job.id);
});

test("a clip Flow made is downloaded, not made again; after a failed download again goes through", async () => {
  const it = await itemFor("route: đã tạo", { state: "made", charge: "charged", media_id: "11111111-2222-3333-4444-555555555555" });
  const r = await shot("route: đã tạo", { again: it.id });
  assert.equal(r.status, 409, r.text);
  assert.equal(r.json.code, "RECOVERABLE");
  updateVideogen(it.id, { recover_failed: 1 });
  const d = await shot("route: đã tạo");
  assert.equal(d.json.code, "DUPLICATE");
  scenario("ok");
  const ok = await shot("route: đã tạo", { again: it.id });
  assert.equal(ok.status, 200, ok.text);
  await waitJob(ok.json.job.id);
});

test("recover downloads a made clip and attaches it; an image cannot be recovered", async () => {
  const it = await itemFor("route: tải lại", { state: "made", charge: "charged", media_id: "aaaaaaaa-2222-3333-4444-555555555555" });
  const r = await http("POST", "/api/videogen/recover", { name: "ep", id: it.id });
  assert.equal(r.status, 200, r.text);
  await waitJob(r.json.job.id);
  assert.equal(getVideogen(it.id).state, "attached", JSON.stringify(getVideogen(it.id)));
  const img = await itemFor("route: ảnh đã tạo", { state: "made", charge: "charged", media_id: "m1" }, { kind: "image" });
  const ri = await http("POST", "/api/videogen/recover", { name: "ep", id: img.id });
  assert.equal(ri.status, 409, ri.text);
  // A made image: the duplicate guard can be passed (sent long enough ago for the image gap).
  updateVideogen(img.id, { created: "2000-01-01T00:00:00.000Z" });
  const d = await image("route: ảnh đã tạo");
  assert.equal(d.json.code, "DUPLICATE");
  updateVideogen(img.id, { state: "failed", charge: "none" });
});

test("auth: the free status check; 409 while a run holds the profile", async () => {
  const ok = await http("POST", "/api/videogen/auth", {});
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(ok.json, { ok: true, code: 0 });
  scenario("hang-after-typed");
  const r = await shot("route: giữ profile");
  assert.equal(r.status, 200, r.text);
  await until(async () => (await items()).find((x) => x.prompt_head === "route: giữ profile")?.phase === "typed", "typed");
  const busy = await http("POST", "/api/videogen/auth", {});
  assert.equal(busy.status, 409, busy.text);
  const second = await shot("route: lần hai");
  assert.equal(second.status, 409, second.text);
  await http("POST", "/api/videogen/cancel", { name: "ep" });
  await waitJob(r.json.job.id);
  await idle();
  updateVideogen((await items()).find((x) => x.prompt_head === "route: giữ profile").id, { state: "failed", charge: "none" });
});

test("cancel after the submit: the catalog is checked by itself and finds the clip", async () => {
  scenario("hang-after-sent");
  const r = await shot("route: ngừng chờ");
  assert.equal(r.status, 200, r.text);
  await until(async () => (await items()).find((x) => x.prompt_head === "route: ngừng chờ")?.phase === "sent", "sent");
  const c = await http("POST", "/api/videogen/cancel", { name: "ep" });
  assert.equal(c.status, 200, c.text);
  await waitJob(r.json.job.id);
  const id = (await items()).find((x) => x.prompt_head === "route: ngừng chờ").id;
  let rec;
  await until(async () => (rec = (await jobs()).find((j) => j.meta?.action === "reconcile" && j.meta?.id === id)), "reconcile job");
  await waitJob(rec.id);
  const it = (await items()).find((x) => x.id === id);
  assert.equal(it.state, "made", JSON.stringify(it));
  assert.ok(it.media_id);
  updateVideogen(it.id, { state: "failed", charge: "none" });
});

test("Studio stopping during a run starts no reconcile; the item waits for one", async () => {
  scenario("hang-after-sent");
  const r = await shot("route: studio tắt");
  assert.equal(r.status, 200, r.text);
  await until(async () => (await items()).find((x) => x.prompt_head === "route: studio tắt")?.phase === "sent", "sent");
  const before = (await jobs()).filter((j) => j.meta?.action === "reconcile").length;
  await stopAll();
  await waitJob(r.json.job.id);
  await sleep(300);
  assert.equal((await jobs()).filter((j) => j.meta?.action === "reconcile").length, before);
  const it = (await items()).find((x) => x.prompt_head === "route: studio tắt");
  assert.equal(it.state, "indeterminate", JSON.stringify(it));
  assert.equal(it.reconcile, true);
  updateVideogen(it.id, { state: "failed", charge: "none" });
});

test("import: a png for an image item, attached", async () => {
  const it = await itemFor("route: nhập ảnh", { state: "indeterminate", charge: "indeterminate" }, { kind: "image" });
  const src = join(tmp, "flow.png");
  writeFileSync(src, Buffer.from("png bytes"));
  const bad = await http("POST", "/api/videogen/import", { name: "ep", id: it.id, base: await version(), path: join(tmp, "clip.mp4") });
  assert.equal(bad.status, 400, bad.text);
  const r = await http("POST", "/api/videogen/import", { name: "ep", id: it.id, base: await version(), path: src });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.rel, /^assets\/gen\/image\/s1-import-.+\.png$/);
  assert.equal(getVideogen(it.id).state, "attached");
});

test("a running item a dead runner left: status sweeps it; a new request first sees a duplicate", async () => {
  const a = await itemFor("route: mồ côi", { state: "running", phase: "sent" });
  // No GET status in between: the POST sweeps it itself and the guard holds.
  const d = await shot("route: mồ côi");
  assert.equal(d.status, 409, d.text);
  assert.equal(d.json.code, "DUPLICATE");
  assert.equal(getVideogen(a.id).state, "indeterminate");
  const b = await itemFor("route: mồ côi 2", { state: "running", phase: "spawned" });
  await http("GET", "/api/videogen/status");
  assert.equal(getVideogen(b.id).state, "indeterminate");
  assert.equal(getVideogen(b.id).reconcile, true);
  const c = await itemFor("route: chưa chạy", { state: "intent" });
  await http("GET", "/api/videogen/status");
  assert.equal(getVideogen(c.id).state, "cancelled");
});
