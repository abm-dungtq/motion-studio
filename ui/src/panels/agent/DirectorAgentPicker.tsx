// "Đạo diễn chạy bằng": the agent CLIs the director can run on (GET /api/director/agents), one
// radio each with its version, login and guard level. An agent that cannot run now (not installed,
// logged out, no way to run it) is disabled with the reason. A pick is saved in studio.json
// (POST /api/director/agent) and used from the next request.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { setDirectorAgent, useDirectorAgents } from "@/api/queries.ts";
import type { DirectorAgent } from "@/api/types.ts";

const login = (a: DirectorAgent) => (a.logged_in === true ? "đã đăng nhập" : a.logged_in === false ? "chưa đăng nhập" : "chưa rõ đăng nhập");

// The line under an agent's name: version and login, or why it cannot be chosen.
export function agentNote(a: DirectorAgent): string {
  if (!a.selectable) return a.reason ?? "Chưa chọn được";
  return [a.version, login(a), a.guard_label ? `rào: ${a.guard_label}` : null].filter(Boolean).join(" · ");
}

export function DirectorAgentPicker({ reload }: { reload: () => void }) {
  const { data, error } = useDirectorAgents();
  const [busy, setBusy] = useState(false);
  if (error) return <p className="m-0 text-xs text-danger">{`Không đọc được danh sách agent cho đạo diễn: ${error.message}`}</p>;
  if (!data) return <p className="m-0 text-xs text-muted-foreground">Đang dò agent…</p>;
  const pick = async (id: string) => {
    if (id === data.agent || busy) return;
    setBusy(true);
    const r = await setDirectorAgent(id);
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? `Không đổi được agent (${r.status})`, true); return; }
    say(`Đạo diễn sẽ chạy bằng ${data.agents.find((a) => a.id === id)?.label ?? id} từ yêu cầu sau`);
    reload();
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" data-director-agents aria-busy={busy}>
      <legend className="mb-1 text-muted-foreground">Đạo diễn chạy bằng</legend>
      {data.agents.map((a) => (
        <label key={a.id} className={`flex items-start gap-2 ${a.selectable ? "cursor-pointer" : "opacity-60"}`} title={a.selectable ? undefined : a.reason ?? undefined}>
          <input
            type="radio" name="director-agent" value={a.id} className="mt-1"
            checked={a.id === data.agent} disabled={busy || (!a.selectable && a.id !== data.agent)}
            onChange={() => { void pick(a.id); }}
          />
          <span className="flex flex-col">
            <span>{a.label}</span>
            <span className="text-xs text-muted-foreground">{agentNote(a)}</span>
          </span>
        </label>
      ))}
      <p className="m-0 text-xs text-muted-foreground">Với mọi agent, Studio giữ BRIEF.md và dòng duyệt của DEMO.md: đạo diễn sửa thì Studio khôi phục và dừng lượt đó.</p>
    </fieldset>
  );
}
