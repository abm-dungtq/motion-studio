import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { getVideogen, newVideogenIntent, requestVideogenCancel, updateVideogen, videogenCount } from "../lib/ledger.mjs";
import { normalizeSpec } from "../lib/videogen/spec.mjs";
import { readKey, runVideogen } from "../lib/videogen/run.mjs";
import { fakeGlabs } from "./fake-glabs.mjs";

const RUN = fileURLToPath(new URL("../lib/videogen/run.mjs", import.meta.url));
let tmp, proj, fake;
const saved = {};
const ff = (args) => { const r = spawnSync(ffmpegBin(), ["-v", "error", "-y", ...args]); assert.equal(r.status, 0, String(r.stderr)); };
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "ms-vg-run-"));
  proj = join(tmp, "proj");
  mkdirSync(join(proj, "assets"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "6", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  for (const n of ["key.png", "end.png"]) ff(["-f", "lavfi", "-i", "color=c=red:s=64x36", "-frames:v", "1", join(proj, "assets", n)]);
  for (const k of ["MOTION_STUDIO_STATE", "G_LABS_WEBHOOK_API_KEY"]) saved[k] = process.env[k];
  process.env.MOTION_STUDIO_STATE = join(tmp, "state", "studio.json");
  fake = await fakeGlabs();
  process.env.G_LABS_WEBHOOK_API_KEY = fake.key;
  fake.set({ file: join(tmp, "clip.mp4") });
});
after(async () => {
  await fake?.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true });
});

const quiet = () => {};
function reset(o = {}) { fake.posts.length = 0; fake.stops.length = 0; fake.set({ submit: "accept", statuses: ["completed"], tasks: "answer", ...o }); }
const arg = (prompt, extra = {}, specIn = {}) => {
  const spec = normalizeSpec(proj, { shot: "s1", prompt, seconds: 6, ...specIn });
  return { action: "new", dir: proj, spec, digest: `d-${prompt}`, base_url: fake.url, cap: 50, poll_ms: 20, deadline_ms: 3000, ...extra };
};
const go = (a) => runVideogen(a, { log: quiet });

test("success t2v: one POST, file, collected, receipt", async () => {
  reset();
  const r = await go(arg("ca 1: biển"));
  assert.equal(r.ok, true, r.error);
  assert.equal(fake.posts.length, 1);
  assert.match(r.rel, /^assets\/gen\/video\/s1-[0-9a-f]{8}-720p\.mp4$/);
  assert.ok(existsSync(join(proj, r.rel)));
  assert.equal(getVideogen(r.id).state, "collected");
  const days = readdirSync(join(proj, ".opus", "receipts"));
  const recs = days.flatMap((d) => readdirSync(join(proj, ".opus", "receipts", d)));
  assert.ok(recs.some((f) => f.startsWith("videogen-")));
});

test("start_end sends two base64 refs", async () => {
  reset();
  const r = await go(arg("ca 2: núi", {}, { refs: ["assets/key.png", "assets/end.png"] }));
  assert.equal(r.ok, true, r.error);
  assert.equal(fake.posts[0].mode, "start_end_image");
  assert.equal(fake.posts[0].reference_images.length, 2);
});

test("rejected 400: failed, no charge, not counted", async () => {
  reset({ submit: "reject:400" });
  const before = videogenCount();
  const r = await go(arg("ca 3: sông"));
  assert.equal(r.ok, false);
  const it = getVideogen(r.id);
  assert.equal(it.state, "failed"); assert.equal(it.charge, "none");
  assert.equal(videogenCount(), before);
});

test("POST without answer and no matching task: indeterminate, one POST", async () => {
  reset({ submit: "hang" });
  const r = await go(arg("ca 4: rừng", { submit_timeout_ms: 300 }));
  assert.equal(r.indeterminate, true);
  assert.equal(getVideogen(r.id).state, "indeterminate");
  assert.equal(fake.posts.length, 1);
});

test("POST without answer but a matching task: followed to collected", async () => {
  reset({ submit: "hang-after-create" });
  const r = await go(arg("ca 5: phố", { submit_timeout_ms: 300 }));
  assert.equal(r.ok, true, r.error);
  assert.equal(getVideogen(r.id).state, "collected");
  assert.equal(fake.posts.length, 1);
});

test("task failed by timeout: indeterminate, one POST", async () => {
  reset({ statuses: ["running", { failed: { error_code: 0, error: "Timeout: no result generated" } }] });
  const r = await go(arg("ca 6: mưa"));
  assert.equal(getVideogen(r.id).state, "indeterminate");
  assert.equal(fake.posts.length, 1);
});

test("status 404: indeterminate", async () => {
  reset({ statuses: "gone" });
  const r = await go(arg("ca 7: gió"));
  assert.equal(getVideogen(r.id).state, "indeterminate");
});

test("resume follows a submitted task without a POST", async () => {
  reset();
  const res = await fetch(`${fake.url}/api/video/generate`, { method: "POST", headers: { "X-API-Key": fake.key, "content-type": "application/json" }, body: JSON.stringify({ prompt: "ca 8: trăng", resolution: ["720p"] }) });
  const { task_id } = await res.json();
  fake.posts.length = 0;
  const a = arg("ca 8: trăng");
  const it = newVideogenIntent({ project: proj, shot: "s1", digest: "d8", prompt: "ca 8: trăng" });
  updateVideogen(it.id, { state: "submitted", task_id, spec_summary: { ...a.spec, prompt_head: "ca 8: trăng" } });
  const r = await go({ action: "resume", id: it.id, dir: proj, base_url: fake.url, cap: 50, poll_ms: 20, deadline_ms: 3000 });
  assert.equal(r.ok, true, r.error);
  assert.equal(getVideogen(it.id).state, "collected");
  assert.equal(fake.posts.length, 0);
});

test("over the daily cap: 403, no POST", async () => {
  reset();
  const r = await go(arg("ca 9: mây", { cap: 0 }));
  assert.equal(r.status, 403);
  assert.equal(fake.posts.length, 0);
});

test("no key: 412, no POST", async () => {
  reset();
  const state = process.env.MOTION_STUDIO_STATE;
  delete process.env.G_LABS_WEBHOOK_API_KEY;
  process.env.MOTION_STUDIO_STATE = join(tmp, "nokey", "studio.json");
  try {
    const r = await go(arg("ca 10: sao"));
    assert.equal(r.status, 412);
    assert.equal(fake.posts.length, 0);
  } finally {
    process.env.MOTION_STUDIO_STATE = state;
    process.env.G_LABS_WEBHOOK_API_KEY = fake.key;
  }
});

test("readKey reads glabs.env beside the state file", () => {
  const dir = join(tmp, "keyfile");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "glabs.env"), `export G_LABS_WEBHOOK_API_KEY="${fake.key}"\n`, { mode: 0o600 });
  assert.equal(readKey({ MOTION_STUDIO_STATE: join(dir, "studio.json") }), fake.key);
});

// Spawns the runner, waits until G-Labs has the task and was polled; returns { child, id, lines, done }.
async function spawnRunner(prompt) {
  reset({ statuses: ["running"] });
  const a = arg(prompt, { deadline_ms: 10000, poll_ms: 50 });
  const child = spawn(process.execPath, [RUN, "run", JSON.stringify(a)], { env: { ...process.env } });
  const lines = [];
  let buf = "";
  child.stdout.on("data", (d) => { buf += d; const parts = buf.split("\n"); buf = parts.pop(); lines.push(...parts); });
  const done = new Promise((r) => child.on("exit", (code) => r(code)));
  const t0 = Date.now();
  while (!(fake.posts.length === 1 && fake.statusCalls >= 1 && lines.some((l) => l.startsWith("INTENT ")))) {
    if (Date.now() - t0 > 8000) throw new Error(`runner did not start: ${lines.join("\n")}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  const id = lines.find((l) => l.startsWith("INTENT ")).slice(7);
  while (getVideogen(id)?.state !== "running") await new Promise((r) => setTimeout(r, 20));
  return { child, id, lines, done };
}

test("SIGTERM after the user cancelled stops the task", async () => {
  fake.statusCalls = 0;
  const { child, id, lines, done } = await spawnRunner("ca 12: huỷ");
  requestVideogenCancel(id);
  child.kill("SIGTERM");
  await done;
  assert.deepEqual(fake.stops, [getVideogen(id).task_id]);
  assert.ok(lines.some((l) => l.startsWith("RESULT ") && l.includes('"cancelled":true')), lines.join("\n"));
  assert.equal(getVideogen(id).state, "cancelled");
});

test("SIGTERM from Studio shutting down leaves the task to resume", async () => {
  fake.statusCalls = 0;
  const { child, id, lines, done } = await spawnRunner("ca 13: tắt");
  child.kill("SIGTERM");
  await done;
  assert.equal(fake.stops.length, 0);
  assert.ok(lines.some((l) => l.startsWith("RESULT ") && l.includes('"resumable":true')), lines.join("\n"));
  assert.ok(["running", "submitted"].includes(getVideogen(id).state));
});

// Spawns the runner with `a`; returns { child, lines, done }.
function spawnArg(a) {
  const child = spawn(process.execPath, [RUN, "run", JSON.stringify(a)], { env: { ...process.env } });
  const lines = [];
  let buf = "";
  child.stdout.on("data", (d) => { buf += d; const parts = buf.split("\n"); buf = parts.pop(); lines.push(...parts); });
  return { child, lines, done: new Promise((r) => child.on("exit", (code) => r(code))) };
}

test("a cancel while an unanswered POST is being matched is an unknown result, not free", async () => {
  reset({ submit: "500", tasks: "hang" });
  fake.tasksCalls = 0;
  const { child, lines, done } = spawnArg(arg("ca 14: huỷ khi đang khớp", { deadline_ms: 10000 }));
  const t0 = Date.now();
  while (!(fake.posts.length === 1 && fake.tasksCalls >= 1 && lines.some((l) => l.startsWith("INTENT ")))) {
    if (Date.now() - t0 > 8000) throw new Error(`runner did not reach the match: ${lines.join("\n")}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  const id = lines.find((l) => l.startsWith("INTENT ")).slice(7);
  requestVideogenCancel(id);
  child.kill("SIGTERM");
  await done;
  const it = getVideogen(id);
  assert.equal(it.state, "indeterminate", JSON.stringify(it));
  assert.notEqual(it.charge, "none");
  reset();
});
