// lib/broll/frames.mjs — keyframes per shot and the contact sheets sent to the vision agent.
// A shot of 1.5 s or more gives 3 frames (25 %, 50 %, 75 %), a shorter one gives 1 (50 %); each
// frame is a JPEG with a 320 px long edge, kept in the clip's cache as s<shot>-<k>.jpg.
// A sheet is 3×3 cells of 320×180 (960×540). Shots are packed across clips, first fit, as groups
// of 1 or 3 cells; a group never spans two sheets, so every full sheet holds at least 3 shots.
// Cells are numbered 1–9 in the top-left corner. This ffmpeg has no drawtext (no freetype), so the
// numbers are small PPM images drawn here from a 5×7 bitmap font and overlaid, and the grid is
// built with xstack; empty cells are black.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg, tail } from "./ffmpeg.mjs";

export const VERSION = 1;
export const CELL = { w: 320, h: 180 };
export const PER_SHEET = 9;
export const LONG_SHOT = 1.5;
const BATCH = 24; // frames per ffmpeg run

export const frameName = (shot, k) => `s${shot}-${k}.jpg`;

// [{ shot, k, t, name }] for every frame of shots (pure).
export function framePlan(shots, duration = Infinity) {
  const out = [];
  for (const s of shots) {
    const len = s.end - s.start;
    const at = len >= LONG_SHOT ? [0.25, 0.5, 0.75] : [0.5];
    at.forEach((p, n) => {
      const t = Math.max(0, Math.min(s.start + len * p, duration - 0.05));
      out.push({ shot: s.i, k: n + 1, t: Math.round(t * 1000) / 1000, name: frameName(s.i, n + 1) });
    });
  }
  return out;
}

// One ffmpeg run that seeks to each time and writes one JPEG per item into dir (pure).
export function frameArgs(file, items, dir) {
  const args = [];
  for (const it of items) args.push("-ss", String(it.t), "-i", file);
  items.forEach((it, n) => args.push("-map", `${n}:v:0`, "-frames:v", "1", "-vf", "scale=w=320:h=320:force_original_aspect_ratio=decrease", "-q:v", "4", join(dir, it.name)));
  return args;
}

export async function extractFrames(file, items, dir, { signal } = {}) {
  mkdirSync(dir, { recursive: true });
  for (let n = 0; n < items.length; n += BATCH) {
    const r = await ffmpeg(frameArgs(file, items.slice(n, n + BATCH), dir), { timeout: 10 * 60000, signal });
    if (r.code !== 0) return { ok: false, error: `keyframe: ${tail(r)}` };
  }
  return { ok: true };
}

// ---- sheets -----------------------------------------------------------------------------------
// groups: [{ id, frames: [file] }] (1 to 3 frames each), in the order to pack. Returns
// [{ cells: [file], groups: [{ id, first, last }] }] with cells numbered from 1 (pure).
export function packSheets(groups) {
  const sheets = [];
  for (const g of groups) {
    const n = g.frames.length;
    if (n < 1 || n > 3) throw new Error(`nhóm ${g.id}: cần 1 đến 3 khung`);
    let s = sheets.find((x) => x.cells.length + n <= PER_SHEET);
    if (!s) { s = { cells: [], groups: [] }; sheets.push(s); }
    s.groups.push({ id: g.id, first: s.cells.length + 1, last: s.cells.length + n });
    s.cells.push(...g.frames);
  }
  return sheets;
}

// 5×7 glyphs, one string of 7 rows per digit.
const FONT = {
  1: "00100 01100 00100 00100 00100 00100 01110", 2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110", 4: "00010 00110 01010 10010 11111 00010 00010",
  5: "11111 10000 11110 00001 00001 10001 01110", 6: "00110 01000 10000 11110 10001 10001 01110",
  7: "11111 00001 00010 00100 01000 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
};
const SCALE = 6, PAD = 4;
// A binary PPM: white digit on a black box (pure).
export function digitPpm(d) {
  const rows = FONT[d].split(" ");
  const w = 5 * SCALE + PAD * 2, h = 7 * SCALE + PAD * 2;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < 7 * SCALE; y++) for (let x = 0; x < 5 * SCALE; x++) {
    if (rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)] !== "1") continue;
    px.fill(255, ((y + PAD) * w + x + PAD) * 3, ((y + PAD) * w + x + PAD) * 3 + 3);
  }
  return Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), px]);
}
export function writeLabels(dir) {
  mkdirSync(dir, { recursive: true });
  return Array.from({ length: PER_SHEET }, (_, n) => { const f = join(dir, `n${n + 1}.ppm`); writeFileSync(f, digitPpm(n + 1)); return f; });
}

const LAYOUT = Array.from({ length: PER_SHEET }, (_, n) => `${(n % 3) * CELL.w}_${Math.floor(n / 3) * CELL.h}`).join("|");
// The ffmpeg run that draws one sheet (pure). cells: up to 9 frame files; labels: 9 PPM files.
export function sheetArgs(cells, labels, out) {
  const args = [];
  for (let n = 0; n < PER_SHEET; n++) {
    if (cells[n]) args.push("-i", cells[n]);
    else args.push("-f", "lavfi", "-i", `color=black:s=${CELL.w}x${CELL.h}:d=1`);
  }
  for (const l of labels) args.push("-i", l);
  const parts = [];
  for (let n = 0; n < PER_SHEET; n++) {
    parts.push(`[${n}:v]scale=${CELL.w}:${CELL.h}:force_original_aspect_ratio=decrease,pad=${CELL.w}:${CELL.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[c${n}]`);
    parts.push(cells[n] ? `[c${n}][${PER_SHEET + n}:v]overlay=2:2[d${n}]` : `[c${n}]null[d${n}]`);
  }
  parts.push(`${Array.from({ length: PER_SHEET }, (_, n) => `[d${n}]`).join("")}xstack=inputs=${PER_SHEET}:layout=${LAYOUT}[out]`);
  return [...args, "-filter_complex", parts.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", out];
}

export async function buildSheet(cells, labels, out, { signal } = {}) {
  const r = await ffmpeg(sheetArgs(cells, labels, out), { timeout: 120000, signal });
  return r.code === 0 ? { ok: true, file: out } : { ok: false, error: `contact sheet: ${tail(r)}` };
}
