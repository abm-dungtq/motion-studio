// The strip under the top bar (public/app.js:335-363, open() and setManifest()): no provider (and
// the command that fixes it), a project without project.json (and "Nhập dự án"), or a read-only
// project imported from the old format. Hidden otherwise.
import { actions } from "@/api/actions.ts";
import { useProject, useProjectEntry } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";

const STRIP = "flex shrink-0 flex-wrap items-center gap-1 border-b border-warn/40 bg-warn/15 px-3 py-1.5 text-sm text-foreground";

export function Banner() {
  const ps = useStudio((s) => s.providerStatus);
  const name = useStudio((s) => s.name);
  const entry = useProjectEntry(name);
  const { data: m } = useProject(name);

  if (ps && !ps.ok) {
    return (
      <div role="status" data-banner="provider" className={STRIP}>
        <strong>{ps.error ?? "Chưa có provider."}</strong>
        {" Chạy "}<code className="rounded bg-background/60 px-1">{ps.setup ?? "npm run setup"}</code>{" trong thư mục Motion Studio, rồi tải lại trang."}
      </div>
    );
  }
  if (entry && !entry.has_manifest) {
    return (
      <div role="status" data-banner="import" className={STRIP}>
        {"Dự án chưa có project.json. "}
        <Button className="h-7" onClick={() => { void actions.importProject(entry.name); }}>Nhập dự án</Button>
      </div>
    );
  }
  if (m && !m.capabilities?.editable) {
    return <div role="status" data-banner="readonly" className={STRIP}>Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn</div>;
  }
  return null;
}
