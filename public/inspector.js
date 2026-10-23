// inspector.js — the picked block (ctx.state.pick), by kind:
// - shot: Tên, Số giây, Chuyển cảnh vào and motion_note, applied together with "Áp dụng" as one
//   patch (set_shot + resize_shot); assets as thumbnails. "Nhờ đạo diễn" sends the motion note as a
//   shot request at the playhead time.
// - line: the text and time; the text is edited in the "Lời & giọng" tab (viet-pro gate there).
// - music: start, end, head trim, volume, fades → one update_music with the changed fields.
// - event: label, sound, time (→ move_event); delete only for SFX added in Studio.
// - beat / word: a marker of the timeline (ctx.markers): its time now and before Studio first
//   moved it, a field to set it, "Về gốc", "Hoàn tác mốc" and, for words, "Kiểm khớp lời".
// After a marker change rebuilt TIMING (ctx.state.retimed), every view starts with the note that
// the animatic needs approving again.
// Read-only projects show every field disabled.
// Extensions add sections at the end (addSection({ kinds, view(pick, m) }), see docs/extensions.md).
import { fmt, fmtS, h, round1, thumb } from "/dom.js";
import { eventStart } from "/timeline-edit.js";

const r3 = (x) => Math.round(x * 1000) / 1000;

export function mountInspector(ctx, el) {
  let seams = [];
  const extra = []; // [{ kinds:Set, view }], from addSection
  ctx.api("/api/directions").then((d) => { seams = d.seams ?? []; render(); }).catch(() => {});

  function render() {
    const m = ctx.state.m;
    if (!m) { el.replaceChildren(); return; }
    const p = ctx.state.pick ?? { kind: "shot", id: ctx.state.sel };
    const view = { line: lineView, music: musicView, event: eventView, beat: beatView, word: wordView }[p.kind];
    const node = view?.(m, p.id);
    if (node) el.replaceChildren(...node.filter(Boolean));
    else shotView(m);
    if (ctx.state.retimed) el.prepend(h("div", { class: "note", "data-role": "retimed" }, "Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất"));
    for (const x of extra) {
      if (!x.kinds.has(p.kind)) continue;
      try { el.append(...[x.view(p, m)].flat(Infinity).filter(Boolean)); } catch (e) { console.error("inspector section", e); el.append(h("p", { class: "form-error" }, `Mục mở rộng lỗi: ${e.message}`)); }
    }
  }

  // kinds: the picks it shows for (shot, line, music, event); view(pick, m) → node, list or null.
  function addSection({ kinds = ["shot"], view }) {
    if (typeof view !== "function") throw new Error("addInspectorSection: cần view()");
    extra.push({ kinds: new Set(kinds), view });
    render();
  }

  function shotView(m) {
    const i = m.shots.findIndex((s) => s.id === ctx.state.sel);
    if (i < 0) { el.replaceChildren(h("div", { class: "muted" }, "Chọn một shot trên timeline")); return; }
    const s = m.shots[i];
    const ro = !ctx.editable;
    const dur = round1(s.end - s.start);
    const name = h("input", { type: "text", value: s.name, disabled: ro });
    const secs = h("input", { type: "number", step: "0.1", min: "0.5", value: String(dur), disabled: ro });
    const cur = s.transition_in ?? "";
    const opts = ["", ...new Set([...seams, cur].filter(Boolean))];
    const trans = h("select", { disabled: ro }, opts.map((o) => h("option", { value: o, selected: o === cur }, o || "(không)")));
    // Also the text of "Nhờ đạo diễn", so it stays editable on read-only projects.
    const note = h("textarea", { value: s.motion_note ?? "", placeholder: "Muốn shot này chuyển động thế nào…", "data-role": "motion-note" });

    async function apply() {
      const ops = [];
      const n = name.value.trim();
      if (n && n !== s.name) ops.push({ op: "set_shot", id: s.id, field: "name", value: n });
      if (trans.value !== cur) ops.push({ op: "set_shot", id: s.id, field: "transition_in", value: trans.value });
      if (note.value !== (s.motion_note ?? "")) ops.push({ op: "set_shot", id: s.id, field: "motion_note", value: note.value });
      const d = round1(Number(secs.value));
      if (!(d >= 0.5)) return ctx.toast("Số giây tối thiểu là 0,5", true);
      if (Math.abs(d - (s.end - s.start)) >= 0.05) ops.push({ op: "resize_shot", id: s.id, duration: d });
      if (!ops.length) return ctx.toast("Không có gì thay đổi");
      if (await ctx.patch(ops)) ctx.toast("Đã áp dụng");
    }

    const assets = s.assets ?? [];
    el.replaceChildren(
      h("h3", {}, `SHOT ${i + 1} · ${fmtS(s.start)}–${fmtS(s.end)}`),
      h("label", {}, "Tên", name),
      h("label", {}, "Số giây", secs),
      h("label", {}, "Chuyển cảnh vào", trans),
      h("button", { class: "btn primary", disabled: ro, onclick: apply }, "Áp dụng"),
      h("h3", {}, "Chuyển động"),
      h("div", { class: "muted" }, "Nội dung chuyển động trong shot này là code — nhờ đạo diễn"),
      note,
      h("button", { class: "btn", onclick: () => ctx.direct({ scope: "shot", target: s.id, t: round1(ctx.state.t), text: note.value.trim() }) }, "Nhờ đạo diễn"),
      h("h3", {}, `Chất liệu (${assets.length})`),
      assets.length ? h("div", { class: "thumbs" }, assets.map((a) => thumb(ctx.state.name, a))) : h("div", { class: "muted" }, "Chưa có chất liệu"),
    );
  }

  function lineView(m, id) {
    const l = m.lines.find((x) => x.id === id);
    if (!l) return null;
    return [
      h("h3", {}, `CÂU ${l.id} · ${fmtS(l.start)}–${fmtS(l.start + l.duration)}`),
      h("div", { class: "quote" }, l.text),
      l.gate === "stale" ? h("div", { class: "note" }, "Lời đã sửa, cần qua cổng viet-pro và lồng tiếng lại") : null,
      h("button", { class: "btn", onclick: () => ctx.openTab?.("voice") }, "Sửa lời ở tab Lời & giọng"),
    ].filter(Boolean);
  }

  // A number field; blank allowed only where noted (end: blank = to the end of the video).
  const num = (value, attrs = {}) => h("input", { type: "number", value: value == null ? "" : String(value), disabled: !ctx.editable, ...attrs });

  function musicView(m, id) {
    const b = m.music.find((x) => x.id === id);
    if (!b) return null;
    const total = m.duration || 0;
    const start = num(b.start, { step: "0.1", min: "0" });
    const end = num(b.end, { step: "0.1", min: "0", placeholder: "hết video" });
    const head = num(b.media_start ?? 0, { step: "0.1", min: "0" });
    const gain = num(Math.round((b.gain ?? 1) * 100), { step: "1", min: "0", max: "100" });
    const fin = num(b.fade_in ?? 0, { step: "0.1", min: "0" });
    const fout = num(b.fade_out ?? 0, { step: "0.1", min: "0" });

    async function apply() {
      const v = (input) => Number(input.value);
      const s = v(start), ms = v(head), g = v(gain), fi = v(fin), fo = v(fout);
      const e = end.value.trim() === "" ? null : v(end);
      if (![s, ms, g, fi, fo].every(Number.isFinite) || (e !== null && !Number.isFinite(e))) return ctx.toast("Nhập số hợp lệ", true);
      if (s < 0 || ms < 0 || fi < 0 || fo < 0) return ctx.toast("Thời gian không được âm", true);
      if (g < 0 || g > 100) return ctx.toast("Âm lượng trong 0–100%", true);
      if (e !== null && (e > total + 1e-6 || e - s < 0.5)) return ctx.toast(`Kết thúc phải sau bắt đầu ít nhất 0,5 giây và không quá ${fmtS(total)}`, true);
      if (fi + fo > (e ?? total) - s + 1e-6) return ctx.toast("Fade vào + fade ra dài hơn khối nhạc", true);
      const op = { op: "update_music", id: b.id };
      const set = (k, val, was) => { if (val === null ? was != null : was == null || Math.abs(val - was) > 1e-6) op[k] = val === null ? null : r3(val); };
      set("start", s, b.start);
      set("end", e, b.end ?? null);
      set("media_start", ms, b.media_start ?? 0);
      set("gain", g / 100, b.gain ?? 1);
      set("fade_in", fi, b.fade_in ?? 0);
      set("fade_out", fo, b.fade_out ?? 0);
      if (Object.keys(op).length === 2) return ctx.toast("Không có gì thay đổi");
      if (await ctx.patch([op])) ctx.toast("Đã áp dụng");
    }

    return [
      h("h3", {}, `NHẠC · ${b.file.split("/").pop()}`),
      h("div", { class: "muted" }, b.file),
      h("label", {}, "Bắt đầu (giây)", start),
      h("label", {}, "Kết thúc (giây, trống = hết video)", end),
      h("label", {}, "Cắt đầu (giây)", head),
      h("label", {}, "Âm lượng (%)", gain),
      h("label", {}, "Fade vào (giây)", fin),
      h("label", {}, "Fade ra (giây)", fout),
      h("div", { class: "muted" }, "Fade chỉ nghe trong bản xuất, xem thử chưa có fade"),
      h("button", { class: "btn primary", disabled: !ctx.editable, onclick: apply }, "Áp dụng"),
    ];
  }

  function eventView(m, id) {
    const e = (m.events ?? []).find((x) => x.id === id);
    if (!e) return null;
    const at = eventStart(m, e);
    const time = num(at, { step: "0.01", min: "0" });
    async function apply() {
      const t = Number(time.value);
      if (!Number.isFinite(t) || t < 0 || t > (m.duration || 0)) return ctx.toast(`Thời điểm trong 0–${fmtS(m.duration || 0)}`, true);
      if (Math.abs(t - at) < 1e-6) return ctx.toast("Không có gì thay đổi");
      if (await ctx.patch([{ op: "move_event", id: e.id, start: r3(t) }])) ctx.toast("Đã áp dụng");
    }
    return [
      h("h3", {}, `SFX ${e.id} · ${fmt(at)}`),
      h("label", {}, "Nhãn", h("input", { type: "text", value: e.label ?? "", disabled: true })),
      h("label", {}, "File âm thanh", h("input", { type: "text", value: e.sound ?? "", disabled: true })),
      h("label", {}, "Thời điểm (giây)", time),
      h("button", { class: "btn primary", disabled: !ctx.editable, onclick: apply }, "Áp dụng"),
      h("label", {}, "Âm lượng", h("input", { type: "text", value: e.volume == null ? "mặc định" : `${Math.round(e.volume * 100)}%`, disabled: true })),
      h("div", { class: "muted" }, "Âm lượng SFX đổi qua đạo diễn"),
      e.studio
        ? h("button", { class: "btn", disabled: !ctx.editable, onclick: () => ctx.patch([{ op: "remove_event", id: e.id }]) }, "Xoá SFX")
        : h("button", { class: "btn", onclick: () => ctx.directRemoveSfx(e) }, "Nhờ đạo diễn xoá SFX này"),
    ];
  }

  const t3 = (x) => (Number.isFinite(x) ? `${x.toFixed(3)}s` : "—");
  const gone = (what) => [h("h3", {}, what), h("div", { class: "muted" }, "Mốc này không còn (file đã đổi). Chọn lại trên timeline.")];
  const busyNote = (d) => (d?.busy ? h("div", { class: "note" }, `Chưa sửa được: ${d.busy}`) : null);
  const undoBtn = (d) => h("button", { class: "btn", disabled: !ctx.editable || !(d?.undo > 0), onclick: () => ctx.markers.undo() }, `Hoàn tác mốc${d?.undo > 0 ? ` (${d.undo})` : ""}`);

  function beatView(m, id) {
    const d = ctx.markers?.get();
    const g = d?.grid;
    if (!g || g.music_id !== id) return gone("MỐC PHÁCH");
    const ro = !ctx.markers.editable();
    const input = num(g.beat0, { step: "0.001", min: "0", max: String(Math.max(0, g.beatLen - 0.001)) });
    input.disabled = ro;
    const bpm = g.beatLen > 0 ? Math.round((60 / g.beatLen) * 10) / 10 : null;
    return [
      h("h3", {}, `MỐC PHÁCH · ${g.file.split("/").pop()}`),
      h("div", { class: "muted" }, `${g.file}${bpm ? ` · ${bpm} BPM · một phách ${t3(g.beatLen)}` : ""}`),
      h("label", {}, "Phách đầu (beat0, giây)", input),
      h("div", { class: "kv" }, h("span", {}, "Giờ gốc"), h("strong", {}, t3(g.original))),
      busyNote(d),
      h("div", { class: "row" },
        h("button", { class: "btn primary", disabled: ro, onclick: () => ctx.markers.setBeat(Number(input.value)) }, "Áp dụng"),
        h("button", { class: "btn", disabled: ro || Math.abs(g.original - g.beat0) < 1e-6, onclick: () => ctx.markers.setBeat(g.original) }, "Về gốc")),
      undoBtn(d),
      h("div", { class: "muted" }, "Kéo một vạch phách trên thước để dời cả lưới. B(n) trong cảnh dời theo sau khi dựng lại TIMING."),
    ];
  }

  function wordView(m, id) {
    const [lineId, k] = String(id).split("#");
    const i = Number(k);
    const d = ctx.markers?.get();
    const l = ctx.markers?.line(lineId);
    const w = l?.words?.[i];
    if (!w) return gone("MỐC TỪ");
    const ro = !ctx.markers.editable();
    const o = l.original?.[i] ?? { start: w.start, end: w.end };
    const start = num(w.start, { step: "0.001", min: "0" }), end = num(w.end, { step: "0.001", min: "0" });
    start.disabled = ro; end.disabled = ro;
    const apply = () => {
      const s = Number(start.value), e = Number(end.value);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return ctx.toast("Nhập số hợp lệ", true);
      const f = {};
      if (Math.abs(s - w.start) > 1e-6) f.start = s;
      if (Math.abs(e - w.end) > 1e-6) f.end = e;
      if (!Object.keys(f).length) return ctx.toast("Không có gì thay đổi");
      ctx.markers.setWord(lineId, i, f);
    };
    const same = Math.abs(o.start - w.start) < 1e-6 && Math.abs(o.end - w.end) < 1e-6;
    return [
      h("h3", {}, `MỐC TỪ · "${w.text}"`),
      h("div", { class: "muted" }, `${lineId} · từ #${i + 1}/${l.words.length} · ${l.file}`),
      h("div", { class: "kv" }, h("span", {}, "Trên video"), h("strong", {}, `${t3(l.offset + w.start)} – ${t3(l.offset + w.end)}`)),
      h("label", {}, "Đầu từ (giây trong file giọng)", start),
      h("label", {}, "Cuối từ (giây trong file giọng)", end),
      h("div", { class: "kv" }, h("span", {}, "Giờ gốc"), h("strong", {}, `${t3(o.start)} – ${t3(o.end)}`)),
      busyNote(d),
      h("div", { class: "row" },
        h("button", { class: "btn primary", disabled: ro, onclick: apply }, "Áp dụng"),
        h("button", { class: "btn", disabled: ro || same, onclick: () => ctx.markers.setWord(lineId, i, { start: o.start, end: o.end }) }, "Về gốc")),
      undoBtn(d),
      h("button", { class: "btn", onclick: () => ctx.markers.wordSync() }, "Kiểm khớp lời"),
      h("div", { class: "muted" }, "Chữ chốt bám lời (W()) dời theo. Sau khi sửa, bấm Kiểm khớp lời để xem chữ còn khớp giọng không."),
    ];
  }

  ctx.on("manifest", render);
  ctx.on("select", render);
  ctx.on("retimed", render);
  ctx.on("focus-note", () => el.querySelector('[data-role="motion-note"]')?.focus());
  return { render, addSection };
}
