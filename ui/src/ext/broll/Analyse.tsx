// Port of public/broll-search.js; behaviour unchanged.
// "Phân tích footage" (broll-search.js:72-121): before anything runs it shows the files, the files
// not analysed yet and the vision calls the captions will cost (GET /api/broll/plan). The offline
// analysis is free; "Chú thích bằng agent" is enabled only when that number is exact (no file left
// to analyse offline) and the run is capped at it. A running "broll" job is followed every 1.5 s
// until it ends; then the plan and the search are loaded again.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, say } from "@/api/client.ts";
import { brollIndex, brollJobQuery, brollPlanQuery, keys } from "@/api/queries.ts";
import type { Job } from "@/api/types.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { FormError } from "./HitCard.tsx";
import { useBroll, type Scope } from "./store.ts";

export const POLL_MS = 1500;

export interface BrollPlan {
  files: number;
  clips: number;
  new_files: number;
  shots_pending: number;
  sheets: number;
  calls: number;
  settings: { vision: boolean; max_calls_per_run: number; [k: string]: unknown };
}

export const isRunning = (j: Job | null | undefined): boolean => Boolean(j && (j.status === "running" || j.status === "cancelling"));

// The plan's lines, and whether the captions button stays off and its label (paintPlan, :87-98).
export function planView(p: BrollPlan): { lines: string[]; visionOff: boolean; visionLabel: string } {
  const lines = [`${p.files} file video, ${p.clips} clip đã phân tích offline, ${p.new_files} file chưa phân tích.`];
  let visionOff = false;
  if (!p.settings.vision) { lines.push("Đọc ảnh đang tắt (studio.json broll.vision: false): chỉ tìm được theo tên file và lời nói."); visionOff = true; }
  else if (p.new_files) { lines.push(`Chạy "Phân tích offline" trước (không tốn lượt) để biết chính xác số lượt đọc ảnh.`); visionOff = true; }
  else if (!p.shots_pending) { lines.push("Mọi shot đã có chú thích: không cần lượt đọc ảnh nào."); visionOff = true; }
  else lines.push(`${p.shots_pending} shot chưa có chú thích → ${p.sheets} contact sheet → ${p.calls} lượt đọc ảnh (tối đa ${p.settings.max_calls_per_run} lượt mỗi lần chạy).`);
  const visionLabel = p.calls && !p.new_files ? `Chú thích bằng agent (${Math.min(p.calls, p.settings.max_calls_per_run)} lượt)` : "Chú thích bằng agent";
  return { lines, visionOff, visionLabel };
}

// The job box: its state, then the last 6 lines of its log without the RESULT line (paintJob).
export const jobText = (j: Job): string => [
  j.status === "running" ? "Đang chạy" : j.status === "cancelling" ? "Đang huỷ" : j.code === 0 ? "Xong" : `Dừng (mã ${j.code ?? j.signal})`,
  ...(j.tail ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-6),
].join("\n");

export function Analyse() {
  const name = useStudio((s) => s.name);
  const { scope, setScope } = useBroll();
  const scopeParams: Record<string, string> = scope === "project" && name ? { name, scope: "project" } : { scope: "workspace" };
  const plan = useQuery(brollPlanQuery(scopeParams));
  const job = useQuery({ ...brollJobQuery(), refetchInterval: (q) => (isRunning(q.state.data?.job) ? POLL_MS : false) });
  const j = job.data?.job ?? null;
  const running = isRunning(j);

  // A job that ends: the plan and the search again (follow(), :114-115).
  const was = useRef(running);
  useEffect(() => {
    if (was.current && !running) {
      void queryClient.invalidateQueries({ queryKey: keys.brollPlan() });
      void queryClient.invalidateQueries({ queryKey: keys.brollSearch() });
    }
    was.current = running;
  }, [running]);

  const p = plan.data as BrollPlan | undefined;
  const off = running || !p || Boolean(plan.error);
  const v = p && !plan.error ? planView(p) : null;

  const start = async (useVision: boolean) => {
    const open = useStudio.getState().name;
    const body: Record<string, unknown> = { scope, vision: useVision, ...(scope === "project" || open ? { name: open ?? undefined } : {}) };
    if (useVision && p) body.max_calls = Math.min(p.calls, p.settings.max_calls_per_run);
    if (scope === "workspace" && !open) delete body.name;
    const r = await brollIndex(body);
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return; }
    queryClient.setQueryData(keys.brollJob(), { job: (r.data?.job as Job | undefined) ?? null });
  };

  return (
    <details className="flex flex-col gap-2 rounded-md border border-border p-2" open>
      <summary className="cursor-pointer text-sm font-semibold">Phân tích footage</summary>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Select value={scope} onValueChange={(s) => setScope(s as Scope)}>
            <SelectTrigger aria-label="Phạm vi phân tích" size="sm" className="h-8 border-border bg-panel-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace">Cả workspace</SelectItem>
              <SelectItem value="project">Dự án đang mở</SelectItem>
            </SelectContent>
          </Select>
          <span className="flex-1" />
          <Button disabled={off} onClick={() => { void start(false); }}>Phân tích offline</Button>
          <Button variant="primary" disabled={off || Boolean(v?.visionOff)} onClick={() => { void start(true); }}>{v?.visionLabel ?? "Chú thích bằng agent"}</Button>
        </div>
        <div className="grid gap-0.5" data-broll-plan="">
          {plan.error ? <FormError text={plan.error.message} />
            : !p ? <small className="text-xs text-muted-foreground">Đang đếm…</small>
            : v?.lines.map((l) => <small key={l} className="text-xs text-muted-foreground">{l}</small>)}
        </div>
        {j ? <pre className="m-0 max-h-36 overflow-auto rounded-sm bg-panel-2 p-2 text-xs whitespace-pre-wrap" data-broll-log="">{jobText(j)}</pre> : null}
      </div>
    </details>
  );
}
