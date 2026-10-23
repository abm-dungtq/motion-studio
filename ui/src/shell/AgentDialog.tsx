// The agent dialog ("Agent trên máy", the old popover of public/agent.js). Its body is only the rows
// registered with registerAgentRows, in registration order; each gets { data, error, reload } of
// GET /api/agent and runs in its own ErrorBoundary ("Mục mở rộng lỗi: …", agent.js:65).
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgent } from "@/api/queries.ts";
import { useAgentRows } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Loading } from "./states.tsx";

// The chip opens the dialog through the store, not a DialogTrigger, so Radix has nothing to give
// focus back to on close: give it to the chip.
const chipFocus = (e: Event) => { e.preventDefault(); document.querySelector<HTMLElement>("[data-agent-chip]")?.focus(); };

export function AgentDialog() {
  const open = useStudio((s) => s.dialog === "agent");
  const name = useStudio((s) => s.name);
  const rows = useAgentRows();
  const { data, error, refetch: reloadAgent } = useAgent(name);
  const width = rows.reduce<string | undefined>((w, r) => r.width ?? w, undefined);
  const reload = () => { void reloadAgent(); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) useStudio.getState().openDialog(null); }}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={chipFocus}
        style={width ? { width, maxWidth: width } : undefined}
      >
        <DialogTitle>Agent trên máy</DialogTitle>
        <ScrollArea className="max-h-[70vh]">
          <div data-slot="agent" className="flex flex-col gap-2 pr-2 text-sm">
            {rows.length ? rows.map((r) => (
              <ErrorBoundary key={r.seq} what="agent rows" fallback={(e) => <p className="text-sm text-danger">{`Mục mở rộng lỗi: ${e.message}`}</p>}>
                <r.component data={data} error={error ?? null} reload={reload} />
              </ErrorBoundary>
            )) : <Loading />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
