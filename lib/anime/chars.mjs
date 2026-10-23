// lib/anime/chars.mjs — the project's character library, assets/chars/chars.json:
//   { "chars": [{ id, name, sheet, key_color, notes, palette[] }] }
// sheet is a project-relative PNG (assets/chars/<id>-sheet.png). A sheet PNG in assets/chars/
// that no entry names is listed too (unregistered: true), so a project made before the library
// shows its characters without anything being written.
//
//   listChars(dir)          → [{ …, unregistered? , exists }]
//   saveChar(dir, char)     → the stored entry (insert or replace by id)
//   removeChar(dir, id)     → true when it was there; the sheet PNG stays
//   charFile(dir), sheetOf(dir, id) → absolute path of the sheet, 400/404 when there is none
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseColor, toHex } from "./keying.mjs";

export const CHAR_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const DEFAULT_KEY = "#0047FF";
const SHEET = /^assets\/chars\/[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

export const charsDir = (dir) => join(dir, "assets", "chars");
export const charFile = (dir) => join(charsDir(dir), "chars.json");
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const hex = (c) => toHex(parseColor(c)).replace(/^0x/, "#");

function readList(dir) {
  const f = charFile(dir);
  if (!existsSync(f)) return [];
  let j;
  try { j = JSON.parse(readFileSync(f, "utf8")); } catch (e) { throw bad(`assets/chars/chars.json không phải JSON hợp lệ: ${e.message}`, 422); }
  return Array.isArray(j?.chars) ? j.chars.filter((c) => c && CHAR_ID.test(String(c.id))) : [];
}

function writeList(dir, chars) {
  mkdirSync(charsDir(dir), { recursive: true });
  const f = charFile(dir), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ chars }, null, 2) + "\n");
  renameSync(tmp, f);
}

export function listChars(dir) {
  const list = readList(dir).map((c) => ({ ...c, exists: Boolean(c.sheet && existsSync(join(dir, c.sheet))) }));
  const named = new Set(list.map((c) => c.sheet).filter(Boolean));
  const d = charsDir(dir);
  if (existsSync(d)) {
    for (const f of readdirSync(d).filter((x) => /-sheet(?:-\d+)?\.png$/i.test(x)).sort()) {
      const rel = `assets/chars/${f}`;
      const id = f.replace(/-sheet(?:-\d+)?\.png$/i, "").toLowerCase();
      if (named.has(rel) || !CHAR_ID.test(id) || list.some((c) => c.id === id)) continue;
      list.push({ id, name: id, sheet: rel, key_color: DEFAULT_KEY, notes: "", palette: [], unregistered: true, exists: true });
    }
  }
  return list;
}

export function normalizeChar(c) {
  if (!c || typeof c !== "object") throw bad("cần char { id, name, … }");
  const id = String(c.id ?? "").trim();
  if (!CHAR_ID.test(id)) throw bad("id nhân vật: chữ thường, số và -, tối đa 41 ký tự (ví dụ zoro)");
  const name = String(c.name ?? id).trim().slice(0, 80) || id;
  const sheet = c.sheet == null || c.sheet === "" ? null : String(c.sheet);
  if (sheet && !SHEET.test(sheet)) throw bad("sheet là một PNG trong assets/chars/, ví dụ assets/chars/zoro-sheet.png");
  const notes = String(c.notes ?? "");
  if (notes.length > 2000) throw bad("notes dài quá 2000 ký tự");
  const palette = c.palette == null ? [] : c.palette;
  if (!Array.isArray(palette) || palette.length > 12) throw bad("palette là danh sách tối đa 12 màu");
  const pal = palette.map((x) => hex(x));
  return { id, name, sheet, key_color: hex(c.key_color ?? DEFAULT_KEY), notes, palette: pal };
}

export function saveChar(dir, c) {
  const entry = normalizeChar(c);
  const list = readList(dir);
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  writeList(dir, list);
  return entry;
}

export function removeChar(dir, id) {
  const list = readList(dir);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  writeList(dir, next);
  return true;
}

export function charOf(dir, id) {
  const c = listChars(dir).find((x) => x.id === id);
  if (!c) throw bad(`không có nhân vật "${id}" trong thư viện`, 404);
  return c;
}

export function sheetOf(dir, id) {
  const c = charOf(dir, id);
  if (!c.sheet || !c.exists) throw bad(`nhân vật "${id}" chưa có sheet`, 404);
  return join(dir, c.sheet);
}
