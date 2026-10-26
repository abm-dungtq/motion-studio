// lib/ledger.mjs — what Studio itself remembers about paid and approved work, outside every
// project and series folder: <state dir>/ledger/ (beside studio.json, ~/.config/motion-studio by
// default). The director works with acceptEdits inside its project, so anything kept under the
// project (.opus/…) can be rewritten by it; these files cannot, and only Studio's own code
// (server routes and the job runners it starts) writes them.
//
// One JSON file per project (keyed by the sha256 of its real path) and one per series folder:
//   project: { dir, assets: { <batch>: { digest, ids, drawn: { <id>: at }, ai_redos: { <id>: n } } },
//              tts: { voiced: { <line id>: at }, pending: { <line id>: { digest, voice, sha, at } } } }
//   series:  { dir, approved: { <path in the series>: sha256 } }
// assets.<batch>: the batch content (digest) and ids a consent card approved, the images drawn by
// such a run (or by the user's own redraw), and the redraws the director asked for per image.
// tts.voiced: lines voiced in a run Studio allowed (a card, or a redo of a voiced line);
// tts.pending: a line whose paid voice was written but whose mix failed (re-mixed, never re-paid).
// series.approved: files the user approved into the series (never overwritten by series_file_put).
// One file per day for AI video clips sent to G-Labs (lib/videogen/):
//   videogen-YYYY-MM-DD.json: { date, items: { <id>: { id, project, shot, digest, prompt_head, state, charge, task_id, error, files, receipt, version, created, updated } } }
//   state: intent|submitted|running|collected|attached|failed|indeterminate|cancelled; charge: none|indeterminate|charged|null.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stateFile } from "./config.mjs";

export const ledgerDir = (source = process.env) => join(dirname(stateFile(source)), "ledger");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const real = (dir) => { try { return realpathSync(dir); } catch { return dir; } };
const fileOf = (kind, dir, source) => join(ledgerDir(source), `${kind}-${hash(real(dir)).slice(0, 32)}.json`);

function read(kind, dir, source) {
  try { return JSON.parse(readFileSync(fileOf(kind, dir, source), "utf8")); } catch { return { dir: real(dir) }; }
}
// Read, change and write back one file (temp file, then rename). fn may return a value.
function update(kind, dir, fn, source = process.env) {
  const f = fileOf(kind, dir, source);
  const doc = read(kind, dir, source);
  const out = fn(doc);
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  const tmp = `${f}.${process.pid}.${randomBytes(2).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, f);
  return out;
}

export const ledgerFile = (dir, source = process.env) => fileOf("project", dir, source);

// ---- image batches ------------------------------------------------------------------------------
export const batchEntry = (dir, batch, source) => read("project", dir, source).assets?.[batch] ?? null;

// A consent card for the batch was approved: its content and ids (null: every image of it).
export function recordBatchRun(dir, batch, { digest, ids }, source) {
  update("project", dir, (d) => {
    const a = ((d.assets ??= {})[batch] ??= {});
    Object.assign(a, { digest, ids: ids ?? null, approved: new Date().toISOString() });
  }, source);
}
// Images of the batch that now have a drawing made in a run Studio allowed.
export function recordDrawn(dir, batch, ids, source) {
  if (!ids.length) return;
  update("project", dir, (d) => {
    const a = ((d.assets ??= {})[batch] ??= {});
    const drawn = (a.drawn ??= {});
    for (const id of ids) drawn[id] ??= new Date().toISOString();
  }, source);
}
export const aiRedos = (dir, batch, id, source) => batchEntry(dir, batch, source)?.ai_redos?.[id] ?? 0;
// One more redraw the director asked for; returns the new count.
export function bumpAiRedo(dir, batch, id, source) {
  return update("project", dir, (d) => {
    const a = ((d.assets ??= {})[batch] ??= {});
    const n = (a.ai_redos ??= {});
    n[id] = (n[id] ?? 0) + 1;
    return n[id];
  }, source);
}

// ---- voices -------------------------------------------------------------------------------------
const tts = (dir, source) => read("project", dir, source).tts ?? {};
export const isVoiced = (dir, id, source) => Boolean(tts(dir, source).voiced?.[id]);
export const pendingRemix = (dir, id, source) => tts(dir, source).pending?.[id] ?? null;
export function recordVoiced(dir, id, source) {
  update("project", dir, (d) => {
    const t = (d.tts ??= {});
    (t.voiced ??= {})[id] = new Date().toISOString();
    if (t.pending) delete t.pending[id];
  }, source);
}
export function setPendingRemix(dir, id, entry, source) {
  update("project", dir, (d) => {
    const t = (d.tts ??= {});
    if (entry) (t.pending ??= {})[id] = { ...entry, at: new Date().toISOString() };
    else if (t.pending) delete t.pending[id];
  }, source);
}

// ---- files approved into a series ---------------------------------------------------------------
export const approvedFiles = (seriesDir, source) => read("series", seriesDir, source).approved ?? {};
export function recordApproved(seriesDir, files, source) {
  if (!files.length) return;
  update("series", seriesDir, (d) => {
    const a = (d.approved ??= {});
    for (const { rel, sha } of files) a[rel] = sha;
  }, source);
}

// ---- AI video (videogen) ------------------------------------------------------------------------
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const videogenFile = (date, source = process.env) => join(ledgerDir(source), `videogen-${date}.json`);
const dateOfId = (id) => { const m = /^vg-(\d{4})(\d{2})(\d{2})-[0-9a-f]{6}$/.exec(String(id)); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
export function readVideogenDay(date = day(), source = process.env) {
  try { return JSON.parse(readFileSync(videogenFile(date, source), "utf8")); } catch { return { date, items: {} }; }
}
function writeDay(doc, source) {
  const f = videogenFile(doc.date, source);
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  const tmp = `${f}.${process.pid}.${randomBytes(2).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, f);
}
// A new intent, written before anything is sent. Returns the item.
export function newVideogenIntent({ project, shot, digest, prompt }, source = process.env) {
  const now = new Date();
  const doc = readVideogenDay(day(now), source);
  const id = `vg-${day(now).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
  const item = { id, project: real(project), shot, digest, prompt_head: String(prompt ?? "").slice(0, 80), state: "intent", charge: null, task_id: null, error: null, files: [], receipt: null, version: null, created: now.toISOString(), updated: now.toISOString() };
  doc.items[id] = item;
  writeDay(doc, source);
  return item;
}
export const getVideogen = (id, source = process.env) => { const d = dateOfId(id); return d ? readVideogenDay(d, source).items[id] ?? null : null; };
// Merges patch into the item; returns the new item (null when the id is unknown).
export function updateVideogen(id, patch, source = process.env) {
  const d = dateOfId(id);
  if (!d) return null;
  const doc = readVideogenDay(d, source);
  if (!doc.items[id]) return null;
  doc.items[id] = { ...doc.items[id], ...patch, updated: new Date().toISOString() };
  writeDay(doc, source);
  return doc.items[id];
}
// Clips counted against the daily cap: every intent of the day except those that ended before
// anything could be charged (charge "none": rejected, or cancelled before the POST).
export const videogenCount = (date = day(), source = process.env) => Object.values(readVideogenDay(date, source).items).filter((x) => x.charge !== "none").length;
// Items of one project over the last `days` days, newest first.
export function videogenItems(project, { days = 7 } = {}, source = process.env) {
  const p = real(project), out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    for (const x of Object.values(readVideogenDay(day(d), source).items)) if (x.project === p) out.push(x);
  }
  return out.sort((a, b) => b.created.localeCompare(a.created));
}
export const today = () => day();
// The user's cancel of a running clip: a marker file per item, so the server (which writes it)
// and the runner (which writes the item) never rewrite the same file at once.
const cancelFile = (id, source) => join(ledgerDir(source), `videogen-cancel-${id}`);
export function requestVideogenCancel(id, source = process.env) {
  if (!dateOfId(id)) return false;
  mkdirSync(ledgerDir(source), { recursive: true, mode: 0o700 });
  writeFileSync(cancelFile(id, source), new Date().toISOString() + "\n", { mode: 0o600 });
  return true;
}
export const videogenCancelRequested = (id, source = process.env) => Boolean(dateOfId(id)) && existsSync(cancelFile(id, source));
