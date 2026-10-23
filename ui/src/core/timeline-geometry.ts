// Port of the geometry of public/timeline.js (constants :27-33, fit :52-56, the Ctrl/Cmd+wheel zoom
// :76-86, the track heights of render :410-464); behaviour unchanged.
// Where things sit on the timeline, without the DOM: x of a time and time of an x at pps pixels a
// second, the zoom that fits the video, a zoom that keeps the time under the pointer in place, the
// ruler's tick step, and the lanes of the five tracks (Shot, B-roll, Lồng tiếng, Nhạc, SFX) with
// their y and height. No React and relative imports, so Node tests load it directly.
import { musicLanes, sfxTiers } from "./timeline-lanes.ts";
import type { Manifest } from "./timeline-edit.ts";

export const LABEL = 90; // px, the sticky label column
export const MIN_SHOT = 0.5;
export const CLICK = 3; // px of travel below which a press is a click, not a drag
export const TRACK = 44, BROLL = 34, TIER = 20; // px heights: a track or music lane, the B-roll track, an SFX tier
export const THUMB_MIN = 48; // px: narrower shots get no thumbnail
export const RULER = 24; // px, the ruler above the tracks
export const TAIL = 60; // px of lane after the end of the video
export const PPS_MIN = 8, PPS_MAX = 400;

export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
export const clampPps = (x: number): number => Math.max(PPS_MIN, Math.min(PPS_MAX, x));

// x in the timeline's inner box of time t, and the time (never below 0) of an x there.
export const xAt = (t: number, pps: number): number => LABEL + t * pps;
export const tAt = (x: number, pps: number): number => Math.max(0, (x - LABEL) / pps);

// The length the timeline draws: the manifest's duration, or the last shot or line end if later.
export function timelineTotal(m: Manifest | null | undefined): number {
  if (!m) return 0;
  return Math.max(Number(m.duration) || 0, ...(m.shots ?? []).map((s) => s.end), ...(m.lines ?? []).map((l) => l.start + (Number(l.duration) || 0)));
}

// pps at which the whole video fills a timeline `width` px wide (fit()).
export const fitPps = (width: number, total: number): number => clampPps((width - LABEL - TAIL) / total);

// Zoom by factor around pointerX (px from the timeline's left edge, scrollLeft px scrolled): the new
// pps and the scrollLeft that keeps the time under the pointer in place. Same pps: nothing moves.
export function zoomAround({ pps, factor, pointerX, scrollLeft }: { pps: number; factor: number; pointerX: number; scrollLeft: number }): { pps: number; scrollLeft: number } {
  const t = (scrollLeft + pointerX - LABEL) / pps;
  const next = clampPps(pps * factor);
  if (next === pps) return { pps, scrollLeft };
  return { pps: next, scrollLeft: Math.max(0, LABEL + t * next - pointerX) };
}

// Seconds between two ruler ticks: the first step at least 50 px wide.
export const rulerStep = (pps: number): number => [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 50) ?? 60;

export type LaneKind = "shot" | "broll" | "voice" | "music" | "sfx";
export interface LaneBox { lane: LaneKind; index: number; y: number; h: number }
export interface TrackBox { lane: LaneKind; y: number; h: number; count: number }

// The five tracks under the ruler, top to bottom: y and height of each, and how many lanes (music)
// or tiers (SFX) it holds. Music takes TRACK per lane; SFX at least TRACK, else its tiers plus 8 px.
export function trackLayout(m: Manifest | null | undefined, pps: number): TrackBox[] {
  const total = timelineTotal(m);
  const music = Math.max(1, musicLanes(m, total).count);
  const tiers = Math.max(1, sfxTiers(m, pps).count);
  const rows: [LaneKind, number, number][] = [
    ["shot", TRACK, 1],
    ["broll", BROLL, 1],
    ["voice", TRACK, 1],
    ["music", TRACK * music, music],
    ["sfx", Math.max(TRACK, tiers * TIER + 8), tiers],
  ];
  let y = RULER;
  return rows.map(([lane, h, count]) => { const box = { lane, y, h, count }; y += h; return box; });
}

// Every lane of the tracks: one each for Shot, B-roll and Lồng tiếng, one per music lane (TRACK
// high) and one per SFX tier (TIER high, 4 px under the top of the SFX track).
export function laneLayout(m: Manifest | null | undefined, pps = 60): LaneBox[] {
  const out: LaneBox[] = [];
  for (const t of trackLayout(m, pps)) {
    if (t.lane === "music") for (let i = 0; i < t.count; i++) out.push({ lane: "music", index: i, y: t.y + i * TRACK, h: TRACK });
    else if (t.lane === "sfx") for (let i = 0; i < t.count; i++) out.push({ lane: "sfx", index: i, y: t.y + 4 + i * TIER, h: TIER });
    else out.push({ lane: t.lane, index: 0, y: t.y, h: t.h });
  }
  return out;
}
