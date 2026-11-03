// The version history of the top bar (public/app.js:256-267, renderVersions): a "v<n>" button that
// opens a read-only list, newest first, "v<n> · <who made it> · <time>", the actor in the user's
// words and the current one marked; every older one can be compared with the current one
// (ChangesDialog VersionCompare). Going back is the Hoàn tác button's job, and the list says so.
// Disabled without a project.
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLog, useProject } from "@/api/queries.ts";
import type { LogEntry } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { VersionCompare } from "./ChangesDialog.tsx";
import { Button } from "./controls.tsx";

const ACTOR: Record<string, string> = {
  human: "bạn sửa", user: "bạn sửa", studio: "Studio", director: "đạo diễn", tool: "công cụ", import: "nhập từ dự án cũ",
};
const actorLabel = (a?: string): string => (a ? ACTOR[a] ?? a : "");
const TIME = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export function versionTime(at?: string): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

export function versionLine(e: Pick<LogEntry, "v" | "actor" | "at">, current: boolean): string {
  return [`v${e.v}`, actorLabel(e.actor), versionTime(e.at), current ? "hiện tại" : ""].filter(Boolean).join(" · ");
}

export function VersionSelect() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const { data: log } = useLog(name);
  const versions: Pick<LogEntry, "v" | "actor" | "at">[] = m ? (log?.length ? [...log].reverse() : [{ v: m.version }]) : [];
  const [compare, setCompare] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={!m}>
          <Button ref={trigger} aria-label="Lịch sử phiên bản" className="h-8 bg-panel-2">{m ? `v${m.version}` : "—"}<ChevronDown /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
          <DropdownMenuLabel>Lịch sử phiên bản</DropdownMenuLabel>
          <ol aria-label="Các phiên bản" className="m-0 list-none p-0">
            {versions.map((e) => (
              <li key={e.v} className={e.v === m?.version ? "flex items-center gap-1 px-2 py-0.5 text-sm font-semibold" : "flex items-center gap-1 px-2 py-0.5 text-sm"}>
                <span className="min-w-0 flex-1 py-0.5" data-role="version-line">{versionLine(e, e.v === m?.version)}</span>
                {e.v !== m?.version ? (
                  <DropdownMenuItem aria-label={`So v${e.v} với hiện tại`} className="flex-none px-1.5 py-0.5 text-xs" onSelect={() => setCompare(e.v)}>So với hiện tại</DropdownMenuItem>
                ) : null}
              </li>
            ))}
          </ol>
          <DropdownMenuSeparator />
          <p className="m-0 px-2 py-1 text-xs text-muted-foreground">Quay lại bản trước bằng nút Hoàn tác</p>
        </DropdownMenuContent>
      </DropdownMenu>
      <VersionCompare name={name} v={compare} onClose={() => setCompare(null)} back={trigger} />
    </>
  );
}
