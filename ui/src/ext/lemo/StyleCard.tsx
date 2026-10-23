// Port of public/lemo-gallery.js; behaviour unchanged.
// One style of the gallery (styleCard, lemo-gallery.js:98-115): its frame, names, group, line,
// uses, cautions, whether the project uses it, and Áp cho dự án / Đọc STYLE.md / Xem phim mẫu.
// Frames and sample films: LemoLab, CC BY 4.0 (github.com/lemomo-ai/lemo-opuscar).
import { Button } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { applyStyle, modeText, safeUrl, showGuide, useLemo, type LemoProject, type LemoStyle } from "./store.ts";

// Short warnings a card shows before its apply button.
export function cautions(style: LemoStyle, project: LemoProject | null | undefined): string[] {
  const out: string[] = [];
  if (style.layer && project?.vertical) out.push("Lớp canvas chỉ vẽ cho khung 16:9; bản dọc cần scene riêng.");
  if (style.kind === "3d") out.push("Phong cách 3D: render chậm khoảng 5 lần.");
  return out;
}

export function StyleCard({ style, project, name, hasManifest }: { style: LemoStyle; project: LemoProject | null | undefined; name: string | null; hasManifest: boolean }) {
  const busy = useLemo((s) => s.busy);
  const mode = style.layer ? "layer" : "grammar";
  const tag = style.source === "mine" ? "Của bạn" : style.layer ? "Lớp canvas" : "Theo ngữ pháp";
  const current = project?.project?.slug === style.slug;
  const meta = [style.en, style.cn, style.nhom, style.based_on && `dựa trên ${style.base_ten ?? style.based_on}`].filter(Boolean).join(" · ");
  return (
    <div data-slug={style.slug} data-testid="lemo-card" className={cn("flex flex-col gap-1.5 rounded-md border bg-panel-2 p-2", current ? "border-primary" : "border-border")}>
      {style.frame ? (
        <img className="aspect-video w-full rounded-sm bg-background object-cover" src={style.frame} alt="" loading="lazy" width={800} height={450} />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-sm bg-background text-xs text-muted-foreground">{style.en || style.slug}</div>
      )}
      <div className="flex items-baseline justify-between gap-1.5">
        <strong className="text-sm">{style.ten}</strong>
        <span
          className={cn("shrink-0 rounded-sm border px-1.5 text-xs", style.layer ? "border-ok text-ok" : "border-border text-muted-foreground")}
          title={style.layer ? "Studio thêm được thành lớp canvas" : "Đạo diễn dựng bằng composition HyperFrames theo STYLE.md"}
        >
          {tag}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{meta}</span>
      {style.line ? <p className="m-0 text-sm">{style.line}</p> : null}
      {style.uses?.length ? <p className="m-0 text-xs text-muted-foreground">{`Hợp với: ${style.uses.join(", ")}`}</p> : null}
      {cautions(style, project).map((t) => <p key={t} className="m-0 text-xs text-warn">{t}</p>)}
      {current ? <p className="m-0 text-xs text-muted-foreground">{`Đang dùng cho dự án (${modeText(project?.project?.mode ?? "")})`}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="primary"
          disabled={!hasManifest || busy}
          title={hasManifest ? "" : "Mở một dự án có project.json trước"}
          onClick={() => { void applyStyle({ name, hasManifest, style, mode }); }}
        >
          Áp cho dự án
        </Button>
        {style.guide ? <Button onClick={() => { void showGuide(style); }}>Đọc STYLE.md</Button> : null}
        {safeUrl(style.film_url) ? (
          <a className="text-sm text-primary hover:underline" href={style.film_url} target="_blank" rel="noopener noreferrer">Xem phim mẫu ↗</a>
        ) : null}
      </div>
    </div>
  );
}
