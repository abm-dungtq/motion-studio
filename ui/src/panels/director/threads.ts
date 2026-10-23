// Port of the thread grouping of public/panels.js:117-122 (views.ai); behaviour unchanged.
// A follow-up request (follows: id) joins the thread of the request it answers; the chat shows
// the last SHOWN_THREADS threads.
export const SHOWN_THREADS = 12;

export function threadsOf<R extends { id: string; follows?: string | null }>(requests: readonly R[]): R[][] {
  const threads: R[][] = [], threadOf = new Map<string, R[]>();
  for (const r of requests) {
    const t = r.follows ? threadOf.get(r.follows) : undefined;
    if (t) t.push(r); else threads.push([r]);
    threadOf.set(r.id, t ?? threads[threads.length - 1]);
  }
  return threads;
}
