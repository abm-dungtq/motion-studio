// Port of public/fx-gallery.js; behaviour unchanged.
// "Thư viện chuyển cảnh" for one shot: GET /api/fx/catalog (seams of the provider, Studio packs,
// HyperFrames transitions; banned seams are never in it) with a source label, a filter and source
// chips. A picked Studio pack plays its preview in a sandboxed iframe (scripts only, never the
// page's origin); the others show their description and where their recipe lives. "Áp dụng cho
// shot" POSTs /api/fx/apply-transition: transition_in of the shot, then a director request naming
// the recipe. The manifest and the request queue refresh through the write's invalidation and SSE.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { fxApplyTransition, useFxCatalog } from "@/api/queries.ts";
import type { Manifest, Shot } from "@/api/types.ts";
import { Button, Input } from "@/shell/controls.tsx";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";
import { useFx } from "./fx-store.ts";

export const SOURCE_VI: Record<string, string> = { provider: "Provider", studio: "Studio", hyperframes: "HyperFrames" };
const ENERGY_VI: Record<string, string> = { em: "Êm", vua: "Vừa", "don-dap": "Dồn dập" };
const SOURCES = ["", "provider", "studio", "hyperframes"] as const;

export interface FxItem {
  id: string;
  name: string;
  description?: string | null;
  sources: string[];
  source?: string;
  soft?: boolean;
  kind?: string;
  energy?: string[];
  duration?: number | null;
  preview?: string | null;
  recipe?: string | null;
  doc?: string | null;
  pair_seam?: string | null;
  [k: string]: unknown;
}
export interface FxCatalog { items: FxItem[]; counts: Record<string, number>; [k: string]: unknown }

const Title = ({ children }: { children: string }) => <h3 className="m-0 text-sm font-semibold">{children}</h3>;

export function Gallery({ shot, m }: { shot: Shot; m: Manifest }) {
  const { data, error, isPending } = useFxCatalog();
  return (
    <section className="flex flex-col gap-2" aria-label="Thư viện chuyển cảnh">
      {error ? (
        <>
          <Title>Thư viện chuyển cảnh</Title>
          <p className="m-0 text-sm text-danger">{`Không đọc được thư viện: ${error.message}`}</p>
        </>
      ) : isPending || !data ? (
        <>
          <Title>Thư viện chuyển cảnh</Title>
          <p className="m-0 text-sm text-muted-foreground">Đang tải…</p>
        </>
      ) : (
        <GalleryView cat={data as FxCatalog} shot={shot} m={m} />
      )}
    </section>
  );
}

function GalleryView({ cat, shot, m }: { cat: FxCatalog; shot: Shot; m: Manifest }) {
  const { q, source, picked } = useFx((s) => s.gallery);
  const setGallery = useFx((s) => s.setGallery);
  const items = Array.isArray(cat.items) ? cat.items : [];
  const counts = cat.counts ?? {};
  const needle = q.toLowerCase().trim();
  const shown = items.filter((i) => (!source || (i.sources ?? []).includes(source)) && (!needle || [i.id, i.name, i.description].some((s) => String(s ?? "").toLowerCase().includes(needle))));
  const pickedItem = items.find((i) => i.id === picked) ?? null;

  return (
    <>
      <Title>{`Thư viện chuyển cảnh (${items.length})`}</Title>
      <p className="m-0 text-sm text-muted-foreground">{`Shot ${shot.id} đang dùng: ${shot.transition_in || "(không)"}`}</p>
      <Input type="search" value={q} placeholder="Tìm: zoom, glitch, mực…" aria-label="Tìm chuyển cảnh" onChange={(e) => setGallery({ q: e.target.value })} />
      <div className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => {
          const on = s === source;
          return (
            <Button key={s || "all"} data-src={s} aria-pressed={on} className={cn("h-7 px-2.5 font-medium", on && "border-primary bg-primary/15 text-primary")} onClick={() => setGallery({ source: s })}>
              {s ? `${SOURCE_VI[s]} (${counts[s] ?? 0})` : "Tất cả"}
            </Button>
          );
        })}
      </div>
      <div role="listbox" aria-label="Chuyển cảnh" className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5">
        {shown.length ? shown.map((i) => {
          const on = i.id === picked, cur = i.id === shot.transition_in;
          return (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={on}
              title={i.description ?? i.id}
              className={cn("flex flex-col items-start gap-0.5 rounded-md border border-border bg-panel px-2 py-1.5 text-left text-foreground hover:border-muted-foreground", on && "border-primary bg-primary/15")}
              onClick={() => setGallery({ picked: i.id })}
            >
              <span className="text-sm font-semibold">{i.name}{cur ? <span className="text-primary">{" ●"}</span> : null}</span>
              <span className="flex flex-wrap items-center gap-1 text-[11px]">
                <code className="text-muted-foreground">{i.id}</code>
                {(i.sources ?? []).map((s) => (
                  <span key={s} className={cn("rounded-full border border-border px-1.5 text-muted-foreground", s === "studio" && "border-primary text-primary")}>{SOURCE_VI[s]}</span>
                ))}
                {i.soft ? <span className="rounded-full border border-border px-1.5 text-muted-foreground italic" title="Chỉ hợp hướng cho phép chuyển cảnh mềm">mềm</span> : null}
                {cur ? <span className="rounded-full border border-border px-1.5 text-muted-foreground italic">đang dùng</span> : null}
              </span>
            </button>
          );
        }) : <p className="m-0 text-sm text-muted-foreground">Không có chuyển cảnh nào khớp</p>}
      </div>
      <Detail item={pickedItem} shot={shot} m={m} />
    </>
  );
}

function Detail({ item: i, shot, m }: { item: FxItem | null; shot: Shot; m: Manifest }) {
  const name = useStudio((s) => s.name);
  const [busy, setBusy] = useState(false);
  const box = "flex flex-col gap-1.5 rounded-md border border-dashed border-border bg-background p-2 text-sm";
  if (!i) return <div className={box}><p className="m-0 text-muted-foreground">Chọn một chuyển cảnh để xem.</p></div>;
  const ro = !m.capabilities?.editable;
  const meta = [i.kind, ...(i.energy ?? []).map((e) => ENERGY_VI[e] ?? e), i.duration ? `${i.duration}s` : null].filter(Boolean).join(" · ");

  async function apply() {
    if (!name || !i) return;
    setBusy(true);
    const r = await fxApplyTransition({ name, shot: shot.id, id: i.id, base: m.version });
    setBusy(false);
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    say(r.data?.message ?? `Đã đặt ${i.id} cho ${shot.id} và nhờ đạo diễn gắn vào HTML`);
  }

  return (
    <div className={box}>
      <strong>{i.name}</strong>
      {meta ? <small className="text-muted-foreground">{meta}</small> : null}
      {i.description ? <p className="m-0">{i.description}</p> : null}
      {i.preview ? <iframe className="aspect-[16/10] w-full rounded-md border-0 bg-stage" src={i.preview} title={`Xem thử ${i.id}`} sandbox="allow-scripts" loading="lazy" /> : null}
      {i.recipe ? <small className="break-all text-muted-foreground" title={i.recipe}>{`Recipe: ${i.recipe}`}</small>
        : i.doc ? <small className="break-all text-muted-foreground" title={i.doc}>{`Tài liệu: ${i.doc}`}</small>
          : i.source === "provider" ? <small className="text-muted-foreground">Recipe do recipe pack của provider gom khi PLAN.md ghi seam này.</small> : null}
      {i.pair_seam && i.pair_seam !== i.id ? <small className="text-muted-foreground">{`PLAN.md ghi seam: ${i.pair_seam}`}</small> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={ro || busy} onClick={() => { void apply(); }}>Áp dụng cho shot</Button>
        {ro ? <small className="text-muted-foreground">Dự án chỉ xem</small> : null}
      </div>
    </div>
  );
}
