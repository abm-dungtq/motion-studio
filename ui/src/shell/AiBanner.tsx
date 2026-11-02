// The strip under the top bar after an AI turn that changed the project (routes/snapshots.mjs):
// "Đạo diễn đã sửa N file, vX → vY" with Giữ (the main button), Xem thay đổi and Hoàn tác. Hoàn tác asks
// first, then puts the text files back and project.json as a new version; when project.json
// changed after the turn it asks a second time.
// Media the director wrote over cannot come back: the strip that follows the undo names them and
// the lines to voice again, instead of claiming a full undo.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { RestoreResult, Snapshot } from "@/api/types.ts";
import { lineDiff } from "@/core/line-diff.ts";
import { useStudio } from "@/store/studio.ts";
import { makeConfirm } from "./confirm.tsx";
import { Button } from "./controls.tsx";

const STRIP = "flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-sm text-foreground";
const { ask, ConfirmHost } = makeConfirm();

export const touched = (s: Snapshot): number => (s.summary ? s.summary.changed.length + s.summary.added.length + s.summary.removed.length : 0);

export function headline(s: Snapshot): string {
  const sum = s.summary;
  const versions = sum && sum.from != null && sum.to != null && sum.from !== sum.to ? `, v${sum.from} → v${sum.to}` : "";
  const media = sum?.overwritten.length ? ` · ${sum.overwritten.length} file media bị ghi đè, không hoàn tác được` : "";
  return `Đạo diễn đã sửa ${touched(s)} file${versions}${media}`;
}

export function AiBanner() {
  const name = useStudio((st) => st.name);
  const { data } = Q.useSnapshots(name);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [after, setAfter] = useState<RestoreResult | null>(null);
  useEffect(() => { setView(null); setAfter(null); }, [name]);
  const s = data?.snapshots.find((x) => x.state === "done") ?? null;

  async function keep() {
    if (!name || !s) return;
    const r = await Q.snapshotKeep({ name, id: s.id });
    if (r.status !== 200) say(r.error ?? `Lỗi ${r.status}`, true);
  }

  async function confirmUndo(): Promise<void> {
    if (await ask("Hoàn tác lượt đạo diễn? Các file đạo diễn vừa sửa sẽ trở về như trước.", { ok: "Hoàn tác lượt đạo diễn", danger: true })) await undo();
  }

  async function undo(force = false): Promise<void> {
    if (!name || !s) return;
    setBusy(true);
    const r = await Q.snapshotRestore({ name, id: s.id, force });
    setBusy(false);
    if (r.status === 409 && r.data?.code === "NEWER") {
      if (await ask(r.error ?? "Hoàn tác cả các sửa sau đó?", { ok: "Hoàn tác cả", danger: true })) return undo(true);
      return;
    }
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return; }
    const res = r.data as RestoreResult;
    actions.transport.reload();
    if (res.overwritten.length) setAfter(res);
    else say(`Đã hoàn tác lượt đạo diễn: ${res.files} file${res.version != null ? `, v${res.version}` : ""}`);
  }

  return (
    <>
      {after && (
        <div role="alert" data-banner="ai-undone" className={`${STRIP} border-warn/40 bg-warn/15`}>
          <span className="min-w-0 flex-1">
            {`Đã hoàn tác chữ và timeline, nhưng ${after.overwritten.length} file đã bị ghi đè, không lấy lại được: ${after.overwritten.join(", ")}.`}
            {after.lines.length > 0 && ` Cần lồng tiếng lại câu: ${after.lines.map((l) => `${l.id} “${l.text.slice(0, 40)}”`).join("; ")}.`}
          </span>
          <Button className="h-7" onClick={() => setAfter(null)}>Đóng</Button>
        </div>
      )}
      {s && (
        <div role="status" data-banner="ai-turn" className={`${STRIP} border-primary/40 bg-primary/10`}>
          <span className="min-w-0 flex-1 truncate">
            {headline(s)}
            {s.late && <span className="text-muted-foreground"> · chụp sau khi đạo diễn đã bắt đầu, có thể thiếu</span>}
          </span>
          <Button className="h-7" disabled={busy} variant="primary" onClick={() => { void keep(); }}>Giữ</Button>
          <Button className="h-7" onClick={() => setView(s.id)}>Xem thay đổi</Button>
          {data?.can_restore && <Button className="h-7" variant="ghost" disabled={busy} onClick={() => { void confirmUndo(); }}>{busy ? "Đang hoàn tác…" : "Hoàn tác lượt đạo diễn"}</Button>}
        </div>
      )}
      <ChangesDialog name={name} id={view} onClose={() => setView(null)} />
      <ConfirmHost />
    </>
  );
}

const ROW: Record<string, string> = { "+": "bg-ok/15", "-": "bg-destructive/15", " ": "", "…": "text-muted-foreground italic" };
const KIND: Record<string, string> = { changed: "sửa", added: "thêm", removed: "xoá" };

function ChangesDialog({ name, id, onClose }: { name: string | null; id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = Q.useSnapshotDiff(name, id);
  return (
    <Dialog open={id !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thay đổi của lượt đạo diễn</DialogTitle>
          <DialogDescription>Chỉ xem. So với lúc trước khi đạo diễn bắt đầu{data?.from != null ? ` (v${data.from})` : ""}.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && data.files.length === 0 && <p className="text-sm text-muted-foreground">Không còn khác biệt nào về chữ.</p>}
        {data?.files.map((f) => (
          <details key={f.path} className="rounded border border-border" open={data.files.length <= 3}>
            <summary className="cursor-pointer px-2 py-1 text-sm"><code>{f.path}</code> <span className="text-muted-foreground">({KIND[f.kind]})</span></summary>
            <pre className="overflow-x-auto border-t border-border text-xs leading-5">
              {lineDiff(f.before, f.after).map((r, k) => (
                <div key={k} className={`px-2 ${ROW[r.kind]}`}>{r.kind === "…" ? `… ${r.text}` : `${r.kind} ${r.text}`}</div>
              ))}
            </pre>
          </details>
        ))}
        {data && data.overwritten.length > 0 && <p className="text-sm">Media bị ghi đè (không hoàn tác được): {data.overwritten.join(", ")}</p>}
        {data && data.created.length > 0 && <p className="text-sm text-muted-foreground">Media mới (Hoàn tác lượt đạo diễn để nguyên): {data.created.join(", ")}</p>}
      </DialogContent>
    </Dialog>
  );
}
