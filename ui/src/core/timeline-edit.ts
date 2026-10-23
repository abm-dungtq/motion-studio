// Port of public/timeline-edit.js (commit 22e7611); logic unchanged.
// timeline-edit.js — the timeline's edit logic without the DOM: which shot holds a time, the ops of
// a shot split, a roll edit, a shift-ripple of lines and a music drag, the next free SFX id, the
// shortcut a key press means, what a drag snaps to (shot edges, lines, SFX, the playhead, beats and
// word starts), how overlapping blocks stack into lanes, the bounds of a beat or word marker drag
// and the marks of the timeline decorators.
// No imports, so Node tests load it directly (type stripping); lib/timing-edit.mjs reuses the
// marker bounds.
// Manifest fields this file reads. Numbers may arrive as strings from hand-edited files, so the
// code keeps its Number(...) || 0 reads.
export interface Shot { id: string; start: number; end: number; name?: string; assets?: string[] }
export interface Line { id: string; shot: string; start: number; duration?: number | string | null }
export interface SfxEvent { id: string; shot: string; offset?: number | string | null }
export interface MusicBed { id: string; start?: number | string | null; end?: number | null; media_start?: number | string | null }
export interface Manifest { shots?: Shot[]; lines?: Line[]; events?: SfxEvent[]; music?: MusicBed[]; duration?: number }
// TIMING block of a composition (window.TIMING): beat grid, kicks and per-line word rows.
export interface Timing {
  beat0?: number | string | null;
  beatLen?: number | string | null;
  kick?: unknown;
  duration?: number | string | null;
  scenes?: Record<string, { lines?: { id: string; words?: unknown[][] }[] } | null>;
}
export interface Op { op: string; id?: string; [k: string]: unknown }
export interface OpsResult { ops: Op[]; error: string | null }
export interface SplitResult extends OpsResult { straddle?: string[]; cut?: number }
export interface KeyLike { key?: string; code?: string; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
export interface SnapTarget { t: number; kind: string; id?: string }
export interface LaneInterval { id: string | number; start: number; end?: number | null }
export interface LaneResult { lane: Record<string, number>; count: number; overflow: boolean }
export interface Word { text?: string; start: number; end: number }
export interface Bounds { lo: number; hi: number }
export type MarkerDragResult = { value: number; clamped: boolean; from: number; error?: undefined } | { error: string; value?: undefined; clamped?: undefined; from?: undefined };
export interface DecoItem { t: number; until: number | null; label: string; kind: string }
export type Decorator = (m: unknown, state: unknown) => unknown;

const MIN = 0.5;
const EPS = 1e-6;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
// Tenths, after r3 so float noise (6.05 - 4.5 = 1.5499…) rounds the way the user reads it.
const r1 = (x: number): number => Math.round(r3(x) * 10) / 10;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// The shot with start <= t < end; t equal to the video's end belongs to the last shot.
export function shotAt(m: Manifest | null | undefined, t: number): Shot | null {
  const shots = m?.shots ?? [];
  const i = shots.findIndex((s, k) => t >= s.start && (t < s.end || (k === shots.length - 1 && t <= s.end + EPS)));
  return i < 0 ? null : shots[i];
}

export function eventStart(m: Manifest | null | undefined, e: SfxEvent): number {
  const s = (m?.shots ?? []).find((x) => x.id === e.shot);
  return r3((s?.start ?? 0) + (Number(e.offset) || 0));
}

// Split shot shotId at time t: the shot keeps [start, cut), a new shot right after takes the rest.
// Lines and events of the shot from the cut on move into the new shot (same times). A line that
// starts before the cut and ends after it stays with the first shot and is listed in straddle.
export function splitOps(m: Manifest | null | undefined, shotId: string, t: number): SplitResult {
  const shot = (m?.shots ?? []).find((s) => s.id === shotId);
  const edge = "Điểm cắt phải cách hai mép shot ít nhất 0,5 giây";
  if (!shot || !Number.isFinite(t) || t < shot.start || t > shot.end) return { ops: [], error: "Đặt playhead trong shot cần cắt" };
  if (t - shot.start < MIN || shot.end - t < MIN) return { ops: [], error: edge };
  const d1 = r1(t - shot.start);
  const d2 = r3(shot.end - shot.start - d1);
  if (d1 < MIN || d2 < MIN) return { ops: [], error: edge };
  const cut = r3(shot.start + d1);
  const ops: Op[] = [
    { op: "resize_shot", id: shot.id, duration: d1 },
    { op: "add_shot", after: shot.id, duration: d2, name: `${shot.name || shot.id} (sau)` },
  ];
  const straddle: string[] = [];
  for (const l of m!.lines ?? []) {
    if (l.shot !== shot.id) continue;
    if (l.start >= cut - EPS) ops.push({ op: "move_line", id: l.id, start: l.start });
    else if (l.start + (Number(l.duration) || 0) > cut + EPS) straddle.push(l.id);
  }
  for (const e of m!.events ?? []) {
    if (e.shot !== shot.id) continue;
    const at = eventStart(m, e);
    if (at >= cut - EPS) ops.push({ op: "move_event", id: e.id, start: at });
  }
  return { ops, error: null, straddle, cut };
}

// One update_music for a drag of dt seconds on a music bed: "move" the body, "trim-start" the left
// edge (the file's head is skipped by as much), "trim-end" the right edge. end null means the bed
// runs to the end of the video, and stays null unless the drag changes the end. null: no change.
export function musicDragOps(bed: MusicBed, mode: string, dt: number, total: number): Op | null {
  const start = Number(bed.start) || 0;
  const e = bed.end ?? total;
  const d = Number.isFinite(dt) ? dt : 0;
  const next: { start?: number; end?: number | null; media_start?: number } = {};
  if (mode === "move") {
    if (bed.end == null) next.start = clamp(start + d, 0, Math.max(0, total - MIN));
    else {
      const len = e - start;
      let s = Math.max(0, start + d);
      if (s + len > total) s = Math.max(0, total - len);
      next.start = s;
      next.end = s + len;
    }
  } else if (mode === "trim-start") {
    const s = clamp(start + d, 0, e - MIN);
    next.start = s;
    next.media_start = Math.max(0, (Number(bed.media_start) || 0) + (s - start));
  } else if (mode === "trim-end") {
    const end = clamp(e + d, start + MIN, total);
    next.end = bed.end == null && Math.abs(end - total) < EPS ? null : end;
  } else return null;
  const op: Op = { op: "update_music", id: bed.id };
  let changed = false;
  for (const [k, v] of Object.entries(next)) {
    const was = k === "media_start" ? Number(bed.media_start) || 0 : k === "end" ? bed.end : start;
    const val = v == null ? null : r3(v);
    if (val === null ? was == null : was != null && Math.abs(val - was) < EPS) continue;
    op[k] = val;
    changed = true;
  }
  return changed ? op : null;
}

// sfx-<n> with the smallest n not in ids (events, lines and the composition's <audio> tags).
export function nextSfxId(ids: Iterable<string>): string {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`sfx-${n}`)) n++;
  return `sfx-${n}`;
}

// The timeline action a key press means, or null. Alt+key is never ours (Alt+1…6 picks a tab), and
// nothing is ours while the caret is in a field: the field keeps typing and its own undo.
export function keyAction(e: KeyLike, { inField = false }: { inField?: boolean } = {}): string | null {
  if (inField || e.altKey) return null;
  const mod = e.metaKey || e.ctrlKey;
  const letter = /^Key([A-Z])$/.exec(e.code ?? "")?.[1]?.toLowerCase() ?? (String(e.key ?? "").length === 1 ? e.key!.toLowerCase() : "");
  if (mod) {
    if (letter === "z") return e.shiftKey ? "redo" : "undo";
    if (letter === "y" && e.ctrlKey && !e.shiftKey) return "redo";
    return null;
  }
  const key = e.key;
  if (key === "ArrowLeft") return e.shiftKey ? "back1" : "prevFrame";
  if (key === "ArrowRight") return e.shiftKey ? "fwd1" : "nextFrame";
  if (key === "=" || key === "+") return "zoomIn";
  if (key === "-") return "zoomOut";
  if (e.shiftKey) return letter === "z" ? "fit" : null;
  if (key === " " || e.code === "Space") return "toggle";
  if (key === "Home") return "start";
  if (key === "End") return "end";
  if (key === "Delete" || key === "Backspace") return "delete";
  return ({ j: "back1", k: "pause", l: "play", s: "split", n: "snap", r: "mode" } as Record<string, string>)[letter] ?? null;
}

// Beat times of a TIMING block up to end: beat0 + k*beatLen when beatLen > 0, plus every kick,
// sorted. An empty list when timing is null or has no beats.
export function beatTimes(timing: Timing | null | undefined, end: number): number[] {
  if (!timing) return [];
  const out: number[] = [];
  const b0 = Number(timing.beat0) || 0;
  const len = Number(timing.beatLen) || 0;
  if (len > 0 && Number.isFinite(end)) {
    // A grid denser than 20 beats a second is noise, not beats; it also bounds the loop.
    if (len >= 0.05) for (let k = 0, t = b0; t <= end + EPS; k++, t = b0 + k * len) if (t >= -EPS) out.push(r3(t));
  }
  for (const k of Array.isArray(timing.kick) ? timing.kick : []) if (Number.isFinite(Number(k))) out.push(r3(Number(k)));
  return out.sort((a, b) => a - b);
}

// Word starts per line id from TIMING.scenes[*].lines[*].words ([text, start, end] rows).
export function wordStarts(timing: Timing | null | undefined): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const scene of Object.values(timing?.scenes ?? {})) {
    for (const line of scene?.lines ?? []) {
      for (const w of line?.words ?? []) {
        const t = Number(w?.[1]);
        if (!Number.isFinite(t)) continue;
        if (!out.has(line.id)) out.set(line.id, []);
        out.get(line.id)!.push(r3(t));
      }
    }
  }
  return out;
}

// What a drag can snap to, sorted by time, one target per instant (0.001 s apart or more):
// playhead (t0), shot edges, line start and end, SFX times, beats and word starts. Targets of
// shots, lines, events and words carry the id of their block. skip(target) drops a target before
// the de-duplication (the block being dragged). On a tie the earlier kind in that list wins.
export function snapTargets(m: Manifest | null | undefined, timing: Timing | null | undefined, t0: number | null | undefined, skip: ((x: SnapTarget) => boolean) | null = null): SnapTarget[] {
  const all: SnapTarget[] = [];
  const add = (t: number, kind: string, id?: string) => {
    if (!Number.isFinite(t)) return;
    const x: SnapTarget = id == null ? { t: r3(t), kind } : { t: r3(t), kind, id };
    if (!skip?.(x)) all.push(x);
  };
  if (Number.isFinite(t0)) add(t0 as number, "playhead");
  for (const s of m?.shots ?? []) { add(s.start, "shot", s.id); add(s.end, "shot", s.id); }
  for (const l of m?.lines ?? []) { add(l.start, "line", l.id); add(l.start + (Number(l.duration) || 0), "line", l.id); }
  for (const e of m?.events ?? []) add(eventStart(m, e), "event", e.id);
  const end = Math.max(Number(timing?.duration) || 0, Number(m?.duration) || 0, ...(m?.shots ?? []).map((s) => s.end));
  for (const t of beatTimes(timing, end)) add(t, "beat");
  for (const [id, ts] of wordStarts(timing)) for (const t of ts) add(t, "word", id);
  const sorted = all.map((x, i): [SnapTarget, number] => [x, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([x]) => x);
  const out: SnapTarget[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.t - last.t < 0.001) continue;
    out.push(x);
  }
  return out;
}

// The nearest target within px pixels of t at pps pixels per second: { t, kind } of the target,
// or { t, kind: null } when none is that close.
export function snap(t: number, targets: readonly SnapTarget[] | null | undefined, pps: number, px = 8): { t: number; kind: string | null } {
  let best: SnapTarget | null = null;
  const reach = px / pps;
  for (const x of targets ?? []) {
    const d = Math.abs(x.t - t);
    if (d <= reach + EPS && (!best || d < Math.abs(best.t - t))) best = x;
  }
  return best ? { t: best.t, kind: best.kind } : { t, kind: null };
}

// Roll edit of the cut after shot shotId: that shot gets dt seconds longer and the next one dt
// shorter, so the video keeps its length. Two resize_shot ops; the gateway ripples the first
// (everything from the next shot on moves dt) and the second moves everything after the next shot
// back, so only the cut and what the next shot holds move. { ops, error }.
export function rollOps(m: Manifest | null | undefined, shotId: string, dt: number): OpsResult {
  const shots = m?.shots ?? [];
  const i = shots.findIndex((s) => s.id === shotId);
  if (i < 0) return { ops: [], error: "Không có shot này" };
  const a = shots[i], b = shots[i + 1];
  if (!b) return { ops: [], error: "Roll cần một shot kế tiếp; shot cuối chỉ kéo được kiểu Ripple" };
  if (!Number.isFinite(dt)) return { ops: [], error: "Độ dời không hợp lệ" };
  const da = r3(a.end - a.start + dt), db = r3(b.end - b.start - dt);
  if (da < MIN - EPS || db < MIN - EPS) return { ops: [], error: "Mỗi shot phải dài ít nhất 0,5 giây" };
  if (Math.abs(dt) < EPS) return { ops: [], error: null };
  return { ops: [{ op: "resize_shot", id: a.id, duration: da }, { op: "resize_shot", id: b.id, duration: db }], error: null };
}

// The largest dt (both signs) a roll of the cut after shot i allows: [lo, hi].
export function rollRange(m: Manifest | null | undefined, shotId: string): [number, number] | null {
  const shots = m?.shots ?? [];
  const i = shots.findIndex((s) => s.id === shotId);
  const a = shots[i], b = shots[i + 1];
  if (!a || !b) return null;
  return [r3(MIN - (a.end - a.start)), r3(b.end - b.start - MIN)];
}

// Shift-drag of line lineId to start t: that line and every later line of the same shot move by
// the same delta, in one patch of move_line ops. Lines of other shots stay. { ops, error }.
export function rippleLineOps(m: Manifest | null | undefined, lineId: string, t: number): OpsResult {
  const line = (m?.lines ?? []).find((l) => l.id === lineId);
  if (!line) return { ops: [], error: "Không có câu này" };
  if (!Number.isFinite(t)) return { ops: [], error: "Thời điểm không hợp lệ" };
  const d = r3(t - line.start);
  const moving = m!.lines!.filter((l) => l.shot === line.shot && (l.id === line.id || l.start > line.start + EPS || (Math.abs(l.start - line.start) <= EPS && l.id > line.id)));
  if (moving.some((l) => l.start + d < -EPS)) return { ops: [], error: "Câu không thể bắt đầu trước 0 giây" };
  if (Math.abs(d) < EPS) return { ops: [], error: null };
  return { ops: moving.map((l) => ({ op: "move_line", id: l.id, start: r3(Math.max(0, l.start + d)) })), error: null };
}

// Greedy interval partitioning (first free lane in start order, which uses the fewest lanes):
// intervals [{ id, start, end }] → { lane: { id: index }, count, overflow }. Ties sort by end then
// id, so the same input always gives the same lanes. More than max lanes: the rest share the last
// lane and overflow is true. A lane is free for an interval that starts where the last one ended.
export function stackLanes(intervals: readonly LaneInterval[] | null | undefined, max = Infinity): LaneResult {
  const list = [...(intervals ?? [])].filter((x) => x && Number.isFinite(x.start))
    .map((x) => ({ id: String(x.id), start: x.start, end: Number.isFinite(x.end) && x.end! > x.start ? x.end! : x.start }))
    .sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ends: number[] = [], lane: Record<string, number> = {};
  let overflow = false;
  const cap = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : Infinity;
  for (const x of list) {
    let k = ends.findIndex((e) => e <= x.start + EPS);
    if (k < 0) {
      if (ends.length < cap) { k = ends.length; ends.push(x.end); }
      else { k = ends.length - 1; overflow = true; ends[k] = Math.max(ends[k], x.end); }
    } else ends[k] = x.end;
    lane[x.id] = k;
  }
  return { lane, count: ends.length, overflow };
}

// Bounds of a word start or end in a words.json list ([{ text, start, end }], seconds of the file):
// a start stays at or after the word before it ended (or its own start, when the file already has
// them overlapping) and 10 ms before its own end; an end stays 10 ms after its start and at or
// before the next word starts. null when index is not a word of the list.
export const MIN_WORD = 0.01;
export function wordBounds(words: readonly Word[] | null | undefined, index: number, field = "start"): Bounds | null {
  const w = words?.[index];
  if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end)) return null;
  const prev = words![index - 1], next = words![index + 1];
  if (field === "end") {
    const hi = next && Number.isFinite(next.start) ? Math.max(next.start, w.end) : Infinity;
    return { lo: r3(w.start + MIN_WORD), hi: hi === Infinity ? Infinity : r3(hi) };
  }
  const lo = prev && Number.isFinite(prev.end) ? Math.min(prev.end, w.start) : 0;
  return { lo: r3(Math.max(0, lo)), hi: r3(w.end - MIN_WORD) };
}

// beat0 lies in [0, beatLen): a grid moved by a whole beat or more would renumber every B(n).
export function beatBounds(beatLen: unknown): Bounds | null {
  const len = Number(beatLen);
  if (!(len > 0)) return null;
  return { lo: 0, hi: r3(len - 0.001) };
}

// A marker drag of dt seconds → { value, clamped } or { error }. kind "beat": marker is
// { beat0, beatLen } and value the new beat0. kind "word": marker is { words, index, field? } and
// value the new start (or end) in seconds of the voice file.
export function markerDrag(marker: any, kind: string, dt: number): MarkerDragResult { // loose: ported as is
  if (!Number.isFinite(dt)) return { error: "Độ dời không hợp lệ" };
  let from: number, b: Bounds | null;
  if (kind === "beat") {
    b = beatBounds(marker?.beatLen);
    if (!b) return { error: "Nhạc chưa đo lưới phách" };
    from = Number(marker.beat0) || 0;
  } else if (kind === "word") {
    const field = marker?.field === "end" ? "end" : "start";
    b = wordBounds(marker?.words, marker?.index, field);
    if (!b) return { error: "Không có từ này" };
    from = marker.words[marker.index][field];
  } else return { error: `Không biết loại mốc ${kind}` };
  const raw = r3(from + dt);
  const value = r3(clamp(raw, b.lo, b.hi));
  return { value, clamped: Math.abs(value - raw) > EPS, from };
}

// The marks of every decorator for one render, by lane: { shot, voice, music, sfx } of
// { t, until (null for a thin mark), label, kind }. A decorator that throws is reported to
// onError and skipped; marks with an unknown lane, a bad time or until <= t are dropped.
export const DECO_LANES = ["shot", "voice", "music", "sfx"] as const;
export type DecoLane = (typeof DECO_LANES)[number];
export function decorationItems(decorators: readonly Decorator[] | null | undefined, m: unknown, state: unknown, onError: ((e: unknown) => void) | null = null): Record<DecoLane, DecoItem[]> {
  const by = Object.fromEntries(DECO_LANES.map((k) => [k, [] as DecoItem[]])) as Record<DecoLane, DecoItem[]>;
  for (const fn of decorators ?? []) {
    let items: any; // loose: a decorator may return anything
    try { items = fn(m, state); } catch (e) { onError?.(e); continue; }
    for (const d of Array.isArray(items) ? items : []) {
      const t = Number(d?.t), until = d?.until == null ? null : Number(d.until);
      if (!(DECO_LANES as readonly string[]).includes(d?.lane) || !Number.isFinite(t) || (until !== null && !(until > t))) continue;
      by[d.lane as DecoLane].push({ t, until, label: String(d.label ?? ""), kind: String(d.kind ?? "info") });
    }
  }
  return by;
}
