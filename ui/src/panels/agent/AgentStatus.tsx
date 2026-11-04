// Port of public/agent.js (the body of the popover, fill()). The rows of GET /api/agent: provider,
// the director's agent (director, Claude Code for an older server), login, runner, the project's
// last job, ffprobe, ffmpeg, what to do when something is missing, then the agent picker.
// The dialog's title is the old "Agent trên máy" head.
import type { ReactNode } from "react";
import type { AgentRowProps } from "@/ext/registry.ts";
import { JOB } from "@/core/agent-status.ts";
import { when } from "@/core/ui-format.ts";
import { useStudio } from "@/store/studio.ts";
import { DirectorAgentPicker } from "./DirectorAgentPicker.tsx";

// How to log in to each director agent, in a terminal.
const LOGIN: Record<string, string> = { claude: "claude", codex: "codex login", opencode: "opencode auth login" };

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

const NOTE = "m-0 text-xs text-muted-foreground";

export function AgentStatus({ data, error, reload }: AgentRowProps) {
  const name = useStudio((s) => s.name);
  if (error) return <p className="m-0 text-sm text-danger">{`Không đọc được trạng thái: ${error.message}`}</p>;
  if (!data) return <p className="m-0 text-sm text-muted-foreground">Đang kiểm tra…</p>;
  const c = data.director ?? { id: "claude", label: "Claude Code", guard: "full", guard_label: null, ...(data.claude ?? { found: false }) };
  const j = data.last_job;
  const pv = data.provider;
  const pe = data.provider_error;
  return (
    <div className="flex flex-col gap-1.5" data-agent-rows="status">
      <Row k="Provider" v={pv ? `${pv.label}${pv.version ? ` ${pv.version}` : ""}` : "chưa có"} />
      {!pv && pe ? <p className="m-0 text-sm text-danger">{pe.error}</p> : null}
      {!pv && pe?.hint ? <p className={NOTE}>{pe.hint}</p> : null}
      <Row k={c.label} v={c.found ? (c.version ?? "có, chưa rõ phiên bản") : "không tìm thấy"} />
      <Row k="Đăng nhập" v={c.logged_in === true ? "có" : c.logged_in === false ? "chưa" : "chưa rõ"} />
      <Row k="Runner" v={data.runner === "mcp" ? "mcp: chờ phiên Claude Code đang mở" : `cli: chạy ${c.label} trên máy`} />
      {c.guard_label ? <Row k="Rào an toàn" v={c.guard_label} /> : null}
      <Row k="Job gần nhất" v={j ? `${JOB[j.status] ?? j.status}${j.code != null ? ` (exit ${j.code})` : ""} · ${when(j.started)}` : name ? "chưa có" : "mở một dự án để xem"} />
      <Row k="ffprobe" v={data.ffprobe ? "có" : "không tìm thấy"} />
      <Row k="ffmpeg" v={data.ffmpeg ? "có" : "không tìm thấy"} />
      {!c.found ? <p className={NOTE}>{`Cài ${c.label} rồi mở lại Studio, hoặc chọn agent khác bên dưới, để đạo diễn AI chạy trên máy.`}</p> : null}
      {c.found && c.logged_in !== true && LOGIN[c.id] ? <p className={NOTE}>Mở Terminal và chạy <code>{LOGIN[c.id]}</code> để đăng nhập.</p> : null}
      <DirectorAgentPicker reload={reload} />
    </div>
  );
}
