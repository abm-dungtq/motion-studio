// The top bar (public/index.html:13-25), 44 px: brand, project picker, "Dự án mới", project title,
// then on the right the agent chip, versions, undo/redo, the gate chip and "Xuất bản".
import { Plus, Redo2, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { actions } from "@/api/actions.ts";
import { useProject } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { AgentChip } from "./AgentChip.tsx";
import { Button } from "./controls.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { GateChip } from "./GateChip.tsx";
import { ProjectSelect } from "./ProjectSelect.tsx";
import { VersionSelect } from "./VersionSelect.tsx";

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span keeps the tooltip on a disabled button (disabled buttons get no pointer events). */}
        <span className="inline-flex">
          <Button variant="icon" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const editable = Boolean(m?.capabilities?.editable);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
      <div className="shrink-0 text-sm font-semibold tracking-tight">Motion Studio</div>
      <ProjectSelect />
      <Button aria-haspopup="dialog" onClick={() => useStudio.getState().openDialog("new-project")}><Plus />Dự án mới</Button>
      <div data-testid="project-title" className="min-w-0 truncate text-sm text-muted-foreground">{m?.title ?? ""}</div>
      <div className="flex-1" />
      <AgentChip />
      <VersionSelect />
      <IconAction label="Hoàn tác (Ctrl/Cmd+Z)" disabled={!editable} onClick={() => { void actions.undo(); }}><Undo2 /></IconAction>
      <IconAction label="Làm lại (Ctrl/Cmd+Shift+Z)" disabled={!editable} onClick={() => { void actions.redo(); }}><Redo2 /></IconAction>
      <GateChip />
      <ExportMenu />
    </header>
  );
}
