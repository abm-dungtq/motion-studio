// lib/quality/audio.mjs — audio checks of every receipt (lib/quality.mjs). Shared helpers,
// thresholds (studio.json "quality") and expectations live in video.mjs; source notes there.
//   silence   silencedetect=n=-50dB:d=2 on audio and on video with sound: no silence ≥ 2 s in
//             the middle (at the head or the tail is fine), unless allow_silence
//   loudness  ebur128 integrated loudness in [-23, -9] LUFS; a warning only, never blocks
//   clipping  astats overall peak below -0.1 dBFS
import { ffmpegLog, probeStreams, thresholds, expectation, UNREADABLE } from "./video.mjs";

const EDGE_S = 0.05;
const r2 = (x) => Math.round(x * 100) / 100;

// [{ start, end }] from silencedetect; end is null for a silence that lasts to the end.
export function parseSilence(log) {
  const out = [];
  for (const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const t = Math.max(0, Number(m[2]));
    if (m[1] === "start") out.push({ start: t, end: null });
    else if (out.length && out.at(-1).end == null) out.at(-1).end = t;
  }
  return out;
}

// The silences that neither start at the head nor reach the tail.
export const interior = (runs, duration) => runs.filter((r) => r.start > EDGE_S && r.end != null && (duration == null || r.end < duration - EDGE_S));

export const parseLoudness = (log) => { const all = [...log.matchAll(/^\s*I:\s+(-?[\d.]+|-inf)\s+LUFS/gm)]; const v = all.at(-1)?.[1]; return v == null ? null : v === "-inf" ? -Infinity : Number(v); };
export const parsePeak = (log) => { const all = [...log.matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)]; const v = all.at(-1)?.[1]; return v == null ? null : v === "-inf" ? -Infinity : Number(v); };

export const CHECKS = [
  {
    id: "silence", level: "fail",
    applies: (_f, kind) => kind === "audio" || kind === "video",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      if (!m.hasAudio) return { pass: true, level: "fail", detail: "không có tiếng" };
      const t = thresholds();
      const log = await ffmpegLog(["-i", file, "-map", "0:a:0", "-af", `silencedetect=n=${t.silence_db}dB:d=${t.silence_min_s}`, "-vn", "-f", "null", "-"]);
      const mid = interior(parseSilence(log), m.duration);
      if (!mid.length) return { pass: true, level: "fail", detail: `không có đoạn im ≥ ${t.silence_min_s} s ở giữa` };
      const allowed = expectation(file).allow_silence === true;
      return { pass: allowed, level: "fail", detail: `im lặng ở giữa: ${mid.slice(0, 5).map((r) => `${r2(r.start)}–${r2(r.end)} s`).join(", ")}${allowed ? " (được phép)" : ""}` };
    },
  },
  {
    id: "loudness", level: "warn",
    applies: (_f, kind) => kind === "audio",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      const t = thresholds();
      const i = parseLoudness(await ffmpegLog(["-i", file, "-map", "0:a:0", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]));
      if (i == null) return { pass: false, level: "warn", detail: "ebur128 không trả độ to" };
      const ok = i >= t.loudness_min && i <= t.loudness_max;
      return { pass: ok, level: "warn", detail: `${Number.isFinite(i) ? i.toFixed(1) : "-inf"} LUFS (nên trong [${t.loudness_min}, ${t.loudness_max}])` };
    },
  },
  {
    id: "clipping", level: "fail",
    applies: (_f, kind) => kind === "audio",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      const t = thresholds();
      const peak = parsePeak(await ffmpegLog(["-i", file, "-map", "0:a:0", "-af", "astats=measure_perchannel=none", "-f", "null", "-"]));
      if (peak == null) return { pass: false, level: "fail", detail: "astats không trả peak" };
      return { pass: peak < t.peak_max_db, level: "fail", detail: `peak ${Number.isFinite(peak) ? peak.toFixed(2) : "-inf"} dBFS (cần < ${t.peak_max_db})` };
    },
  },
];
