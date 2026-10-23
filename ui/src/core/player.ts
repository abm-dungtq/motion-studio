// Port of public/player.js (commit 2d65edf): the composition in an iframe (PLAYER.md),
// /p/<name>/<html> with the HyperFrames runtime injected by the server; control goes through
// window.__player. The playhead reads __player.getTime() (the GSAP timeline time stays at the seek
// point while playing). Logic unchanged: __playerReady, the 15 s wait, mute/solo, reload at the
// same time, the 250 ms debounce for a new version of the same project.
//
// Changed for React: the player no longer writes the play button or the clock and no longer reads
// a ctx. It gets the project per call and reports through hooks instead:
// - onTime(t): the playhead, every animation frame while a composition is loaded;
// - onState(playing): when play/pause changes;
// - onTiming(timing): the composition's window.TIMING (null when none) after a load or a clear;
// - onStatus({ state, message }): "empty" (clear(text)), "loading", "ready" or "failed" with the
//   text the old player wrote into its box, so the Stage draws it (and the poster) itself.
// No React.
import { h } from "./dom.ts";

export interface PlayerManifest {
  version: number;
  width?: number;
  height?: number;
  html?: string;
  duration?: number;
  music?: { id: string }[];
}
export type PlayerState = "empty" | "loading" | "ready" | "failed";
export interface PlayerHooks {
  onTime(t: number): void;
  onState(playing: boolean): void;
  onTiming(timing: unknown): void;
  onStatus(s: { state: PlayerState; message: string | null }): void;
}
// The audio groups of the timeline's M/S buttons (store AudioGroup).
export interface AudioRule { mute: readonly string[]; solo: readonly string[] }

interface HyperPlayer {
  getTime(): number;
  getDuration?(): number;
  isPlaying?(): boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
}

export interface Player {
  show(name: string, m: PlayerManifest): void; // a new manifest: load, or reload at the same time
  load(name: string, m: PlayerManifest, keep?: number, bust?: number): void;
  reload(): void;
  clear(text?: string): void;
  seek(t: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  step(dt: number): void;
  time(): number;
  playing(): boolean;
  duration(): number;
  timing(): unknown;
  setMute(rule: AudioRule): void;
  audioIds(): string[];
  destroy(): void;
}

const LOAD_TIMEOUT_MS = 15000;

// The group of an <audio>: data-audio-group, else vo-* is the voice, a music id is music, the rest
// SFX. The old player called the voice group "voiceover"; the store calls it "voice".
export function audioGroup(a: { id: string; dataset: { audioGroup?: string } }, music: Set<string>): string {
  const g = a.dataset.audioGroup || (a.id.startsWith("vo-") ? "voiceover" : music.has(a.id) ? "music" : "sfx");
  return g === "voiceover" ? "voice" : g;
}

export function mountPlayer(el: HTMLElement, hooks: PlayerHooks): Player {
  let frame: HTMLIFrameElement | null = null, hf: HyperPlayer | null = null, raf = 0, w = 1920, ht = 1080;
  let shown: string | null = null, name: string | null = null, m: PlayerManifest | null = null;
  let timing: unknown = null, rule: AudioRule = { mute: [], solo: [] }, wasPlaying = false, reloadTimer = 0;

  const fit = () => {
    if (!frame) return;
    const s = Math.min(el.clientWidth / w, el.clientHeight / ht) || 1;
    frame.style.transform = `translate(${(el.clientWidth - w * s) / 2}px, ${(el.clientHeight - ht * s) / 2}px) scale(${s})`;
  };
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
  ro?.observe(el);

  const duration = () => hf?.getDuration?.() || m?.duration || 0;
  const playing = () => Boolean(hf?.isPlaying?.());
  const glyph = () => { const p = playing(); if (p !== wasPlaying) { wasPlaying = p; hooks.onState(p); } };
  const tick = () => { if (hf) hooks.onTime(hf.getTime()); glyph(); raf = requestAnimationFrame(tick); };

  function setTiming(t: unknown) {
    timing = t && typeof t === "object" ? t : null;
    hooks.onTiming(timing);
  }

  function setMute(next: AudioRule = rule) {
    rule = next;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const music = new Set((m?.music ?? []).map((x) => x.id));
    for (const a of doc.querySelectorAll("audio")) {
      const g = audioGroup(a, music);
      a.muted = rule.solo.length ? !rule.solo.includes(g) : rule.mute.includes(g);
    }
  }

  function clear(text = "Chọn một dự án") {
    cancelAnimationFrame(raf);
    clearTimeout(reloadTimer);
    hf = null; frame = null; shown = null; name = null; m = null;
    if (timing) setTiming(null);
    el.replaceChildren();
    hooks.onStatus({ state: "empty", message: text });
    hooks.onTime(0);
    glyph();
  }

  function load(n: string, man: PlayerManifest, keep = 0, bust = 0) {
    cancelAnimationFrame(raf);
    hf = null; name = n; m = man;
    w = man.width || 1920; ht = man.height || 1080;
    shown = `${n}:${man.version}`;
    const html = String(man.html || "index.html").split("/").map(encodeURIComponent).join("/");
    const me = h("iframe", {
      src: `/p/${encodeURIComponent(n)}/${html}?v=${man.version}${bust ? `&t=${bust}` : ""}`,
      width: w, height: ht, title: "Xem trước",
      style: { width: `${w}px`, height: `${ht}px`, border: "0", transformOrigin: "0 0", position: "absolute", left: "0", top: "0" },
    }) as HTMLIFrameElement;
    frame = me;
    el.replaceChildren(me);
    fit();
    hooks.onStatus({ state: "loading", message: null });
    const t0 = Date.now();
    const wait = () => {
      if (frame !== me) return;
      const win = me.contentWindow as (Window & { __player?: HyperPlayer; __playerReady?: boolean; TIMING?: unknown }) | null;
      if (win?.__player && win.__playerReady) {
        hf = win.__player;
        setTiming(win.TIMING ?? null);
        setMute();
        if (keep) hf.seek(Math.min(keep, duration()));
        hooks.onStatus({ state: "ready", message: null });
        hooks.onTime(keep);
        tick();
        return;
      }
      if (Date.now() - t0 > LOAD_TIMEOUT_MS) { hooks.onStatus({ state: "failed", message: "Không nạp được player (thiếu HyperFrames runtime?)" }); return; }
      setTimeout(wait, 100);
    };
    me.addEventListener("load", wait);
  }

  // A new version may change index.html (timing markers): reload and return to the same time.
  function show(n: string, man: PlayerManifest) {
    if (shown === `${n}:${man.version}`) { m = man; return; }
    const same = shown?.startsWith(`${n}:`);
    clearTimeout(reloadTimer);
    if (!same) return load(n, man);
    const keep = hf?.getTime?.() ?? 0;
    reloadTimer = window.setTimeout(() => load(n, man, keep), 250);
  }

  function seek(t: number) { if (!hf) return; hf.seek(t); hooks.onTime(t); }
  const time = () => hf?.getTime?.() ?? 0;
  function play() {
    if (!hf || playing()) return;
    if (time() >= duration() - 0.05) hf.seek(0);
    hf.play();
    glyph();
  }
  function pause() { if (!hf) return; hf.pause(); glyph(); }
  function toggle() { if (playing()) pause(); else play(); }
  // Pause, then move by dt seconds inside the video.
  function step(dt: number) {
    if (!hf) return;
    pause();
    seek(Math.min(duration(), Math.max(0, time() + dt)));
  }
  // The timing job rewrote TIMING in the HTML without a new project.json version.
  function reload() {
    if (!m || !frame || !name) return;
    load(name, m, hf?.getTime?.() ?? 0, Date.now());
  }
  const audioIds = (): string[] => {
    const doc = frame?.contentDocument;
    return doc ? [...doc.querySelectorAll("audio[id]")].map((a) => a.id) : [];
  };
  function destroy() {
    cancelAnimationFrame(raf);
    clearTimeout(reloadTimer);
    ro?.disconnect();
    hf = null; frame = null;
    el.replaceChildren();
  }

  return { show, load, reload, clear, seek, play, pause, toggle, step, time, playing, duration, timing: () => timing, setMute, audioIds, destroy };
}
