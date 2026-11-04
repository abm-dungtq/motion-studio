// Port of the pure part of public/agent.js (commit 2d65edf): the chip's dot level, label and title
// from GET /api/agent. Logic and text unchanged; the DOM half is shell/AgentChip.tsx. No React.
// Dot: green when the director's agent (director; claude from an older server) is found and not
// known to be logged out, amber when login is unknown, red when it is missing or logged out, or when
// Studio has no provider (data.provider null).
export const AGENT_EVERY_MS = 60000;
export const JOB: Record<string, string> = { running: "đang chạy", done: "xong", failed: "lỗi", cancelled: "đã huỷ", cancelling: "đang huỷ" };

export const semver = (v: unknown): string | null => /\d+\.\d+\.\d+/.exec(String(v ?? ""))?.[0] ?? null;

export interface AgentCliLike { found?: boolean; error?: unknown; logged_in?: boolean | null; caps?: Record<string, string> | null }
export interface AgentCheck { found: boolean; version?: string | null; logged_in?: boolean | null }
export interface AgentLike {
  claude: AgentCheck;
  director?: AgentCheck & { label?: string } | null;
  provider?: { label?: string; version?: string | null } | null;
  provider_error?: { error?: string; hint?: string } | null;
  agents?: AgentCliLike[] | null;
}
export type AgentLevel = "ok" | "unknown" | "bad";

// The director's agent check and its name: director, or claude from a server without it.
export const directorOf = (a: AgentLike | null | undefined): { check: AgentCheck | undefined; label: string } =>
  (a?.director ? { check: a.director, label: a.director.label ?? "Agent" } : { check: a?.claude, label: "Claude Code" });

export function level(a: AgentLike | null | undefined): AgentLevel {
  if (!a) return "unknown";
  if (a.provider === null) return "bad";
  // A malformed answer (no claude block) counts as the agent not found, not as a crash.
  const { check } = directorOf(a);
  if (!check?.found || check.logged_in === false) return "bad";
  return check.logged_in === null ? "unknown" : "ok";
}

// Agents that can do work now: found, runnable and not known to be logged out.
export const usableAgents = <T extends AgentCliLike>(list: T[] | null | undefined): T[] =>
  (Array.isArray(list) ? list.filter((a) => a.found && !a.error && a.logged_in !== false && Object.values(a.caps ?? {}).includes("yes")) : []);

// What the chip shows: dot level, label and title (agent.js paint()).
export function chip(data: AgentLike | null | undefined, error: string | null): { level: AgentLevel; label: string; title: string } {
  const lv = error ? "bad" : level(data);
  const { check, label: who } = directorOf(data);
  const v = semver(check?.version);
  const noProvider = data?.provider === null;
  const n = usableAgents(data?.agents).length;
  const label = noProvider ? "Chưa có provider"
    : data && !check?.found ? `${who}: không thấy${n ? ` · ${n} agent` : ""}`
    : `${who}${v ? ` ${v}` : ""}${n ? ` · ${n} agent` : ""}`;
  const title = error ? `Không đọc được trạng thái agent: ${error}`
    : noProvider ? (data?.provider_error?.error ?? "Chưa có provider")
    : { ok: `Đạo diễn chạy bằng ${who}, sẵn sàng`, unknown: `Chưa rõ đã đăng nhập ${who} chưa`, bad: `${who} chưa sẵn sàng` }[lv];
  return { level: lv, label, title };
}
