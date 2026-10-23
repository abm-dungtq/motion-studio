// Port of public/panels.js:230-315 (the cards of the library view); behaviour unchanged.
// One card per row of GET /api/library, by kind; the toolkit card heads the list; the sources line
// ends it. Every text from the library goes in as a text node.
import type { ReactNode } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { useProject } from "@/api/queries.ts";
import { LIBRARY, nfmt, type LibExample, type LibKind, type LibRow, type LibSource, type LibToolkit } from "@/core/library.ts";
import { clip, safeUrl } from "@/core/ui-format.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { useLibraryStore } from "./store.ts";

const CARD = "flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2.5 text-sm";
const MUTED = "text-xs text-muted-foreground";
const LINK = "text-primary underline-offset-2 hover:underline";

export function copyText(text: unknown): Promise<void> {
  return navigator.clipboard.writeText(String(text ?? "")).then(() => say("Đã chép vào bộ nhớ tạm"), () => say("Trình duyệt không cho chép", true));
}

const thumbSrc = (id: string): string => `/library/thumb/${encodeURIComponent(id)}`;

function Thumb({ id, className = "w-full rounded-sm" }: { id: string; className?: string }) {
  return <img className={`lib-thumb ${className}`} src={thumbSrc(id)} alt="" loading="lazy" />;
}

function More({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-sm bg-background p-2 text-xs whitespace-pre-wrap">{text}</pre>
    </details>
  );
}

function Para({ label, text }: { label?: string; text?: string | null }) {
  if (!text) return null;
  return <p className="m-0 text-xs">{label ? <b>{`${label} `}</b> : null}{text}</p>;
}

function Examples({ list }: { list?: LibExample[] }) {
  const showVideo = useLibraryStore((s) => s.showVideo);
  if (!list?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {list.slice(0, 4).map((x) => (
        <button key={x.id} type="button" title={x.title} onClick={() => showVideo(x.id)} className="flex flex-col gap-1 rounded-sm border border-border p-1 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {x.has_thumb ? <Thumb id={x.id} className="w-full rounded-sm" /> : <span className="block aspect-video w-full rounded-sm bg-background" />}
          <span>{clip(x.title, 40)}</span>
        </button>
      ))}
    </div>
  );
}

function Actions({ kind, row, url }: { kind: LibKind; row: LibRow; url?: string }) {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const src = LIBRARY[kind];
  const copy = src.copy(row);
  const href = safeUrl(url);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!m} title={m ? "Gửi cho đạo diễn của dự án đang mở" : "Mở một dự án trước"} onClick={() => { void actions.direct({ scope: "project", text: src.use(row) }); }}>Dùng cho dự án</Button>
      {copy ? <Button onClick={() => { void copyText(copy); }}>{src.copyLabel}</Button> : null}
      {href ? <a className={`${LINK} text-sm`} href={href} target="_blank" rel="noopener noreferrer" title={href}>Xem bản gốc</a> : null}
    </div>
  );
}

const join = (xs: unknown[]): string => xs.filter(Boolean).join(" · ");

export function LibraryCard({ kind, row }: { kind: LibKind; row: LibRow }) {
  const cats = useLibraryStore((s) => s.cats);
  const title = LIBRARY[kind].title(row);
  let body: ReactNode;
  if (kind === "videos") {
    const v = row;
    body = (
      <>
        {v.has_thumb ? <Thumb id={v.id} /> : null}
        <strong>{title}</strong>
        <span className={MUTED}>{join([v.author && `@${v.author}`, cats.find((c) => c.id === v.category)?.vi, v.featured && "Tuyển chọn", v.metrics?.bookmarks && `${nfmt(v.metrics.bookmarks)} lượt lưu`])}</span>
        {v.vi
          ? <><Para text={v.vi.what} /><Para label="Đáng học:" text={v.vi.why} /><Para label="Cách dùng:" text={v.vi.how} /></>
          : <Para text={clip(v.titles?.en ?? v.desc ?? v.summary_zh, 200)} />}
        <More label={v.prompt_partial ? "Xem prompt (bản gốc chỉ công bố một phần)" : "Xem prompt"} text={v.prompt} />
        {v.prompt_en && v.prompt_en !== v.prompt ? <More label="Bản dịch tiếng Anh của prompt" text={v.prompt_en} /> : null}
        {(v.links ?? []).filter((l) => safeUrl(l.url)).map((l, i) => (
          <a key={i} className={`${LINK} text-xs`} href={String(l.url)} target="_blank" rel="noopener noreferrer">{`${l.label} ↗`}</a>
        ))}
        <Actions kind={kind} row={v} url={v.url} />
      </>
    );
  } else if (kind === "scenes") {
    const t = row;
    body = (
      <>
        <strong>{title}</strong>
        {t.source_label ? <span className={MUTED}>{t.source_label}</span> : null}
        <Para text={t.what} />
        <Para label="Dùng khi:" text={t.when} />
        {t.prompt_hint ? <p className="m-0 text-xs"><b>Gợi ý cho prompt: </b><code>{t.prompt_hint}</code></p> : null}
        {t.seams?.length ? <Para label="Chuyển cảnh:" text={t.seams.join(", ")} /> : null}
        <Examples list={t.examples} />
        <Actions kind={kind} row={t} />
      </>
    );
  } else if (kind === "styles") {
    const s = row;
    const first = s.examples?.[0];
    body = (
      <>
        {first?.has_thumb ? <Thumb id={first.id} /> : null}
        <strong>{title}</strong>
        <span className={MUTED}>{join([s.name_en, s.source_label])}</span>
        <Para text={s.what} />
        <Para label="Hợp với:" text={s.when} />
        <More label="Công thức (tiếng Việt)" text={s.recipe_vi} />
        <More label="Công thức gốc để dán vào prompt" text={s.recipe} />
        <Examples list={s.examples} />
        <Actions kind={kind} row={s} />
      </>
    );
  } else {
    const p = row;
    body = (
      <>
        {p.has_thumb ? <Thumb id={p.id} /> : null}
        <strong>{title}</strong>
        <span className={MUTED}>{join([p.kind_vi, p.author && `@${p.author}`, p.metrics?.bookmarks && `${nfmt(p.metrics.bookmarks)} lượt lưu`])}</span>
        <Para text={p.what} />
        <Para label="Cấu trúc:" text={p.structure} />
        <Para label="Chuyển thể:" text={p.adapt} />
        <More label={p.template ? "Xem khung prompt" : "Xem prompt"} text={p.prompt} />
        <Actions kind={kind} row={p} url={p.url} />
      </>
    );
  }
  return <div className={CARD} data-lib-card={kind}>{body}</div>;
}

export function ToolkitCard({ kit }: { kit: LibToolkit | null | undefined }) {
  if (!kit) return null;
  return (
    <div className={CARD} data-lib-card="toolkit">
      <strong>Bộ công cụ đạo diễn</strong>
      <span className={MUTED}>{kit.source ?? ""}</span>
      {kit.workflow?.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Quy trình làm video</summary>
          <ol className="m-0 mt-1 flex list-decimal flex-col gap-1 pl-4">{kit.workflow.map((w, i) => <li key={i}><b>{`${w.title}. `}</b>{w.text}</li>)}</ol>
        </details>
      ) : null}
      {kit.vocabulary?.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Cách góp ý như đạo diễn</summary>
          <ul className="m-0 mt-1 flex list-disc flex-col gap-1 pl-4">{kit.vocabulary.map((w, i) => <li key={i}><b>{`${w.term}: `}</b>{`${w.when} Nói: `}<code>{w.say}</code>{w.say_vi ? ` (${w.say_vi})` : ""}</li>)}</ul>
        </details>
      ) : null}
      {kit.checklist?.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Kiểm tra trước khi render</summary>
          <ul className="m-0 mt-1 flex list-disc flex-col gap-1 pl-4">{kit.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

export function Sources({ list }: { list?: LibSource[] }) {
  return (
    <p className={`m-0 ${MUTED}`}>
      {"Nguồn: "}
      {(list ?? []).map((x, i) => (
        <span key={x.repo}>{i ? ", " : ""}<a className={LINK} href={safeUrl(x.url) ?? undefined} target="_blank" rel="noopener noreferrer">{x.repo}</a>{` (${String(x.license ?? "").split(" ")[0]})`}</span>
      ))}
      . Prompt và video thuộc về tác giả gốc.
    </p>
  );
}
