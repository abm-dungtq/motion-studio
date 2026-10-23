import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASPECTS, atempoChain, buildArgs, cropBox, linearExpr, normalizeParams, outputFile, probeVideo, resolveSource, runFootage } from "../lib/fx/footage.mjs";
import { buildCube, listLuts, parseCube, resolveLut } from "../lib/fx/lut.mjs";
import { listReceipts } from "../lib/receipts.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const skip = !hasFfmpeg && "ffmpeg/ffprobe not installed";
const PROBE = { duration: 4, fps: 30, width: 640, height: 360, hasAudio: true };

let root, dir, src, env;
before(() => {
  root = mkdtempSync(join(tmpdir(), "ms-fx-ft-"));
  dir = join(root, "proj");
  mkdirSync(join(dir, ".opus"), { recursive: true });
  mkdirSync(join(root, "footage", "raw"), { recursive: true });
  env = { ...process.env, MOTION_STUDIO_CACHE: join(root, "cache"), OPUS_VIDEO_HOME: "/nonexistent" };
  src = join(root, "footage", "raw", "test clip.mp4");
  if (hasFfmpeg) execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src]);
  else writeFileSync(src, "");
});
after(() => rmSync(root, { recursive: true, force: true }));

const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want}`);
const frame = 1 / 30 + 0.002;

test("normalizeParams snaps to the frame grid and refuses what ffmpeg cannot honour", () => {
  assert.deepEqual(normalizeParams("trim", { in: 1.01, out: 3 }, PROBE), { in: 1, out: 3 });
  assert.deepEqual(normalizeParams("speed", { anchors: [{ t: 2, rate: 2 }] }, PROBE).anchors, [{ t: 0, rate: 1 }, { t: 2, rate: 2 }]);
  assert.equal(normalizeParams("freeze", { at: 2, duration: 1 }, PROBE).allow_freeze, true);
  for (const [op, p, want] of [
    ["blur", {}, /op phải là/],
    ["trim", { in: 3, out: 1 }, /out phải lớn hơn in/],
    ["trim", { in: 0, out: 9 }, /vượt độ dài/],
    ["trim", { in: "a", out: 2 }, /in/],
    ["speed", { anchors: [] }, /anchors/],
    ["speed", { anchors: [{ t: 0, rate: 9 }] }, /rate/],
    ["speed", { anchors: [{ t: 1, rate: 1 }, { t: 1.01, rate: 2 }] }, /một khung/],
    ["freeze", { at: 3.99, duration: 1 }, /at phải/],
    ["freeze", { at: 1, duration: 31 }, /duration/],
    ["grade", {}, /đúng một/],
    ["grade", { lut: "identity", preset: "warm" }, /đúng một/],
    ["grade", { preset: "neon" }, /preset/],
    ["grade", { preset: "warm", intensity: 2 }, /intensity/],
    ["reframe", { aspect: "2:1" }, /aspect/],
    ["reframe", { aspect: "9:16", anchors: [{ t: 0, x: 2 }] }, /0–1/],
    ["trim", null, /params phải là object/],
  ]) assert.throws(() => normalizeParams(op, p, PROBE), (e) => e.status === 400 && want.test(e.message), `${op} ${JSON.stringify(p)}`);
});

test("buildArgs gives a bit-exact libx264 command and the expected duration and frame", () => {
  const p = normalizeParams("speed", { anchors: [{ t: 0, rate: 1 }, { t: 2, rate: 2 }] }, PROBE);
  const { args, expected_duration, expected } = buildArgs("speed", p, PROBE, { src: "/in.mp4", out: "/out.mp4" });
  assert.equal(expected_duration, 3);
  assert.deepEqual(expected, { width: 640, height: 360, fps: 30 });
  for (const flag of ["-fflags", "+bitexact", "-map_metadata", "-1", "-fps_mode", "cfr", "libx264", "yuv420p"]) assert.ok(args.includes(flag), flag);
  assert.equal(args.at(-1), "/out.mp4");
  const re = buildArgs("reframe", normalizeParams("reframe", { aspect: "9:16" }, PROBE), PROBE, { src: "/in.mp4", out: "/o.mp4" });
  assert.deepEqual([re.expected.width, re.expected.height], [1080, 1920]);
  assert.equal(buildArgs("freeze", normalizeParams("freeze", { at: 2, duration: 1 }, PROBE), PROBE, { src: "/i", out: "/o" }).expected_duration, 5);
  assert.throws(() => buildArgs("grade", { lut: "x", intensity: 1 }, PROBE, { src: "/i", out: "/o" }), /\.cube/);
});

test("helpers: atempo stays in its range, linear expressions and crop boxes are exact", () => {
  for (const r of [0.25, 0.4, 2, 3, 4]) {
    const parts = atempoChain(r);
    assert.ok(parts.every((x) => x >= 0.5 && x <= 2), `${r}: ${parts}`);
    near(parts.reduce((a, b) => a * b, 1), r, 1e-9, `atempo product ${r}`);
  }
  assert.equal(linearExpr([[0, 5]]), "5");
  assert.equal(linearExpr([[0, 0], [2, 10]]), "if(lt(t,0),0,if(lt(t,2),0+(10)*(t-0)/2,10))");
  assert.deepEqual(cropBox("9:16", 640, 360), { cw: 202, ch: 360 });
  assert.deepEqual(cropBox("16:9", 640, 360), { cw: 640, ch: 360 });
  assert.deepEqual(Object.keys(ASPECTS), ["9:16", "16:9", "1:1", "4:5"]);
});

test("LUT files: the identity cube round-trips and project/shared ids never leave their folder", () => {
  const text = buildCube({}, 5);
  assert.equal(parseCube(text).size, 5);
  const rows = text.trim().split("\n").filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l)).map((l) => l.split(" ").map(Number));
  assert.deepEqual(rows[0], [0, 0, 0]);
  assert.deepEqual(rows.at(-1), [1, 1, 1]);
  assert.deepEqual(rows[1], [0.25, 0, 0], "red changes fastest");
  assert.throws(() => parseCube("LUT_3D_SIZE 2\n0 0 0\n"), /cần 8/);
  assert.equal(listLuts({ root, dir, env })[0].id, "identity");
  const a = resolveLut("identity", { root, dir, env }), b = resolveLut("identity", { root, dir, env });
  assert.equal(a.file, b.file);
  assert.equal(a.sha, b.sha);
  for (const bad of ["shared:../x.cube", "project:a/b.cube", "nope", ""]) assert.throws(() => resolveLut(bad, { root, dir, env }), (e) => e.status === 400, bad);
});

test("resolveSource keeps sources inside footage/, shared-assets/ or the project", () => {
  assert.match(resolveSource(root, dir, "footage/raw/test clip.mp4"), /footage\/raw\/test clip\.mp4$/);
  assert.throws(() => resolveSource(root, dir, "footage/../../etc/passwd"), (e) => e.status === 400);
  assert.throws(() => resolveSource(root, dir, "/etc/passwd"), (e) => e.status === 400);
  assert.throws(() => resolveSource(root, dir, "footage/raw/missing.mp4"), (e) => e.status === 404);
  const outside = mkdtempSync(join(tmpdir(), "ms-fx-out-"));
  try {
    writeFileSync(join(outside, "x.mp4"), "");
    symlinkSync(join(outside, "x.mp4"), join(root, "footage", "raw", "link.mp4"));
    assert.throws(() => resolveSource(root, dir, "footage/raw/link.mp4"), (e) => e.status === 403);
  } finally { rmSync(outside, { recursive: true, force: true }); rmSync(join(root, "footage", "raw", "link.mp4"), { force: true }); }
});

test("trim [1, 3] is 2 s and a second run reuses the same file", { skip }, async () => {
  const r = await runFootage({ root, dir, src, op: "trim", params: { in: 1, out: 3 }, env });
  assert.equal(r.cached, false);
  near(r.actual_duration, 2, frame, "trim");
  assert.match(r.rel, /^footage\/cut\/test-clip-trim-[0-9a-f]{8}\.mp4$/);
  const mtime = statSync(r.out).mtimeMs;
  const again = await runFootage({ root, dir, src, op: "trim", params: { in: 1, out: 3 }, env });
  assert.equal(again.cached, true);
  assert.equal(again.out, r.out);
  assert.equal(statSync(r.out).mtimeMs, mtime);
  const rec = listReceipts(dir, { op: "fx-trim" });
  assert.equal(rec.length, 1);
  const body = JSON.parse(readFileSync(join(dir, rec[0].file), "utf8"));
  assert.equal(body.params.expected_duration, 2);
});

test("speed 1x then 2x from 2 s gives 3 s", { skip }, async () => {
  const r = await runFootage({ root, dir, src, op: "speed", params: { anchors: [{ t: 0, rate: 1 }, { t: 2, rate: 2 }] }, env });
  near(r.actual_duration, 3, 2 * frame, "speed");
  assert.equal(r.expected_duration, 3);
});

test("freeze 1 s at 2 s gives 5 s with a still of about 1 s at 2 s", { skip }, async () => {
  const r = await runFootage({ root, dir, src, op: "freeze", params: { at: 2, duration: 1 }, env });
  near(r.actual_duration, 5, frame, "freeze");
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", r.out, "-vf", "freezedetect=n=0.001:d=0.5", "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const start = Number(/freeze_start: ([\d.]+)/.exec(log)?.[1]), dur = Number(/freeze_duration: ([\d.]+)/.exec(log)?.[1]);
  near(start, 2, 2 * frame, "freeze start");
  near(dur, 1, 3 * frame, "freeze duration");
  const rec = listReceipts(dir, { op: "fx-freeze" })[0];
  assert.equal(JSON.parse(readFileSync(join(dir, rec.file), "utf8")).params.allow_freeze, true);
});

test("an identity LUT leaves the picture as it was (PSNR ≥ 45 dB)", { skip }, async () => {
  const r = await runFootage({ root, dir, src, op: "grade", params: { lut: "identity" }, env });
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", r.out, "-i", src, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const avg = /average:([\d.]+|inf)/.exec(log)?.[1];
  assert.ok(avg === "inf" || Number(avg) >= 45, `PSNR ${avg}`);
});

test("reframe 9:16 renders 1080×1920 and the output name follows the params", { skip }, async () => {
  const r = await runFootage({ root, dir, src, op: "reframe", params: { aspect: "9:16", anchors: [{ t: 0, x: 0.3, y: 0.5 }, { t: 4, x: 0.7, y: 0.5 }] }, env });
  const p = await probeVideo(r.out);
  assert.deepEqual([p.width, p.height], [1080, 1920]);
  near(p.duration, 4, frame, "reframe");
  const other = outputFile(root, src, "reframe", normalizeParams("reframe", { aspect: "9:16" }, PROBE));
  assert.notEqual(other, r.out);
});

test("two renders of the same edit are byte-identical", { skip }, async () => {
  const p = { anchors: [{ t: 0, rate: 0.5 }, { t: 1, rate: 2 }] };
  const a = await runFootage({ root, dir, src, op: "speed", params: p, env });
  const first = readFileSync(a.out);
  rmSync(a.out);
  const b = await runFootage({ root, dir, src, op: "speed", params: p, env });
  assert.equal(b.cached, false);
  assert.ok(first.equals(readFileSync(b.out)), "same bytes");
});
