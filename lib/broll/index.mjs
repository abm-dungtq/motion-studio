// lib/broll/index.mjs — the B-roll index: what each video on this machine shows, analysed once per
// content hash and kept in <cache>/<sha256>/ (lib/broll/hash.mjs cacheRoot):
//   meta.json      { sha256, size, probe, seen_paths, indexed_at, versions: { <step>: n } }
//   scenes.json    [{ i, start, end }]
//   frames/        s<i>-<k>.jpg
//   speech.json    { has_speech, ratio, transcript }
//   describe.json  [{ shot, caption_vi, tags, … } | { shot, describe_error }]
// A step runs only when its output is missing or its version is older than the code's, so a new
// prompt (describe VERSION) re-runs only the captions. Every step but describe is offline; describe
// packs the shots still without a caption from every clip of the run into contact sheets (4 per
// call) and stops at max_calls_per_run. One run at a time on this machine (<cache>/run.lock).
//
// Settings, read at call time from studio.json "broll": auto (index after a register, offline only;
// default true), vision (false: never build a sheet or call an agent), asr (default false: whisper with no language set invents English lines on music and Vietnamese speech),
// max_calls_per_run (default 50).
//
//   node lib/broll/index.mjs run '<json>'   the "broll" job: { root, project?, scope, vision,
//                                           max_calls?, asr? }; prints log lines, then RESULT <json>
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readState, stateFile } from "../config.mjs";
import { writeReceipt } from "../receipts.mjs";
import { describeBatch, SHEETS_PER_CALL, VERSION as DESCRIBE_V } from "./describe.mjs";
import { probe } from "./ffmpeg.mjs";
import { buildSheet, extractFrames, framePlan, packSheets, VERSION as FRAMES_V, writeLabels } from "./frames.mjs";
import { cacheRoot, clipDir, hashFile, readJson, writeJson } from "./hash.mjs";
import { detectScenes, VERSION as SCENES_V } from "./scenes.mjs";
import { rebuildIndex } from "./search.mjs";
import { analyzeSpeech, VERSION as SPEECH_V } from "./speech.mjs";

export const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".mkv", ".webm"];
export const VERSIONS = { probe: 1, scenes: SCENES_V, frames: FRAMES_V, speech: SPEECH_V, describe: DESCRIBE_V };
export const DEFAULT_MAX_CALLS = 50;
const SKIP_DIRS = new Set(["node_modules", "renders", "demo"]);
const WALK_MAX = 5000, WALK_DEPTH = 8, SEEN_MAX = 50;

// The "broll" settings of studio.json with defaults, read fresh on every call.
export function settings(env = process.env) {
  const b = readState(stateFile(env))?.broll ?? {};
  const n = Number(b.max_calls_per_run);
  return { auto: b.auto !== false, vision: b.vision !== false, asr: b.asr === true, max_calls_per_run: Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_CALLS };
}

// ---- sources ----------------------------------------------------------------------------------
const isVideo = (f) => VIDEO_EXT.includes(extname(f).toLowerCase());
function walk(dir, out, depth = 0) {
  if (depth > WALK_DEPTH || out.length >= WALK_MAX) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") || out.length >= WALK_MAX) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Clips Studio cut into a project (assets/broll) are copies of indexed footage.
      if (SKIP_DIRS.has(e.name) || (e.name === "broll" && basename(dir) === "assets")) continue;
      walk(p, out, depth + 1);
    } else if (e.isFile() && isVideo(e.name)) out.push(p);
  }
}
// Video files of a run, sorted and unique. scope "workspace": everything under root but
// node_modules, renders, demo, dot folders and assets/broll; scope "project": the project folder
// (same rules), the shared footage/ and shared-assets/, and the videos in its .opus/media.json.
export function sources({ root, dir = null, scope = "workspace" }) {
  const out = [];
  if (scope === "project" && dir) {
    walk(dir, out);
    for (const d of ["footage", "shared-assets"]) walk(join(root, d), out);
    const media = readJson(join(dir, ".opus", "media.json"), []);
    for (const m of Array.isArray(media) ? media : []) if (m?.kind === "video" && typeof m.path === "string" && existsSync(m.path)) out.push(m.path);
  } else walk(root, out);
  return [...new Set(out)].sort();
}

// ---- per-clip state ---------------------------------------------------------------------------
const files = (sha, env) => {
  const d = clipDir(sha, env);
  return { dir: d, meta: join(d, "meta.json"), scenes: join(d, "scenes.json"), frames: join(d, "frames"), speech: join(d, "speech.json"), describe: join(d, "describe.json") };
};
export function readClip(sha, env = process.env) {
  const f = files(sha, env);
  const meta = readJson(f.meta);
  if (!meta) return null;
  return { meta, scenes: readJson(f.scenes, []), speech: readJson(f.speech), describe: readJson(f.describe, []), dir: f.dir };
}
const fresh = (meta, step, versions, file) => existsSync(file) && (meta?.versions?.[step] ?? 0) >= versions[step];

// Groups of frames per shot that still need a caption (sorted by shot).
function pendingShots(sha, env, versions, { retryErrors = false } = {}) {
  const c = readClip(sha, env);
  if (!c?.scenes?.length || !(c.meta.versions?.frames >= versions.frames)) return [];
  const upToDate = (c.meta.versions?.describe ?? 0) >= versions.describe;
  const done = new Map((upToDate ? c.describe : []).map((d) => [d.shot, d]));
  const plan = framePlan(c.scenes, c.meta.probe?.duration ?? Infinity);
  return c.scenes.filter((s) => { const d = done.get(s.i); return !d || (retryErrors && d.describe_error); })
    .map((s) => ({ sha, shot: s.i, frames: plan.filter((p) => p.shot === s.i).map((p) => join(files(sha, env).frames, p.name)) }));
}

// The offline steps for one file. Returns { sha256, cached, steps: [names run], error? }.
export async function analyzeFile(path, { env = process.env, signal = null, log = () => {}, asr = settings(env).asr, versions = VERSIONS } = {}) {
  const h = await hashFile(path, { env });
  const f = files(h.sha256, env);
  let meta = readJson(f.meta) ?? { sha256: h.sha256, size: h.size, probe: null, seen_paths: [], indexed_at: null, versions: {} };
  const steps = [];
  const stop = () => { if (signal?.aborted) throw Object.assign(new Error("đã huỷ"), { code: "ABORT" }); };
  if (!meta.probe || (meta.versions.probe ?? 0) < versions.probe) {
    stop();
    const p = await probe(h.real, { signal });
    // Nothing is cached for a file ffprobe cannot read as video: no folder, no meta.
    if (!p || !(p.duration > 0) || !p.width) return { sha256: h.sha256, cached: false, steps, error: "ffprobe không đọc được hình" };
    meta = { ...meta, probe: p, versions: { ...meta.versions, probe: versions.probe } };
    steps.push("probe");
  }
  const seen = meta.seen_paths.includes(h.real);
  if (!seen) meta = { ...meta, seen_paths: [h.real, ...meta.seen_paths].slice(0, SEEN_MAX) };
  mkdirSync(f.dir, { recursive: true });
  const save = () => writeJson(f.meta, meta);
  if (!seen || steps.length || !existsSync(f.meta)) save();
  const dur = meta.probe.duration;
  if (!fresh(meta, "scenes", versions, f.scenes)) {
    stop();
    const s = await detectScenes(h.real, dur, { signal });
    if (!s.ok) return { sha256: h.sha256, cached: false, steps, error: s.error };
    writeJson(f.scenes, s.shots);
    meta = { ...meta, versions: { ...meta.versions, scenes: versions.scenes, frames: 0, describe: 0 } };
    save(); steps.push("scenes");
  }
  const scenes = readJson(f.scenes, []);
  const plan = framePlan(scenes, dur);
  const framesOk = (meta.versions.frames ?? 0) >= versions.frames && plan.every((p) => existsSync(join(f.frames, p.name)));
  if (!framesOk) {
    stop();
    const missing = plan.filter((p) => !existsSync(join(f.frames, p.name)) || (meta.versions.frames ?? 0) < versions.frames);
    const r = await extractFrames(h.real, missing, f.frames, { signal });
    if (!r.ok) return { sha256: h.sha256, cached: false, steps, error: r.error };
    meta = { ...meta, versions: { ...meta.versions, frames: versions.frames } };
    save(); steps.push("frames");
  }
  const sp0 = readJson(f.speech);
  // ASR switched on after a run without it: transcribe the clips that have speech, once.
  const wantAsr = asr && sp0?.has_speech && sp0.transcript == null && !sp0.asr_tried;
  if (!fresh(meta, "speech", versions, f.speech) || wantAsr) {
    stop();
    const sp = await analyzeSpeech(h.real, meta.probe, { asr, env, signal });
    writeJson(f.speech, { ...sp, asr_tried: Boolean(asr && sp.has_speech) });
    meta = { ...meta, versions: { ...meta.versions, speech: versions.speech } };
    save(); steps.push("speech");
    if (sp.error) log(`  ${basename(h.real)}: ${sp.error}`);
  }
  if (steps.length) { meta = { ...meta, indexed_at: new Date().toISOString() }; save(); }
  return { sha256: h.sha256, cached: !steps.length && h.cached, steps };
}

// Writes describe results into each clip. results: Map("<sha>:<shot>" → item | { describe_error }).
function storeDescribe(results, env, versions) {
  const bySha = new Map();
  for (const [key, v] of results) {
    const [sha, shot] = key.split(":");
    if (!bySha.has(sha)) bySha.set(sha, []);
    bySha.get(sha).push({ shot: Number(shot), ...v });
  }
  const touched = [];
  for (const [sha, items] of bySha) {
    const f = files(sha, env);
    const meta = readJson(f.meta);
    if (!meta) continue;
    const upToDate = (meta.versions?.describe ?? 0) >= versions.describe;
    const old = upToDate ? readJson(f.describe, []) : [];
    const map = new Map(old.map((d) => [d.shot, d]));
    for (const it of items) map.set(it.shot, it);
    writeJson(f.describe, [...map.values()].sort((a, b) => a.shot - b.shot));
    writeJson(f.meta, { ...meta, versions: { ...meta.versions, describe: versions.describe } });
    touched.push(f.describe);
  }
  return touched;
}

// The sheets that the pending shots of shas need, and the calls they cost (pure apart from reads).
export function packPending(shas, { env = process.env, versions = VERSIONS, retryErrors = false } = {}) {
  const groups = shas.flatMap((sha) => pendingShots(sha, env, versions, { retryErrors })).map((g) => ({ id: `${g.sha}:${g.shot}`, frames: g.frames }));
  const sheets = packSheets(groups);
  return { shots: groups.length, sheets, calls: Math.ceil(sheets.length / SHEETS_PER_CALL) };
}

// Captions for every pending shot of shas, at most maxCalls CLI runs.
export async function describePending(shas, { env = process.env, maxCalls = settings(env).max_calls_per_run, log = () => {}, signal = null, versions = VERSIONS, retryErrors = false, describeFn, agentsFn } = {}) {
  const { shots, sheets } = packPending(shas, { env, versions, retryErrors });
  const out = { shots, calls: 0, described: 0, errors: 0, left: shots, quota: false, agent: null, outputs: [] };
  if (!sheets.length) return out;
  const tmp = mkdtempSync(join(tmpdir(), "ms-broll-sheets-"));
  try {
    const labels = writeLabels(join(tmp, "labels"));
    for (let n = 0; n < sheets.length; n += SHEETS_PER_CALL) {
      if (signal?.aborted) break;
      if (out.calls >= maxCalls) { log(`Dừng: đã dùng ${out.calls}/${maxCalls} lượt đọc ảnh cho lượt chạy này`); break; }
      const batch = sheets.slice(n, n + SHEETS_PER_CALL);
      const imgs = [];
      for (const [k, s] of batch.entries()) {
        const r = await buildSheet(s.cells, labels, join(tmp, `sheet-${n + k + 1}.jpg`), { signal });
        if (!r.ok) throw new Error(r.error);
        imgs.push(r.file);
      }
      const ids = batch.flatMap((s) => s.groups.map((g) => g.id));
      log(`Đọc ảnh: ${batch.length} tờ, ${ids.length} shot…`);
      const r = await describeBatch(imgs, batch, { budget: maxCalls - out.calls, env, ...(describeFn ? { describeFn } : {}), ...(agentsFn ? { agentsFn } : {}) });
      out.calls += r.calls;
      out.agent = r.agent ?? out.agent;
      const results = new Map();
      for (const [id, item] of r.found) results.set(id, item);
      if (r.none) { log(`Dừng: ${r.error}`); break; }
      if (r.quota) { out.quota = true; log(`Hết quota đọc ảnh (${r.error}); các bước offline đã lưu trong cache`); break; }
      for (const id of r.errors) results.set(id, { describe_error: r.error ?? "thiếu trong câu trả lời" });
      out.outputs.push(...storeDescribe(results, env, versions));
      out.described += r.found.size;
      out.errors += r.errors.length;
      log(`  ${r.agent ?? "agent"}: ${r.found.size} shot có chú thích${r.errors.length ? `, ${r.errors.length} lỗi (${r.error ?? "thiếu"})` : ""}; ${r.calls} lượt`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  out.left = out.shots - out.described - out.errors;
  out.outputs = [...new Set(out.outputs)];
  return out;
}

// ---- one run at a time ------------------------------------------------------------------------
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
export function acquireLock(env = process.env) {
  const f = join(cacheRoot(env), "run.lock");
  mkdirSync(cacheRoot(env), { recursive: true });
  for (let n = 0; n < 2; n++) {
    try { writeFileSync(f, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: "wx" }); return () => rmSync(f, { force: true }); } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const held = readJson(f);
      if (held?.pid && held.pid !== process.pid && alive(held.pid)) return null;
      rmSync(f, { force: true });
    }
  }
  return null;
}

// A whole run: offline steps for every source, then (vision) the captions, then the search index.
// Returns a summary; a receipt goes to the project (or the cache folder for the workspace).
export async function runIndex({ root, dir = null, scope = dir ? "project" : "workspace", vision = true, maxCalls, asr, env = process.env, signal = null, log = console.log, versions = VERSIONS, retryErrors = false, describeFn, agentsFn, actor = "human" } = {}) {
  const set = settings(env);
  maxCalls = Number.isInteger(maxCalls) && maxCalls >= 0 ? Math.min(maxCalls, set.max_calls_per_run) : set.max_calls_per_run;
  asr ??= set.asr;
  const useVision = vision && set.vision;
  const release = acquireLock(env);
  if (!release) throw Object.assign(new Error("đang có một lượt phân tích B-roll khác chạy"), { code: "BUSY", status: 409 });
  const started = new Date();
  try {
    const list = sources({ root, dir, scope });
    log(`${list.length} file video trong ${scope === "project" ? "dự án" : "workspace"}`);
    const shas = [];
    let cachedAll = 0, failed = 0;
    const name = (p) => { const r = relative(root, p); return r && !r.startsWith("..") ? r : p; };
    for (const p of list) {
      if (signal?.aborted) break;
      const t0 = Date.now();
      let r;
      try { r = await analyzeFile(p, { env, signal, log, asr, versions }); } catch (e) {
        if (e.code === "ABORT") break;
        failed++; log(`${name(p)}: lỗi ${e.message}`); continue;
      }
      if (r.error) { failed++; log(`${name(p)}: ${r.error}`); continue; }
      if (!shas.includes(r.sha256)) shas.push(r.sha256);
      if (!r.steps.length) { cachedAll++; log(`${name(p)}: đã có trong cache`); }
      else log(`${name(p)}: ${r.steps.join(", ")} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    let d = { shots: 0, calls: 0, described: 0, errors: 0, left: 0, quota: false, agent: null, outputs: [] };
    if (!signal?.aborted) {
      if (useVision) d = await describePending(shas, { env, maxCalls, log, signal, versions, retryErrors, describeFn, agentsFn });
      else { const p = packPending(shas, { env, versions }); d.left = p.shots; d.shots = p.shots; if (p.shots) log(`${p.shots} shot chưa có chú thích (đọc ảnh đang tắt)`); }
    }
    const idx = rebuildIndex({ env });
    const summary = { files: list.length, clips: shas.length, cached: cachedAll, failed, shots_pending: d.shots, calls: d.calls, described: d.described, describe_errors: d.errors, left: d.left, quota: d.quota, agent: d.agent, indexed_shots: idx.docs, cancelled: Boolean(signal?.aborted), seconds: Math.round((Date.now() - started) / 100) / 10 };
    if (d.outputs.length) {
      const where = dir ?? cacheRoot(env);
      try {
        const rc = await writeReceipt(where, { op: "broll-index", actor, tool: { agent: d.agent }, params: { scope, vision: useVision, max_calls: maxCalls }, inputs: { files: list.length, clips: shas.length }, outputs: d.outputs, started, ended: new Date() });
        summary.receipt = rc.file;
      } catch (e) { log(`không ghi được biên nhận: ${e.message}`); }
    }
    return summary;
  } finally { release(); }
}

// ---- after a register (media.mjs) -------------------------------------------------------------
let chain = Promise.resolve();
// Queues the offline steps for one registered video in this process (no captions: those spend
// quota and wait for a click). Waits while another run holds the lock; errors only go to stderr.
export function enqueueIndex(path, { env = process.env, wait = 3000, maxWaitMs = 30 * 60000 } = {}) {
  if (!isVideo(path) || !settings(env).auto) return null;
  const job = chain.then(async () => {
    if (!existsSync(path) || !statSync(path).isFile()) return;
    // A file ffprobe cannot read as video leaves no trace in the cache (not even its hash).
    const p = await probe(path);
    if (!p?.width || !(p.duration > 0)) return;
    const until = Date.now() + maxWaitMs;
    let release = acquireLock(env);
    while (!release && Date.now() < until) { await new Promise((r) => setTimeout(r, wait)); release = acquireLock(env); }
    if (!release) return;
    try {
      const r = await analyzeFile(path, { env, log: () => {} });
      if (!r.error) rebuildIndex({ env });
    } finally { release(); }
  }).catch((e) => console.error(`motion-studio broll: ${path.split(sep).at(-1)}: ${e.message}`));
  chain = job;
  return job;
}

// ---- the job ----------------------------------------------------------------------------------
export const RESULT_PREFIX = "RESULT ";
async function main(argv) {
  const [cmd, json] = argv;
  if (cmd !== "run") { console.error("dùng: node lib/broll/index.mjs run '<json>'"); process.exit(2); }
  let a;
  try { a = JSON.parse(json ?? "{}"); } catch { console.error("tham số không phải JSON"); process.exit(2); }
  const ac = new AbortController();
  for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => ac.abort());
  try {
    const r = await runIndex({ root: a.root, dir: a.dir ?? null, scope: a.scope, vision: a.vision !== false, maxCalls: a.max_calls, asr: a.asr, signal: ac.signal, log: (l) => console.log(l), actor: a.actor ?? "human" });
    console.log(`Xong: ${r.files} file, ${r.cached} file đã có trong cache, ${r.calls} lượt đọc ảnh, ${r.seconds} s`);
    console.log(RESULT_PREFIX + JSON.stringify(r));
    process.exit(r.cancelled ? 130 : 0);
  } catch (e) {
    console.error(`lỗi: ${e.message}`);
    console.log(RESULT_PREFIX + JSON.stringify({ error: e.message }));
    process.exit(e.code === "BUSY" ? 8 : 1);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
