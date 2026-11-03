// routes/notes.mjs — the user's notes pinned to the timeline (lib/notes.mjs).
//   GET  /api/notes?name=                         → { notes }
//   POST /api/notes/add { name, t, text, shot? }   → the new note
//   POST /api/notes/update { name, id, text?, state? } → the note
//   POST /api/notes/remove { name, id }            → { ok: true }
//   POST /api/notes/send { name, ids }             → { request, runner, job }: one director request
//        listing the notes, then the notes are marked sent. A request that cannot be queued
//        leaves them as they were.
import { queueRequest } from "../director.mjs";
import { addNote, markSent, readNotes, removeNote, sendText, updateNote } from "../lib/notes.mjs";

const project = (c, name) => {
  const pd = c.withManifest(name);
  if (pd.error) throw Object.assign(new Error(pd.error), { status: pd.status });
  return pd;
};

export const ROUTES = [
  {
    method: "GET", path: "/api/notes",
    async handler(c) { return readNotes(project(c, c.q("name")).dir); },
  },
  {
    method: "POST", path: "/api/notes/add",
    async handler(c) {
      const b = c.body ?? {};
      return addNote(project(c, b.name).dir, { t: b.t, text: b.text, shot: b.shot });
    },
  },
  {
    method: "POST", path: "/api/notes/update",
    async handler(c) {
      const b = c.body ?? {};
      return updateNote(project(c, b.name).dir, b.id, { text: b.text, state: b.state });
    },
  },
  {
    method: "POST", path: "/api/notes/remove",
    async handler(c) {
      const b = c.body ?? {};
      return removeNote(project(c, b.name).dir, b.id);
    },
  },
  {
    method: "POST", path: "/api/notes/send",
    async handler(c) {
      const b = c.body ?? {};
      const pd = project(c, b.name);
      if (!Array.isArray(b.ids) || !b.ids.length) throw Object.assign(new Error("cần ids (mảng ghi chú)"), { status: 400 });
      const all = readNotes(pd.dir).notes;
      const picked = b.ids.map((id) => all.find((n) => n.id === id));
      if (picked.some((n) => !n)) throw Object.assign(new Error("có ghi chú không còn trong dự án"), { status: 404 });
      const out = queueRequest(c.P, b.name, pd.dir, { scope: "project", text: sendText(picked) });
      markSent(pd.dir, b.ids, out.request.id);
      return out;
    },
  },
];
