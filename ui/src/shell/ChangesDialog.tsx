// What changed, in the editor's words (core/manifest-diff.ts) and file by file.
// TurnChanges: "Xem thay đổi" of the director banner. Two tabs: "Theo shot" (default) reads the
// project.json entry of the snapshot diff; "Theo file" is the text diff of every file the turn touched.
// VersionCompare: "So với hiện tại" of the version history. An older version, read from
// .opus/versions/v<N>.json, against the project now; shots and lines only.
// A changed or added shot shows its current frame; a click on it closes the dialog, selects the
// shot and moves the playhead to its start.
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actions } from "@/api/actions.ts";
import * as Q from "@/api/queries.ts";
import type { Manifest, SnapshotDiff } from "@/api/types.ts";
import { lineDiff } from "@/core/line-diff.ts";
import { changeText, manifestDiff, parsePair, type Change, type ManifestLike } from "@/core/manifest-diff.ts";
import { useShotThumb } from "@/timeline/ShotThumb.tsx";

const ROW: Record<string, string> = { "+": "bg-ok/15", "-": "bg-destructive/15", " ": "", "…": "text-muted-foreground italic" };
const KIND: Record<string, string> = { changed: "sửa", added: "thêm", removed: "xoá" };
// Wide enough that every shot gets a frame (useShotThumb skips narrow ones).
const THUMB_PPS = 1000;

function ShotPic({ name, start, end }: { name: string; start: number; end: number }) {
  const { data: media } = Q.useTimelineMedia(name);
  const url = useShotThumb(name, media?.render ?? undefined, start, end, THUMB_PPS);
  return url
    ? <img src={url} alt="" className="h-10 w-16 flex-none rounded-sm object-cover" />
    : <span aria-hidden="true" className="h-10 w-16 flex-none rounded-sm bg-muted" />;
}

// The "Theo shot" list. m is the project now: it places the frames and the seek.
export function ByShot({ name, changes, overwritten = [], m, onClose }: { name: string; changes: Change[]; overwritten?: string[]; m: Manifest | null | undefined; onClose: () => void }) {
  const shotNow = (id: string) => m?.shots.find((s) => s.id === id) ?? null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="changes-by-shot">
      {overwritten.length > 0 && (
        <p className="m-0 text-sm font-semibold text-warn"><span aria-hidden="true">! </span>{`${overwritten.length} file media bị ghi đè, hoàn tác không lấy lại được`}</p>
      )}
      {changes.length === 0 ? <p className="m-0 text-sm text-muted-foreground">Không có thay đổi về shot và lời.</p> : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {changes.map((c, k) => {
            const text = changeText(c);
            const s = (c.kind === "shot-added" || c.kind === "shot-changed") ? shotNow(c.shot) : null;
            if (!s) return <li key={k} className="px-1 py-1 text-sm">{text}</li>;
            return (
              <li key={k}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Chọn shot này trên timeline"
                  onClick={() => { onClose(); actions.select(s.id); actions.seek(s.start); }}
                >
                  <ShotPic name={name} start={s.start} end={s.end} />
                  <span className="min-w-0 flex-1">{text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ByFile({ data }: { data: SnapshotDiff }) {
  return (
    <div className="flex flex-col gap-1.5">
      {data.files.length === 0 && <p className="m-0 text-sm text-muted-foreground">Không còn khác biệt nào về chữ.</p>}
      {data.files.map((f) => (
        <details key={f.path} className="rounded border border-border" open={data.files.length <= 3}>
          <summary className="cursor-pointer px-2 py-1 text-sm"><code>{f.path}</code> <span className="text-muted-foreground">({KIND[f.kind]})</span></summary>
          <pre className="overflow-x-auto border-t border-border text-xs leading-5">
            {lineDiff(f.before, f.after).map((r, k) => (
              <div key={k} className={`px-2 ${ROW[r.kind]}`}>{r.kind === "…" ? `… ${r.text}` : `${r.kind} ${r.text}`}</div>
            ))}
          </pre>
        </details>
      ))}
      {data.overwritten.length > 0 && <p className="m-0 text-sm">Media bị ghi đè (không hoàn tác được): {data.overwritten.join(", ")}</p>}
      {data.created.length > 0 && <p className="m-0 text-sm text-muted-foreground">Media mới (Hoàn tác lượt đạo diễn để nguyên): {data.created.join(", ")}</p>}
    </div>
  );
}

// The shot changes of a snapshot diff: its project.json entry, or none.
export function turnChanges(data: SnapshotDiff): Change[] {
  const f = data.files.find((x) => x.path === "project.json");
  const pair = f ? parsePair(f.before, f.after) : null;
  return pair ? manifestDiff(pair[0], pair[1]) : [];
}

export function TurnChanges({ name, id, onClose }: { name: string | null; id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = Q.useSnapshotDiff(name, id);
  const { data: m } = Q.useProject(name);
  return (
    <Dialog open={id !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thay đổi của lượt đạo diễn</DialogTitle>
          <DialogDescription>Chỉ xem. So với lúc trước khi đạo diễn bắt đầu{data?.from != null ? ` (v${data.from})` : ""}.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && name && (
          <Tabs defaultValue="shot">
            <TabsList>
              <TabsTrigger value="shot">Theo shot</TabsTrigger>
              <TabsTrigger value="file">Theo file</TabsTrigger>
            </TabsList>
            <TabsContent value="shot"><ByShot name={name} changes={turnChanges(data)} overwritten={data.overwritten} m={m} onClose={onClose} /></TabsContent>
            <TabsContent value="file"><ByFile data={data} /></TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const versionPath = (v: number): string => `.opus/versions/v${v}.json`;

export function VersionCompare({ name, v, onClose }: { name: string | null; v: number | null; onClose: () => void }) {
  const { data: m } = Q.useProject(name);
  const old = useQuery({ ...Q.projectTextQuery(name, versionPath(v ?? 0)), enabled: Boolean(name && v != null) });
  const before = ((): ManifestLike | null => { try { return old.data ? JSON.parse(old.data) as ManifestLike : null; } catch { return null; } })();
  return (
    <Dialog open={v !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`So v${v ?? ""} với hiện tại`}</DialogTitle>
          <DialogDescription>{`Chỉ xem. Những gì khác giữa v${v ?? ""} và bản đang mở${m ? ` (v${m.version})` : ""}.`}</DialogDescription>
        </DialogHeader>
        {old.isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {old.error && <p className="text-sm text-destructive">{(old.error as Error).message}</p>}
        {!old.isLoading && !old.error && !before && <p className="text-sm text-muted-foreground">{`Không còn bản v${v} để so.`}</p>}
        {before && m && name && <ByShot name={name} changes={manifestDiff(before, m)} m={m} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
