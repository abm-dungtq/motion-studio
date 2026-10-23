import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../lib/quality.mjs";
import { checkMedia, verdictOf } from "../lib/tools/receipts.mjs";
import { DEFAULTS, parseFreeze, thresholds, windows } from "../lib/quality/video.mjs";
import { interior, parseSilence } from "../lib/quality/audio.mjs";

let hasFfmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { hasFfmpeg = false; }
const skip = !hasFfmpeg && "ffmpeg is not installed";
let dir;
const f = (n) => join(dir, n);
const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);

before(() => {
  dir = mkdtempSync(join(tmpdir(), "ms-qc-"));
  if (!hasFfmpeg) return;
  ff("-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=2", "-pix_fmt", "yuv420p", f("black.mp4"));
  ff("-f", "lavfi", "-i", "testsrc=d=3:s=320x240:r=30", "-pix_fmt", "yuv420p", f("testsrc.mp4"));
  ff("-f", "lavfi", "-i", "sine=f=440:d=1", "-f", "lavfi", "-i", "aevalsrc=0:d=3", "-f", "lavfi", "-i", "sine=f=440:d=1", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", f("gap.wav"));
  ff("-f", "lavfi", "-i", "sine=f=440:d=3", f("sine.wav"));
  ff("-f", "lavfi", "-i", "sine=f=440:d=3", "-af", "volume=0.05", f("quiet.wav"));
  ff("-f", "lavfi", "-i", "aevalsrc=sin(2*PI*440*t):d=2", f("loud.wav"));
  ff("-f", "lavfi", "-i", "color=c=red@0.0:s=600x600,format=rgba", "-frames:v", "1", f("clear.png"));
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=600x600,format=rgba", "-f", "lavfi", "-i", "color=c=red:s=300x300,format=rgba", "-filter_complex", "[0][1]overlay=150:150", "-frames:v", "1", f("keyed.png"));
  ff("-f", "lavfi", "-i", "color=c=red:s=600x600", "-frames:v", "1", f("solid.png"));
  ff("-f", "lavfi", "-i", "color=c=blue:s=256x256", "-frames:v", "1", f("small.png"));
});
after(() => rmSync(dir, { recursive: true, force: true }));

const by = async (file) => Object.fromEntries((await runChecks([f(file)])).map((c) => [c.id, c]));

test("video: 2 s of black fails black-frames, testsrc passes every video check", { skip }, async () => {
  const black = await by("black.mp4");
  assert.equal(black["black-frames"].pass, false);
  assert.match(black["black-frames"].detail, /đoạn đen: 0s/);
  const t = await by("testsrc.mp4");
  for (const id of ["black-frames", "frozen-frames", "duration-match", "resolution-fps", "silence"]) assert.equal(t[id].pass, true, `${id}: ${t[id].detail}`);
});

test("audio: 3 s of silence between tones fails silence; a full-scale tone clips; levels are measured", { skip }, async () => {
  const gap = await by("gap.wav");
  assert.equal(gap.silence.pass, false);
  assert.match(gap.silence.detail, /im lặng ở giữa: 1(\.\d+)?–4(\.\d+)? s/);
  const sine = await by("sine.wav");
  assert.equal(sine.silence.pass, true);
  assert.equal(sine.clipping.pass, true);
  assert.equal(sine.loudness.pass, true, sine.loudness.detail);
  assert.equal((await by("loud.wav")).clipping.pass, false);
  assert.equal((await by("quiet.wav")).loudness.pass, false);
});

test("image: an all-transparent PNG fails alpha-coverage, a keyed one passes, an opaque RGB one is skipped", { skip }, async () => {
  const clear = await by("clear.png");
  assert.equal(clear["alpha-coverage"].pass, false);
  assert.match(clear["alpha-coverage"].detail, /^0% điểm đục/);
  const keyed = await by("keyed.png");
  assert.equal(keyed["alpha-coverage"].pass, true, keyed["alpha-coverage"].detail);
  assert.match(keyed["alpha-coverage"].detail, /^25% điểm đục/);
  assert.equal(keyed["min-size"].pass, true);
  assert.match((await by("solid.png"))["alpha-coverage"].detail, /không có kênh alpha/);
  assert.equal((await by("small.png"))["min-size"].pass, false);
});

test("a media-check receipt gets the right verdict: pass, fail, warn; expectations and allowances apply", { skip }, async () => {
  assert.equal((await checkMedia(dir, { files: ["testsrc.mp4"], expected: { width: 320, height: 240, fps: 30, duration: 3 } })).verdict, "pass");
  const wrong = await checkMedia(dir, { files: ["testsrc.mp4"], expected: { width: 1920, duration: 5 } });
  assert.equal(wrong.verdict, "fail");
  assert.deepEqual(wrong.checks.filter((c) => !c.pass).map((c) => c.id).sort(), ["duration-match", "resolution-fps"]);
  assert.deepEqual(wrong.params, { duration: 5, width: 1920 });
  const black = await checkMedia(dir, { files: ["black.mp4"] });
  assert.equal(black.verdict, "fail");
  const allowed = await checkMedia(dir, { files: ["black.mp4"], allow: { black: true, freeze: true } });
  assert.equal(allowed.verdict, "pass", JSON.stringify(allowed.checks));
  const quiet = await checkMedia(dir, { files: ["quiet.wav"], actor: "director:r-1" });
  assert.equal(quiet.verdict, "warn", "loudness only warns");
  assert.equal(quiet.actor, "director:r-1");
  assert.equal(quiet.checks.find((c) => c.id === "loudness").level, "warn");
  // An expectation lives only while its receipt is written.
  assert.equal((await by("testsrc.mp4"))["resolution-fps"].pass, true);
  await assert.rejects(checkMedia(dir, { files: ["../x.mp4"] }), /đường dẫn không hợp lệ/);
  await assert.rejects(checkMedia(dir, { files: [] }), /1 đến 20/);
});

test("pure parts: verdict, thresholds, sampling windows, detector parsers", () => {
  const levels = new Map([["a", "fail"], ["b", "warn"]]);
  assert.equal(verdictOf({ checks: [{ id: "a", pass: true }, { id: "b", pass: true }] }, levels), "pass");
  assert.equal(verdictOf({ checks: [{ id: "b", pass: false }] }, levels), "warn");
  assert.equal(verdictOf({ checks: [{ id: "b", pass: false }, { id: "a", pass: false }] }, levels), "fail");
  assert.equal(verdictOf({ checks: [{ id: "gone", pass: false }] }, levels), "fail", "an unknown check blocks");
  assert.equal(verdictOf({}, levels), "pass");
  assert.deepEqual(thresholds(null), { ...DEFAULTS });
  const t = thresholds({ quality: { black_min_s: 1.5, min_side_px: "x", nope: 1 } });
  assert.equal(t.black_min_s, 1.5);
  assert.equal(t.min_side_px, 512);
  assert.ok(!("nope" in t));
  assert.deepEqual(windows(120), [[0, null]]);
  assert.deepEqual(windows(1200), [[105, 30], [585, 30], [1005, 30]], "over 10 minutes: three 30 s windows");
  assert.deepEqual(parseFreeze("lavfi.freezedetect.freeze_start: 1.5\nlavfi.freezedetect.freeze_duration: 2\nlavfi.freezedetect.freeze_end: 3.5\nlavfi.freezedetect.freeze_start: 9"), [{ start: 1.5, length: 2 }, { start: 9, length: null }]);
  const s = parseSilence("silence_start: -0.01\nsilence_end: 1.2 | silence_duration: 1.2\nsilence_start: 3\nsilence_end: 6 | silence_duration: 3\nsilence_start: 8");
  assert.deepEqual(s, [{ start: 0, end: 1.2 }, { start: 3, end: 6 }, { start: 8, end: null }]);
  assert.deepEqual(interior(s, 10), [{ start: 3, end: 6 }], "head and tail silences are fine");
});
