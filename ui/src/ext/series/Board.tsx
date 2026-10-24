// One board of the Tài sản tab (a character sheet, the backgrounds or the props): every image with
// its id, its state in words and why its self-check failed; zoom buttons; a tick per image;
// "Duyệt cả bảng" (POST /api/assets/approve per batch) and "Vẽ lại ảnh đã đánh dấu" with a
// required one-sentence reason (POST /api/assets/redo). An image that needs a look (needs_review)
// is approved only when it is ticked.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { Button, Checkbox, Input } from "@/shell/controls.tsx";
import { approveBoard, projectSrc, redoImages } from "./api.ts";
import { PixelImage, ZoomBar } from "./Zoom.tsx";
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

  return (
    <section aria-label={board.title} className="flex flex-col gap-2 rounded-md bg-panel-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{`${board.title} `}<span className="text-muted-foreground">{String(board.items.length)}</span></h3>
        <ZoomBar zoom={zoom} onZoom={setZoom} label={board.title} />
      </div>
      <ul className="m-0 flex list-none flex-wrap items-start gap-2 p-0">
        {board.items.map((it) => <Cell key={tickKey(it)} name={name} it={it} zoom={zoom} ticked={isTicked(it)} onTick={() => flip(it)} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy || running || !toApprove.length} onClick={() => void approve()}>Duyệt cả bảng</Button>
        <span className="text-xs text-muted-foreground">Ảnh "cần xem" chỉ được duyệt khi bạn đánh dấu nó.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={`Lý do vẽ lại, ${board.title}`} placeholder="Lý do vẽ lại (một câu, bắt buộc)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-w-48 flex-1" />
        <Button disabled={busy || running || !toRedo.length || !reason.trim()} onClick={() => void redo()}>Vẽ lại ảnh đã đánh dấu</Button>
      </div>
    </section>
  );
}

function Cell({ name, it, zoom, ticked, onTick }: { name: string; it: BoardItem; zoom: Zoom; ticked: boolean; onTick: () => void }) {
  const img = it.preview ?? (it.kind === "background" ? it.keyed : null) ?? null;
  const why = it.status === "failed" ? it.error : it.reasons?.length ? it.reasons[it.reasons.length - 1] : null;
  return (
    <li data-status={it.status} className="flex max-w-full min-w-28 flex-col gap-1 rounded-md border border-border bg-background p-1.5 text-xs">
      {img ? <PixelImage src={projectSrc(name, img, it.updated)} alt={`Ảnh ${it.id}`} zoom={zoom} /> : <p className="m-0 p-4 text-center text-muted-foreground">chưa có ảnh</p>}
      <label className="flex items-center gap-1.5">
        <Checkbox checked={ticked} onChange={onTick} aria-label={`Đánh dấu ${it.id}`} />
        <span className="font-mono">{it.id}</span>
      </label>
      <span className={it.status === "needs_review" || it.status === "failed" ? "text-warn" : "text-muted-foreground"}>{STATUS_TEXT[it.status] ?? it.status}</span>
      {why ? <span className="text-muted-foreground">{`Tự kiểm: ${why}`}</span> : null}
    </li>
  );
}
