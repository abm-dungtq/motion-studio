// Port of public/lemo-mystyle.js; behaviour unchanged.
// "Phong cách riêng" at the end of the Phong cách tab, after lemo-opuscar's MY-STYLES.md
// (github.com/lemomo-ai/lemo-opuscar, MIT): ask the director to draft a style in the project's
// lemo-style/ (from a library style or a blank page), see its style frame and CHANGES.md, and keep
// it in the own-styles folder. Only the "Giữ phong cách" button keeps a style.
import { useRef } from "react";
import { lemoDraft, lemoKeep, useProject } from "@/api/queries.ts";
import { say } from "@/api/client.ts";
import { Button, Input, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { SELECT } from "./Gallery.tsx";
import { reloadStyles, useAllStyles, useLemo } from "./store.ts";

const fileUrl = (name: string, rel: string) => `/p/${encodeURIComponent(name)}/${rel.split("/").map(encodeURIComponent).join("/")}`;

export function MyStyle() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const busy = useLemo((s) => s.busy);
  const { data: d, dataUpdatedAt } = useAllStyles(name);
  const base = useRef<HTMLSelectElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const desc = useRef<HTMLTextAreaElement>(null);
  if (!d) return null;

  const head = <h3 className="m-0 text-sm font-semibold">Phong cách riêng</h3>;
  if (!name || !m) {
    return (
      <div className="flex flex-col gap-2" data-testid="lemo-mine">
        {head}
        <p className="m-0 text-sm text-muted-foreground">{"Mở một dự án để tạo phong cách riêng. Phong cách đã giữ nằm ở " + (d.my_dir ?? "~/lemo-my-styles") + "."}</p>
      </div>
    );
  }

  const draft = d.project?.draft;
  const s = draft?.style;
  const keep = async () => {
    if (!s) return;
    if (!window.confirm(`Giữ "${s.en || s.slug}" vào ${d.my_dir}/${s.slug}/? Thư mục đã có thì không ghi đè.`)) return;
    const r = await lemoKeep({ name });
    if (r.status === 200) say(`Đã giữ phong cách ở ${r.data?.dir}${r.data?.frame === "styleframe.png" ? " (chưa có ffmpeg nên khung giữ dạng PNG)" : ""}`);
    else say(r.error ?? `Lỗi ${r.status}`, true);
    await reloadStyles();
  };
  const ask = async () => {
    const v = base.current?.value ?? "";
    const [source, slug] = v ? v.split(":") : [null, null];
    const r = await lemoDraft({ name, base: slug, source, title: title.current?.value ?? "", description: desc.current?.value ?? "" });
    if (r.status === 200) say("Đã gửi yêu cầu tạo phong cách riêng cho đạo diễn"); else say(r.error ?? `Lỗi ${r.status}`, true);
  };
  const rows = d.rows.filter((r) => r.guide);

  return (
    <div className="flex flex-col gap-2" data-testid="lemo-mine">
      {head}
      {draft ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2">
          <strong className="text-sm">{s ? `Bản nháp: ${s.en || s.cn || s.slug} (${s.slug})` : "Bản nháp trong lemo-style/ có style.json hỏng"}</strong>
          {s?.based_on ? <span className="text-xs text-muted-foreground">{`Dựa trên ${s.based_on}`}</span> : null}
          {s?.line ? <p className="m-0 text-sm">{s.line}</p> : null}
          {draft.frame ? (
            <img className="aspect-video w-full rounded-sm bg-background object-cover" src={`${fileUrl(name, draft.frame)}?v=${dataUpdatedAt}`} alt="Khung phong cách" />
          ) : <p className="m-0 text-xs text-muted-foreground">Chưa có khung phong cách (ảnh PNG hoặc styleframe.jpg trong lemo-style/).</p>}
          {draft.frame_note ? <p className="m-0 text-xs text-warn">{draft.frame_note}</p> : null}
          {draft.changes ? (
            <details open>
              <summary className="cursor-pointer text-sm">CHANGES.md</summary>
              <pre data-testid="lemo-changes" className="m-0 max-h-[60vh] overflow-auto rounded-sm bg-background p-2 text-xs break-words whitespace-pre-wrap">{draft.changes}</pre>
            </details>
          ) : null}
          <div className="flex gap-1.5">
            <Button variant="primary" disabled={!draft.valid || !draft.has_guide || busy} title={draft.has_guide ? "" : "Cần lemo-style/STYLE.md"} onClick={() => { void keep(); }}>
              Giữ phong cách
            </Button>
          </div>
        </div>
      ) : null}
      <details open={!draft}>
        <summary className="cursor-pointer text-sm">{draft ? "Tạo bản nháp khác" : "Tạo phong cách riêng"}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p className="m-0 text-sm text-muted-foreground">Đạo diễn hỏi bạn từng câu bằng thẻ, viết STYLE.md, CHANGES.md và khung phong cách trong lemo-style/ của dự án. Bấm Giữ phong cách khi đã ưng.</p>
          <select ref={base} className={`${SELECT} w-full`} aria-label="Phong cách gốc" defaultValue="">
            <option value="">Từ trang trắng</option>
            {rows.map((r) => <option key={`${r.source}:${r.slug}`} value={`${r.source}:${r.slug}`}>{`${r.source === "mine" ? "★ " : ""}${r.ten}`}</option>)}
          </select>
          <Input ref={title} placeholder="Tên phong cách (tuỳ chọn)" maxLength={120} aria-label="Tên phong cách" />
          <Textarea ref={desc} placeholder="Muốn phong cách trông thế nào, dùng cho phim gì…" maxLength={2000} aria-label="Mô tả phong cách" className="min-h-[72px]" />
          <div>
            <Button disabled={!d.fetched} title={d.fetched ? "" : "Tải thư viện trước"} onClick={() => { void ask(); }}>Nhờ đạo diễn tạo</Button>
          </div>
        </div>
      </details>
    </div>
  );
}
