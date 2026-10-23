// Port of public/broll-search.js; behaviour unchanged.
// A result card (hitCard, broll-search.js:21-35): thumbnail, time range, caption, tags, file; it
// drags onto the timeline as text/x-ms-media { rel: null, kind: "video", path, sha256, start, end }.
// Layout of the media grid learnt from OpenCut-app/OpenCut (https://github.com/OpenCut-app/OpenCut,
// MIT; ideas only).
import type { ReactNode } from "react";
import { setMediaDrag } from "@/core/dnd.ts";
import { fmt } from "@/core/format.ts";

export interface BrollHit {
  path?: string | null;
  sha256?: string;
  start: number;
  end: number;
  duration: number;
  shot_type?: string | null;
  caption_vi?: string | null;
  describe_error?: unknown;
  tags?: string[];
  thumb?: string | null;
  [k: string]: unknown;
}

export const span = (h: { start: number; end: number }): string => `${fmt(h.start)}–${fmt(h.end)}`;
const fileOf = (p: unknown): string => String(p ?? "").split("/").pop() ?? "";

export function HitCard({ x, children }: { x: BrollHit; children?: ReactNode }) {
  return (
    <div
      className="grid cursor-grab grid-rows-[auto_1fr] overflow-hidden rounded-md border border-border bg-panel hover:border-ring"
      draggable
      title={`${x.path ?? ""}\nKéo vào timeline`}
      data-broll-hit=""
      onDragStart={(e) => setMediaDrag(e, { rel: null, kind: "video", path: x.path ?? null, sha256: x.sha256, start: x.start, end: x.end })}
    >
      {x.thumb
        ? <img className="block aspect-video w-full bg-stage object-contain" src={x.thumb} alt={x.caption_vi ?? fileOf(x.path)} loading="lazy" />
        : <div className="grid aspect-video w-full place-items-center bg-stage text-xs text-muted-foreground">không có ảnh</div>}
      <div className="grid min-w-0 gap-0.5 px-2 pt-1.5 pb-2">
        <small className="text-xs text-muted-foreground tabular-nums">{`${span(x)} · ${Number(x.duration).toFixed(1)} s${x.shot_type ? ` · ${x.shot_type}` : ""}`}</small>
        <span className="text-[13px] leading-snug">{x.caption_vi ?? (x.describe_error ? "chú thích lỗi" : "chưa có chú thích")}</span>
        {x.tags?.length ? <small className="text-xs text-primary">{x.tags.join(" · ")}</small> : null}
        <small className="truncate text-xs text-muted-foreground">{fileOf(x.path)}</small>
        {children}
      </div>
    </div>
  );
}

// The red box of a failed load (.form-error of public/app.css:270).
export function FormError({ text }: { text: string }) {
  return <p className="m-0 rounded-sm border border-danger px-2.5 py-2 text-[13px] font-semibold whitespace-pre-wrap text-danger">{text}</p>;
}
