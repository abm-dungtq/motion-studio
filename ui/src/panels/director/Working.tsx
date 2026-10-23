// Port of public/panels.js:481-489 (working, tail3); behaviour unchanged. "Đạo diễn đang làm…"
// with the last 3 log lines of the running director job, while one runs or a request is running.
import { useJobLogs } from "@/api/queries.ts";
import type { DirectorRequest, Job } from "@/api/types.ts";
import { liveDirectorJob } from "@/core/gate-cards.ts";

export function Working({ name, jobs, requests }: { name: string; jobs: readonly Job[]; requests: readonly DirectorRequest[] }) {
  const logs = useJobLogs(name);
  const job = liveDirectorJob(jobs, requests);
  if (!job && !requests.some((r) => r.status === "running")) return null;
  return (
    <div role="status" data-role="working" className="flex flex-col gap-1 rounded-md border border-border bg-panel-2 p-3 text-sm">
      <strong>Đạo diễn đang làm…</strong>
      {job ? <pre className="m-0 max-h-20 overflow-hidden text-xs whitespace-pre-wrap text-muted-foreground">{(logs[job.id] ?? []).slice(-3).join("\n") || "Đang khởi động…"}</pre> : null}
    </div>
  );
}
