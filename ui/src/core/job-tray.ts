// The job tray's rows: the project's long jobs (export, timing, director…) and its Flow runs, in
// one list with a label, the time they ran and a status in four words. Running rows and rows that
// ended in the last 10 minutes only, newest first.
import type { Job } from "@/api/types.ts";
import type { VgItem, VgState } from "@/ext/videogen/api.ts";

export type TrayStatus = "running" | "done" | "failed" | "cancelled";
export interface TrayItem {
  id: string;
  source: "job" | "flow";
  label: string;
  // Milliseconds from the start to now (running) or to the end.
  elapsed: number;
  status: TrayStatus;
  detail?: string;
  cancel?: boolean;
  // The export dialog is worth a button once an export is done.
  kind?: string;
  started: number;
}

export const RECENT_MS = 10 * 60 * 1000;

export function jobStatus(j: Pick<Job, "status" | "code">): TrayStatus {
  if (j.status === "running" || j.status === "cancelling") return "running";
  if (j.status === "done" || j.status === "failed" || j.status === "cancelled") return j.status;
  if (j.code === null) return "running";
  return j.code === 0 ? "done" : "failed";
}

const STEP: Record<string, string> = { render: "đang render", compress: "đang nén", bundle: "đang gói bộ lớp dựng" };
const KIND: Record<string, string> = { timing: "Ghi mốc thời gian", "word-sync": "Khớp chữ", director: "Đạo diễn đang làm" };

export function jobLabel(j: Pick<Job, "kind" | "meta">): string {
  if (j.kind === "export") {
    const step = j.meta?.step ? STEP[j.meta.step] : undefined;
    return step ? `Xuất video · ${step}` : "Xuất video";
  }
  if (j.meta?.request) return KIND.director;
  return KIND[j.kind] ?? j.kind;
}

const FLOW_STATE: Record<VgState, TrayStatus> = {
  intent: "running", running: "running",
  made: "done", attached: "done", collected: "done",
  failed: "failed", indeterminate: "failed",
  cancelled: "cancelled",
};
export const PHASE: Record<string, string> = { spawned: "Đang mở Flow", typed: "Đã điền prompt", sent: "Đã gửi, đã tính lượt" };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function flowItem(it: VgItem, now: number): TrayItem {
  const status = FLOW_STATE[it.state] ?? "running";
  const started = ms(it.created);
  const end = status === "running" ? now : ms(it.updated) || now;
  return {
    id: `flow:${it.id}`,
    source: "flow",
    label: `${it.kind === "image" ? "Tạo ảnh" : "Tạo clip"} bằng Flow · Shot ${it.shot}`,
    elapsed: Math.max(0, end - started),
    status,
    detail: status === "running" && it.phase ? PHASE[it.phase] : undefined,
    cancel: status === "running" || undefined,
    started,
  };
}

export function jobItem(j: Job, now: number): TrayItem {
  const status = jobStatus(j);
  const started = ms(j.started);
  const end = status === "running" ? now : ms(j.ended) || now;
  return {
    id: `job:${j.id}`,
    source: "job",
    label: jobLabel(j),
    elapsed: Math.max(0, end - started),
    status,
    cancel: (status === "running" && j.status !== "cancelling") || undefined,
    kind: j.kind,
    started,
  };
}

export function trayItems(jobs: Job[], vg: VgItem[], now: number): TrayItem[] {
  const all = [...jobs.map((j) => jobItem(j, now)), ...vg.map((it) => flowItem(it, now))];
  return all
    .filter((x) => x.status === "running" || now - (x.started + x.elapsed) <= RECENT_MS)
    .sort((a, b) => b.started - a.started);
}

// 75 000 ms → "1:15".
export const mss = (elapsed: number) => {
  const s = Math.floor(elapsed / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
