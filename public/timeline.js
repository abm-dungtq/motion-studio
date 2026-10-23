// timeline.js — tracks Shot, B-roll, Lồng tiếng, Nhạc, SFX on a px/second scale. Dragging previews
// in place and sends ONE ctx.patch on release:
// - a shot's right edge: in Ripple mode (default) resize_shot (0.1 s steps, ≥ 0.5 s; the gateway
//   moves every later shot), in Roll mode (R) the cut between this shot and the next moves and the
//   video keeps its length (timeline-edit.js rollOps);
// - a voice block → move_line; with Shift held, the later lines of the same shot move with it
//   (rippleLineOps);
// - an SFX → move_event; the music body or its edges → update_music.
// A press without a drag selects the block (ctx.pick). The ruler, the playhead knob and empty lane
// space scrub; right click opens the block's menu. With snapping on (N), a dragged edge or the
// playhead snaps to shot edges, lines, SFX, the playhead, beats and word starts (snapTargets) and a
// .snap-line shows where. Overlapping music beds take a lane each and overlapping SFX stack in up
// to 4 tiers (timeline-lanes.js). Voice and music blocks carry their waveform (cached in
// IndexedDB), shots a frame of the newest render (thumbs.js). Beats on the ruler and word dots on
// voice blocks drag when the project has beats.json / words.json (timeline-markers.js). Ctrl/Cmd+
// wheel zooms around the pointer. M/S on an audio track mutes or solos it in the player only.
// Extensions draw view-only marks on a lane with addDecorator(fn(m, state) → [{ t, until?, lane:
// shot | voice | music | sfx, label, kind }]): a band from t to until, or a thin mark at t
// (timeline-edit.js decorationItems).
import { fmt, h, px, round1 } from "/dom.js";
import { beatTimes, decorationItems, eventStart, musicDragOps, rippleLineOps, rollOps, rollRange, snap, snapTargets, wordStarts } from "/timeline-edit.js";
import { openMenu } from "/context-menu.js";
import { drawWave, peaks } from "/waveform.js";
import { acceptDrop, brollBlocks, musicLanes, sfxTiers } from "/timeline-lanes.js";
import { thumbAt } from "/thumbs.js";

const LABEL = 90;
const MIN_SHOT = 0.5;
const CLICK = 3; // px of travel below which a press is a click, not a drag
const TRACK = 44, BROLL = 34, TIER = 20; // px heights: a track or music lane, the B-roll track, an SFX tier
const THUMB_MIN = 48; // px: narrower shots get no thumbnail
const round3 = (x) => Math.round(x * 1000) / 1000;
const clampPps = (x) => Math.max(8, Math.min(400, x));
const GROUPS = { "Lồng tiếng": "voiceover", "Nhạc": "music", "SFX": "sfx" };
// Band colours by kind; any other kind uses the first.
const DECO = { info: "rgba(80, 130, 230, 0.22)", warn: "rgba(230, 160, 40, 0.28)", bad: "rgba(220, 70, 60, 0.26)", ok: "rgba(60, 170, 100, 0.24)" };
const clock = (ms) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function mountTimeline(ctx, el, { zoomIn, zoomOut, zoomFit, snapBtn, modeBtn, markers }) {
  const decorators = [];
  let pps = 60, head = null, last = 0, fitted = null, total = 0, inner = null, snapOn = true, snapEl = null, mode = "ripple";
  let media = null, mediaFor = null;
  zoomIn.addEventListener("click", () => zoomBy(1.25));
  zoomOut.addEventListener("click", () => zoomBy(1 / 1.25));
  zoomFit?.addEventListener("click", () => fit());
  snapBtn?.addEventListener("click", () => toggleSnap());
  snapBtn?.setAttribute("aria-pressed", "true");
  modeBtn?.addEventListener("click", () => toggleMode());
  showMode();

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
  function showMode() {
    if (!modeBtn) return;
    modeBtn.textContent = mode === "roll" ? "Roll" : "Ripple";
    modeBtn.dataset.mode = mode;
    modeBtn.setAttribute("aria-pressed", String(mode === "roll"));
  }
  function toggleMode() {
    mode = mode === "roll" ? "ripple" : "roll";
    showMode();
    ctx.toast(mode === "roll" ? "Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên" : "Ripple: kéo mép shot đổi độ dài, các shot sau dời theo");
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

  // Pointer drag on target: onMove(dx, hit, ev) while moving, onUp(dx, hit, ev) on release (ev is
  // the last pointer event, so Shift can be read). With sn = { skip(target, pressEvent), edges(dx) }
  // and snapping on,
  // the dragged edge nearest a target is pulled onto it: dx is shifted by as much and hit is
  // { t, kind } of that target (null when nothing snapped).
  function drag(target, onMove, onUp, sn = null) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !ctx.editable) return;
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      const skip = typeof sn?.skip === "function" ? (x) => sn.skip(x, e) : null;
      const targets = sn ? targetsFor(skip) : [];
      let dx = 0, hit = null, lastEv = e;
      const move = (ev) => {
        lastEv = ev;
        dx = ev.clientX - x0;
        hit = null;
        // A press that has not travelled yet stays a click: no snapping.
        if (targets.length && Math.abs(dx) >= CLICK) {
          for (const raw of sn.edges(dx / pps, ev)) {
            const s = snap(raw, targets, pps);
            if (s.kind && (!hit || Math.abs(s.t - raw) < Math.abs(hit.d))) hit = { t: s.t, kind: s.kind, d: s.t - raw };
          }
        }
        if (hit) { dx += hit.d * pps; showSnap(hit.t); } else hideSnap();
        onMove(dx, hit, ev);
      };
      const up = (ev) => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        hideSnap();
        onUp(dx, hit, ev?.type === "pointerup" ? ev : lastEv);
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

  const byId = (id) => inner?.querySelector(`[data-id="${CSS.escape(id)}"]`);

  // A frame of the newest render at the middle of the shot, behind its label.
  function shotThumb(b, s) {
    const r = media?.render;
    if (!r || (s.end - s.start) * pps < THUMB_MIN) return;
    thumbAt(fileUrl(r.path), r.mtime, round3((s.start + s.end) / 2)).then((u) => {
      if (!u || !b.isConnected) return;
      b.style.backgroundImage = `url("${u}")`;
      b.classList.add("has-thumb");
      if (r.stale) b.classList.add("thumb-stale");
    });
  }

  function shotBlock(s, i) {
    const m = ctx.state.m;
    const dur = s.end - s.start;
    const label = s.name ? `${i + 1} · ${s.name}` : `${i + 1}`;
    const b = h("div", { class: `blk shot${s.id === ctx.state.sel ? " sel" : ""}`, title: label, "data-id": s.id, style: { left: px(s.start * pps), width: px(dur * pps) }, onclick: () => ctx.select(s.id) },
      h("span", { class: "shot-label" }, label));
    const handle = h("div", { class: "handle", title: mode === "roll" ? "Kéo để dời điểm cắt (Roll)" : "Kéo để đổi độ dài (Ripple)" });
    b.append(handle);
    shotThumb(b, s);
    acceptDrop(ctx, b, s);
    const nextShot = m.shots[i + 1];
    // Ripple: this shot and the ones after it move with the edge, and so do their lines and SFX.
    const later = new Set(m.shots.slice(i).map((x) => x.id));
    const moving = new Set([...m.lines.filter((l) => later.has(l.shot) && l.shot !== s.id).map((l) => l.id),
      ...(m.events ?? []).filter((x) => later.has(x.shot) && x.shot !== s.id).map((x) => x.id)]);
    const rippleSkip = (x) => (x.kind === "shot" && later.has(x.id) && !(x.id === s.id && x.t < s.end)) || moving.has(x.id);
    // Roll: only the cut and what the next shot holds move.
    const nextHeld = new Set(nextShot ? [...m.lines.filter((l) => l.shot === nextShot.id).map((l) => l.id), ...(m.events ?? []).filter((x) => x.shot === nextShot.id).map((x) => x.id)] : []);
    const rollSkip = (x) => (x.kind === "shot" && Math.abs(x.t - s.end) < 0.0005) || nextHeld.has(x.id);
    // A snapped edge keeps the target's exact time; a free drag moves in 0.1 s steps.
    const step = (d, hit) => (hit ? round3(d) : round1(d));
    const rippleDur = (dx, hit) => Math.max(MIN_SHOT, step(dur + dx / pps, hit));
    const range = rollRange(m, s.id);
    const rollDt = (dx, hit) => (range ? Math.max(range[0], Math.min(range[1], round3(step(s.end + dx / pps, hit) - s.end))) : 0);
    const nextEl = () => (nextShot ? byId(nextShot.id) : null);
    drag(handle, (dx, hit) => {
      b.classList.add("dragging");
      if (mode !== "roll") { b.style.width = px(rippleDur(dx, hit) * pps); return; }
      const dt = rollDt(dx, hit), n = nextEl();
      b.style.width = px((dur + dt) * pps);
      if (n) { n.style.left = px((nextShot.start + dt) * pps); n.style.width = px((nextShot.end - nextShot.start - dt) * pps); n.classList.add("dragging"); }
    }, (dx, hit) => {
      if (mode === "roll") {
        const dt = rollDt(dx, hit);
        if (Math.abs(dt) < 0.0005) return render();
        const r = rollOps(m, s.id, dt);
        if (r.error) { ctx.toast(r.error, true); return render(); }
        ctx.select(s.id);
        return ctx.patch(r.ops);
      }
      const d = rippleDur(dx, hit);
      if (Math.abs(d - dur) < 0.0005 || (!hit && Math.abs(d - dur) < 0.05)) return render();
      ctx.select(s.id);
      ctx.patch([{ op: "resize_shot", id: s.id, duration: d }]);
    }, { skip: (x) => (mode === "roll" ? rollSkip(x) : rippleSkip(x)), edges: (d) => [s.end + d] });
    if (mode === "roll" && !nextShot) handle.title = "Shot cuối: Roll cần shot kế tiếp, kéo sẽ không đổi gì";
    menuOn(b, () => [
      ctx.editable && { label: "Cắt tại playhead (S)", run: () => { ctx.select(s.id); ctx.split(); } },
      ctx.editable && nextShot && { label: "Roll điểm cắt về playhead", run: () => {
        const t = ctx.transport?.time?.() ?? 0;
        const r = rollOps(m, s.id, round3(t - s.end));
        if (r.error) return ctx.toast(r.error, true);
        if (r.ops.length) ctx.patch(r.ops);
      } },
      { label: "Nhờ đạo diễn sửa shot này", run: () => { ctx.pick("shot", s.id); ctx.emit("focus-note"); } },
    ]);
    return b;
  }

  function voiceBlock(l) {
    const m = ctx.state.m;
    const wave = h("canvas", { class: "wave", width: 0, height: 0, "aria-hidden": "true" });
    // Word dots: draggable ones from words.json, else TIMING's word starts (view only).
    let marks = [];
    if (pps >= 120) {
      marks = markers?.wordDots(l, pps) ?? (words.get(l.id) ?? []).filter((t) => t >= l.start - 1e-6 && t <= l.start + l.duration)
        .map((t) => h("span", { class: "word-mark", style: { left: px((t - l.start) * pps) } }));
    }
    const b = h("div", { class: `blk voice${l.gate === "stale" ? " stale" : ""}${picked("line", l.id) ? " sel" : ""}`, title: `${l.text}\nShift+kéo: dời cả các câu sau trong shot`, "data-id": l.id, style: { left: px(l.start * pps), width: px(Math.max(0.2, l.duration) * pps) } },
      wave, h("span", { class: "mic" }), l.text.slice(0, 24), marks);
    if (l.file && l.duration > 0) waves.push([wave, l.file, { from: 0, to: l.duration }]);
    const next = (dx, hit) => Math.max(0, hit ? round3(l.start + dx / pps) : round1(l.start + dx / pps));
    // With Shift, the later lines of the shot follow the dragged one (preview and patch).
    let fl = null;
    const followers = () => (fl ??= (rippleLineOps(m, l.id, l.start + 1).ops ?? []).map((o) => o.id).filter((id) => id !== l.id));
    let shown = [];
    const preview = (d, on) => {
      for (const id of shown) { const x = byId(id); const ln = m.lines.find((y) => y.id === id); if (x && ln) { x.style.left = px(ln.start * pps); x.classList.remove("dragging"); } }
      shown = on ? followers() : [];
      for (const id of shown) { const x = byId(id); const ln = m.lines.find((y) => y.id === id); if (x && ln) { x.style.left = px(Math.max(0, ln.start + d) * pps); x.classList.add("dragging"); } }
    };
    b.addEventListener("click", () => { if (!ctx.editable) ctx.pick("line", l.id); });
    drag(b, (dx, hit, ev) => {
      b.classList.add("dragging");
      const t = next(dx, hit);
      b.style.left = px(t * pps);
      preview(t - l.start, ev?.shiftKey);
    }, (dx, hit, ev) => {
      if (Math.abs(dx) < CLICK) { render(); return ctx.pick("line", l.id); }
      const t = next(dx, hit);
      if (ev?.shiftKey) {
        const r = rippleLineOps(m, l.id, t);
        if (r.error) { ctx.toast(r.error, true); return render(); }
        if (!r.ops.length) return render();
        return ctx.patch(r.ops);
      }
      ctx.patch([{ op: "move_line", id: l.id, start: t }]);
    }, {
      // Pressed with Shift, the followers move too, so they are no target either.
      skip: (x, e) => x.id === l.id || (Boolean(e?.shiftKey) && followers().includes(x.id)),
      edges: (d) => [l.start + d, l.start + l.duration + d],
    });
    menuOn(b, () => [{ label: "Chọn câu", run: () => ctx.pick("line", l.id) }]);
    return b;
  }

  function musicBlock(mu, lane) {
    const span = (op) => {
      const start = op?.start ?? mu.start;
      const end = op && "end" in op ? (op.end ?? total) : (mu.end ?? total);
      return { left: px(start * pps), width: px(Math.max(0.2, end - start) * pps) };
    };
    const wave = h("canvas", { class: "wave", width: 0, height: 0, "aria-hidden": "true" });
    const b = h("div", { class: `blk music${picked("music", mu.id) ? " sel" : ""}`, title: mu.file, "data-id": mu.id, style: { ...span(null), top: px(lane * TRACK + 6), bottom: "auto", height: px(TRACK - 12) } },
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

  function eventBlock(e, tier) {
    const start = eventStart(ctx.state.m, e);
    const label = e.label || e.id;
    const b = h("div", { class: `blk sfx${picked("event", e.id) ? " sel" : ""}`, title: `${label} · ${fmt(start)}`, "data-id": e.id, style: { left: px(start * pps - 7), top: px(4 + tier * TIER), bottom: "auto", height: px(TIER - 4) } },
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

  // Marks of every decorator, by lane, as nodes. A decorator that throws is skipped (logged).
  function decorations(m) {
    const items = decorationItems(decorators, m, ctx.state, (e) => console.error("timeline decorator", e));
    const by = {};
    for (const [lane, list] of Object.entries(items)) {
      by[lane] = list.map((d) => {
        const band = d.until !== null;
        return h("div", { class: `tl-deco${band ? " band" : ""}`, "data-kind": d.kind, title: d.label, "aria-hidden": "true",
          style: { position: "absolute", top: "0", bottom: "0", left: px(d.t * pps), width: px(band ? (d.until - d.t) * pps : 2), background: band ? (DECO[d.kind] ?? DECO.info) : "currentColor", color: "var(--muted)", pointerEvents: "none", zIndex: "0", overflow: "hidden", whiteSpace: "nowrap", fontSize: "10px", padding: band ? "0 3px" : "0" } },
          band && (d.until - d.t) * pps > 24 ? d.label : null);
      });
    }
    return by;
  }
  function addDecorator(fn) {
    if (typeof fn !== "function") throw new Error("addTimelineDecorator: cần một hàm");
    decorators.push(fn);
    render();
  }

  let waves = [], words = new Map();
  const fileUrl = (rel) => `/p/${encodeURIComponent(ctx.state.name)}/${String(rel).split("/").map(encodeURIComponent).join("/")}`;

  // Sizes and mtimes of the project's files (cache keys) and its newest render, per version.
  async function loadMedia() {
    const { name, m } = ctx.state;
    const key = m ? `${name}:${m.version}` : null;
    if (!key || key === mediaFor) return;
    mediaFor = key;
    try {
      const d = await ctx.api(`/api/timeline/media?name=${encodeURIComponent(name)}`);
      if (mediaFor !== key) return;
      media = d;
    } catch (e) {
      if (mediaFor !== key) return;
      media = { render: null, files: {} };
      console.warn("timeline media:", e.message);
    }
    render();
  }

  function render() {
    const m = ctx.state.m;
    waves = [];
    words = wordStarts(ctx.state.timing);
    if (!m) { head = null; inner = null; media = null; mediaFor = null; el.replaceChildren(h("div", { class: "muted", style: { padding: "12px" } }, "Chưa có timeline")); return; }
    total = Math.max(m.duration || 0, ...m.shots.map((s) => s.end), ...m.lines.map((l) => l.start + l.duration));
    // First view of a project: zoom so the whole video fills the timeline width.
    if (fitted !== ctx.state.name && total > 0 && el.clientWidth > 0) { fitted = ctx.state.name; pps = Math.max(8, Math.min(400, (el.clientWidth - LABEL - 60) / total)); }
    const lane = total * pps + 60;
    const ruler = h("div", { class: "tl-ruler", title: "Kéo để tua", style: { width: px(lane) } });
    const rulerRect = () => ruler.getBoundingClientRect();
    scrub(ruler, rulerRect);
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 50) ?? 60;
    for (let t = 0; t <= total + 1e-6; t += step) ruler.append(h("div", { class: "tl-tick", style: { left: px(t * pps) } }, `${+t.toFixed(1)}s`));
    // Beats: the draggable grid of beats.json when there is one, else TIMING's (view only); only
    // when they are at least 6 px apart, closer they would just grey the ruler.
    const grid = markers?.beatLayer(pps, total);
    if (grid) ruler.append(grid);
    else {
      const beats = beatTimes(ctx.state.timing, total).filter((t) => t <= total + 1e-6);
      const gap = beats.slice(1).reduce((g, t, i) => Math.min(g, t - beats[i]), Infinity);
      if (beats.length && gap * pps >= 6) for (const t of beats) ruler.append(h("div", { class: "tl-beat", style: { left: px(t * pps) } }));
    }
    const timeAt = (laneEl, x) => Math.max(0, Math.min(total, (x - laneEl.getBoundingClientRect().left) / pps));
    const deco = decorations(m);
    const track = (label, blocks, menu, laneKey, height = TRACK, extra = null) => {
      const laneEl = h("div", { class: "tl-lane" }, deco[laneKey] ?? [], blocks);
      // Empty lane space: a click seeks there, a right click opens the lane's menu.
      laneEl.addEventListener("click", (e) => { if (e.target === laneEl) ctx.seek(timeAt(laneEl, e.clientX)); });
      if (menu) laneEl.addEventListener("contextmenu", (e) => {
        if (e.target !== laneEl) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, menu(round3(timeAt(laneEl, e.clientX))));
      });
      const group = GROUPS[label];
      return h("div", { class: `tl-track${laneKey ? ` t-${laneKey}` : ""}`, style: { width: px(LABEL + lane), height: px(height) } },
        h("div", { class: "tl-label" }, h("span", {}, label), group ? muteButtons(group, label) : null, extra), laneEl);
    };
    const ml = musicLanes(m, total);
    const st = sfxTiers(m, pps);
    const tiers = Math.max(1, st.count);
    const r = media?.render;
    const shotNote = r ? h("span", { class: `tl-note${r.stale ? " stale" : ""}`, title: `Ảnh từ ${r.path}, ${new Date(r.mtime).toLocaleString("vi-VN")}${r.stale ? ", cũ hơn lần sửa timeline gần nhất" : ""}` }, `ảnh ${clock(r.mtime)}`) : null;
    const knob = h("div", { class: "knob", title: "Kéo để tua" });
    scrub(knob, rulerRect);
    head = h("div", { class: "playhead", style: { left: px(LABEL + last * pps) } }, knob);
    inner = h("div", { class: `tl-inner${ctx.editable ? "" : " readonly"}`, style: { width: px(LABEL + lane) } },
      ruler,
      track("Shot", m.shots.map(shotBlock), null, "shot", TRACK, shotNote),
      track("B-roll", brollBlocks(ctx, m, pps, { fileUrl, stamps: media?.files }), null, "broll", BROLL),
      track("Lồng tiếng", m.lines.map(voiceBlock), null, "voice"),
      track("Nhạc", m.music.map((mu) => musicBlock(mu, ml.lane[mu.id] ?? 0)), null, "music", TRACK * Math.max(1, ml.count)),
      track("SFX", (m.events ?? []).map((e) => eventBlock(e, st.lane[e.id] ?? 0)), (t) => ctx.editable ? [{ label: "Thêm SFX tại đây…", run: () => ctx.addSfx(t) }] : [], "sfx", Math.max(TRACK, tiers * TIER + 8),
        st.overflow ? h("span", { class: "tl-note stale", title: "Hơn 4 SFX chồng nhau; tầng cuối gộp phần còn lại, phóng to để tách" }, "+ gộp") : null),
      head);
    const sx = el.scrollLeft, sy = el.scrollTop;
    el.replaceChildren(inner);
    el.scrollLeft = sx;
    el.scrollTop = sy;
    // Waveforms paint once their peaks are in (IndexedDB, else one decode per file); a block
    // without them looks as before. Without the file stamps yet, wait: they key the cache.
    if (media) for (const [canvas, file, range] of waves) peaks(fileUrl(file), media.files?.[file] ?? null).then((data) => { if (canvas.isConnected) drawWave(canvas, data, range); });
  }

  ctx.on("time", (t) => { last = t; if (head) head.style.left = px(LABEL + t * pps); });
  ctx.on("manifest", () => { render(); loadMedia(); });
  ctx.on("select", render);
  ctx.on("timing", render);
  return { render, zoomBy, fit, toggleSnap, toggleMode, mode: () => mode, addDecorator };
}
