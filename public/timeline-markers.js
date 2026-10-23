// timeline-markers.js — beat and word markers that drag. The data is GET /api/timing (the music
// bed's beats.json and each line's words.json, routes/timing.mjs), not window.TIMING: TIMING is
// rebuilt from those files by the provider's timing command after every change.
// - A beat line on the ruler drags the whole grid: release → POST /api/timing/beat with the new
//   beat0 (kept in [0, beatLen) so B(n) keeps its numbering; timeline-edit.js markerDrag).
// - A word dot on a voice block (zoomed in) drags that word's start: release → POST
//   /api/timing/word, in seconds of the voice file (the dot sits at line start + word start).
// - A press without travel picks the marker for the inspector (kind "beat" or "word").
// When the timing job ends the player reloads (the composition's TIMING changed), the markers are
// read again, and the user is told the animatic needs approving again ("retimed"). Studio never
// writes the approval line itself.
import { h, px } from "/dom.js";
import { beatBounds, markerDrag } from "/timeline-edit.js";

const CLICK = 3;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function createMarkers(ctx, { onChange }) {
  let data = null, forName = null, seq = 0;

  async function load() {
    const name = ctx.state.name;
    const my = ++seq;
    if (!name || !ctx.state.m) { data = null; forName = null; onChange(); return null; }
    try {
      const d = await ctx.api(`/api/timing?name=${encodeURIComponent(name)}`);
      if (my !== seq || name !== ctx.state.name) return data;
      data = d; forName = name;
    } catch (e) {
      if (my !== seq) return data;
      data = null; forName = name;
      console.warn("timing markers:", e.message);
    }
    onChange();
    return data;
  }

  const get = () => (forName === ctx.state.name ? data : null);
  const line = (id) => get()?.lines?.find((l) => l.id === id) ?? null;
  const editable = () => ctx.editable && Boolean(get());

  // A sent change: the answer starts the timing job; its exit (below) finishes the change.
  async function send(path, body, what) {
    const r = await ctx.send(path, { name: ctx.state.name, ...body });
    if (r.status !== 200) { ctx.toast(r.error ?? `Lỗi ${r.status}`, true); await load(); return false; }
    if (r.changed === false) { ctx.toast("Không có gì thay đổi"); await load(); return true; }
    ctx.toast(r.warning ? `${what}; chưa dựng lại TIMING: ${r.warning}` : `${what}; đang dựng lại TIMING…`, Boolean(r.warning));
    await load();
    return true;
  }

  function setBeat(beat0) {
    const g = get()?.grid;
    if (!g) return false;
    return send("/api/timing/beat", { music_id: g.music_id, base_sha: g.sha, beat0: r3(beat0) }, `Đã dời lưới phách, beat0 ${r3(beat0).toFixed(3)}s`);
  }
  function setWord(lineId, index, fields) {
    const l = line(lineId);
    if (!l) return false;
    return send("/api/timing/word", { line_id: lineId, index, base_sha: l.sha, ...fields }, `Đã dời từ "${l.words[index]?.text ?? index}"`);
  }
  async function undo() {
    const r = await ctx.send("/api/timing/undo", { name: ctx.state.name });
    if (r.status !== 200) { ctx.toast(r.status === 422 ? "Không còn mốc nào để hoàn tác" : r.error ?? `Lỗi ${r.status}`, r.status !== 422); return false; }
    ctx.toast(`Đã hoàn tác mốc (${r.file}); đang dựng lại TIMING…`);
    await load();
    return true;
  }
  async function wordSync() {
    const r = await ctx.send("/api/timing/word-sync", { name: ctx.state.name });
    if (r.status !== 200) return ctx.toast(r.error ?? `Lỗi ${r.status}`, true);
    ctx.toast("Đang kiểm khớp lời…");
  }

  // Pointer drag of el: move(dx) while moving, done(dx) on release. No editing: click only.
  function drag(el, { move, done, click }) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!editable()) { click(); return; }
      el.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      let dx = 0;
      const mv = (ev) => { dx = ev.clientX - x0; if (Math.abs(dx) >= CLICK) move(dx); };
      const up = () => {
        el.removeEventListener("pointermove", mv);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (Math.abs(dx) < CLICK) click(); else done(dx);
      };
      el.addEventListener("pointermove", mv);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    el.addEventListener("click", (e) => e.stopPropagation());
  }

  // Beat lines of the grid on the ruler (null when there is no editable grid: the timeline draws
  // TIMING's beats, view only). Lines closer than 6 px are not drawn.
  function beatLayer(pps, total) {
    const g = get()?.grid;
    if (!g || !beatBounds(g.beatLen) || g.beatLen * pps < 6) return null;
    const layer = h("div", { class: "beat-layer" });
    const picked = ctx.state.pick?.kind === "beat";
    for (let k = 0, t = g.beat0; t <= total + 1e-6; k++, t = g.beat0 + k * g.beatLen) {
      const el = h("div", { class: `tl-beat drag${picked ? " sel" : ""}`, title: `Phách ${k} · ${t.toFixed(3)}s · kéo để dời cả lưới`, style: { left: px(t * pps) } });
      drag(el, {
        move: (dx) => {
          const r = markerDrag(g, "beat", dx / pps);
          layer.style.transform = `translateX(${px(((r.value ?? g.beat0) - g.beat0) * pps)})`;
          layer.classList.add("dragging");
        },
        done: (dx) => {
          const r = markerDrag(g, "beat", dx / pps);
          if (r.error) { ctx.toast(r.error, true); return onChange(); }
          if (r.clamped) ctx.toast("beat0 giữ trong một phách đầu để B(n) không đổi số");
          ctx.pick("beat", g.music_id);
          setBeat(r.value);
        },
        click: () => ctx.pick("beat", g.music_id),
      });
      layer.append(el);
    }
    return layer;
  }

  // Word dots of line l inside its voice block (null without words.json data: the timeline shows
  // TIMING's word starts, view only).
  function wordDots(l, pps) {
    const d = line(l.id);
    if (!d) return null;
    const out = [];
    const pick = ctx.state.pick;
    d.words.forEach((w, i) => {
      if (!Number.isFinite(w.start)) return;
      const rel = w.start; // seconds into the line's file = seconds into its block
      if (rel < -1e-6 || (l.duration > 0 && rel > l.duration + 1e-6)) return;
      const sel = pick?.kind === "word" && pick.id === `${l.id}#${i}`;
      const dot = h("span", { class: `word-mark drag${sel ? " sel" : ""}`, title: `"${w.text}" · ${(d.offset + w.start).toFixed(3)}s · kéo để dời đầu từ`, style: { left: px(rel * pps) } });
      drag(dot, {
        move: (dx) => {
          const r = markerDrag({ words: d.words, index: i }, "word", dx / pps);
          dot.style.left = px((r.value ?? w.start) * pps);
          dot.classList.add("dragging");
        },
        done: (dx) => {
          const r = markerDrag({ words: d.words, index: i }, "word", dx / pps);
          if (r.error) { ctx.toast(r.error, true); return onChange(); }
          if (r.clamped) ctx.toast("Đầu từ không vượt từ kề và cách cuối từ ít nhất 10 ms");
          ctx.pick("word", `${l.id}#${i}`);
          setWord(l.id, i, { start: r.value });
        },
        click: () => ctx.pick("word", `${l.id}#${i}`),
      });
      out.push(dot);
    });
    return out;
  }

  // The timing job of this project ended: reload the player and the markers. A word-sync check
  // ended: count its PASS / WARN / FAIL lines (the log is in the Xuất bản tab).
  ctx.on("jobs", (e) => {
    if (e?.type !== "exit" || e.job?.name !== ctx.state.name) return;
    if (e.job.kind === "word-sync") {
      const n = { PASS: 0, WARN: 0, FAIL: 0 };
      for (const l of ctx.state.logs.get(e.job.id) ?? []) { const k = /^(PASS|WARN|FAIL)\b/.exec(l)?.[1]; if (k) n[k]++; }
      return ctx.toast(`Khớp lời: ${n.PASS} đạt, ${n.WARN} cảnh báo, ${n.FAIL} lệch (log ở tab Xuất bản)`, n.FAIL > 0 || (e.job.code !== 0 && e.job.code !== 1));
    }
    if (e.job.kind !== "timing") return;
    if (e.job.code === 0) {
      ctx.state.retimed = true;
      ctx.transport?.reload?.();
      ctx.toast("Đã dựng lại TIMING. Animatic cần duyệt lại");
      ctx.emit("retimed");
    } else if (e.job.status !== "cancelled") {
      const tail = ctx.state.logs.get(e.job.id)?.at(-1) ?? "";
      ctx.toast(`Dựng lại TIMING lỗi (exit ${e.job.code})${tail ? `: ${tail.slice(0, 160)}` : ""}`, true);
    }
    load();
  });
  ctx.on("project", () => { ctx.state.retimed = false; });

  return { load, get, line, editable, setBeat, setWord, undo, wordSync, beatLayer, wordDots };
}
