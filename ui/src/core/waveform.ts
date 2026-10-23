// Port of public/waveform.js (commit 22e7611); logic unchanged.
// waveform.js — audio peaks for the timeline: peaks(url, stamp) decodes a file once (at most three
// decodes at a time) into 200 points a second, each the largest absolute sample of its slice;
// drawWave paints a slice of those points as a band mirrored around the middle of a canvas.
// With stamp = { size, mtime } of the file (GET /api/timeline/media) the peaks also go to
// IndexedDB "ms-peaks" under url|size|mtime, so the next page load paints without fetching the
// file. Zoomed out, drawWave reads a coarser level of detail (25 or 50 points a second, the max of
// each bucket, as decimatePeaks of heygen-com/hyperframes packages/studio audioWaveformPeaks.ts,
// Apache-2.0, does it) so a long bed costs as little to paint as a short one.
import { cacheGet, cachePut } from "./peaks-cache.ts";

export interface FileStamp { size: number; mtime: number }

const RATE = 200; // points per second
const LODS = [25, 50, RATE];
const MAX_DECODES = 3;
const cache = new Map<string, Promise<Float32Array | null>>(); // url → Promise<Float32Array | null>
const levels = new WeakMap<Float32Array, Map<number, Float32Array>>(); // Float32Array → Map(rate → Float32Array)
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_DECODES) await new Promise<void>((go) => waiting.push(go));
  running++;
  try { return await fn(); } finally {
    running--;
    waiting.shift()?.();
  }
}

async function decode(url: string): Promise<Float32Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = await r.arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
  const ch = audio.getChannelData(0);
  const per = audio.sampleRate / RATE;
  const out = new Float32Array(Math.ceil(ch.length / per));
  for (let i = 0; i < out.length; i++) {
    let max = 0;
    const end = Math.min(ch.length, Math.round((i + 1) * per));
    for (let j = Math.round(i * per); j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

export const peaksKey = (url: string, stamp: FileStamp | null | undefined): string | null => (stamp && Number.isFinite(stamp.size) && Number.isFinite(stamp.mtime) ? `${url}|${stamp.size}|${stamp.mtime}` : null);

// Peaks of url, 200 points a second; null when the file cannot be fetched or decoded (cached too,
// so a broken file is tried once per page load). stamp: see the head of the file.
export function peaks(url: string, stamp: FileStamp | null = null): Promise<Float32Array | null> {
  const key = peaksKey(url, stamp);
  const mem = key ?? url;
  if (!cache.has(mem)) {
    cache.set(mem, (async () => {
      const hit = key ? await cacheGet("ms-peaks", key) : null;
      if (hit instanceof Float32Array) return hit;
      const data = await slot(() => decode(url));
      if (key && data) cachePut("ms-peaks", key, data);
      return data;
    })().catch(() => null));
  }
  return cache.get(mem)!;
}

// data (RATE points a second) at rate points a second: the max of each bucket.
export function lod(data: Float32Array | null, rate: number): Float32Array | null {
  if (!data || rate >= RATE) return data;
  let by = levels.get(data);
  if (!by) levels.set(data, (by = new Map()));
  if (!by.has(rate)) {
    const per = RATE / rate;
    const out = new Float32Array(Math.ceil(data.length / per));
    for (let i = 0; i < out.length; i++) {
      let max = 0;
      const end = Math.min(data.length, Math.round((i + 1) * per));
      for (let j = Math.round(i * per); j < end; j++) if (data[j] > max) max = data[j];
      out[i] = max;
    }
    by.set(rate, out);
  }
  return by.get(rate)!;
}

// The coarsest level that still gives every device pixel at least one point.
export const lodFor = (pxPerSecond: number): number => LODS.find((r) => r >= pxPerSecond) ?? RATE;

// Paints seconds [from, to) of data over the canvas's whole box, in its CSS color at half opacity.
// gain scales the band (the music's volume). Sizes the canvas to its box first; a detached or
// hidden canvas (box 0) is left alone.
export function drawWave(canvas: HTMLCanvasElement, data: Float32Array | null, { from = 0, to, gain = 1 }: { from?: number; to?: number; gain?: number } = {}): boolean {
  const w = canvas.clientWidth, hgt = canvas.clientHeight;
  if (!data || !(w > 0) || !(hgt > 0) || !((to as number) > from)) return false;
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext("2d");
  if (!g) return false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = getComputedStyle(canvas).color;
  g.globalAlpha = 0.5;
  const mid = canvas.height / 2;
  const rate = lodFor(canvas.width / (to! - from));
  data = lod(data, rate)!;
  const span = (to! - from) * rate;
  for (let x = 0; x < canvas.width; x++) {
    const a = Math.floor(from * rate + (x / canvas.width) * span);
    const b = Math.max(a + 1, Math.floor(from * rate + ((x + 1) / canvas.width) * span));
    let v = 0;
    for (let i = Math.max(0, a); i < Math.min(data.length, b); i++) if (data[i] > v) v = data[i];
    const y = Math.max(0.5, Math.min(1, v * gain) * mid);
    if (a < data.length) g.fillRect(x, mid - y, 1, y * 2);
  }
  return true;
}
