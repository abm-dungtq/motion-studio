// One board of the Tài sản tab (a character sheet, the backgrounds or the props): every image with
// its id, its state in words and why its self-check failed; zoom buttons; a tick per image;
// "Duyệt cả bảng" (POST /api/assets/approve per batch) and "Vẽ lại ảnh đã đánh dấu" with a
// required one-sentence reason (POST /api/assets/redo). An image that needs a look (needs_review)
// is approved only when it is ticked. "Xem rộng" opens the same board in a large dialog, the images
// laid out side by side at full size so poses can be compared; zoom, ticks and the reason are the
// same state in both places.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { say } from "@/api/client.ts";
import { cn } from "@/lib/utils";
import { Button, Checkbox, Input } from "@/shell/controls.tsx";
import { approveBoard, projectSrc, redoImages } from "./api.ts";
import { PixelImage, ZoomBar, type Fit } from "./Zoom.tsx";
import type { AssetStatus, BoardData, BoardItem, Zoom } from "./types.ts";

export const STATUS_TEXT: Record<AssetStatus, string> = {
  new: "chưa vẽ", queued: "chờ vẽ", drawing: "đang vẽ", checking: "đang tự kiểm", keying: "đang tách nền",
  keyed: "chờ duyệt", ready: "chờ duyệt", needs_review: "cần xem", failed: "lỗi", waiting_quota: "chờ lượt", approved: "đã duyệt",
};
const BUSY: AssetStatus[] = ["queued", "drawing", "checking", "keying"];

// The ids of each batch, in board order.
function byBatch(items: BoardItem[]): [string, string[]][] {
  const m = new Map<string, string[]>();
  for (const it of items) m.set(it.batch, [...(m.get(it.batch) ?? []), it.id]);
  return [...m.entries()];
}
const tickKey = (it: BoardItem) => `${it.batch}/${it.id}`;

export function Board({ name, board, running }: { name: string; board: BoardData; running: boolean }) {
  const [zoom, setZoom] = useState<Zoom>(board.zoom);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(false);

  const isTicked = (it: BoardItem) => ticked.has(tickKey(it));
  const toApprove = board.items.filter((it) => it.status === "keyed" || (it.status === "needs_review" && isTicked(it)));
  const toRedo = board.items.filter((it) => isTicked(it) && !BUSY.includes(it.status));
  const flip = (it: BoardItem) => setTicked((s) => { const n = new Set(s); if (n.has(tickKey(it))) n.delete(tickKey(it)); else n.add(tickKey(it)); return n; });

  async function approve() {
    setBusy(true);
    let done = 0;
    for (const [batch, ids] of byBatch(toApprove)) {
      const r = await approveBoard(name, batch, board.key, ids);
      if (r.status !== 200) { say(`Không duyệt được: ${r.error}`, true); break; }
      done += ids.length;
    }
    setBusy(false);
    if (done) { say(`Đã duyệt ${done} ảnh của ${board.title.toLowerCase()}`); setTicked(new Set()); }
  }

  async function redo() {
    setBusy(true);
    const why = reason.trim();
    for (const [batch, ids] of byBatch(toRedo)) {
      const r = await redoImages(name, batch, ids, why);
      if (r.status !== 200) { say(`Không vẽ lại được: ${r.error}`, true); setBusy(false); return; }
    }
    setBusy(false);
    say(`Đang vẽ lại ${toRedo.length} ảnh`);
    setTicked(new Set());
    setReason("");
  }

  const zoomBar = <ZoomBar zoom={zoom} onZoom={setZoom} label={board.title} />;
  const count = <span className="text-muted-foreground">{String(board.items.length)}</span>;
  const cells = (fit: Fit) => board.items.map((it) => <Cell key={tickKey(it)} name={name} it={it} zoom={zoom} fit={fit} ticked={isTicked(it)} onTick={() => flip(it)} />);
  const actions = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy || running || !toApprove.length} onClick={() => void approve()}>Duyệt cả bảng</Button>
        <span className="text-xs text-muted-foreground">Ảnh "cần xem" chỉ được duyệt khi bạn đánh dấu nó.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={`Lý do vẽ lại, ${board.title}`} placeholder="Lý do vẽ lại (một câu, bắt buộc)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-w-48 flex-1" />
        <Button disabled={busy || running || !toRedo.length || !reason.trim()} onClick={() => void redo()}>Vẽ lại ảnh đã đánh dấu</Button>
      </div>
    </>
  );

  return (
    <section aria-label={board.title} className="flex flex-col gap-2 rounded-md bg-panel-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{`${board.title} `}{count}</h3>
        <div className="flex flex-wrap items-center gap-1">
          {zoomBar}
          <Button className="h-7 px-2 text-xs" aria-label={`Xem rộng ${board.title}`} onClick={() => setWide(true)}>Xem rộng</Button>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-wrap items-start gap-2 p-0">{cells("cell")}</ul>
      {actions}
      <Dialog open={wide} onOpenChange={setWide}>
        <DialogContent className="flex h-[88vh] max-w-[92vw] flex-col gap-3 p-4 sm:max-w-[92vw]">
          <DialogHeader className="flex-row flex-wrap items-center gap-3 pr-8">
            <DialogTitle className="text-base">{board.title}</DialogTitle>
            <DialogDescription className="flex-1">{`${board.items.length} ảnh, xếp cạnh nhau để so. Đánh dấu và lý do dùng chung với bảng ở cột trái.`}</DialogDescription>
            {zoomBar}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-md bg-panel-2 p-2">
            <ul className="m-0 flex list-none flex-wrap items-start gap-3 p-0">{cells("wide")}</ul>
          </div>
          {actions}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Cell({ name, it, zoom, fit, ticked, onTick }: { name: string; it: BoardItem; zoom: Zoom; fit: Fit; ticked: boolean; onTick: () => void }) {
  const img = it.preview ?? (it.kind === "background" ? it.keyed : null) ?? null;
  const why = it.status === "failed" ? it.error : it.reasons?.length ? it.reasons[it.reasons.length - 1] : null;
  return (
    <li data-status={it.status} className={cn("flex min-w-28 flex-col gap-1 rounded-md border border-border bg-background p-1.5 text-xs", fit === "cell" && "max-w-full")}>
      {img ? <PixelImage src={projectSrc(name, img, it.updated)} alt={`Ảnh ${it.id}`} zoom={zoom} fit={fit} /> : <p className="m-0 p-4 text-center text-muted-foreground">chưa có ảnh</p>}
      <label className="flex items-center gap-1.5">
        <Checkbox checked={ticked} onChange={onTick} aria-label={`Đánh dấu ${it.id}`} />
        <span className="font-mono">{it.id}</span>
      </label>
      <span className={it.status === "needs_review" || it.status === "failed" ? "text-warn" : "text-muted-foreground"}>{STATUS_TEXT[it.status] ?? it.status}</span>
      {why ? <span className="text-muted-foreground">{`Tự kiểm: ${why}`}</span> : null}
    </li>
  );
}
