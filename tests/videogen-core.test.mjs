import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { normalizeSpec, pickSeconds } from "../lib/videogen/spec.mjs";
import { newVideogenIntent, today, updateVideogen, videogenCount, videogenFile, videogenItems } from "../lib/ledger.mjs";
import { videogenSettings } from "../lib/config.mjs";

let tmp, proj, oldState;
const ff = (args) => { const r = spawnSync(ffmpegBin(), ["-v", "error", "-y", ...args]); assert.equal(r.status, 0, String(r.stderr)); };
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "ms-vg-core-"));
  proj = join(tmp, "proj");
  mkdirSync(join(proj, "assets"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "6", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  for (const n of ["a.png", "b.png"]) ff(["-f", "lavfi", "-i", "color=c=red:s=64x36", "-frames:v", "1", join(proj, "assets", n)]);
  oldState = process.env.MOTION_STUDIO_STATE;
  process.env.MOTION_STUDIO_STATE = join(tmp, "state", "studio.json");
});
after(async () => {
  if (oldState === undefined) delete process.env.MOTION_STUDIO_STATE; else process.env.MOTION_STUDIO_STATE = oldState;
  rmSync(tmp, { recursive: true, force: true });
});

const base = { shot: "s1", prompt: "biển lúc bình minh", seconds: 6 };

test("normalizeSpec: video modes, ref count, outside refs, inferred mode", () => {
  assert.equal(normalizeSpec(proj, { ...base, mode: "t2v" }).mode, "t2v");
  assert.equal(normalizeSpec(proj, { ...base, mode: "start", refs: ["assets/a.png"] }).refs[0].role, "start");
  assert.deepEqual(normalizeSpec(proj, { ...base, mode: "start_end", refs: ["assets/a.png", "assets/b.png"] }).refs.map((r) => r.role), ["start", "end"]);
  assert.throws(() => normalizeSpec(proj, { ...base, mode: "start_end", refs: ["assets/a.png"] }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { ...base, refs: ["../clip.mp4"] }));
  assert.equal(normalizeSpec(proj, { ...base, refs: ["assets/a.png"] }).mode, "start");
  assert.equal(normalizeSpec(proj, { ...base, refs: ["assets/a.png", "assets/b.png"] }).mode, "start_end");
  const s = normalizeSpec(proj, base);
  assert.equal(s.mode, "t2v");
  assert.equal(s.backend, "gflow");
  assert.equal(s.kind, "video");
});

test("normalizeSpec: video models, 10 s and resolution only with omni-flash", () => {
  assert.equal(normalizeSpec(proj, base).model, "veo-lite");
  assert.equal(normalizeSpec(proj, base).resolution, null);
  assert.equal(normalizeSpec(proj, base, { model: "omni-flash" }).resolution, "720p");
  assert.throws(() => normalizeSpec(proj, { ...base, seconds: 10, model: "veo-lite" }), (e) => e.status === 400);
  assert.equal(normalizeSpec(proj, { ...base, seconds: 10, model: "omni-flash" }).seconds, 10);
  assert.throws(() => normalizeSpec(proj, { ...base, model: "veo-lite", resolution: "720p" }), (e) => e.status === 400);
  assert.equal(normalizeSpec(proj, { ...base, model: "omni-flash", mode: "start", refs: ["assets/a.png"], resolution: "360p" }).resolution, "360p");
  assert.throws(() => normalizeSpec(proj, { ...base, model: "veo-3" }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { ...base, prompt: "a\0b" }), (e) => e.status === 400);
});

test("normalizeSpec: images", () => {
  const s = normalizeSpec(proj, { kind: "image", shot: "s1", prompt: "biển", aspect: "1:1" });
  assert.deepEqual([s.kind, s.mode, s.model, s.aspect, s.seconds], ["image", "t2i", "nano2", "1:1", undefined]);
  assert.equal(normalizeSpec(proj, { kind: "image", shot: "s1", prompt: "biển", refs: ["assets/a.png"] }).mode, "i2i");
  assert.throws(() => normalizeSpec(proj, { kind: "image", shot: "s1", prompt: "biển", mode: "i2i" }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { kind: "image", shot: "s1", prompt: "biển", model: "imagen4" }), (e) => e.status === 400);
  assert.throws(() => normalizeSpec(proj, { kind: "image", shot: "s1", prompt: "biển", aspect: "21:9" }), (e) => e.status === 400);
});

test("pickSeconds rounds up to a clip length", () => {
  assert.equal(pickSeconds(5.2), 6);
  assert.equal(pickSeconds(10), 10);
  assert.equal(pickSeconds(14), 10);
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
  const v = videogenSettings({ videogen: { daily_clips: 3, daily_images: 5, gflow_bin: "~/bin/gflow", profile: "p1", model: "omni-flash", image_model: "nano-pro" } });
  assert.deepEqual(v, { gflow_bin: join(homedir(), "bin/gflow"), profile: "p1", model: "omni-flash", image_model: "nano-pro", daily_clips: 3, daily_images: 5 });
  const d = videogenSettings(null);
  assert.equal(d.daily_clips, 20); assert.equal(d.daily_images, 30);
  assert.equal(d.model, "veo-lite"); assert.equal(d.image_model, "nano2"); assert.equal(d.profile, null);
  assert.match(d.gflow_bin, /\/\.local\/bin\/gflow$/);
  const bad = videogenSettings({ videogen: { gflow_bin: "gflow", profile: "../x", model: "imagen4", daily_clips: 9999, daily_images: -1 } });
  assert.equal(bad.gflow_bin, d.gflow_bin); assert.equal(bad.profile, null); assert.equal(bad.model, "veo-lite");
  assert.equal(bad.daily_clips, 20); assert.equal(bad.daily_images, 30);
});
