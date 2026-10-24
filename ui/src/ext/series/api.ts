// The routes the Tài sản tab reads and writes (docs/assets.md, docs/series.md), through the shared
// client: GET /api/series and /api/assets, POST /api/consent/answer, /api/assets/approve and
// /api/assets/redo. A write answers { status, data?, error? } and, on 200, reloads the assets.
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, ApiError, queryClient, send } from "@/api/client.ts";
import type { AssetsList, BoardKey, SeriesInfo } from "./types.ts";

const enc = encodeURIComponent;
export const POLL_MS = 2000;

export const seriesKeys = {
  series: (name: string | null) => ["/api/series", name] as const,
  assets: (name: string | null) => ["/api/assets", name] as const,
};

// The project's series, or null when it belongs to none (404).
export const seriesQuery = (name: string | null) => queryOptions({
  queryKey: seriesKeys.series(name),
  queryFn: async (): Promise<SeriesInfo | null> => {
    try { return await api<SeriesInfo>(`/api/series?name=${enc(name ?? "")}`); } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
});
export const useSeries = (name: string | null) => useQuery({ ...seriesQuery(name), enabled: Boolean(name) });

export const assetsQuery = (name: string | null) => queryOptions({
  queryKey: seriesKeys.assets(name),
  queryFn: () => api<AssetsList>(`/api/assets?name=${enc(name ?? "")}`),
});
// Polled while a batch runs, so the board follows the job and loads again when it ends.
export const useAssets = (name: string | null, enabled: boolean) => useQuery({
  ...assetsQuery(name),
  enabled: Boolean(name && enabled),
  refetchInterval: (q) => (q.state.data?.batches.some((b) => b.running || b.job) ? POLL_MS : false),
});

export interface WriteResult<T = Record<string, unknown>> { status: number; data?: T; error?: string }

async function write<T>(name: string, path: string, body: Record<string, unknown>): Promise<WriteResult<T>> {
  const r = await send(path, body);
  const { status, error, ...rest } = r as { status: number; error?: string } & Record<string, unknown>;
  if (status === 200) void queryClient.invalidateQueries({ queryKey: seriesKeys.assets(name) });
  return status === 200 ? { status, data: rest as T } : { status, error: error ?? `Studio trả lỗi ${status}` };
}

export const answerConsent = (name: string, id: string, ok: boolean) => write<{ card: unknown; job: unknown }>(name, "/api/consent/answer", { name, id, ok });
export const approveBoard = (name: string, batch: string, board: BoardKey, ids: string[]) => write<{ ids: string[]; copied: string[] }>(name, "/api/assets/approve", { name, batch, board, ids });
export const redoImages = (name: string, batch: string, ids: string[], reason: string) => write<{ job: unknown }>(name, "/api/assets/redo", { name, batch, ids, reason, from: "board" });

export const projectSrc = (name: string, rel: string, v?: string): string =>
  `/p/${enc(name)}/${rel.split("/").map(enc).join("/")}${v ? `?v=${enc(v)}` : ""}`;
