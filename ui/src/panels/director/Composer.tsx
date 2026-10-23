// Port of public/panels.js:491-505 (composer); behaviour unchanged. The box for a new task: its
// draft lives in the store (directorDraft), so it survives tab switches; Cmd/Ctrl+Enter or
// "Giao việc" sends it as a project request and clears it once sent. An empty box is refused by
// actions.direct ("Viết yêu cầu cho đạo diễn trước"). Read-only projects take requests too.
import { useState } from "react";
import { actions } from "@/api/actions.ts";
import { Button, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";

export function Composer() {
  const draft = useStudio((s) => s.directorDraft);
  const [sending, setSending] = useState(false);
  const ask = async () => {
    setSending(true);
    let ok = false;
    try { ok = await actions.direct({ scope: "project", text: useStudio.getState().directorDraft.trim() }); } finally { setSending(false); }
    if (ok) useStudio.getState().setDirectorDraft("");
  };
  return (
    <div data-role="composer" className="flex flex-col gap-2">
      <Textarea
        value={draft}
        rows={3}
        aria-label="Việc giao cho AI"
        placeholder="Ví dụ: shot 2 chậm lại, chữ to hơn, thêm logo cuối video…"
        onChange={(e) => useStudio.getState().setDirectorDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void ask(); }
        }}
      />
      <div className="flex items-center gap-2">
        <small className="text-xs text-muted-foreground">⌘/Ctrl+Enter để gửi</small>
        <span className="flex-1" />
        <Button variant="primary" disabled={sending} onClick={() => { void ask(); }}>Giao việc</Button>
      </div>
    </div>
  );
}
