// Port of beatLayer of public/timeline-markers.js (:99-126) and the view-only beats of
// public/timeline.js (:424-432); behaviour unchanged.
// Beats on the ruler. With the music bed's beats.json (GET /api/timing) the grid drags as a whole:
// release → markers.setBeat with the new beat0, kept in [0, beatLen) so B(n) keeps its numbering;
// a press without travel picks the beat grid for the inspector. Without it, TIMING's beats show,
// view only. Lines closer than 6 px are not drawn.
import { memo, useRef } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { useMarkers } from "@/api/markers.ts";
import { beatBounds, beatTimes, markerDrag, type Timing } from "@/core/timeline-edit.ts";
import { cn } from "@/lib/utils";
import { startMarkerDrag, stopClick } from "./markerDrag.ts";

const LINE = "tl-beat pointer-events-none absolute bottom-0 h-[7px] border-l border-track-music";

export interface BeatLayerProps { pps: number; total: number; picked: boolean; timing: Timing | null }

export const BeatLayer = memo(function BeatLayer({ pps, total, picked, timing }: BeatLayerProps) {
  const markers = useMarkers();
  const layer = useRef<HTMLDivElement>(null);
  const g = markers.get()?.grid;
  if (!g || !beatBounds(g.beatLen) || g.beatLen * pps < 6) {
    const beats = beatTimes(timing, total).filter((t) => t <= total + 1e-6);
    const gap = beats.slice(1).reduce((min, t, i) => Math.min(min, t - beats[i]), Infinity);
    if (!beats.length || gap * pps < 6) return null;
    return <>{beats.map((t, i) => <div key={i} className={LINE} style={{ left: t * pps }} />)}</>;
  }
  const lines = [];
  for (let k = 0, t = g.beat0; t <= total + 1e-6; k++, t = g.beat0 + k * g.beatLen) {
    lines.push(
      <div
        key={k}
        data-testid="beat-line"
        className={cn(LINE, "drag pointer-events-auto -ml-[3px] h-[11px] w-[7px] cursor-ew-resize border-l-0 bg-[linear-gradient(var(--ms-track-music),var(--ms-track-music))] bg-[length:1px_100%] bg-center bg-no-repeat hover:bg-[linear-gradient(var(--ms-accent),var(--ms-accent))] hover:bg-[length:3px_100%]", picked && "sel bg-[linear-gradient(var(--ms-accent),var(--ms-accent))] bg-[length:3px_100%]")}
        title={`Phách ${k} · ${t.toFixed(3)}s · kéo để dời cả lưới`}
        style={{ left: t * pps }}
        onClick={stopClick}
        onPointerDown={(e) => startMarkerDrag(e, markers, {
          move: (dx) => {
            const r = markerDrag(g, "beat", dx / pps);
            if (layer.current) { layer.current.style.transform = `translateX(${((r.value ?? g.beat0) - g.beat0) * pps}px)`; layer.current.classList.add("dragging"); }
          },
          done: (dx) => {
            const reset = () => { if (layer.current) { layer.current.style.transform = ""; layer.current.classList.remove("dragging"); } };
            const r = markerDrag(g, "beat", dx / pps);
            if (r.error || r.value === undefined) { say(r.error ?? "Độ dời không hợp lệ", true); return reset(); }
            if (r.clamped) say("beat0 giữ trong một phách đầu để B(n) không đổi số");
            actions.pick("beat", g.music_id);
            void Promise.resolve(markers.setBeat(r.value)).finally(reset);
          },
          click: () => actions.pick("beat", g.music_id),
        })}
      />,
    );
  }
  return <div ref={layer} className="beat-layer pointer-events-none absolute inset-0">{lines}</div>;
});
