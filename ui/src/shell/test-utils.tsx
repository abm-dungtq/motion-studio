// Shared helpers for component tests (vitest + Testing Library in jsdom). vite.config.ts has no
// setupFiles, so a test file imports this first: it adds the jest-dom matchers and the browser APIs
// Radix and react-resizable-panels need but jsdom lacks, renders inside the real providers, answers
// fetch from a route table, and resets the store, the query cache and the registry between tests.
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { cleanup, render, type RenderResult } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/api/client.ts";
import { resetRegistry } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";

class NoopResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
class NoopEventSource extends EventTarget {
  url: string; readyState = 0; onmessage = null; onerror = null; onopen = null;
  constructor(url: string) { super(); this.url = url; }
  close(): void { this.readyState = 2; }
}

const g = globalThis as Record<string, unknown>;
g.ResizeObserver ??= NoopResizeObserver;
g.EventSource ??= NoopEventSource;
if (typeof window !== "undefined") {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  const el = Element.prototype as unknown as Record<string, unknown>;
  el.scrollIntoView ??= function scrollIntoView() {};
  el.hasPointerCapture ??= function hasPointerCapture() { return false; };
  el.setPointerCapture ??= function setPointerCapture() {};
  el.releasePointerCapture ??= function releasePointerCapture() {};
}

// A route table for fetch: the key is a path without the query string ("/api/projects"); the value
// is the JSON answer, or a function of the URL and init. Anything else answers 404.
export type Routes = Record<string, unknown | ((url: URL, init?: RequestInit) => unknown)>;
export function mockFetch(routes: Routes = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://studio.test");
    if (!(url.pathname in routes)) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const v = routes[url.pathname];
    const body = typeof v === "function" ? (v as (u: URL, i?: RequestInit) => unknown)(url, init) : v;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function renderUi(ui: ReactElement): RenderResult {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        {ui}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

export function resetAll(): void {
  queryClient.clear();
  resetRegistry();
  useStudio.setState(useStudio.getInitialState(), true);
  try { window.localStorage.clear(); } catch { /* storage blocked */ }
  window.history.replaceState(null, "", "/");
}

afterEach(() => {
  cleanup();
  resetAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
