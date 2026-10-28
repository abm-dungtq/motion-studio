// The videogen routes (routes/videogen.mjs) as the shot inspector and the agent row read them.
import { api, send, type SendResult } from "@/api/client.ts";

export interface VgStatus {
  bin: string; found: boolean; version: string | null; tested: boolean; profile: string | null;
  today: number; cap: number; images_today: number; image_cap: number; waf_until: string | null;
  job: { id: string; name: string } | null;
}
export type VgKind = "video" | "image";
export type VgState = "intent" | "running" | "collected" | "made" | "attached" | "failed" | "indeterminate" | "cancelled";
export interface VgItem {
  id: string; shot: string; kind?: VgKind; model?: string | null; state: VgState; charge: string | null; media_id?: string | null;
  flow_project?: string | null; phase?: "spawned" | "typed" | "sent" | null; reconcile?: boolean; recover_failed?: number;
  error: string | null; files: string[]; prompt_head: string; created: string; updated: string; version: number | null; note?: string;
  // The run left a non-empty temp file (gflow may have made it before the run stopped).
  part?: boolean;
}
export interface VgCreate { name: string; shot: string; base: number; prompt: string; mode: string; model: string; aspect: string; seconds: number; resolution?: string; refs: string[]; again?: string }
export interface VgImageCreate { name: string; shot: string; base: number; prompt: string; mode: string; model: string; aspect: string; refs: string[]; again?: string }

// Same lists as lib/videogen/models.mjs.
export const VIDEO_MODELS = ["omni-flash", "veo-lite", "veo-fast", "veo-quality"];
export const IMAGE_MODELS = ["nano2", "nano2.1", "nano-pro", "nano2-lite"];
export const IMAGE_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
export const DEFAULT_VIDEO_MODEL = "veo-lite";
export const DEFAULT_IMAGE_MODEL = "nano2";
// Same as pickSeconds of lib/videogen/spec.mjs: the shortest clip length that covers d seconds.
export const SECONDS = [4, 6, 8, 10];
export const pickSeconds = (d: number): number => SECONDS.find((s) => s >= Number(d) - 0.01) ?? 10;

export const vgStatus = () => api<VgStatus>("/api/videogen/status");
export const vgItems = (name: string) => api<{ items: VgItem[] }>(`/api/videogen/items?name=${encodeURIComponent(name)}`);
export const vgCreate = (body: VgCreate): Promise<SendResult> => send("/api/videogen/shot", { ...body });
export const vgImage = (body: VgImageCreate): Promise<SendResult> => send("/api/videogen/image", { ...body });
export const vgRecover = (name: string, id: string) => send("/api/videogen/recover", { name, id });
export const vgReconcile = (name: string, id: string) => send("/api/videogen/reconcile", { name, id });
export const vgAuth = () => send("/api/videogen/auth", {});
export const vgCancel = (name: string) => send("/api/videogen/cancel", { name });
export const vgAttach = (name: string, id: string, base: number) => send("/api/videogen/attach", { name, id, base });
export const vgImport = (name: string, id: string, base: number, path: string) => send("/api/videogen/import", { name, id, base, path });
export const vgUsePart = (name: string, id: string, base: number) => send("/api/videogen/import", { name, id, base, part: true });

const LABEL: Record<VgState, string> = {
  intent: "đang chuẩn bị",
  running: "Flow đang tạo",
  collected: "đã tải về, chưa gắn",
  made: "đã tạo trên Flow, chưa tải về",
  attached: "đã gắn vào shot",
  failed: "lỗi",
  indeterminate: "chưa rõ kết quả",
  cancelled: "đã huỷ",
};
export const stateLabel = (s: VgState): string => LABEL[s] ?? s;
export const kindOf = (it: VgItem): VgKind => it.kind ?? "video";
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
