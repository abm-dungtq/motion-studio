import { test } from "node:test";
import assert from "node:assert/strict";
import { beatTimes, eventStart, keyAction, musicDragOps, nextSfxId, shotAt, snap, snapTargets, splitOps } from "../public/timeline-edit.js";

const two = {
  shots: [{ id: "s1", name: "Mở", start: 0, end: 4 }, { id: "s2", name: "", start: 4, end: 8 }],
  lines: [{ id: "vo-01", shot: "s1", start: 2.5, duration: 1 }, { id: "vo-02", shot: "s2", start: 4.2, duration: 2 }],
  events: [{ id: "sfx-a", shot: "s1", offset: 3, sound: "assets/sfx/a.mp3" }, { id: "sfx-b", shot: "s1", offset: 0.5, sound: "assets/sfx/b.mp3" }],
  duration: 8,
};

test("shotAt finds the holder, the video's end belongs to the last shot, outside is null", () => {
  assert.equal(shotAt(two, 0).id, "s1");
  assert.equal(shotAt(two, 3.99).id, "s1");
  assert.equal(shotAt(two, 4).id, "s2");
  assert.equal(shotAt(two, 8).id, "s2");
  assert.equal(shotAt(two, 8.5), null);
  assert.equal(shotAt(two, -1), null);
});

test("eventStart is the shot start plus the offset, to the millisecond", () => {
  assert.equal(eventStart(two, two.events[0]), 3);
  assert.equal(eventStart({ shots: [{ id: "s", start: 4.5, end: 9 }] }, { shot: "s", offset: 3.06 }), 7.56);
});

test("splitOps cuts a shot into two and moves what lies after the cut, in order", () => {
  const r = splitOps(two, "s1", 2);
  assert.equal(r.error, null);
  assert.equal(r.cut, 2);
  assert.deepEqual(r.straddle, []);
  assert.deepEqual(r.ops, [
    { op: "resize_shot", id: "s1", duration: 2 },
    { op: "add_shot", after: "s1", duration: 2, name: "Mở (sau)" },
    { op: "move_line", id: "vo-01", start: 2.5 },
    { op: "move_event", id: "sfx-a", start: 3 },
  ]);
});

test("splitOps names an unnamed shot by its id and reports a line across the cut", () => {
  const r = splitOps(two, "s2", 5.5);
  assert.equal(r.ops[1].name, "s2 (sau)");
  assert.deepEqual(r.straddle, ["vo-02"]);
  assert.equal(r.ops.length, 2);
});

test("splitOps refuses a cut too close to an edge or outside the shot", () => {
  assert.equal(splitOps(two, "s1", 0.3).error, "Điểm cắt phải cách hai mép shot ít nhất 0,5 giây");
  assert.equal(splitOps(two, "s1", 3.7).error, "Điểm cắt phải cách hai mép shot ít nhất 0,5 giây");
  assert.equal(splitOps(two, "s1", 5).error, "Đặt playhead trong shot cần cắt");
  assert.equal(splitOps(two, "nope", 1).error, "Đặt playhead trong shot cần cắt");
  assert.deepEqual(splitOps(two, "s1", 0.3).ops, []);
});

test("splitOps rounds the first part to tenths and keeps the total length", () => {
  const m = { shots: [{ id: "s3", name: "Ba", start: 4.5, end: 8.4 }], lines: [], events: [] };
  const r = splitOps(m, "s3", 6.05);
  assert.equal(r.ops[0].duration, 1.6);
  assert.equal(r.ops[1].duration, 2.3);
  assert.equal(Math.round((r.ops[0].duration + r.ops[1].duration) * 1000) / 1000, 3.9);
  assert.equal(r.cut, 6.1);
});

const bed = { id: "bgm", file: "assets/bgm/bgm.mp3", start: 1, end: 9, gain: 1 };

test("musicDragOps move shifts start and end together and stays inside the video", () => {
  assert.deepEqual(musicDragOps(bed, "move", 2, 12), { op: "update_music", id: "bgm", start: 3, end: 11 });
  assert.deepEqual(musicDragOps(bed, "move", 5, 12), { op: "update_music", id: "bgm", start: 4, end: 12 });
  assert.deepEqual(musicDragOps(bed, "move", -3, 12), { op: "update_music", id: "bgm", start: 0, end: 8 });
  assert.equal(musicDragOps(bed, "move", 0, 12), null);
});

test("musicDragOps trim-start moves start and skips as much of the file's head, within limits", () => {
  assert.deepEqual(musicDragOps(bed, "trim-start", 1.5, 12), { op: "update_music", id: "bgm", start: 2.5, media_start: 1.5 });
  assert.deepEqual(musicDragOps({ ...bed, media_start: 2 }, "trim-start", -5, 12), { op: "update_music", id: "bgm", start: 0, media_start: 1 });
  assert.deepEqual(musicDragOps(bed, "trim-start", 20, 12), { op: "update_music", id: "bgm", start: 8.5, media_start: 7.5 });
});

test("musicDragOps trim-end moves end, at least 0.5 s after start and not past the video", () => {
  assert.deepEqual(musicDragOps(bed, "trim-end", -2, 12), { op: "update_music", id: "bgm", end: 7 });
  assert.deepEqual(musicDragOps(bed, "trim-end", -20, 12), { op: "update_music", id: "bgm", end: 1.5 });
  assert.deepEqual(musicDragOps(bed, "trim-end", 20, 12), { op: "update_music", id: "bgm", end: 12 });
  assert.equal(musicDragOps(bed, "nope", 1, 12), null);
});

test("musicDragOps handles end null (runs to the video's end) without NaN", () => {
  const open = { id: "bgm", start: 0, end: null, gain: 1 };
  const all = ["move", "trim-start", "trim-end"].flatMap((mode) => [-3, 1, 30].map((dt) => musicDragOps(open, mode, dt, 12)));
  for (const op of all) for (const v of Object.values(op ?? {})) assert.ok(!Number.isNaN(v));
  assert.deepEqual(musicDragOps(open, "trim-end", -2, 12), { op: "update_music", id: "bgm", end: 10 });
  assert.equal(musicDragOps(open, "trim-end", 3, 12), null);
  assert.deepEqual(musicDragOps({ ...open, start: 2 }, "move", -1, 12), { op: "update_music", id: "bgm", start: 1 });
  assert.deepEqual(musicDragOps(open, "trim-start", 2, 12), { op: "update_music", id: "bgm", start: 2, media_start: 2 });
  // A bed with an end dragged to the video's end keeps that end as a number.
  assert.deepEqual(musicDragOps({ ...open, end: 10 }, "trim-end", 5, 12), { op: "update_music", id: "bgm", end: 12 });
});

test("nextSfxId takes the smallest free number", () => {
  assert.equal(nextSfxId([]), "sfx-1");
  assert.equal(nextSfxId(["sfx-1", "sfx-2", "sfx-4", "vo-01"]), "sfx-3");
});

const key = (k, extra = {}) => ({ key: k, code: extra.code ?? (/^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : ""), metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra });

test("keyAction maps every shortcut", () => {
  const cases = [
    [key(" ", { code: "Space" }), "toggle"], [key("j"), "back1"], [key("k"), "pause"], [key("l"), "play"],
    [key("ArrowLeft"), "prevFrame"], [key("ArrowRight"), "nextFrame"],
    [key("ArrowLeft", { shiftKey: true }), "back1"], [key("ArrowRight", { shiftKey: true }), "fwd1"],
    [key("Home"), "start"], [key("End"), "end"],
    [key("s"), "split"], [key("Delete"), "delete"], [key("Backspace"), "delete"], [key("n"), "snap"],
    [key("z", { metaKey: true }), "undo"], [key("z", { ctrlKey: true }), "undo"],
    [key("z", { metaKey: true, shiftKey: true }), "redo"], [key("Z", { ctrlKey: true, shiftKey: true }), "redo"], [key("y", { ctrlKey: true }), "redo"],
    [key("="), "zoomIn"], [key("+", { shiftKey: true }), "zoomIn"], [key("-"), "zoomOut"], [key("Z", { shiftKey: true }), "fit"],
  ];
  for (const [e, want] of cases) assert.equal(keyAction(e), want, `${e.key} ${JSON.stringify(e)}`);
});

test("keyAction ignores other keys, modifiers it does not own, Alt, and every key in a field", () => {
  for (const e of [key("a"), key("s", { metaKey: true }), key("s", { shiftKey: true }), key("1", { altKey: true, code: "Digit1" }),
    key("s", { altKey: true }), key("=", { metaKey: true }), key("y", { metaKey: true }), key("Enter")]) assert.equal(keyAction(e), null, JSON.stringify(e));
  for (const e of [key("s"), key(" ", { code: "Space" }), key("z", { metaKey: true }), key("z", { metaKey: true, shiftKey: true }), key("Delete")]) {
    assert.equal(keyAction(e, { inField: true }), null);
  }
  // The physical key counts, so a non-Latin layout still splits with S.
  assert.equal(keyAction(key("ы", { code: "KeyS" })), "split");
});

const snapM = {
  shots: [{ id: "s1", start: 0, end: 1 }, { id: "s2", start: 1, end: 2 }],
  lines: [{ id: "vo-01", shot: "s1", start: 0.3, duration: 0.4 }],
  events: [{ id: "sfx-a", shot: "s2", offset: 0.62 }],
  duration: 2,
};
const snapT = { fps: 30, duration: 2, scenes: { s1: { start: 0, end: 1, lines: [{ id: "vo-01", words: [["Một", 0.35, 0.5], ["hai", 0.55, 0.69]] }] } }, beat0: 0, beatLen: 0.5, kick: [], drops: [] };

test("snapTargets lists every kind, sorted and without duplicates", () => {
  const ts = snapTargets(snapM, snapT, 0.9);
  assert.deepEqual(ts.map((x) => x.t), [0, 0.3, 0.35, 0.5, 0.55, 0.7, 0.9, 1, 1.5, 1.62, 2]);
  assert.deepEqual(new Set(ts.map((x) => x.kind)), new Set(["playhead", "shot", "line", "event", "beat", "word"]));
  // 0, 1 and 2 are both shot edges and beats: the shot wins and the beat is dropped.
  assert.equal(ts.find((x) => x.t === 1).kind, "shot");
  assert.equal(ts.find((x) => x.t === 0.5).kind, "beat");
  assert.equal(ts.find((x) => x.t === 1.62).id, "sfx-a");
});

test("snapTargets works without TIMING, without a playhead, and skips the dragged block", () => {
  const ts = snapTargets(snapM, null, null, (x) => x.id === "sfx-a");
  assert.deepEqual(ts.map((x) => `${x.kind}@${x.t}`), ["shot@0", "line@0.3", "line@0.7", "shot@1", "shot@2"]);
  // A skipped target does not hide another target at the same time.
  const beatAtEvent = { ...snapT, kick: [1.62] };
  assert.equal(snapTargets(snapM, beatAtEvent, null, (x) => x.id === "sfx-a").find((x) => x.t === 1.62).kind, "beat");
});

test("beatTimes adds kicks to the grid and has no beats when beatLen is 0", () => {
  assert.deepEqual(beatTimes({ beat0: 0.25, beatLen: 1, kick: [0.6] }, 2.5), [0.25, 0.6, 1.25, 2.25]);
  assert.deepEqual(beatTimes({ beat0: 0, beatLen: 0, kick: [] }, 10), []);
  assert.deepEqual(beatTimes(null, 10), []);
});

test("snap pulls to the nearest target within 8 px and leaves a far time alone", () => {
  const ts = snapTargets(snapM, snapT, 0.9);
  assert.deepEqual(snap(1.02, ts, 100), { t: 1, kind: "shot" });
  assert.deepEqual(snap(1.2, ts, 100), { t: 1.2, kind: null });
  assert.deepEqual(snap(1.02, ts, 100, 1), { t: 1.02, kind: null });
  assert.deepEqual(snap(0.53, ts, 100), { t: 0.55, kind: "word" });
});
