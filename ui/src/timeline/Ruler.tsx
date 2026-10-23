// Port of the ruler of public/timeline.js render() (:419-432) and its scrub (:324); behaviour
// unchanged.
// The ruler above the tracks: a tick every rulerStep seconds with its label, the beats (BeatLayer),
// and a press-and-drag that seeks (startScrub). It sticks to the top while the tracks scroll.
import { memo, useRef } from "react";
import { rulerStep } from "@/core/timeline-geometry.ts";
import type { Timing } from "@/core/timeline-edit.ts";
import { BeatLayer } from "./markers/BeatLayer.tsx";
import { startScrub } from "./useDrag.ts";
import { useView } from "./view.ts";

export interface RulerProps { pps: number; total: number; lane: number; beatPicked: boolean; timing: Timing | null }

// The ruler's box: its left edge is time 0, for the ruler and the knob alike.
export const rulerRect = (): DOMRect | null => document.querySelector<HTMLElement>("[data-testid=timeline-ruler]")?.getBoundingClientRect() ?? null;

export const Ruler = memo(function Ruler({ pps, total, lane, beatPicked, timing }: RulerProps) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  const step = rulerStep(pps);
  const ticks = [];
  for (let t = 0; t <= total + 1e-6; t += step) {
    ticks.push(
      <div key={t} className="tl-tick pointer-events-none absolute top-0 h-full border-l border-border pl-[3px] text-[11px] text-muted-foreground tabular-nums" style={{ left: t * pps }}>
        {`${+t.toFixed(1)}s`}
      </div>,
    );
  }
  return (
    <div
      ref={ref}
      data-testid="timeline-ruler"
      className="tl-ruler sticky top-0 z-[3] ml-[90px] h-6 cursor-pointer border-b border-border bg-panel"
      title="Kéo để tua"
      style={{ width: lane }}
      onPointerDown={(e) => startScrub(e, view.snapLine, () => ref.current?.getBoundingClientRect() ?? null, total)}
    >
      {ticks}
      <BeatLayer pps={pps} total={total} picked={beatPicked} timing={timing} />
    </div>
  );
});
