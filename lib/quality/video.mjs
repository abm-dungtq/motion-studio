// lib/quality/video.mjs — video checks of every receipt (lib/quality.mjs), plus the ffmpeg helpers,
// thresholds and expectations that audio.mjs and image.mjs share.
//   duration-match  ffprobe: within one frame of the expected duration (when one is set)
//   resolution-fps  ffprobe: expected width, height and fps (when set)
//   black-frames    blackdetect=d=0.5:pix_th=0.10: no black run ≥ 0.5 s, unless allowed
//   frozen-frames   freezedetect=n=-60dB:d=1: no frozen run ≥ 1 s, unless allowed (a freeze-frame)
// A video over 10 minutes is sampled for black and frozen frames: three 30 s windows.
// The list of gates, the receipt shape (input, command, output, hash, probe, gate) and the use of
// ffmpeg detectors follow kinocut's quality guardrails and video receipts
// (https://github.com/KyaniteLabs/kinocut, Apache-2.0, kinocut/quality_guardrails.py); the
// thresholds above are Motion Studio's, tuned for short AI-made videos.
// Each check has a level: "fail" blocks (verdict fail), "warn" only warns (verdict warn).
// Thresholds: studio.json "quality" (lib/config.mjs state file) overrides DEFAULTS key by key.
// Expectations: expect(file, { duration, width, height, fps, allow_black, allow_freeze,
// allow_silence }) before writeReceipt(), forget(file) after; withExpected() does both.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readState } from "../config.mjs";

export const DEFAULTS = Object.freeze({
  black_min_s: 0.5, black_pix_th: 0.10,
  freeze_noise_db: -60, freeze_min_s: 1,
  silence_db: -50, silence_min_s: 2,
  loudness_min: -23, loudness_max: -9,
  peak_max_db: -0.1,
  alpha_min_pct: 3, alpha_max_pct: 97,
  min_side_px: 512,
  sample_over_s: 600, sample_window_s: 30,
});

// DEFAULTS with the numeric keys of studio.json "quality" that are finite numbers.
export function thresholds(state = readState()) {
  const q = state?.quality;
  const out = { ...DEFAULTS };
  if (q && typeof q === "object") for (const k of Object.keys(DEFAULTS)) if (Number.isFinite(q[k])) out[k] = q[k];
  return out;
}

const want = new Map(); // absolute path → expectation
export const expect = (file, e = {}) => { want.set(resolve(file), { ...e }); };
export const forget = (file) => { want.delete(resolve(file)); };
export const expectation = (file) => want.get(resolve(file)) ?? {};
export async function withExpected(files, e, fn) {
  for (const f of files) expect(f, e);
  try { return await fn(); } finally { for (const f of files) forget(f); }
}

const bin = (name) => (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name);
const TIMEOUT_MS = 10 * 60000;

// Runs ffmpeg with -nostats on file and a filter; resolves its stderr (where detectors log).
export function ffmpegLog(args, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((res, rej) => {
    execFile(bin("ffmpeg"), ["-hide_banner", "-nostats", "-nostdin", ...args], { encoding: "utf8", timeout, maxBuffer: 64 << 20, shell: false }, (err, _out, stderr) => {
      if (err && !stderr) return rej(new Error(`ffmpeg: ${err.message}`));
      if (err) return rej(new Error(`ffmpeg lỗi: ${String(stderr).trim().split("\n").slice(-2).join(" ")}`));
      res(String(stderr));
    });
  });
}

// { duration, width, height, fps, pix_fmt, hasVideo, hasAudio } or null when ffprobe cannot read it.
export function probeStreams(file) {
  return new Promise((res) => {
    execFile(bin("ffprobe"), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8", timeout: 30000, maxBuffer: 8 << 20, shell: false }, (err, stdout) => {
      if (err) return res(null);
      try {
        const j = JSON.parse(stdout);
        const v = (j.streams ?? []).find((s) => s.codec_type === "video" && !s.disposition?.attached_pic) ?? null;
        const a = (j.streams ?? []).find((s) => s.codec_type === "audio") ?? null;
        const [n, d] = String(v?.avg_frame_rate || v?.r_frame_rate || "0/1").split("/").map(Number);
        const fps = d > 0 && n > 0 ? n / d : null;
        const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration);
        res({ duration: Number.isFinite(dur) ? dur : null, width: v?.width ?? null, height: v?.height ?? null, fps, pix_fmt: v?.pix_fmt ?? null, hasVideo: Boolean(v), hasAudio: Boolean(a) });
      } catch { res(null); }
    });
  });
}

const r2 = (x) => Math.round(x * 100) / 100;
// [[start, length]] windows: the whole file, or three windows when it is long.
export function windows(duration, t = thresholds()) {
  if (!(duration > t.sample_over_s)) return [[0, null]];
  const w = t.sample_window_s;
  return [0.1, 0.5, 0.85].map((f) => [r2(Math.max(0, duration * f - w / 2)), w]);
}
const cut = ([ss, len]) => [...(ss ? ["-ss", String(ss)] : []), ...(len ? ["-t", String(len)] : [])];
const where = (ws) => (ws.length > 1 ? ` (lấy mẫu ${ws.length} đoạn ${ws[0][1]} s)` : "");

// Runs a video detector over the windows; returns the runs [{ start, length }] the parse found.
async function detect(file, filter, parse, ws) {
  const runs = [];
  for (const w of ws) {
    const log = await ffmpegLog([...cut(w), "-i", file, "-map", "0:v:0", "-vf", filter, "-an", "-f", "null", "-"]);
    for (const r of parse(log)) runs.push({ start: r2(w[0] + r.start), length: r2(r.length) });
  }
  return runs;
}

export function parseBlack(log) {
  return [...log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)].map((m) => ({ start: Number(m[1]), length: Number(m[3]) }));
}
export function parseFreeze(log) {
  const starts = [...log.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const lens = [...log.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // A freeze that lasts to the end has a start and no duration line.
  return starts.map((s, i) => ({ start: s, length: lens[i] ?? null }));
}
const fmtRuns = (runs) => runs.slice(0, 5).map((r) => `${r.start}s${r.length != null ? ` (${r.length}s)` : " → hết"}`).join(", ") + (runs.length > 5 ? `, … ${runs.length} đoạn` : "");

// A file ffprobe cannot read already fails probe-readable (basic.mjs); the others skip it.
export const UNREADABLE = Object.freeze({ pass: true, detail: "bỏ qua: ffprobe không đọc được (xem probe-readable)" });

export const CHECKS = [
  {
    id: "duration-match", level: "fail",
    applies: (_f, kind) => kind === "video" || kind === "audio",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      const e = expectation(file);
      if (!Number.isFinite(e.duration)) return { pass: true, level: "fail", detail: `${m.duration?.toFixed(3) ?? "?"} s (không có thời lượng mong đợi)` };
      const fps = e.fps ?? m.fps ?? 30;
      const off = Math.abs((m.duration ?? 0) - e.duration);
      return { pass: off <= 1 / fps + 1e-6, level: "fail", detail: `${m.duration?.toFixed(3)} s, mong đợi ${e.duration} s, lệch ${off.toFixed(3)} s (cho phép 1 khung = ${(1 / fps).toFixed(3)} s)` };
    },
  },
  {
    id: "resolution-fps", level: "fail",
    applies: (_f, kind) => kind === "video",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      const got = `${m.width}x${m.height} ${m.fps ? r2(m.fps) : "?"}fps`;
      const e = expectation(file);
      const bad = [];
      if (Number.isFinite(e.width) && e.width !== m.width) bad.push(`rộng ${m.width} ≠ ${e.width}`);
      if (Number.isFinite(e.height) && e.height !== m.height) bad.push(`cao ${m.height} ≠ ${e.height}`);
      if (Number.isFinite(e.fps) && !(Math.abs((m.fps ?? 0) - e.fps) < 0.01)) bad.push(`fps ${m.fps ? r2(m.fps) : "?"} ≠ ${e.fps}`);
      const asked = [e.width, e.height, e.fps].some(Number.isFinite);
      return { pass: !bad.length, level: "fail", detail: bad.length ? `${got}: ${bad.join(", ")}` : `${got}${asked ? " khớp" : " (không có thông số mong đợi)"}` };
    },
  },
  {
    id: "black-frames", level: "fail",
    applies: (_f, kind) => kind === "video",
    async run(file) {
      const t = thresholds();
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      if (!m.hasVideo) return { pass: true, level: "fail", detail: "không có hình" };
      const ws = windows(m.duration, t);
      const runs = await detect(file, `blackdetect=d=${t.black_min_s}:pix_th=${t.black_pix_th}`, parseBlack, ws);
      if (!runs.length) return { pass: true, level: "fail", detail: `không có đoạn đen ≥ ${t.black_min_s} s${where(ws)}` };
      const allowed = expectation(file).allow_black === true;
      return { pass: allowed, level: "fail", detail: `đoạn đen: ${fmtRuns(runs)}${allowed ? " (được phép)" : ""}${where(ws)}` };
    },
  },
  {
    id: "frozen-frames", level: "fail",
    applies: (_f, kind) => kind === "video",
    async run(file) {
      const t = thresholds();
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      if (!m.hasVideo) return { pass: true, level: "fail", detail: "không có hình" };
      const ws = windows(m.duration, t);
      const runs = await detect(file, `freezedetect=n=${t.freeze_noise_db}dB:d=${t.freeze_min_s}`, parseFreeze, ws);
      if (!runs.length) return { pass: true, level: "fail", detail: `không có đoạn đứng hình ≥ ${t.freeze_min_s} s${where(ws)}` };
      const allowed = expectation(file).allow_freeze === true;
      return { pass: allowed, level: "fail", detail: `đứng hình: ${fmtRuns(runs)}${allowed ? " (freeze-frame có chủ đích)" : ""}${where(ws)}` };
    },
  },
];
