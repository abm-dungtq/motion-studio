// Port of the shared helpers of public/timeline.js (byId :148, fileUrl :390, showSnap/hideSnap
// :90-95, render()'s "dragging" and reset); behaviour unchanged.
// What every part of the timeline shares while it is mounted: the inner box (to find a block by
// id), the snap line, and the drag preview. A drag preview never touches the left or width React
// wrote: blocks place themselves at calc(<left> + var(--dl)) and calc(<width> + var(--dw)), and a
// drag only sets those two variables. Clearing them shows what React rendered, before or after the
// patch, so a preview can never fight a render.
import { createContext, useContext, type RefObject } from "react";

export interface SnapLine { show(t: number): void; hide(): void }
export interface TimelineView { inner: RefObject<HTMLDivElement | null>; snapLine: SnapLine }

const noop: SnapLine = { show() {}, hide() {} };
export const ViewContext = createContext<TimelineView>({ inner: { current: null }, snapLine: noop });
export const useView = (): TimelineView => useContext(ViewContext);

const attr = (v: string): string => v.replace(/["\\]/g, "\\$&");
export const byId = (view: TimelineView, id: string): HTMLElement | null => view.inner.current?.querySelector<HTMLElement>(`[data-id="${attr(id)}"]`) ?? null;

// left / width of a block that a drag preview can shift.
export const leftOf = (px: number): string => `calc(${px}px + var(--dl, 0px))`;
export const widthOf = (px: number): string => `calc(${px}px + var(--dw, 0px))`;

// Each drag gets a number; a late clear of an older drag leaves a newer preview alone.
let seq = 0;
export function preview(el: HTMLElement | null, dl: number, dw: number): void {
  if (!el) return;
  el.style.setProperty("--dl", `${dl}px`);
  el.style.setProperty("--dw", `${dw}px`);
  el.classList.add("dragging");
}
export function clearPreview(el: HTMLElement | null): void {
  if (!el) return;
  el.style.removeProperty("--dl");
  el.style.removeProperty("--dw");
  el.classList.remove("dragging");
  delete el.dataset.drag;
}
export function markDrag(el: HTMLElement | null): number {
  const n = ++seq;
  if (el) el.dataset.drag = String(n);
  return n;
}

// After a sent patch the blocks clear their own preview when the new manifest renders them
// (useClearOnChange); this is the fallback for a patch that changed nothing on screen.
const SETTLE_MS = 400;
export function settle(els: (HTMLElement | null)[], ok: boolean): void {
  const owned = els.filter(Boolean).map((el) => [el!, el!.dataset.drag] as const);
  const run = () => { for (const [el, n] of owned) if (el.dataset.drag === n) clearPreview(el); };
  if (!ok) run(); else window.setTimeout(run, SETTLE_MS);
}
