// Port of brollBlocks and preview of public/timeline-lanes.js (:57-86); behaviour unchanged.
// The B-roll lane: one block per shot with that shot's assets (shot.assets), each as a chip with a
// small preview (an image as is, a video as a frame cached like the render thumbnails); an empty
// block says where footage goes. A click selects the shot; footage dropped on it goes to the shot.
// Free overlays (m.overlays, a later provider schema) show view only.
import { memo, useEffect, useState } from "react";
import { actions } from "@/api/actions.ts";
import type { FileStamp, Manifest, Shot } from "@/api/types.ts";
import { isMedia } from "@/core/format.ts";
import { thumbAt } from "@/core/thumbs.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { cn } from "@/lib/utils";
import { dropProps } from "../BrollDrop.ts";

const base = (p: unknown): string => String(p).split("/").pop() ?? "";

function Preview({ name, rel, stamps }: { name: string; rel: string; stamps: Record<string, FileStamp> | undefined }) {
  const kind = isMedia(rel);
  const mtime = stamps?.[rel]?.mtime;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "video" || !mtime) return;
    let alive = true;
    void thumbAt(fileUrl(name, rel), mtime, 0.5).then((u) => { if (alive && u) setSrc(u); });
    return () => { alive = false; };
  }, [kind, name, rel, mtime]);
  const cls = "broll-thumb h-[18px] w-8 flex-none rounded-[2px] object-cover";
  if (kind === "img") return <img className={cls} src={fileUrl(name, rel)} alt="" loading="lazy" />;
  if (kind !== "video") return null;
  return <img className={cls} src={src ?? undefined} alt="" hidden={!src} />;
}

export interface BrollBlockProps { s: Shot; pps: number; editable: boolean; name: string; stamps: Record<string, FileStamp> | undefined }

export const BrollBlock = memo(function BrollBlock({ s, pps, editable, name, stamps }: BrollBlockProps) {
  const assets = s.assets ?? [];
  return (
    <div
      data-shot={s.id}
      data-kind="broll"
      className={cn(
        "blk broll absolute top-1 bottom-1 flex cursor-pointer items-center gap-1 overflow-hidden rounded-sm border px-1 text-xs font-medium whitespace-nowrap text-muted-foreground select-none [&.drop-on]:border-primary [&.drop-on]:bg-primary/20",
        assets.length ? "border-border bg-panel-2" : "empty border-dashed border-border bg-transparent",
      )}
      title={assets.length ? assets.join("\n") : `Thả footage vào đây để thêm cho ${s.id}`}
      style={{ left: s.start * pps, width: (s.end - s.start) * pps }}
      onClick={(e) => { e.stopPropagation(); actions.select(s.id); }}
      {...dropProps(s.id, editable)}
    >
      {assets.map((a) => (
        <span key={a} className="broll-chip inline-flex h-[22px] max-w-[180px] items-center gap-1 overflow-hidden rounded-sm border border-border bg-panel py-0 pr-1.5 pl-0.5 text-[11px] text-ellipsis">
          <Preview name={name} rel={a} stamps={stamps} />
          {base(a)}
        </span>
      ))}
    </div>
  );
});

interface Overlay { id?: unknown; file?: unknown; start?: unknown; end?: unknown }

export interface BrollTrackProps { m: Manifest; pps: number; editable: boolean; name: string; stamps: Record<string, FileStamp> | undefined }

export function BrollTrack({ m, pps, editable, name, stamps }: BrollTrackProps) {
  const overlays = (Array.isArray(m.overlays) ? m.overlays : []) as Overlay[];
  return (
    <>
      {m.shots.map((s) => <BrollBlock key={s.id} s={s} pps={pps} editable={editable} name={name} stamps={stamps} />)}
      {overlays.map((o, i) => {
        const start = Number(o?.start), end = Number(o?.end);
        if (!Number.isFinite(start) || !(end > start)) return null;
        return (
          <div key={`overlay-${i}`} className="blk broll overlay absolute top-1 bottom-1 flex items-center overflow-hidden rounded-sm border border-track-shot bg-track-shot/60 px-1 text-xs text-foreground" title={String(o.file ?? "")} style={{ left: start * pps, width: (end - start) * pps }}>
            {base(o.file ?? o.id ?? "")}
          </div>
        );
      })}
    </>
  );
}
