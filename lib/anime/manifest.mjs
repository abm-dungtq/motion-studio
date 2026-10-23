// lib/anime/manifest.mjs — the project's limited-animation manifest, assets/anim/manifest.json,
// read and written the way its builder (assets/anim/build.mjs, see templates/anim/) expects.
//
//   readManifest(dir)                 → { file, text, sha, manifest } or null when there is none
//   validate(m)                       → [] or the list of what build.mjs would refuse
//   writeManifest(dir, m, { baseSha }) → { sha, backup }: 409 when the file changed since baseSha,
//                                       400 with .errors when invalid; the old text is copied to
//                                       .opus/anim-backups/<time>.json first, then the new text
//                                       is written atomically, keys in the order the file had
//   listBackups(dir)                  → newest first
//   rebuild(dir)                      → runs the project's own node assets/anim/build.mjs
//                                       → { code, warnings, lines, error }
//   enable(dir)                       → copies templates/anim/* into assets/anim/ (never over a
//                                       file) and starts an empty manifest.json
//   finalRenders(dir)                 → renders/*final*.mp4: the project is delivered, a write
//                                       needs the user's confirmation
//
// Keys the editor does not know (tweens, smears, tremor, steps, ghosts, streaks, breathe, origin,
// fallback, motion, …) pass through untouched.
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "../agents/run.mjs";

export const TRACK_TYPES = ["lipsync", "blink", "wind", "keys"];
export const IMPACT_MODES = ["invert", "silhouette"];
const OFFSET_KEYS = ["x", "y", "scale"];
const SMEAR_DIRS = ["left", "right"];
const POSE = /^[a-z0-9][a-z0-9-]*$/i;
const BUILD_TIMEOUT_MS = 60000;
export const TEMPLATE_DIR = fileURLToPath(new URL("../../templates/anim/", import.meta.url));
// Template file → name in the project's assets/anim/.
const TEMPLATE_FILES = { "build.mjs": "build.mjs", "anim.js": "anim.js", "manifest.example.json": "manifest.example.json" };
export const EMPTY = { fps: 30, dir: "assets/plates/anim", stacks: {}, impacts: [] };

export const animDir = (dir) => join(dir, "assets", "anim");
export const manifestFile = (dir) => join(animDir(dir), "manifest.json");
export const backupDir = (dir) => join(dir, ".opus", "anim-backups");
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const err = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isTime = (v) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");

export function readManifest(dir) {
  const file = manifestFile(dir);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  let manifest;
  try { manifest = JSON.parse(text); } catch (e) { throw err(422, `assets/anim/manifest.json không phải JSON hợp lệ: ${e.message}`); }
  return { file, text, sha: sha256(text), manifest };
}

function checkTrack(tr, where, out) {
  if (!isObj(tr)) return out.push(`${where}: phải là object`);
  if (!TRACK_TYPES.includes(tr.type)) return out.push(`${where}: type "${tr.type}" không có (dùng ${TRACK_TYPES.join(", ")})`);
  const poseOk = (p) => p == null || (typeof p === "string" && (p === "base" || POSE.test(p)));
  if (tr.type === "lipsync") {
    if (typeof tr.voice !== "string" || !tr.voice) out.push(`${where}: lipsync cần voice (id thẻ <audio>)`);
    for (const k of ["open", "half", "open2", "closed"]) if (!poseOk(tr[k])) out.push(`${where}: ${k} không phải tên tư thế`);
    if (tr.idle !== undefined && tr.idle !== null && !["open", "half", "closed"].includes(tr.idle)) out.push(`${where}: idle là open, half, closed hoặc null`);
  }
  if (tr.type === "blink") {
    if (!poseOk(tr.pose) || tr.pose == null) out.push(`${where}: blink cần pose`);
    if (tr.at !== undefined && (!Array.isArray(tr.at) || !tr.at.every(isTime))) out.push(`${where}: at là danh sách thời điểm`);
  }
  if (tr.type === "wind") {
    if (tr.frames !== undefined && (!Array.isArray(tr.frames) || !tr.frames.length || !tr.frames.every(poseOk))) out.push(`${where}: frames là danh sách tư thế`);
    if (tr.fps !== undefined && !(Number(tr.fps) > 0)) out.push(`${where}: fps phải > 0`);
    if (tr.phase !== undefined && !Number.isInteger(tr.phase)) out.push(`${where}: phase là số nguyên khung`);
  }
  if (tr.type === "keys") {
    if (!Array.isArray(tr.keys) || !tr.keys.length) out.push(`${where}: keys cần danh sách keys[]`);
    else tr.keys.forEach((k, i) => {
      if (!isObj(k) || !poseOk(k.pose)) out.push(`${where} keys[${i}]: cần pose`);
      else if (k.smear !== undefined && !SMEAR_DIRS.includes(k.smear)) out.push(`${where} keys[${i}]: smear là "left" hoặc "right"`);
      else if (i < tr.keys.length - 1 && !(Number(k.frames) >= 1) && !(Number(k.sec) > 0)) out.push(`${where} keys[${i}]: cần frames hoặc sec`);
    });
  }
  if (tr.frames !== undefined && tr.type === "blink" && !(Number.isInteger(tr.frames) && tr.frames >= 1)) out.push(`${where}: frames là số khung ≥ 1`);
  if (tr.fallback !== undefined) {
    if (!isObj(tr.fallback)) out.push(`${where}: fallback phải là object`);
    else (tr.fallback.tracks ?? []).forEach((ft, j) => checkTrack(ft, `${where} fallback.tracks[${j}]`, out));
  }
}

export function validate(m) {
  const out = [];
  if (!isObj(m)) return ["manifest phải là object JSON"];
  if (m.fps !== undefined && !(Number(m.fps) > 0)) out.push("fps phải > 0");
  if (m.dir !== undefined && (typeof m.dir !== "string" || !m.dir || m.dir.startsWith("/") || m.dir.split("/").some((p) => p === ".." || p.startsWith(".")))) out.push("dir là đường tương đối trong dự án");
  if (m.stacks !== undefined && !isObj(m.stacks)) out.push("stacks phải là object { id: stack }");
  const stacks = isObj(m.stacks) ? m.stacks : {};
  for (const [id, st] of Object.entries(stacks)) {
    const where = `stacks.${id}`;
    if (!isObj(st)) { out.push(`${where}: phải là object`); continue; }
    if (typeof st.shot !== "string" || !st.shot) out.push(`${where}: cần shot (id cảnh trong TIMING)`);
    if (st.tracks !== undefined && !Array.isArray(st.tracks)) out.push(`${where}: tracks phải là danh sách`);
    (Array.isArray(st.tracks) ? st.tracks : []).forEach((tr, i) => checkTrack(tr, `${where}.tracks[${i}]`, out));
    if (st.offsets !== undefined && !isObj(st.offsets)) out.push(`${where}.offsets: phải là object { tư thế: { x, y, scale } }`);
    for (const [pose, o] of Object.entries(isObj(st.offsets) ? st.offsets : {})) {
      if (!isObj(o)) { out.push(`${where}.offsets.${pose}: phải là object`); continue; }
      const bad = Object.entries(o).find(([k, v]) => !OFFSET_KEYS.includes(k) || typeof v !== "number" || !Number.isFinite(v));
      if (bad) out.push(`${where}.offsets.${pose}: chỉ nhận số x, y, scale (sai ở ${bad[0]})`);
    }
  }
  if (m.impacts !== undefined && !Array.isArray(m.impacts)) out.push("impacts phải là danh sách");
  (Array.isArray(m.impacts) ? m.impacts : []).forEach((im, i) => {
    const where = `impacts[${i}]`;
    if (!isObj(im)) return out.push(`${where}: phải là object`);
    if (!isTime(im.at)) out.push(`${where}: cần at (giây hoặc "s13+0.1")`);
    const mode = im.mode ?? "invert";
    if (!IMPACT_MODES.includes(mode)) out.push(`${where}: mode "${mode}" không có (dùng invert hoặc silhouette)`);
    if (mode === "silhouette" && !Object.hasOwn(stacks, String(im.stack ?? ""))) out.push(`${where}: silhouette cần stack là một stack có trong manifest`);
    if (im.frames !== undefined && !(Number.isInteger(im.frames) && im.frames >= 1)) out.push(`${where}: frames là số khung ≥ 1`);
  });
  return out;
}

// next with its keys in the order prev had them (new keys after), recursively; arrays by index.
export function keepOrder(next, prev) {
  if (Array.isArray(next)) return next.map((v, i) => keepOrder(v, Array.isArray(prev) ? prev[i] : undefined));
  if (!isObj(next)) return next;
  const out = {};
  const old = isObj(prev) ? Object.keys(prev) : [];
  for (const k of old) if (Object.hasOwn(next, k)) out[k] = keepOrder(next[k], prev[k]);
  for (const k of Object.keys(next)) if (!Object.hasOwn(out, k)) out[k] = keepOrder(next[k], undefined);
  return out;
}

export const formatManifest = (m) => JSON.stringify(m, null, 2) + "\n";
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export function writeManifest(dir, manifest, { baseSha = null } = {}) {
  const cur = readManifest(dir);
  if (cur && baseSha !== cur.sha) throw err(409, "manifest vừa được sửa ở chỗ khác, tải lại rồi sửa tiếp", { sha: cur.sha });
  if (!cur && baseSha) throw err(409, "manifest không còn nữa, tải lại", { sha: null });
  const errors = validate(manifest);
  if (errors.length) throw err(400, `manifest chưa hợp lệ: ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? ` (và ${errors.length - 5} lỗi nữa)` : ""}`, { errors });
  let backup = null;
  if (cur) {
    mkdirSync(backupDir(dir), { recursive: true });
    for (let n = 1; !backup; n++) {
      const f = join(backupDir(dir), `${stamp()}${n > 1 ? `-${n}` : ""}.json`);
      try { writeFileSync(f, cur.text, { flag: "wx" }); backup = f; } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
  }
  const text = formatManifest(keepOrder(manifest, cur?.manifest));
  mkdirSync(animDir(dir), { recursive: true });
  const file = manifestFile(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return { sha: sha256(text), backup: backup && `.opus/anim-backups/${backup.split("/").pop()}` };
}

export function listBackups(dir, limit = 20) {
  const d = backupDir(dir);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit).map((f) => `.opus/anim-backups/${f}`);
}

export const buildFile = (dir) => join(animDir(dir), "build.mjs");
export const buildArgs = (dir) => [buildFile(dir)];
export const isEnabled = (dir) => existsSync(buildFile(dir));

// The WARN lines of a build ("anim build: WARN …"), without the prefix.
export const warningsOf = (lines) => lines.filter((l) => /\bWARN\b/.test(l)).map((l) => l.replace(/^anim build:\s*WARN\s*/, ""));

export async function rebuild(dir, { env = process.env, timeout = BUILD_TIMEOUT_MS } = {}) {
  if (!isEnabled(dir)) throw err(404, "dự án chưa có assets/anim/build.mjs (bật hệ lật ảnh trước)");
  const r = await exec(process.execPath, buildArgs(dir), { cwd: dir, env, timeout });
  const lines = `${r.stdout}\n${r.stderr}`.split("\n").map((l) => l.trim()).filter(Boolean);
  return { code: r.code, warnings: warningsOf(lines), lines: lines.slice(-200), error: r.error ?? (r.code ? lines.filter((l) => !/\bWARN\b/.test(l)).at(-1) ?? `exit ${r.code}` : null) };
}

export function enable(dir) {
  const to = animDir(dir);
  mkdirSync(to, { recursive: true });
  const copied = [], kept = [];
  for (const [from, name] of Object.entries(TEMPLATE_FILES)) {
    const rel = `assets/anim/${name}`;
    try { copyFileSync(join(TEMPLATE_DIR, from), join(to, name), constants.COPYFILE_EXCL); copied.push(rel); } catch (e) { if (e.code !== "EEXIST") throw e; kept.push(rel); }
  }
  try { writeFileSync(manifestFile(dir), formatManifest(EMPTY), { flag: "wx" }); copied.push("assets/anim/manifest.json"); } catch (e) { if (e.code !== "EEXIST") throw e; kept.push("assets/anim/manifest.json"); }
  return { copied, kept };
}

export function finalRenders(dir) {
  const d = join(dir, "renders");
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => /final/i.test(f) && /\.mp4$/i.test(f)).sort().map((f) => `renders/${f}`);
}
