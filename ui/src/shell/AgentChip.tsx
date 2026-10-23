// The agent chip of the top bar (public/agent.js): a dot by level (ok, unknown, bad), the label
// "Claude Code <version> · N agent", a title saying why. GET /api/agent reloads every 60 s, when
// a project opens (the key has the name) and when the chip is pressed; pressing opens AgentDialog.
import { useAgent } from "@/api/queries.ts";
import { chip } from "@/core/agent-status.ts";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";

const DOT = { ok: "bg-ok", unknown: "bg-warn", bad: "bg-danger" } as const;

export function AgentChip() {
  const name = useStudio((s) => s.name);
  const open = useStudio((s) => s.dialog === "agent");
  const { data, error, refetch: reloadAgent } = useAgent(name);
  const c = chip(data, error ? error.message : null);
  return (
    <button
      type="button"
      title={c.title}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => { useStudio.getState().openDialog("agent"); void reloadAgent(); }}
      className="flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground hover:bg-panel-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span aria-hidden="true" data-level={c.level} className={cn("size-2 rounded-full", DOT[c.level])} />
      <span>{c.label}</span>
    </button>
  );
}
