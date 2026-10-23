// The live feed of the open project (public/app.js:316-325, subscribe) and what follows a new
// manifest (app.js setManifest, :213, :214, :395-399). App mounts useProjectEvents once.
// - SSE "manifest": a version other than the shown one reloads the project and its log.
// - SSE "request": the new requests list (done / failed say so, as setRequests did).
// - SSE "job": the job merged into the jobs list, its log line kept, an export's end said
//   (as onJob did), then handed to the shared markers (timing and word-sync jobs).
// - A new manifest keeps sel and pick valid, reloads the markers, and 1.5 s later the gates.
// - bus "retimed": store.retimed = true and the gates again after 0.5 s.
import { useEffect, useRef } from "react";
import { bus } from "@/core/bus.ts";
import { useStudio } from "@/store/studio.ts";
import { actions } from "./actions.ts";
import { queryClient, say } from "./client.ts";
import { markers, notifyMarkers } from "./markers.ts";
import { getJobLogs, keys, setJobLogs, setRequests, useProject, useProjectEntry } from "./queries.ts";
import type { DirectorRequest, Job, JobEvent, Manifest } from "./types.ts";

// One SSE job event into the cache (app.js onJob).
export function applyJobEvent(name: string, e: JobEvent): void {
  const jobs = (queryClient.getQueryData<Job[]>(keys.jobs(name)) ?? []).filter((j) => j.id !== e.job.id);
  queryClient.setQueryData(keys.jobs(name), [...jobs, e.job].sort((a, b) => a.started.localeCompare(b.started)));
  const logs = getJobLogs(name);
  const lines = logs[e.job.id] ?? [];
  if (e.type === "log" && e.line != null) setJobLogs(name, { ...logs, [e.job.id]: [...lines, e.line] });
  else if (!logs[e.job.id]) setJobLogs(name, { ...logs, [e.job.id]: [] });
  const j = e.job;
  if (e.type === "exit" && j.kind === "export") {
    if (j.code === 5) say(j.meta?.message ?? "Thiếu cổng", true);
    else if (j.code === 0 && j.meta?.step === "compress") say(`Đã xuất ${j.meta.output}`);
    else if (j.code === 0 && j.meta?.step === "bundle") say(`Đã xuất bộ lớp dựng ${j.meta.output}`);
    else if (j.code !== 0 && j.status !== "cancelled") say(`${j.meta?.step === "bundle" ? "Xuất bộ lớp dựng" : "Xuất video"} lỗi (exit ${j.code})`, true);
  }
  notifyMarkers("jobs", e);
}

// sel stays a shot of the manifest and pick a block of it (app.js setManifest). A beat or word
// marker stays picked while the project is open; the inspector says when it is gone.
export function syncPick(m: Manifest | null): void {
  const s = useStudio.getState();
  let sel = s.sel;
  if (m && !m.shots.some((x) => x.id === sel)) sel = m.shots[0]?.id ?? null;
  const p = s.pick;
  const lists: Record<string, { id: string }[] | undefined> = { shot: m?.shots, line: m?.lines, music: m?.music, event: m?.events };
  const marker = m && (p?.kind === "beat" || p?.kind === "word");
  let pick = p;
  if (!marker && (!p || !(lists[p.kind] ?? []).some((x) => x.id === p.id))) pick = sel ? { kind: "shot", id: sel } : null;
  if (sel !== s.sel || pick !== s.pick) useStudio.setState({ sel, pick });
}

const parse = <T>(data: string): T | null => { try { return JSON.parse(data) as T; } catch { return null; } };

export function useProjectEvents(name: string | null): void {
  const entry = useProjectEntry(name);
  const providerOk = useStudio((s) => s.providerStatus?.ok !== false);
  const live = Boolean(name && entry?.has_manifest && providerOk);
  const { data: m } = useProject(name);
  const gateTimer = useRef(0);
  const shown = useRef<string | null>(null);

  // A project opened: the markers forget the last one's retime flag.
  useEffect(() => { notifyMarkers("project", name); }, [name]);

  useEffect(() => {
    if (!live || !name) return;
    const es = new EventSource(`/api/events?name=${encodeURIComponent(name)}`);
    const mine = () => useStudio.getState().name === name;
    es.addEventListener("manifest", (e) => {
      const next = parse<{ version?: number }>((e as MessageEvent).data);
      const shownVersion = queryClient.getQueryData<Manifest>(keys.project(name))?.version;
      if (mine() && next && next.version !== shownVersion) void actions.reload();
    });
    es.addEventListener("request", (e) => {
      const list = parse<DirectorRequest[]>((e as MessageEvent).data);
      if (mine() && Array.isArray(list)) setRequests(name, list);
    });
    es.addEventListener("job", (e) => {
      const ev = parse<JobEvent>((e as MessageEvent).data);
      if (mine() && ev?.job) applyJobEvent(name, ev);
    });
    return () => es.close();
  }, [live, name]);

  // A new manifest (or none): keep the pick valid, reload the markers, the gates 1.5 s later.
  useEffect(() => {
    syncPick(m ?? null);
    void markers.load();
    const key = m && name ? `${name}:${m.version}` : null;
    const first = !shown.current || !key || shown.current.split(":")[0] !== name;
    shown.current = key;
    window.clearTimeout(gateTimer.current);
    if (m && !first) gateTimer.current = window.setTimeout(() => { void actions.refreshGates(); }, 1500);
  }, [m, name]);

  useEffect(() => bus.on("retimed", () => {
    useStudio.getState().setRetimed(true);
    window.clearTimeout(gateTimer.current);
    gateTimer.current = window.setTimeout(() => { void actions.refreshGates(); }, 500);
  }), []);

  useEffect(() => () => window.clearTimeout(gateTimer.current), []);
}
