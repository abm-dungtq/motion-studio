// The videogen routes (routes/videogen.mjs) as the shot inspector and the agent row read them.
import { api, send, type SendResult } from "@/api/client.ts";

export interface VgStatus { glabs_url: string; up: boolean; error: string | null; key: boolean; today: number; cap: number; job: { id: string; name: string } | null }
export type VgState = "intent" | "submitted" | "running" | "collected" | "attached" | "failed" | "indeterminate" | "cancelled";
export interface VgItem { id: string; shot: string; state: VgState; charge: string | null; task_id: string | null; error: string | null; files: string[]; prompt_head: string; created: string; updated: string; version: number | null; note?: string }
export interface VgCreate { name: string; shot: string; base: number; prompt: string; mode: string; aspect: string; seconds: number; resolution: string; refs: string[]; again?: string }

// Same as pickSeconds of lib/videogen/spec.mjs: the shortest clip length that covers d seconds.
export const SECONDS = [4, 6, 8, 10];
export const pickSeconds = (d: number): number => SECONDS.find((s) => s >= Number(d) - 0.01) ?? 10;

export const vgStatus = () => api<VgStatus>("/api/videogen/status");
export const vgItems = (name: string) => api<{ items: VgItem[] }>(`/api/videogen/items?name=${encodeURIComponent(name)}`);
export const vgCreate = (body: VgCreate): Promise<SendResult> => send("/api/videogen/shot", { ...body });
export const vgResume = (name: string, id: string) => send("/api/videogen/resume", { name, id });
export const vgCancel = (name: string) => send("/api/videogen/cancel", { name });
export const vgAttach = (name: string, id: string, base: number) => send("/api/videogen/attach", { name, id, base });
export const vgImport = (name: string, id: string, base: number, path: string) => send("/api/videogen/import", { name, id, base, path });

const LABEL: Record<VgState, string> = {
  intent: "đang chuẩn bị",
  submitted: "đã gửi G-Labs",
  running: "G-Labs đang tạo",
  collected: "đã tải về, chưa gắn",
  attached: "đã gắn vào shot",
  failed: "lỗi",
  indeterminate: "chưa rõ kết quả",
  cancelled: "đã huỷ",
};
export const stateLabel = (s: VgState): string => LABEL[s] ?? s;
