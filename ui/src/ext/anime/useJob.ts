// Port of public/ext-anime.js; behaviour unchanged.
// Following one anime job (the old A.follow): GET /api/anime/job every POLL_MS while it runs, for at
// most JOB_MAX_MS. useFollow polls and runs onEnd once when the job ends; it is mounted by the tab,
// so the end toast does not depend on which sub-tab is open. useJobView reads the same cache
// without polling, for the views that show the log.
import { useEffect, useRef } from "react";
import { queryClient } from "@/api/client.ts";
import { keys, useAnimeJob } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { useAnimeStore, type JobRef, type Slot } from "./store.ts";
import { isLive, type JobView } from "./types.ts";

export const POLL_MS = 1200;
export const JOB_MAX_MS = 10 * 60000;

// What a view shows of a followed job: the last answer, or the POST's job with an empty log, or the
// read error as the only log line.
function viewOf(ref: JobRef, data: JobView | undefined, error: Error | null): JobView {
  if (error) return { job: ref.job, log: [`không đọc được job: ${error.message}`] };
  return data ?? { job: ref.job, log: [] };
}

export function useFollow(slot: Slot, onEnd: (j: JobView, ref: JobRef) => void): void {
  const name = useStudio((s) => s.name);
  const ref = useAnimeStore((s) => s.jobs[slot]);
  const id = ref?.id ?? null;
  const cached = id ? queryClient.getQueryData<JobView>(keys.animeJob(name, id)) : undefined;
  const polling = Boolean(ref && !ref.ended && (!cached || isLive(cached.job)) && Date.now() - ref.t0 < JOB_MAX_MS);
  const q = useAnimeJob(name, id, polling ? POLL_MS : false);
  const data = q.data as JobView | undefined;
  const end = useRef(onEnd);
  end.current = onEnd;

  useEffect(() => {
    if (!ref || ref.ended) return;
    if (q.error) { useAnimeStore.getState().ended(slot); return; }
    if (data && !isLive(data.job)) {
      useAnimeStore.getState().ended(slot);
      end.current(data, ref);
    }
  }, [ref, data, q.error, slot]);
}

export function useJobView(slot: Slot): JobView | null {
  const name = useStudio((s) => s.name);
  const ref = useAnimeStore((s) => s.jobs[slot]);
  const q = useAnimeJob(name, ref?.id ?? null, false);
  return ref ? viewOf(ref, q.data as JobView | undefined, q.error) : null;
}
