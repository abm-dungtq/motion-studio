import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addNote, markSent, notesFile, readNotes, removeNote, sendText, stamp, updateNote } from "../lib/notes.mjs";

const withDir = (fn) => () => {
  const dir = mkdtempSync(join(tmpdir(), "ms-notes-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test("a missing file reads as no notes", withDir((dir) => {
  assert.deepEqual(readNotes(dir), { notes: [] });
  assert.equal(existsSync(notesFile(dir)), false);
}));

test("add, update, mark sent and remove a note; writes leave only notes.json", withDir((dir) => {
  const a = addNote(dir, { t: 12.43, text: "  chữ ra muộn ", shot: "s03" });
  assert.match(a.id, /^n-[0-9a-f]{8}$/);
  assert.deepEqual({ t: a.t, text: a.text, shot: a.shot, state: a.state, request: a.request }, { t: 12.4, text: "chữ ra muộn", shot: "s03", state: "open", request: null });
  const b = addNote(dir, { t: 0, text: "nhạc to quá" });
  assert.equal(b.shot, null);
  assert.deepEqual(readNotes(dir).notes.map((n) => n.id), [a.id, b.id]);

  assert.equal(updateNote(dir, a.id, { text: "chữ ra muộn nửa giây", id: "x", t: 99 }).text, "chữ ra muộn nửa giây");
  assert.equal(readNotes(dir).notes[0].t, 12.4, "only text and state change");
  assert.equal(updateNote(dir, b.id, { state: "done" }).state, "done");

  markSent(dir, [a.id], "r-1");
  assert.deepEqual(readNotes(dir).notes.map((n) => [n.state, n.request]), [["sent", "r-1"], ["done", null]]);

  removeNote(dir, b.id);
  assert.deepEqual(readNotes(dir).notes.map((n) => n.id), [a.id]);
  assert.deepEqual(readdirSync(join(dir, ".opus")), ["notes.json"]);
}));

test("bad input is refused with status 400, an unknown id with 404", withDir((dir) => {
  for (const text of ["", "   ", undefined, "x".repeat(501)]) assert.throws(() => addNote(dir, { t: 1, text }), (e) => e.status === 400);
  for (const t of [-1, NaN, "3", undefined]) assert.throws(() => addNote(dir, { t, text: "a" }), (e) => e.status === 400);
  const n = addNote(dir, { t: 1, text: "a" });
  assert.throws(() => updateNote(dir, n.id, { text: " " }), (e) => e.status === 400);
  assert.throws(() => updateNote(dir, n.id, { state: "gone" }), (e) => e.status === 400);
  assert.throws(() => updateNote(dir, "n-nope", { text: "b" }), (e) => e.status === 404);
  assert.throws(() => removeNote(dir, "n-nope"), (e) => e.status === 404);
  assert.throws(() => markSent(dir, [n.id, "n-nope"], "r"), (e) => e.status === 404);
  assert.equal(readNotes(dir).notes[0].state, "open", "a failed markSent changes nothing");
}));

test("a broken file is kept aside and read as empty", withDir((dir) => {
  mkdirSync(join(dir, ".opus"));
  writeFileSync(notesFile(dir), "{ not json");
  assert.deepEqual(readNotes(dir), { notes: [] });
  const kept = readdirSync(join(dir, ".opus")).filter((f) => f.startsWith("notes.json.bad-"));
  assert.equal(kept.length, 1);
  assert.equal(readFileSync(join(dir, ".opus", kept[0]), "utf8"), "{ not json");
  addNote(dir, { t: 2, text: "sau khi hỏng" });
  assert.equal(readNotes(dir).notes.length, 1);
}));

test("the director's task lists each note with its number, time and shot", () => {
  assert.equal(stamp(12.4), "0:12.4");
  assert.equal(stamp(75), "1:15.0");
  assert.equal(sendText([{ t: 12.4, shot: "s03", text: "chữ ra muộn" }, { t: 3, shot: null, text: "nhạc to" }]), [
    "Sửa theo các ghi chú của người dùng trên timeline (mốc giây · shot · ghi chú):",
    "1. 0:12.4 · s03 · chữ ra muộn",
    "2. 0:03.0 · — · nhạc to",
    "Sửa xong mỗi ghi chú thì báo lại số của nó.",
  ].join("\n"));
});
