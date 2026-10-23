// Port of eventBlock of public/timeline.js (:303-321) and the SFX tiers of render (:449-463);
// behaviour unchanged.
// An SFX: a 14 px block at its time in its tier (SFX that would touch on screen stack in up to 4
// tiers, core/timeline-lanes.ts), with its label from pps 80 on. Dragging it sends move_event
// (exact to the millisecond); a press without travel picks it. Right click: "Xoá SFX" for an SFX
// added in Studio, else "Nhờ đạo diễn xoá SFX này".
import { memo, useLayoutEffect, useRef } from "react";
import { actions } from "@/api/actions.ts";
import type { Manifest, SfxEventFull } from "@/api/types.ts";
import { fmt } from "@/core/format.ts";
import { eventStart } from "@/core/timeline-edit.ts";
import { CLICK, round3, TIER } from "@/core/timeline-geometry.ts";
import { sfxTiers } from "@/core/timeline-lanes.ts";
import { cn } from "@/lib/utils";
import { sfxMenu } from "../BlockMenu.ts";
import { startDrag } from "../useDrag.ts";
import { clearPreview, leftOf, markDrag, preview, settle, useView } from "../view.ts";

export interface SfxBlockProps { ev: SfxEventFull; start: number; tier: number; pps: number; sel: boolean; editable: boolean }

export const SfxBlock = memo(function SfxBlock({ ev, start, tier, pps, sel, editable }: SfxBlockProps) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  const label = String(ev.label || ev.id);
  useLayoutEffect(() => clearPreview(ref.current), [start, pps]);
  const next = (dx: number) => round3(Math.max(0, start + dx / pps));
  return (
    <div
      ref={ref}
      data-id={ev.id}
      data-kind="event"
      title={`${label} · ${fmt(start)}`}
      className={cn(
        "blk sfx absolute w-3.5 min-h-3.5 rounded-sm border-2 border-track-sfx bg-track-sfx/60 select-none",
        editable ? "cursor-grab" : "cursor-pointer",
        sel && "sel border-primary bg-track-sfx outline-2 outline-offset-1 outline-primary",
      )}
      style={{ left: leftOf(start * pps - 7), top: 4 + tier * TIER, height: TIER - 4 }}
      onClick={() => { if (!editable) actions.pick("event", ev.id); }}
      onPointerDown={(e) => {
        const b = ref.current;
        markDrag(b);
        startDrag(e, view.snapLine, (dx) => preview(b, (next(dx) - start) * pps, 0), (dx) => {
          if (Math.abs(dx) < CLICK) { settle([b], false); return actions.pick("event", ev.id); }
          void actions.patch([{ op: "move_event", id: ev.id, start: next(dx) }]).then((ok) => settle([b], ok));
        }, { skip: (x) => x.kind === "event" && x.id === ev.id, edges: (d) => [start + d] });
      }}
      onContextMenu={(e) => sfxMenu(e, ev, editable)}
    >
      {pps >= 80 ? <span className="sfx-label pointer-events-none absolute left-4 text-[11px] whitespace-nowrap text-foreground">{label.slice(0, 12)}</span> : null}
    </div>
  );
});

export interface SfxTrackProps { m: Manifest; pps: number; pick: string | null; editable: boolean }

export function SfxTrack({ m, pps, pick, editable }: SfxTrackProps) {
  const st = sfxTiers(m, pps);
  return <>{(m.events ?? []).map((ev) => <SfxBlock key={ev.id} ev={ev} start={eventStart(m, ev)} tier={st.lane[ev.id] ?? 0} pps={pps} sel={pick === ev.id} editable={editable} />)}</>;
}
