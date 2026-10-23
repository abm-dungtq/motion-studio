// The export dialog ("Cổng & tệp đã xuất…", the old Xuất bản tab of public/panels.js:19): its
// sections come from registerSection("export", …).
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudio } from "@/store/studio.ts";
import { SectionHost } from "./SectionHost.tsx";

export const EXPORT_LEAD = "Xuất MP4 bản giao (render rồi nén), bộ lớp dựng cho phần mềm dựng, và tải file đã xuất.";

export function ExportDialog() {
  const open = useStudio((s) => s.dialog === "export");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) useStudio.getState().openDialog(null); }}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Xuất bản</DialogTitle>
          <DialogDescription>{EXPORT_LEAD}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div data-slot="export" className="flex flex-col gap-3 pr-2">
            <SectionHost hostId="export" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
