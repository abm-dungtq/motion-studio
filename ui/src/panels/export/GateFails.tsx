// Port of public/panels.js:316-360 (the gate failures of the Xuất bản view); behaviour unchanged.
// Without a project with project.json the dialog says what to do first, here, once.
import { useState } from "react";
import { actions } from "@/api/actions.ts";
import { useGates, useProject } from "@/api/queries.ts";
import { Button } from "@/shell/controls.tsx";
import { NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";

export function GateFails() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const { data: g } = useGates(name);
  const [busy, setBusy] = useState(false);
  if (!name || !m) return <NeedManifest />;
  if (!g || g.pass || !g.fails.length) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-danger/50 bg-panel-2 p-3 text-sm">
      <h3 className="m-0 text-sm font-semibold">{g.animatic ? "Cần duyệt lại animatic" : "Chưa đủ cổng xuất"}</h3>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs">
        {g.fails.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      <div>
        <Button disabled={busy} onClick={() => { setBusy(true); void actions.recheckGates().finally(() => setBusy(false)); }}>{busy ? "Đang kiểm…" : "Kiểm lại"}</Button>
      </div>
    </div>
  );
}
