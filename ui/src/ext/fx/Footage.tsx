// Port of public/fx-footage.js; behaviour unchanged.
// "Sửa clip" for every registered video of the open project (GET /api/media). It sat at the end of
// the media tab before; it is the second part of the fx tab now.
import { useMedia } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { ClipEditor, type ClipSource } from "./ClipEditor.tsx";

const Title = () => <h3 className="m-0 text-sm font-semibold">Sửa clip</h3>;

export function Footage() {
  const name = useStudio((s) => s.name);
  const { data, error, isPending } = useMedia(name);
  if (!name || isPending) return <section className="flex flex-col gap-2"><Title /><p className="m-0 text-sm text-muted-foreground">Đang tải…</p></section>;
  if (error) return <section className="flex flex-col gap-2"><Title /><p className="m-0 text-sm text-danger">{error.message}</p></section>;
  const sources: ClipSource[] = (Array.isArray(data) ? data : [])
    .filter((m) => m.kind === "video")
    .map((m) => ({ value: String(m.rel ?? m.path), label: String(m.rel ?? m.path).split("/").pop() ?? "" }));
  return (
    <section className="flex flex-col gap-2" aria-label="Sửa clip">
      <Title />
      <p className="m-0 text-sm text-muted-foreground">Cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung dọc. Render trước bằng ffmpeg, bản gốc giữ nguyên.</p>
      {sources.length
        ? <ClipEditor editorKey={`media:${name}`} sources={sources} />
        : <p className="m-0 text-sm text-muted-foreground">Chưa có video đã đăng ký. Thêm footage ở trên trước.</p>}
    </section>
  );
}
