// Port of public/panels.js:316-360 and :607-617 (Việc đang chạy of the Xuất bản view); behaviour
// unchanged. The four newest jobs of the project, newest first: kind and step, state, message,
// the log (open while the job runs, kept at its end as lines come in) and "Dừng".
import { useEffect, useRef } from "react";
import { actions } from "@/api/actions.ts";
import { useJobLogs, useJobs, useProject } from "@/api/queries.ts";
import type { Job } from "@/api/types.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";

const KIND: Record<string, string> = { director: "Đạo diễn", export: "Xuất video" };
const STEP: Record<string, string> = { bundle: "bộ lớp dựng" };

export const isLive = (j: Job): boolean => j.status === "running" || j.status === "cancelling";

function JobLog({ lines, open }: { lines: string[]; open: boolean }) {
  const pre = useRef<HTMLPreElement>(null);
  const text = lines.join("\n");
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [text]);
  return (
    <details open={open} className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Log</summary>
      <pre ref={pre} className="mt-1 max-h-48 overflow-auto rounded-sm bg-background p-2 text-xs whitespace-pre-wrap">{text}</pre>
    </details>
  );
}

function JobCard({ job: j, lines }: { job: Job; lines: string[] }) {
  const live = isLive(j);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2.5 text-sm" data-job={j.id}>
      <div className="flex items-baseline justify-between gap-2">
        <strong>{`${KIND[j.kind] ?? j.kind}${j.meta?.step ? ` · ${STEP[j.meta.step] ?? j.meta.step}` : ""}`}</strong>
        <span className="text-xs text-muted-foreground">{live ? "đang chạy" : j.status === "cancelled" ? "đã huỷ" : `exit ${j.code ?? j.signal}`}</span>
      </div>
      {j.meta?.message ? <span className="text-xs">{j.meta.message}</span> : null}
      <JobLog lines={lines} open={live} />
      {live ? <div><Button onClick={() => { void actions.cancelJob(j.id); }}>Dừng</Button></div> : null}
    </div>
  );
}

export function Jobs() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const { data: jobs } = useJobs(name);
  const logs = useJobLogs(name);
  if (!name || !m) return null;
  const list = [...(jobs ?? [])].reverse().slice(0, 4);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-semibold">Việc đang chạy</h3>
      {list.length
        ? list.map((j) => <JobCard key={j.id} job={j} lines={logs[j.id] ?? []} />)
        : <p className="m-0 text-sm text-muted-foreground">Không có việc nào đang chạy. Bấm Xuất video để render bản giao.</p>}
    </div>
  );
}
