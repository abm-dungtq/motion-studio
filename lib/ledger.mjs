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
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
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
