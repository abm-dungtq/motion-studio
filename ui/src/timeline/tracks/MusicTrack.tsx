// Port of musicBlock of public/timeline.js (:268-301); behaviour unchanged.
// A music bed in its lane (overlapping beds take a lane each, core/timeline-lanes.ts): file name
// and gain, its waveform from media_start on, and three drag targets. The body moves the bed, the
// left edge trims its head (media_start follows), the right edge trims its end; each release sends
// one update_music (musicDragOps), or nothing when nothing changed. A press without travel picks
// it. Right click: to the start of the video, run to the end of the video.
import { memo, useLayoutEffect, useRef, type PointerEvent } from "react";
import { actions } from "@/api/actions.ts";
import type { FileStamp, Manifest, Music } from "@/api/types.ts";
import { musicDragOps, type Op } from "@/core/timeline-edit.ts";
import { CLICK, TRACK } from "@/core/timeline-geometry.ts";
import { musicLanes } from "@/core/timeline-lanes.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { cn } from "@/lib/utils";
import { musicMenu } from "../BlockMenu.ts";
import { startDrag } from "../useDrag.ts";
import { clearPreview, leftOf, markDrag, preview, settle, useView, widthOf } from "../view.ts";
import { Wave } from "../Wave.tsx";

type DragMode = "move" | "trim-start" | "trim-end";

export interface MusicBlockProps { mu: Music; lane: number; total: number; pps: number; sel: boolean; editable: boolean; name: string; stamp: FileStamp | undefined; mediaReady: boolean }

export const MusicBlock = memo(function MusicBlock({ mu, lane, total, pps, sel, editable, name, stamp, mediaReady }: MusicBlockProps) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  const start = Number(mu.start) || 0;
  const end = mu.end ?? total;
  const width = Math.max(0.2, end - start);
  useLayoutEffect(() => clearPreview(ref.current), [start, end, pps]);
  // Where an op would put the bed: start and end (an op that sets end null runs to total).
  const span = (op: Op | null) => {
    const s = op && "start" in op ? Number(op.start) : start;
    const e = op && "end" in op ? (op.end == null ? total : Number(op.end)) : end;
    return { dl: (s - start) * pps, dw: (Math.max(0.2, e - s) - width) * pps };
  };
  const from = Number(mu.media_start) || 0;
  const len = end - start;
  const file = String(mu.file ?? "");
  const edges: Record<DragMode, (d: number) => number[]> = {
    move: (d) => (mu.end == null ? [start + d] : [start + d, end + d]),
    "trim-start": (d) => [start + d],
    "trim-end": (d) => [end + d],
  };

  const down = (mode: DragMode) => (e: PointerEvent<HTMLDivElement>) => {
    const b = ref.current;
    markDrag(b);
    startDrag(e, view.snapLine, (dx) => {
      const { dl, dw } = span(musicDragOps(mu, mode, dx / pps, total));
      preview(b, dl, dw);
    }, (dx) => {
      if (Math.abs(dx) < CLICK) { settle([b], false); return actions.pick("music", mu.id); }
      const op = musicDragOps(mu, mode, dx / pps, total);
      if (!op) return settle([b], false);
      void actions.patch([op]).then((ok) => settle([b], ok));
    }, { skip: null, edges: edges[mode] });
  };

  return (
    <div
      ref={ref}
      data-id={mu.id}
      data-kind="music"
      title={file}
      className={cn(
        "blk music isolate absolute flex items-center overflow-hidden rounded-sm border border-track-music bg-track-music/45 px-3 text-xs font-semibold whitespace-nowrap select-none",
        editable ? "cursor-grab" : "cursor-pointer",
        sel && "sel outline-2 outline-offset-1 outline-primary",
      )}
      style={{ left: leftOf(start * pps), width: widthOf(width * pps), top: lane * TRACK + 6, height: TRACK - 12 }}
      onClick={() => { if (!editable) actions.pick("music", mu.id); }}
      onPointerDown={down("move")}
      onContextMenu={(e) => musicMenu(e, mu, editable)}
    >
      {len > 0 ? <Wave url={fileUrl(name, file)} stamp={stamp} ready={mediaReady} from={from} to={from + len} gain={Number(mu.gain) || 1} width={width * pps} className="text-track-music" /> : null}
      <span className="truncate">{`${file.split("/").pop()} · ${Math.round(Number(mu.gain) * 100)}%`}</span>
      <div className={cn("handle left absolute top-0 -left-px h-full w-2 cursor-ew-resize hover:bg-primary", !editable && "hidden")} title="Kéo để cắt đầu" onPointerDown={down("trim-start")} />
      <div className={cn("handle absolute top-0 -right-px h-full w-2 cursor-ew-resize hover:bg-primary", !editable && "hidden")} title="Kéo để cắt cuối" onPointerDown={down("trim-end")} />
    </div>
  );
});

export interface MusicTrackProps { m: Manifest; total: number; pps: number; pick: string | null; editable: boolean; name: string; files: Record<string, FileStamp> | undefined; mediaReady: boolean }

export function MusicTrack({ m, total, pps, pick, editable, name, files, mediaReady }: MusicTrackProps) {
  const ml = musicLanes(m, total);
  return (
    <>
      {(m.music ?? []).map((mu) => (
        <MusicBlock key={mu.id} mu={mu} lane={ml.lane[mu.id] ?? 0} total={total} pps={pps} sel={pick === mu.id} editable={editable} name={name} stamp={mu.file ? files?.[mu.file] : undefined} mediaReady={mediaReady} />
      ))}
    </>
  );
}
