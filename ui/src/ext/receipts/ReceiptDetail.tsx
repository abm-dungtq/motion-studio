// Port of receiptDetail of public/receipts-view.js; behaviour unchanged. A receipt in full: each
// check with its level and detail, then the JSON. Receipt fields come from project files, so they
// only go in as text.
import { useReceipt } from "@/api/queries.ts";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";
import { asReceipt, type Receipt } from "./model.ts";

export function ReceiptBody({ receipt: r }: { receipt: Receipt }) {
  const checks = Array.isArray(r.checks) ? r.checks : [];
  return (
    <div className="flex flex-col gap-1.5 pl-2 text-xs">
      {checks.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {checks.map((c, i) => (
            <li key={i} className={cn("flex flex-wrap items-baseline gap-1", c.pass ? "text-foreground" : c.level === "warn" ? "text-warn" : "text-danger")}>
              <span className={cn("font-semibold", c.pass && "text-ok")}>{c.pass ? "✓" : c.level === "warn" ? "!" : "✗"}</span>
              <code>{String(c.id ?? "")}</code>{" "}
              <span className="text-muted-foreground">{String(c.file ?? "")}</span>{" "}
              <span>{String(c.detail ?? "")}</span>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-muted-foreground">Không có kiểm nào.</p>}
      <details>
        <summary className="cursor-pointer text-muted-foreground">JSON đầy đủ</summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded-sm bg-background p-2 whitespace-pre-wrap">{JSON.stringify(r, null, 2)}</pre>
      </details>
    </div>
  );
}

export function ReceiptDetail({ id }: { id: string }) {
  const name = useStudio((s) => s.name);
  const { data, error, isPending } = useReceipt(name, id);
  if (error) return <p className="m-0 pl-2 text-xs text-danger">{`Không đọc được biên nhận: ${error.message}`}</p>;
  if (isPending) return <p className="m-0 pl-2 text-xs text-muted-foreground">Đang đọc…</p>;
  return <ReceiptBody receipt={asReceipt(data)} />;
}
