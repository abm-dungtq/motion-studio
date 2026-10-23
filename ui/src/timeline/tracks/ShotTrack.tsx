// Port of shotBlock of public/timeline.js (:162-219); behaviour unchanged.
// A shot block: its number and name, a frame of the newest render behind them, and a right edge
// that drags. Ripple (default) sends resize_shot (0.1 s steps, at least MIN_SHOT; the gateway moves
// every later shot); Roll moves the cut between this shot and the next and keeps the video's length
// (rollOps, bounded by rollRange). A snapped edge keeps the target's exact time. Footage dropped on
// the block goes to the shot. Right click: cut at the playhead, roll the cut to the playhead, ask
// the director about the shot.
import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { Manifest, Shot, TimelineMedia } from "@/api/types.ts";
import { round1 } from "@/core/format.ts";
import { rollOps, rollRange, type SnapTarget } from "@/core/timeline-edit.ts";
import { MIN_SHOT, round3 } from "@/core/timeline-geometry.ts";
import { cn } from "@/lib/utils";
import type { EditMode } from "@/store/studio.ts";
import { shotMenu } from "../BlockMenu.ts";
import { dropProps } from "../BrollDrop.ts";
import { useShotThumb } from "../ShotThumb.tsx";
import { startDrag, type DragHit } from "../useDrag.ts";
import { byId, clearPreview, leftOf, markDrag, preview, settle, useView, widthOf } from "../view.ts";

export interface ShotBlockProps {
  m: Manifest; s: Shot; i: number; pps: number; mode: EditMode; sel: boolean; editable: boolean;
  name: string; render: TimelineMedia["render"] | undefined;
}

export const ShotBlock = memo(function ShotBlock({ m, s, i, pps, mode, sel, editable, name, render }: ShotBlockProps) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  const dur = s.end - s.start;
  const label = s.name ? `${i + 1} · ${s.name}` : `${i + 1}`;
  const nextShot = m.shots[i + 1];
  const thumb = useShotThumb(name, render, s.start, s.end, pps);
  useLayoutEffect(() => clearPreview(ref.current), [s.start, s.end, pps]);

  const drag = useMemo(() => {
    // Ripple: this shot and the ones after it move with the edge, and so do their lines and SFX.
    const later = new Set(m.shots.slice(i).map((x) => x.id));
    const moving = new Set([...m.lines.filter((l) => later.has(l.shot) && l.shot !== s.id).map((l) => l.id),
      ...(m.events ?? []).filter((x) => later.has(x.shot) && x.shot !== s.id).map((x) => x.id)]);
    const rippleSkip = (x: SnapTarget) => (x.kind === "shot" && later.has(x.id ?? "") && !(x.id === s.id && x.t < s.end)) || moving.has(x.id ?? "");
    // Roll: only the cut and what the next shot holds move.
    const nextHeld = new Set(nextShot ? [...m.lines.filter((l) => l.shot === nextShot.id).map((l) => l.id), ...(m.events ?? []).filter((x) => x.shot === nextShot.id).map((x) => x.id)] : []);
    const rollSkip = (x: SnapTarget) => (x.kind === "shot" && Math.abs(x.t - s.end) < 0.0005) || nextHeld.has(x.id ?? "");
    const step = (d: number, hit: DragHit | null) => (hit ? round3(d) : round1(d));
    const rippleDur = (dx: number, hit: DragHit | null, p: number) => Math.max(MIN_SHOT, step(dur + dx / p, hit));
    const range = rollRange(m, s.id);
    const rollDt = (dx: number, hit: DragHit | null, p: number) => (range ? Math.max(range[0], Math.min(range[1], round3(step(s.end + dx / p, hit) - s.end))) : 0);
    return { rippleSkip, rollSkip, rippleDur, rollDt };
  }, [m, s, i, nextShot, dur]);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    const b = ref.current;
    const next = () => (nextShot ? byId(view, nextShot.id) : null);
    markDrag(b);
    startDrag(e, view.snapLine, (dx, hit) => {
      if (mode !== "roll") { preview(b, 0, (drag.rippleDur(dx, hit, pps) - dur) * pps); return; }
      const dt = drag.rollDt(dx, hit, pps);
      preview(b, 0, dt * pps);
      const n = next();
      if (n) { markDrag(n); preview(n, dt * pps, -dt * pps); }
    }, (dx, hit) => {
      const touched = [b, next()];
      if (mode === "roll") {
        const dt = drag.rollDt(dx, hit, pps);
        if (Math.abs(dt) < 0.0005) return settle(touched, false);
        const r = rollOps(m, s.id, dt);
        if (r.error) { say(r.error, true); return settle(touched, false); }
        actions.select(s.id);
        void actions.patch(r.ops).then((ok) => settle(touched, ok));
        return;
      }
      const d = drag.rippleDur(dx, hit, pps);
      if (Math.abs(d - dur) < 0.0005 || (!hit && Math.abs(d - dur) < 0.05)) return settle(touched, false);
      actions.select(s.id);
      void actions.patch([{ op: "resize_shot", id: s.id, duration: d }]).then((ok) => settle(touched, ok));
    }, { skip: (x) => (mode === "roll" ? drag.rollSkip(x) : drag.rippleSkip(x)), edges: (d) => [s.end + d] });
  };

  const handleTitle = mode === "roll" ? (nextShot ? "Kéo để dời điểm cắt (Roll)" : "Shot cuối: Roll cần shot kế tiếp, kéo sẽ không đổi gì") : "Kéo để đổi độ dài (Ripple)";
  return (
    <div
      ref={ref}
      data-id={s.id}
      data-kind="shot"
      title={label}
      className={cn(
        "blk shot absolute top-1.5 bottom-1.5 flex cursor-pointer items-center overflow-hidden rounded-sm border px-2 text-xs font-semibold whitespace-nowrap select-none [&.drop-on]:outline-2 [&.drop-on]:outline-primary",
        sel ? "sel border-primary bg-primary text-primary-foreground" : "border-track-shot bg-track-shot/60 text-foreground",
        thumb && "has-thumb bg-size-[auto_100%] bg-left bg-repeat-x",
        thumb && render?.stale && "thumb-stale bg-blend-luminosity",
        thumb && sel && "shadow-[inset_0_0_0_3px_var(--ms-accent)]",
      )}
      style={{ left: leftOf(s.start * pps), width: widthOf(dur * pps), backgroundImage: thumb ? `url("${thumb}")` : undefined }}
      onClick={() => actions.select(s.id)}
      onContextMenu={(e) => shotMenu(e, m, s, Boolean(nextShot), editable)}
      {...dropProps(s.id, editable)}
    >
      <span className={cn("shot-label relative truncate", thumb && "rounded-[3px] px-1.5 py-px", thumb && (sel ? "bg-primary text-primary-foreground" : "bg-background/85 text-foreground"))}>{label}</span>
      <div
        className={cn("handle absolute top-0 -right-px h-full w-2 cursor-ew-resize hover:bg-primary", !editable && "hidden")}
        title={handleTitle}
        onPointerDown={onHandleDown}
      />
    </div>
  );
});

export interface ShotTrackProps { m: Manifest; pps: number; mode: EditMode; sel: string | null; editable: boolean; name: string; render: TimelineMedia["render"] | undefined }

export function ShotTrack({ m, pps, mode, sel, editable, name, render }: ShotTrackProps) {
  return <>{m.shots.map((s, i) => <ShotBlock key={s.id} m={m} s={s} i={i} pps={pps} mode={mode} sel={s.id === sel} editable={editable} name={name} render={render} />)}</>;
}
