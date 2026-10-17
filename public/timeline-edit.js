// timeline-edit.js — the timeline's edit logic without the DOM: which shot holds a time, the ops of
// a shot split and of a music drag, the next free SFX id, the shortcut a key press means, and
// what a drag snaps to (shot edges, lines, SFX, the playhead, beats and word starts).
// No imports, so Node tests load it directly.
const MIN = 0.5;
const EPS = 1e-6;
const r3 = (x) => Math.round(x * 1000) / 1000;
// Tenths, after r3 so float noise (6.05 - 4.5 = 1.5499…) rounds the way the user reads it.
const r1 = (x) => Math.round(r3(x) * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// The shot with start <= t < end; t equal to the video's end belongs to the last shot.
export function shotAt(m, t) {
  const shots = m?.shots ?? [];
  const i = shots.findIndex((s, k) => t >= s.start && (t < s.end || (k === shots.length - 1 && t <= s.end + EPS)));
  return i < 0 ? null : shots[i];
}

export function eventStart(m, e) {
  const s = (m?.shots ?? []).find((x) => x.id === e.shot);
  return r3((s?.start ?? 0) + (Number(e.offset) || 0));
}

// Split shot shotId at time t: the shot keeps [start, cut), a new shot right after takes the rest.
// Lines and events of the shot from the cut on move into the new shot (same times). A line that
// starts before the cut and ends after it stays with the first shot and is listed in straddle.
export function splitOps(m, shotId, t) {
  const shot = (m?.shots ?? []).find((s) => s.id === shotId);
  const edge = "Điểm cắt phải cách hai mép shot ít nhất 0,5 giây";
  if (!shot || !Number.isFinite(t) || t < shot.start || t > shot.end) return { ops: [], error: "Đặt playhead trong shot cần cắt" };
  if (t - shot.start < MIN || shot.end - t < MIN) return { ops: [], error: edge };
  const d1 = r1(t - shot.start);
  const d2 = r3(shot.end - shot.start - d1);
  if (d1 < MIN || d2 < MIN) return { ops: [], error: edge };
  const cut = r3(shot.start + d1);
  const ops = [
    { op: "resize_shot", id: shot.id, duration: d1 },
    { op: "add_shot", after: shot.id, duration: d2, name: `${shot.name || shot.id} (sau)` },
  ];
  const straddle = [];
  for (const l of m.lines ?? []) {
    if (l.shot !== shot.id) continue;
    if (l.start >= cut - EPS) ops.push({ op: "move_line", id: l.id, start: l.start });
    else if (l.start + (Number(l.duration) || 0) > cut + EPS) straddle.push(l.id);
  }
  for (const e of m.events ?? []) {
    if (e.shot !== shot.id) continue;
    const at = eventStart(m, e);
    if (at >= cut - EPS) ops.push({ op: "move_event", id: e.id, start: at });
  }
  return { ops, error: null, straddle, cut };
}

// One update_music for a drag of dt seconds on a music bed: "move" the body, "trim-start" the left
// edge (the file's head is skipped by as much), "trim-end" the right edge. end null means the bed
// runs to the end of the video, and stays null unless the drag changes the end. null: no change.
export function musicDragOps(bed, mode, dt, total) {
  const start = Number(bed.start) || 0;
  const e = bed.end ?? total;
  const d = Number.isFinite(dt) ? dt : 0;
  const next = {};
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
  const op = { op: "update_music", id: bed.id };
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
export function nextSfxId(ids) {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`sfx-${n}`)) n++;
  return `sfx-${n}`;
}

// The timeline action a key press means, or null. Alt+key is never ours (Alt+1…6 picks a tab), and
// nothing is ours while the caret is in a field: the field keeps typing and its own undo.
export function keyAction(e, { inField = false } = {}) {
  if (inField || e.altKey) return null;
  const mod = e.metaKey || e.ctrlKey;
  const letter = /^Key([A-Z])$/.exec(e.code ?? "")?.[1]?.toLowerCase() ?? (String(e.key ?? "").length === 1 ? e.key.toLowerCase() : "");
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
  return { j: "back1", k: "pause", l: "play", s: "split", n: "snap" }[letter] ?? null;
}

// Beat times of a TIMING block up to end: beat0 + k*beatLen when beatLen > 0, plus every kick,
// sorted. An empty list when timing is null or has no beats.
export function beatTimes(timing, end) {
  if (!timing) return [];
  const out = [];
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
export function wordStarts(timing) {
  const out = new Map();
  for (const scene of Object.values(timing?.scenes ?? {})) {
    for (const line of scene?.lines ?? []) {
      for (const w of line?.words ?? []) {
        const t = Number(w?.[1]);
        if (!Number.isFinite(t)) continue;
        if (!out.has(line.id)) out.set(line.id, []);
        out.get(line.id).push(r3(t));
      }
    }
  }
  return out;
}

// What a drag can snap to, sorted by time, one target per instant (0.001 s apart or more):
// playhead (t0), shot edges, line start and end, SFX times, beats and word starts. Targets of
// shots, lines, events and words carry the id of their block. skip(target) drops a target before
// the de-duplication (the block being dragged). On a tie the earlier kind in that list wins.
export function snapTargets(m, timing, t0, skip = null) {
  const all = [];
  const add = (t, kind, id) => {
    if (!Number.isFinite(t)) return;
    const x = id == null ? { t: r3(t), kind } : { t: r3(t), kind, id };
    if (!skip?.(x)) all.push(x);
  };
  if (Number.isFinite(t0)) add(t0, "playhead");
  for (const s of m?.shots ?? []) { add(s.start, "shot", s.id); add(s.end, "shot", s.id); }
  for (const l of m?.lines ?? []) { add(l.start, "line", l.id); add(l.start + (Number(l.duration) || 0), "line", l.id); }
  for (const e of m?.events ?? []) add(eventStart(m, e), "event", e.id);
  const end = Math.max(Number(timing?.duration) || 0, Number(m?.duration) || 0, ...(m?.shots ?? []).map((s) => s.end));
  for (const t of beatTimes(timing, end)) add(t, "beat");
  for (const [id, ts] of wordStarts(timing)) for (const t of ts) add(t, "word", id);
  const sorted = all.map((x, i) => [x, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([x]) => x);
  const out = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.t - last.t < 0.001) continue;
    out.push(x);
  }
  return out;
}

// The nearest target within px pixels of t at pps pixels per second: { t, kind } of the target,
// or { t, kind: null } when none is that close.
export function snap(t, targets, pps, px = 8) {
  let best = null;
  const reach = px / pps;
  for (const x of targets ?? []) {
    const d = Math.abs(x.t - t);
    if (d <= reach + EPS && (!best || d < Math.abs(best.t - t))) best = x;
  }
  return best ? { t: best.t, kind: best.kind } : { t, kind: null };
}
