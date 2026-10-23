// Port of public/anime-manifest.js; behaviour unchanged.
// The limited-animation editor: assets/anim/manifest.json over /api/anime/manifest. Forms for the six
// things one tunes most (lipsync, blink, wind, keys, impacts, per-pose offsets) and a raw JSON box
// for the other keys of a stack (tweens, smears, tremor, steps, ghosts, streaks, breathe, origin).
// Edits go to a draft in the store; "Lưu và build" sends it with the sha it started from (409 when
// the file changed meanwhile), asks again when the project already has a final video (428), then
// follows the build job and lists its WARN lines.
import { useEffect, useState } from "react";
import { say } from "@/api/client.ts";
import { animeEnable, animeManifest, animeRebuild, useAnime } from "@/api/queries.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { cn } from "@/lib/utils";
import { ask } from "./confirm.tsx";
import { Field, LazyInput, LazyTextarea, Log, NativeSelect, Tag, muted } from "./parts.tsx";
import { makeDraft, reload, useAnimeStore, type Draft } from "./store.ts";
import { useJobView } from "./useJob.ts";
import { isLive, type JobView, type Loose, type ManifestInfo, type Stack, type Track } from "./types.ts";

const TYPES = ["lipsync", "blink", "wind", "keys"] as const;
const NEW_TRACK: Record<(typeof TYPES)[number], () => Track> = {
  lipsync: () => ({ type: "lipsync", voice: "", open: "", half: "", closed: "", idle: "closed" }),
  blink: () => ({ type: "blink", pose: "", at: [], frames: 3 }),
  wind: () => ({ type: "wind", frames: ["base"], fps: 6, phase: 0 }),
  keys: () => ({ type: "keys", keys: [{ pose: "base", frames: 6 }] }),
};
const OWN = new Set(["shot", "tracks", "offsets"]); // stack keys with a form; the rest is raw JSON
const TRACK_KEYS = ["type", "voice", "open", "half", "closed", "idle", "from", "to", "pose", "at", "frames", "fps", "phase", "keys"];

// "" → undefined, "1.5" → 1.5, "s13+0.1" → "s13+0.1".
export const time = (v: string): number | string | undefined => { const t = String(v).trim(); return t === "" ? undefined : /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : t; };
const int = (v: string): number | undefined => { const t = String(v).trim(); return t === "" ? undefined : Number.parseInt(t, 10); };
const num = (v: string): number | undefined => { const t = String(v).trim(); return t === "" ? undefined : Number(t); };
const list = (v: string): string[] => String(v).split(",").map((x) => x.trim()).filter(Boolean);
const show = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const put = (o: Loose, k: string, v: unknown) => { if (v === undefined || (typeof v === "number" && Number.isNaN(v))) delete o[k]; else o[k] = v; };

type Edit = (fn: (d: Draft) => void) => void;

export function Manifest() {
  const name = useStudio((s) => s.name) as string;
  const q = useAnime("manifest", name);
  const stored = useAnimeStore((s) => s.draft);
  const build = useJobView("build");
  const g = q.data as ManifestInfo | undefined;
  const ready = Boolean(g && (g.enabled || g.exists));

  // The draft starts from the loaded manifest the first time the editor shows it.
  useEffect(() => {
    if (!stored && g && ready) useAnimeStore.getState().setDraft(makeDraft(g));
  }, [stored, g, ready]);

  if (q.error) return <p className="m-0 p-3 text-sm text-muted-foreground">{`Không tải được manifest: ${q.error.message}`}</p>;
  if (!g) return <p className={muted}>Đang tải…</p>;
  const building = Boolean(build && isLive(build.job));

  if (!ready) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-sm text-muted-foreground">
        <p className="m-0">Dự án chưa có hệ lật ảnh (assets/anim/). Bật để chép build.mjs, anim.js, manifest mẫu và tạo manifest.json trống. File có sẵn không bị ghi đè.</p>
        <Button variant="primary" onClick={async () => {
          const r = await animeEnable({ name });
          if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
          say(`Đã chép ${r.data?.copied?.length ?? 0} file vào assets/anim/`);
          useAnimeStore.getState().setDraft(null);
        }}>Bật hệ lật ảnh</Button>
      </div>
    );
  }

  const d = stored ?? makeDraft(g);
  const m = d.m;
  const edit: Edit = (fn) => useAnimeStore.getState().editDraft(fn, g);
  const stale = d.sha !== g.sha;
  const stackIds = Object.keys(m.stacks);
  const st = d.stack ? m.stacks[d.stack] : null;

  async function save(confirmed = false): Promise<void> {
    const cur = useAnimeStore.getState().draft ?? d;
    if (cur.rawErr) return say(`Ô JSON chưa hợp lệ: ${cur.rawErr}`, true);
    const r = await animeManifest({ name, base_sha: cur.sha, manifest: cur.m, confirm: confirmed });
    if (r.status === 428) { if (await ask(`${r.error}\n\nVẫn lưu? Bản cũ được sao lưu vào .opus/anim-backups/.`)) return save(true); return; }
    if (r.status === 409) { say("Manifest vừa được sửa ở chỗ khác. Bấm Bỏ bản nháp để tải bản mới.", true); return; }
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return; }
    useAnimeStore.getState().editDraft((x) => { x.sha = r.data?.sha ?? null; });
    say(`Đã lưu (sao lưu ${r.data?.backup ?? "không cần"})`);
    if (r.data?.job) useAnimeStore.getState().follow("build", r.data.job);
  }
  async function rebuild(confirmed = false): Promise<void> {
    const r = await animeRebuild({ name, confirm: confirmed });
    if (r.status === 428) { if (await ask(`${r.error}\n\nVẫn build?`)) return rebuild(true); return; }
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    if (r.data?.job) useAnimeStore.getState().follow("build", r.data.job);
  }
  async function discard() {
    await reload(name, "manifest");
    useAnimeStore.getState().setDraft(null);
  }

  return (
    <>
      {g.final.length ? <Tag warn>{`Dự án đã có bản final (${g.final.join(", ")}). Lưu sẽ hỏi xác nhận; bản cũ luôn được sao lưu.`}</Tag> : null}
      {stale ? <Tag warn>Bản nháp dựa trên manifest cũ hơn file hiện tại.</Tag> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={building} onClick={() => void save()}>Lưu và build</Button>
        <Button disabled={building || !g.enabled} onClick={() => void rebuild()}>Build lại</Button>
        <Button onClick={() => void discard()}>Bỏ bản nháp</Button>
      </div>
      {build ? <BuildBox b={build} /> : null}
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">Stack</h3>
        <div className="flex flex-wrap items-start gap-2">
          <NativeSelect aria-label="Stack" value={d.stack ?? ""} onChange={(e) => { const v = e.target.value; edit((x) => { x.stack = v; }); }}>
            {stackIds.map((id) => <option key={id} value={id}>{`${id} (${m.stacks[id].shot})`}</option>)}
          </NativeSelect>
          <AddStack d={d} edit={edit} />
        </div>
        {st && d.stack ? <StackForm key={d.stack} id={d.stack} st={st} edit={edit} /> : <p className={muted}>Chưa có stack. Mỗi stack là một phần tử id=… trong index.html.</p>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">Khung impact</h3>
        {m.impacts.map((im, i) => (
          <div key={i} data-impact={i} className="flex flex-wrap items-end gap-1.5 rounded-md border border-border bg-panel-2 p-2">
            <Field className="flex-[1_1_80px]" label="at"><LazyInput value={show(im.at)} onCommit={(v) => edit((x) => put(x.m.impacts[i], "at", time(v)))} /></Field>
            <Field className="flex-[1_1_80px]" label="frames"><LazyInput inputMode="numeric" value={show(im.frames)} onCommit={(v) => edit((x) => put(x.m.impacts[i], "frames", int(v)))} /></Field>
            <Field className="flex-[1_1_80px]" label="mode">
              <NativeSelect value={im.mode ?? "invert"} onChange={(e) => { const v = e.target.value; edit((x) => { const o = x.m.impacts[i]; put(o, "mode", v); if (v !== "silhouette") delete o.stack; }); }}>
                {["invert", "silhouette"].map((x) => <option key={x} value={x}>{x}</option>)}
              </NativeSelect>
            </Field>
            {(im.mode ?? "invert") === "silhouette" ? (
              <Field className="flex-[1_1_80px]" label="stack">
                <NativeSelect value={im.stack ?? ""} onChange={(e) => { const v = e.target.value; edit((x) => put(x.m.impacts[i], "stack", v)); }}>
                  <option value="">—</option>
                  {stackIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </NativeSelect>
              </Field>
            ) : null}
            <Button onClick={() => edit((x) => { x.m.impacts.splice(i, 1); })}>Bỏ</Button>
          </div>
        ))}
        <div><Button onClick={() => edit((x) => { x.m.impacts.push({ at: 0, frames: 2, mode: "invert" }); })}>Thêm impact</Button></div>
      </section>
    </>
  );
}

function BuildBox({ b }: { b: JobView }) {
  const live = isLive(b.job);
  const warns = b.warnings ?? [];
  const tail = (b.log ?? []).filter((l) => !/\bWARN\b/.test(l)).slice(-3);
  const err = !live && Boolean(b.job.code);
  return (
    <section data-build={err ? "err" : live ? "live" : "ok"} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <strong className={cn(err && "text-danger")}>{live ? "Đang build…" : b.job.code === 0 ? `Build xong${warns.length ? `, ${warns.length} cảnh báo` : ""}` : `Build lỗi (exit ${b.job.code ?? b.job.signal})`}</strong>
      {warns.length ? <ul className="m-0 max-h-52 overflow-auto pl-4 text-xs text-warn">{warns.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
      {tail.length ? <Log lines={tail} /> : null}
    </section>
  );
}

function AddStack({ d, edit }: { d: Draft; edit: Edit }) {
  const [id, setId] = useState("");
  const [shot, setShot] = useState("");
  return (
    <details>
      <summary className="cursor-pointer text-sm">Thêm stack</summary>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <input className="h-8 rounded-md border border-border bg-background px-2 text-sm" type="text" placeholder="id phần tử, ví dụ s3-hero" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="h-8 rounded-md border border-border bg-background px-2 text-sm" type="text" placeholder="shot, ví dụ s3" value={shot} onChange={(e) => setShot(e.target.value)} />
        <Button onClick={() => {
          const nid = id.trim(), nshot = shot.trim();
          if (!/^[A-Za-z0-9_-]+$/.test(nid) || !nshot) return say("Cần id và shot", true);
          if (d.m.stacks[nid]) return say(`Đã có stack ${nid}`, true);
          edit((x) => { x.m.stacks[nid] = { shot: nshot, tracks: [] }; x.stack = nid; });
        }}>Thêm</Button>
      </div>
    </details>
  );
}

function StackForm({ id, st, edit }: { id: string; st: Stack; edit: Edit }) {
  const tracks = st.tracks ?? [];
  const others = Object.fromEntries(Object.entries(st).filter(([k]) => !OWN.has(k)));
  const offsets = st.offsets ?? {};
  const rawErr = useAnimeStore((s) => s.draft?.rawErr ?? null);
  const [pose, setPose] = useState("");
  const es = (fn: (s: Stack, d: Draft) => void) => edit((x) => { const s = x.m.stacks[id]; s.tracks ??= []; fn(s, x); });

  function raw(text: string) {
    edit((x) => {
      const s = x.m.stacks[id];
      try {
        const v: unknown = JSON.parse(text || "{}");
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("cần một object");
        for (const k of Object.keys(s)) if (!OWN.has(k)) delete s[k];
        for (const [k, val] of Object.entries(v as Loose)) if (!OWN.has(k)) s[k] = val;
        x.rawErr = null;
      } catch (e) { x.rawErr = (e as Error).message; }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Field label="shot"><LazyInput value={show(st.shot)} onCommit={(v) => es((s) => { s.shot = v.trim(); })} /></Field>
      {tracks.map((tr, i) => <TrackForm key={i} i={i} tr={tr} es={es} />)}
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => <Button key={t} onClick={() => es((s) => { s.tracks!.push(NEW_TRACK[t]()); })}>{`+ ${t}`}</Button>)}
      </div>
      <h4 className="m-0 mt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Offsets theo tư thế (lệch khung thì sửa ở đây, đừng sinh lại)</h4>
      {Object.entries(offsets).map(([p, o]) => (
        <div key={p} data-offset={p} className="flex flex-wrap items-end gap-1.5 rounded-md border border-border bg-panel-2 p-2">
          <strong>{p}</strong>
          {(["x", "y", "scale"] as const).map((k) => (
            <Field key={k} className="flex-[1_1_80px]" label={k}>
              <LazyInput inputMode="decimal" value={show(o[k])} onCommit={(v) => es((s) => put(s.offsets![p] as Loose, k, num(v)))} />
            </Field>
          ))}
          <Button onClick={() => es((s) => { delete s.offsets![p]; if (!Object.keys(s.offsets!).length) delete s.offsets; })}>Bỏ</Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          type="text"
          placeholder="tên tư thế, ví dụ s13-k2"
          value={pose}
          onChange={(e) => setPose(e.target.value)}
          onKeyDown={(e) => {
            const p = pose.trim();
            if (e.key !== "Enter" || !p) return;
            es((s) => { (s.offsets ??= {})[p] = { x: 0, y: 0 }; });
            setPose("");
          }}
        />
        <span className={muted}>Enter để thêm</span>
      </div>
      <h4 className="m-0 mt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khoá khác (JSON)</h4>
      <LazyTextarea
        rows={6}
        spellCheck={false}
        aria-label="Khoá khác (JSON)"
        aria-invalid={rawErr ? true : undefined}
        className={cn("font-mono text-xs", rawErr && "bad border-danger ring-2 ring-danger/30")}
        value={JSON.stringify(others, null, 2)}
        onCommit={raw}
      />
      <div>
        <Button onClick={async () => {
          if (!(await ask(`Xoá stack ${id}?`))) return;
          edit((x) => { delete x.m.stacks[id]; x.stack = Object.keys(x.m.stacks)[0] ?? null; });
        }}>Xoá stack</Button>
      </div>
    </div>
  );
}

function TrackForm({ i, tr, es }: { i: number; tr: Track; es: (fn: (s: Stack, d: Draft) => void) => void }) {
  const et = (fn: (t: Track) => void) => es((s) => fn(s.tracks![i]));
  const text = (label: string, k: string, conv: (v: string) => unknown, attrs: { inputMode?: "numeric" | "decimal" } = {}) => (
    <Field key={k} label={label}><LazyInput {...attrs} value={show(tr[k])} onCommit={(v) => et((t) => put(t, k, conv(v)))} /></Field>
  );
  const rows = [];
  if (tr.type === "lipsync") {
    rows.push(text("voice (id thẻ audio)", "voice", (v) => v.trim()));
    for (const k of ["open", "half", "closed"]) rows.push(text(k, k, (v) => v.trim() || undefined));
    rows.push(
      <Field key="idle" label="idle">
        <NativeSelect value={tr.idle === null ? "null" : show(tr.idle ?? "closed")} onChange={(e) => { const v = e.target.value; et((t) => { t.idle = v === "null" ? null : v; }); }}>
          {["closed", "half", "open", "null"].map((x) => <option key={x} value={x}>{x}</option>)}
        </NativeSelect>
      </Field>,
    );
    rows.push(text("from", "from", time), text("to", "to", time));
  } else if (tr.type === "blink") {
    rows.push(text("pose", "pose", (v) => v.trim()));
    rows.push(
      <Field key="at" label="at (giây hoặc s4+0.5, cách nhau bằng dấu phẩy)">
        <LazyInput value={((tr.at as unknown[]) ?? []).join(", ")} onCommit={(v) => et((t) => { t.at = list(v).map(time); })} />
      </Field>,
    );
    rows.push(text("frames", "frames", int, { inputMode: "numeric" }));
  } else if (tr.type === "wind") {
    rows.push(
      <Field key="frames" label="frames (tư thế, cách nhau bằng dấu phẩy)">
        <LazyInput value={((tr.frames as string[]) ?? []).join(", ")} onCommit={(v) => et((t) => { t.frames = list(v); })} />
      </Field>,
    );
    rows.push(text("fps", "fps", num, { inputMode: "decimal" }), text("phase", "phase", int, { inputMode: "numeric" }));
  } else if (tr.type === "keys") {
    const keysList = (tr.keys as Loose[] | undefined) ?? [];
    rows.push(...keysList.map((k, j) => (
      <div key={`k${j}`} className="flex items-center gap-1.5">
        <LazyInput className="flex-[2_1_0] min-w-0" aria-label={`Tư thế ${j + 1}`} value={show(k.pose)} onCommit={(v) => et((t) => put(t.keys[j], "pose", v.trim()))} />
        <LazyInput className="flex-[1_1_0] min-w-0" aria-label={`Số khung ${j + 1}`} inputMode="numeric" value={show(k.frames)} onCommit={(v) => et((t) => put(t.keys[j], "frames", int(v)))} />
        <NativeSelect aria-label={`Smear ${j + 1}`} value={k.smear ?? ""} onChange={(e) => { const v = e.target.value; et((t) => put(t.keys[j], "smear", v || undefined)); }}>
          <option value="">không nhoè</option>
          {["left", "right"].map((x) => <option key={x} value={x}>{`nhoè ${x}`}</option>)}
        </NativeSelect>
        <Button onClick={() => et((t) => { t.keys.splice(j, 1); })}>Bỏ</Button>
      </div>
    )));
    rows.push(<div key="add-key"><Button onClick={() => et((t) => { (t.keys ??= []).push({ pose: "base", frames: 6 }); })}>Thêm tư thế</Button></div>);
  }
  const extra = Object.keys(tr).filter((k) => !TRACK_KEYS.includes(k));
  return (
    <div data-track={i} className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2">
      <div className="flex items-center gap-2">
        <strong>{`${i + 1}. ${tr.type}`}</strong>
        {extra.length ? <small className="text-muted-foreground">{`giữ nguyên: ${extra.join(", ")}`}</small> : null}
        <Button className="ml-auto" onClick={() => es((s) => { s.tracks!.splice(i, 1); })}>Bỏ track</Button>
      </div>
      {rows}
    </div>
  );
}
