// Port of public/lemo-gallery.js; behaviour unchanged.
// One style of the gallery (styleCard, lemo-gallery.js:98-115): its frame, names, group, line,
// uses, cautions, whether the project uses it, and Áp cho dự án / Đọc STYLE.md (Xem hồ sơ for a
// style profile) / Xem phim mẫu.
// Frames and sample films: LemoLab, CC BY 4.0 (github.com/lemomo-ai/lemo-opuscar).
import { Button } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { applyStyle, modeOf, modeText, safeUrl, showGuide, tagOf, useLemo, type LemoProject, type LemoStyle } from "./store.ts";
import { tabConfirm } from "./confirm.tsx";

// Short warnings a card shows before its apply button.
export function cautions(style: LemoStyle, project: LemoProject | null | undefined): string[] {
  const out: string[] = [];
  if (style.layer && project?.vertical) out.push("Lớp canvas chỉ vẽ cho khung 16:9; bản dọc cần scene riêng.");
  if (style.kind === "3d") out.push("Phong cách 3D: render chậm khoảng 5 lần.");
  return out;
}

// "Hợp với" only helps when it says something: a list of bare slugs is noise.
export const usesText = (uses?: string[] | null): string | null =>
  uses?.length && !uses.every((u) => /^[a-z0-9-]+$/.test(u)) ? `Hợp với: ${uses.join(", ")}` : null;

export function StyleCard({ style, project, name, hasManifest, shots = 0 }: { style: LemoStyle; project: LemoProject | null | undefined; name: string | null; hasManifest: boolean; shots?: number }) {
  const busy = useLemo((s) => s.busy);
  const mode = modeOf(style);
  const tag = tagOf(style);
  const current = project?.project?.slug === style.slug && (project?.project?.mode === "profile") === (style.source === "profile");
  // The English name is on the frame placeholder when there is no frame; the tag already says Dựng sẵn.
  const meta = [style.frame ? style.en : null, style.cn, style.source === "profile" ? null : style.nhom, style.based_on && `dựa trên ${style.base_ten ?? style.based_on}`].filter(Boolean).join(" · ");
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
          className={cn("shrink-0 rounded-sm border px-1.5 text-xs", tag.ready ? "border-ok text-ok" : "border-border text-muted-foreground")}
          title={tag.title}
        >
          {tag.text}
        </span>
      </div>
      {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      {style.line ? <p className="m-0 text-sm">{style.line}</p> : null}
      {usesText(style.uses) ? <p className="m-0 text-xs text-muted-foreground">{usesText(style.uses)}</p> : null}
      {cautions(style, project).map((t) => <p key={t} className="m-0 text-xs text-warn">{t}</p>)}
      {current ? <p className="m-0 text-xs text-muted-foreground">{`Đang dùng cho dự án (${modeText(project?.project?.mode ?? "")})`}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="primary"
          disabled={!hasManifest || busy}
          aria-label={`Áp ${style.ten} cho dự án`}
          aria-describedby={hasManifest ? undefined : `lemo-why-${style.source}-${style.slug}`}
          onClick={() => { void applyStyle({ name, hasManifest, style, mode, shots, ask: tabConfirm.ask }); }}
        >
          Áp cho dự án
        </Button>
        {style.guide || style.source === "profile" ? <Button data-guide={style.slug} onClick={() => { void showGuide(style); }}>{style.source === "profile" ? "Xem hồ sơ" : "Đọc STYLE.md"}</Button> : null}
        {safeUrl(style.film_url) ? (
          <a className="text-sm text-primary-ink hover:underline" href={style.film_url} target="_blank" rel="noopener noreferrer">Xem phim mẫu ↗</a>
        ) : null}
      </div>
      {hasManifest ? null : <p id={`lemo-why-${style.source}-${style.slug}`} className="m-0 text-xs text-muted-foreground">Mở một dự án có project.json trước.</p>}
    </div>
  );
}
