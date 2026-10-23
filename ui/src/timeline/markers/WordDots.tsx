// Port of wordDots of public/timeline-markers.js (:128-159) and the view-only word marks of
// public/timeline.js (:224-229); behaviour unchanged.
// Word dots of a line inside its voice block, from pps 120 on. With the line's words.json (GET
// /api/timing) they drag: release → markers.setWord with the new start, in seconds of the voice
// file (the dot sits at line start + word start); a press without travel picks the word for the
// inspector. Without it, TIMING's word starts show, view only.
import { memo } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { TimingLine } from "@/core/markers.ts";
import { markerDrag } from "@/core/timeline-edit.ts";
import { cn } from "@/lib/utils";
import { useMarkers } from "@/api/markers.ts";
import { startMarkerDrag, stopClick } from "./markerDrag.ts";

const DOT = "word-mark absolute bottom-[3px] -ml-0.5 size-1 rounded-full bg-track-voice pointer-events-none";
const DRAG = "drag pointer-events-auto z-[1] bottom-0.5 -ml-[3.5px] size-[7px] cursor-ew-resize border border-panel bg-track-voice hover:scale-130 hover:bg-primary";

export interface WordDotsProps { lineId: string; start: number; duration: number; pps: number; picked: string | null; viewOnly: number[] | undefined }

export const WordDots = memo(function WordDots({ lineId, start, duration, pps, picked, viewOnly }: WordDotsProps) {
  const markers = useMarkers();
  const d: TimingLine | null = markers.line(lineId);
  if (!d) {
    return <>{(viewOnly ?? []).filter((t) => t >= start - 1e-6 && t <= start + duration).map((t, i) => <span key={i} className={DOT} style={{ left: `${(t - start) * pps}px` }} />)}</>;
  }
  return (
    <>
      {d.words.map((w, i) => {
        if (!Number.isFinite(w.start)) return null;
        const rel = w.start; // seconds into the line's file = seconds into its block
        if (rel < -1e-6 || (duration > 0 && rel > duration + 1e-6)) return null;
        const sel = picked === `${lineId}#${i}`;
        return (
          <span
            key={i}
            data-testid="word-dot"
            className={cn(DOT, DRAG, sel && "sel scale-130 bg-primary")}
            title={`"${w.text}" · ${(d.offset + w.start).toFixed(3)}s · kéo để dời đầu từ`}
            style={{ left: `${rel * pps}px` }}
            onClick={stopClick}
            onPointerDown={(e) => {
              const dot = e.currentTarget;
              startMarkerDrag(e, markers, {
                move: (dx) => {
                  const r = markerDrag({ words: d.words, index: i }, "word", dx / pps);
                  dot.style.left = `${(r.value ?? w.start) * pps}px`;
                  dot.classList.add("dragging", "scale-130", "bg-primary");
                },
                done: (dx) => {
                  const r = markerDrag({ words: d.words, index: i }, "word", dx / pps);
                  const reset = () => { dot.style.left = `${rel * pps}px`; dot.classList.remove("dragging", "scale-130", "bg-primary"); };
                  if (r.error) { say(r.error, true); return reset(); }
                  if (r.clamped) say("Đầu từ không vượt từ kề và cách cuối từ ít nhất 10 ms");
                  actions.pick("word", `${lineId}#${i}`);
                  void Promise.resolve(markers.setWord(lineId, i, { start: r.value })).finally(reset);
                },
                click: () => actions.pick("word", `${lineId}#${i}`),
              });
            }}
          />
        );
      })}
    </>
  );
});
