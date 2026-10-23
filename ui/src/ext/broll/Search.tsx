// Port of public/broll-search.js; behaviour unchanged.
// "Tìm trong footage" at the end of the media tab (ext-broll.js:11 and searchPanel,
// broll-search.js:37-70): typing searches after 250 ms, a new shot size at once; the results
// stay until the next answer. Below it the "Phân tích footage" box (Analyse.tsx).
import { useEffect, useRef } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brollSearchQuery } from "@/api/queries.ts";
import { Input } from "@/shell/controls.tsx";
import { Analyse } from "./Analyse.tsx";
import { FormError, HitCard, type BrollHit } from "./HitCard.tsx";
import { useBroll } from "./store.ts";

export const DEBOUNCE_MS = 250;
export const KINDS = ["", "toàn", "trung", "cận", "đặc tả", "flycam", "khác"];
// The Select cannot hold an empty value: "every size" goes through this one.
const ALL = "__all__";

export function Search() {
  const { q, searched, kind, setQ, setSearched, setKind } = useBroll();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const { data, error } = useQuery({ ...brollSearchQuery({ q: searched, kind, limit: 40 }), placeholderData: keepPreviousData });
  const items = (data as { items?: BrollHit[] } | undefined)?.items;

  const onInput = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSearched(v), DEBOUNCE_MS);
  };
  const onKind = (v: string) => {
    clearTimeout(timer.current);
    setKind(v === ALL ? "" : v);
    setSearched(useBroll.getState().q);
  };

  let grid;
  if (error) grid = <FormError text={error.message} />;
  else if (!items) grid = <p className="m-0 text-sm text-muted-foreground">Đang tìm…</p>;
  else if (!items.length) grid = <p className="m-0 text-sm text-muted-foreground">{q ? "Không có đoạn nào khớp." : "Chưa có footage nào được phân tích."}</p>;
  else grid = items.map((x, i) => <HitCard key={`${x.sha256 ?? x.path}:${x.start}:${i}`} x={x} />);

  return (
    <div className="flex min-w-0 flex-col gap-2 [contain:inline-size]">
      <h3 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tìm trong footage</h3>
      <div className="flex gap-1.5">
        <Input type="search" value={q} placeholder="Tìm footage: biển, kiếm, phố đêm… (có dấu hay không đều được)" aria-label="Tìm footage" maxLength={200} onChange={(e) => onInput(e.target.value)} />
        <Select value={kind || ALL} onValueChange={onKind}>
          <SelectTrigger aria-label="Cỡ cảnh" size="sm" className="h-8 shrink-0 border-border bg-panel-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => <SelectItem key={k || ALL} value={k || ALL}>{k || "mọi cỡ cảnh"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" role="list" aria-label="Kết quả tìm footage">{grid}</div>
      <Analyse />
    </div>
  );
}
