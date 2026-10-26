import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { normalizeSpec, pickSeconds, toGlabsBody } from "../lib/videogen/spec.mjs";
import { chargeOf, checkUrl, download, health, status, submit } from "../lib/videogen/glabs.mjs";
import { newVideogenIntent, today, updateVideogen, videogenCount, videogenFile, videogenItems } from "../lib/ledger.mjs";
import { videogenSettings } from "../lib/config.mjs";
import { fakeGlabs } from "./fake-glabs.mjs";

let tmp, proj, fake, oldState;
const ff = (args) => { const r = spawnSync(ffmpegBin(), ["-v", "error", "-y", ...args]); assert.equal(r.status, 0, String(r.stderr)); };
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "ms-vg-core-"));
  proj = join(tmp, "proj");
  mkdirSync(join(proj, "assets"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "6", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  for (const n of ["a.png", "b.png"]) ff(["-f", "lavfi", "-i", "color=c=red:s=64x36", "-frames:v", "1", join(proj, "assets", n)]);
  oldState = process.env.MOTION_STUDIO_STATE;
  process.env.MOTION_STUDIO_STATE = join(tmp, "state", "studio.json");
  fake = await fakeGlabs();
  fake.set({ file: join(tmp, "clip.mp4") });
});
after(async () => {
  await fake?.close();
  if (oldState === undefined) delete process.env.MOTION_STUDIO_STATE; else process.env.MOTION_STUDIO_STATE = oldState;
  rmSync(tmp, { recursive: true, force: true });
});

const base = { shot: "s1", prompt: "biển lúc bình minh", seconds: 6 };

test("normalizeSpec: modes, ref count, 360p, outside refs, inferred mode", () => {
  assert.equal(normalizeSpec(proj, { ...base, mode: "t2v" }).mode, "t2v");
  assert.equal(normalizeSpec(proj, { ...base, mode: "start", refs: ["assets/a.png"] }).refs[0].role, "start");
  assert.deepEqual(normalizeSpec(proj, { ...base, mode: "start_end", refs: ["assets/a.png", "assets/b.png"] }).refs.map((r) => r.role), ["start", "end"]);
  assert.throws(() => normalizeSpec(proj, { ...base, mode: "start_end", refs: ["assets/a.png"] }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { ...base, mode: "start", refs: ["assets/a.png"], resolution: "360p" }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { ...base, refs: ["../clip.mp4"] }));
  assert.equal(normalizeSpec(proj, { ...base, refs: ["assets/a.png"] }).mode, "start");
  assert.equal(normalizeSpec(proj, { ...base, refs: ["assets/a.png", "assets/b.png"] }).mode, "start_end");
  assert.equal(normalizeSpec(proj, base).mode, "t2v");
});

test("pickSeconds rounds up to a clip length", () => {
  assert.equal(pickSeconds(5.2), 6);
  assert.equal(pickSeconds(10), 10);
  assert.equal(pickSeconds(14), 10);
});

test("toGlabsBody: start_end, base64 refs, no logo", () => {
  const b = toGlabsBody(proj, normalizeSpec(proj, { ...base, refs: ["assets/a.png", "assets/b.png"] }));
  assert.equal(b.mode, "start_end_image");
  assert.ok(b.reference_images[0].startsWith("data:image/png;base64,"));
  assert.equal(b.remove_logo, true);
});

test("checkUrl accepts loopback only", () => {
  assert.throws(() => checkUrl("http://192.168.1.5:8765"));
  assert.equal(checkUrl("http://127.0.0.1:8765"), "http://127.0.0.1:8765");
});

test("client: health and submit outcomes", async () => {
  assert.equal((await health(fake.url)).up, true);
  const body = { prompt: "x" };
  const wrong = await submit(fake.url, "sai", body);
  assert.equal(wrong.kind, "rejected"); assert.equal(wrong.status, 401);
  fake.set({ submit: "reject:413" });
  assert.equal((await submit(fake.url, fake.key, body)).kind, "rejected");
  fake.set({ submit: "500" });
  assert.equal((await submit(fake.url, fake.key, body)).kind, "unknown");
  fake.set({ submit: "hang" });
  assert.equal((await submit(fake.url, fake.key, body, { timeoutMs: 200 })).kind, "unknown");
  fake.set({ submit: "accept" });
  assert.equal((await submit(fake.url, fake.key, body)).kind, "accepted");
});

test("status of a task G-Labs no longer knows is gone", async () => {
  const r = await submit(fake.url, fake.key, { prompt: "gone" });
  fake.set({ statuses: "gone" });
  try { assert.equal((await status(fake.url, fake.key, r.task_id)).kind, "gone"); } finally { fake.set({ statuses: ["completed"] }); }
  await assert.rejects(status(fake.url, fake.key, ""), /task_id/);
});

test("download only from G-Labs files", async () => {
  const out = join(tmp, "out", "c.mp4");
  await assert.rejects(download(fake.url, "http://localhost:1/x", out), /không thuộc G-Labs/);
  await download(fake.url, `${fake.url}/api/files/clip-abc.mp4`, out);
  assert.ok(existsSync(out) && statSync(out).size > 0);
});

test("chargeOf separates free failures from maybe-charged ones", () => {
  assert.equal(chargeOf({ error_code: 429 }), "none");
  assert.equal(chargeOf({ error_code: 400, error: "INVALID_MODE — x" }), "none");
  assert.equal(chargeOf({ error_code: 0, error: "Timeout: no result generated" }), "indeterminate");
  assert.equal(chargeOf({ error_code: 504, error: "PICS_TIMEOUT" }), "indeterminate");
  assert.equal(chargeOf({ error_code: 500, error: "NO_OUTPUT" }), "indeterminate");
});

test("ledger: intents, count, file mode, items", () => {
  const a = newVideogenIntent({ project: proj, shot: "s1", digest: "d1", prompt: "một" });
  newVideogenIntent({ project: proj, shot: "s1", digest: "d2", prompt: "hai" });
  updateVideogen(a.id, { state: "failed", charge: "none" });
  assert.equal(videogenCount(), 1);
  assert.equal(statSync(videogenFile(today())).mode & 0o777, 0o600);
  assert.equal(videogenItems(proj).length, 2);
});

test("videogenSettings reads studio.json and falls back", () => {
  assert.deepEqual(videogenSettings({ videogen: { daily_clips: 3, glabs_url: "http://127.0.0.1:9/" } }), { glabs_url: "http://127.0.0.1:9", daily_clips: 3 });
  assert.equal(videogenSettings(null).daily_clips, 40);
});
