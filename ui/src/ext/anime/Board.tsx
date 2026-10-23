// Port of public/anime-board.js; behaviour unchanged.
// The shot board: one column per stage (no plate, plate, pose variants, animated; GET
// /api/anime/board derives them from files), a card per shot with its plate as thumbnail. Picking a
// shot emits "anime:shot" and, when the project is open in the timeline, selects that shot and seeks
// to its start. The picked shot shows its plates and variants and the "Sinh biến thể tư thế" form
// (POST /api/anime/variant, one image of quota).
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { animeVariant, useAnime, useProject } from "@/api/queries.ts";
import { bus } from "@/core/bus.ts";
import { cn } from "@/lib/utils";
import { Button, Checkbox, Input, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { ask } from "./confirm.tsx";
import { Field, Log, NativeSelect, Tag, muted } from "./parts.tsx";
import { reload, useAnimeStore, type VariantForm } from "./store.ts";
import { useJobView } from "./useJob.ts";
import { isLive, type Board as BoardData, type BoardShot } from "./types.ts";

export const STATUS_HINT: Record<string, string> = { missing: "chưa có ảnh nào tên <shot>-*.png trong assets/plates/", plate: "có plate, chưa có biến thể", variants: "có biến thể, chưa có track trong manifest", animated: "đã có track hoạt hình" };

export const projectSrc = (name: string, rel: string): string => `/p/${encodeURIComponent(name)}/${rel.split("/").map(encodeURIComponent).join("/")}`;

export function Board() {
  const name = useStudio((s) => s.name) as string;
  const q = useAnime("board", name);
  const pick = useAnimeStore((s) => s.pick);
  const { data: m } = useProject(name);
  const b = q.data as BoardData | undefined;

  if (q.error) return <p className="m-0 p-3 text-sm text-muted-foreground">{`Không tải được shot board: ${q.error.message}`}</p>;
  if (!b) return <p className={muted}>Đang tải…</p>;

  function pickShot(s: BoardShot) {
    useAnimeStore.getState().pickShot(s.id);
    bus.emit("anime:shot", s);
    if (m?.shots?.some((x) => x.id === s.id)) {
      actions.pick("shot", s.id);
      actions.transport.seek(s.start);
    }
  }

  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {b.note ? <Tag warn>{b.note}</Tag> : null}
      <Button onClick={() => void reload(name, "board")}>Tải lại</Button>
    </div>
  );
  if (!b.shots.length) {
    return (
      <>
        {head}
        <div className="p-3 text-sm text-muted-foreground"><p className="m-0">Chưa có shot nào. Nhập dự án (project.json) hoặc thêm stack vào assets/anim/manifest.json ở mục Hoạt hình.</p></div>
      </>
    );
  }
  const picked = b.shots.find((s) => s.id === pick);
  return (
    <>
      {head}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-start gap-2">
        {b.columns.map((c) => {
          const shots = b.shots.filter((s) => s.status === c.id);
          return (
            <section key={c.id} data-col={c.id} className="flex min-w-0 flex-col gap-1.5 rounded-md bg-panel-2 p-1.5">
              <h3 className="m-0 text-xs font-semibold">{`${c.label} `}<span className="text-muted-foreground">{String(shots.length)}</span></h3>
              {shots.map((s) => <Card key={s.id} name={name} s={s} on={pick === s.id} onPick={() => pickShot(s)} />)}
            </section>
          );
        })}
      </div>
      {picked ? <Detail key={picked.id} name={name} b={b} s={picked} /> : <p className={muted}>Bấm một shot để xem ảnh và sinh biến thể tư thế.</p>}
    </>
  );
}

function Card({ name, s, on, onPick }: { name: string; s: BoardShot; on: boolean; onPick: () => void }) {
  const meta = [`${s.plates.length} plate`, `${s.variants.length} biến thể`, s.tracks ? `${s.tracks} track` : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      title={STATUS_HINT[s.status]}
      aria-pressed={on}
      onClick={onPick}
      className={cn("flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-left text-xs text-foreground hover:border-primary", on && "border-primary ring-2 ring-primary/30")}
    >
      {s.thumb
        ? <img src={projectSrc(name, s.thumb)} alt="" loading="lazy" className="aspect-video w-full rounded object-cover" />
        : <div className="grid aspect-video w-full place-items-center rounded bg-background text-[11px] text-muted-foreground">không có ảnh</div>}
      <strong>{s.id}{s.name ? ` · ${s.name}` : ""}</strong>
      <small className="truncate text-muted-foreground">{meta}</small>
    </button>
  );
}

function Strip({ name, list }: { name: string; list: string[] }) {
  if (!list.length) return <p className={muted}>không có</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
      {list.map((rel) => (
        <figure key={rel} className="m-0 flex min-w-0 flex-col gap-0.5">
          <img src={projectSrc(name, rel)} alt={rel} loading="lazy" className="aspect-video w-full rounded bg-background object-contain" />
          <figcaption className="truncate text-[11px] text-muted-foreground">{rel.split("/").pop()}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const H4 = "m-0 mt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

// The form keeps its values in the store (per picked shot), so a board reload keeps them.
function Detail({ name, b, s }: { name: string; b: BoardData; s: BoardShot }) {
  const chars = (b.chars ?? []).filter((c) => c.exists);
  const images = [...s.variants, ...s.plates];
  const stored = useAnimeStore((st) => st.form);
  const f: VariantForm = stored ?? { base: s.variants.find((x) => /-base\.png$/.test(x)) ?? images[0] ?? "", chars: [], kind: "edit", change: "", out_name: `${s.id}-v1`, sim: 0.18, blend: 0.06, edge: false };
  const set = (patch: Partial<VariantForm>) => useAnimeStore.getState().setForm({ ...(useAnimeStore.getState().form ?? f), ...patch });
  const job = useJobView("variant");
  const running = Boolean(job && isLive(job.job));

  async function submit() {
    if (!f.base) return say("Chọn ảnh gốc", true);
    if (!f.change.trim()) return say("Ghi thay đổi cần làm", true);
    if (!(await ask(`Sinh một ảnh bằng agent sinh ảnh (tốn 1 ảnh quota) cho ${s.id} → ${f.out_name}.png?`))) return;
    const r = await animeVariant({ name, shot: s.id, base: f.base, chars: f.chars, kind: f.kind, change: f.change, out_name: f.out_name, sim: Number(f.sim), blend: Number(f.blend), edge: f.edge });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    if (r.data?.job) useAnimeStore.getState().follow("variant", r.data.job);
  }

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-2">
      <h3 className="m-0 text-sm font-semibold">{`Shot ${s.id}`}<span className="font-normal text-muted-foreground">{` · ${STATUS_HINT[s.status]}`}</span></h3>
      {s.stacks.length ? <p className={muted}>{`Stack trong manifest: ${s.stacks.join(", ")}`}</p> : null}
      <h4 className={H4}>Biến thể</h4>
      <Strip name={name} list={s.variants} />
      <h4 className={H4}>Plate</h4>
      <Strip name={name} list={s.plates} />
      <h4 className={H4}>Sinh biến thể tư thế</h4>
      <Field label="Ảnh gốc">
        <NativeSelect value={f.base} onChange={(e) => set({ base: e.target.value })}>
          {images.map((rel) => <option key={rel} value={rel}>{rel}</option>)}
        </NativeSelect>
      </Field>
      {chars.length ? (
        <Field label="Sheet nhân vật đính kèm">
          <div className="flex flex-wrap gap-2">
            {chars.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 text-sm">
                <Checkbox aria-label={c.name} checked={f.chars.includes(c.id)} onChange={(e) => set({ chars: e.target.checked ? [...f.chars, c.id] : f.chars.filter((x) => x !== c.id) })} />
                {c.name}
              </span>
            ))}
          </div>
        </Field>
      ) : <p className={muted}>Chưa có sheet nhân vật (mục Nhân vật).</p>}
      <Field label="Kiểu">
        <NativeSelect value={f.kind} onChange={(e) => set({ kind: e.target.value as VariantForm["kind"] })}>
          <option value="edit">Sửa một chi tiết, giữ tư thế</option>
          <option value="pose">Vẽ lại ở tư thế mới</option>
        </NativeSelect>
      </Field>
      <Field label="Thay đổi (tiếng Anh cho agent)">
        <Textarea rows={3} value={f.change} placeholder="mouth half open, eyes unchanged" onChange={(e) => set({ change: e.target.value })} />
      </Field>
      <Field label="Tên file">
        <Input value={f.out_name} onChange={(e) => set({ out_name: e.target.value.trim() })} />
      </Field>
      <details>
        <summary className="cursor-pointer text-sm">Tách nền</summary>
        <div className="mt-1.5 flex flex-col gap-2">
          <Field label="sim (độ giống màu nền)">
            <Input type="number" step="0.01" min="0.01" max="1" value={String(f.sim)} onChange={(e) => set({ sim: e.target.value })} />
          </Field>
          <Field label="blend (mép mềm)">
            <Input type="number" step="0.01" min="0" max="1" value={String(f.blend)} onChange={(e) => set({ blend: e.target.value })} />
          </Field>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <Checkbox checked={f.edge} onChange={(e) => set({ edge: e.target.checked })} />
            Despill chỉ ở viền (giữ màu áo quần bên trong)
          </label>
        </div>
      </details>
      <div className="flex gap-2">
        <Button variant="primary" disabled={running || !images.length} onClick={() => void submit()}>{running ? "Đang sinh…" : "Sinh biến thể"}</Button>
      </div>
      {job ? <Log lines={(job.log ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-12)} fallback="đang chờ…" /> : null}
      <p className={muted}>Lệch khung so với ảnh gốc thì sửa bằng offsets ở mục Hoạt hình, đừng sinh lại.</p>
    </section>
  );
}
