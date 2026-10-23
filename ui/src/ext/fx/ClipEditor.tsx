// Port of public/fx-footage.js; behaviour unchanged.
// The clip editor: trim, speed ramp, freeze, grade (LUT or preset) and reframe of one video,
// rendered ahead of time by POST /api/fx/footage (the project's "fx" job, output in footage/cut/).
// When the job ends it shows the clip before and after (two <video> from GET /api/fx/clip) and the
// receipt. "Dùng trong shot" POSTs /api/fx/use-clip: the clip is copied into the project's
// assets/footage/, put in the shot's assets and the director is asked to switch the src in the HTML.
// Used by the fx tab (any registered clip) and by the shot inspector (the shot's own videos, with
// "replace" preset to that asset). The form and a running job live in fx-store.ts by key.
import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { say } from "@/api/client.ts";
import { fxClipUrl, fxFootage, fxUseClip, useFxLuts, useProject } from "@/api/queries.ts";
import type { Shot } from "@/api/types.ts";
import { cn } from "@/lib/utils";
import { Button, Checkbox, Input } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { ASPECTS, isVideo, OPS, paramsOf, PRESETS, WAIT_MS, type ClipResult, type EditorForm, type Op } from "./clip-params.ts";
import { useFx } from "./fx-store.ts";
import { useJob } from "./useJob.ts";

export interface ClipSource { value: string; label: string }

const FIELD = "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";
function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, className)} {...props} />;
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-sm">{label}{children}</label>
);

export function ClipEditor({ editorKey, sources, shot = null }: { editorKey: string; sources: ClipSource[]; shot?: Shot | null }) {
  const name = useStudio((s) => s.name);
  const ed = useFx((s) => s.editors[editorKey]) ?? useFx.getState().editor(editorKey, sources[0]?.value ?? "");
  const { patchEditor, patchForm } = useFx.getState();
  useJob(name, editorKey);
  const f = ed.form;
  const src = sources.some((x) => x.value === f.src) ? f.src : sources[0]?.value ?? "";
  const set = (p: Partial<EditorForm>) => patchForm(editorKey, p);

  async function run() {
    let params: Record<string, unknown>;
    try { params = paramsOf({ ...f, src }); } catch (e) { return say((e as Error).message, true); }
    if (!src) return say("Chọn clip trước", true);
    if (!name) return;
    patchEditor(editorKey, { form: { ...f, src }, busy: true, error: null, result: null });
    const r = await fxFootage({ name, src, op: f.op, params });
    const id = r.data?.job?.id;
    if (r.status !== 200 || typeof id !== "string") return patchEditor(editorKey, { busy: false, error: r.error ?? `Lỗi ${r.status}` });
    patchEditor(editorKey, { job: id, until: Date.now() + WAIT_MS });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <NativeSelect aria-label="Clip" value={src} onChange={(e) => patchEditor(editorKey, { form: { ...f, src: e.target.value }, result: null })}>
          {sources.length ? sources.map((x) => <option key={x.value} value={x.value}>{x.label}</option>) : <option value="">(chưa có video)</option>}
        </NativeSelect>
        <NativeSelect aria-label="Thao tác" value={f.op} onChange={(e) => set({ op: e.target.value as Op })}>
          {OPS.map(([id, vi]) => <option key={id} value={id}>{vi}</option>)}
        </NativeSelect>
      </div>
      <OpFields f={f} set={set} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={ed.busy || !sources.length} onClick={() => { void run(); }}>{ed.busy ? "Đang render…" : "Render"}</Button>
        <small className="text-muted-foreground">Ra footage/cut/, tất định, có biên nhận</small>
      </div>
      {ed.error ? <p className="m-0 text-sm text-danger">{ed.error}</p> : null}
      {ed.result && name ? <ResultView name={name} src={src} result={ed.result} shot={shot} /> : null}
    </div>
  );
}

function OpFields({ f, set }: { f: EditorForm; set: (p: Partial<EditorForm>) => void }) {
  const num = (k: "in" | "out" | "at" | "hold") => <Input type="number" step="0.1" value={f[k]} onChange={(e) => set({ [k]: e.target.value })} />;
  const text = (k: "anchors" | "points", ph: string) => <Input type="text" value={f[k]} placeholder={ph} spellCheck={false} onChange={(e) => set({ [k]: e.target.value })} />;
  if (f.op === "trim") return <><Field label="Từ giây">{num("in")}</Field><Field label="Đến giây">{num("out")}</Field></>;
  if (f.op === "speed") {
    return (
      <>
        <Field label="Điểm neo t:tốc độ (0,25–4), mỗi điểm giữ tới điểm sau">{text("anchors", "0:1, 2:2")}</Field>
        <label className="flex flex-row items-center gap-2 text-sm"><Checkbox checked={f.audio} onChange={(e) => set({ audio: e.target.checked })} />Giữ tiếng (atempo, có thể nghe lạ)</label>
      </>
    );
  }
  if (f.op === "freeze") return <><Field label="Đứng hình tại giây">{num("at")}</Field><Field label="Giữ bao lâu (giây)">{num("hold")}</Field></>;
  if (f.op === "grade") return <GradeFields f={f} set={set} />;
  return (
    <>
      <Field label="Khung đích">
        <NativeSelect value={f.aspect} onChange={(e) => set({ aspect: e.target.value })}>{ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}</NativeSelect>
      </Field>
      <Field label="Tâm khung t:x:y (x, y 0–1), di chuyển thẳng giữa các điểm">{text("points", "0:0.5:0.5, 4:0.7:0.5")}</Field>
    </>
  );
}

interface Lut { id: string; name?: string; source?: string }

function GradeFields({ f, set }: { f: EditorForm; set: (p: Partial<EditorForm>) => void }) {
  const name = useStudio((s) => s.name);
  const { data, error } = useFxLuts(name);
  useEffect(() => { if (error) say(`Không đọc được danh sách LUT: ${error.message}`, true); }, [error]);
  const luts = Array.isArray(data?.luts) ? (data.luts as Lut[]) : null;
  return (
    <>
      <Field label="Màu">
        <NativeSelect value={f.look} onChange={(e) => set({ look: e.target.value })}>
          {luts ? (
            <>
              <optgroup label="LUT">{luts.map((l) => <option key={l.id} value={l.id}>{`${l.name} (${l.source})`}</option>)}</optgroup>
              <optgroup label="Preset">{PRESETS.map(([id, vi]) => <option key={id} value={`preset:${id}`}>{vi}</option>)}</optgroup>
            </>
          ) : <option value={f.look}>{f.look}</option>}
        </NativeSelect>
      </Field>
      <Field label="Cường độ">
        <input type="range" min="0.05" max="1" step="0.05" value={f.intensity} className="accent-primary" onChange={(e) => set({ intensity: e.target.value })} />
      </Field>
    </>
  );
}

function ResultView({ name, src, result: r, shot }: { name: string; src: string; result: ClipResult; shot: Shot | null }) {
  const { data: m } = useProject(name);
  const sel = useStudio((s) => s.sel);
  const shots = m?.shots ?? [];
  const [target, setTarget] = useState<string>(() => shot?.id ?? sel ?? shots[0]?.id ?? "");
  const targetShot = shots.find((x) => x.id === target);
  const vids = (targetShot?.assets ?? []).filter(isVideo);
  const preset = shot && targetShot?.id === shot.id && vids.includes(src) ? src : "";
  const [repl, setRepl] = useState<string>(preset);
  const [busy, setBusy] = useState(false);
  const pass = r.receipt?.pass;

  async function use() {
    if (!m) return;
    setBusy(true);
    const res = await fxUseClip({ name, shot: target, base: m.version, clip: r.rel, replace: repl || null });
    setBusy(false);
    if (res.status !== 200) return say(res.error ?? `Lỗi ${res.status}`, true);
    say(res.data?.message ?? `Đã đưa ${res.data?.asset} vào ${target} và nhờ đạo diễn đổi src`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <figure className="m-0 flex flex-col gap-0.5">
          <video src={fxClipUrl(name, src)} controls muted preload="metadata" className="max-h-52 w-full rounded-md bg-stage" />
          <figcaption className="text-[11px] text-muted-foreground">Trước</figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-0.5">
          <video src={fxClipUrl(name, r.rel)} controls muted preload="metadata" className="max-h-52 w-full rounded-md bg-stage" />
          <figcaption className="text-[11px] text-muted-foreground">Sau</figcaption>
        </figure>
      </div>
      <small className="break-all text-muted-foreground" title={r.out}>{`${r.rel} · ${Number(r.actual_duration).toFixed(2)}s${r.cached ? " · dùng lại bản đã render" : ""}`}</small>
      <span className={cn("text-xs font-semibold", pass ? "text-ok" : "text-danger")} title={r.receipt?.file}>{`Biên nhận ${r.receipt?.id ?? "?"}: ${pass ? "kiểm đạt" : "kiểm không đạt"}`}</span>
      {(r.warnings ?? []).map((w, i) => <small key={i} className="text-danger">{w}</small>)}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Shot" value={target} onChange={(e) => { setTarget(e.target.value); setRepl(""); }}>
          {shots.map((x) => <option key={x.id} value={x.id}>{`${x.id} · ${x.name || ""}`}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Thay" value={repl} onChange={(e) => setRepl(e.target.value)}>
          <option value="">(thêm vào, không thay)</option>
          {vids.map((a) => <option key={a} value={a}>{`thay ${a}`}</option>)}
        </NativeSelect>
        <Button variant="primary" disabled={!m?.capabilities?.editable || busy} onClick={() => { void use(); }}>Dùng trong shot</Button>
      </div>
    </div>
  );
}
