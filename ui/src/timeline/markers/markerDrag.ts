// Port of drag() of public/timeline-markers.js (:75-97); behaviour unchanged.
// Pointer drag of a beat line or a word dot: move(dx) while moving past CLICK px, done(dx) on
// release. Without editable markers (view-only project, no beats.json / words.json) a press is a
// click only. A click never reaches the lane under it (that would seek).
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { CLICK } from "@/core/timeline-geometry.ts";
import type { Markers } from "@/core/markers.ts";

export interface MarkerDragFns { move(dx: number): void; done(dx: number): void; click(): void }

export function startMarkerDrag(e: ReactPointerEvent<HTMLElement>, markers: Markers, fns: MarkerDragFns): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  if (!markers.editable()) { fns.click(); return; }
  const el = e.currentTarget;
  try { el.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone already */ }
  const x0 = e.clientX;
  let dx = 0;
  const mv = (ev: PointerEvent) => { dx = ev.clientX - x0; if (Math.abs(dx) >= CLICK) fns.move(dx); };
  const up = () => {
    el.removeEventListener("pointermove", mv);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    if (Math.abs(dx) < CLICK) fns.click(); else fns.done(dx);
  };
  el.addEventListener("pointermove", mv);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

export const stopClick = (e: MouseEvent) => e.stopPropagation();
