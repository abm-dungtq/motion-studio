// The welcome screen over the stage while no project is open: the projects opened lately (up to 6,
// newest first, those the server still lists) as cards with title, version and export gates, then
// "Dự án mới" and "Mở dự án khác", and the main keys. It lies on top of the player box, which
// Stage creates once and keeps.
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Plus } from "lucide-react";
import { actions } from "@/api/actions.ts";
import { gatesQuery, useProjects } from "@/api/queries.ts";
import type { ProjectEntry } from "@/api/types.ts";
import { readRecent } from "@/core/recent.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";
import { PROJECT_SELECT_ID } from "./states.tsx";

// Focus the project picker of the top bar and open its list (Enter opens a radix select).
export function openProjectSelect(): void {
  const el = document.getElementById(PROJECT_SELECT_ID);
  if (!el) return;
  el.focus();
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function GateLine({ name }: { name: string }) {
  const { data: g } = useQuery(gatesQuery(name));
  if (!g) return null;
  if (g.pass) return <span className="text-ok">Đủ cổng xuất</span>;
  return <span className="text-warn" title={g.fails.join("\n")}>{g.animatic ? "Cần duyệt lại animatic" : `Chưa đủ cổng xuất (${g.fails.length})`}</span>;
}

function Card({ p }: { p: ProjectEntry }) {
  return (
    <button
      type="button"
      data-testid="recent-card"
      onClick={() => { void actions.open(p.name); }}
      className="flex min-w-0 flex-col items-start gap-1 rounded-md border border-border bg-panel-2 p-3 text-left hover:border-primary/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="w-full truncate text-sm font-medium" title={p.name}>{p.name}</span>
      {p.title && p.title !== p.name ? <span className="w-full truncate text-xs text-muted-foreground" title={p.title}>{p.title}</span> : null}
      <span className="flex w-full flex-wrap gap-x-2 text-xs text-muted-foreground">
        {p.has_manifest ? <span>{`v${p.version ?? 0}`}</span> : <span>chưa có project.json</span>}
        {p.has_manifest ? <GateLine name={p.name} /> : null}
      </span>
    </button>
  );
}

export function Welcome() {
  const { data: projects } = useProjects();
  const byName = new Map((projects ?? []).map((p) => [p.name, p]));
  const recent = readRecent().map((n) => byName.get(n)).filter((p): p is ProjectEntry => Boolean(p)).slice(0, 6);
  return (
    <div data-testid="welcome" className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-panel p-6">
      <div className="m-auto flex w-full max-w-2xl flex-col gap-4">
        {recent.length ? (
          <section aria-labelledby="welcome-recent" className="flex flex-col gap-2">
            <h2 id="welcome-recent" className="m-0 text-base font-semibold">Mở lại dự án</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
              {recent.map((p) => <Card key={p.name} p={p} />)}
            </div>
          </section>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Bắt đầu bằng một dự án mới, hoặc chọn dự án có sẵn ở thanh trên cùng.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button aria-haspopup="dialog" onClick={() => useStudio.getState().openDialog("new-project")}><Plus />Dự án mới</Button>
          <Button onClick={openProjectSelect}><FolderOpen />Mở dự án khác</Button>
        </div>
        <p className="m-0 text-xs text-muted-foreground">Phím tắt: Space phát/dừng · J/K/L tua · ←/→ từng khung · C ghim ghi chú tại playhead · S cắt shot · Cmd+Z hoàn tác</p>
      </div>
    </div>
  );
}
