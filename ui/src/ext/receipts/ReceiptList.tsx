// Port of public/ext-receipts.js:20-36 and receiptRows of public/receipts-view.js; behaviour
// unchanged. The 20 newest receipts of the project in the export dialog; a row opens its checks.
import { useState } from "react";
import { useReceipts } from "@/api/queries.ts";
import { cn } from "@/lib/utils";
import { Button } from "@/shell/controls.tsx";
import { Loading } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { ReceiptDetail } from "./ReceiptDetail.tsx";
import { receiptRows, VERDICT, when, type ReceiptRow } from "./model.ts";

const BADGE: Record<string, string> = { pass: "bg-ok/20 text-ok", warn: "bg-warn/20 text-warn", fail: "bg-danger/20 text-danger" };

export function VerdictBadge({ v }: { v?: string }) {
  return <span title={`verdict ${v}`} className={cn("shrink-0 rounded-sm px-1.5 text-xs", BADGE[v ?? "fail"] ?? BADGE.fail)}>{VERDICT[v ?? ""] ?? String(v)}</span>;
}

// One row per receipt; open is the id shown in full, toggled by a click.
export function ReceiptRows({ rows }: { rows: ReceiptRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={open === r.id ? "true" : "false"}
            onClick={() => setOpen(open === r.id ? null : r.id)}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-panel-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <VerdictBadge v={r.verdict} />
            <strong>{String(r.op ?? "")}</strong>
            <span className="text-xs text-muted-foreground">{`${r.actor ?? "?"} · ${when(r.written)}`}</span>
            <span className="w-full text-xs break-all text-muted-foreground">{(r.outputs ?? []).join(", ") || "(không có file)"}</span>
          </button>
          {open === r.id ? <ReceiptDetail id={r.id} /> : null}
        </div>
      ))}
    </div>
  );
}

export function ReceiptList() {
  const name = useStudio((s) => s.name);
  const { data, error, isPending, refetch } = useReceipts(name);
  if (!name) return null;
  const rows = receiptRows(data);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">Biên nhận</h3>
        <Button onClick={() => { void refetch(); }}>Làm mới</Button>
      </div>
      {isPending && !error ? <Loading /> : (
        <>
          {error ? <p className="m-0 text-sm text-danger">{error.message}</p> : null}
          {rows.length ? <ReceiptRows rows={rows} /> : <p className="m-0 text-sm text-muted-foreground">Chưa có biên nhận. Mỗi lần sinh ảnh, kiểm media hay xuất file sẽ ghi một biên nhận ở đây.</p>}
        </>
      )}
    </div>
  );
}
