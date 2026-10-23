// Media drag and drop between the panels and the timeline (public/panels.js:25 and :510-514,
// public/broll-search.js:31-33, public/timeline-lanes.js:34-46). A footage row sends
// { rel, kind, path }; a B-roll search hit sends { rel: null, kind: "video", path, sha256, start, end }.
// No React, so Node runs it directly.
export const MEDIA_DRAG = "text/x-ms-media";

export interface MediaDrag {
  rel: string | null;
  kind: string | null;
  path: string | null;
  sha256?: string;
  start?: number;
  end?: number;
}

interface DragLike { dataTransfer: DataTransfer | null }

// Puts the item on a dragstart event, with a text/plain fallback as panels.js:512 did.
export function setMediaDrag(e: DragLike, item: MediaDrag): void {
  const dt = e.dataTransfer;
  if (!dt) return;
  dt.setData(MEDIA_DRAG, JSON.stringify(item));
  dt.setData("text/plain", item.rel ?? item.path ?? "");
  dt.effectAllowed = "copy";
}

// True while a media item is dragged over (dragover cannot read the data itself).
export const hasMediaDrag = (e: DragLike): boolean => Boolean(e.dataTransfer?.types?.includes(MEDIA_DRAG));

// The item of a drop event, or null when there is none or its JSON is broken.
export function readMediaDrag(e: DragLike): MediaDrag | null {
  const raw = e.dataTransfer?.getData(MEDIA_DRAG);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
    const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
    const item: MediaDrag = { rel: str(v.rel), kind: str(v.kind), path: str(v.path) };
    if (typeof v.sha256 === "string") item.sha256 = v.sha256;
    if (num(v.start) !== undefined) item.start = num(v.start);
    if (num(v.end) !== undefined) item.end = num(v.end);
    return item;
  } catch {
    return null;
  }
}
