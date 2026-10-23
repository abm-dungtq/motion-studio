// lib/broll/scenes.mjs — shot boundaries of a clip from ffmpeg's scdet filter (hard cuts), read
// from its "lavfi.scd.score: S, lavfi.scd.time: T" log lines. The frames are scaled down first:
// scene scores barely change and decoding is several times faster.
// Short shots are merged the way PySceneDetect applies min_scene_len: a cut closer than minLen to
// the previous one is dropped, and a last shot shorter than minLen joins the one before it.
// Idea from Breakthrough/PySceneDetect (https://github.com/Breakthrough/PySceneDetect, BSD-3-Clause);
// reading the filter log as in mifi/lossless-cut (https://github.com/mifi/lossless-cut, GPL-2.0,
// studied only, no code copied).
import { ffmpeg, tail } from "./ffmpeg.mjs";

export const VERSION = 1;
export const DEFAULTS = { threshold: 10, minLen: 0.6, oneShotUnder: 2 };

export const scdetArgs = (file, { threshold = DEFAULTS.threshold } = {}) =>
  ["-loglevel", "info", "-i", file, "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", `scale=320:-2,scdet=threshold=${threshold}`, "-f", "null", "-"];

const LINE = /lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g;
// [{ t, score }] in time order.
export function parseScdet(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(LINE)) out.push({ t: Number(m[2]), score: Number(m[1]) });
  return out.filter((c) => Number.isFinite(c.t)).sort((a, b) => a.t - b.t);
}

const r3 = (x) => Math.round(x * 1000) / 1000;
// [{ i, start, end }] covering [0, duration], shots numbered from 1.
export function shotsFrom(cuts, duration, { minLen = DEFAULTS.minLen, oneShotUnder = DEFAULTS.oneShotUnder } = {}) {
  const d = Number(duration);
  if (!(d > 0)) return [];
  if (d < oneShotUnder) return [{ i: 1, start: 0, end: r3(d) }];
  const keep = [];
  let last = 0;
  for (const c of cuts) {
    const t = typeof c === "number" ? c : c.t;
    if (!(t > 0) || t >= d) continue;
    if (t - last < minLen) continue;
    keep.push(t);
    last = t;
  }
  if (keep.length && d - keep.at(-1) < minLen) keep.pop();
  const edges = [0, ...keep, d];
  return edges.slice(1).map((end, k) => ({ i: k + 1, start: r3(edges[k]), end: r3(end) }));
}

// Runs scdet on file. Resolves { ok, shots, cuts } or { ok: false, error }.
export async function detectScenes(file, duration, opts = {}) {
  const r = await ffmpeg(scdetArgs(file, opts), { timeout: opts.timeout ?? 30 * 60000, signal: opts.signal });
  if (r.code !== 0) return { ok: false, error: `scdet: ${tail(r)}` };
  const cuts = parseScdet(r.stderr);
  return { ok: true, cuts: cuts.length, shots: shotsFrom(cuts, duration, opts) };
}
