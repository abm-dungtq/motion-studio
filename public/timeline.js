// timeline.js — tracks Shot, Lồng tiếng, Nhạc, SFX on a px/second scale. Dragging previews in place
// and sends ONE ctx.patch on release: a shot's right edge → resize_shot (0.1 s steps, ≥ 0.5 s), a
// voice block → move_line, an SFX → move_event, the music body or its edges → update_music. A
// press without a drag selects the block (ctx.pick). The ruler, the playhead knob and empty lane
// space scrub; right click opens the block's menu.
import { fmt, h, px, round1 } from "/dom.js";
import { eventStart, musicDragOps } from "/timeline-edit.js";
import { openMenu } from "/context-menu.js";

const LABEL = 90;
const MIN_SHOT = 0.5;
const CLICK = 3; // px of travel below which a press is a click, not a drag
const round3 = (x) => Math.round(x * 1000) / 1000;

export function mountTimeline(ctx, el, { zoomIn, zoomOut }) {
  let pps = 60, head = null, last = 0, fitted = null, total = 0;
  zoomIn.addEventListener("click", () => zoomBy(1.25));
  zoomOut.addEventListener("click", () => zoomBy(1 / 1.25));

  function zoomBy(f) { pps = Math.max(8, Math.min(400, pps * f)); render(); }
  function fit() {
    if (!(total > 0) || !(el.clientWidth > 0)) return;
    pps = Math.max(8, Math.min(400, (el.clientWidth - LABEL - 60) / total));
    render();
  }

  const picked = (kind, id) => ctx.state.pick?.kind === kind && ctx.state.pick.id === id;

  // Pointer drag on target: onMove(dx) while moving, onUp(dx) on release.
  function drag(target, onMove, onUp) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !ctx.editable) return;
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      let dx = 0;
      const move = (ev) => { dx = ev.clientX - x0; onMove(dx); };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        onUp(dx);
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
    const next = (dx) => round1(Math.max(MIN_SHOT, dur + dx / pps));
    drag(handle, (dx) => { b.classList.add("dragging"); b.style.width = px(next(dx) * pps); }, (dx) => {
      const d = next(dx);
      if (Math.abs(d - dur) < 0.05) return render();
      ctx.select(s.id);
      ctx.patch([{ op: "resize_shot", id: s.id, duration: d }]);
    });
    menuOn(b, () => [
      ctx.editable && { label: "Cắt tại playhead (S)", run: () => { ctx.select(s.id); ctx.split(); } },
      { label: "Nhờ đạo diễn sửa shot này", run: () => { ctx.pick("shot", s.id); ctx.emit("focus-note"); } },
    ]);
    return b;
  }

  function voiceBlock(l) {
    const b = h("div", { class: `blk voice${l.gate === "stale" ? " stale" : ""}${picked("line", l.id) ? " sel" : ""}`, title: l.text, "data-id": l.id, style: { left: px(l.start * pps), width: px(Math.max(0.2, l.duration) * pps) } },
      h("span", { class: "mic" }), l.text.slice(0, 24));
    const next = (dx) => round1(Math.max(0, l.start + dx / pps));
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("line", l.id); });
    drag(b, (dx) => { b.classList.add("dragging"); b.style.left = px(next(dx) * pps); }, (dx) => {
      if (Math.abs(dx) < CLICK) { render(); return ctx.pick("line", l.id); }
      ctx.patch([{ op: "move_line", id: l.id, start: next(dx) }]);
    });
    menuOn(b, () => [{ label: "Chọn câu", run: () => ctx.pick("line", l.id) }]);
    return b;
  }

  function musicBlock(mu) {
    const span = (op) => {
      const start = op?.start ?? mu.start;
      const end = op && "end" in op ? (op.end ?? total) : (mu.end ?? total);
      return { left: px(start * pps), width: px(Math.max(0.2, end - start) * pps) };
    };
    const b = h("div", { class: `blk music${picked("music", mu.id) ? " sel" : ""}`, title: mu.file, "data-id": mu.id, style: span(null) },
      `${mu.file.split("/").pop()} · ${Math.round(mu.gain * 100)}%`);
    const left = h("div", { class: "handle left", title: "Kéo để cắt đầu" });
    const right = h("div", { class: "handle", title: "Kéo để cắt cuối" });
    b.append(left, right);
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("music", mu.id); });
    for (const [target, mode] of [[b, "move"], [left, "trim-start"], [right, "trim-end"]]) {
      drag(target, (dx) => {
        b.classList.add("dragging");
        Object.assign(b.style, span(musicDragOps(mu, mode, dx / pps, total)));
      }, (dx) => {
        if (Math.abs(dx) < CLICK) { render(); return ctx.pick("music", mu.id); }
        const op = musicDragOps(mu, mode, dx / pps, total);
        if (op) ctx.patch([op]); else render();
      });
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
    });
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
      const at = (x) => ctx.seek(Math.max(0, Math.min(total, (x - rect().left) / pps)));
      at(e.clientX);
      target.setPointerCapture?.(e.pointerId);
      const move = (ev) => at(ev.clientX);
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        if (resume) tr.play();
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    });
  }

  function render() {
    const m = ctx.state.m;
    if (!m) { head = null; el.replaceChildren(h("div", { class: "muted", style: { padding: "12px" } }, "Chưa có timeline")); return; }
    total = Math.max(m.duration || 0, ...m.shots.map((s) => s.end), ...m.lines.map((l) => l.start + l.duration));
    // First view of a project: zoom so the whole video fills the timeline width.
    if (fitted !== ctx.state.name && total > 0 && el.clientWidth > 0) { fitted = ctx.state.name; pps = Math.max(8, Math.min(400, (el.clientWidth - LABEL - 60) / total)); }
    const lane = total * pps + 60;
    const ruler = h("div", { class: "tl-ruler", title: "Kéo để tua", style: { width: px(lane) } });
    const rulerRect = () => ruler.getBoundingClientRect();
    scrub(ruler, rulerRect);
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 50) ?? 60;
    for (let t = 0; t <= total + 1e-6; t += step) ruler.append(h("div", { class: "tl-tick", style: { left: px(t * pps) } }, `${+t.toFixed(1)}s`));
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
      return h("div", { class: "tl-track", style: { width: px(LABEL + lane) } }, h("div", { class: "tl-label" }, label), laneEl);
    };
    const knob = h("div", { class: "knob", title: "Kéo để tua" });
    scrub(knob, rulerRect);
    head = h("div", { class: "playhead", style: { left: px(LABEL + last * pps) } }, knob);
    const inner = h("div", { class: `tl-inner${ctx.editable ? "" : " readonly"}`, style: { width: px(LABEL + lane) } },
      ruler,
      track("Shot", m.shots.map(shotBlock)),
      track("Lồng tiếng", m.lines.map(voiceBlock)),
      track("Nhạc", m.music.map(musicBlock)),
      track("SFX", (m.events ?? []).map(eventBlock), (t) => ctx.editable ? [{ label: "Thêm SFX tại đây…", run: () => ctx.addSfx(t) }] : []),
      head);
    const sx = el.scrollLeft;
    el.replaceChildren(inner);
    el.scrollLeft = sx;
  }

  ctx.on("time", (t) => { last = t; if (head) head.style.left = px(LABEL + t * pps); });
  ctx.on("manifest", render);
  ctx.on("select", render);
  return { render, zoomBy, fit };
}
