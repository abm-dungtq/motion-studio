// The one place the UI talks to the server (public/app.js:34-49, ctx.api and ctx.send). Areas never
// call fetch or EventSource themselves: they use the hooks and write functions of queries.ts,
// actions.ts and events.ts, which all come through here.
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SendResult } from "@/core/markers.ts";

export type { SendResult };

// The token the server writes into index.html; every POST carries it (server.mjs:297).
export const token = (): string => document.querySelector<HTMLMetaElement>('meta[name="studio-token"]')?.content ?? "";

// A GET that failed: the server's error text (or the status text) and the HTTP status.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// GET a JSON route. Throws ApiError with .status when the answer is not 2xx.
export async function api<T = unknown>(path: string): Promise<T> {
  const r = await fetch(path);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(j?.error ?? r.statusText, r.status);
  return j as T;
}

// POST a JSON body. Never throws: { status, ...answer }; status 0 with timeout (no answer within
// `timeout` ms) or network (the server is not reachable).
export async function send(path: string, body: Record<string, unknown>, { timeout = 0 }: { timeout?: number } = {}): Promise<SendResult> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": token() },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") return { status: 0, timeout: true, error: "Studio không trả lời kịp" };
    return { status: 0, network: true, error: `không kết nối được Studio (${(e as Error).message})` };
  }
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

// A project file under /p/<name>/<path> as text; null when it is not there (404).
export async function projectText(name: string, path: string): Promise<string | null> {
  const r = await fetch(`/p/${encodeURIComponent(name)}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new ApiError(r.statusText, r.status);
  return r.text();
}

// The old toast(msg, err): errors stay 6 s, the rest 3 s (public/dom.js:30-37).
export function say(msg: string, err = false): void {
  if (err) toast.error(msg, { duration: 6000 });
  else toast(msg, { duration: 3000 });
}

// The query cache. The old UI never retried a GET and never reloaded on window focus.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
