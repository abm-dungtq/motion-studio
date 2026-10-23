// Port of public/ext-receipts.js; behaviour unchanged. Receipts in the export dialog and in the
// inspector of a shot; data from GET /api/receipts and GET /api/receipt (routes/receipts.mjs).
import type { Studio } from "@/ext/registry.ts";
import { ReceiptList } from "./ReceiptList.tsx";
import { ShotReceipts } from "./ShotReceipts.tsx";

export function register(studio: Studio): void {
  studio.registerSection("export", { id: "receipts", order: 40, component: ReceiptList });
  studio.registerInspectorSection({ id: "receipts", kinds: ["shot"], order: 60, component: ShotReceipts });
}
