// timeline.js — tracks Shot, Lồng tiếng, Nhạc, SFX on a px/second scale. Dragging previews in place
// and sends ONE ctx.patch on release: a shot's right edge → resize_shot (0.1 s steps, ≥ 0.5 s), a
// voice block → move_line, an SFX → move_event, the music body or its edges → update_music. A
// press without a drag selects the block (ctx.pick). The ruler, the playhead knob and empty lane
// space scrub; right click opens the block's menu. With snapping on (N), a dragged edge or the
// playhead snaps to shot edges, lines, SFX, the playhead, beats and word starts (timeline-edit.js
// snapTargets) and a .snap-line shows where. Voice and music blocks carry their waveform; the
// ruler shows beats and voice blocks word starts (view only). Ctrl/Cmd+wheel zooms around the
// pointer. M/S on an audio track mutes or solos it in the player only (project.json untouched).
import { fmt, h, px, round1 } from "/dom.js";
import { beatTimes, eventStart, musicDragOps, snap, snapTargets, wordStarts } from "/timeline-edit.js";
import { openMenu } from "/context-menu.js";
import { drawWave, peaks } from "/waveform.js";

const LABEL = 90;
const MIN_SHOT = 0.5;
const CLICK = 3; // px of travel below which a press is a click, not a drag
const round3 = (x) => Math.round(x * 1000) / 1000;
const clampPps = (x) => Math.max(8, Math.min(400, x));
const GROUPS = { "Lồng tiếng": "voiceover", "Nhạc": "music", "SFX": "sfx" };

export function mountTimeline(ctx, el, { zoomIn, zoomOut, zoomFit, snapBtn }) {
  let pps = 60, head = null, last = 0, fitted = null, total = 0, inner = null, snapOn = true, snapEl = null;
  zoomIn.addEventListener("click", () => zoomBy(1.25));
  zoomOut.addEventListener("click", () => zoomBy(1 / 1.25));
  zoomFit?.addEventListener("click", () => fit());
  snapBtn?.addEventListener("click", () => toggleSnap());
  snapBtn?.setAttribute("aria-pressed", "true");

  function zoomBy(f) { pps = clampPps(pps * f); render(); }
  function fit() {
    if (!(total > 0) || !(el.clientWidth > 0)) return;
    pps = clampPps((el.clientWidth - LABEL - 60) / total);
    render();
    el.scrollLeft = 0;
  }
  function toggleSnap() {
    snapOn = !snapOn;
    snapBtn?.setAttribute("aria-pressed", String(snapOn));
    ctx.toast(`Hít: ${snapOn ? "bật" : "tắt"}`);
  }

  // Ctrl/Cmd+wheel zooms; the time under the pointer stays under it.
  el.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey) || !ctx.state.m) return;
    e.preventDefault();
    const x = e.clientX - el.getBoundingClientRect().left;
    const t = (el.scrollLeft + x - LABEL) / pps;
    const next = clampPps(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    if (next === pps) return;
    pps = next;
    render();
    el.scrollLeft = Math.max(0, LABEL + t * pps - x);
  }, { passive: false });

  const picked = (kind, id) => ctx.state.pick?.kind === kind && ctx.state.pick.id === id;

  function showSnap(t) {
    if (!inner) return;
    if (!snapEl || snapEl.parentNode !== inner) { snapEl = h("div", { class: "snap-line" }); inner.append(snapEl); }
    snapEl.style.left = px(LABEL + t * pps);
  }
  function hideSnap() { snapEl?.remove(); snapEl = null; }
  const targetsFor = (skip, t0 = ctx.transport?.time?.()) => snapOn ? snapTargets(ctx.state.m, ctx.state.timing ?? null, t0, skip) : [];

  // Pointer drag on target: onMove(dx, hit) while moving, onUp(dx, hit) on release. With sn =
  // { skip, edges(dx) } and snapping on, the dragged edge nearest a target is pulled onto it: dx
  // is shifted by as much and hit is { t, kind } of that target (null when nothing snapped).
  function drag(target, onMove, onUp, sn = null) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !ctx.editable) return;
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      const targets = sn ? targetsFor(sn.skip) : [];
      let dx = 0, hit = null;
      const move = (ev) => {
        dx = ev.clientX - x0;
        hit = null;
        // A press that has not travelled yet stays a click: no snapping.
        if (targets.length && Math.abs(dx) >= CLICK) {
          for (const raw of sn.edges(dx / pps)) {
            const s = snap(raw, targets, pps);
            if (s.kind && (!hit || Math.abs(s.t - raw) < Math.abs(hit.d))) hit = { t: s.t, kind: s.kind, d: s.t - raw };
          }
        }
        if (hit) { dx += hit.d * pps; showSnap(hit.t); } else hideSnap();
        onMove(dx, hit);
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        hideSnap();
        onUp(dx, hit);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    });
  }

  function menuOn(b, items) {
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(e.clientX, e.clientY, items());
    });
  }

  function shotBlock(s, i) {
    const dur = s.end - s.start;
    const label = s.name ? `${i + 1} · ${s.name}` : `${i + 1}`;
    const b = h("div", { class: `blk shot${s.id === ctx.state.sel ? " sel" : ""}`, title: label, "data-id": s.id, style: { left: px(s.start * pps), width: px(dur * pps) }, onclick: () => ctx.select(s.id) }, label);
    const handle = h("div", { class: "handle", title: "Kéo để đổi độ dài" });
    b.append(handle);
    // A snapped edge keeps the target's exact time; a free drag moves in 0.1 s steps.
    const next = (dx, hit) => Math.max(MIN_SHOT, hit ? round3(dur + dx / pps) : round1(dur + dx / pps));
    // This shot and the ones after it move with the edge (ripple), and so do their lines and SFX.
    const later = new Set(ctx.state.m.shots.slice(i).map((x) => x.id));
    const moving = new Set([...ctx.state.m.lines.filter((l) => later.has(l.shot) && l.shot !== s.id).map((l) => l.id),
      ...(ctx.state.m.events ?? []).filter((x) => later.has(x.shot) && x.shot !== s.id).map((x) => x.id)]);
    const skip = (x) => (x.kind === "shot" && later.has(x.id) && !(x.id === s.id && x.t < s.end)) || moving.has(x.id);
    drag(handle, (dx, hit) => { b.classList.add("dragging"); b.style.width = px(next(dx, hit) * pps); }, (dx, hit) => {
      const d = next(dx, hit);
      if (Math.abs(d - dur) < 0.0005 || (!hit && Math.abs(d - dur) < 0.05)) return render();
      ctx.select(s.id);
      ctx.patch([{ op: "resize_shot", id: s.id, duration: d }]);
    }, { skip, edges: (d) => [s.end + d] });
    menuOn(b, () => [
      ctx.editable && { label: "Cắt tại playhead (S)", run: () => { ctx.select(s.id); ctx.split(); } },
      { label: "Nhờ đạo diễn sửa shot này", run: () => { ctx.pick("shot", s.id); ctx.emit("focus-note"); } },
    ]);
    return b;
  }

  function voiceBlock(l) {
    const wave = h("canvas", { class: "wave", width: 0, height: 0, "aria-hidden": "true" });
    const marks = pps >= 120 ? (words.get(l.id) ?? []).filter((t) => t >= l.start - 1e-6 && t <= l.start + l.duration)
      .map((t) => h("span", { class: "word-mark", style: { left: px((t - l.start) * pps) } })) : [];
    const b = h("div", { class: `blk voice${l.gate === "stale" ? " stale" : ""}${picked("line", l.id) ? " sel" : ""}`, title: l.text, "data-id": l.id, style: { left: px(l.start * pps), width: px(Math.max(0.2, l.duration) * pps) } },
      wave, h("span", { class: "mic" }), l.text.slice(0, 24), marks);
    if (l.file && l.duration > 0) waves.push([wave, l.file, { from: 0, to: l.duration }]);
    const next = (dx, hit) => Math.max(0, hit ? round3(l.start + dx / pps) : round1(l.start + dx / pps));
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("line", l.id); });
    drag(b, (dx, hit) => { b.classList.add("dragging"); b.style.left = px(next(dx, hit) * pps); }, (dx, hit) => {
      if (Math.abs(dx) < CLICK) { render(); return ctx.pick("line", l.id); }
      ctx.patch([{ op: "move_line", id: l.id, start: next(dx, hit) }]);
    }, { skip: (x) => x.id === l.id, edges: (d) => [l.start + d, l.start + l.duration + d] });
    menuOn(b, () => [{ label: "Chọn câu", run: () => ctx.pick("line", l.id) }]);
    return b;
  }

  function musicBlock(mu) {
    const span = (op) => {
      const start = op?.start ?? mu.start;
      const end = op && "end" in op ? (op.end ?? total) : (mu.end ?? total);
      return { left: px(start * pps), width: px(Math.max(0.2, end - start) * pps) };
    };
    const wave = h("canvas", { class: "wave", width: 0, height: 0, "aria-hidden": "true" });
    const b = h("div", { class: `blk music${picked("music", mu.id) ? " sel" : ""}`, title: mu.file, "data-id": mu.id, style: span(null) },
      wave, `${mu.file.split("/").pop()} · ${Math.round(mu.gain * 100)}%`);
    const from = Number(mu.media_start) || 0;
    const len = (mu.end ?? total) - mu.start;
    if (len > 0) waves.push([wave, mu.file, { from, to: from + len, gain: Number(mu.gain) || 1 }]);
    const left = h("div", { class: "handle left", title: "Kéo để cắt đầu" });
    const right = h("div", { class: "handle", title: "Kéo để cắt cuối" });
    b.append(left, right);
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("music", mu.id); });
    const end = mu.end ?? total;
    const edges = { move: (d) => mu.end == null ? [mu.start + d] : [mu.start + d, end + d], "trim-start": (d) => [mu.start + d], "trim-end": (d) => [end + d] };
    for (const [target, mode] of [[b, "move"], [left, "trim-start"], [right, "trim-end"]]) {
      drag(target, (dx) => {
        b.classList.add("dragging");
        Object.assign(b.style, span(musicDragOps(mu, mode, dx / pps, total)));
      }, (dx) => {
        if (Math.abs(dx) < CLICK) { render(); return ctx.pick("music", mu.id); }
        const op = musicDragOps(mu, mode, dx / pps, total);
        if (op) ctx.patch([op]); else render();
      }, { skip: null, edges: edges[mode] });
    }
    menuOn(b, () => ctx.editable ? [
      { label: "Đưa về đầu video", run: () => ctx.patch([{ op: "update_music", id: mu.id, start: 0 }]), disabled: mu.start === 0 },
      { label: "Chạy tới hết video", run: () => ctx.patch([{ op: "update_music", id: mu.id, end: null }]), disabled: mu.end == null },
    ] : []);
    return b;
  }

  function eventBlock(e) {
    const start = eventStart(ctx.state.m, e);
    const label = e.label || e.id;
    const b = h("div", { class: `blk sfx${picked("event", e.id) ? " sel" : ""}`, title: `${label} · ${fmt(start)}`, "data-id": e.id, style: { left: px(start * pps - 7) } },
      pps >= 80 ? h("span", { class: "sfx-label" }, label.slice(0, 12)) : null);
    const next = (dx) => round3(Math.max(0, start + dx / pps));
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("event", e.id); });
    drag(b, (dx) => { b.classList.add("dragging"); b.style.left = px(next(dx) * pps - 7); }, (dx) => {
      if (Math.abs(dx) < CLICK) { render(); return ctx.pick("event", e.id); }
      ctx.patch([{ op: "move_event", id: e.id, start: next(dx) }]);
    }, { skip: (x) => x.kind === "event" && x.id === e.id, edges: (d) => [start + d] });
    // Only an SFX added in Studio (studio: true) is deleted here; the director's own SFX go through
    // the director, since the gateway refuses remove_event on them.
    menuOn(b, () => [
      e.studio ? ctx.editable && { label: "Xoá SFX", run: () => ctx.patch([{ op: "remove_event", id: e.id }]) }
        : { label: "Nhờ đạo diễn xoá SFX này", run: () => ctx.directRemoveSfx(e) },
    ]);
    return b;
  }

  // Scrub: press on the ruler or the knob and move; a playing player pauses and resumes on release.
  function scrub(target, rect) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const tr = ctx.transport;
      const resume = Boolean(tr?.playing?.());
      if (resume) tr.pause();
      // The playhead snaps too, to everything but itself.
      const targets = targetsFor(null, null);
      const at = (x) => {
        const t = Math.max(0, Math.min(total, (x - rect().left) / pps));
        const s = snap(t, targets, pps);
        if (s.kind) showSnap(s.t); else hideSnap();
        ctx.seek(s.t);
      };
      at(e.clientX);
      target.setPointerCapture?.(e.pointerId);
      const move = (ev) => at(ev.clientX);
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        hideSnap();
        if (resume) tr.play();
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    });
  }

  // M and S of an audio track: mute it, or hear only the soloed tracks, in the player only.
  function muteButtons(group, name) {
    const a = (ctx.state.audio ??= { mute: new Set(), solo: new Set() });
    const btn = (set, text, title) => h("button", { type: "button", class: "ms-btn", title: `${title} ${name} khi xem thử`, "aria-label": `${title} ${name}`, "aria-pressed": String(set.has(group)),
      onclick: (e) => {
        e.stopPropagation();
        if (set.has(group)) set.delete(group); else set.add(group);
        ctx.transport?.setMute?.(a);
        render();
      } }, text);
    return h("div", { class: "ms" }, btn(a.mute, "M", "Tắt tiếng"), btn(a.solo, "S", "Chỉ nghe"));
  }

  let waves = [], words = new Map();
  const fileUrl = (rel) => `/p/${encodeURIComponent(ctx.state.name)}/${String(rel).split("/").map(encodeURIComponent).join("/")}`;

  function render() {
    const m = ctx.state.m;
    waves = [];
    words = wordStarts(ctx.state.timing);
    if (!m) { head = null; inner = null; el.replaceChildren(h("div", { class: "muted", style: { padding: "12px" } }, "Chưa có timeline")); return; }
    total = Math.max(m.duration || 0, ...m.shots.map((s) => s.end), ...m.lines.map((l) => l.start + l.duration));
    // First view of a project: zoom so the whole video fills the timeline width.
    if (fitted !== ctx.state.name && total > 0 && el.clientWidth > 0) { fitted = ctx.state.name; pps = Math.max(8, Math.min(400, (el.clientWidth - LABEL - 60) / total)); }
    const lane = total * pps + 60;
    const ruler = h("div", { class: "tl-ruler", title: "Kéo để tua", style: { width: px(lane) } });
    const rulerRect = () => ruler.getBoundingClientRect();
    scrub(ruler, rulerRect);
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 50) ?? 60;
    for (let t = 0; t <= total + 1e-6; t += step) ruler.append(h("div", { class: "tl-tick", style: { left: px(t * pps) } }, `${+t.toFixed(1)}s`));
    // Beats only when they are at least 6 px apart; closer they would just grey the ruler.
    const beats = beatTimes(ctx.state.timing, total).filter((t) => t <= total + 1e-6);
    const gap = beats.slice(1).reduce((g, t, i) => Math.min(g, t - beats[i]), Infinity);
    if (beats.length && gap * pps >= 6) for (const t of beats) ruler.append(h("div", { class: "tl-beat", style: { left: px(t * pps) } }));
    const timeAt = (laneEl, x) => Math.max(0, Math.min(total, (x - laneEl.getBoundingClientRect().left) / pps));
    const track = (label, blocks, menu) => {
      const laneEl = h("div", { class: "tl-lane" }, blocks);
      // Empty lane space: a click seeks there, a right click opens the lane's menu.
      laneEl.addEventListener("click", (e) => { if (e.target === laneEl) ctx.seek(timeAt(laneEl, e.clientX)); });
      if (menu) laneEl.addEventListener("contextmenu", (e) => {
        if (e.target !== laneEl) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, menu(round3(timeAt(laneEl, e.clientX))));
      });
      const group = GROUPS[label];
      return h("div", { class: "tl-track", style: { width: px(LABEL + lane) } },
        h("div", { class: "tl-label" }, h("span", {}, label), group ? muteButtons(group, label) : null), laneEl);
    };
    const knob = h("div", { class: "knob", title: "Kéo để tua" });
    scrub(knob, rulerRect);
    head = h("div", { class: "playhead", style: { left: px(LABEL + last * pps) } }, knob);
    inner = h("div", { class: `tl-inner${ctx.editable ? "" : " readonly"}`, style: { width: px(LABEL + lane) } },
      ruler,
      track("Shot", m.shots.map(shotBlock)),
      track("Lồng tiếng", m.lines.map(voiceBlock)),
      track("Nhạc", m.music.map(musicBlock)),
      track("SFX", (m.events ?? []).map(eventBlock), (t) => ctx.editable ? [{ label: "Thêm SFX tại đây…", run: () => ctx.addSfx(t) }] : []),
      head);
    const sx = el.scrollLeft;
    el.replaceChildren(inner);
    el.scrollLeft = sx;
    // Waveforms paint once their peaks are in (cached after the first decode); a block without
    // them looks as before.
    for (const [canvas, file, range] of waves) peaks(fileUrl(file)).then((data) => { if (canvas.isConnected) drawWave(canvas, data, range); });
  }

  ctx.on("time", (t) => { last = t; if (head) head.style.left = px(LABEL + t * pps); });
  ctx.on("manifest", render);
  ctx.on("select", render);
  ctx.on("timing", render);
  return { render, zoomBy, fit, toggleSnap };
}
