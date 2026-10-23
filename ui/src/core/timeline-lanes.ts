// Port of SFX_TIERS, SFX_W, SFX_LABEL_W, musicLanes and sfxTiers from public/timeline-lanes.js
// (commit 22e7611); logic unchanged.
// Lanes of the timeline tracks: music beds that overlap in time take one lane each, SFX that
// overlap on screen stack in up to 4 tiers (timeline-edit.ts stackLanes, first free lane in start
// order, as OpenCut-app/OpenCut places clips on tracks, MIT). The drop target and the B-roll
// blocks of the old file are React components now.
import { eventStart, stackLanes, type LaneResult, type Manifest } from "./timeline-edit.ts";

export const SFX_TIERS = 4;
export const SFX_W = 14; // px, the width of an SFX block

// { lane: { id: n }, count } of the music beds; a bed with no end runs to total.
export function musicLanes(m: Manifest | null | undefined, total: number): LaneResult {
  return stackLanes((m?.music ?? []).map((b) => ({ id: b.id, start: Number(b.start) || 0, end: b.end ?? total })));
}

// { lane, count, overflow } of the SFX: two overlap when their blocks (and their labels, shown
// from labelPps pixels a second on) would touch at pps.
export const SFX_LABEL_W = 72; // px of a label of 12 characters at 11 px
export function sfxTiers(m: Manifest | null | undefined, pps: number, labelPps = 80): LaneResult {
  const w = (SFX_W + 2 + (pps >= labelPps ? SFX_LABEL_W : 0)) / pps;
  return stackLanes((m?.events ?? []).map((e) => { const t = eventStart(m, e); return { id: e.id, start: t, end: t + w }; }), SFX_TIERS);
}
