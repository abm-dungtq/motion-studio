import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrompt, cleanItem, mapAnswer } from "../lib/broll/describe.mjs";
import { FFMPEG } from "../lib/broll/ffmpeg.mjs";
import { buildSheet, writeLabels } from "../lib/broll/frames.mjs";
import { hashFile } from "../lib/broll/hash.mjs";
import { readClip, runIndex } from "../lib/broll/index.mjs";
import { colorClip, fakeVision } from "./broll-fake.mjs";

const sheets = [{ groups: [{ id: "A:1", first: 1, last: 3 }, { id: "A:2", first: 4, last: 4 }, { id: "B:1", first: 5, last: 7 }] }, { groups: [{ id: "C:4", first: 1, last: 3 }] }];

test("an answer maps back by sheet and cell; any cell of a shot counts, bad items are skipped", () => {
  const item = (sheet, cell, caption_vi = "Biển") => ({ sheet, cell, caption_vi, tags: ["biển"], shot_type: "toàn", camera: "bay", quality: "tốt" });
  const { found, valid } = mapAnswer({ items: [item(1, 1), item(1, 4, "Rừng"), item(1, 6, "Phố"), item(2, 2, "Núi"), item(2, 9), { sheet: 1, cell: 8 }, item(3, 1)] }, sheets);
  assert.equal(valid, 4);
  assert.deepEqual([...found.keys()], ["A:1", "A:2", "B:1", "C:4"]);
  assert.equal(found.get("B:1").caption_vi, "Phố");
  assert.equal(found.get("A:1").camera, null, "a value outside the enum is dropped");
  assert.equal(cleanItem({ sheet: 1, cell: 1, caption_vi: "x" }), null, "tags are required");
  const p = buildPrompt(sheets);
  assert.match(p, /Ảnh 1, ô 1–3: một cảnh \(3 khung/);
  assert.match(p, /Ảnh 1, ô 4: một cảnh \(1 khung\)/);
  assert.match(p, /Ảnh 2, ô 1–3/);
});

test("captions land on the right (clip, shot); the CLI never sees a real path", async () => {
  const f = fakeVision();
  try {
    const root = join(f.dir, "ws-PRIVATE-footage");
    mkdirSync(join(root, "footage"), { recursive: true });
    const a = colorClip(join(root, "footage", "secret-a.mp4"), [["red", 2], ["blue", 2]]);
    const b = colorClip(join(root, "footage", "secret-b.mp4"), [["green", 1]]);
    const r = await runIndex({ root, env: f.env, log: () => {} });
    assert.equal(r.calls, 1);
    const ca = readClip((await hashFile(a, { env: f.env })).sha256, f.env);
    const cb = readClip((await hashFile(b, { env: f.env })).sha256, f.env);
    assert.deepEqual(ca.describe.map((d) => d.shot), [1, 2]);
    assert.deepEqual(cb.describe.map((d) => d.shot), [1]);
    assert.ok(ca.describe.every((d) => d.caption_vi && !d.describe_error));
    const [call] = f.lines();
    assert.equal(call.cli, "agy");
    const seen = `${call.prompt}\n${call.args.join(" ")}`;
    assert.doesNotMatch(seen, /PRIVATE|secret-|\.mp4/);
    assert.match(seen, /ms-agent-vision-[^/]+\/img-1\.jpg/, "the images are copies in the run's temp folder");
  } finally { f.rm(); }
});

test("a wrong answer is asked once of the next agent, then the shots get describe_error", async () => {
  const f = fakeVision({ describe: "junk" });
  try {
    const root = join(f.dir, "ws");
    mkdirSync(join(root, "footage"), { recursive: true });
    const a = colorClip(join(root, "footage", "a.mp4"), [["red", 2], ["blue", 2]]);
    const r = await runIndex({ root, env: f.env, log: () => {} });
    assert.deepEqual(f.lines().map((l) => l.cli), ["agy", "claude"]);
    assert.equal(r.calls, 2);
    assert.equal(r.describe_errors, 2);
    const c = readClip((await hashFile(a, { env: f.env })).sha256, f.env);
    assert.ok(c.describe.every((d) => /sai schema/.test(d.describe_error)));
    // Errors are not retried by the next run (that would spend quota again).
    await runIndex({ root, env: f.env, log: () => {} });
    assert.equal(f.lines().length, 2);
  } finally { f.rm(); }
});

test("cells carry different number labels", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-broll-labels-"));
  try {
    const clip = colorClip(join(dir, "g.mp4"), [["gray", 1]]);
    const frame = join(dir, "f.jpg");
    execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", clip, "-frames:v", "1", frame]);
    const out = join(dir, "sheet.jpg");
    const r = await buildSheet([frame, frame], writeLabels(join(dir, "labels")), out);
    assert.equal(r.ok, true, r.error);
    const crop = (x) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", out, "-vf", `crop=44:56:${x}:0,format=gray`, "-f", "rawvideo", "-"]);
    const one = crop(0), two = crop(320), body = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", out, "-vf", "crop=44:56:100:100,format=gray", "-f", "rawvideo", "-"]);
    assert.notDeepEqual(one, two, "label 1 differs from label 2");
    assert.ok(Math.max(...one) > 200 && Math.max(...body) < 200, "a white digit on the label, plain frame elsewhere");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
