// Port of the data half of public/receipts-view.js; behaviour unchanged. The shapes of
// GET /api/receipts and GET /api/receipt (routes/receipts.mjs) as the views read them.
export const VERDICT: Record<string, string> = { pass: "đạt", warn: "cảnh báo", fail: "trượt" };

export interface ReceiptRow { id: string; op?: string; actor?: string | null; written?: string; verdict?: string; outputs?: string[]; [k: string]: unknown }
export interface ReceiptCheck { id?: string; pass?: boolean; level?: string; file?: string | null; detail?: string | null; [k: string]: unknown }
export interface Receipt { checks?: ReceiptCheck[]; [k: string]: unknown }

export const when = (iso: unknown): string => {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? "?" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

// The rows of GET /api/receipts; anything else reads as none.
export const receiptRows = (r: { receipts?: unknown[] } | undefined): ReceiptRow[] =>
  (Array.isArray(r?.receipts) ? r.receipts.filter((x): x is ReceiptRow => Boolean(x && typeof x === "object" && "id" in x)) : []);

export const asReceipt = (r: unknown): Receipt => (r && typeof r === "object" ? (r as Receipt) : {});
