// The shot inspector's "Clip AI (G-Labs)" section: one Omni Flash clip for the shot through the
// G-Labs Studio webhook (routes/videogen.mjs, docs/videogen.md). Every send costs Flow credits, so
// only this button starts one, after a confirm; an unknown earlier result of the same request
// needs a second confirm, and a task G-Labs still has is followed instead of sent again. The list below shows this shot's clips and what can be done with each.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, say, type SendResult } from "@/api/client.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { pickSeconds, SECONDS, stateLabel, vgAttach, vgCancel, vgCreate, vgImport, vgItems, vgResume, vgStatus, type VgItem } from "./api.ts";

const SELECT = "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";
const IMAGE = /\.(png|jpe?g|webp)$/i;
const MODES = [{ v: "t2v", label: "Chỉ chữ", refs: 0 }, { v: "start", label: "Ảnh đầu", refs: 1 }, { v: "start_end", label: "Ảnh đầu + cuối", refs: 2 }];
const RESOLUTIONS = [{ v: "720p", label: "720p" }, { v: "720p+1080p", label: "720p + 1080p" }, { v: "360p", label: "360p nháp" }];
const refresh = () => queryClient.invalidateQueries({ queryKey: ["videogen"] });
const fail = (r: SendResult) => { if (r.status !== 200) say(r.error ?? `lỗi ${r.status}`, true); return r.status === 200; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center gap-2 text-sm"><span className="w-24 shrink-0 text-muted-foreground">{label}</span>{children}</label>;
}

export function ShotVideogen({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const shot = m?.shots?.find((s) => s.id === pick.id);
  const status = useQuery({ queryKey: ["videogen", "status"], queryFn: vgStatus, refetchInterval: 5000 });
  const st = status.data;
  const busyHere = Boolean(st?.job && st.job.name === name);
  const items = useQuery({ queryKey: ["videogen", "items", name], queryFn: () => vgItems(name!), enabled: Boolean(name), refetchInterval: busyHere ? 2000 : false });
  const len = shot ? Number(shot.end) - Number(shot.start) : 0;
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("t2v");
  const [seconds, setSeconds] = useState(() => pickSeconds(len));
  const [resolution, setResolution] = useState("720p");
  const [aspect, setAspect] = useState((m?.height ?? 0) > (m?.width ?? 0) ? "9:16" : "16:9");
  const [refs, setRefs] = useState<string[]>(["", ""]);
  const [sending, setSending] = useState(false);
  // The job's end settles its item (attached, indeterminate…): fetch the list once more.
  const wasBusy = useRef(busyHere);
  useEffect(() => {
    if (wasBusy.current && !busyHere) void refresh();
    wasBusy.current = busyHere;
  }, [busyHere]);
  if (!shot || !name) return null;

  const need = MODES.find((x) => x.v === mode)?.refs ?? 0;
  const images = (shot.assets ?? []).filter((a) => IMAGE.test(a));
  const chosen = refs.slice(0, need);
  const mine = (items.data?.items ?? []).filter((x) => x.shot === shot.id);
  const idle = !st?.job;

  const why = !st ? "Đang kiểm G-Labs…"
    : !st.up ? (st.error ?? "Mở G-Labs Studio")
    : !st.key ? "Chưa có khoá G-Labs (xem docs/videogen.md)"
    : st.today >= st.cap ? `Đã đủ ${st.cap} clip hôm nay`
    : st.job ? "Đang tạo một clip khác"
    : !prompt.trim() ? "Nhập mô tả chuyển động"
    : chosen.length < need || chosen.some((x) => !x) ? "Chọn đủ ảnh cho kiểu này"
    : null;

  const create = async () => {
    if (!st) return;
    const res = resolution === "360p" && mode !== "t2v" ? "720p" : resolution;
    if (!window.confirm(`Tạo clip ${seconds}s ${res} bằng Omni Flash qua G-Labs? Lượt này tốn credit Flow (app ghi "Omni −4 ~ 15 credit"). Hôm nay: ${st.today}/${st.cap}.`)) return;
    setSending(true);
    try {
      const body = { name, shot: shot.id, base: m!.version, prompt, mode, aspect, seconds, resolution: res, refs: chosen };
      const r = await vgCreate(body);
      if (r.code === "DUPLICATE") {
        if (window.confirm("Lần trước của đúng yêu cầu này chưa rõ kết quả và có thể đã tốn credit. Vẫn tạo lại (có thể tốn credit lần hai)?")) fail(await vgCreate({ ...body, again: String(r.id) }));
      } else if (r.code === "RESUMABLE") {
        if (window.confirm("G-Labs đang có task của đúng yêu cầu này. Theo dõi tiếp (không tốn thêm credit)?")) fail(await vgResume(name, String(r.id)));
      } else fail(r);
    } finally {
      setSending(false);
      void refresh();
    }
  };
  const act = async (p: Promise<SendResult>) => { fail(await p); void refresh(); };
  const importFile = (it: VgItem) => {
    const path = window.prompt("Đường dẫn file mp4 đã tải từ G-Labs (thư mục lưu trong Cài đặt của G-Labs):");
    if (path) void act(vgImport(name, it.id, m!.version, path.trim()));
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Clip AI (G-Labs)">
      <h3 className="m-0 text-sm font-semibold">Clip AI (G-Labs)</h3>
      <Textarea aria-label="Mô tả chuyển động" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Máy quay chậm tiến vào, sóng vỗ…" />
      <Field label="Kiểu">
        <select aria-label="Kiểu" className={SELECT} value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
        </select>
      </Field>
      {need > 0 && (images.length ? (["Ảnh đầu", "Ảnh cuối"].slice(0, need).map((label, i) => (
        <Field key={label} label={label}>
          <select aria-label={label} className={`${SELECT} min-w-0 flex-1`} value={refs[i]} onChange={(e) => setRefs((r) => r.map((x, j) => (j === i ? e.target.value : x)))}>
            <option value="">—</option>
            {images.map((a) => <option key={a} value={a}>{a.split("/").pop()}</option>)}
          </select>
        </Field>
      ))) : <p className="m-0 text-sm text-warn">Shot chưa có ảnh; thêm ảnh vào shot hoặc dùng Chỉ chữ</p>)}
      <Field label="Độ dài">
        <select aria-label="Độ dài" className={SELECT} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {SECONDS.map((s) => <option key={s} value={s}>{s} s</option>)}
        </select>
      </Field>
      {len > 10 && <p className="m-0 text-sm text-warn">Shot dài hơn 10 s: clip chỉ phủ 10 s đầu, nên tách shot</p>}
      <Field label="Chất lượng">
        <select aria-label="Chất lượng" className={SELECT} value={resolution} onChange={(e) => setResolution(e.target.value)}>
          {RESOLUTIONS.filter((x) => x.v !== "360p" || mode === "t2v").map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
        </select>
      </Field>
      <Field label="Khung">
        <select aria-label="Khung" className={SELECT} value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
        </select>
      </Field>
      <div><Button variant="primary" disabled={Boolean(why) || sending} onClick={() => void create()}>Tạo clip AI</Button></div>
      {why && <p className="m-0 text-sm text-muted-foreground">{why}</p>}
      {busyHere && (
        <div className="flex items-center gap-2 text-sm">
          <span>Đang tạo clip AI…</span>
          <Button onClick={() => void act(vgCancel(name))}>Huỷ</Button>
        </div>
      )}
      {mine.length > 0 && (
        <ul aria-label="Các lần tạo clip AI" className="m-0 flex list-none flex-col gap-2 p-0">
          {mine.map((it) => {
            // While this project's job runs, its unfinished item is that job's: no actions on it.
            const live = ["intent", "submitted", "running"].includes(it.state);
            if (live && busyHere) return <li key={it.id} className="rounded-md border border-border p-2 text-sm"><strong>đang tạo</strong> · {it.prompt_head}</li>;
            const state = it.state === "intent" && idle ? "indeterminate" : it.state;
            return (
              <li key={it.id} className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
                <div><strong>{stateLabel(state)}</strong> · {it.prompt_head} · {new Date(it.created).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}{it.task_id ? ` · ${it.task_id.slice(0, 8)}` : ""}</div>
                {it.error && <div className="text-danger">{it.error}</div>}
                {it.note && <div className="text-muted-foreground">{it.note}</div>}
                {state === "indeterminate" && <div className="text-warn">Có thể đã tốn credit. Kiểm tra trong G-Labs trước khi tạo lại.</div>}
                <div className="flex flex-wrap gap-2">
                  {(state === "submitted" || state === "running") && idle && <Button onClick={() => void act(vgResume(name, it.id))}>Theo dõi tiếp</Button>}
                  {(state === "collected" || (state === "cancelled" && it.charge === "charged" && it.files.length > 0)) && <Button onClick={() => void act(vgAttach(name, it.id, m!.version))}>Gắn vào shot</Button>}
                  {(state === "indeterminate" || state === "failed" || state === "cancelled") && idle && <Button onClick={() => importFile(it)}>Nhập file đã tải</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
