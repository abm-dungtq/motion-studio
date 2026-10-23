// lib/fx/lut.mjs — colour looks for the "grade" footage edit. A look is either a .cube file the
// user keeps in <root>/shared-assets/luts/ or <project>/assets/luts/, or an entry of the
// media-use catalog (<hfSkills>/media-use/luts/index.json) whose `params` are turned into a .cube
// offline by buildCube below (no network, no outside script). "identity" is the do-nothing cube
// (a test and a reference). Built cubes are cached by content hash in
// ~/.cache/motion-studio/luts/ ($MOTION_STUDIO_CACHE overrides the folder).
//
// buildCube and its helpers are copied from heygen-com/hyperframes,
// packages/cli/src/media-use/lib/cube-build.mjs at commit 03ed14615a2988d65ed793f004bcc4446ec89324
// (https://github.com/heygen-com/hyperframes, Apache-2.0). Changes: none in the colour maths.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { hfSkills } from "../config.mjs";

const DEFAULT_SIZE = 33;
const MAX_SIZE = 64;
export const LUT_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const CUBE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.cube$/;
// A path that goes into lut3d=file=… unquoted: no filter-graph separators or quotes.
const SAFE_PATH = /^[A-Za-z0-9/._-]+$/;

// ---- copied: hyperframes cube-build.mjs (Apache-2.0) ----
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
function clampUnit(value) { return clamp(value, 0, 1); }
function readParam(params, key, min, max) { return clamp(Number(params?.[key] ?? 0), min, max); }
function luma([r, g, b]) { return r * 0.2126 + g * 0.7152 + b * 0.0722; }
function smoothstep(edge0, edge1, value) {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function applyLiftGain(color, params) {
  const y = luma(color);
  const blacks = readParam(params, "blacks", -1, 1);
  const shadows = readParam(params, "shadows", -1, 1);
  const highlights = readParam(params, "highlights", -1, 1);
  const whites = readParam(params, "whites", -1, 1);
  const shadowMask = 1 - smoothstep(0.18, 0.62, y);
  const highlightMask = smoothstep(0.38, 0.82, y);
  const offset = blacks * 0.08 + shadows * 0.12 * shadowMask + highlights * 0.12 * highlightMask + whites * 0.08;
  return color.map((channel) => clampUnit(channel + offset));
}
function applyExposure(color, params) {
  const exposure = readParam(params, "exposure", -2, 2);
  const gain = 2 ** exposure;
  const lift = Math.max(0, exposure) * 0.015;
  return color.map((channel) => clampUnit(channel * gain + lift));
}
function applyContrast(color, params) {
  const contrast = readParam(params, "contrast", -1, 1);
  if (contrast === 0) return color;
  const factor = 1 + contrast * 1.2;
  return color.map((channel) => clampUnit(0.5 + (channel - 0.5) * factor));
}
function applyWhiteBalance(color, params) {
  const temperature = readParam(params, "temperature", -1, 1);
  const tint = readParam(params, "tint", -1, 1);
  const redScale = 1 + temperature * 0.28 + tint * 0.08;
  const greenScale = 1 - Math.abs(tint) * 0.1 - tint * 0.08;
  const blueScale = 1 - temperature * 0.28 + tint * 0.08;
  return [clampUnit(color[0] * redScale), clampUnit(color[1] * greenScale), clampUnit(color[2] * blueScale)];
}
function applySplitTone(color, params) {
  const split = params?.splitTone;
  if (!split) return color;
  const intensity = clampUnit(Number(split.intensity ?? 0));
  if (intensity === 0) return color;
  const balance = clampUnit(Number(split.balance ?? 0.5));
  const y = luma(color);
  const shadowMask = 1 - smoothstep(balance - 0.25, balance + 0.2, y);
  const highlightMask = smoothstep(balance - 0.2, balance + 0.25, y);
  const shadows = Array.isArray(split.shadows) ? split.shadows : [0, 0, 0];
  const highlights = Array.isArray(split.highlights) ? split.highlights : [0, 0, 0];
  return color.map((channel, i) => clampUnit(channel + Number(shadows[i] ?? 0) * shadowMask * intensity + Number(highlights[i] ?? 0) * highlightMask * intensity));
}
function applySaturation(color, params) {
  const saturation = readParam(params, "saturation", -1, 1);
  const vibrance = readParam(params, "vibrance", -1, 1);
  if (saturation === 0 && vibrance === 0) return color;
  const y = luma(color);
  const currentSat = Math.max(Math.abs(color[0] - y), Math.abs(color[1] - y), Math.abs(color[2] - y));
  const vibranceWeight = 1 - clampUnit(currentSat * 2);
  const factor = clamp(1 + saturation + vibrance * vibranceWeight, 0, 2.5);
  return color.map((channel) => clampUnit(y + (channel - y) * factor));
}
function applyParams(color, params) {
  let out = applyLiftGain(color, params);
  out = applyExposure(out, params);
  out = applyContrast(out, params);
  out = applyWhiteBalance(out, params);
  out = applySplitTone(out, params);
  out = applySaturation(out, params);
  return out;
}
function formatNumber(value) { return clampUnit(value).toFixed(6); }

export function buildCube(params = {}, size = DEFAULT_SIZE) {
  if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE) throw new Error(`LUT size must be an integer from 2 to ${MAX_SIZE}`);
  const lines = [`TITLE "media-use parametric grade"`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1", `LUT_3D_SIZE ${size}`];
  const denom = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = applyParams([r / denom, g / denom, b / denom], params);
        lines.push(`${formatNumber(out[0])} ${formatNumber(out[1])} ${formatNumber(out[2])}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
// ---- end of copied code ----

// Checks a .cube text: a LUT_3D_SIZE line and exactly size³ rows of three numbers. Returns { size }.
export function parseCube(text) {
  const rows = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const sizeLine = rows.find((l) => /^LUT_3D_SIZE\s+\d+$/.test(l));
  if (!sizeLine) throw new Error("file .cube thiếu dòng LUT_3D_SIZE");
  const size = Number(sizeLine.split(/\s+/)[1]);
  if (!(size >= 2 && size <= 256)) throw new Error(`LUT_3D_SIZE ${size} không hợp lệ`);
  const data = rows.filter((l) => /^[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+$/.test(l) && !/^DOMAIN_/.test(l));
  if (data.length !== size ** 3) throw new Error(`file .cube có ${data.length} dòng màu, cần ${size ** 3}`);
  if (data.some((l) => l.split(/\s+/).some((x) => !Number.isFinite(Number(x))))) throw new Error("file .cube có số không hợp lệ");
  return { size };
}

export const cacheDir = (env = process.env) => join(env.MOTION_STUDIO_CACHE || join(homedir(), ".cache", "motion-studio"), "luts");
const catalogFile = (env) => join(hfSkills(env), "media-use", "luts", "index.json");

// The media-use looks that can be built offline: [{ id, description, tags, intensity, params }].
export function catalogLooks(env = process.env) {
  try {
    const j = JSON.parse(readFileSync(catalogFile(env), "utf8"));
    return (Array.isArray(j?.looks) ? j.looks : []).filter((l) => LUT_ID.test(String(l?.id)) && l.params && typeof l.params === "object")
      .map((l) => ({ id: l.id, description: String(l.description ?? ""), tags: Array.isArray(l.tags) ? l.tags.map(String) : [], intensity: Number.isFinite(l.intensity) ? l.intensity : 1, params: l.params }));
  } catch { return []; }
}

const cubesIn = (d) => {
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => CUBE_NAME.test(f) && statSync(join(d, f)).isFile()).sort();
};

// Every look offered for a project: files first (shared, then the project's), then the catalog.
// { id, name, source: "shared" | "project" | "catalog" | "builtin", file? (absolute), intensity }
export function listLuts({ root, dir = null, env = process.env } = {}) {
  const out = [{ id: "identity", name: "Không đổi màu (identity)", source: "builtin", intensity: 1 }];
  for (const f of cubesIn(join(root, "shared-assets", "luts"))) out.push({ id: `shared:${f}`, name: f, source: "shared", file: join(root, "shared-assets", "luts", f), intensity: 1 });
  if (dir) for (const f of cubesIn(join(dir, "assets", "luts"))) out.push({ id: `project:${f}`, name: f, source: "project", file: join(dir, "assets", "luts", f), intensity: 1 });
  for (const l of catalogLooks(env)) out.push({ id: l.id, name: l.description || l.id, source: "catalog", intensity: l.intensity, tags: l.tags });
  return out;
}

function writeCached(text, id, env) {
  const d = cacheDir(env);
  mkdirSync(d, { recursive: true });
  const f = join(d, `${id}-${createHash("sha256").update(text).digest("hex").slice(0, 12)}.cube`);
  if (!existsSync(f)) {
    const tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, f);
  }
  return f;
}

const inside = (f, base) => { try { const r = realpathSync(f), b = realpathSync(base); return r === b || r.startsWith(b + sep); } catch { return false; } };

// The absolute .cube for a look id of listLuts, plus the sha256 of its content (so the output
// name changes when the file changes). Throws with .status 400 for an unknown id.
export function resolveLut(id, { root, dir = null, env = process.env } = {}) {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (typeof id !== "string" || !id) throw bad("grade: cần lut");
  let file;
  if (id === "identity") file = writeCached(buildCube({}), "identity", env);
  else if (id.startsWith("shared:") || id.startsWith("project:")) {
    const [where, name] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if (!CUBE_NAME.test(name) || basename(name) !== name) throw bad(`lut "${id}" không hợp lệ`);
    if (where === "project" && !dir) throw bad("lut project: cần dự án");
    const base = where === "shared" ? join(root, "shared-assets", "luts") : join(dir, "assets", "luts");
    const src = join(base, name);
    if (!existsSync(src) || !inside(src, base)) throw bad(`không có lut ${id}`);
    const text = readFileSync(src, "utf8");
    try { parseCube(text); } catch (e) { throw bad(`${id}: ${e.message}`); }
    // A copy under the cache, so the path handed to ffmpeg's filter graph is always plain.
    file = writeCached(text, name.replace(/\.cube$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "lut", env);
  } else {
    const look = catalogLooks(env).find((l) => l.id === id);
    if (!look) throw bad(`không có lut "${id}" (xem GET /api/fx/luts)`);
    file = writeCached(buildCube(look.params), look.id, env);
  }
  if (!SAFE_PATH.test(file)) throw Object.assign(new Error(`thư mục cache LUT có ký tự ffmpeg không nhận (${file}); đặt MOTION_STUDIO_CACHE sang đường khác`), { status: 500 });
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  return { file, sha };
}
