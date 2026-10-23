// Port of public/panels.js:316-360 (File đã xuất of the Xuất bản view); behaviour unchanged.
// GET /api/files dir=renders: a bundle folder is one row (its manifest.json), then each MP4,
// newest first. The list reloads when a job of the project ends, as the old view redrew then.
import { useEffect } from "react";
import { useFiles, useJobs, useProject } from "@/api/queries.ts";
import type { FileEntry } from "@/api/types.ts";
import { fileUrl, mb } from "@/core/ui-format.ts";
import { Fail, Loading } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { isLive } from "./Jobs.tsx";

const BUNDLE = /^renders\/([^/]+-bundle)\//;

export interface ExportRow { href: string; label: string; size: number; title?: string }

export function exportRows(name: string, fs: FileEntry[]): ExportRow[] {
  const bundles = new Map<string, { size: number; manifest: string | null }>();
  for (const f of fs) {
    const b = BUNDLE.exec(f.path);
    if (!b) continue;
    const x = bundles.get(b[1]) ?? { size: 0, manifest: null };
    x.size += Number(f.size) || 0;
    if (f.path.endsWith("/manifest.json")) x.manifest = f.path;
    bundles.set(b[1], x);
  }
  const mp4 = fs.filter((f) => /\.mp4$/i.test(f.path) && !BUNDLE.test(f.path)).reverse();
  return [
    ...[...bundles].filter(([, x]) => x.manifest).reverse().map(([dir, x]) => ({ href: fileUrl(name, x.manifest as string), label: `${dir}/`, size: x.size, title: "manifest.json của bộ lớp dựng" })),
    ...mp4.map((f) => ({ href: fileUrl(name, f.path), label: f.path.replace(/^renders\//, ""), size: Number(f.size) || 0 })),
  ];
}

export function Exported() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const { data: fs, error, isPending, refetch: reread } = useFiles(name, "renders");
  const { data: jobs } = useJobs(name);
  const ended = (jobs ?? []).filter((j) => !isLive(j)).map((j) => j.id).join(",");
  useEffect(() => { if (ended) void reread(); }, [ended, reread]);
  if (!name || !m) return null;
  const rows = fs ? exportRows(name, fs) : [];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-semibold">File đã xuất</h3>
      {isPending ? <Loading /> : error ? <Fail error={error} /> : rows.length ? rows.map((r) => (
        <div key={r.href} className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm">
          <a className="truncate text-primary underline-offset-2 hover:underline" href={r.href} target="_blank" rel="noopener" title={r.title}>{r.label}</a>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{mb(r.size)}</span>
        </div>
      )) : <p className="m-0 text-sm text-muted-foreground">Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong.</p>}
    </div>
  );
}
