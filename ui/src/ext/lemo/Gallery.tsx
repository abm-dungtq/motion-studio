// Port of public/lemo-gallery.js; behaviour unchanged.
// The "Phong cách" tab (galleryView, lemo-gallery.js:121-161): the user's own styles, the
// provider's style profiles (built as they are), and the lemo-opuscar library (59 code-made film
// styles, github.com/lemomo-ai/lemo-opuscar; frames and films CC BY 4.0 by LemoLab; a canvas layer
// for the verified ones, a STYLE.md to read for the rest), searched, filtered by group and by type,
// and applied to the open project. The profiles and own styles show before the library is fetched.
// STYLE.md is third-party text: the dialog shows it as plain text, never as HTML.
import { useEffect, useRef, useState } from "react";
import { useProject } from "@/api/queries.ts";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, Input } from "@/shell/controls.tsx";
import { Fail, Loading } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { DEBOUNCE_MS, fetchLibrary, safeUrl, useGalleryStyles, useLemo, type LemoCredit, type LemoStyles, type StyleType } from "./store.ts";
import { StyleCard } from "./StyleCard.tsx";
import { tabConfirm } from "./confirm.tsx";

export const SELECT = "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";

export function Credit({ credit }: { credit?: LemoCredit }) {
  return (
    <p className="m-0 mt-2 text-xs text-muted-foreground" data-testid="lemo-credit">
      {`${credit?.text ?? "Ảnh và phim mẫu: LemoLab, CC BY 4.0"}, `}
      {safeUrl(credit?.url) ? (
        <a className="text-primary-ink hover:underline" href={credit.url} target="_blank" rel="noopener noreferrer">{credit.url.replace(/^https:\/\//, "")}</a>
      ) : "github.com/lemomo-ai/lemo-opuscar"}
      {`. Mã và tài liệu: ${credit?.code_license ?? "MIT"}.`}
    </p>
  );
}

// STYLE.md as plain text in a modal dialog (showGuide, lemo-gallery.js:76-88).
function GuideDialog() {
  const viewing = useLemo((s) => s.viewing);
  const close = () => useLemo.getState().setViewing(null);
  return (
    <Dialog open={Boolean(viewing)} onOpenChange={(o) => { if (!o) close(); }}>
      {viewing ? (
        <DialogContent showCloseButton={false} aria-label={`STYLE.md của ${viewing.style.ten}`} className="max-w-[min(820px,92vw)] gap-2 p-3 sm:max-w-[min(820px,92vw)]">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm font-semibold">{`STYLE.md · ${viewing.style.ten}`}</DialogTitle>
            <Button onClick={close}>Đóng</Button>
          </div>
          {viewing.style.source === "library" ? (
            <DialogDescription className="text-sm text-muted-foreground">Văn bản của bên thứ ba (MIT). Chỉ học ngữ pháp hình ảnh, không chép câu chuyện phim mẫu.</DialogDescription>
          ) : <DialogDescription className="sr-only">{`STYLE.md của ${viewing.style.ten}`}</DialogDescription>}
          <pre data-testid="lemo-guide" className="m-0 max-h-[60vh] overflow-auto rounded-sm bg-background p-2 text-xs break-words whitespace-pre-wrap">{viewing.text}</pre>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SearchBox() {
  const q = useLemo((s) => s.q);
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Input
      type="search"
      className="min-w-0 flex-[1_1_180px]"
      value={text}
      placeholder="Tìm: truyện tranh, thuỷ màu, tin tức…"
      aria-label="Tìm phong cách code"
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => useLemo.getState().setQ(v), DEBOUNCE_MS);
      }}
    />
  );
}

const TYPES: { id: StyleType; ten: string }[] = [
  { id: "", ten: "Mọi loại" },
  { id: "ready", ten: "Dựng được ngay" },
  { id: "ref", ten: "Chỉ tham khảo" },
  { id: "mine", ten: "Của bạn" },
];

function Library({ d, name, hasManifest }: { d: LemoStyles; name: string | null; hasManifest: boolean }) {
  const q = useLemo((s) => s.q), group = useLemo((s) => s.group), type = useLemo((s) => s.type);
  const rows = d.rows;
  const mine = rows.filter((r) => r.source === "mine"), prof = rows.filter((r) => r.source === "profile"), lib = rows.filter((r) => r.source === "library");
  const sections = [
    { key: "mine", title: "Của bạn", rows: mine, note: null },
    { key: "profile", title: "Dựng sẵn", rows: prof, note: "Style profile có sẵn màu, chữ, chuyển cảnh và nhịp; áp là dựng được ngay, hợp video có lời và khổ 9:16." },
    { key: "library", title: "Thư viện lemo-opuscar", rows: lib, note: "Lớp canvas dựng được ngay. Thẻ Tham khảo chỉ có STYLE.md: đạo diễn đọc rồi tự dựng theo, phim mẫu là phim 16:9 không lời." },
  ].filter((x) => x.rows.length);
  const card = (r: (typeof rows)[number]) => <StyleCard key={`${r.source}:${r.slug}`} style={r} project={d.project} name={name} hasManifest={hasManifest} />;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <SearchBox />
        <select className={`${SELECT} min-w-0 flex-[0_1_220px]`} aria-label="Nhóm phong cách" value={group} onChange={(e) => useLemo.getState().setGroup(e.target.value)}>
          <option value="">{`Mọi nhóm (${d.groups.length})`}</option>
          {d.groups.map((g) => <option key={g.id} value={g.id}>{`${g.ten} (${g.count})`}</option>)}
        </select>
        <select className={`${SELECT} min-w-0 flex-[0_1_180px]`} aria-label="Loại phong cách" value={type} onChange={(e) => useLemo.getState().setType(e.target.value as StyleType)}>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.ten}</option>)}
        </select>
      </div>
      <p className="m-0 text-sm text-muted-foreground" data-testid="lemo-count">
        {`${rows.length} / ${d.total} phong cách${d.fetched && !d.layer_available ? " · chưa có lệnh lớp canvas, phong cách thư viện chỉ để tham khảo" : ""}`}
      </p>
      {d.warnings?.length ? (
        <details>
          <summary className="cursor-pointer text-sm">{`${d.warnings.length} cảnh báo khi đọc thư viện`}</summary>
          <ul className="m-0 pl-5 text-xs text-muted-foreground">{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5" aria-live="polite" data-testid="lemo-grid">
        {sections.map((x) => [
          <div key={`h:${x.key}`} className="col-span-full mt-1.5 flex flex-col gap-0.5" data-testid={`lemo-section-${x.key}`}>
            <h3 className="m-0 text-sm font-semibold">{`${x.title} (${x.rows.length})`}</h3>
            {x.note ? <p className="m-0 text-xs text-muted-foreground">{x.note}</p> : null}
          </div>,
          ...x.rows.map(card),
        ])}
        {rows.length ? null : <p className="col-span-full m-0 text-sm text-muted-foreground">{q || group || type ? `Không có phong cách nào khớp${q ? ` "${q}"` : " bộ lọc này"}. Thử từ khoá ngắn hơn, bỏ dấu hoặc đổi bộ lọc.` : "Chưa có phong cách nào."}</p>}
      </div>
      <Credit credit={d.credit} />
    </>
  );
}

export function Gallery() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const hasManifest = Boolean(m);
  const fetching = useLemo((s) => s.fetching);
  const query = useGalleryStyles(name);
  const { refetch: retry } = query;
  // The last answer stays on screen when a later search fails, as the old store kept s.data.
  const last = useRef<{ name: string | null; d: LemoStyles } | null>(null);
  if (query.data) last.current = { name, d: query.data };
  const d = query.data ?? (last.current?.name === name ? last.current.d : undefined);

  let body;
  if (!d && query.error) {
    body = (
      <>
        <Fail error={query.error} />
        <div><Button onClick={() => { void retry(); }}>Thử lại</Button></div>
      </>
    );
  } else if (!d) {
    body = <Loading />;
  } else {
    body = (
      <>
        {d.fetched ? null : (
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground" data-testid="lemo-fetch">
            <p className="m-0">Thư viện lemo-opuscar (59 phong cách phim dựng bằng code, phần lớn để tham khảo) chưa có trên máy. Tải một lần (khoảng 5 MB: ảnh khung, STYLE.md, DEMO.md; không tải mã chạy được).</p>
            <Button disabled={fetching} onClick={() => { void fetchLibrary(); }}>{fetching ? "Đang tải…" : "Tải thư viện (≈ 5 MB)"}</Button>
          </div>
        )}
        <Library d={d} name={name} hasManifest={hasManifest} />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-2.5" data-testid="lemo-gallery">
      {body}
      <GuideDialog />
      <tabConfirm.ConfirmHost />
    </div>
  );
}
