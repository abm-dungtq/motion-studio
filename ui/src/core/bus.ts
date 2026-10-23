// The Studio event bus for what is not server data or store state (public/app.js:31-32,
// ctx.on / ctx.emit). Shared events:
// - "retimed": a beat or word marker moved; the animatic needs approving again.
// - "focus-note": the timeline asks the inspector to focus the director note of the picked shot.
// - "timing": the player read a new window.TIMING (actions.transport.timing()).
// - "markers": the shared beat/word markers changed (api/markers.ts).
// An area may add its own events with an "<area>:" prefix (for example "anime:shot").
// Plain module, no React, so Node runs it directly.
export type BusHandler = (...args: any[]) => void; // loose: payloads differ by event name

const handlers = new Map<string, Set<BusHandler>>();

export const BUS_EVENTS = ["retimed", "focus-note", "timing", "markers"] as const;

export const bus = {
  // Returns the function that removes the handler again.
  on(event: string, fn: BusHandler): () => void {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => { set.delete(fn); };
  },
  emit(event: string, ...args: unknown[]): void {
    for (const fn of [...(handlers.get(event) ?? [])]) {
      try { fn(...args); } catch (e) { console.error(`bus ${event}`, e); }
    }
  },
};
