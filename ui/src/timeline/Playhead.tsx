// Port of the playhead of public/timeline.js (:453-455, :474); behaviour unchanged.
// A red line over the tracks and a knob on the ruler that drags to seek. Its place is written
// straight into style.transform from useStudio.subscribe (t and pps), so playing or scrubbing
// never renders React.
import { memo, useLayoutEffect, useRef } from "react";
import { xAt } from "@/core/timeline-geometry.ts";
import { useStudio } from "@/store/studio.ts";
import { rulerRect } from "./Ruler.tsx";
import { startScrub } from "./useDrag.ts";
import { useView } from "./view.ts";

export const Playhead = memo(function Playhead({ total }: { total: number }) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = (t: number, pps: number) => { if (ref.current) ref.current.style.transform = `translateX(${xAt(t, pps) - 1}px)`; };
    const s = useStudio.getState();
    place(s.t, s.pps);
    return useStudio.subscribe((n, p) => { if (n.t !== p.t || n.pps !== p.pps) place(n.t, n.pps); });
  }, []);
  return (
    <div ref={ref} data-testid="playhead" className="playhead pointer-events-none absolute top-0 bottom-0 left-0 z-[4] w-0.5 bg-playhead will-change-transform">
      <div
        data-testid="playhead-knob"
        className="knob pointer-events-auto absolute top-0 -left-[7px] h-3.5 w-4 cursor-ew-resize bg-playhead [clip-path:polygon(0_0,100%_0,50%_100%)]"
        title="Kéo để tua"
        onPointerDown={(e) => startScrub(e, view.snapLine, rulerRect, total)}
      />
    </div>
  );
});
