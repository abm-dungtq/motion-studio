// player.js — the composition in an iframe (studio/PLAYER.md): /p/<name>/<html> with the
// HyperFrames runtime injected by the server; control goes through window.__player. The playhead
// reads __player.getTime() (the GSAP timeline time stays at the seek point while playing). The
// returned transport (play, pause, toggle, step, seek) is what the keyboard shortcuts drive. Once
// ready, the composition's window.TIMING goes to ctx.state.timing ("timing" event) for snapping and
// marks, and the mute/solo rule of the timeline is applied to its <audio> tags (setMute).
import { fmt, h } from "/dom.js";

export function mountPlayer(ctx, el, { playBtn, timeEl }) {
  let frame = null, hf = null, raf = 0, w = 1920, ht = 1080, shown = null;

  const fit = () => {
    if (!frame) return;
    const s = Math.min(el.clientWidth / w, el.clientHeight / ht) || 1;
    frame.style.transform = `translate(${(el.clientWidth - w * s) / 2}px, ${(el.clientHeight - ht * s) / 2}px) scale(${s})`;
  };
  new ResizeObserver(fit).observe(el);

  const duration = () => hf?.getDuration?.() || ctx.state.m?.duration || 0;
  const show = (t) => { timeEl.textContent = `${fmt(t)} / ${fmt(duration())}`; ctx.emit("time", t); };
  const glyph = () => { playBtn.firstElementChild.className = `glyph ${hf?.isPlaying?.() ? "pause" : "play"}`; };
  const tick = () => { if (hf) show(hf.getTime()); glyph(); raf = requestAnimationFrame(tick); };

  function setTiming(timing) {
    ctx.state.timing = timing && typeof timing === "object" ? timing : null;
    ctx.emit("timing");
  }

  // The group of an <audio>: data-audio-group, else vo-* is the voice, a music id is music, the
  // rest SFX. With any solo on, only soloed groups play; otherwise muted groups are silent. Only the
  // player's elements change, never project.json.
  function setMute(rule = ctx.state.audio) {
    const doc = frame?.contentDocument;
    if (!doc) return;
    const mute = rule?.mute ?? new Set(), solo = rule?.solo ?? new Set();
    const music = new Set((ctx.state.m?.music ?? []).map((x) => x.id));
    for (const a of doc.querySelectorAll("audio")) {
      const g = a.dataset.audioGroup || (a.id.startsWith("vo-") ? "voiceover" : music.has(a.id) ? "music" : "sfx");
      a.muted = solo.size ? !solo.has(g) : mute.has(g);
    }
  }

  function clear(text = "Chọn một dự án") {
    cancelAnimationFrame(raf);
    hf = null; frame = null; shown = null;
    if (ctx.state.timing) setTiming(null);
    el.replaceChildren(h("div", { class: "player-empty" }, text));
    show(0);
  }

  function load(m, keep = 0) {
    cancelAnimationFrame(raf);
    hf = null;
    w = m.width || 1920; ht = m.height || 1080;
    shown = `${ctx.state.name}:${m.version}`;
    const html = String(m.html || "index.html").split("/").map(encodeURIComponent).join("/");
    frame = h("iframe", { src: `/p/${encodeURIComponent(ctx.state.name)}/${html}?v=${m.version}`, width: w, height: ht, title: "Xem trước", style: { width: `${w}px`, height: `${ht}px` } });
    el.replaceChildren(frame);
    fit();
    const me = frame, t0 = Date.now();
    const wait = () => {
      if (frame !== me) return;
      const win = me.contentWindow;
      if (win?.__player && win.__playerReady) {
        hf = win.__player;
        setTiming(win.TIMING ?? null);
        setMute();
        if (keep) hf.seek(Math.min(keep, duration()));
        show(keep);
        tick();
        return;
      }
      if (Date.now() - t0 > 15000) { el.append(h("div", { class: "player-empty" }, "Không nạp được player (thiếu HyperFrames runtime?)")); return; }
      setTimeout(wait, 100);
    };
    me.addEventListener("load", wait);
  }

  function seek(t) { if (!hf) return; hf.seek(t); show(t); }
  const time = () => hf?.getTime?.() ?? 0;
  const playing = () => Boolean(hf?.isPlaying?.());
  function play() {
    if (!hf || playing()) return;
    if (time() >= duration() - 0.05) hf.seek(0);
    hf.play();
    glyph();
  }
  function pause() { if (!hf) return; hf.pause(); glyph(); }
  function toggle() { if (playing()) pause(); else play(); }
  // Pause, then move by dt seconds inside the video.
  function step(dt) {
    if (!hf) return;
    pause();
    seek(Math.min(duration(), Math.max(0, time() + dt)));
  }

  playBtn.addEventListener("click", toggle);

  // A new version may change index.html (timing markers): reload and return to the same time.
  let reloadTimer = 0;
  ctx.on("manifest", (m) => {
    if (!m) return clear();
    if (shown === `${ctx.state.name}:${m.version}`) return;
    const same = shown?.startsWith(`${ctx.state.name}:`);
    clearTimeout(reloadTimer);
    if (!same) return load(m);
    const keep = hf?.getTime?.() ?? 0;
    reloadTimer = setTimeout(() => load(m, keep), 250);
  });

  return { load, clear, seek, play, pause, toggle, time, step, playing, duration, setMute };
}
