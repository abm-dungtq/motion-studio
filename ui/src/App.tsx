// The studio layout: top bar (44 px), banner, then the rail (52 px, outside the resizable group)
// beside the resizable left panel, black stage and right column, and the timeline row at the
// bottom (full width, at most 45 % of the height, scrolls). Every slot of slots.ts has an element
// with data-slot="<name>". The boot (public/app.js:466-473) runs once per page: extensions, then
// GET /api/status, the project list and the project named in ?name=.
import { useEffect, type RefObject } from "react";
import { useDefaultLayout, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { actions } from "@/api/actions.ts";
import { queryClient, say } from "@/api/client.ts";
import { useProjectEvents } from "@/api/events.ts";
import { projectsQuery, statusQuery } from "@/api/queries.ts";
import { createStudio, getTabs } from "@/ext/registry.ts";
import { loadAll } from "@/ext/load.ts";
import { AgentDialog } from "@/shell/AgentDialog.tsx";
import { Banner } from "@/shell/Banner.tsx";
import { ErrorBoundary } from "@/shell/ErrorBoundary.tsx";
import { ExportDialog } from "@/shell/ExportDialog.tsx";
import { LeftPanel } from "@/shell/LeftPanel.tsx";
import { NewProjectDialog } from "@/shell/NewProjectDialog.tsx";
import { PointMenuHost } from "@/shell/PointMenu.tsx";
import { Rail } from "@/shell/Rail.tsx";
import { RightColumn } from "@/shell/RightColumn.tsx";
import { Stage } from "@/shell/Stage.tsx";
import { TopBar } from "@/shell/TopBar.tsx";
import { TimelineArea } from "@/timeline/index.tsx";
import { useStudio } from "@/store/studio.ts";

// ?tab=ai was the director tab and ?tab=output the export tab of the old rail.
function applyTabParam(): void {
  const tab = new URL(window.location.href).searchParams.get("tab");
  const s = useStudio.getState();
  if (tab === "ai") { s.setRightTab("director"); s.toggleRight(true); }
  else if (tab === "output") s.openDialog("export");
}

// A left tab that no extension registered (?tab=<unknown>, an old localStorage value) falls back
// to the first tab, as panels.restore() did once the extensions were in.
function restoreTab(): void {
  const tabs = getTabs();
  const s = useStudio.getState();
  if (tabs.length && !tabs.some((t) => t.id === s.leftTab)) s.setLeftTab(tabs[0].id);
}

async function runBoot(): Promise<void> {
  applyTabParam();
  await actions.loadExtensions(async () => { await loadAll(createStudio()); restoreTab(); });
  const status = await queryClient.fetchQuery(statusQuery()).catch(() => null);
  useStudio.setState({ providerStatus: status ? { ok: status.ok, error: status.error, setup: status.setup } : null });
  await queryClient.fetchQuery(projectsQuery()).catch((e: Error) => say(`Không tải được danh sách dự án: ${e.message}`, true));
  await actions.open(new URL(window.location.href).searchParams.get("name") ?? "");
}

// Once per page, also under StrictMode's double mount.
let booting: Promise<void> | null = null;
export function boot(): Promise<void> {
  booting ??= runBoot().catch((e: Error) => { console.error("boot", e); say(`Không khởi động được studio: ${e.message}`, true); });
  return booting;
}
// Tests render App more than once per file; each render must boot again.
export function resetBoot(): void { booting = null; }

// Keeps a collapsible panel and its store flag in step both ways: the store (buttons, rail, gate
// chip) collapses or expands the panel; a drag to the collapsed size updates the store.
function useCollapse(ref: RefObject<PanelImperativeHandle | null>, collapsed: boolean): void {
  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    if (collapsed && !p.isCollapsed()) p.collapse();
    else if (!collapsed && p.isCollapsed()) p.expand();
  }, [ref, collapsed]);
}
const syncFromPanel = (ref: RefObject<PanelImperativeHandle | null>, side: "left" | "right") => () => {
  const p = ref.current;
  if (!p) return;
  const s = useStudio.getState();
  const now = p.isCollapsed();
  if (side === "left" && now !== s.leftCollapsed) s.toggleLeft(!now);
  if (side === "right" && now !== s.rightCollapsed) s.toggleRight(!now);
};

export default function App() {
  const name = useStudio((s) => s.name);
  const leftCollapsed = useStudio((s) => s.leftCollapsed);
  const rightCollapsed = useStudio((s) => s.rightCollapsed);
  const left = usePanelRef();
  const right = usePanelRef();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "ms-layout" });
  useEffect(() => { void boot(); }, []);
  useProjectEvents(name);
  useCollapse(left, leftCollapsed);
  useCollapse(right, rightCollapsed);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <Banner />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} className="min-w-0 flex-1">
          <ResizablePanel id="left" panelRef={left} collapsible defaultSize="22%" minSize="15%" maxSize="40%" onResize={syncFromPanel(left, "left")}>
            <LeftPanel />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="stage" minSize="30%">
            <ErrorBoundary what="stage" resetKey={name}><Stage /></ErrorBoundary>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="right" panelRef={right} collapsible defaultSize="24%" minSize="18%" maxSize="40%" onResize={syncFromPanel(right, "right")}>
            <ErrorBoundary what="right column" resetKey={name}><RightColumn /></ErrorBoundary>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div data-slot="timeline" className="max-h-[45vh] shrink-0 overflow-auto border-t border-border">
        <ErrorBoundary what="timeline" resetKey={name}><TimelineArea /></ErrorBoundary>
      </div>
      <NewProjectDialog />
      <ExportDialog />
      <AgentDialog />
      <PointMenuHost />
    </div>
  );
}
