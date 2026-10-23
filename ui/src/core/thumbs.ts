// Port of public/thumbs.js (commit 22e7611); logic unchanged.
// thumbs.js — frames of the newest render for the Shot lane. thumbAt(url, mtime, t) gives an object
// URL of a 160×90 JPEG of the video at second t: from IndexedDB "ms-thumbs" (key url|mtime|t, so a
// new render is a new key), else from a hidden <video> seeked to t and drawn on a canvas, then
// stored. One <video> per file, one seek at a time, so a timeline of 30 shots asks the server for a
// few ranges, and only on the first visit. The same plan as the filmstrip of omni-media/omniclip
// (s/context/controllers/timeline/parts/filmstrip.ts, MIT): a <video> element, seek, wait for
// "seeked", draw; no WebCodecs, since one frame per shot is enough.
import { cacheGet, cachePut } from "./peaks-cache.ts";

const W = 160, H = 90;
const SEEK_TIMEOUT_MS = 8000;
const urls = new Map<string, Promise<string | null>>(); // key → Promise<string | null> (object URL)
const players = new Map<string, { video: HTMLVideoElement; queue: Promise<unknown> }>(); // url → { video, queue: Promise }

const keyOf = (url: string, mtime: number, t: number): string => `${url}|${mtime}|${Math.round(t * 1000) / 1000}`;

function player(url: string): { video: HTMLVideoElement; queue: Promise<unknown> } {
  let p = players.get(url);
  if (!p) {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;
    p = { video, queue: Promise.resolve() };
    players.set(url, p);
  }
  return p;
}

function once(el: HTMLVideoElement, ok: string, bad: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: (v?: any) => void, v?: unknown) => { clearTimeout(timer); el.removeEventListener(ok, onOk); el.removeEventListener(bad, onBad); fn(v); };
    const onOk = () => done(resolve);
    const onBad = () => done(reject, new Error(`${bad} ${el.currentSrc}`));
    const timer = setTimeout(() => done(reject, new Error("hết giờ chờ video")), ms);
    el.addEventListener(ok, onOk);
    el.addEventListener(bad, onBad);
  });
}

async function grab(url: string, t: number): Promise<Blob | null> {
  const { video } = player(url);
  if (video.readyState < 1) await once(video, "loadedmetadata", "error", SEEK_TIMEOUT_MS);
  const at = Math.max(0, Math.min(t, (video.duration || t) - 0.05));
  if (Math.abs(video.currentTime - at) > 0.001 || video.readyState < 2) {
    const seeked = once(video, "seeked", "error", SEEK_TIMEOUT_MS);
    video.currentTime = at;
    await seeked;
  }
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  const vw = video.videoWidth || W, vh = video.videoHeight || H;
  const s = Math.max(W / vw, H / vh); // cover
  g.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

// Object URL of the frame at t of the video at url (a render with that mtime), or null.
export function thumbAt(url: string, mtime: number, t: number): Promise<string | null> {
  const key = keyOf(url, mtime, t);
  if (!urls.has(key)) {
    urls.set(key, (async () => {
      const hit = await cacheGet("ms-thumbs", key);
      if (hit instanceof Blob) return URL.createObjectURL(hit);
      const p = player(url);
      // Seeks of one file run one after another.
      const job = p.queue.then(() => grab(url, t));
      p.queue = job.catch(() => null);
      const blob = await job;
      if (!blob) return null;
      cachePut("ms-thumbs", key, blob);
      return URL.createObjectURL(blob);
    })().catch((e) => { console.warn("thumbnail", (e as Error).message); return null; }));
  }
  return urls.get(key)!;
}

// Drops the hidden players (their buffers) once every frame asked for is in.
export async function releasePlayers(): Promise<void> {
  const all = [...players.values()];
  await Promise.all(all.map((p) => p.queue));
  for (const [url, p] of players) if (all.includes(p)) { p.video.removeAttribute("src"); p.video.load(); players.delete(url); }
}
