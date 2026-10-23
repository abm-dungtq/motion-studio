// The left panel: the open tab's name, its lead line and a collapse button, then the tab's
// component and the sections registered for it. Each part has its own ErrorBoundary.
import { PanelLeftClose } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { LEFT_PANEL_ID } from "./Rail.tsx";
import { SectionHost } from "./SectionHost.tsx";
import { Empty } from "./states.tsx";

export function LeftPanel() {
  const tabs = useTabs();
  const leftTab = useStudio((s) => s.leftTab);
  const name = useStudio((s) => s.name);
  const tab = tabs.find((t) => t.id === leftTab) ?? tabs[0];

  return (
    <div data-slot="left" className="flex h-full min-h-0 flex-col bg-panel">
      {tab ? (
        <>
          <header className="flex items-start gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-sm font-semibold">{tab.label}</h2>
              {tab.lead ? <p className="m-0 mt-0.5 text-xs text-muted-foreground">{tab.lead}</p> : null}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="icon" aria-label="Thu gọn" onClick={() => useStudio.getState().toggleLeft(false)}>
                  <PanelLeftClose />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Thu gọn</TooltipContent>
            </Tooltip>
          </header>
          <ScrollArea className="min-h-0 flex-1">
            <div id={LEFT_PANEL_ID} role="tabpanel" aria-labelledby={`tab-${tab.id}`} tabIndex={-1} className="flex flex-col gap-3 p-3">
              <ErrorBoundary key={tab.id} what={`tab ${tab.id}`} resetKey={name}>
                <tab.component />
              </ErrorBoundary>
              <SectionHost hostId={tab.id} />
            </div>
          </ScrollArea>
        </>
      ) : (
        <Empty text="Chưa có mục nào" />
      )}
    </div>
  );
}
