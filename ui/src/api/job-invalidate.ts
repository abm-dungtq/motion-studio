// Job-driven reads refreshed by the project's SSE "job" events instead of a 2 s poll. A job's start
// and exit invalidate the queries its kind changes (JOB_QUERIES) and the project's job list; the
// readers keep a FALLBACK_POLL_MS poll while their job runs, in case an event is missed. The poll
// stays at its old pace when no event can reach the page: the stream is not open for this project
// (no project.json, provider down, reconnecting) or the job belongs to another owner (the
// workspace broll scan, the agent probe), since /api/events only forwards jobs of its project.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { create } from "zustand";
import { keys } from "./queries.ts";
import type { JobEvent } from "./types.ts";

export const FALLBACK_POLL_MS = 30000;

// Kind (jobs.mjs startJob) → the queries its run changes. Keys of the extensions are written out
// here so this map does not pull their modules into the main chunk; each names its owner.
export const JOB_QUERIES: Record<string, (name: string) => QueryKey[]> = {
  broll: () => [keys.brollJob(), keys.brollPlan(), keys.brollSearch()],
  anime: (n) => [["/api/anime/job", n]],
  "anime-build": (n) => [["/api/anime/job", n]],
  // ext/series: DeliveryPanel (/api/delivery), api.ts (/api/assets, /api/consent, /api/series,
  // /api/voice/previews), ScenesCard (/api/scenes), HandoffCard (/api/handoff).
  // A tracked step that fails twice writes a handoff card before its job ends (lib/handoff.mjs).
  export: (n) => [["/api/delivery", n], ["/api/handoff", n]],
  drive: (n) => [["/api/delivery", n], ["/api/handoff", n]],
  "asset-batch": (n) => [["/api/delivery", n], ["/api/assets", n], ["/api/consent", n], ["/api/handoff", n]],
  scene: (n) => [["/api/scenes", n], ["/api/handoff", n]],
  tts: (n) => [["/api/handoff", n]],
  series: (n) => [["/api/series", n], ["/api/handoff", n], ["/api/consent", n]],
  "voice-design": (n) => [["/api/voice/previews", n]],
  director: (n) => [["/api/handoff", n], ["/api/consent", n]],
  // ext/videogen: ShotVideogen and JobTray (items), api.ts (status).
  videogen: (n) => [["videogen", "items", n], ["videogen", "status"]],
};

// Kinds whose exit changes what the final export gate reads: the render (export), the voice (tts),
// the timing markers (timing, word-sync), the built scenes (scene) and the director's edits.
export const GATE_KINDS = new Set(["export", "tts", "timing", "word-sync", "scene", "director"]);

export function invalidateForJob(qc: QueryClient, name: string, e: Pick<JobEvent, "type" | "job">): void {
  if (e.type !== "start" && e.type !== "exit") return;
  const queries = [keys.jobs(name), ...(JOB_QUERIES[e.job.kind]?.(name) ?? [])];
  if (e.type === "exit" && GATE_KINDS.has(e.job.kind)) queries.push(keys.gates(name));
  for (const queryKey of queries) void qc.invalidateQueries({ queryKey });
}

// The project whose event stream is open now, or null.
export const useEventsStore = create<{ live: string | null }>(() => ({ live: null }));
export const setEventsLive = (name: string | null) => useEventsStore.setState({ live: name });
export const useEventsLive = (name: string | null): boolean => useEventsStore((s) => Boolean(name) && s.live === name);
