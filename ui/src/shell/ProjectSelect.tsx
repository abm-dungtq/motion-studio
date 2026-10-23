// The project picker of the top bar (public/index.html:15, app.js loadProjects): the first item is
// "— chọn dự án —"; a read-only project says " (chỉ xem)", one without project.json " (chưa nhập)".
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actions } from "@/api/actions.ts";
import { useProjects } from "@/api/queries.ts";
import type { ProjectEntry } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { PROJECT_SELECT_ID } from "./states.tsx";

const NONE = "__none__";

export const projectLabel = (p: ProjectEntry): string => `${p.name}${p.has_manifest ? (p.editable ? "" : " (chỉ xem)") : " (chưa nhập)"}`;

export function ProjectSelect() {
  const { data: projects } = useProjects();
  const name = useStudio((s) => s.name);
  return (
    <Select value={name ?? NONE} onValueChange={(v) => { void actions.open(v === NONE ? "" : v); }}>
      <SelectTrigger id={PROJECT_SELECT_ID} aria-label="Dự án" size="sm" className="h-8 max-w-56 border-border bg-panel-2">
        <SelectValue placeholder="— chọn dự án —" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— chọn dự án —</SelectItem>
        {(projects ?? []).map((p) => <SelectItem key={p.name} value={p.name}>{projectLabel(p)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
