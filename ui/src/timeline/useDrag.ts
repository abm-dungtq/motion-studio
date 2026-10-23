// Port of drag() and scrub() of public/timeline.js (:103-139, :324-354); behaviour unchanged.
// drag: a press on a block of an editable project. Below CLICK px of travel it stays a click (no
// snapping); past it, onMove(dx, hit, ev) runs on every move and onUp(dx, hit, ev) once on release
// (ev is the last pointer event, so Shift can be read). With sn = { skip, edges } and snapping on,
// the dragged edge nearest a target is pulled onto it: dx shifts by as much and hit is { t, kind }
// of that target (null when nothing snapped). Moves only touch styles; the caller sends ONE patch
// from onUp.
// scrub: a press on the ruler, the knob or empty lane space seeks there and follows the pointer; a
// playing player pauses and plays again on release. The playhead snaps too, to everything but itself.
import type { PointerEvent as ReactPointerEvent } from "react";
import { actions, current } from "@/api/actions.ts";
import { snap, type SnapTarget } from "@/core/timeline-edit.ts";
import { CLICK } from "@/core/timeline-geometry.ts";
import { useStudio } from "@/store/studio.ts";
import { targetsFor } from "./snap.ts";
import type { SnapLine } from "./view.ts";

export interface DragHit { t: number; kind: string; d: number }
export type DragFn = (dx: number, hit: DragHit | null, ev: PointerEvent) => void;
export interface SnapSpec {
  skip: ((x: SnapTarget, press: PointerEvent) => boolean) | null;
  edges: (dt: number, ev: PointerEvent) => number[];
}

// Pointer listeners on the pressed element, which holds the pointer capture until release.
function follow(target: HTMLElement, e: ReactPointerEvent, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void): void {
  try { target.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone already */ }
  const end = (ev: PointerEvent) => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    up(ev);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
}

export function startDrag(e: ReactPointerEvent<HTMLElement>, snapLine: SnapLine, onMove: DragFn, onUp: DragFn, sn: SnapSpec | null = null): void {
  if (e.button !== 0 || !current().editable) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  const press = e.nativeEvent;
  const x0 = e.clientX;
  const pps = useStudio.getState().pps;
  const skip = typeof sn?.skip === "function" ? (x: SnapTarget) => sn.skip!(x, press) : null;
  const targets = sn ? targetsFor(skip) : [];
  let dx = 0, hit: DragHit | null = null, last: PointerEvent = press;
  follow(target, e, (ev) => {
    last = ev;
    dx = ev.clientX - x0;
    hit = null;
    // A press that has not travelled yet stays a click: no snapping.
    if (sn && targets.length && Math.abs(dx) >= CLICK) {
      for (const raw of sn.edges(dx / pps, ev)) {
        const s = snap(raw, targets, pps);
        if (s.kind && (!hit || Math.abs(s.t - raw) < Math.abs(hit.d))) hit = { t: s.t, kind: s.kind, d: s.t - raw };
      }
    }
    if (hit) { dx += hit.d * pps; snapLine.show(hit.t); } else snapLine.hide();
    onMove(dx, hit, ev);
  }, (ev) => {
    snapLine.hide();
    onUp(dx, hit, ev.type === "pointerup" ? ev : last);
  });
}

// rect: the box whose left edge is time 0 (the ruler). total: the end of the video.
export function startScrub(e: ReactPointerEvent<HTMLElement>, snapLine: SnapLine, rect: () => DOMRect | null, total: number): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const tr = actions.transport;
  const resume = tr.playing();
  if (resume) tr.pause();
  const targets = targetsFor(null, null);
  const pps = useStudio.getState().pps;
  const at = (x: number) => {
    const t = Math.max(0, Math.min(total, (x - (rect()?.left ?? 0)) / pps));
    const s = snap(t, targets, pps);
    if (s.kind) snapLine.show(s.t); else snapLine.hide();
    actions.seek(s.t);
  };
  at(e.clientX);
  follow(e.currentTarget, e, (ev) => at(ev.clientX), () => {
    snapLine.hide();
    if (resume) tr.play();
  });
}
