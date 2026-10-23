// The one shared beat/word marker instance (ctx.markers of public/app.js:202-203), made with
// createMarkers of core/markers.ts. The timeline draws and drags the markers, the inspector shows
// the picked one; both read this instance through useMarkers().
// Its ctx is wired here so no area has to:
// - state.name and state.retimed: the store; state.m: the query cache; state.logs: the job logs
//   the SSE feed collects (events.ts);
// - editable: the open manifest's capabilities;
// - api / send: client.ts; toast: say(); emit("retimed"): the bus;
// - on("jobs") and on("project"): fed by events.ts through notifyMarkers();
// - transport: actions.transport (reload the player when the timing job rewrote TIMING).
// markers.load() runs when the manifest changes (events.ts, as public/app.js:213).
import { useSyncExternalStore } from "react";
import { bus } from "@/core/bus.ts";
import { createMarkers, type Markers, type MarkersCtx } from "@/core/markers.ts";
import { useStudio } from "@/store/studio.ts";
import { actions, current } from "./actions.ts";
import { api, say, send } from "./client.ts";
import { getJobLogs } from "./queries.ts";

type Handler = (e: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

// Feeds the markers' own ctx.on: "jobs" with an SSE job event, "project" when a project opens.
export function notifyMarkers(event: "jobs" | "project", payload?: unknown): void {
  for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
}

const state = {
  get name() { return useStudio.getState().name; },
  get m() { return current().m; },
  get logs() { return new Map(Object.entries(getJobLogs(useStudio.getState().name))); },
  get retimed() { return useStudio.getState().retimed; },
  set retimed(v: boolean) { useStudio.getState().setRetimed(Boolean(v)); },
};

const ctx: MarkersCtx = {
  state,
  get editable() { return current().editable; },
  api: <T = unknown>(path: string) => api<T>(path),
  send: (path, body) => send(path, body),
  toast: (msg, err = false) => say(msg, err),
  emit: (event, payload) => bus.emit(event, payload),
  on: (event, fn) => {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn);
  },
  get transport() { return actions.transport; },
};

let version = 0;
export const markers: Markers = createMarkers(ctx, {
  onChange: () => { version++; bus.emit("markers"); },
});

// The shared markers; the component renders again whenever they change.
export function useMarkers(): Markers {
  useSyncExternalStore((cb) => bus.on("markers", cb), () => version, () => version);
  return markers;
}
