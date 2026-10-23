// Port of acceptDrop of public/timeline-lanes.js (:31-55); behaviour unchanged.
// A footage row dragged from the Footage panel (MEDIA_DRAG) and dropped on a shot or its B-roll
// block adds the file to that shot: POST /api/timeline/asset, which copies a workspace file into
// the project first. A view-only project takes no drop.
import type { DragEvent } from "react";
import { actions, current } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import { hasMediaDrag, readMediaDrag } from "@/core/dnd.ts";

const base = (p: unknown): string => String(p).split("/").pop() ?? "";

export async function dropOnShot(e: DragEvent<HTMLElement>, shotId: string): Promise<void> {
  e.currentTarget.classList.remove("drop-on");
  if (!hasMediaDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  const item = readMediaDrag(e);
  if (!item) return say("Không đọc được file vừa thả", true);
  if (!item.path) return say("File này chưa có đường dẫn trên máy", true);
  const { name, m } = current();
  if (!name || !m) return;
  const r = await Q.timelineAsset({ name, shot: shotId, base: m.version, path: item.path });
  await actions.reload();
  if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
  const d = r.data ?? {};
  say(d.unchanged ? `${base(d.path)} đã có trong ${shotId}` : `Đã thêm ${base(d.path)} vào ${shotId}${d.copied ? " (đã chép vào assets/footage)" : ""}`);
}

// Props that make an element a drop target for shot shotId.
export function dropProps(shotId: string, editable: boolean) {
  return {
    onDragOver(e: DragEvent<HTMLElement>) {
      if (!editable || !hasMediaDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      e.currentTarget.classList.add("drop-on");
    },
    onDragLeave(e: DragEvent<HTMLElement>) { e.currentTarget.classList.remove("drop-on"); },
    onDrop(e: DragEvent<HTMLElement>) { if (editable) void dropOnShot(e, shotId); else e.currentTarget.classList.remove("drop-on"); },
  };
}
