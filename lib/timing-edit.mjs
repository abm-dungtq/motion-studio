// lib/timing-edit.mjs — the sources of TIMING that Studio edits by hand: the beat grid of a music
// bed (<music.file>.beats.json, beat0) and the words of a voice line (<line.file>.words.json,
// start/end of one word, seconds from the head of the file). TIMING itself is never edited: the
// provider's timing command rebuilds it from these files (routes/timing.mjs runs it).
// Every edit checks the file's sha256 against the base the client saw (409 when it changed),
// checks the bounds (422: a word stays between its neighbours and at least 10 ms long, beat0 in
// [0, beatLen)), saves the old text to <dir>/.opus/timing-edits/<stamp>-<file>.json and writes the
// new text atomically, changing only that value. undoLast() puts back the newest backup, if the
// file still holds what that edit wrote. The idea of named, draggable time events that code reads
// from a meta file comes from motion-canvas (https://github.com/motion-canvas/motion-canvas, MIT,
// packages/core/src/scenes/timeEvents); no code is copied.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { beatBounds, wordBounds } from "../public/timeline-edit.js";

export const EDITS_DIR = [".opus", "timing-edits"];
const r3 = (x) => Math.round(x * 1000) / 1000;
const fail = (status, error) => Object.assign(new Error(error), { status });
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const editsDir = (dir) => join(resolve(dir), ...EDITS_DIR);

// <dir>/<rel>.<suffix> when rel is a relative path that stays inside dir (also through symlinks).
function sideFile(dir, rel, suffix) {
  if (typeof rel !== "string" || !rel || rel.startsWith("/") || rel.includes("\0") || rel.split(/[\\/]/).includes("..")) return null;
  const f = join(resolve(dir), `${rel}${suffix}`);
  if (!existsSync(f)) return { file: f, rel: `${rel}${suffix}`, exists: false };
  let real, base;
  try { real = realpathSync(f); base = realpathSync(dir); } catch { return null; }
  if (!real.startsWith(base + sep)) return null;
  return { file: real, rel: `${rel}${suffix}`, exists: true };
}
export const wordsFileOf = (dir, line) => sideFile(dir, line?.file, ".words.json");
export const beatsFileOf = (dir, bed) => sideFile(dir, bed?.file, ".beats.json");

function readJson(file) {
  const text = readFileSync(file, "utf8");
  try { return { text, data: JSON.parse(text) }; } catch (e) { throw fail(422, `${file} không phải JSON: ${e.message}`); }
}

// The same layout as the file had: indented (by its first indent) or on one line.
function serialize(data, old) {
  const indent = /^[[{]\s*\n([ \t]+)/.exec(old)?.[1];
  return (indent ? JSON.stringify(data, null, indent) : JSON.stringify(data)) + (old.endsWith("\n") ? "\n" : "");
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text);
  try { renameSync(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

let seq = 0;
// Saves the text before an edit. Names sort in edit order: <ms since epoch>-<seq>-<file>.json.
function backup(dir, rel, before, after) {
  const d = editsDir(dir);
  mkdirSync(d, { recursive: true });
  const stamp = `${String(Date.now()).padStart(14, "0")}-${String(seq++ % 10000).padStart(4, "0")}`;
  const name = `${stamp}-${rel.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`;
  writeFileSync(join(d, name), JSON.stringify({ rel, at: new Date().toISOString(), sha: sha256(before), after: sha256(after), text: before }) + "\n");
  return name;
}

// Backups of dir, oldest first: [{ name, rel, at, sha, after, text }]. Unreadable files are skipped.
export function listBackups(dir) {
  const d = editsDir(dir);
  if (!existsSync(d)) return [];
  const out = [];
  for (const name of readdirSync(d).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const b = JSON.parse(readFileSync(join(d, name), "utf8"));
      if (typeof b?.rel === "string" && typeof b.text === "string") out.push({ name, ...b });
    } catch { /* a torn backup is not one */ }
  }
  return out;
}

// The text of rel before Studio first edited it (its oldest backup), or null.
function originalText(dir, rel, backups = listBackups(dir)) {
  return backups.find((b) => b.rel === rel)?.text ?? null;
}

function checkBase(text, base) {
  if (typeof base !== "string" || !/^[0-9a-f]{64}$/.test(base)) throw fail(400, "cần base_sha (sha256 của file lúc đọc)");
  if (sha256(text) !== base) throw fail(409, "file mốc đã đổi từ lúc tải; tải lại rồi thử lại");
}
const num = (v, what) => {
  const x = Number(v);
  if (v == null || v === "" || !Number.isFinite(x)) throw fail(400, `${what} phải là số`);
  return r3(x);
};

// Moves one word of line lineId: start and/or end in seconds of the voice file.
// Returns { file: rel, sha, before, value: { start, end }, backup }.
export function editWord(dir, m, { line_id: lineId, index, base_sha: base, start, end }) {
  const line = (m?.lines ?? []).find((l) => l.id === lineId);
  if (!line) throw fail(404, `không có câu ${lineId}`);
  const f = wordsFileOf(dir, line);
  if (!f) throw fail(422, `${lineId}: file giọng không hợp lệ`);
  if (!f.exists) throw fail(404, `${lineId}: chưa có ${f.rel}`);
  const { text, data } = readJson(f.file);
  if (!Array.isArray(data)) throw fail(422, `${f.rel} không phải mảng [{text,start,end}]`);
  checkBase(text, base);
  const i = Number(index);
  if (!Number.isInteger(i) || !data[i] || !Number.isFinite(data[i].start) || !Number.isFinite(data[i].end)) throw fail(404, `${f.rel}: không có từ #${index}`);
  if (start == null && end == null) throw fail(400, "cần start hoặc end");
  const w = data[i];
  const was = { start: w.start, end: w.end };
  const next = { start: start == null ? w.start : num(start, "start"), end: end == null ? w.end : num(end, "end") };
  // Each edge is checked against the neighbours and the word's other edge after the change; the
  // edge itself keeps its old value there, which wordBounds uses for files that already overlap.
  const withEnd = data.map((x, k) => (k === i ? { ...x, end: next.end } : x));
  const withStart = data.map((x, k) => (k === i ? { ...x, start: next.start } : x));
  const bs = wordBounds(withEnd, i, "start"), be = wordBounds(withStart, i, "end");
  if (!(next.end - next.start >= 0.01 - 1e-9)) throw fail(422, `"${w.text}": từ phải dài ít nhất 10 ms`);
  if (start != null && (next.start < bs.lo - 1e-9 || next.start > bs.hi + 1e-9)) throw fail(422, `"${w.text}": đầu từ phải trong ${bs.lo}–${bs.hi} giây (không vượt từ kề)`);
  if (end != null && (next.end < be.lo - 1e-9 || next.end > be.hi + 1e-9)) throw fail(422, `"${w.text}": cuối từ phải trong ${be.lo}–${be.hi === Infinity ? "∞" : be.hi} giây (không vượt từ kề)`);
  if (next.start === was.start && next.end === was.end) return { file: f.rel, sha: base, before: was, value: next, backup: null, changed: false };
  data[i] = { ...w, ...next };
  const out = serialize(data, text);
  const name = backup(dir, f.rel, text, out);
  writeAtomic(f.file, out);
  return { file: f.rel, sha: sha256(out), before: was, value: next, backup: name, changed: true };
}

// Sets beat0 of music bed musicId. Returns { file: rel, sha, before, value, backup }.
export function editBeat(dir, m, { music_id: musicId, base_sha: base, beat0 }) {
  const bed = (m?.music ?? []).find((b) => b.id === musicId);
  if (!bed) throw fail(404, `không có nhạc ${musicId}`);
  const f = beatsFileOf(dir, bed);
  if (!f) throw fail(422, `${musicId}: file nhạc không hợp lệ`);
  if (!f.exists) throw fail(404, `${musicId}: chưa đo phách (${f.rel})`);
  const { text, data } = readJson(f.file);
  checkBase(text, base);
  const b = beatBounds(data?.beatLen);
  if (!b) throw fail(422, `${f.rel}: beatLen phải > 0`);
  const v = num(beat0, "beat0");
  if (v < b.lo || v > b.hi) throw fail(422, `beat0 phải trong [0, ${r3(data.beatLen)}) giây`);
  if (v === data.beat0) return { file: f.rel, sha: base, before: data.beat0, value: v, backup: null, changed: false };
  const was = data.beat0;
  const out = serialize({ ...data, beat0: v }, text);
  const name = backup(dir, f.rel, text, out);
  writeAtomic(f.file, out);
  return { file: f.rel, sha: sha256(out), before: was, value: v, backup: name, changed: true };
}

// Puts back the newest backup and removes it. 422 when there is none, 409 when its file changed
// since that edit (another tool rewrote it: restoring would lose that). Returns { file, sha }.
export function undoLast(dir) {
  const all = listBackups(dir);
  const b = all.at(-1);
  if (!b) throw fail(422, "không còn mốc nào để hoàn tác");
  const f = join(resolve(dir), b.rel);
  const real = sideFile(dir, b.rel, "");
  if (!real) throw fail(422, `bản sao lưu ${b.name} trỏ ra ngoài dự án`);
  if (existsSync(f) && b.after && sha256(readFileSync(f, "utf8")) !== b.after) throw fail(409, `${b.rel} đã đổi sau lần sửa mốc; không hoàn tác để khỏi mất thay đổi đó`);
  writeAtomic(real.file, b.text);
  rmSync(join(editsDir(dir), b.name), { force: true });
  return { file: b.rel, sha: sha256(b.text), left: all.length - 1 };
}

// What the timeline needs to draw and drag the markers of m:
// { grid: { music_id, file, sha, beat0, beatLen, original } | null,
//   lines: [{ id, file, sha, offset, duration, words: [{ text, start, end }], original: [{ start, end }] | null }],
//   undo: <backups left> }. grid is the first bed with a beats.json (the one TIMING uses);
// offset is the line's start on the video, so a word is heard at offset + start.
export function readMarkers(dir, m) {
  const backups = listBackups(dir);
  const orig = (rel) => {
    const t = originalText(dir, rel, backups);
    if (t == null) return null;
    try { return JSON.parse(t); } catch { return null; }
  };
  let grid = null;
  for (const bed of m?.music ?? []) {
    const f = beatsFileOf(dir, bed);
    if (!f?.exists) continue;
    try {
      const { text, data } = readJson(f.file);
      if (!Number.isFinite(data?.beat0) || !Number.isFinite(data?.beatLen)) continue;
      const o = orig(f.rel);
      grid = { music_id: bed.id, file: f.rel, sha: sha256(text), beat0: data.beat0, beatLen: data.beatLen, original: Number.isFinite(o?.beat0) ? o.beat0 : data.beat0 };
      break;
    } catch { /* an unreadable grid: TIMING skips it too */ }
  }
  const lines = [];
  for (const l of m?.lines ?? []) {
    const f = wordsFileOf(dir, l);
    if (!f?.exists) continue;
    try {
      const { text, data } = readJson(f.file);
      if (!Array.isArray(data)) continue;
      const words = data.map((w) => ({ text: String(w?.text ?? ""), start: Number(w?.start), end: Number(w?.end) }));
      const o = orig(f.rel);
      lines.push({ id: l.id, file: f.rel, sha: sha256(text), offset: Number(l.start) || 0, duration: Number(l.duration) || null, words,
        original: Array.isArray(o) && o.length === words.length ? o.map((w) => ({ start: Number(w?.start), end: Number(w?.end) })) : words.map((w) => ({ start: w.start, end: w.end })) });
    } catch { /* skipped like timing.mjs does */ }
  }
  return { grid, lines, undo: backups.length };
}
