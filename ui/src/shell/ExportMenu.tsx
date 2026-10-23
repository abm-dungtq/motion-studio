// "Xuất bản" in the top bar: export the video, export the NLE layer bundle (public/panels.js:353-354),
// or open the export dialog with the gates and the exported files. The two exports need a project.
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { actions } from "@/api/actions.ts";
import { useProject } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";

export const BUNDLE_TITLE = "MP4 từng shot, tiếng tách lớp (giọng, nhạc, SFX), phụ đề SRT và manifest.json, để dựng tiếp trong Concat, CapCut hay DaVinci";

export function ExportMenu() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="primary">Xuất bản<ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!m} onSelect={() => { void actions.exportVideo(); }}>Xuất video</DropdownMenuItem>
        <DropdownMenuItem disabled={!m} title={BUNDLE_TITLE} onSelect={() => { void actions.exportBundle(); }}>Xuất bộ lớp dựng</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => useStudio.getState().openDialog("export")}>Cổng & tệp đã xuất…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
