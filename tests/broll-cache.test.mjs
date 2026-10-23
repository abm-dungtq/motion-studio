import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settingsOf } from "../lib/config.mjs";
import { onExec } from "../lib/broll/ffmpeg.mjs";
import { hashFile, readJson } from "../lib/broll/hash.mjs";
import { enqueueIndex, readClip, runIndex, sources, VERSIONS } from "../lib/broll/index.mjs";
import { colorClip, fakeVision } from "./broll-fake.mjs";

// Counts ffmpeg/ffprobe runs of the index; sheet builds (xstack) are listed apart from decodes.
function counter() {
  const runs = [];
  const off = onExec(({ bin, args }) => runs.push({ bin, args: args.join(" ") }));
  return { runs, off, decodes: () => runs.filter((r) => !r.args.includes("xstack")).length, sheets: () => runs.filter((r) => r.args.includes("xstack")).length };
}

test("vision calls = ceil(sheets / 4); a second run decodes nothing and calls nothing; a copy hits the same hash; a new describe version re-runs only captions", async () => {
  const f = fakeVision();
  try {
    const root = join(f.dir, "ws");
    mkdirSync(join(root, "footage", "raw"), { recursive: true });
    mkdirSync(join(root, "demo"), { recursive: true });
    const a = colorClip(join(root, "footage", "raw", "a.mp4"), [["red", 2], ["blue", 2], ["green", 2]]);
    colorClip(join(root, "footage", "raw", "b.mp4"), [["yellow", 3]]);
    colorClip(join(root, "footage", "raw", "c.mp4"), [["white", 1]]);
    colorClip(join(root, "demo", "skip.mp4"), [["black", 1]]);
    assert.deepEqual(sources({ root }).map((p) => p.split("/").at(-1)), ["a.mp4", "b.mp4", "c.mp4"], "demo/ is skipped");

    const logs = [];
    const c1 = counter();
    const r1 = await runIndex({ root, env: f.env, log: (l) => logs.push(l) });
    c1.off();
    // a: 3 shots × 3 frames, b: 1 × 3, c: 1 × 1 → 13 cells → 2 sheets → 1 call.
    assert.equal(r1.clips, 3);
    assert.equal(r1.shots_pending, 5);
    assert.equal(c1.sheets(), 2);
    assert.equal(r1.calls, Math.ceil(c1.sheets() / 4));
    assert.equal(f.calls(), 1);
    assert.equal(r1.described, 5);
    assert.equal(r1.describe_errors, 0);
    const shaA = (await hashFile(a, { env: f.env })).sha256;
    const clip = readClip(shaA, f.env);
    assert.deepEqual(clip.scenes.map((s) => s.i), [1, 2, 3]);
    assert.equal(clip.describe.length, 3);
    assert.equal(clip.describe[0].caption_vi, "Sóng biển vỗ vào bờ cát");
    assert.equal(clip.meta.probe.audio, false);
    assert.ok(existsSync(join(clip.dir, "frames", "s3-3.jpg")));
    assert.ok(r1.receipt === undefined || typeof r1.receipt === "string");

    const c2 = counter();
    const logs2 = [];
    const r2 = await runIndex({ root, env: f.env, log: (l) => logs2.push(l) });
    c2.off();
    assert.equal(c2.runs.length, 0, `no ffmpeg or ffprobe on a second run: ${c2.runs.map((r) => r.args).join("\n")}`);
    assert.equal(f.calls(), 1, "no vision call on a second run");
    assert.equal(r2.calls, 0);
    assert.equal(logs2.filter((l) => /đã có trong cache/.test(l)).length, 3);

    const copy = join(root, "footage", "copy-of-a.mp4");
    copyFileSync(a, copy);
    const c3 = counter();
    const r3 = await runIndex({ root, env: f.env, log: () => {} });
    c3.off();
    assert.equal(c3.runs.length, 0);
    assert.equal(f.calls(), 1);
    assert.equal(r3.clips, 3, "the copy is the same clip");
    const seen = readClip(shaA, f.env).meta.seen_paths;
    assert.equal(seen.length, 2);
    assert.ok(seen.some((p) => p.endsWith("copy-of-a.mp4")) && seen.some((p) => p.endsWith("/a.mp4")));

    const c4 = counter();
    const r4 = await runIndex({ root, env: f.env, log: () => {}, versions: { ...VERSIONS, describe: VERSIONS.describe + 1 } });
    c4.off();
    assert.equal(c4.decodes(), 0, "only captions run again");
    assert.equal(c4.sheets(), 2);
    assert.equal(f.calls(), 2);
    assert.equal(r4.described, 5);
  } finally { f.rm(); }
});

test("vision off builds no sheet and calls nothing; max_calls stops before the budget is passed", async () => {
  const f = fakeVision({ vars: { state: { broll: { vision: false } } } });
  try {
    const root = join(f.dir, "ws");
    mkdirSync(join(root, "footage"), { recursive: true });
    colorClip(join(root, "footage", "a.mp4"), [["red", 2], ["blue", 2], ["green", 2]]);
    const c = counter();
    const r = await runIndex({ root, env: f.env, log: () => {} });
    c.off();
    assert.equal(c.sheets(), 0);
    assert.equal(f.calls(), 0);
    assert.equal(r.left, 3);
    // Settings survive a restart of Studio (bin/motion-studio.mjs keeps only SETTINGS keys).
    assert.deepEqual(settingsOf({ broll: { vision: false }, pid: 1 }), { broll: { vision: false } });

    const g = fakeVision();
    try {
      const root2 = join(g.dir, "ws");
      mkdirSync(join(root2, "footage"), { recursive: true });
      colorClip(join(root2, "footage", "a.mp4"), [["red", 2], ["blue", 2], ["green", 2]]);
      const r0 = await runIndex({ root: root2, env: g.env, log: () => {}, maxCalls: 0 });
      assert.equal(g.calls(), 0);
      assert.equal(r0.left, 3);
      assert.equal(r0.calls, 0);
    } finally { g.rm(); }
  } finally { f.rm(); }
});

test("after a register only the offline steps run; broll.auto false queues nothing", async () => {
  const f = fakeVision();
  try {
    mkdirSync(join(f.dir, "ws"), { recursive: true });
    const a = colorClip(join(f.dir, "ws", "a.mp4"), [["red", 2], ["blue", 2]]);
    await enqueueIndex(a, { env: f.env });
    const c = readClip((await hashFile(a, { env: f.env })).sha256, f.env);
    assert.equal(c.scenes.length, 2);
    assert.deepEqual(c.describe, []);
    assert.equal(f.calls(), 0, "captions wait for a click");
    const junk = join(f.dir, "ws", "fake.mp4");
    writeFileSync(junk, "not a video");
    await enqueueIndex(junk, { env: f.env });
    assert.deepEqual(Object.keys(readJson(join(f.env.MOTION_STUDIO_BROLL_CACHE, "hashes.json"), {})).filter((k) => k.includes("fake.mp4")), [], "an unreadable file leaves no trace");
  } finally { f.rm(); }
  const g = fakeVision({ vars: { state: { broll: { auto: false } } } });
  try { assert.equal(enqueueIndex(join(g.dir, "x.mp4"), { env: g.env }), null); } finally { g.rm(); }
});
