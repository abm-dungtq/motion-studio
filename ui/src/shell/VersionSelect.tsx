// The version list of the top bar (public/app.js:256-267, renderVersions): newest first,
// "v<n> · hiện tại" or "v<n> · <actor>". It is only for reading: picking another version says so
// and the list stays on the current one. Disabled without a project.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { say } from "@/api/client.ts";
import { useLog, useProject } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";

export function VersionSelect() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const { data: log } = useLog(name);
  const versions = m ? (log?.length ? [...log].reverse() : [{ v: m.version, actor: "" }]) : [];
  return (
    <Select
      value={m ? String(m.version) : ""}
      disabled={!m}
      onValueChange={() => say("Danh sách chỉ để xem; quay lại bản trước bằng Hoàn tác")}
    >
      <SelectTrigger aria-label="Phiên bản" size="sm" className="h-8 border-border bg-panel-2">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {versions.map((e) => (
          <SelectItem key={e.v} value={String(e.v)}>{`v${e.v} · ${e.v === m?.version ? "hiện tại" : (e.actor ?? "")}`}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
