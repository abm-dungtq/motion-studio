// Port of public/fx-footage.js; behaviour unchanged.
// Follows the "fx" job of one clip editor until it ends, through the jobs cache: the SSE "job"
// events keep it current and, while the job runs, GET /api/jobs again every POLL_MS (as the old
// loop did). The end goes into the editor's state: the RESULT line, or what went wrong. After
// WAIT_MS it stops waiting; the job keeps running in Studio.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { jobsQuery, useJobLogs } from "@/api/queries.ts";
import { isRunning, outcomeOf, POLL_MS } from "./clip-params.ts";
import { useFx } from "./fx-store.ts";

export function useJob(name: string | null, key: string): void {
  const id = useFx((s) => s.editors[key]?.job ?? null);
  const { data: jobs } = useQuery({ ...jobsQuery(name), enabled: Boolean(name && id), refetchInterval: id ? POLL_MS : false });
  const logs = useJobLogs(name);

  useEffect(() => {
    if (!id) return;
    const fx = useFx.getState();
    const j = jobs?.find((x) => x.id === id);
    if (!j || isRunning(j)) {
      if (Date.now() > fx.editor(key, "").until) fx.patchEditor(key, { busy: false, job: null, error: "Quá 30 phút; job vẫn chạy trong Studio" });
      return;
    }
    const lines = j.tail?.length ? j.tail : logs[id] ?? [];
    fx.patchEditor(key, { busy: false, job: null, ...outcomeOf(j, lines) });
  }, [id, jobs, logs, key]);
}
