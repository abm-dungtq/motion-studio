// lib/anime/keying.mjs — chroma key for generated character poses: measure the real background
// colour of a PNG (generators drift: #0047FF asked, #004FFD or #004CFE returned), build the ffmpeg
// filter chain (lanczos scale, chromakey, despill, rgba) and run it without a shell.
//
//   measure(png)            → { color: "0x004CFE", rgb: [0, 76, 254], spill: "blue" | "green" | null }
//                             per-channel median of the four 16×16 corner blocks
//   filterChain(opts)       → the -filter_complex graph ending in [out]
//   key(src, dst, opts)     → { file, filter }; dst must not exist (the result is never written
//                             over another file), ffmpeg runs 60 s at most
//   probeSize(file)         → { width, height }
//   upscaler(env)           → path of realesrgan-ncnn-vulkan on the search path, else null
//   upscale(src, dst, opts) → runs it (4×, anime model); Studio never installs it
//
// Green screens are a bad idea for green-haired characters; blue is the default. edge: true keeps
// the inside of the character as drawn and despills only a thin rim (alpha eroded three times),
// for costumes that the full despill turns pink.
import { spawn } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { exec, which } from "../agents/run.mjs";

const TIMEOUT_MS = 60000;
const CORNER = 16;
export const DEFAULTS = { sim: 0.18, blend: 0.06, mix: 0.6, expand: 0.1 };

// ffmpeg is looked up on PATH and the usual install folders, not on the agent CLI search path
// (MOTION_STUDIO_AGENT_PATH may be narrowed to a few agent folders).
const findTool = (name, env) => {
  for (const d of [...String(env.PATH ?? "").split(delimiter).filter(Boolean), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) {
    const f = join(d, name);
    if (existsSync(f)) return f;
  }
  return name;
};
export const ffmpegBin = (env = process.env) => findTool("ffmpeg", env);
export const ffprobeBin = (env = process.env) => findTool("ffprobe", env);

const fail = (msg, status = 500) => Object.assign(new Error(msg), { status });
const lastLine = (r) => String(r.stderr || r.stdout || "").trim().split("\n").at(-1)?.slice(0, 300) ?? "";
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
export const toHex = ([r, g, b]) => `0x${hex2(r)}${hex2(g)}${hex2(b)}`;

// "#004CFE", "0x004CFE" or "004CFE" → [0, 76, 254]; anything else throws 400.
export function parseColor(c) {
  const m = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(String(c ?? "").trim());
  if (!m) throw fail(`màu nền "${c}" không hợp lệ (dạng #0047FF)`, 400);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Which despill the colour needs: the channel that clearly leads.
export function spillOf([r, g, b]) {
  if (b > r && b > g && b - Math.max(r, g) >= 40) return "blue";
  if (g > r && g > b && g - Math.max(r, b) >= 40) return "green";
  return null;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : Math.round((s[k - 1] + s[k]) / 2); };

export async function probeSize(file, { env = process.env } = {}) {
  const r = await exec(ffprobeBin(env), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file], { env, timeout: 20000 });
  const m = /^(\d+)x(\d+)/.exec(String(r.stdout).trim());
  if (r.code !== 0 || !m) throw fail(`ffprobe không đọc được ${file}: ${r.error ?? lastLine(r)}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export async function measure(png, { env = process.env } = {}) {
  const { width, height } = await probeSize(png, { env });
  const n = Math.max(1, Math.min(CORNER, width >> 1, height >> 1));
  const graph = `[0:v]format=rgb24,split=4[a][b][c][d];[a]crop=${n}:${n}:0:0[a1];[b]crop=${n}:${n}:iw-${n}:0[b1];[c]crop=${n}:${n}:0:ih-${n}[c1];[d]crop=${n}:${n}:iw-${n}:ih-${n}[d1];[a1][b1][c1][d1]hstack=inputs=4[out]`;
  const r = await execBuf(ffmpegBin(env), ["-v", "error", "-i", png, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { env });
  const want = n * n * 4 * 3;
  if (r.code !== 0 || r.out.length < want) throw fail(`không đo được màu nền của ${png}: ${r.err.trim().split("\n").at(-1) ?? `exit ${r.code}`}`);
  const ch = [[], [], []];
  for (let i = 0; i < want; i += 3) for (let k = 0; k < 3; k++) ch[k].push(r.out[i + k]);
  const rgb = ch.map(median);
  return { color: toHex(rgb), rgb, spill: spillOf(rgb) };
}

// ffmpeg with binary stdout (exec() of the agent runner decodes text).
function execBuf(cmd, args, { env }) {
  return new Promise((resolve) => {
    const chunks = []; let err = "";
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => { if (err.length < 65536) err += c; });
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: null, out: Buffer.alloc(0), err: e.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out: Buffer.concat(chunks), err }); });
  });
}

const num = (v, lo, hi, what) => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < lo || x > hi) throw fail(`${what} phải trong khoảng ${lo}–${hi}`, 400);
  return x;
};

export function filterChain({ color, width = null, sim = DEFAULTS.sim, blend = DEFAULTS.blend, spill = undefined, mix = DEFAULTS.mix, expand = DEFAULTS.expand, edge = false } = {}) {
  const rgb = parseColor(color);
  const sp = spill === undefined ? spillOf(rgb) : spill;
  if (sp != null && sp !== "blue" && sp !== "green") throw fail(`spill là blue, green hoặc null`, 400);
  const w = width == null ? null : Math.round(num(width, 16, 16384, "width"));
  const scale = w ? `scale=${w}:-2:flags=lanczos,` : "";
  const ck = `chromakey=${toHex(rgb)}:${num(sim, 0.01, 1, "sim")}:${num(blend, 0, 1, "blend")}`;
  const ds = sp ? `despill=type=${sp}:mix=${num(mix, 0, 1, "mix")}:expand=${num(expand, 0, 1, "expand")}` : null;
  if (!ds) return `[0:v]${scale}${ck},format=rgba[out]`;
  if (!edge) return `[0:v]${scale}${ck},${ds},format=rgba[out]`;
  return `[0:v]${scale}${ck},format=rgba,split=3[k][k2][k3];[k2]${ds},format=rgba[d];[k3]alphaextract,erosion,erosion,erosion[m];[k][m]alphamerge[in];[d][in]overlay=format=auto,format=rgba[out]`;
}

// Writes dst through a temp file in a fresh folder, then copies it in only if dst is still free.
export async function key(src, dst, opts = {}) {
  const env = opts.env ?? process.env;
  if (existsSync(dst)) throw fail(`đã có ${dst}, không ghi đè`, 409);
  const filter = filterChain(opts);
  const tmp = mkdtempSync(join(tmpdir(), "ms-key-"));
  try {
    const out = join(tmp, "out.png");
    const r = await exec(ffmpegBin(env), ["-v", "error", "-y", "-i", src, "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", out], { env, timeout: TIMEOUT_MS });
    if (r.code !== 0 || !existsSync(out)) throw fail(`ffmpeg tách nền lỗi: ${r.error ?? lastLine(r)}`);
    try { copyFileSync(out, dst, constants.COPYFILE_EXCL); } catch (e) { throw e.code === "EEXIST" ? fail(`đã có ${dst}, không ghi đè`, 409) : e; }
    return { file: dst, filter };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export const upscaler = (env = process.env) => { const w = which("realesrgan-ncnn-vulkan", env); return w && !w.broken ? w.path : null; };

// 4× with the anime model; the caller then scales to the exact width with lanczos.
export async function upscale(bin, src, dst, { env = process.env, timeout = 5 * 60000 } = {}) {
  const r = await exec(bin, ["-i", src, "-o", dst, "-n", "realesrgan-x4plus-anime", "-s", "4"], { env, timeout, cwd: dirname(dst) });
  if (r.code !== 0 || !existsSync(dst)) throw fail(`realesrgan-ncnn-vulkan lỗi: ${r.error ?? lastLine(r)}`);
  return dst;
}
