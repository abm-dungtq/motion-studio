// Port of the keydown handler and runKey of public/app.js (:412-453); behaviour unchanged.
// One handler on window for every timeline shortcut (core/timeline-edit.ts keyAction). Nothing
// fires while the caret is in a field, a dialog or a menu is open, or focus is on the tab rail (its
// arrows move between tabs).
import { useEffect, useRef } from "react";
import { actions, current } from "@/api/actions.ts";
import { keyAction } from "@/core/timeline-edit.ts";
import { toggleMode, toggleSnap, zoomBy, ZOOM_STEP } from "./Toolbar.tsx";

export function runKey(a: string, fit: () => void): void {
  const tr = actions.transport;
  const fps = current().m?.fps || 30;
  switch (a) {
    case "toggle": return tr.toggle();
    case "play": return tr.play();
    case "pause": return tr.pause();
    case "back1": return tr.step(-1);
    case "fwd1": return tr.step(1);
    case "prevFrame": return tr.step(-1 / fps);
    case "nextFrame": return tr.step(1 / fps);
    case "start": return tr.seek(0);
    case "end": return tr.seek(tr.duration());
    case "split": { void actions.split(); return; }
    case "delete": { void actions.deletePicked(); return; }
    case "undo": { void actions.undo(); return; }
    case "redo": { void actions.redo(); return; }
    case "zoomIn": return zoomBy(ZOOM_STEP);
    case "zoomOut": return zoomBy(1 / ZOOM_STEP);
    case "fit": return fit();
    case "snap": return toggleSnap();
    case "mode": return toggleMode();
  }
}

export function onTimelineKey(e: KeyboardEvent, fit: () => void): void {
  const target = e.target instanceof Element ? e.target : null;
  if (document.querySelector('[role="dialog"], [role="menu"]') || target?.closest('[role="tablist"]')) return;
  const inField = Boolean(target?.closest("input, textarea, select, [contenteditable]"));
  const a = keyAction(e, { inField });
  if (!a) return;
  e.preventDefault();
  runKey(a, fit);
}

// Mounted once by TimelineArea; fit is read at key time, so it may change between renders.
export function useTimelineKeys(fit: () => void): void {
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onTimelineKey(e, () => fitRef.current());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
