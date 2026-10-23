// The right column: the director tab (the old "Giao việc cho AI" tab, filled by registerSection
// ("director", …)) and the Shot tab (the inspector). A dot on the director tab while a director
// card waits for the user (the old rail badge of tab ai, public/panels.js:520).
import { PanelRightClose } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRequests } from "@/api/queries.ts";
import { useStudio, type RightTab } from "@/store/studio.ts";
import { Button } from "./controls.tsx";
import { InspectorHost } from "./InspectorHost.tsx";
import { SectionHost } from "./SectionHost.tsx";

export function RightColumn() {
  const rightTab = useStudio((s) => s.rightTab);
  const name = useStudio((s) => s.name);
  const { data: requests } = useRequests(name);
  const waiting = (requests ?? []).some((r) => r.status === "waiting_user");

  return (
    <Tabs
      value={rightTab}
      onValueChange={(v) => useStudio.getState().setRightTab(v as RightTab)}
      className="flex h-full min-h-0 flex-col gap-0 bg-panel"
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <TabsList variant="line" className="flex-1">
          <TabsTrigger value="director">
            Đạo diễn
            {waiting ? <span aria-label="Có thẻ đang chờ bạn" role="status" className="ml-1 inline-block size-2 rounded-full bg-warn" /> : null}
          </TabsTrigger>
          <TabsTrigger value="shot">Shot</TabsTrigger>
        </TabsList>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="icon" aria-label="Thu gọn cột phải" onClick={() => useStudio.getState().toggleRight(false)}>
              <PanelRightClose />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Thu gọn</TooltipContent>
        </Tooltip>
      </div>
      <TabsContent value="director" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <div data-slot="right.director" className="flex flex-col gap-3 p-3">
            <SectionHost hostId="director" />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="shot" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <div data-slot="right.shot">
            <InspectorHost />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
