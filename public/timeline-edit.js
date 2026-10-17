// timeline-edit.js — the timeline's edit logic without the DOM: which shot holds a time, the ops of
// a shot split and of a music drag, the next free SFX id, and the shortcut a key press means.
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
