// Port of public/panels.js; behaviour unchanged.
// "Footage đã thêm" (panels.js:134-140) and its rows (mediaRow, :506-517): each row drags onto the
// timeline as text/x-ms-media JSON { rel, kind, path }.
import { useMedia } from "@/api/queries.ts";
import type { MediaEntry } from "@/api/types.ts";
import { setMediaDrag } from "@/core/dnd.ts";
import { mss } from "@/core/ui-format.ts";
import { Empty, Fail, Loading } from "@/shell/states.tsx";

export const KIND_VI: Record<string, string> = { video: "Video", audio: "Âm thanh", image: "Ảnh" };

export function MediaRow({ m }: { m: MediaEntry }) {
  const file = String(m.rel ?? m.path ?? "").split("/").pop();
  const meta = [
    KIND_VI[m.kind ?? ""] ?? m.kind,
    Number.isFinite(m.duration) ? mss(m.duration) : null,
    m.width && m.height ? `${m.width}×${m.height}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div
      className="flex cursor-grab flex-col gap-0.5 rounded-md border border-border bg-panel-2 px-2.5 py-2"
      draggable
      title="Kéo vào timeline"
      data-media-row=""
      onDragStart={(e) => setMediaDrag(e, { rel: m.rel ?? null, kind: m.kind ?? null, path: m.path ?? null })}
    >
      <span className="truncate text-sm" title={m.rel ?? m.path ?? undefined}>{file}</span>
      <small className="text-xs text-muted-foreground tabular-nums">{meta}</small>
    </div>
  );
}

export function Registered({ name }: { name: string }) {
  const { data, error, isPending } = useMedia(name);
  if (error) return <Fail error={error} />;
  if (isPending) return <Loading />;
  if (!data.length) return <Empty text="Chưa có footage. Chọn file bên dưới." />;
  return <div className="flex flex-col gap-1.5">{data.map((m, i) => <MediaRow key={m.rel ?? m.path ?? i} m={m} />)}</div>;
}
