// Port of public/panels.js:230-315 (the library view); behaviour unchanged.
// The kind switch, the search box (Enter or "Tìm"), the category and "Chỉ mẫu tuyển chọn" filters
// of the video kind, then the pages of GET /api/library: "Xem thêm" asks for the next page and
// the last page ends with the sources line.
import { useEffect, useState } from "react";
import { useLibrary, useProject } from "@/api/queries.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIB_KINDS, LIBRARY, asLibPage, libraryParams } from "@/core/library.ts";
import { cn } from "@/lib/utils";
import { Button, Checkbox, Input } from "@/shell/controls.tsx";
import { Fail, Loading } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { LibraryCard, Sources, ToolkitCard } from "./LibraryCard.tsx";
import { useLibraryStore } from "./store.ts";

// Radix Select needs a non-empty value; this one stands for "Mọi thể loại".
const ALL = "__all";

// One page at `offset`; the last one shown carries the tail ("Xem thêm" or the sources).
function Page({ offset, first, last, onMore }: { offset: number; first: boolean; last: boolean; onMore: (next: number) => void }) {
  const { mode, query, cat, featured, cats, setCats } = useLibraryStore();
  const { data, error, isPending } = useLibrary(libraryParams(mode, query, offset, cat, featured));
  const page = data === undefined ? null : asLibPage(data);
  // The categories come with the first page that has them (panels.js fillCats).
  useEffect(() => { if (page?.categories && !cats.length) setCats(page.categories); }, [page?.categories, cats.length, setCats]);
  if (isPending) return <Loading />;
  if (error || !page) return <Fail error={error} />;
  const src = LIBRARY[mode];
  if (first && !page.items.length) {
    return (
      <>
        <p className="m-0 text-sm text-muted-foreground">{`Không thấy ${src.label.toLowerCase()} nào khớp "${query}". Thử từ khoá ngắn hơn, bỏ dấu, hoặc đổi loại mẫu.`}</p>
        <Sources list={page.sources} />
      </>
    );
  }
  const next = page.offset + page.items.length;
  return (
    <>
      {first ? <p className="m-0 text-xs text-muted-foreground">{`${page.total} mẫu`}</p> : null}
      {first && page.toolkit && !query ? <ToolkitCard kit={page.toolkit} /> : null}
      {page.items.map((row) => <LibraryCard key={`${mode}:${row.id}`} kind={mode} row={row} />)}
      {last ? (next < page.total
        ? <Button className="self-start" onClick={() => onMore(next)}>{`Xem thêm (còn ${page.total - next})`}</Button>
        : <Sources list={page.sources} />) : null}
    </>
  );
}

export function LibraryTab() {
  const { mode, query, cat, featured, cats, setMode, search, setCat, setFeatured } = useLibraryStore();
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const [draft, setDraft] = useState(query);
  const src = LIBRARY[mode];
  // The pages shown for this search; a new search starts again from the first page.
  const searchKey = `${mode}|${query}|${cat}|${featured}`;
  const [more, setMore] = useState<{ key: string; offsets: number[] }>({ key: searchKey, offsets: [0] });
  const offsets = more.key === searchKey ? more.offsets : [0];

  // The box follows a search made elsewhere (a kind switch empties it, an example fills it).
  useEffect(() => { setDraft(query); }, [mode, query]);

  // The filters run the search with what the box holds now, as go() read input.value.
  const go = () => search(draft);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Loại mẫu" className="grid grid-cols-4 gap-1 rounded-md bg-background p-1">
        {LIB_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === mode}
            onClick={() => setMode(k)}
            className={cn("rounded-sm px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", k === mode ? "bg-panel-2 text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {LIBRARY[k].label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input type="search" value={draft} aria-label="Tìm trong thư viện mẫu" placeholder={src.placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        <Button onClick={go}>Tìm</Button>
      </div>
      {mode === "videos" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={cat || ALL} onValueChange={(v) => { setCat(v === ALL ? "" : v); go(); }}>
            <SelectTrigger size="sm" aria-label="Thể loại"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi thể loại</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.vi ?? c.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={featured} onChange={(e) => { setFeatured(e.target.checked); go(); }} />
            Chỉ mẫu tuyển chọn
          </label>
        </div>
      ) : null}
      {m ? null : <p className="m-0 text-xs text-muted-foreground">Chưa mở dự án: vẫn xem và chép prompt được. Mở một dự án để gửi mẫu cho đạo diễn.</p>}
      <div className="flex flex-col gap-2" aria-live="polite">
        {offsets.map((o, i) => (
          <Page key={`${searchKey}|${o}`} offset={o} first={i === 0} last={i === offsets.length - 1} onMore={(next) => setMore({ key: searchKey, offsets: [...offsets, next] })} />
        ))}
      </div>
    </div>
  );
}
