// Port of shotThumb and the shot note of public/timeline.js (:150-160, :452); behaviour unchanged.
// A frame of the newest render at the middle of the shot, behind its label (core/thumbs.ts, cached
// in IndexedDB). Shots narrower than THUMB_MIN px get none. A render older than the last timeline
// edit (stale) is drawn faded. The Shot label carries "ảnh hh:mm", when that render was made.
import { useEffect, useState } from "react";
import type { TimelineMedia } from "@/api/types.ts";
import { thumbAt } from "@/core/thumbs.ts";
import { round3, THUMB_MIN } from "@/core/timeline-geometry.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { cn } from "@/lib/utils";

type Render = TimelineMedia["render"];

export const clock = (ms: number): string => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

// The object URL of the shot's frame, or null (none yet, too narrow, no render).
export function useShotThumb(name: string, render: Render | undefined, start: number, end: number, pps: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const wide = (end - start) * pps >= THUMB_MIN;
  const path = render?.path ?? null, mtime = render?.mtime ?? 0;
  const at = round3((start + end) / 2);
  useEffect(() => {
    if (!path || !wide) { setUrl(null); return; }
    let alive = true;
    void thumbAt(fileUrl(name, path), mtime, at).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [name, path, mtime, at, wide]);
  return url;
}

export function ShotNote({ render }: { render: Render | undefined }) {
  if (!render) return null;
  const title = `Ảnh từ ${render.path}, ${new Date(render.mtime).toLocaleString("vi-VN")}${render.stale ? ", cũ hơn lần sửa timeline gần nhất" : ""}`;
  return <span className={cn("tl-note block text-[10px] font-medium whitespace-nowrap", render.stale ? "stale text-warn" : "text-muted-foreground")} title={title}>{`ảnh ${clock(render.mtime)}`}</span>;
}
