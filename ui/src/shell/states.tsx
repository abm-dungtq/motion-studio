// The empty and error states every panel shares, with the text of public/panels.js:102-111.
// Empty(text, action, to) keeps the old empty(text, action, to): the button goes to `to`, where
// "ai" is the director tab of the right column, "output" the export dialog and any other id a
// left tab.
import { useProject } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";

// Where an old tab id leads now.
export function goTo(to: string): void {
  const s = useStudio.getState();
  if (to === "ai") { s.setRightTab("director"); s.toggleRight(true); return; }
  if (to === "output") { s.openDialog("export"); return; }
  s.setLeftTab(to);
  s.toggleLeft(true);
}

export const PROJECT_SELECT_ID = "project-select";

export function Loading() {
  return <p className="p-3 text-sm text-muted-foreground">Đang tải…</p>;
}

export function Empty({ text, action, to }: { text: string; action?: string; to?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-3 text-sm text-muted-foreground">
      <p className="m-0">{text}</p>
      {action ? <Button onClick={() => to && goTo(to)}>{action}</Button> : null}
    </div>
  );
}

export function Fail({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return <p className="p-3 text-sm text-muted-foreground">{`Không tải được: ${message}. Thử bấm lại mục này trên thanh trái.`}</p>;
}

// Nothing when the open project has a manifest; otherwise what to do first.
export function NeedManifest() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  if (m) return null;
  if (!name) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-sm text-muted-foreground">
        <p className="m-0">Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu.</p>
        <Button onClick={() => document.getElementById(PROJECT_SELECT_ID)?.focus()}>Chọn dự án</Button>
      </div>
    );
  }
  return <div className="p-3 text-sm text-muted-foreground"><p className="m-0">Dự án chưa có project.json. Bấm "Nhập dự án" trên dải vàng phía trên để mở nó trong Studio.</p></div>;
}
