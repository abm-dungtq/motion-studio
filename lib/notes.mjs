// lib/notes.mjs — the user's notes pinned to a moment of the timeline ("chữ ra muộn" at 0:12.4),
// kept in <project>/.opus/notes.json. Notes are not video content, so they live outside
// project.json and its versions:
//   { notes: [{ id: "n-<8 hex>", t, text, shot, state: "open" | "sent" | "done", created, request }] }
// t: seconds on the timeline; shot: the shot holding t when pinned (or null); request: the director
// request a "sent" note went out with. A file that does not parse is kept as notes.json.bad-<time>
// and read as empty.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STATES = ["open", "sent", "done"];
export const MAX_TEXT = 500;
export const notesFile = (dir) => join(dir, ".opus", "notes.json");

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function readNotes(dir) {
  const f = notesFile(dir);
  if (!existsSync(f)) return { notes: [] };
  try {
    const doc = JSON.parse(readFileSync(f, "utf8"));
    if (!Array.isArray(doc?.notes)) throw new Error("no notes");
    return { notes: doc.notes };
  } catch {
    try { renameSync(f, `${f}.bad-${new Date().toISOString().replace(/[:.]/g, "-")}`); } catch { /* gone meanwhile */ }
    return { notes: [] };
  }
}

// Read, change and write back (temp file, then rename). fn may return a value.
function update(dir, fn) {
  const doc = readNotes(dir);
  const out = fn(doc.notes);
  const f = notesFile(dir);
  mkdirSync(join(dir, ".opus"), { recursive: true });
  const tmp = `${f}.${process.pid}.${randomBytes(2).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
  renameSync(tmp, f);
  return out;
}

function cleanText(text) {
  const s = typeof text === "string" ? text.trim() : "";
  if (!s) throw bad("ghi chú trống");
  if (s.length > MAX_TEXT) throw bad(`ghi chú dài quá ${MAX_TEXT} ký tự`);
  return s;
}

function find(notes, id) {
  const n = notes.find((x) => x.id === id);
  if (!n) throw Object.assign(new Error(`không có ghi chú ${id}`), { status: 404 });
  return n;
}

export function addNote(dir, { t, text, shot = null }) {
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw bad("t phải là số giây ≥ 0");
  const note = {
    id: `n-${randomBytes(4).toString("hex")}`,
    t: Math.round(t * 10) / 10,
    text: cleanText(text),
    shot: typeof shot === "string" && shot ? shot : null,
    state: "open",
    created: new Date().toISOString(),
    request: null,
  };
  return update(dir, (notes) => { notes.push(note); return note; });
}

// Only text and state can change.
export function updateNote(dir, id, patch = {}) {
  const text = patch.text === undefined ? undefined : cleanText(patch.text);
  if (patch.state !== undefined && !STATES.includes(patch.state)) throw bad(`state phải là ${STATES.join(", ")}`);
  return update(dir, (notes) => {
    const n = find(notes, id);
    if (text !== undefined) n.text = text;
    if (patch.state !== undefined) n.state = patch.state;
    return n;
  });
}

export function removeNote(dir, id) {
  return update(dir, (notes) => { const n = find(notes, id); notes.splice(notes.indexOf(n), 1); return { ok: true }; });
}

export function markSent(dir, ids, requestId) {
  return update(dir, (notes) => ids.map((id) => Object.assign(find(notes, id), { state: "sent", request: requestId })));
}

// 12.4 → "0:12.4".
export const stamp = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// The director's task for a group of notes.
export function sendText(notes) {
  return [
    "Sửa theo các ghi chú của người dùng trên timeline (mốc giây · shot · ghi chú):",
    ...notes.map((n, i) => `${i + 1}. ${stamp(n.t)} · ${n.shot ?? "—"} · ${n.text}`),
    "Sửa xong mỗi ghi chú thì báo lại số của nó.",
  ].join("\n");
}
