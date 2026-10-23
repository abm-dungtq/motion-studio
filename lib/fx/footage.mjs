// lib/fx/footage.mjs — deterministic footage edits, rendered ahead of time with ffmpeg into
// <root>/footage/cut/ (the workspace rule: cut clips live there) with a receipt in the project.
//
//   trim    { in, out }                       one range, snapped to the frame grid
//   speed   { anchors: [{ t, rate }], audio }  piecewise-constant speed: anchor i holds rate from
//                                             its t to the next anchor (or the end); rate 0.25–4.
//                                             Muted by default (B-roll); audio: true runs atempo
//                                             and says so in warnings
//   freeze  { at, duration, audio }            holds the frame at `at` for `duration` seconds
//                                             (silence under it); the receipt sets allow_freeze
//   grade   { lut | preset, intensity }        lut3d (lib/fx/lut.mjs) or an eq/colorbalance
//                                             preset, mixed with the source by intensity 0–1
//   reframe { aspect, anchors: [{ t, x, y }] } crop of the target aspect whose centre (x, y in
//                                             0–1 of the frame) moves linearly between anchors,
//                                             scaled to 1080×1920, 1920×1080, 1080×1080 or 1080×1350
//
// Every edit encodes libx264 -crf 14 -preset slow yuv420p at the source frame rate (cfr),
// without metadata, so the same input and params always give the same file. The output name is
// <stem>-<op>-<sha8>.mp4, sha8 of the normalised params, the source (path, size, mtime) and the
// engine; an output that already exists is reused, never rendered again. trim goes through the
// provider's cut command (apply-edl, one range) when the source has audio and the command exists.
//
// buildArgs(op, params, probe, paths) is pure (tests read the ffmpeg argv); runFootage does the
// work. As a job: node lib/fx/footage.mjs run '<json>' prints log lines, then RESULT <json>.
// Speed-ramp and freeze parameter names follow the anchors/hold vocabulary of the OpenCut
// (MIT) and Kdenlive (GPL-3.0) speed and freeze effects; no code is copied from them.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { listReceipts, writeReceipt } from "../receipts.mjs";
import { resolveLut } from "./lut.mjs";

export const OPS = ["trim", "speed", "freeze", "grade", "reframe"];
export const ASPECTS = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };
export const PRESETS = {
  warm: "colorbalance=rs=0.06:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.05",
  cool: "colorbalance=rs=-0.05:bs=0.06:rm=-0.03:bm=0.04",
  punchy: "eq=contrast=1.15:saturation=1.2",
  mono: "hue=s=0,eq=contrast=1.1",
  faded: "eq=contrast=0.85:brightness=0.03:saturation=0.85",
};
export const RESULT_PREFIX = "RESULT ";
const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".mkv", ".webm"];
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;
const SELF = fileURLToPath(import.meta.url);

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const num = (v, what) => { const n = Number(v); if (typeof v === "boolean" || v === null || v === "" || !Number.isFinite(n)) throw bad(`${what} phải là số`); return n; };
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const f6 = (x) => r6(x).toFixed(6);
const bin = (name) => (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name);

function run(cmd, args, { timeout = FFMPEG_TIMEOUT_MS } = {}) {
  return new Promise((res) => {
    execFile(cmd, args, { encoding: "utf8", timeout, maxBuffer: 32 << 20, shell: false }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr, error: err }));
  });
}

// { duration, width, height, rate ("30000/1001"), fps, hasAudio, pix_fmt } of a video file.
export async function probeVideo(file) {
  const r = await run(bin("ffprobe"), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeout: 20000 });
  if (r.code) throw Object.assign(new Error(`ffprobe không đọc được ${basename(file)}: ${String(r.stderr).trim().slice(0, 300)}`), { status: 422 });
  const j = JSON.parse(r.stdout);
  const v = (j.streams ?? []).find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!v) throw Object.assign(new Error(`${basename(file)} không có hình`), { status: 422 });
  const rate = v.r_frame_rate && v.r_frame_rate !== "0/0" ? v.r_frame_rate : v.avg_frame_rate;
  const [a, b] = String(rate).split("/").map(Number);
  const fps = b ? a / b : a;
  const duration = Number(j.format?.duration ?? v.duration);
  if (!(fps > 0) || !(duration > 0)) throw Object.assign(new Error(`${basename(file)}: không đọc được fps hoặc độ dài`), { status: 422 });
  return { duration, width: v.width, height: v.height, rate: String(rate), fps, hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio"), pix_fmt: v.pix_fmt ?? null };
}

const snap = (t, fps) => Math.round(t * fps) / fps;
const even = (x) => Math.max(2, Math.floor(x / 2) * 2);

// The checked, frame-snapped params of op for a source described by probe. Throws 400.
export function normalizeParams(op, params = {}, probe) {
  if (!OPS.includes(op)) throw bad(`op phải là ${OPS.join(" | ")}`);
  if (params == null || typeof params !== "object" || Array.isArray(params)) throw bad("params phải là object");
  const { duration: D, fps } = probe;
  const frame = 1 / fps;
  if (op === "trim") {
    const a = snap(num(params.in, "in"), fps), b = snap(num(params.out, "out"), fps);
    if (a < 0) throw bad("in phải ≥ 0");
    if (b <= a) throw bad("out phải lớn hơn in");
    if (b > D + 0.001) throw bad(`out ${b}s vượt độ dài clip (${r6(D)}s)`);
    return { in: r6(a), out: r6(Math.min(b, D)) };
  }
  if (op === "speed") {
    if (!Array.isArray(params.anchors) || !params.anchors.length || params.anchors.length > 32) throw bad("anchors: mảng 1–32 điểm { t, rate }");
    const list = params.anchors.map((x, i) => {
      if (!x || typeof x !== "object") throw bad(`anchors[${i}] phải là { t, rate }`);
      const t = snap(num(x.t, `anchors[${i}].t`), fps), rate = num(x.rate, `anchors[${i}].rate`);
      if (t < 0 || t >= D) throw bad(`anchors[${i}].t phải trong [0, ${r6(D)})`);
      if (rate < 0.25 || rate > 4) throw bad(`anchors[${i}].rate phải trong 0,25–4`);
      return { t: r6(t), rate: r6(rate) };
    }).sort((a, b) => a.t - b.t);
    for (let i = 1; i < list.length; i++) if (list[i].t - list[i - 1].t < frame - 1e-9) throw bad("hai điểm neo cách nhau ít hơn một khung");
    if (list[0].t > 0) list.unshift({ t: 0, rate: 1 });
    return { anchors: list, audio: params.audio === true };
  }
  if (op === "freeze") {
    const at = snap(num(params.at, "at"), fps), d = snap(num(params.duration, "duration"), fps);
    if (at < 0 || at > D - 2 * frame) throw bad(`at phải trong [0, ${r6(D - 2 * frame)}]`);
    if (d < frame || d > 30) throw bad("duration phải từ một khung tới 30 giây");
    return { at: r6(at), duration: r6(d), audio: params.audio !== false, allow_freeze: true };
  }
  if (op === "grade") {
    const hasLut = typeof params.lut === "string" && params.lut !== "", hasPreset = typeof params.preset === "string" && params.preset !== "";
    if (hasLut === hasPreset) throw bad(`grade: cần đúng một trong lut hoặc preset (${Object.keys(PRESETS).join(", ")})`);
    if (hasPreset && !PRESETS[params.preset]) throw bad(`preset phải là ${Object.keys(PRESETS).join(", ")}`);
    const intensity = params.intensity === undefined ? 1 : num(params.intensity, "intensity");
    if (intensity <= 0 || intensity > 1) throw bad("intensity phải trong (0, 1]");
    return hasLut ? { lut: params.lut, intensity: r6(intensity) } : { preset: params.preset, intensity: r6(intensity) };
  }
  // reframe
  if (!ASPECTS[params.aspect]) throw bad(`aspect phải là ${Object.keys(ASPECTS).join(", ")}`);
  const raw = params.anchors === undefined ? [{ t: 0, x: 0.5, y: 0.5 }] : params.anchors;
  if (!Array.isArray(raw) || !raw.length || raw.length > 32) throw bad("anchors: mảng 1–32 điểm { t, x, y }");
  const anchors = raw.map((p, i) => {
    if (!p || typeof p !== "object") throw bad(`anchors[${i}] phải là { t, x, y }`);
    const t = snap(num(p.t ?? 0, `anchors[${i}].t`), fps), x = num(p.x ?? 0.5, `anchors[${i}].x`), y = num(p.y ?? 0.5, `anchors[${i}].y`);
    if (t < 0 || t > D) throw bad(`anchors[${i}].t phải trong [0, ${r6(D)}]`);
    if (x < 0 || x > 1 || y < 0 || y > 1) throw bad(`anchors[${i}]: x, y là tâm khung cắt, trong 0–1`);
    return { t: r6(t), x: r6(x), y: r6(y) };
  }).sort((a, b) => a.t - b.t);
  for (let i = 1; i < anchors.length; i++) if (anchors[i].t === anchors[i - 1].t) throw bad("hai điểm neo trùng thời điểm");
  return { aspect: params.aspect, anchors };
}

// Speed factors for atempo, each within 0.5–2.0, whose product is rate.
export function atempoChain(rate) {
  const out = [];
  let r = rate;
  while (r > 2) { out.push(2); r /= 2; }
  while (r < 0.5) { out.push(0.5); r /= 0.5; }
  out.push(r6(r));
  return out;
}

// Piecewise-linear expression of t through [t_i, v_i] (constant before the first and after the last).
export function linearExpr(points) {
  const p = points.map(([t, v]) => [r6(t), Math.round(v)]);
  let e = String(p[p.length - 1][1]);
  for (let i = p.length - 2; i >= 0; i--) {
    const [t0, v0] = p[i], [t1, v1] = p[i + 1];
    e = v0 === v1 ? `if(lt(t,${t1}),${v0},${e})` : `if(lt(t,${t1}),${v0}+(${v1 - v0})*(t-${t0})/${r6(t1 - t0)},${e})`;
  }
  return p.length > 1 ? `if(lt(t,${p[0][0]}),${p[0][1]},${e})` : e;
}

// The crop window of an aspect inside a w×h frame.
export function cropBox(aspect, w, h) {
  const [ow, oh] = ASPECTS[aspect];
  const r = ow / oh;
  return w / h > r ? { cw: Math.min(w, even(h * r)), ch: even(h) } : { cw: even(w), ch: Math.min(h, even(w / r)) };
}

const VENC = (rate) => ["-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", rate, "-fps_mode", "cfr"];
const AENC = ["-c:a", "aac", "-b:a", "192k"];
const TAIL = (out) => ["-map_metadata", "-1", "-fflags", "+bitexact", "-movflags", "+faststart", out];

// Pure: { args (ffmpeg argv without the binary), expected_duration, expected: { width, height, fps }, warnings }.
// p are normalised params; paths = { src, out, lut } (lut: absolute .cube for grade with lut).
export function buildArgs(op, p, probe, { src, out, lut = null }) {
  const { duration: D, fps, rate, width, height, hasAudio } = probe;
  const head = ["-y", "-v", "error", "-nostdin", "-i", src];
  const expected = { width, height, fps: r6(fps) };
  const warnings = [];
  if (op === "trim") {
    const fc = [`[0:v]trim=start=${f6(p.in)}:end=${f6(p.out)},setpts=PTS-STARTPTS[v]`];
    if (hasAudio) fc.push(`[0:a]atrim=start=${f6(p.in)}:end=${f6(p.out)},asetpts=PTS-STARTPTS[a]`);
    return { args: [...head, "-filter_complex", fc.join(";"), "-map", "[v]", ...(hasAudio ? ["-map", "[a]", ...AENC] : ["-an"]), ...VENC(rate), ...TAIL(out)], expected_duration: r6(p.out - p.in), expected, warnings };
  }
  if (op === "speed") {
    const segs = p.anchors.map((a, i) => ({ a: a.t, b: i + 1 < p.anchors.length ? p.anchors[i + 1].t : D, rate: a.rate })).filter((s) => s.b - s.a > 1e-9);
    const audio = p.audio && hasAudio;
    if (p.audio && !hasAudio) warnings.push("clip không có tiếng; bỏ qua audio");
    if (audio) warnings.push("atempo giữ cao độ nhưng tiếng ở đoạn nhanh hoặc chậm nghe không tự nhiên; kiểm lại trước khi dùng");
    const fc = [`[0:v]split=${segs.length}${segs.map((_, i) => `[s${i}]`).join("")}`];
    if (audio) fc.push(`[0:a]asplit=${segs.length}${segs.map((_, i) => `[t${i}]`).join("")}`);
    segs.forEach((s, i) => {
      fc.push(`[s${i}]trim=start=${f6(s.a)}:end=${f6(s.b)},setpts=(PTS-STARTPTS)/${s.rate}[v${i}]`);
      if (audio) fc.push(`[t${i}]atrim=start=${f6(s.a)}:end=${f6(s.b)},asetpts=PTS-STARTPTS,${atempoChain(s.rate).map((x) => `atempo=${x}`).join(",")}[a${i}]`);
    });
    const pads = segs.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
    fc.push(`${pads}concat=n=${segs.length}:v=1:a=${audio ? 1 : 0}${audio ? "[vc][a]" : "[vc]"}`, `[vc]fps=${rate}[v]`);
    const total = segs.reduce((n, s) => n + (s.b - s.a) / s.rate, 0);
    return { args: [...head, "-filter_complex", fc.join(";"), "-map", "[v]", ...(audio ? ["-map", "[a]", ...AENC] : ["-an"]), ...VENC(rate), ...TAIL(out)], expected_duration: r6(total), expected, warnings };
  }
  if (op === "freeze") {
    const cutAt = f6(p.at + 1 / fps);
    const audio = p.audio && hasAudio;
    const fc = [
      "[0:v]split=2[f0][f1]",
      `[f0]trim=end=${cutAt},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${f6(p.duration)}[v0]`,
      `[f1]trim=start=${cutAt},setpts=PTS-STARTPTS[v1]`,
      "[v0][v1]concat=n=2:v=1:a=0[v]",
    ];
    if (audio) fc.push("[0:a]asplit=2[b0][b1]", `[b0]atrim=end=${f6(p.at)},asetpts=PTS-STARTPTS,apad=pad_dur=${f6(p.duration)}[a0]`, `[b1]atrim=start=${f6(p.at)},asetpts=PTS-STARTPTS[a1]`, "[a0][a1]concat=n=2:v=0:a=1[a]");
    return { args: [...head, "-filter_complex", fc.join(";"), "-map", "[v]", ...(audio ? ["-map", "[a]", ...AENC] : ["-an"]), ...VENC(rate), ...TAIL(out)], expected_duration: r6(D + p.duration), expected, warnings };
  }
  if (op === "grade") {
    if (p.lut && !lut) throw new Error("buildArgs grade: thiếu đường .cube");
    const g = p.lut ? `lut3d=file=${lut}:interp=tetrahedral` : PRESETS[p.preset];
    const fc = p.intensity >= 1
      ? `[0:v]${g},format=yuv420p[v]`
      : `[0:v]format=gbrp,split=2[o][g0];[g0]${g},format=gbrp[g];[g][o]blend=all_mode=normal:all_opacity=${p.intensity},format=yuv420p[v]`;
    return { args: [...head, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-c:a", "copy", ...VENC(rate), ...TAIL(out)], expected_duration: r6(D), expected, warnings };
  }
  // reframe
  const [ow, oh] = ASPECTS[p.aspect];
  const { cw, ch } = cropBox(p.aspect, width, height);
  const px = (c, full, size) => Math.min(full - size, Math.max(0, c * full - size / 2));
  const ex = linearExpr(p.anchors.map((a) => [a.t, px(a.x, width, cw)]));
  const ey = linearExpr(p.anchors.map((a) => [a.t, px(a.y, height, ch)]));
  const fc = `[0:v]crop=w=${cw}:h=${ch}:x='${ex}':y='${ey}',scale=${ow}:${oh}:flags=lanczos,setsar=1,format=yuv420p[v]`;
  return { args: [...head, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-c:a", "copy", ...VENC(rate), ...TAIL(out)], expected_duration: r6(D), expected: { width: ow, height: oh, fps: r6(fps) }, warnings };
}

const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const within = (f, base) => { const b = real(base); return Boolean(b) && (f === b || f.startsWith(b + sep)); };

// The absolute video file src names for a project, or throws 400/404. src is the id, rel or path
// of a file registered in .opus/media.json (media.mjs register), or a relative path: under
// footage/ or shared-assets/ of root, else inside the project. Realpaths must stay in those places.
export function resolveSource(root, dir, src, media = []) {
  if (typeof src !== "string" || !src || src.includes("\0") || src.includes("\\")) throw bad("src: cần id hoặc đường dẫn của clip");
  const bases = [join(root, "footage"), join(root, "shared-assets"), dir];
  const reg = media.find((m) => m && (m.id === src || m.rel === src || m.path === src));
  let file;
  if (reg) file = reg.path;
  else {
    if (isAbsolute(src)) throw bad("src tuyệt đối phải là file đã đăng ký (Footage → Thêm)");
    const parts = src.split("/").filter(Boolean);
    if (!parts.length || parts.some((x) => x === ".." || x === "." || x.startsWith("."))) throw bad("src: đường dẫn không hợp lệ");
    file = parts[0] === "footage" || parts[0] === "shared-assets" ? join(root, ...parts) : join(dir, ...parts);
  }
  const r = real(file);
  if (!r) throw Object.assign(new Error(`không có file ${src}`), { status: 404 });
  if (!bases.some((b) => within(r, b))) throw Object.assign(new Error("src phải nằm trong footage/, shared-assets/ hoặc dự án"), { status: 403 });
  if (!statSync(r).isFile() || !VIDEO_EXT.includes(extname(r).toLowerCase())) throw bad(`src phải là video ${VIDEO_EXT.join(" ")}`);
  return r;
}

export const cutDir = (root) => join(root, "footage", "cut");
const stemOf = (file) => basename(file, extname(file)).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 60) || "clip";

// <root>/footage/cut/<stem>-<op>-<sha8>.mp4 for these normalised params and source.
export function outputFile(root, src, op, p, { engine = "ffmpeg", lutSha = null } = {}) {
  const st = statSync(src);
  const key = JSON.stringify({ v: 1, op, p, engine, lutSha, src, size: st.size, mtime: Math.round(st.mtimeMs) });
  return join(cutDir(root), `${stemOf(src)}-${op}-${createHash("sha256").update(key).digest("hex").slice(0, 8)}.mp4`);
}

const relTo = (base, f) => { const r = relative(base, f); return r && !r.startsWith("..") && !isAbsolute(r) ? r.split(sep).join("/") : f; };

// Runs one edit. → { ok: true, op, out (absolute), rel (from root), cached, expected_duration,
// actual_duration, expected, warnings, receipt: { file, id, pass } }. Throws on bad input or a
// failed render (no partial file is left behind).
export async function runFootage({ root, dir, src, op, params, cut = null, actor = "human", env = process.env, log = () => {} }) {
  const started = new Date();
  const probe = await probeVideo(src);
  const p = normalizeParams(op, params, probe);
  const lut = op === "grade" && p.lut ? resolveLut(p.lut, { root, dir, env }) : null;
  const viaCut = op === "trim" && Boolean(cut) && probe.hasAudio;
  const out = outputFile(root, src, op, p, { engine: viaCut ? "cut" : "ffmpeg", lutSha: lut?.sha ?? null });
  const plan = buildArgs(op, p, probe, { src, out, lut: lut?.file ?? null });
  const receiptParams = { ...p, expected_duration: plan.expected_duration, expected: plan.expected, ...(op === "freeze" ? { allow_freeze: true } : {}) };
  const inputs = { src: relTo(root, src), source_duration: probe.duration };

  if (existsSync(out)) {
    const old = listReceipts(dir, { op: `fx-${op}`, limit: 500 }).find((r) => (r.outputs ?? []).some((o) => o.path === out || o.path === relTo(dir, out)));
    log(`fx: dùng lại ${relTo(root, out)} (đã render với đúng tham số này)`);
    const receipt = old ? { file: old.file, id: old.id, pass: old.pass } : await writeReceipt(dir, { op: `fx-${op}`, actor, tool: { name: "ffmpeg", cached: true }, params: receiptParams, inputs, outputs: [out], started });
    const actual = (await probeVideo(out)).duration;
    return { ok: true, op, out, rel: relTo(root, out), cached: true, expected_duration: plan.expected_duration, actual_duration: actual, expected: plan.expected, warnings: plan.warnings, receipt: { file: receipt.file, id: receipt.id, pass: receipt.pass } };
  }

  mkdirSync(cutDir(root), { recursive: true });
  const partial = join(cutDir(root), `.${basename(out, ".mp4")}.partial.mp4`);
  let tool;
  try {
    if (viaCut) {
      const edl = join(tmpdir(), `ms-fx-edl-${process.pid}-${Date.now()}.json`);
      writeFileSync(edl, JSON.stringify({ sources: { a: src }, ranges: [{ source: "a", start: p.in, end: p.out }] }));
      log(`fx: trim qua lệnh cut của provider → ${relTo(root, out)}`);
      const r = await run(process.execPath, [cut, "apply-edl", "--edl", edl, "--out", partial]);
      rmSync(edl, { force: true });
      if (r.code) throw new Error(`cut apply-edl lỗi (exit ${r.code}): ${String(r.stderr || r.stdout).trim().slice(-600)}`);
      tool = { name: "cut", command: "apply-edl" };
    } else {
      const args = plan.args.map((a) => (a === out ? partial : a));
      log(`fx: ${op} ${relTo(root, src)} → ${relTo(root, out)}`);
      const r = await run(bin("ffmpeg"), args);
      if (r.code) throw new Error(`ffmpeg lỗi (exit ${r.code}): ${String(r.stderr).trim().slice(-600)}`);
      tool = { name: "ffmpeg", args: plan.args.slice(0, -1) };
    }
    const got = await probeVideo(partial);
    const tol = 1 / probe.fps + 0.002;
    if (Math.abs(got.duration - plan.expected_duration) > tol + (op === "speed" ? 1 / probe.fps : 0)) throw new Error(`độ dài ra ${r6(got.duration)}s, cần ${plan.expected_duration}s`);
    if (got.width !== plan.expected.width || got.height !== plan.expected.height) throw new Error(`khung ra ${got.width}×${got.height}, cần ${plan.expected.width}×${plan.expected.height}`);
    renameSync(partial, out);
    const receipt = await writeReceipt(dir, { op: `fx-${op}`, actor, tool, params: receiptParams, inputs, outputs: [out], started });
    log(`fx: xong ${relTo(root, out)} (${r6(got.duration)}s), biên nhận ${receipt.file}`);
    return { ok: true, op, out, rel: relTo(root, out), cached: false, expected_duration: plan.expected_duration, actual_duration: got.duration, expected: plan.expected, warnings: plan.warnings, receipt: { file: receipt.file, id: receipt.id, pass: receipt.pass } };
  } finally {
    rmSync(partial, { force: true });
  }
}

// Job entry: node lib/fx/footage.mjs run '<json>' with { root, dir, src, op, params, cut, actor }.
const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(SELF); } catch { return false; } };
if (isMain()) {
  const [cmd, json] = process.argv.slice(2);
  if (cmd !== "run" || !json) { console.error("usage: node lib/fx/footage.mjs run '<json>'"); process.exit(2); }
  let arg;
  try { arg = JSON.parse(json); } catch { console.error("JSON không hợp lệ"); process.exit(2); }
  runFootage({ ...arg, log: (l) => console.log(l) }).then((r) => {
    console.log(RESULT_PREFIX + JSON.stringify(r));
  }, (e) => {
    console.error(`fx: ${e.message}`);
    console.log(RESULT_PREFIX + JSON.stringify({ ok: false, error: e.message, status: e.status ?? 500 }));
    process.exit(1);
  });
}
