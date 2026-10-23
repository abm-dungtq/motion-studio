// The timeline row of the shell: a 36 px bar with the old key hint until the timeline area replaces this whole
// file. It keeps only the undo/redo shortcuts of public/app.js:412-453 (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z,
// Ctrl+Y), with the same guards: nothing fires in a field, while a dialog is open, or with focus on
// the tab rail. The full key map (transport, split, delete, zoom) comes with the real timeline.
import { useEffect } from "react";
import { actions } from "@/api/actions.ts";
import { keyAction } from "@/core/timeline-edit.ts";

// The key hint of the old timeline bar (public/index.html:46).
export const TIMELINE_HINT = "Kéo khối để dời · kéo mép để cắt · Shift+kéo câu dời cả câu sau · kéo phách/chấm từ để sửa mốc · R Ripple/Roll · S cắt shot · Space phát/dừng · N hít · Ctrl/Cmd+cuộn zoom";

function useUndoRedoKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (document.querySelector('[role="dialog"]') || target?.closest('[role="tablist"]')) return;
      const a = keyAction(e, { inField: Boolean(target?.closest("input, textarea, select, [contenteditable]")) });
      if (a !== "undo" && a !== "redo") return;
      e.preventDefault();
      void actions[a]();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

export function TimelineArea() {
  useUndoRedoKeys();
  return (
    <div data-testid="timeline-area" className="flex flex-col bg-panel">
      <div className="flex h-9 items-center overflow-hidden px-3">
        <span className="truncate text-xs text-muted-foreground">{TIMELINE_HINT}</span>
      </div>
    </div>
  );
}
