// Port of public/ext-receipts.js:37-55; behaviour unchanged. In the inspector of a shot: the
// receipts whose output files are in shot.assets (from the same 20 newest as the export dialog).
import { useReceipts } from "@/api/queries.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { ReceiptRows } from "./ReceiptList.tsx";
import { receiptRows } from "./model.ts";

export function ShotReceipts({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const shot = m?.shots?.find((x) => x.id === pick.id);
  const files = new Set(Array.isArray(shot?.assets) ? shot.assets : []);
  const { data } = useReceipts(files.size ? name : null);
  if (!files.size || !name) return null;
  const rows = receiptRows(data).filter((r) => (r.outputs ?? []).some((f) => files.has(f)));
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="m-0 text-xs font-semibold">Biên nhận của file trong shot</h4>
      {rows.length ? <ReceiptRows rows={rows} /> : <p className="m-0 text-xs text-muted-foreground">Chưa có biên nhận cho file của shot này.</p>}
    </div>
  );
}
