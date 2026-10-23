import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProvider } from "../lib/provider.mjs";
import { rippleLineOps, rollOps, rollRange } from "../public/timeline-edit.js";

const r3 = (x) => Math.round(x * 1000) / 1000;

// The real gateway applies the ops, so the roll is checked against what the provider does.
const P = await loadProvider();
const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));

function project() {
  const root = mkdtempSync(join(tmpdir(), "ms-roll-"));
  const dir = join(root, "p");
  cpSync(FIXTURE, dir, { recursive: true });
  return { root, dir };
}

test("rollOps moves only the cut: the video keeps its length, the shots after the pair stay", () => {
  const { root, dir } = project();
  try {
    const m = P.manifest.load(dir);
    const [a, b, c] = m.shots;
    const r = rollOps(m, a.id, 0.7);
    assert.equal(r.error, null);
    assert.deepEqual(r.ops.map((o) => o.op), ["resize_shot", "resize_shot"]);
    const out = P.gateway.patch(dir, { actor: "human", base: m.version, ops: r.ops });
    assert.equal(out.code, 0, out.error);
    const n = P.manifest.load(dir);
    assert.equal(n.duration, m.duration);
    assert.equal(n.shots[0].end, r3(a.end + 0.7));
    assert.equal(n.shots[1].start, r3(b.start + 0.7));
    assert.equal(n.shots[1].end, b.end);
    assert.deepEqual([n.shots[2].start, n.shots[2].end], [c.start, c.end]);
    // Backwards too.
    const back = rollOps(n, b.id, -0.4);
    assert.equal(P.gateway.patch(dir, { actor: "human", base: n.version, ops: back.ops }).code, 0);
    const k = P.manifest.load(dir);
    assert.equal(k.duration, m.duration);
    assert.equal(k.shots[1].end, r3(b.end - 0.4));
    assert.equal(k.shots[2].start, r3(c.start - 0.4));
    assert.equal(k.shots[2].end, c.end);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rollOps refuses a roll that leaves a shot under 0.5 s, and the last shot", () => {
  const m = { shots: [{ id: "s1", start: 0, end: 2 }, { id: "s2", start: 2, end: 3 }], lines: [], duration: 3 };
  assert.match(rollOps(m, "s1", 0.6).error, /0,5 giây/);
  assert.match(rollOps(m, "s1", -1.6).error, /0,5 giây/);
  assert.equal(rollOps(m, "s1", 0.5).error, null, "exactly 0.5 s left is allowed");
  assert.match(rollOps(m, "s2", 0.1).error, /shot kế tiếp/);
  assert.match(rollOps(m, "nope", 0.1).error, /Không có shot/);
  assert.deepEqual(rollOps(m, "s1", 0), { ops: [], error: null });
  assert.deepEqual(rollRange(m, "s1"), [-1.5, 0.5]);
  assert.equal(rollRange(m, "s2"), null);
});

const lines = {
  shots: [{ id: "s1", start: 0, end: 6 }, { id: "s2", start: 6, end: 12 }],
  lines: [
    { id: "a", shot: "s1", start: 0.5, duration: 1 },
    { id: "b", shot: "s1", start: 2, duration: 1 },
    { id: "c", shot: "s1", start: 4, duration: 1 },
    { id: "d", shot: "s2", start: 7, duration: 1 },
  ],
  duration: 12,
};

test("rippleLineOps moves the line and the later lines of its shot by the same delta", () => {
  const r = rippleLineOps(lines, "b", 2.6);
  assert.equal(r.error, null);
  assert.deepEqual(r.ops, [{ op: "move_line", id: "b", start: 2.6 }, { op: "move_line", id: "c", start: 4.6 }]);
  // Earlier lines of the shot and lines of other shots stay.
  assert.ok(!r.ops.some((o) => o.id === "a" || o.id === "d"));
  const back = rippleLineOps(lines, "a", 0.2);
  assert.deepEqual(back.ops.map((o) => [o.id, o.start]), [["a", 0.2], ["b", 1.7], ["c", 3.7]]);
});

test("rippleLineOps refuses to push a line before 0 and is empty for no move", () => {
  assert.match(rippleLineOps(lines, "a", -0.1).error, /trước 0/);
  assert.deepEqual(rippleLineOps(lines, "b", 2), { ops: [], error: null });
  assert.match(rippleLineOps(lines, "zz", 1).error, /Không có câu/);
});

test("the shift-ripple patch is accepted by the gateway and leaves the other shot's line alone", () => {
  const { root, dir } = project();
  try {
    const m = P.manifest.load(dir);
    const r = rippleLineOps(m, "vo-01", 2.8);
    const out = P.gateway.patch(dir, { actor: "human", base: m.version, ops: r.ops });
    assert.equal(out.code, 0, out.error);
    assert.equal(P.manifest.load(dir).lines[0].start, 2.8);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
