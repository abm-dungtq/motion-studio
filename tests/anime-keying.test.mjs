import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, ffprobeBin, filterChain, key, measure, parseColor, spillOf } from "../lib/anime/keying.mjs";
import * as prompts from "../lib/anime/prompts.mjs";

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "ms-anime-key-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

// A 320×180 PNG of one flat colour with a red disc of radius 40 in the middle.
function disc(file, [r, g, b]) {
  const inside = "lt(hypot(X-160,Y-90),40)";
  const ff = spawnSync(ffmpegBin(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x180,format=rgb24",
    "-vf", `geq=r='if(${inside},230,${r})':g='if(${inside},20,${g})':b='if(${inside},20,${b})'`, "-frames:v", "1", file]);
  assert.equal(ff.status, 0, String(ff.stderr));
  return file;
}
// RGBA of one pixel.
function pixel(file, x, y) {
  const r = spawnSync(ffmpegBin(), ["-v", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  assert.equal(r.status, 0, String(r.stderr));
  return [...r.stdout.subarray(0, 4)];
}
const probe = (file) => spawnSync(ffprobeBin(), ["-v", "error", "-show_entries", "stream=pix_fmt,width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();

test("measure finds the real background colour of a blue screen and picks blue despill", async () => {
  const f = disc(join(dir, "blue.png"), [0x00, 0x4c, 0xfe]);
  const m = await measure(f);
  const want = parseColor("#004CFE");
  m.rgb.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 4, `channel ${i}: ${v} vs ${want[i]}`));
  assert.equal(m.spill, "blue");
  assert.match(m.color, /^0x[0-9A-F]{6}$/);
});

test("key makes the corners transparent and keeps the red disc opaque and red", async () => {
  const f = disc(join(dir, "blue2.png"), [0x00, 0x4c, 0xfe]);
  const m = await measure(f);
  const out = join(dir, "keyed.png");
  const k = await key(f, out, { color: m.color, width: 640, spill: m.spill });
  assert.match(k.filter, /scale=640:-2:flags=lanczos,chromakey=0x004CFE:0\.18:0\.06,despill=type=blue/);
  assert.equal(probe(out), "640,360,rgba");
  assert.equal(pixel(out, 0, 0)[3], 0, "corner is transparent");
  assert.equal(pixel(out, 639, 359)[3], 0, "far corner is transparent");
  const c = pixel(out, 320, 180);
  assert.equal(c[3], 255, "centre is opaque");
  [230, 20, 20].forEach((v, i) => assert.ok(Math.abs(c[i] - v) <= 10, `centre channel ${i}: ${c[i]}`));
  await assert.rejects(key(f, out, { color: m.color }), (e) => e.status === 409, "an existing file is never written over");
});

test("despill only at the rim keeps the inside colour", async () => {
  const f = disc(join(dir, "blue3.png"), [0x00, 0x47, 0xff]);
  const out = join(dir, "edge.png");
  const k = await key(f, out, { color: "#0047FF", edge: true });
  assert.match(k.filter, /alphaextract,erosion/);
  assert.equal(pixel(out, 0, 0)[3], 0);
  const c = pixel(out, 160, 90);
  assert.equal(c[3], 255);
  [230, 20, 20].forEach((v, i) => assert.ok(Math.abs(c[i] - v) <= 10, `centre channel ${i}: ${c[i]}`));
});

test("a green screen asks for green despill; a neutral one for none", async () => {
  const f = disc(join(dir, "green.png"), [0x10, 0xd0, 0x20]);
  assert.equal((await measure(f)).spill, "green");
  assert.equal(spillOf([200, 200, 200]), null);
  assert.doesNotMatch(filterChain({ color: "#C8C8C8" }), /despill/);
  assert.throws(() => filterChain({ color: "blue" }), /không hợp lệ/);
  assert.throws(() => filterChain({ color: "#0047FF", sim: 3 }), /sim/);
});

test("measure reports an unreadable file instead of guessing a colour", async () => {
  const f = join(dir, "broken.png");
  writeFileSync(f, "not a png");
  await assert.rejects(measure(f), /ffprobe không đọc được|không đo được màu nền/);
});

test("prompts keep the frame, name the key colour and refuse an empty change", () => {
  assert.match(prompts.edit("mouth half open"), /Keep EXACTLY the same character.*\(#0047FF\).*Change ONLY: mouth half open/);
  assert.match(prompts.pose("sword raised", { keyColor: "#004CFE" }), /blue \(#004CFE\).*reference sheet.*new pose: sword raised/);
  const s = prompts.sheet({ name: "Zoro", description: "green hair, three swords", palette: ["#2E7D32"] });
  assert.match(s, /FRONT.*THREE-QUARTER.*SIDE PROFILE.*BACK/s);
  assert.match(s, /No text, no name label/);
  assert.throws(() => prompts.edit("  "), (e) => e.status === 400);
});
