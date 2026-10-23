// Port of voiceBlock of public/timeline.js (:221-266); behaviour unchanged.
// A voice block: its waveform, a mic glyph and the first words of the line. Dragging it sends
// move_line (0.1 s steps, exact when snapped); with Shift held, the later lines of the same shot
// follow it (rippleLineOps), in the preview and in the one patch. A press without travel picks the
// line. Right click: "Chọn câu". On a view-only project a click picks it.
import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { FileStamp, Line, Manifest } from "@/api/types.ts";
import { round1 } from "@/core/format.ts";
import { rippleLineOps } from "@/core/timeline-edit.ts";
import { CLICK, round3 } from "@/core/timeline-geometry.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { cn } from "@/lib/utils";
import { lineMenu } from "../BlockMenu.ts";
import { WordDots } from "../markers/WordDots.tsx";
import { startDrag, type DragHit } from "../useDrag.ts";
import { byId, clearPreview, leftOf, markDrag, preview, settle, useView, widthOf } from "../view.ts";
import { Wave } from "../Wave.tsx";

export interface VoiceBlockProps {
  m: Manifest; l: Line; pps: number; sel: boolean; editable: boolean; name: string;
  stamp: FileStamp | undefined; mediaReady: boolean; wordPick: string | null; viewWords: number[] | undefined;
}

export const VoiceBlock = memo(function VoiceBlock({ m, l, pps, sel, editable, name, stamp, mediaReady, wordPick, viewWords }: VoiceBlockProps) {
  const view = useView();
  const ref = useRef<HTMLDivElement>(null);
  const dur = Number(l.duration) || 0;
  useLayoutEffect(() => clearPreview(ref.current), [l.start, dur, pps]);
  // With Shift, the later lines of the shot follow the dragged one (preview and patch).
  const followers = useMemo(() => (rippleLineOps(m, l.id, l.start + 1).ops ?? []).map((o) => String(o.id)).filter((id) => id !== l.id), [m, l]);
  const next = (dx: number, hit: DragHit | null) => Math.max(0, hit ? round3(l.start + dx / pps) : round1(l.start + dx / pps));

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const b = ref.current;
    markDrag(b);
    let shown: string[] = [];
    const showFollowers = (d: number, on: boolean) => {
      for (const id of shown) { const x = byId(view, id); if (x) clearPreview(x); }
      shown = on ? followers : [];
      for (const id of shown) {
        const x = byId(view, id);
        const ln = m.lines.find((y) => y.id === id);
        if (x && ln) { markDrag(x); preview(x, (Math.max(0, ln.start + d) - ln.start) * pps, 0); }
      }
    };
    const touched = () => [b, ...shown.map((id) => byId(view, id))];
    startDrag(e, view.snapLine, (dx, hit, ev) => {
      const t = next(dx, hit);
      preview(b, (t - l.start) * pps, 0);
      showFollowers(t - l.start, ev.shiftKey);
    }, (dx, hit, ev) => {
      if (Math.abs(dx) < CLICK) { settle(touched(), false); return actions.pick("line", l.id); }
      const t = next(dx, hit);
      if (ev.shiftKey) {
        const r = rippleLineOps(m, l.id, t);
        if (r.error) { say(r.error, true); return settle(touched(), false); }
        if (!r.ops.length) return settle(touched(), false);
        const els = touched();
        void actions.patch(r.ops).then((ok) => settle(els, ok));
        return;
      }
      const els = touched();
      void actions.patch([{ op: "move_line", id: l.id, start: t }]).then((ok) => settle(els, ok));
    }, {
      // Pressed with Shift, the followers move too, so they are no target either.
      skip: (x, press) => x.id === l.id || (press.shiftKey && followers.includes(x.id ?? "")),
      edges: (d) => [l.start + d, l.start + dur + d],
    });
  };

  return (
    <div
      ref={ref}
      data-id={l.id}
      data-kind="line"
      title={`${l.text ?? ""}\nShift+kéo: dời cả các câu sau trong shot`}
      className={cn(
        "blk voice isolate absolute top-1.5 bottom-1.5 flex items-center gap-1.5 overflow-hidden rounded-sm border px-2 text-xs font-semibold whitespace-nowrap select-none",
        editable ? "cursor-grab" : "cursor-pointer",
        l.gate === "stale" ? "stale border-2 border-dashed border-warn bg-warn/20" : "border-track-voice bg-track-voice/40",
        sel && "sel outline-2 outline-offset-1 outline-primary",
      )}
      style={{ left: leftOf(l.start * pps), width: widthOf(Math.max(0.2, dur) * pps) }}
      onClick={() => { if (!editable) actions.pick("line", l.id); }}
      onPointerDown={onDown}
      onContextMenu={(e) => lineMenu(e, l.id)}
    >
      {l.file && dur > 0 ? <Wave url={fileUrl(name, l.file)} stamp={stamp} ready={mediaReady} from={0} to={dur} width={Math.max(0.2, dur) * pps} className="text-track-voice" /> : null}
      <span className="mic relative h-[11px] w-[7px] flex-none rounded-[4px] border-2 border-track-voice" />
      <span className="truncate">{String(l.text ?? "").slice(0, 24)}</span>
      {pps >= 120 ? <WordDots lineId={l.id} start={l.start} duration={dur} pps={pps} picked={wordPick} viewOnly={viewWords} /> : null}
    </div>
  );
});

export interface VoiceTrackProps {
  m: Manifest; pps: number; pickLine: string | null; wordPick: string | null; editable: boolean; name: string;
  files: Record<string, FileStamp> | undefined; mediaReady: boolean; words: Map<string, number[]>;
}

export function VoiceTrack({ m, pps, pickLine, wordPick, editable, name, files, mediaReady, words }: VoiceTrackProps) {
  return (
    <>
      {m.lines.map((l) => (
        <VoiceBlock
          key={l.id} m={m} l={l} pps={pps} sel={pickLine === l.id} editable={editable} name={name}
          stamp={l.file ? files?.[l.file] : undefined} mediaReady={mediaReady}
          wordPick={wordPick?.startsWith(`${l.id}#`) ? wordPick : null} viewWords={words.get(l.id)}
        />
      ))}
    </>
  );
}
