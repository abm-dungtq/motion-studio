// Every /api route the old UI called, in one file (66 route strings of public/*.js, minus
// /api/extensions: the loader finds extensions at build time, see ext/load.ts).
// - Reads: for each GET route a query factory xxxQuery(...) (key [route, ...params] plus queryFn)
//   and a hook useXxx(...). Imperative code reads with queryClient.fetchQuery(xxxQuery(...)).
// - Writes: for each POST route a function xxx(body) that answers { status, data?, error? } and,
//   on status 200, invalidates the keys listed next to it.
// The comment above each one names the route and where public/ called it.
import { queryOptions, useQuery, type QueryKey } from "@tanstack/react-query";
import { api, projectText, queryClient, say, send, type SendResult } from "./client.ts";
import type {
  AgentStatus, AgentsScan, DirectorRequest, FileEntry, Gates, Job, LogEntry, Manifest, MediaEntry,
  ProjectEntry, SoundsList, StatusResponse, SuggestChooseResult, SuggestResponse, TimelineMedia,
} from "./types.ts";
import type { TimingData } from "@/core/markers.ts";

const enc = encodeURIComponent;
const params = (p: Record<string, string | number | boolean | null | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "") u.set(k, String(v));
  return u.toString();
};

// Query keys: [route, ...params]. Invalidating [route, name] reaches every key of that project.
export const keys = {
  projects: () => ["/api/projects"] as const,
  status: () => ["/api/status"] as const,
  project: (name: string | null) => ["/api/project", name] as const,
  log: (name: string | null) => ["/api/log", name] as const,
  requests: (name: string | null) => ["/api/requests", name] as const,
  jobs: (name: string | null) => ["/api/jobs", name] as const,
  jobLogs: (name: string | null) => ["jobLogs", name] as const,
  gates: (name: string | null) => ["/api/gates", name] as const,
  timelineMedia: (name: string | null) => ["/api/timeline/media", name] as const,
  agent: (name: string | null) => ["/api/agent", name] as const,
  agents: () => ["/api/agents"] as const,
  sounds: (name: string | null) => ["/api/sounds", name] as const,
  media: (name: string | null) => ["/api/media", name] as const,
  mediaBrowse: (path: string | null) => ["/api/media/browse", path] as const,
  files: (name: string | null, dir?: string) => (dir ? ["/api/files", name, dir] as const : ["/api/files", name] as const),
  library: (p?: Record<string, string>) => (p ? ["/api/library", p] as const : ["/api/library"] as const),
  directions: () => ["/api/directions"] as const,
  timing: (name: string | null) => ["/api/timing", name] as const,
  projectText: (name: string | null, path?: string) => (path ? ["/p", name, path] as const : ["/p", name] as const),
  brollSearch: (p?: Record<string, string | number>) => (p ? ["/api/broll/search", p] as const : ["/api/broll/search"] as const),
  brollPlan: (p?: Record<string, string>) => (p ? ["/api/broll/plan", p] as const : ["/api/broll/plan"] as const),
  brollJob: () => ["/api/broll/job"] as const,
  brollSuggest: (name: string | null, shot?: string) => (shot ? ["/api/broll/suggest", name, shot] as const : ["/api/broll/suggest", name] as const),
  receipt: (name: string | null, id?: string) => (id ? ["/api/receipt", name, id] as const : ["/api/receipt", name] as const),
  receipts: (name: string | null) => ["/api/receipts", name] as const,
  fxCatalog: () => ["/api/fx/catalog"] as const,
  fxLuts: (name: string | null) => ["/api/fx/luts", name] as const,
  lemoStyles: (p?: Record<string, string>) => (p ? ["/api/lemo/styles", p] as const : ["/api/lemo/styles"] as const),
  lemoGuide: (slug: string, source: string) => ["/api/lemo/guide", slug, source] as const,
  suggest: (name: string | null) => ["/api/suggest", name] as const,
  anime: (kind: AnimeKind, name: string | null) => ["/api/anime", kind, name] as const,
  animeJob: (name: string | null, id: string) => ["/api/anime/job", name, id] as const,
};

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

// `/api/projects` — public/app.js:402
export const projectsQuery = () => queryOptions({
  queryKey: keys.projects(),
  queryFn: async () => {
    try { return await api<ProjectEntry[]>(`/api/projects`); } catch (e) { say(`Không tải được danh sách dự án: ${(e as Error).message}`, true); throw e; }
  },
});
export const useProjects = () => useQuery(projectsQuery());

// The entry of one project in the projects list (null while unknown).
export function useProjectEntry(name: string | null): ProjectEntry | null {
  const { data } = useProjects();
  return (name && data?.find((p) => p.name === name)) || null;
}

// `/api/status` — public/app.js:471. A failure reads as null, as the old .catch(() => null).
export const statusQuery = () => queryOptions({
  queryKey: keys.status(),
  queryFn: () => api<StatusResponse>(`/api/status`).catch(() => null),
  staleTime: Infinity,
});
export const useStatus = () => useQuery(statusQuery());

// `/api/project` — public/app.js:249. Only for a project with project.json; SSE keeps it current.
export const projectQuery = (name: string | null) => queryOptions({
  queryKey: keys.project(name),
  queryFn: async () => {
    try { return await api<Manifest>(`/api/project?name=${enc(name ?? "")}`); } catch (e) { say(`Không tải được dự án: ${(e as Error).message}`, true); throw e; }
  },
  staleTime: Infinity,
});
export function useProject(name: string | null) {
  const entry = useProjectEntry(name);
  return useQuery({ ...projectQuery(name), enabled: Boolean(name && entry?.has_manifest) });
}

// `/api/log` — public/app.js:249
export const logQuery = (name: string | null) => queryOptions({
  queryKey: keys.log(name),
  queryFn: async () => {
    try { return await api<LogEntry[]>(`/api/log?name=${enc(name ?? "")}`); } catch (e) { say(`Không tải được dự án: ${(e as Error).message}`, true); throw e; }
  },
  staleTime: Infinity,
});
export function useLog(name: string | null) {
  const entry = useProjectEntry(name);
  return useQuery({ ...logQuery(name), enabled: Boolean(name && entry?.has_manifest) });
}

// A request that changed to done or failed says so (app.js setRequests).
export function announceRequests(prev: readonly DirectorRequest[] | undefined, list: readonly DirectorRequest[]): void {
  const before = new Map((prev ?? []).map((r) => [r.id, r.status]));
  for (const r of list) {
    const was = before.get(r.id);
    if (was && was !== r.status && r.status === "done") say(`Đạo diễn xong: ${String(r.receipt ?? "").slice(0, 160)}`);
    if (was && was !== r.status && r.status === "failed") say(`Yêu cầu không xong: ${String(r.error ?? "").split("\n")[0].slice(0, 160)}`, true);
  }
}
// Put a new requests list in the cache (the SSE "request" event and every refetch).
export function setRequests(name: string, list: DirectorRequest[]): void {
  announceRequests(queryClient.getQueryData(keys.requests(name)), list);
  queryClient.setQueryData(keys.requests(name), list);
}

// `/api/requests` — public/app.js:274
export const requestsQuery = (name: string | null) => queryOptions({
  queryKey: keys.requests(name),
  queryFn: async () => {
    const list = await api<DirectorRequest[]>(`/api/requests?name=${enc(name ?? "")}`);
    if (name) announceRequests(queryClient.getQueryData(keys.requests(name)), list);
    return list;
  },
  staleTime: Infinity,
});
export function useRequests(name: string | null) {
  const entry = useProjectEntry(name);
  return useQuery({ ...requestsQuery(name), enabled: Boolean(name && entry?.has_manifest) });
}

// Job logs per project: job id → lines (ctx.state.logs). Filled from each job's tail, then by the
// SSE "log" events (events.ts).
export type JobLogs = Record<string, string[]>;
export const getJobLogs = (name: string | null): JobLogs => queryClient.getQueryData<JobLogs>(keys.jobLogs(name)) ?? {};
export const setJobLogs = (name: string | null, logs: JobLogs): void => { queryClient.setQueryData(keys.jobLogs(name), logs); };
export function useJobLogs(name: string | null): JobLogs {
  const { data } = useQuery({ queryKey: keys.jobLogs(name), queryFn: () => getJobLogs(name), enabled: false, initialData: {} as JobLogs, staleTime: Infinity });
  return data;
}

// `/api/jobs` — public/app.js:274, public/fx-footage.js:95
export const jobsQuery = (name: string | null) => queryOptions({
  queryKey: keys.jobs(name),
  queryFn: async () => {
    const jobs = await api<Job[]>(`/api/jobs?name=${enc(name ?? "")}`);
    const logs = getJobLogs(name);
    const missing = jobs.filter((j) => !logs[j.id]);
    if (missing.length) setJobLogs(name, { ...logs, ...Object.fromEntries(missing.map((j) => [j.id, [...(j.tail ?? [])]])) });
    return jobs;
  },
  staleTime: Infinity,
});
export function useJobs(name: string | null) {
  const entry = useProjectEntry(name);
  return useQuery({ ...jobsQuery(name), enabled: Boolean(name && entry?.has_manifest) });
}

// `/api/gates` — public/app.js:373. A failed check reads as null (no chip), as refreshGates did.
export const gatesQuery = (name: string | null) => queryOptions({
  queryKey: keys.gates(name),
  queryFn: async (): Promise<Gates | null> => {
    try {
      const g = await api<{ pass?: unknown; fails?: unknown; animatic?: unknown }>(`/api/gates?name=${enc(name ?? "")}`);
      return { pass: g?.pass === true, fails: Array.isArray(g?.fails) ? g.fails.map(String) : [], animatic: g?.animatic === true };
    } catch (e) {
      console.warn("gates:", (e as Error).message);
      return null;
    }
  },
  staleTime: Infinity,
});
// Enabled once the project's manifest is in (refreshGates needed ctx.state.m).
export function useGates(name: string | null) {
  const { data: m } = useProject(name);
  return useQuery({ ...gatesQuery(name), enabled: Boolean(name && m) });
}

// `/api/timeline/media` — public/timeline.js:399. The newest render feeds the Stage poster.
export const timelineMediaQuery = (name: string | null) => queryOptions({
  queryKey: keys.timelineMedia(name),
  queryFn: () => api<TimelineMedia>(`/api/timeline/media?name=${enc(name ?? "")}`),
});
// The route needs project.json (routes/timeline-assets.mjs answers 404 without it).
export function useTimelineMedia(name: string | null) {
  const entry = useProjectEntry(name);
  return useQuery({ ...timelineMediaQuery(name), enabled: Boolean(name && entry?.has_manifest) });
}

// `/api/agent` — public/agent.js:80. Every 60 s, as the old chip did.
export const agentQuery = (name: string | null) => queryOptions({
  queryKey: keys.agent(name),
  queryFn: () => api<AgentStatus>(`/api/agent${name ? `?name=${enc(name)}` : ""}`),
  refetchInterval: 60000,
});
export const useAgent = (name: string | null) => useQuery(agentQuery(name));

// `/api/agents` — public/ext-agents.js:42. data stays undefined and error is set when it fails:
// an agent row shows the error, never controls over a missing scan.
export const agentsQuery = () => queryOptions({ queryKey: keys.agents(), queryFn: () => api<AgentsScan>(`/api/agents`) });
export const useAgents = (enabled = true) => useQuery({ ...agentsQuery(), enabled });

// `/api/sounds` — public/app.js:107
export const soundsQuery = (name: string | null) => queryOptions({ queryKey: keys.sounds(name), queryFn: () => api<SoundsList>(`/api/sounds?name=${enc(name ?? "")}`) });
export const useSounds = (name: string | null) => useQuery({ ...soundsQuery(name), enabled: Boolean(name) });

// `/api/media` — public/panels.js:135, public/fx-footage.js:166
export const mediaQuery = (name: string | null) => queryOptions({ queryKey: keys.media(name), queryFn: () => api<MediaEntry[]>(`/api/media?name=${enc(name ?? "")}`) });
export const useMedia = (name: string | null) => useQuery({ ...mediaQuery(name), enabled: Boolean(name) });

// `/api/media/browse` — public/panels.js:163 (path null: the default folder)
export const mediaBrowseQuery = (path: string | null) => queryOptions({
  queryKey: keys.mediaBrowse(path),
  queryFn: () => api<unknown>(`/api/media/browse${path ? `?path=${enc(path)}` : ""}`),
});
export const useMediaBrowse = (path: string | null, enabled = true) => useQuery({ ...mediaBrowseQuery(path), enabled });

// `/api/files` — public/panels.js:182 (dir=assets), public/panels.js:320 (dir=renders)
export const filesQuery = (name: string | null, dir: string) => queryOptions({
  queryKey: keys.files(name, dir),
  queryFn: () => api<FileEntry[]>(`/api/files?name=${enc(name ?? "")}&dir=${enc(dir)}`),
});
export const useFiles = (name: string | null, dir: string) => useQuery({ ...filesQuery(name, dir), enabled: Boolean(name) });

// `/api/library` — public/panels.js:291 (p: the search params of the library tab)
export const libraryQuery = (p: Record<string, string>) => queryOptions({ queryKey: keys.library(p), queryFn: () => api<unknown>(`/api/library?${params(p)}`) });
export const useLibrary = (p: Record<string, string>, enabled = true) => useQuery({ ...libraryQuery(p), enabled });

// `/api/directions` — public/inspector.js:22 (the seams list; loaded once)
export const directionsQuery = () => queryOptions({ queryKey: keys.directions(), queryFn: () => api<{ seams?: unknown[]; [k: string]: unknown }>(`/api/directions`), staleTime: Infinity });
export const useDirections = () => useQuery(directionsQuery());

// `/api/timing` — public/timeline-markers.js:26. The shared markers (markers.ts) read it too.
export const timingQuery = (name: string | null) => queryOptions({ queryKey: keys.timing(name), queryFn: () => api<TimingData>(`/api/timing?name=${enc(name ?? "")}`) });
export const useTiming = (name: string | null) => useQuery({ ...timingQuery(name), enabled: Boolean(name) });

// /p/<name>/<path> — public/panels.js:128 (STORYBOARD.md). null when the file is not there.
export const projectTextQuery = (name: string | null, path: string) => queryOptions({
  queryKey: keys.projectText(name, path),
  queryFn: () => projectText(name ?? "", path),
});
export const useProjectText = (name: string | null, path: string) => useQuery({ ...projectTextQuery(name, path), enabled: Boolean(name) });

// `/api/broll/search` — public/broll-search.js:57 ({ q, kind, limit })
export const brollSearchQuery = (p: { q: string; kind?: string; limit?: number }) => queryOptions({
  queryKey: keys.brollSearch(p as Record<string, string | number>),
  queryFn: () => api<unknown>(`/api/broll/search?${params({ q: p.q, kind: p.kind ?? "", limit: p.limit ?? 40 })}`),
});
export const useBrollSearch = (p: { q: string; kind?: string; limit?: number }, enabled = true) => useQuery({ ...brollSearchQuery(p), enabled });

// `/api/broll/plan` — public/broll-search.js:74 (p: the scope query)
export const brollPlanQuery = (p: Record<string, string>) => queryOptions({ queryKey: keys.brollPlan(p), queryFn: () => api<unknown>(`/api/broll/plan?${params(p)}`) });
export const useBrollPlan = (p: Record<string, string>, enabled = true) => useQuery({ ...brollPlanQuery(p), enabled });

// `/api/broll/job` — public/broll-search.js:112
export const brollJobQuery = () => queryOptions({ queryKey: keys.brollJob(), queryFn: () => api<{ job: Job | null }>(`/api/broll/job`) });
export const useBrollJob = (refetchInterval: number | false = false) => useQuery({ ...brollJobQuery(), refetchInterval });

// `/api/broll/suggest` — public/ext-broll.js:18
export const brollSuggestQuery = (name: string | null, shot: string) => queryOptions({
  queryKey: keys.brollSuggest(name, shot),
  queryFn: () => api<unknown>(`/api/broll/suggest?name=${enc(name ?? "")}&shot=${enc(shot)}`),
});
export const useBrollSuggest = (name: string | null, shot: string | null, enabled = true) => useQuery({ ...brollSuggestQuery(name, shot ?? ""), enabled: Boolean(enabled && name && shot) });

// `/api/receipt` — public/ext-receipts.js:16
export const receiptQuery = (name: string | null, id: string) => queryOptions({
  queryKey: keys.receipt(name, id),
  queryFn: () => api<unknown>(`/api/receipt?name=${enc(name ?? "")}&id=${enc(id)}`),
});
export const useReceipt = (name: string | null, id: string | null) => useQuery({ ...receiptQuery(name, id ?? ""), enabled: Boolean(name && id) });

// `/api/receipts` — public/receipts-view.js:25 (the newest 20)
export const receiptsQuery = (name: string | null, limit = 20) => queryOptions({
  queryKey: [...keys.receipts(name), limit] as const,
  queryFn: () => api<{ receipts?: unknown[] }>(`/api/receipts?name=${enc(name ?? "")}&limit=${limit}`),
});
export const useReceipts = (name: string | null, limit = 20) => useQuery({ ...receiptsQuery(name, limit), enabled: Boolean(name) });

// `/api/fx/catalog` — public/fx-gallery.js:14 (loaded once per page, as the old cache)
export const fxCatalogQuery = () => queryOptions({ queryKey: keys.fxCatalog(), queryFn: () => api<unknown>(`/api/fx/catalog`), staleTime: Infinity });
export const useFxCatalog = () => useQuery(fxCatalogQuery());

// `/api/fx/luts` — public/fx-footage.js:72
export const fxLutsQuery = (name: string | null) => queryOptions({ queryKey: keys.fxLuts(name), queryFn: () => api<{ luts?: unknown[] }>(`/api/fx/luts?name=${enc(name ?? "")}`) });
export const useFxLuts = (name: string | null, enabled = true) => useQuery({ ...fxLutsQuery(name), enabled: Boolean(enabled && name) });

// `/api/fx/clip` — public/fx-footage.js:21. A media URL for <video src>, not a JSON read.
export const fxClipUrl = (name: string, src: string): string => `/api/fx/clip?name=${enc(name)}&src=${enc(src)}`;

// `/api/lemo/styles` — public/lemo-gallery.js:24 (p: the gallery's query)
export const lemoStylesQuery = (p: Record<string, string>) => queryOptions({ queryKey: keys.lemoStyles(p), queryFn: () => api<unknown>(`/api/lemo/styles?${params(p)}`) });
export const useLemoStyles = (p: Record<string, string>, enabled = true) => useQuery({ ...lemoStylesQuery(p), enabled });

// `/api/lemo/guide` — public/lemo-gallery.js:78 (STYLE.md of one style)
export const lemoGuideQuery = (slug: string, source: string) => queryOptions({
  queryKey: keys.lemoGuide(slug, source),
  queryFn: () => api<{ text: string }>(`/api/lemo/guide?${params({ slug, source })}`),
});
export const useLemoGuide = (slug: string | null, source: string | null) => useQuery({ ...lemoGuideQuery(slug ?? "", source ?? ""), enabled: Boolean(slug && source) });

// `/api/suggest` — routes/suggest.mjs (the stored ranking, the pitch rows, the modes)
export const suggestQuery = (name: string | null) => queryOptions({
  queryKey: keys.suggest(name),
  queryFn: () => api<SuggestResponse>(`/api/suggest?name=${enc(name ?? "")}`),
});
export const useSuggest = (name: string | null) => useQuery({ ...suggestQuery(name), enabled: Boolean(name) });

// `/api/anime/board`, `/api/anime/chars`, `/api/anime/manifest` — public/ext-anime.js:55.
// These need a project folder only, not project.json.
export type AnimeKind = "board" | "chars" | "manifest";
export const animeQuery = (kind: AnimeKind, name: string | null) => queryOptions({
  queryKey: keys.anime(kind, name),
  queryFn: () => api<unknown>(`/api/anime/${kind}?name=${enc(name ?? "")}`),
});
export const useAnime = (kind: AnimeKind, name: string | null) => useQuery({ ...animeQuery(kind, name), enabled: Boolean(name) });

// `/api/anime/job` — public/ext-anime.js:38 (poll while running: refetchInterval in the area)
export const animeJobQuery = (name: string | null, id: string) => queryOptions({
  queryKey: keys.animeJob(name, id),
  queryFn: () => api<{ job: Job; log?: string[] }>(`/api/anime/job?name=${enc(name ?? "")}&id=${enc(id)}`),
});
export const useAnimeJob = (name: string | null, id: string | null, refetchInterval: number | false = false) =>
  useQuery({ ...animeJobQuery(name, id ?? ""), enabled: Boolean(name && id), refetchInterval });

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

// The answer of a write: HTTP status (0: no answer, see timeout / network), the server's error
// text, and the rest of the JSON answer as data.
export interface WriteResult<T = Record<string, any>> { status: number; data?: T; error?: string; timeout?: boolean; network?: boolean } // loose: route answers differ
type Body = Record<string, unknown>;
type NameBody = { name: string } & Body;

async function write(path: string, body: Body, invalidate: readonly QueryKey[], opts: { timeout?: number } = {}): Promise<WriteResult> {
  const r: SendResult = await send(path, body, opts);
  const { status, error, timeout, network, ...data } = r;
  if (status === 200) await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  return { status, data, error, timeout, network };
}
const edits = (name: string): QueryKey[] => [keys.project(name), keys.log(name)];
const queue = (name: string): QueryKey[] => [keys.requests(name), keys.jobs(name)];

// `/api/patch` — public/app.js:53 ({ name, base, ops })
export const patch = (b: NameBody & { base: number; ops: unknown[] }) => write(`/api/patch`, b, edits(b.name));
// `/api/undo` — public/app.js:63
export const undo = (b: NameBody & { base: number }) => write(`/api/undo`, b, edits(b.name));
// `/api/redo` — public/app.js:75
export const redo = (b: NameBody & { base: number }) => write(`/api/redo`, b, edits(b.name));
// `/api/director` — public/app.js:143 ({ name, scope, target?, t?, text, ... })
export const director = (b: NameBody) => write(`/api/director`, b, queue(b.name));
// `/api/director/answer` — public/app.js:152 (opts.timeout: ANSWER_TIMEOUT_MS)
export const directorAnswer = (b: NameBody & { id: string; value: unknown }, opts: { timeout?: number } = {}) => write(`/api/director/answer`, b, queue(b.name), opts);
// `/api/director/cancel` — public/app.js:159
export const directorCancel = (b: NameBody & { id: string }) => write(`/api/director/cancel`, b, queue(b.name));
// `/api/jobs/cancel` — public/app.js:164
export const jobsCancel = (b: NameBody & { id: string }) => write(`/api/jobs/cancel`, b, [keys.jobs(b.name)]);
// `/api/export` — public/app.js:170
export const exportJob = (b: NameBody) => write(`/api/export`, b, queue(b.name));
// `/api/bundle` — public/app.js:179
export const bundle = (b: NameBody) => write(`/api/bundle`, b, queue(b.name));
// `/api/import` — public/app.js:328
export const importManifest = (b: NameBody) => write(`/api/import`, b, [keys.projects()]);
// `/api/projects/new` — public/new-project.js:58
export const projectsNew = (b: NameBody) => write(`/api/projects/new`, b, [keys.projects()]);
// `/api/media/register` — public/panels.js:148 ({ name, src })
export const mediaRegister = (b: NameBody & { src: string }) => write(`/api/media/register`, b, [keys.media(b.name)]);
// `/api/sounds/import` — public/app.js:122 ({ name, file })
export const soundsImport = (b: NameBody & { file: string }) => write(`/api/sounds/import`, b, [keys.sounds(b.name)]);
// `/api/timeline/asset` — public/timeline-lanes.js:50 ({ name, shot, base, path })
export const timelineAsset = (b: NameBody & { shot: string; base: number; path: string }) => write(`/api/timeline/asset`, b, [...edits(b.name), keys.timelineMedia(b.name), keys.media(b.name)]);
// `/api/timing/beat` — public/timeline-markers.js:55 (the shared markers send it; see markers.ts)
export const timingBeat = (b: NameBody) => write(`/api/timing/beat`, b, [keys.timing(b.name)]);
// `/api/timing/word` — public/timeline-markers.js:60
export const timingWord = (b: NameBody) => write(`/api/timing/word`, b, [keys.timing(b.name)]);
// `/api/timing/undo` — public/timeline-markers.js:63
export const timingUndo = (b: NameBody) => write(`/api/timing/undo`, b, [keys.timing(b.name)]);
// `/api/timing/word-sync` — public/timeline-markers.js:70
export const timingWordSync = (b: NameBody) => write(`/api/timing/word-sync`, b, [keys.jobs(b.name)]);
// `/api/agents/refresh` — public/ext-agents.js:39 (answers the new scan)
export const agentsRefresh = () => write(`/api/agents/refresh`, {}, [keys.agents()]);
// `/api/agents/probe` — public/ext-agents.js:61 ({ id, cap })
export const agentsProbe = (b: { id: string; cap: string }) => write(`/api/agents/probe`, b, [keys.agents()]);
// `/api/broll/index` — public/broll-search.js:97
export const brollIndex = (b: Body) => write(`/api/broll/index`, b, [keys.brollJob(), keys.brollPlan()]);
// `/api/broll/apply` — public/ext-broll.js:44 (opts.timeout: 11 minutes in the old UI)
export const brollApply = (b: NameBody & { shot: string; base: number }, opts: { timeout?: number } = {}) => write(`/api/broll/apply`, b, [...edits(b.name), keys.media(b.name), keys.brollSuggest(b.name)], opts);
// `/api/fx/footage` — public/fx-footage.js:88 (starts the project's "fx" job)
export const fxFootage = (b: NameBody) => write(`/api/fx/footage`, b, [keys.jobs(b.name)]);
// `/api/fx/apply-transition` — public/fx-gallery.js:70
export const fxApplyTransition = (b: NameBody & { shot: string; id: string; base: number }) => write(`/api/fx/apply-transition`, b, [...edits(b.name), ...queue(b.name)]);
// `/api/fx/use-clip` — public/fx-footage.js:123
export const fxUseClip = (b: NameBody & { shot: string; base: number; clip: string }) => write(`/api/fx/use-clip`, b, [...edits(b.name), keys.media(b.name)]);
// `/api/lemo/fetch` — public/lemo-gallery.js:33
export const lemoFetch = () => write(`/api/lemo/fetch`, {}, [keys.lemoStyles()]);
// `/api/lemo/apply` — public/lemo-gallery.js:61-65 (replace / mode follow-ups are new calls)
export const lemoApply = (b: NameBody) => write(`/api/lemo/apply`, b, [...edits(b.name), ...queue(b.name)]);
// `/api/lemo/draft` — public/lemo-mystyle.js:56
export const lemoDraft = (b: NameBody) => write(`/api/lemo/draft`, b, [keys.lemoStyles(), ...queue(b.name)]);
// `/api/lemo/keep` — public/lemo-mystyle.js:34
export const lemoKeep = (b: NameBody) => write(`/api/lemo/keep`, b, [keys.lemoStyles()]);
// `/api/suggest` — routes/suggest.mjs (rank now; refresh skips the cache)
// (the case suggestion of the same POST ranks the whole case library: allow it up to 2 minutes)
export const suggestRun = (b: NameBody) => write(`/api/suggest`, b, [keys.suggest(b.name)], { timeout: 120000 }) as Promise<WriteResult<SuggestResponse>>;
// `/api/suggest/choose` — routes/suggest.mjs (choose through the provider, or queue a pitch request)
export const suggestChoose = (b: NameBody) => write(`/api/suggest/choose`, b, [keys.suggest(b.name), keys.projectText(b.name), ...edits(b.name), ...queue(b.name)], { timeout: 150000 }) as Promise<WriteResult<SuggestChooseResult>>;
// `/api/anime/chars` — public/anime-chars.js:18, :26, :33 ({ name, char } | { name, remove } | { name, generate })
export const animeChars = (b: NameBody) => write(`/api/anime/chars`, b, [keys.anime("chars", b.name), keys.anime("board", b.name)]);
// `/api/anime/variant` — public/anime-board.js:62
export const animeVariant = (b: NameBody) => write(`/api/anime/variant`, b, [keys.anime("board", b.name)]);
// `/api/anime/manifest` — public/anime-manifest.js:48 ({ name, base_sha, manifest, confirm })
export const animeManifest = (b: NameBody) => write(`/api/anime/manifest`, b, [keys.anime("manifest", b.name)]);
// `/api/anime/enable` — public/anime-manifest.js:34
export const animeEnable = (b: NameBody) => write(`/api/anime/enable`, b, [keys.anime("manifest", b.name), keys.anime("board", b.name)]);
// `/api/anime/rebuild` — public/anime-manifest.js:59 ({ name, confirm })
export const animeRebuild = (b: NameBody) => write(`/api/anime/rebuild`, b, [keys.anime("manifest", b.name)]);
