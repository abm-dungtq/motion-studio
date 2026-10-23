// Port of the pure part of public/agent.js (commit 2d65edf): the chip's dot level, label and title
// from GET /api/agent. Logic and text unchanged; the DOM half is shell/AgentChip.tsx. No React.
// Dot: green when claude is found and not known to be logged out, amber when login is unknown, red
// when claude is missing or logged out, or when Studio has no provider (data.provider null).
export const AGENT_EVERY_MS = 60000;
export const JOB: Record<string, string> = { running: "đang chạy", done: "xong", failed: "lỗi", cancelled: "đã huỷ", cancelling: "đang huỷ" };

export const semver = (v: unknown): string | null => /\d+\.\d+\.\d+/.exec(String(v ?? ""))?.[0] ?? null;

export interface AgentCliLike { found?: boolean; error?: unknown; logged_in?: boolean | null; caps?: Record<string, string> | null }
export interface AgentLike {
  claude: { found: boolean; version?: string | null; logged_in?: boolean | null };
  provider?: { label?: string; version?: string | null } | null;
  provider_error?: { error?: string; hint?: string } | null;
  agents?: AgentCliLike[] | null;
}
export type AgentLevel = "ok" | "unknown" | "bad";

export function level(a: AgentLike | null | undefined): AgentLevel {
  if (!a) return "unknown";
  if (a.provider === null) return "bad";
  // A malformed answer (no claude block) counts as Claude Code not found, not as a crash.
  if (!a.claude?.found || a.claude.logged_in === false) return "bad";
  return a.claude.logged_in === null ? "unknown" : "ok";
}

// Agents that can do work now: found, runnable and not known to be logged out.
export const usableAgents = <T extends AgentCliLike>(list: T[] | null | undefined): T[] =>
  (Array.isArray(list) ? list.filter((a) => a.found && !a.error && a.logged_in !== false && Object.values(a.caps ?? {}).includes("yes")) : []);

// What the chip shows: dot level, label and title (agent.js paint()).
export function chip(data: AgentLike | null | undefined, error: string | null): { level: AgentLevel; label: string; title: string } {
  const lv = error ? "bad" : level(data);
  const v = semver(data?.claude?.version);
  const noProvider = data?.provider === null;
  const n = usableAgents(data?.agents).length;
  const label = noProvider ? "Chưa có provider"
    : data && !data.claude?.found ? `Claude Code: không thấy${n ? ` · ${n} agent` : ""}`
    : `Claude Code${v ? ` ${v}` : ""}${n ? ` · ${n} agent` : ""}`;
  const title = error ? `Không đọc được trạng thái agent: ${error}`
    : noProvider ? (data?.provider_error?.error ?? "Chưa có provider")
    : { ok: "Claude Code sẵn sàng", unknown: "Chưa rõ đã đăng nhập Claude Code chưa", bad: "Claude Code chưa sẵn sàng" }[lv];
  return { level: lv, label, title };
}
