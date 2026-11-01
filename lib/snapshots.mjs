// lib/snapshots.mjs — keep or undo one AI turn. Before the director starts on a request, Studio
// copies every text file of the project into <project>/.opus/snapshots/<request id>/files/ and
// writes meta.json (version, a hash per text file, size and mtime of every other file). A request
// that asks the user (studio_ask) and its follow-ups share the snapshot of the first request.
// When the chain ends, finish() compares the project with the snapshot: no change removes it,
// otherwise its state becomes "done" and Studio shows the banner (Giữ / Hoàn tác / Xem thay đổi).
//
// Undo puts the text files back first, then writes the old project.json through the gateway's
// restore() as a new version (actor "restore"), whose derive then finds the files already in
// place. Media are never copied: a voice or image the director wrote over in place cannot come
// back, so the result lists it instead of claiming a full undo.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";

export const TEXT_EXT = new Set([".html", ".md", ".json", ".css", ".js", ".mjs", ".txt", ".srt"]);
export const SKIP_DIRS = new Set(["renders", "demo", "capture", "node_modules", ".hyperframes", ".opus", ".git"]);
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const KEEP = 10;
const ACTIVE = new Set(["queued", "running", "waiting_user"]);
const ID = /^r-\d{14}-[0-9a-f]{4}$/;

const root = (dir) => join(dir, ".opus", "snapshots");
const home = (dir, id) => {
  if (!ID.test(String(id))) throw Object.assign(new Error(`id không hợp lệ: ${id}`), { status: 400 });
  return join(root(dir), id);
};
const metaFile = (dir, id) => join(home(dir, id), "meta.json");
const sha1 = (f) => createHash("sha1").update(readFileSync(f)).digest("hex");
const posix = (p) => p.split(sep).join("/");

function writeJson(f, v) {
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, f);
}

// rel as a path inside the project, or a thrown 400: no absolute path, no ".." segment, and the
// nearest existing folder above it resolves (symlinks followed) inside the project. meta.json is
// a file the director could write, and a folder may have become a symlink during the turn.
export function inside(dir, rel) {
  const parts = String(rel).split(/[\\/]/);
  if (!rel || isAbsolute(rel) || parts.includes("..")) throw Object.assign(new Error(`đường dẫn ngoài dự án: ${rel}`), { status: 400 });
  const base = realpathSync(dir);
  let up = dirname(join(dir, rel));
  while (!existsSync(up)) up = dirname(up);
  const real = realpathSync(up);
  if (real !== base && !real.startsWith(base + sep)) throw Object.assign(new Error(`đường dẫn ngoài dự án: ${rel}`), { status: 400 });
  return join(dir, rel);
}

export function readMeta(dir, id) {
  try { return JSON.parse(readFileSync(metaFile(dir, id), "utf8")); } catch { return null; }
}

// Walks the project: { text: { rel: abs }, media: { rel: [size, mtimeMs] }, skipped: [rel] }.
export function scan(dir) {
  const text = {}, media = {}, skipped = [];
  const walk = (d) => {
    let ents;
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs); continue; }
      if (!e.isFile() || e.name.endsWith(".tmp")) continue;
      const rel = posix(relative(dir, abs));
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (TEXT_EXT.has(extname(e.name).toLowerCase())) {
        if (st.size <= MAX_TEXT_BYTES) text[rel] = abs; else skipped.push(rel);
      } else media[rel] = [st.size, Math.round(st.mtimeMs)];
    }
  };
  walk(dir);
  return { text, media, skipped };
}

// Takes the snapshot for request id once; a second call (a relaunch without --resume, the next
// request of an ask chain) keeps the first. late: taken after the request had started (runner mcp).
export function take(dir, id, { version = null, late = false } = {}) {
  const have = readMeta(dir, id);
  if (have) return have;
  const h = home(dir, id);
  rmSync(h, { recursive: true, force: true });
  const { text, media, skipped } = scan(dir);
  const files = {};
  for (const [rel, abs] of Object.entries(text)) {
    const to = join(h, "files", rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(abs, to);
    files[rel] = sha1(to);
  }
  mkdirSync(h, { recursive: true });
  // A late copy may already hold a later state than the request's base: trust the copy.
  if (late) { try { version = JSON.parse(readFileSync(join(h, "files", "project.json"), "utf8")).version ?? version; } catch { /* no project.json */ } }
  const meta = { id, at: new Date().toISOString(), version, state: "open", late, files, media, skipped };
  writeJson(metaFile(dir, id), meta);
  prune(dir);
  return meta;
}

// The project now against the snapshot: text files changed, added and removed; media written
// over (existed before, size or mtime differs) and media created.
export function compare(dir, meta) {
  const now = scan(dir);
  const changed = [], added = [], removed = [], overwritten = [], created = [];
  for (const [rel, hash] of Object.entries(meta.files)) {
    const abs = now.text[rel];
    if (!abs) removed.push(rel);
    else if (sha1(abs) !== hash) changed.push(rel);
  }
  for (const rel of Object.keys(now.text)) if (!(rel in meta.files) && !meta.skipped?.includes(rel)) added.push(rel);
  for (const [rel, st] of Object.entries(now.media)) {
    const was = meta.media[rel];
    if (!was) created.push(rel);
    else if (was[0] !== st[0] || was[1] !== st[1]) overwritten.push(rel);
  }
  return { changed, added, removed, overwritten, created };
}

const nothing = (d) => !d.changed.length && !d.added.length && !d.removed.length && !d.overwritten.length && !d.created.length;

// Closes an open snapshot: removed when the turn changed nothing, else state "done" with a summary.
export function finish(dir, id, { version = null } = {}) {
  const meta = readMeta(dir, id);
  if (!meta || meta.state !== "open") return meta;
  const d = compare(dir, meta);
  if (nothing(d) && (version == null || version === meta.version)) {
    rmSync(home(dir, id), { recursive: true, force: true });
    return null;
  }
  const next = { ...meta, state: "done", finished: new Date().toISOString(), summary: { from: meta.version, to: version, ...d } };
  writeJson(metaFile(dir, id), next);
  return next;
}

// The snapshot a request belongs to: the nearest request up its follows chain (itself first) whose
// snapshot is still open, else its own id. A follow-up of a chain whose snapshot was already kept
// or undone (a question answered after it expired) gets a new snapshot of its own.
export function chainKey(dir, byId, r) {
  const seen = new Set();
  let cur = r;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (ID.test(cur.id) && readMeta(dir, cur.id)?.state === "open") return cur.id;
    cur = cur.follows ? byId.get(cur.follows) : null;
  }
  return r.id;
}

// Reconciles snapshots with the request list: a running request whose chain has none gets a late
// one (runner mcp claims requests outside Studio), and an open snapshot whose chain has no
// queued, running or waiting request is finished. Returns the ids finished.
export function sync(dir, requests, version) {
  const byId = new Map(requests.map((r) => [r.id, r]));
  const active = new Set();
  for (const r of requests) {
    if (!ACTIVE.has(r.status)) continue;
    const id = chainKey(dir, byId, r);
    active.add(id);
    if (r.status === "running" && ID.test(id) && !readMeta(dir, id)) take(dir, id, { version: r.base ?? version, late: true });
  }
  const done = [];
  for (const m of all(dir)) {
    if (m.state === "open" && !active.has(m.id)) { finish(dir, m.id, { version }); done.push(m.id); }
  }
  return done;
}

function all(dir) {
  let ids;
  try { ids = readdirSync(root(dir)).filter((x) => ID.test(x)); } catch { return []; }
  return ids.map((id) => readMeta(dir, id)).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
}

// Newest first, without the per-file hashes.
export function list(dir) {
  return all(dir).map(({ files, media, ...m }) => ({ ...m, files: Object.keys(files).length }));
}

// Keeps the newest `keep` snapshots; an open one is never removed.
export function prune(dir, keep = KEEP) {
  all(dir).filter((m) => m.state !== "open").slice(keep).forEach((m) => rmSync(home(dir, m.id), { recursive: true, force: true }));
}

export function keep(dir, id) {
  const meta = readMeta(dir, id);
  if (!meta) throw Object.assign(new Error("không còn ảnh chụp này"), { status: 404 });
  if (meta.state !== "done") return meta;
  const next = { ...meta, state: "kept" };
  writeJson(metaFile(dir, id), next);
  return next;
}

// Text before and after for every text file the turn touched (read-only view).
export function changes(dir, id) {
  const meta = readMeta(dir, id);
  if (!meta) throw Object.assign(new Error("không còn ảnh chụp này"), { status: 404 });
  const d = compare(dir, meta);
  for (const rel of [...d.changed, ...d.added, ...d.removed]) inside(dir, rel);
  const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return null; } };
  const was = (rel) => read(join(home(dir, id), "files", rel));
  const now = (rel) => read(join(dir, rel));
  const files = [
    ...d.changed.map((rel) => ({ path: rel, kind: "changed", before: was(rel), after: now(rel) })),
    ...d.added.map((rel) => ({ path: rel, kind: "added", before: null, after: now(rel) })),
    ...d.removed.map((rel) => ({ path: rel, kind: "removed", before: was(rel), after: null })),
  ];
  return { id, state: meta.state, from: meta.version, files, overwritten: d.overwritten, created: d.created };
}

// Lines whose voice file is among the media written over.
export function linesHit(manifest, overwritten) {
  const hit = new Set(overwritten);
  return (manifest?.lines ?? []).filter((l) => l.file && hit.has(posix(l.file).replace(/^\.\//, ""))).map((l) => ({ id: l.id, text: l.text ?? "" }));
}

// Undoes the turn: text files back (project.json excluded), files the turn added removed, then the
// old project.json through gw.restore as a new version. load(dir) reads the current manifest.
// A project.json changed after the turn (version above summary.to) needs force.
export function restore(dir, id, { load, gw, force = false }) {
  const meta = readMeta(dir, id);
  if (!meta) throw Object.assign(new Error("không còn ảnh chụp này"), { status: 404 });
  if (meta.state === "restored") throw Object.assign(new Error("lượt AI này đã được hoàn tác"), { status: 409 });
  if (meta.state === "open") throw Object.assign(new Error("lượt AI này chưa xong"), { status: 409 });
  const cur = load(dir);
  const to = meta.summary?.to;
  if (!force && cur && to != null && cur.version > to) {
    throw Object.assign(new Error(`Sau lượt AI đã có sửa khác (v${to} → v${cur.version}). Hoàn tác cả các sửa sau đó?`), { status: 409, code: "NEWER" });
  }
  const old = JSON.parse(readFileSync(join(home(dir, id), "files", "project.json"), "utf8"));
  const needManifest = cur && cur.capabilities?.editable && JSON.stringify({ ...old, version: 0, updated: 0 }) !== JSON.stringify({ ...cur, version: 0, updated: 0 });
  if (needManifest && typeof gw?.restore !== "function") throw Object.assign(new Error("plugin chưa có restore của cổng lệnh; cập nhật plugin rồi thử lại"), { status: 400 });
  const d = compare(dir, meta);
  // project.json goes through the gateway when it can; a read-only project gets the file back.
  const viaGateway = Boolean(cur?.capabilities?.editable);
  const skip = (rel) => rel === "project.json" && viaGateway;
  const back = [...d.changed, ...d.removed].filter((rel) => !skip(rel));
  const drop = d.added.filter((rel) => !skip(rel));
  // Every path is checked before anything is written, and the bytes now on disk are kept, so a
  // failed gateway restore (CONFLICT, BUSY, INVALID) puts the project back as it was.
  const saved = new Map();
  for (const rel of [...back, ...drop]) {
    const abs = inside(dir, rel);
    saved.set(abs, existsSync(abs) ? readFileSync(abs) : null);
  }
  const rollback = () => {
    for (const [abs, bytes] of saved) {
      try {
        if (bytes == null) rmSync(abs, { force: true });
        else { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, bytes); }
      } catch { /* best effort: the error below is reported either way */ }
    }
  };
  let version = cur?.version ?? null;
  try {
    for (const rel of back) {
      const to = join(dir, rel);
      mkdirSync(dirname(to), { recursive: true });
      const tmp = `${to}.${process.pid}.tmp`;
      copyFileSync(join(home(dir, id), "files", rel), tmp);
      renameSync(tmp, to);
    }
    for (const rel of drop) rmSync(join(dir, rel), { force: true });
    if (needManifest) {
      const r = gw.restore(dir, { base: cur.version, manifest: old, note: `hoàn tác lượt AI ${id}`, lockWaitMs: 1000 });
      if (r.code) throw Object.assign(new Error(`${r.error}; các file đã được trả lại như trước khi bấm Hoàn tác`), { status: 409 });
      version = r.version;
    }
  } catch (e) {
    rollback();
    throw e;
  }
  const next = { ...meta, state: "restored", restored: { at: new Date().toISOString(), version } };
  writeJson(metaFile(dir, id), next);
  return { version, files: d.changed.length + d.added.length + d.removed.length, overwritten: d.overwritten, created: d.created, lines: linesHit(old, d.overwritten) };
}
