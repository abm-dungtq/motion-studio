// Port of targetsFor and the snap line of public/timeline.js (:90-96); behaviour unchanged.
// With snapping on, a drag snaps to shot edges, lines, SFX, the playhead, beats and word starts of
// the composition's TIMING (core/timeline-edit.ts snapTargets). The snap line is one element of the
// inner box, moved and shown through its ref; it never renders React.
import { useMemo, useRef, type RefObject } from "react";
import { actions, current } from "@/api/actions.ts";
import { snapTargets, type SnapTarget, type Timing } from "@/core/timeline-edit.ts";
import { xAt } from "@/core/timeline-geometry.ts";
import { useStudio } from "@/store/studio.ts";
import type { SnapLine } from "./view.ts";

// The composition's window.TIMING, as the player read it (null when none).
export const compositionTiming = (): Timing | null => (actions.transport.timing() as Timing | null) ?? null;

// Snap targets for a drag starting now; none while snapping is off. t0 is the playhead (null: the
// playhead itself is being dragged, so it is no target).
export function targetsFor(skip: ((x: SnapTarget) => boolean) | null, t0: number | null = actions.transport.time()): SnapTarget[] {
  if (!useStudio.getState().snap) return [];
  return snapTargets(current().m, compositionTiming(), t0, skip);
}

// The snap line's element ref and its show / hide.
export function useSnapLine(): { ref: RefObject<HTMLDivElement | null>; line: SnapLine } {
  const ref = useRef<HTMLDivElement | null>(null);
  const line = useMemo<SnapLine>(() => ({
    show(t) {
      const el = ref.current;
      if (!el) return;
      el.style.left = `${xAt(t, useStudio.getState().pps)}px`;
      el.hidden = false;
    },
    hide() { if (ref.current) ref.current.hidden = true; },
  }), []);
  return { ref, line };
}
