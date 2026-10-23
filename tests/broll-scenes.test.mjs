import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probe } from "../lib/broll/ffmpeg.mjs";
import { framePlan, packSheets } from "../lib/broll/frames.mjs";
import { detectScenes, parseScdet, scdetArgs, shotsFrom } from "../lib/broll/scenes.mjs";
import { colorClip } from "./broll-fake.mjs";

const dir = mkdtempSync(join(tmpdir(), "ms-broll-scenes-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("three 2 s colour blocks give three shots, edges within one frame", async () => {
  const f = colorClip(join(dir, "c3.mp4"), [["red", 2], ["blue", 2], ["green", 2]]);
  const p = await probe(f);
  assert.equal(p.fps, 30);
  const r = await detectScenes(f, p.duration);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.shots.length, 3);
  const frame = 1 / p.fps;
  for (const [k, want] of [[0, 0], [1, 2], [2, 4]]) assert.ok(Math.abs(r.shots[k].start - want) <= frame + 1e-9, `shot ${k + 1} starts at ${r.shots[k].start}`);
  assert.ok(Math.abs(r.shots[2].end - p.duration) < 1e-6);
  assert.deepEqual(r.shots.map((s) => s.i), [1, 2, 3]);
});

test("a 1 s clip is one shot", async () => {
  const f = colorClip(join(dir, "c1.mp4"), [["red", 0.5], ["blue", 0.5]]);
  const p = await probe(f);
  const r = await detectScenes(f, p.duration);
  assert.deepEqual(r.shots, [{ i: 1, start: 0, end: Math.round(p.duration * 1000) / 1000 }]);
});

test("cuts closer than min_scene_len merge, and a short last shot joins the one before", () => {
  assert.deepEqual(shotsFrom([1, 1.3, 3, 9.8], 10, { minLen: 0.6 }), [{ i: 1, start: 0, end: 1 }, { i: 2, start: 1, end: 3 }, { i: 3, start: 3, end: 10 }]);
  assert.deepEqual(shotsFrom([0.2, 5], 10), [{ i: 1, start: 0, end: 5 }, { i: 2, start: 5, end: 10 }], "a cut 0.2 s in is dropped");
  assert.deepEqual(shotsFrom([], 0), []);
  assert.deepEqual(parseScdet("x lavfi.scd.score: 34.040, lavfi.scd.time: 2.433333\ny lavfi.scd.score: 15.7, lavfi.scd.time: 1.3"), [{ t: 1.3, score: 15.7 }, { t: 2.433333, score: 34.04 }]);
  assert.ok(scdetArgs("/a.mp4").includes("scale=320:-2,scdet=threshold=10"));
});

test("keyframes: three per shot of 1.5 s or more, one otherwise; sheets pack first fit, ≥ 3 shots each", () => {
  assert.deepEqual(framePlan([{ i: 1, start: 0, end: 2 }, { i: 2, start: 2, end: 3 }]).map((x) => [x.name, x.t]), [["s1-1.jpg", 0.5], ["s1-2.jpg", 1], ["s1-3.jpg", 1.5], ["s2-1.jpg", 2.5]]);
  const g = (id, n) => ({ id, frames: Array.from({ length: n }, (_, k) => `${id}-${k}`) });
  const sheets = packSheets([g("a", 3), g("b", 1), g("c", 3), g("d", 3), g("e", 1), g("f", 1)]);
  assert.equal(sheets.length, 2);
  assert.deepEqual(sheets[0].groups.map((x) => [x.id, x.first, x.last]), [["a", 1, 3], ["b", 4, 4], ["c", 5, 7], ["e", 8, 8], ["f", 9, 9]]);
  assert.deepEqual(sheets[1].groups.map((x) => x.id), ["d"]);
  assert.throws(() => packSheets([g("x", 4)]), /1 đến 3/);
});
