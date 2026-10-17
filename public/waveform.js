// waveform.js — audio peaks for the timeline: peaks(url) decodes a file once (at most three decodes
// at a time) into 200 points a second, each the largest absolute sample of its slice; drawWave
// paints a slice of those points as a band mirrored around the middle of a canvas.
const RATE = 200; // points per second
const MAX_DECODES = 3;
const cache = new Map(); // url → Promise<Float32Array | null>
let running = 0;
const waiting = [];

async function slot(fn) {
  if (running >= MAX_DECODES) await new Promise((go) => waiting.push(go));
  running++;
  try { return await fn(); } finally {
    running--;
    waiting.shift()?.();
  }
}

async function decode(url) {
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

// Peaks of url, 200 points a second; null when the file cannot be fetched or decoded (cached too,
// so a broken file is tried once per page load).
export function peaks(url) {
  if (!cache.has(url)) cache.set(url, slot(() => decode(url)).catch(() => null));
  return cache.get(url);
}

// Paints seconds [from, to) of data over the canvas's whole box, in its CSS color at half opacity.
// gain scales the band (the music's volume). Sizes the canvas to its box first; a detached or
// hidden canvas (box 0) is left alone.
export function drawWave(canvas, data, { from = 0, to, gain = 1 } = {}) {
  const w = canvas.clientWidth, hgt = canvas.clientHeight;
  if (!data || !(w > 0) || !(hgt > 0) || !(to > from)) return false;
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext("2d");
  if (!g) return false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = getComputedStyle(canvas).color;
  g.globalAlpha = 0.5;
  const mid = canvas.height / 2;
  const span = (to - from) * RATE;
  for (let x = 0; x < canvas.width; x++) {
    const a = Math.floor(from * RATE + (x / canvas.width) * span);
    const b = Math.max(a + 1, Math.floor(from * RATE + ((x + 1) / canvas.width) * span));
    let v = 0;
    for (let i = Math.max(0, a); i < Math.min(data.length, b); i++) if (data[i] > v) v = data[i];
    const y = Math.max(0.5, Math.min(1, v * gain) * mid);
    if (a < data.length) g.fillRect(x, mid - y, 1, y * 2);
  }
  return true;
}
