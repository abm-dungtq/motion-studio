// The projects opened lately, newest first, kept in localStorage ("ms-recent") for the welcome
// screen. A name the server no longer lists stays stored (an external drive may come back); the
// welcome screen just does not show it.

export const RECENT_STORE = "ms-recent";
export const RECENT_MAX = 6;

// name first, no repeats, at most max.
export function pushRecent(list: readonly string[], name: string, max = RECENT_MAX): string[] {
  return [name, ...list.filter((x) => x !== name)].slice(0, max);
}

export function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
  } catch { return []; }
}

export function rememberRecent(name: string): void {
  try { window.localStorage.setItem(RECENT_STORE, JSON.stringify(pushRecent(readRecent(), name))); } catch { /* storage blocked */ }
}
