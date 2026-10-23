// timeline-lanes.js — lanes of the timeline tracks: music beds that overlap in time take one lane
// each, SFX that overlap on screen stack in up to 4 tiers (timeline-edit.js stackLanes, first free
// lane in start order, as OpenCut-app/OpenCut places clips on tracks, MIT), and the B-roll lane
// shows each shot's assets (shot.assets; m.overlays too, view only, once the provider has them).
// A footage row dragged from the Footage panel (MEDIA_DRAG) and dropped on a shot or its B-roll
// block adds the file to that shot: POST /api/timeline/asset, which copies a workspace file into
// the project first (routes/timeline-assets.mjs).
import { h, isMedia, px } from "/dom.js";
import { eventStart, stackLanes } from "/timeline-edit.js";
import { MEDIA_DRAG } from "/panels.js";
import { thumbAt } from "/thumbs.js";

export const SFX_TIERS = 4;
export const SFX_W = 14; // px, the width of an SFX block

// { lane: { id: n }, count } of the music beds; a bed with no end runs to total.
export function musicLanes(m, total) {
  return stackLanes((m?.music ?? []).map((b) => ({ id: b.id, start: Number(b.start) || 0, end: b.end ?? total })));
}

// { lane, count, overflow } of the SFX: two overlap when their blocks (and their labels, shown
// from labelPps pixels a second on) would touch at pps.
export const SFX_LABEL_W = 72; // px of a label of 12 characters at 11 px
export function sfxTiers(m, pps, labelPps = 80) {
  const w = (SFX_W + 2 + (pps >= labelPps ? SFX_LABEL_W : 0)) / pps;
  return stackLanes((m?.events ?? []).map((e) => { const t = eventStart(m, e); return { id: e.id, start: t, end: t + w }; }), SFX_TIERS);
}

const base = (p) => String(p).split("/").pop();

// Drop target for footage: file → this shot's assets.
export function acceptDrop(ctx, el, shot) {
  el.addEventListener("dragover", (e) => {
    if (!ctx.editable || !e.dataTransfer?.types?.includes(MEDIA_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    el.classList.add("drop-on");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-on"));
  el.addEventListener("drop", async (e) => {
    el.classList.remove("drop-on");
    if (!e.dataTransfer?.types?.includes(MEDIA_DRAG)) return;
    e.preventDefault();
    e.stopPropagation();
    let item;
    try { item = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG)); } catch { return ctx.toast("Không đọc được file vừa thả", true); }
    if (!item?.path) return ctx.toast("File này chưa có đường dẫn trên máy", true);
    const m = ctx.state.m;
    if (!m) return;
    const r = await ctx.send("/api/timeline/asset", { name: ctx.state.name, shot: shot.id, base: m.version, path: item.path });
    await ctx.reload();
    if (r.status !== 200) return ctx.toast(r.error ?? `Lỗi ${r.status}`, true);
    ctx.toast(r.unchanged ? `${base(r.path)} đã có trong ${shot.id}` : `Đã thêm ${base(r.path)} vào ${shot.id}${r.copied ? " (đã chép vào assets/footage)" : ""}`);
  });
}

// A small preview of a project file: image as is, video as a frame (cached like render thumbs).
function preview(ctx, rel, fileUrl, stamps) {
  const kind = isMedia(rel);
  if (kind === "img") return h("img", { class: "broll-thumb", src: fileUrl(rel), alt: "", loading: "lazy" });
  if (kind !== "video") return null;
  const img = h("img", { class: "broll-thumb", alt: "", hidden: true });
  const mtime = stamps?.[rel]?.mtime;
  if (mtime) thumbAt(fileUrl(rel), mtime, 0.5).then((u) => { if (u) { img.src = u; img.hidden = false; } });
  return img;
}

// Blocks of the B-roll lane.
export function brollBlocks(ctx, m, pps, { fileUrl, stamps }) {
  const out = [];
  for (const s of m?.shots ?? []) {
    const assets = s.assets ?? [];
    const b = h("div", { class: `blk broll${assets.length ? "" : " empty"}`, title: assets.length ? assets.join("\n") : `Thả footage vào đây để thêm cho ${s.id}`, "data-shot": s.id, style: { left: px(s.start * pps), width: px((s.end - s.start) * pps) } },
      assets.length ? assets.map((a) => h("span", { class: "broll-chip" }, preview(ctx, a, fileUrl, stamps), base(a))) : null);
    b.addEventListener("click", (e) => { e.stopPropagation(); ctx.select(s.id); });
    acceptDrop(ctx, b, s);
    out.push(b);
  }
  // Free overlays (a later provider schema): view only.
  for (const o of Array.isArray(m?.overlays) ? m.overlays : []) {
    const start = Number(o?.start), end = Number(o?.end);
    if (!Number.isFinite(start) || !(end > start)) continue;
    out.push(h("div", { class: "blk broll overlay", title: String(o.file ?? ""), style: { left: px(start * pps), width: px((end - start) * pps) } }, base(o.file ?? o.id ?? "")));
  }
  return out;
}
