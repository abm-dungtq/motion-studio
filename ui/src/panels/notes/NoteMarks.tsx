// The notes on the ruler: one small button per open ("!") or sent ("→") note at its time. A click
// moves the playhead there and shows the note in the director tab's list.
import { actions } from "@/api/actions.ts";
import { useNotes } from "@/api/queries.ts";
import type { Note } from "@/api/types.ts";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";
import { stamp } from "./NoteInput.tsx";

export const noteRowId = (id: string): string => `note-${id}`;

// Seeks to the note and brings its row of NotesList into view.
export function showNote(n: Note): void {
  actions.transport.seek(n.t);
  const s = useStudio.getState();
  s.setRightTab("director");
  s.toggleRight(true);
  requestAnimationFrame(() => {
    const row = document.getElementById(noteRowId(n.id));
    row?.scrollIntoView?.({ block: "nearest" });
    row?.focus({ preventScroll: true });
  });
}

export function NoteMarks({ pps }: { pps: number }) {
  const name = useStudio((s) => s.name);
  const { data } = useNotes(name);
  const marks = (data?.notes ?? []).filter((n) => n.state !== "done");
  return (
    <>
      {marks.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid="note-mark"
          aria-label={`Ghi chú ${stamp(n.t)}: ${n.text}`}
          title={n.text}
          className={cn(
            "absolute top-0 z-[4] flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-sm text-xs font-bold leading-none",
            "border text-foreground", n.state === "open" ? "border-warn bg-warn/25" : "border-border bg-muted",
          )}
          // A mark at 0:00 stays whole beside the track labels.
          style={{ left: Math.max(12, n.t * pps) }}
          // The ruler under it scrubs on press; a mark is a button, not a scrub.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => showNote(n)}
        >
          <span aria-hidden="true">{n.state === "open" ? "!" : "→"}</span>
        </button>
      ))}
    </>
  );
}
