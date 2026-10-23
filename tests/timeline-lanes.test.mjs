import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decorationItems, keyAction, markerDrag, stackLanes, wordBounds } from "../ui/src/core/timeline-edit.ts";
import { assetPath, latestRender, mediaStamps } from "../routes/timeline-assets.mjs";

const five = [
  { id: "e", start: 6, end: 8 },
  { id: "a", start: 0, end: 4 },
  { id: "b", start: 1, end: 3 },
  { id: "c", start: 2, end: 5 },
  { id: "d", start: 3, end: 7 },
];

test("stackLanes uses as few lanes as the deepest overlap and is stable", () => {
  const r = stackLanes(five);
  // At t = 2.5, a, b and c overlap: three lanes, no fewer.
  assert.equal(r.count, 3);
  assert.equal(r.overflow, false);
  assert.deepEqual(r.lane, { a: 0, b: 1, c: 2, d: 1, e: 0 });
  // No two intervals of a lane overlap.
  for (const x of five) for (const y of five) {
    if (x !== y && r.lane[x.id] === r.lane[y.id]) assert.ok(x.end <= y.start || y.end <= x.start, `${x.id} ${y.id}`);
  }
  // Same input in another order: same lanes.
  assert.deepEqual(stackLanes([...five].reverse()), r);
  assert.deepEqual(stackLanes(five), r);
});

test("stackLanes past max puts the rest in the last lane and says so", () => {
  const r = stackLanes(five, 2);
  assert.equal(r.count, 2);
  assert.equal(r.overflow, true);
  assert.equal(r.lane.c, 1);
  assert.ok(Object.values(r.lane).every((k) => k < 2));
  assert.deepEqual(stackLanes(five, 3).overflow, false);
});

test("stackLanes: touching intervals share a lane, points and junk are handled", () => {
  assert.equal(stackLanes([{ id: 1, start: 0, end: 2 }, { id: 2, start: 2, end: 3 }]).count, 1);
  assert.deepEqual(stackLanes([]), { lane: {}, count: 0, overflow: false });
  const pts = stackLanes([{ id: "p", start: 1 }, { id: "q", start: 1 }, null, { id: "x", start: NaN }]);
  assert.equal(pts.count, 1, "two zero-length points at one time do not overlap");
});

test("two music beds that overlap take two lanes, three stacked SFX three tiers", () => {
  assert.equal(stackLanes([{ id: "m1", start: 0, end: 20 }, { id: "m2", start: 12, end: 30 }]).count, 2);
  const w = 0.3;
  assert.equal(stackLanes([{ id: "s1", start: 5, end: 5 + w }, { id: "s2", start: 5.1, end: 5.1 + w }, { id: "s3", start: 5.2, end: 5.2 + w }], 4).count, 3);
});

const words = [{ text: "một", start: 0.1, end: 0.4 }, { text: "hai", start: 0.5, end: 0.9 }, { text: "ba", start: 1.0, end: 1.3 }];

test("markerDrag keeps a word between its neighbours and beat0 inside one beat", () => {
  assert.deepEqual(wordBounds(words, 1), { lo: 0.4, hi: 0.89 });
  assert.deepEqual(wordBounds(words, 1, "end"), { lo: 0.51, hi: 1 });
  assert.deepEqual(markerDrag({ words, index: 1 }, "word", 0.05), { value: 0.55, clamped: false, from: 0.5 });
  assert.equal(markerDrag({ words, index: 1 }, "word", -0.5).value, 0.4);
  assert.equal(markerDrag({ words, index: 1 }, "word", -0.5).clamped, true);
  assert.equal(markerDrag({ words, index: 1 }, "word", 1).value, 0.89);
  assert.equal(markerDrag({ words, index: 0 }, "word", -1).value, 0);
  assert.ok(markerDrag({ words, index: 9 }, "word", 0).error);
  assert.deepEqual(markerDrag({ beat0: 0.1, beatLen: 0.5 }, "beat", 0.05), { value: 0.15, clamped: false, from: 0.1 });
  assert.equal(markerDrag({ beat0: 0.1, beatLen: 0.5 }, "beat", -0.3).value, 0);
  assert.equal(markerDrag({ beat0: 0.1, beatLen: 0.5 }, "beat", 2).value, 0.499);
  assert.ok(markerDrag({ beat0: 0, beatLen: 0 }, "beat", 0.1).error);
  assert.ok(markerDrag({}, "nope", 0).error);
});

// The timeline gathers addTimelineDecorator marks through decorationItems: an extension's
// decorator keeps drawing on its lane, and one that throws does not stop the others.
test("decorationItems: registered decorators still draw, bad marks and a throwing decorator are skipped", () => {
  const m = { shots: [{ id: "s1", start: 0, end: 4 }] };
  const errors = [];
  const good = (mm, state) => [
    { t: 1, until: 2, lane: "shot", label: "Cảnh mở", kind: "warn" },
    { t: 3, lane: "music", label: state.tag },
    { t: 2, until: 1, lane: "shot" }, { t: "x", lane: "voice" }, { t: 1, lane: "nowhere" },
  ];
  const by = decorationItems([good, () => { throw new Error("hỏng"); }, () => null], m, { tag: "phách" }, (e) => errors.push(e.message));
  assert.deepEqual(by.shot, [{ t: 1, until: 2, label: "Cảnh mở", kind: "warn" }]);
  assert.deepEqual(by.music, [{ t: 3, until: null, label: "phách", kind: "info" }]);
  assert.deepEqual(by.voice, []);
  assert.deepEqual(by.sfx, []);
  assert.deepEqual(errors, ["hỏng"]);
});

// The B-roll lane's drop: where the dropped file ends up in the project.

test("assetPath keeps project files in place, copies workspace footage without overwriting, refuses the rest", () => {
  const root = mkdtempSync(join(tmpdir(), "ms-broll-"));
  try {
    const dir = join(root, "p");
    mkdirSync(join(dir, "assets", "img"), { recursive: true });
    mkdirSync(join(root, "footage", "raw"), { recursive: true });
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(dir, "assets", "img", "a.png"), "a");
    writeFileSync(join(root, "footage", "raw", "clip.mp4"), "v1");
    writeFileSync(join(root, "elsewhere", "x.mp4"), "x");
    writeFileSync(join(root, "footage", "raw", "notes.txt"), "n");
    symlinkSync(join(root, "elsewhere", "x.mp4"), join(root, "footage", "raw", "link.mp4"));
    assert.deepEqual(assetPath(root, dir, join(dir, "assets", "img", "a.png")), { rel: "assets/img/a.png", copied: false });
    assert.deepEqual(assetPath(root, dir, join(root, "footage", "raw", "clip.mp4")), { rel: "assets/footage/clip.mp4", copied: true });
    assert.deepEqual(assetPath(root, dir, join(root, "footage", "raw", "clip.mp4")), { rel: "assets/footage/clip-2.mp4", copied: true });
    assert.equal(readFileSync(join(dir, "assets", "footage", "clip-2.mp4"), "utf8"), "v1");
    const status = (p) => { try { assetPath(root, dir, p); return 200; } catch (e) { return e.status; } };
    assert.equal(status(join(root, "elsewhere", "x.mp4")), 403);
    assert.equal(status(join(root, "footage", "raw", "link.mp4")), 403, "a symlink out of footage/ is followed and refused");
    assert.equal(status(join(root, "footage", "raw", "notes.txt")), 400);
    assert.equal(status("relative.mp4"), 400);
    assert.equal(status(join(root, "footage", "nope.mp4")), 404);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("latestRender picks the newest renders/ or demo/ MP4; mediaStamps keys the files project.json uses", () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-render-"));
  try {
    assert.equal(latestRender(dir), null);
    mkdirSync(join(dir, "renders")); mkdirSync(join(dir, "demo")); mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "renders", "a.mp4"), "aa");
    writeFileSync(join(dir, "demo", "b.mp4"), "bbb");
    writeFileSync(join(dir, "renders", "empty.mp4"), "");
    utimesSync(join(dir, "renders", "a.mp4"), new Date(1000), new Date(1000));
    utimesSync(join(dir, "demo", "b.mp4"), new Date(2000), new Date(2000));
    assert.deepEqual(latestRender(dir), { path: "demo/b.mp4", mtime: 2000, size: 3 });
    writeFileSync(join(dir, "assets", "v.mp3"), "1234");
    const st = mediaStamps(dir, { lines: [{ file: "assets/v.mp3" }], music: [{ file: "assets/missing.mp3" }], shots: [{ assets: ["../x"] }] });
    assert.deepEqual(Object.keys(st), ["assets/v.mp3"]);
    assert.equal(st["assets/v.mp3"].size, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R switches the edge drag between Ripple and Roll", () => {
  assert.equal(keyAction({ key: "r", code: "KeyR" }), "mode");
  assert.equal(keyAction({ key: "r", code: "KeyR" }, { inField: true }), null);
  assert.equal(keyAction({ key: "r", code: "KeyR", metaKey: true }), null, "Cmd+R stays the browser's reload");
});
