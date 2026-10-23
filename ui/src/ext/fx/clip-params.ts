// Port of public/fx-footage.js; behaviour unchanged.
// The pure part of "Sửa clip": the operations, the presets, the editor's form state and how it
// turns into the params POST /api/fx/footage takes, and how a finished "fx" job reads.
import type { Job } from "@/api/types.ts";

export type Op = "trim" | "speed" | "freeze" | "grade" | "reframe";
export const OPS: readonly [Op, string][] = [
  ["trim", "Cắt đoạn"], ["speed", "Đổi tốc độ"], ["freeze", "Đứng hình"], ["grade", "Chỉnh màu"], ["reframe", "Cắt khung"],
];
export const PRESETS: readonly [string, string][] = [["warm", "Ấm"], ["cool", "Lạnh"], ["punchy", "Đậm"], ["mono", "Đen trắng"], ["faded", "Phai"]];
export const ASPECTS = ["9:16", "1:1", "4:5", "16:9"] as const;
export const POLL_MS = 1000;
export const WAIT_MS = 30 * 60 * 1000;
const RESULT = "RESULT ";
export const isVideo = (p: unknown): boolean => /\.(mp4|mov|m4v|webm|mkv)$/i.test(String(p));

// The form of one editor: strings as typed, so a half-typed number stays as it is.
export interface EditorForm {
  src: string; op: Op;
  in: string; out: string;
  anchors: string; audio: boolean;
  at: string; hold: string;
  look: string; intensity: string;
  aspect: string; points: string;
}
export const defaultForm = (src: string): EditorForm => ({
  src, op: "trim", in: "0", out: "2", anchors: "0:1, 2:2", audio: false, at: "1", hold: "1", look: "identity", intensity: "1", aspect: "9:16", points: "0:0.5:0.5",
});

// "0:1, 2:2" → [{ t: 0, rate: 1 }, { t: 2, rate: 2 }] ; keys names the fields of each point.
export function parsePoints(text: string, keys: string[]): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (const part of String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const nums = part.split(/[:\s]+/).map(Number);
    if (nums.length !== keys.length || nums.some((n) => !Number.isFinite(n))) throw new Error(`"${part}" phải có dạng ${keys.join(":")}`);
    out.push(Object.fromEntries(keys.map((k, i) => [k, nums[i]])));
  }
  if (!out.length) throw new Error(`cần ít nhất một điểm ${keys.join(":")}`);
  return out;
}

export function paramsOf(s: EditorForm): Record<string, unknown> {
  const n = (v: string, what: string) => { const x = Number(v); if (v === "" || !Number.isFinite(x)) throw new Error(`${what} phải là số`); return x; };
  if (s.op === "trim") return { in: n(s.in, "Từ giây"), out: n(s.out, "Đến giây") };
  if (s.op === "speed") return { anchors: parsePoints(s.anchors, ["t", "rate"]), audio: s.audio };
  if (s.op === "freeze") return { at: n(s.at, "Tại giây"), duration: n(s.hold, "Giữ") };
  if (s.op === "grade") return { ...(s.look.startsWith("preset:") ? { preset: s.look.slice(7) } : { lut: s.look }), intensity: n(s.intensity, "Cường độ") };
  return { aspect: s.aspect, anchors: parsePoints(s.points, ["t", "x", "y"]) };
}

// The RESULT line the footage job prints last (lib/fx/footage.mjs).
export interface ClipResult {
  ok: true;
  rel: string;
  out?: string;
  actual_duration?: number;
  cached?: boolean;
  receipt?: { id?: string; pass?: boolean; file?: string } | null;
  warnings?: string[];
  [k: string]: unknown;
}
export type JobOutcome = { result: ClipResult; error: null } | { result: null; error: string };

export const isRunning = (j: Job): boolean => j.status === "running" || j.status === "cancelling";

// A job that ended: its result, or what went wrong. lines: the job's tail and its log lines.
export function outcomeOf(j: Job, lines: readonly string[]): JobOutcome {
  const line = [...lines].reverse().find((l) => l.startsWith(RESULT));
  let out: { ok?: boolean; error?: string } | null = null;
  try { out = line ? JSON.parse(line.slice(RESULT.length)) : null; } catch { out = null; }
  if (out?.ok) return { result: out as ClipResult, error: null };
  return { result: null, error: out?.error ?? `job ${j.status}: ${lines.slice(-2).join(" | ")}` };
}
