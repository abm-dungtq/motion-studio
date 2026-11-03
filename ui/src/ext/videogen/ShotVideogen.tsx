// The shot inspector's "Flow (Google)" section: one AI image or one AI clip for the shot through
// gflow-cli (routes/videogen.mjs, docs/videogen.md). Every send may cost Flow credits or quota, so
// only these buttons start one, after a confirm; an unknown earlier result of the same request needs
// a second confirm, and a clip Flow already made is downloaded (free) instead of made again. The
// list below shows this shot's images and clips and what can be done with each.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, say, type SendResult } from "@/api/client.ts";
import type { Manifest } from "@/api/types.ts";
import { mss, trayItems } from "@/core/job-tray.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Combobox } from "@/shell/Combobox.tsx";
import { Button, Textarea } from "@/shell/controls.tsx";
import { makeConfirm } from "@/shell/confirm.tsx";
import { useDraft } from "@/shell/useDraft.ts";
import { useStudio } from "@/store/studio.ts";
import {
  DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, hhmm, IMAGE_ASPECTS, IMAGE_MODELS, kindOf, pickSeconds, SECONDS, stateLabel, VIDEO_MODELS,
  vgAttach, vgCancel, vgCreate, vgImage, vgImport, vgItems, stopText, vgReconcile, vgRecover, useVgStatus, vgUsePart, type VgItem, type VgKind, type VgStatus,
} from "./api.ts";

const IMAGE = /\.(png|jpe?g|webp)$/i;
const VIDEO_MODES = [{ v: "t2v", label: "Chỉ chữ", refs: 0 }, { v: "start", label: "Ảnh đầu", refs: 1 }, { v: "start_end", label: "Ảnh đầu + cuối", refs: 2 }];
const IMAGE_MODES = [{ v: "t2i", label: "Chỉ chữ", refs: 0 }, { v: "i2i", label: "Theo ảnh mẫu", refs: 1 }];
const RESOLUTIONS = [{ v: "720p", label: "720p" }, { v: "360p", label: "360p nháp" }];
const refresh = () => queryClient.invalidateQueries({ queryKey: ["videogen"] });
const fail = (r: SendResult) => { if (r.status !== 200) say(r.error ?? `lỗi ${r.status}`, true); return r.status === 200; };
type Shot = Manifest["shots"][number];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center gap-2 text-sm"><span className="w-24 shrink-0 text-muted-foreground">{label}</span>{children}</label>;
}
function Pick({ label, value, options, onChange }: { label: string; value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Combobox label={label} value={value} options={options.map((x) => ({ value: x.v, label: x.label }))} onChange={onChange} />
    </Field>
  );
}
const opts = (list: string[]) => list.map((v) => ({ v, label: v }));

// Why a send button is off, in the order the server checks.
function blocked(st: VgStatus | undefined, kind: VgKind): string | null {
  if (!st) return "Đang kiểm gflow…";
  if (!st.found) return `Chưa có gflow ở ${st.bin}`;
  if (!st.profile) return "Chưa có profile gflow: đặt videogen.profile hoặc chạy gflow auth login";
  if (st.waf_until) return `Flow đang chặn vì gửi quá nhiều; chờ tới ${hhmm(st.waf_until)}`;
  if (kind === "video" && st.today >= st.cap) return `Đã đủ ${st.cap} clip hôm nay`;
  if (kind === "image" && st.images_today >= st.image_cap) return `Đã đủ ${st.image_cap} ảnh hôm nay`;
  if (st.job) return "Đang có một lượt Flow khác";
  return null;
}

// Its own in-page confirm and path question: some hosts never show window.confirm() (it answers
// "cancel") and refuse window.prompt().
const { ask, askText, ConfirmHost } = makeConfirm();

// The 409 answers of a send: a second confirm for an unknown earlier result, a free download for
// a clip Flow made. True when a request went through.
async function sendWithGuards(first: SendResult, again: (id: string) => Promise<SendResult>, recover: (id: string) => Promise<SendResult>): Promise<boolean> {
  if (first.code === "DUPLICATE") {
    const made = first.made ? " Flow có thể đã tạo; tạo lại có thể trả credit lần nữa." : "";
    if (await ask(`Lần trước của đúng yêu cầu này chưa rõ kết quả và có thể đã tốn credit.${made} Vẫn tạo lại (có thể tốn credit lần hai)?`, { ok: "Tạo lại (có thể tốn credit)", danger: true })) return fail(await again(String(first.id)));
    return false;
  }
  if (first.code === "RECOVERABLE") {
    if (await ask("Flow đã tạo clip của đúng yêu cầu này. Tải về (miễn phí)?", { ok: "Tải về" })) return fail(await recover(String(first.id)));
    return false;
  }
  return fail(first);
}

// The inspector keeps one section mounted across shots and projects; the form is keyed on both so
// nothing typed for one shot carries over to another. The prompt of each shot and kind stays as a
// draft for the browser session (useDraft) until it is sent.
export function ShotVideogen({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const shot = m?.shots?.find((s) => s.id === pick.id);
  if (!shot || !name || !m) return null;
  return <VgPanel key={`${name}:${shot.id}`} name={name} shot={shot} m={m} />;
}

function VgPanel({ name, shot, m }: { name: string; shot: Shot; m: Manifest }) {
  const status = useVgStatus();
  const st = status.data;
  const busyHere = Boolean(st?.job && st.job.name === name);
  const items = useQuery({ queryKey: ["videogen", "items", name], queryFn: () => vgItems(name), refetchInterval: busyHere ? 2000 : false });
  // Image first: an image is free in quota, a clip costs Flow credits.
  const [kind, setKind] = useState<VgKind>("image");
  // The job's end settles its item (attached, indeterminate…): fetch the list once more.
  const wasBusy = useRef(busyHere);
  useEffect(() => {
    if (wasBusy.current && !busyHere) void refresh();
    wasBusy.current = busyHere;
  }, [busyHere]);
  const all = items.data?.items ?? [];
  const mine = all.filter((x) => x.shot === shot.id);
  const running = busyHere ? all.find((x) => x.state === "running" || x.state === "intent") : undefined;
  const images = (shot.assets ?? []).filter((a) => IMAGE.test(a));
  const n = m.shots.findIndex((s) => s.id === shot.id) + 1;

  return (
    <section className="flex flex-col gap-2" aria-label="Flow (Google)">
      <h3 className="m-0 text-sm font-semibold">Flow (Google)</h3>
      {/* The shot this form sends for stays in view while the form scrolls. */}
      <p data-testid="vg-shot" className="sticky top-0 z-10 m-0 bg-panel py-1 text-sm font-medium">{`Shot ${n} · ${shot.name || shot.id}`}</p>
      <div className="flex gap-2">
        <Button aria-pressed={kind === "image"} variant={kind === "image" ? "primary" : "default"} onClick={() => setKind("image")}>Ảnh</Button>
        <Button aria-pressed={kind === "video"} variant={kind === "video" ? "primary" : "default"} onClick={() => setKind("video")}>Video</Button>
      </div>
      {/* Both stay mounted so switching keeps what was typed. */}
      <div hidden={kind !== "image"}><ImageForm name={name} shot={shot} m={m} st={st} images={images} /></div>
      <div hidden={kind !== "video"}><VideoForm name={name} shot={shot} m={m} st={st} images={images} /></div>
      {busyHere && <Running name={name} item={running} />}
      <ConfirmHost />
      {mine.length > 0 && <Items name={name} m={m} items={mine} busyHere={busyHere} idle={!st?.job} />}
    </section>
  );
}

function Refs({ need, labels, images, refs, setRefs }: { need: number; labels: string[]; images: string[]; refs: string[]; setRefs: (f: (r: string[]) => string[]) => void }) {
  if (!need) return null;
  if (!images.length) return <p className="m-0 text-sm text-warn">Shot chưa có ảnh; thêm ảnh vào shot hoặc dùng Chỉ chữ</p>;
  return <>{labels.slice(0, need).map((label, i) => (
    <Field key={label} label={label}>
      <Combobox
        className="flex-1"
        label={label}
        value={refs[i] ?? ""}
        options={[{ value: "", label: "—" }, ...images.map((a) => ({ value: a, label: a.split("/").pop() ?? a, hint: a.includes("/") ? a.slice(0, a.lastIndexOf("/")) : undefined }))]}
        onChange={(v) => setRefs((r) => r.map((x, j) => (j === i ? v : x)))}
      />
    </Field>
  ))}</>;
}

type FormProps = { name: string; shot: Shot; m: Manifest; st: VgStatus | undefined; images: string[] };

function ImageForm({ name, shot, m, st, images }: FormProps) {
  const [prompt, setPrompt, forgetPrompt] = useDraft(`vg-draft:${name}:${shot.id}:image`);
  const [mode, setMode] = useState("t2i");
  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL);
  const [aspect, setAspect] = useState((m.height ?? 0) > (m.width ?? 0) ? "9:16" : "16:9");
  const [refs, setRefs] = useState<string[]>([""]);
  const [sending, setSending] = useState(false);
  const need = IMAGE_MODES.find((x) => x.v === mode)?.refs ?? 0;
  const chosen = refs.slice(0, need).map((x) => (images.includes(x) ? x : ""));
  const why = blocked(st, "image") ?? (!prompt.trim() ? "Nhập mô tả ảnh" : chosen.some((x) => !x) ? "Chọn ảnh mẫu" : null);
  const create = async () => {
    if (!st) return;
    if (!(await ask(`Tạo một ảnh ${model} ${aspect} qua Flow? Tài liệu gflow ghi ảnh nano miễn phí theo thực nghiệm nhưng có quota ngày. Hôm nay: ${st.images_today}/${st.image_cap} ảnh.`, { ok: "Tạo ảnh (tốn 1 lượt)" }))) return;
    setSending(true);
    try {
      const body = { name, shot: shot.id, base: m.version, prompt, mode, model, aspect, refs: chosen };
      if (await sendWithGuards(await vgImage(body), (id) => vgImage({ ...body, again: id }), (id) => vgRecover(name, id))) forgetPrompt();
    } finally { setSending(false); void refresh(); }
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea aria-label="Mô tả ảnh" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Bờ biển lúc bình minh, ánh sáng mềm…" />
      <Pick label="Kiểu ảnh" value={mode} options={IMAGE_MODES} onChange={setMode} />
      <Refs need={need} labels={["Ảnh mẫu"]} images={images} refs={refs} setRefs={setRefs} />
      <Pick label="Model ảnh" value={model} options={opts(IMAGE_MODELS)} onChange={setModel} />
      <Pick label="Khung ảnh" value={aspect} options={opts(IMAGE_ASPECTS)} onChange={setAspect} />
      <div className="flex items-center gap-2">
        <Button variant="primary" aria-describedby={why ? "vg-why-image" : undefined} disabled={Boolean(why) || sending} onClick={() => void create()}>Tạo ảnh bằng Flow</Button>
        {st && <span className="text-sm text-muted-foreground">{`Còn ${Math.max(0, st.image_cap - st.images_today)} ảnh hôm nay`}</span>}
      </div>
      {why && <p id="vg-why-image" className="m-0 text-sm text-muted-foreground">{why}</p>}
    </div>
  );
}

function VideoForm({ name, shot, m, st, images }: FormProps) {
  const len = Number(shot.end) - Number(shot.start);
  const [prompt, setPrompt, forgetPrompt] = useDraft(`vg-draft:${name}:${shot.id}:video`);
  const [mode, setMode] = useState("t2v");
  const [model, setModelRaw] = useState(DEFAULT_VIDEO_MODEL);
  const [seconds, setSeconds] = useState(() => Math.min(pickSeconds(len), 8));
  const [resolution, setResolution] = useState("720p");
  const [aspect, setAspect] = useState((m.height ?? 0) > (m.width ?? 0) ? "9:16" : "16:9");
  const [refs, setRefs] = useState<string[]>(["", ""]);
  const [sending, setSending] = useState(false);
  const omni = model === "omni-flash";
  // 10 s exists for omni-flash only: another model clamps to 8.
  const setModel = (v: string) => { setModelRaw(v); if (v !== "omni-flash" && seconds > 8) setSeconds(8); };
  const need = VIDEO_MODES.find((x) => x.v === mode)?.refs ?? 0;
  const chosen = refs.slice(0, need).map((x) => (images.includes(x) ? x : ""));
  const why = blocked(st, "video") ?? (!prompt.trim() ? "Nhập mô tả chuyển động" : chosen.some((x) => !x) ? "Chọn đủ ảnh cho kiểu này" : null);
  const create = async () => {
    if (!st) return;
    if (!(await ask(`Tạo clip ${seconds}s bằng ${model}${omni ? ` ${resolution}` : ""} qua Flow? Lượt này tốn credit Flow. Hôm nay: ${st.today}/${st.cap} clip.`, { ok: "Tạo clip (tốn 1 lượt)" }))) return;
    setSending(true);
    try {
      // gflow stops (exit 11) on --resolution for any model but omni-flash: send it for omni only.
      const body = { name, shot: shot.id, base: m.version, prompt, mode, model, aspect, seconds, refs: chosen, ...(omni ? { resolution } : {}) };
      if (await sendWithGuards(await vgCreate(body), (id) => vgCreate({ ...body, again: id }), (id) => vgRecover(name, id))) forgetPrompt();
    } finally { setSending(false); void refresh(); }
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea aria-label="Mô tả chuyển động" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Máy quay chậm tiến vào, sóng vỗ…" />
      <Pick label="Kiểu" value={mode} options={VIDEO_MODES} onChange={setMode} />
      <Refs need={need} labels={["Ảnh đầu", "Ảnh cuối"]} images={images} refs={refs} setRefs={setRefs} />
      <Pick label="Model" value={model} options={opts(VIDEO_MODELS)} onChange={setModel} />
      <Field label="Độ dài">
        <Combobox label="Độ dài" value={String(seconds)} options={SECONDS.filter((s) => s < 10 || omni).map((s) => ({ value: String(s), label: `${s} s` }))} onChange={(v) => setSeconds(Number(v))} />
      </Field>
      {len > seconds && <p className="m-0 text-sm text-warn">Shot dài {len.toFixed(1)} s: clip chỉ phủ {seconds} s đầu{len > 10 ? ", nên tách shot" : ""}</p>}
      {omni && <Pick label="Chất lượng" value={resolution} options={RESOLUTIONS} onChange={setResolution} />}
      <Pick label="Khung" value={aspect} options={opts(["16:9", "9:16"])} onChange={setAspect} />
      <div className="flex items-center gap-2">
        <Button variant="primary" aria-describedby={why ? "vg-why-video" : undefined} disabled={Boolean(why) || sending} onClick={() => void create()}>Tạo clip bằng Flow</Button>
        {st && <span className="text-sm text-muted-foreground">{`Còn ${Math.max(0, st.cap - st.today)} clip hôm nay`}</span>}
      </div>
      {why && <p id="vg-why-video" className="m-0 text-sm text-muted-foreground">{why}</p>}
    </div>
  );
}

function Running({ name, item }: { name: string; item: VgItem | undefined }) {
  const image = item ? kindOf(item) === "image" : false;
  // What the run reached and how long it has run, as the job tray says it, ticking each second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const row = item ? trayItems([], [item], now)[0] : undefined;
  // The list is polled every 2 s and the prompt may have been typed since: the question is
  // worded from the item as it is now, so "không tốn credit" is never said after the typing.
  const stop = async () => {
    let phase = item?.phase;
    if (item) { try { phase = (await vgItems(name)).items.find((x) => x.id === item.id)?.phase ?? phase; } catch { /* keep the polled phase */ } }
    if (await ask(stopText(image, phase), { ok: phase === "sent" ? "Ngừng chờ" : "Huỷ lượt", cancel: "Để chạy tiếp" })) void vgCancel(name).then((r) => { fail(r); void refresh(); });
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Đang tạo {image ? "ảnh" : "clip"} bằng Flow…</span>
      {row ? <span className="text-xs text-muted-foreground" data-testid="vg-progress">{[row.detail, mss(row.elapsed)].filter(Boolean).join(" · ")}</span> : null}
      {item?.phase === "sent"
        ? <Button aria-label="Ngừng chờ lượt Flow đang tạo" onClick={() => void stop()}>Ngừng chờ</Button>
        : <Button aria-label="Huỷ lượt Flow đang tạo" onClick={() => void stop()}>Huỷ</Button>}
    </div>
  );
}

function Items({ name, m, items, busyHere, idle }: { name: string; m: Manifest; items: VgItem[]; busyHere: boolean; idle: boolean }) {
  const act = async (p: Promise<SendResult>) => { fail(await p); void refresh(); };
  const importFile = async (it: VgItem) => {
    const image = kindOf(it) === "image";
    const path = await askText(image ? "Đường dẫn file ảnh (png, jpg, webp) đã lưu từ Flow:" : "Đường dẫn file mp4 đã tải từ Flow:", { ok: "Nhập file" });
    if (path?.trim()) void act(vgImport(name, it.id, m.version, path.trim()));
  };
  return (
    <ul aria-label="Các lần tạo bằng Flow" className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((it) => {
        const image = kindOf(it) === "image";
        // While this project's job runs, its unfinished item is that job's: no actions on it.
        const live = it.state === "intent" || it.state === "running";
        if (live && busyHere) return <li key={it.id} className="rounded-md border border-border p-2 text-sm"><strong>đang tạo</strong> · {image ? "Ảnh" : "Video"} · {it.prompt_head}</li>;
        const state = live && idle ? "indeterminate" : it.state;
        const canAttach = state === "collected" || (state === "cancelled" && it.charge === "charged" && it.files.length > 0);
        const canRecover = state === "made" && !image;
        const canReconcile = state === "indeterminate" && Boolean(it.flow_project);
        const canImport = state === "indeterminate" || state === "failed" || (state === "cancelled" && it.files.length === 0) || (state === "made" && image);
        return (
          <li key={it.id} className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
            <div><strong>{stateLabel(state)}</strong> · {image ? "Ảnh" : "Video"}{it.model ? ` ${it.model}` : ""} · {it.prompt_head} · {hhmm(it.created)}</div>
            {it.error && <div className="text-danger">{it.error}</div>}
            {it.note && <div className="text-muted-foreground">{it.note}</div>}
            {state === "indeterminate" && <div className="text-warn">Có thể đã tốn credit. Bấm Đối chiếu hoặc mở Flow kiểm trước khi tạo lại.</div>}
            {idle && (
              <div className="flex flex-wrap gap-2">
                {canAttach && <Button aria-label={`Gắn vào shot: ${it.prompt_head}`} onClick={() => void act(vgAttach(name, it.id, m.version))}>Gắn vào shot</Button>}
                {canRecover && <Button aria-label={`Tải về từ Flow: ${it.prompt_head}`} onClick={() => void act(vgRecover(name, it.id))}>Tải về từ Flow</Button>}
                {canReconcile && <Button aria-label={`Đối chiếu: ${it.prompt_head}`} onClick={() => void act(vgReconcile(name, it.id))}>Đối chiếu</Button>}
                {canImport && it.part && <Button aria-label={`Dùng file tạm: ${it.prompt_head}`} onClick={() => void act(vgUsePart(name, it.id, m.version))}>Dùng file tạm</Button>}
                {canImport && <Button aria-label={`Nhập file đã tải: ${it.prompt_head}`} onClick={() => void importFile(it)}>Nhập file đã tải</Button>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
