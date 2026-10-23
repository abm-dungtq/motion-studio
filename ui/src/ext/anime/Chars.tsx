// Port of public/anime-chars.js; behaviour unchanged.
// The character library (assets/chars/chars.json over /api/anime/chars): sheet, name, key colour,
// palette, notes. A sheet PNG that the library does not list yet shows with "Lưu vào thư viện".
// "Sinh sheet" makes a four-view sheet on the key colour through the agent registry (one image of
// quota) and points the entry at it. The form and the descriptions live in the store, so a reload
// of the list never drops what is being typed.
import { say } from "@/api/client.ts";
import { animeChars, useAnime } from "@/api/queries.ts";
import { Button, Input, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { ask } from "./confirm.tsx";
import { Field, Log, Tag, muted } from "./parts.tsx";
import { blankChar, useAnimeStore, type CharForm } from "./store.ts";
import { useJobView } from "./useJob.ts";
import { isLive, type Char, type CharsList } from "./types.ts";
import { projectSrc } from "./Board.tsx";

export function Chars() {
  const name = useStudio((s) => s.name) as string;
  const q = useAnime("chars", name);
  const edit = useAnimeStore((s) => s.charForm);
  const descs = useAnimeStore((s) => s.descs);
  const job = useJobView("sheet");
  const running = Boolean(job && isLive(job.job));

  if (q.error) return <p className="m-0 p-3 text-sm text-muted-foreground">{`Không tải được thư viện nhân vật: ${q.error.message}`}</p>;
  const list = (q.data as CharsList | undefined)?.chars;
  if (!list) return <p className={muted}>Đang tải…</p>;

  async function save(c: Record<string, unknown>) {
    const r = await animeChars({ name, char: c });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    say(`Đã lưu ${r.data?.char?.name}`);
    useAnimeStore.getState().setCharForm(blankChar());
  }
  async function remove(c: Char) {
    if (!(await ask(`Bỏ ${c.name} khỏi thư viện? File sheet vẫn giữ nguyên.`))) return;
    const r = await animeChars({ name, remove: c.id });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
  }
  async function generate(c: Char, description: string) {
    if (!description.trim()) return say("Ghi mô tả nhân vật trước (tiếng Anh cho agent)", true);
    if (!(await ask(`Sinh sheet 4 góc cho ${c.name} (tốn 1 ảnh quota)?`))) return;
    const r = await animeChars({ name, generate: { id: c.id, description } });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    if (r.data?.job) useAnimeStore.getState().follow("sheet", r.data.job, c.name);
  }

  const set = (k: keyof CharForm) => (e: { target: { value: string } }) => useAnimeStore.getState().setCharForm({ ...useAnimeStore.getState().charForm, [k]: e.target.value });
  const editing = Boolean(edit.id && list.some((c) => c.id === edit.id && !c.unregistered));

  return (
    <>
      {list.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {list.map((c) => {
            const desc = descs[c.id] ?? c.notes ?? "";
            return (
              <div key={c.id} data-char={c.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2">
                {c.sheet && c.exists
                  ? <img src={projectSrc(name, c.sheet)} alt={`Sheet ${c.name}`} loading="lazy" className="aspect-video w-full rounded bg-background object-contain" />
                  : <div className="grid aspect-video w-full place-items-center rounded bg-background text-[11px] text-muted-foreground">chưa có sheet</div>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong>{c.name}</strong>
                  <span className="text-muted-foreground">{c.id}</span>
                  {/* the key colour and palette are the character's data, shown as they are */}
                  <span data-swatch="key" title={`Màu nền ${c.key_color}`} className="inline-block size-4 rounded border border-border align-middle" style={{ background: c.key_color }} />
                  {(c.palette ?? []).map((p, i) => <span key={`${p}-${i}`} data-swatch="" title={p} className="inline-block size-2.5 rounded-sm border border-border align-middle" style={{ background: p }} />)}
                  {c.unregistered ? <Tag>chưa trong thư viện</Tag> : null}
                </div>
                {c.sheet ? <small className="text-muted-foreground">{c.sheet}</small> : null}
                {c.notes ? <p className="m-0 text-sm">{c.notes}</p> : null}
                <details>
                  <summary className="cursor-pointer text-sm">Sinh sheet 4 góc</summary>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <Textarea rows={3} value={desc} placeholder="young swordsman, green hair, three katanas, white shirt" onChange={(e) => useAnimeStore.getState().setDesc(c.id, e.target.value)} />
                    <Button disabled={running || c.unregistered} title={c.unregistered ? "Lưu vào thư viện trước" : ""} onClick={() => void generate(c, desc)}>Sinh sheet</Button>
                  </div>
                </details>
                <div className="flex gap-2">
                  {c.unregistered
                    ? <Button variant="primary" onClick={() => void save({ id: c.id, name: c.name, sheet: c.sheet, key_color: c.key_color })}>Lưu vào thư viện</Button>
                    : <Button onClick={() => useAnimeStore.getState().setCharForm({ id: c.id, name: c.name, key_color: c.key_color, notes: c.notes ?? "", palette: (c.palette ?? []).join(", "), sheet: c.sheet ?? "" })}>Sửa</Button>}
                  {c.unregistered ? null : <Button onClick={() => void remove(c)}>Bỏ</Button>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 text-sm text-muted-foreground"><p className="m-0">Chưa có nhân vật. Thêm một nhân vật rồi sinh sheet 4 góc, hoặc đặt sẵn assets/chars/&lt;id&gt;-sheet.png.</p></div>
      )}
      {job ? <Log lines={(job.log ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-8)} fallback="đang chờ…" /> : null}
      <section className="flex flex-col gap-2 rounded-md border border-border p-2">
        <h3 className="m-0 text-sm font-semibold">{editing ? `Sửa ${edit.id}` : "Thêm nhân vật"}</h3>
        <Field label="Id (chữ thường, số, -)"><Input value={edit.id} onChange={set("id")} /></Field>
        <Field label="Tên"><Input value={edit.name} onChange={set("name")} /></Field>
        <Field label="Màu nền tách (không dùng xanh lá nếu nhân vật có màu xanh lá)"><Input type="color" className="w-16 p-0.5" value={edit.key_color} onChange={set("key_color")} /></Field>
        <Field label="Bảng màu (#RRGGBB, cách nhau bằng dấu phẩy)"><Input value={edit.palette} onChange={set("palette")} /></Field>
        <Field label="Sheet (đường trong dự án, có thể để trống)"><Input value={edit.sheet} placeholder="assets/chars/<id>-sheet.png" onChange={set("sheet")} /></Field>
        <Field label="Ghi chú, mô tả"><Textarea rows={3} value={edit.notes} onChange={set("notes")} /></Field>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void save({ ...edit, palette: edit.palette.split(",").map((x) => x.trim()).filter(Boolean), sheet: edit.sheet.trim() || null })}>Lưu</Button>
        </div>
      </section>
    </>
  );
}
