// lib/broll/search.mjs — text search over every analysed shot: caption, tags, subjects, place,
// on-screen text, shot type, the transcript said during the shot and the file names. Accents do
// not matter (fold() of lib/library.mjs: "biển" = "bien"). Ranking is a small BM25 (k1 1.2,
// b 0.75; tags count twice), ties broken by clip and shot so results are stable.
// The index is <cache>/index.json, rebuilt after each run from the clips' cache folders.
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fold } from "../library.mjs";
import { framePlan } from "./frames.mjs";
import { cacheRoot, readJson, SHA_RE, writeJson } from "./hash.mjs";

const K1 = 1.2, B = 0.75;
export const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 0);
export const indexFile = (env = process.env) => join(cacheRoot(env), "index.json");
const r2 = (x) => Math.round(x * 100) / 100;

// One document per shot of a clip's cache (pure apart from reading its files).
export function clipDocs(sha, dir) {
  const meta = readJson(join(dir, "meta.json"));
  const scenes = readJson(join(dir, "scenes.json"), []);
  if (!meta?.probe || !scenes.length) return [];
  const desc = new Map(readJson(join(dir, "describe.json"), []).map((d) => [d.shot, d]));
  const speech = readJson(join(dir, "speech.json")) ?? {};
  const paths = (meta.seen_paths ?? []).filter((p) => existsSync(p));
  if (!paths.length) return [];
  const names = [...new Set(paths.map((p) => basename(p)))];
  const plan = framePlan(scenes, meta.probe.duration);
  return scenes.map((s) => {
    const d = desc.get(s.i) ?? {};
    const said = (speech.transcript ?? []).filter((l) => l.end > s.start && l.start < s.end).map((l) => l.text).join(" ");
    const frames = plan.filter((p) => p.shot === s.i);
    const thumb = (frames[Math.floor(frames.length / 2)] ?? frames[0])?.name ?? null;
    const text = [d.caption_vi, ...(d.tags ?? []), ...(d.tags ?? []), ...(d.subjects ?? []), d.place, d.text_on_screen, d.shot_type, d.camera, d.time_of_day, said, ...names.map((n) => n.replace(/\.[^.]+$/, ""))].filter(Boolean).join(" ");
    return {
      sha256: sha, shot: s.i, start: s.start, end: s.end, duration: r2(s.end - s.start), clip_duration: meta.probe.duration,
      width: meta.probe.width, height: meta.probe.height, paths, caption_vi: d.caption_vi ?? null, tags: d.tags ?? [], shot_type: d.shot_type ?? null,
      camera: d.camera ?? null, place: d.place ?? null, described: Boolean(d.caption_vi), describe_error: d.describe_error ?? null,
      has_speech: Boolean(speech.has_speech), said: said || null, thumb, text: tokens(text),
    };
  });
}

// Rebuilds index.json from every clip folder. Returns { docs }.
export function rebuildIndex({ env = process.env } = {}) {
  const root = cacheRoot(env);
  const docs = [];
  if (existsSync(root)) for (const sha of readdirSync(root).filter((x) => SHA_RE.test(x)).sort()) docs.push(...clipDocs(sha, join(root, sha)));
  writeJson(indexFile(env), { built_at: new Date().toISOString(), docs });
  return { docs: docs.length };
}

let memo = null; // { file, mtime, idx }
// The loaded index with its BM25 statistics; reread when index.json changes.
export function loadIndex({ env = process.env } = {}) {
  const f = indexFile(env);
  const mtime = statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  if (memo && memo.file === f && memo.mtime === mtime) return memo.idx;
  const docs = (readJson(f)?.docs ?? []);
  const idx = prepare(docs);
  memo = { file: f, mtime, idx };
  return idx;
}

// BM25 statistics of docs (pure).
export function prepare(docs) {
  const df = new Map();
  let total = 0;
  for (const d of docs) {
    total += d.text.length;
    for (const w of new Set(d.text)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  return { docs, df, avg: docs.length ? total / docs.length : 0 };
}

// Ranked hits (pure). opts: kind (shot_type, accents ignored), min_dur (seconds), limit.
export function search(idx, q, { kind = null, min_dur = null, limit = 30 } = {}) {
  const words = [...new Set(tokens(q))];
  const N = idx.docs.length;
  const out = [];
  for (const d of idx.docs) {
    if (kind && fold(d.shot_type ?? "") !== fold(kind)) continue;
    if (min_dur != null && d.duration < min_dur) continue;
    let score = 0;
    if (words.length) {
      const tf = new Map();
      for (const w of d.text) tf.set(w, (tf.get(w) ?? 0) + 1);
      for (const w of words) {
        const f = tf.get(w);
        if (!f) continue;
        const n = idx.df.get(w) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.text.length / (idx.avg || 1)));
      }
      if (score <= 0) continue;
    }
    out.push({ d, score });
  }
  out.sort((a, b) => b.score - a.score || a.d.sha256.localeCompare(b.d.sha256) || a.d.shot - b.d.shot);
  return out.slice(0, Math.max(1, Math.min(200, Number(limit) || 30))).map(({ d, score }) => hit(d, score));
}

export const hit = (d, score = 0) => {
  const { text, ...rest } = d;
  return { ...rest, path: d.paths[0] ?? null, score: Math.round(score * 1000) / 1000, thumb: d.thumb ? `/api/broll/thumb?sha=${d.sha256}&f=${d.thumb}` : null };
};
