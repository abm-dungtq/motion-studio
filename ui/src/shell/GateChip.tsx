// The export gate chip (public/app.js:365-399): hidden on PASS or without gate data; otherwise
// what blocks the export, with the FAIL lines in its tooltip. An animatic to approve again leads
// to the director tab (its approval card); any other FAIL to the export dialog.
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGates } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";

export function GateChip() {
  const name = useStudio((s) => s.name);
  const { data: g } = useGates(name);
  if (!g || g.pass) return null;
  const open = () => {
    const s = useStudio.getState();
    if (g.animatic) { s.setRightTab("director"); s.toggleRight(true); }
    else s.openDialog("export");
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-to={g.animatic ? "ai" : "output"}
          onClick={open}
          className="h-8 shrink-0 rounded-full border border-warn/60 bg-warn/15 px-3 text-xs font-medium text-warn hover:bg-warn/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {g.animatic ? "Cần duyệt lại animatic" : "Chưa đủ cổng xuất"}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-md whitespace-pre-line text-left">{g.fails.join("\n")}</TooltipContent>
    </Tooltip>
  );
}
