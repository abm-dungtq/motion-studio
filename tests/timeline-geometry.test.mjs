import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROLL, LABEL, RULER, TIER, TRACK, clampPps, fitPps, laneLayout, rulerStep, tAt, timelineTotal, trackLayout, xAt, zoomAround,
} from "../ui/src/core/timeline-geometry.ts";

// The fit() of the old timeline, written out: (clientWidth - LABEL - 60) / total, kept in 8..400.
const oldFit = (width, total) => Math.max(8, Math.min(400, (width - 90 - 60) / total));

test("fitPps matches the old fit() formula", () => {
  for (const [width, total] of [[1440, 20], [1440, 20.601], [2560, 180], [300, 1], [200, 600]]) {
    assert.equal(fitPps(width, total), oldFit(width, total), `${width} px, ${total} s`);
  }
  assert.equal(fitPps(1440, 20), (1440 - LABEL - 60) / 20);
});

test("clampPps keeps 8..400", () => {
  assert.equal(clampPps(1000), 400);
  assert.equal(clampPps(1), 8);
  assert.equal(clampPps(64.5), 64.5);
});

test("xAt and tAt invert each other; tAt never goes below 0", () => {
  assert.equal(xAt(2, 60), LABEL + 120);
  assert.equal(tAt(xAt(7.25, 64.5), 64.5), 7.25);
  assert.equal(tAt(10, 60), 0);
});

test("zoomAround keeps the time under the pointer in place", () => {
  for (const [pps, factor, pointerX, scrollLeft] of [[64.5, 1.15, 600, 0], [64.5, 1 / 1.15, 300, 250], [120, 1.15, 1000, 800], [9, 1 / 1.15, 140, 0]]) {
    const before = tAt(pointerX + scrollLeft, pps);
    const r = zoomAround({ pps, factor, pointerX, scrollLeft });
    if (r.scrollLeft === 0 && LABEL + before * r.pps - pointerX < 0) continue; // pinned at the left edge
    assert.ok(Math.abs(tAt(pointerX + r.scrollLeft, r.pps) - before) < 1e-6, `pps ${pps} ×${factor}`);
  }
  assert.equal(zoomAround({ pps: 64.5, factor: 1.15, pointerX: 600, scrollLeft: 0 }).pps, 64.5 * 1.15);
});

test("zoomAround at the pps limit changes nothing", () => {
  assert.deepEqual(zoomAround({ pps: 400, factor: 1.15, pointerX: 500, scrollLeft: 123 }), { pps: 400, scrollLeft: 123 });
  assert.deepEqual(zoomAround({ pps: 8, factor: 1 / 1.15, pointerX: 500, scrollLeft: 7 }), { pps: 8, scrollLeft: 7 });
});

test("rulerStep picks the first step at least 50 px wide", () => {
  assert.equal(rulerStep(64.5), 1);
  assert.equal(rulerStep(400), 0.5);
  assert.equal(rulerStep(30), 2);
  assert.equal(rulerStep(8), 10);
  assert.equal(rulerStep(0.5), 60);
});

test("timelineTotal takes the latest of duration, shot ends and line ends", () => {
  assert.equal(timelineTotal(null), 0);
  assert.equal(timelineTotal({ duration: 20, shots: [{ id: "a", start: 0, end: 20.6 }], lines: [] }), 20.6);
  assert.equal(timelineTotal({ duration: 5, shots: [], lines: [{ id: "l", shot: "a", start: 4, duration: 3 }] }), 7);
});

const busy = {
  duration: 10,
  shots: [{ id: "s1", start: 0, end: 5 }, { id: "s2", start: 5, end: 10 }],
  lines: [{ id: "vo-01", shot: "s1", start: 0.5, duration: 2 }],
  music: [{ id: "a", start: 0, end: 8 }, { id: "b", start: 4, end: null }],
  events: [{ id: "e1", shot: "s1", offset: 1 }, { id: "e2", shot: "s1", offset: 1.05 }, { id: "e3", shot: "s1", offset: 1.1 }],
};

test("laneLayout: two overlapping beds take two music lanes, three overlapping SFX three tiers", () => {
  const lanes = laneLayout(busy, 60);
  const of = (k) => lanes.filter((l) => l.lane === k);
  assert.equal(of("music").length, 2);
  assert.equal(of("sfx").length, 3);
  assert.deepEqual(lanes.map((l) => l.lane), ["shot", "broll", "voice", "music", "music", "sfx", "sfx", "sfx"]);
  assert.deepEqual(lanes.slice(0, 4).map((l) => [l.y, l.h]), [[RULER, TRACK], [RULER + TRACK, BROLL], [RULER + TRACK + BROLL, TRACK], [RULER + 2 * TRACK + BROLL, TRACK]]);
  const musicTop = RULER + 2 * TRACK + BROLL;
  assert.equal(of("music")[1].y, musicTop + TRACK);
  assert.deepEqual(of("sfx").map((l) => [l.index, l.y, l.h]), [0, 1, 2].map((i) => [i, musicTop + 2 * TRACK + 4 + i * TIER, TIER]));
});

test("trackLayout: track heights as render() drew them", () => {
  const t = trackLayout(busy, 60);
  assert.deepEqual(t.map((x) => x.lane), ["shot", "broll", "voice", "music", "sfx"]);
  assert.deepEqual(t.map((x) => x.h), [TRACK, BROLL, TRACK, 2 * TRACK, Math.max(TRACK, 3 * TIER + 8)]);
  // An empty project still has one music lane and one SFX tier.
  const e = trackLayout({ shots: [], lines: [] }, 60);
  assert.deepEqual(e.map((x) => [x.h, x.count]), [[TRACK, 1], [BROLL, 1], [TRACK, 1], [TRACK, 1], [TRACK, 1]]);
});
