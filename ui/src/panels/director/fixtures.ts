// Small shapes of live /api answers (test Studio on 4411, project thuy-mau-demo) for the
// director and inspector component tests.
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { DirectorRequest, Job, Manifest, ProjectEntry } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";

export const NAME = "thuy-mau-demo";

export const manifest = (editable = true): Manifest => ({
  version: 4,
  duration: 20,
  capabilities: { editable },
  shots: [
    { id: "s1", start: 0, end: 6.5, name: "Thung lũng", assets: [] },
    { id: "s2", start: 6.5, end: 12.5, name: "Chữ tiếng Việt", motion_note: "" },
  ],
  lines: [{ id: "vo-03", shot: "s2", start: 12.8, duration: 3.6, text: "Kéo dài một cảnh, nét vẽ tự giãn theo nhịp.", gate: "stale" }],
  music: [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: null, gain: 1 }],
  events: [
    { id: "sfx-whoosh", shot: "s1", offset: 6.3, sound: "assets/sfx/whoosh.mp3", label: "Máy quay bay" },
    { id: "sfx-1", shot: "s2", offset: 1, sound: "assets/sfx/pop.mp3", label: "pop", studio: true },
  ],
});

export const req = (id: string, over: Partial<DirectorRequest> = {}): DirectorRequest => ({
  id, at: "2026-10-23T04:39:36.000Z", scope: "project", base: 4, text: `việc ${id}`, status: "done", receipt: `xong ${id}`, ...over,
});

export const choiceAsk = {
  kind: "choice", gate: "direction", question: "Chọn hướng?", at: "2026-10-23T04:53:26.000Z",
  options: [{ id: "1", label: "Tối giản" }, { id: "2", label: "Rực rỡ" }, { id: "3", label: "Cổ điển" }],
  artifacts: ["pitch/1.png", "pitch/2.png", "pitch/3.png"],
};
export const approveAsk = { kind: "approve", gate: "animatic", question: "Duyệt animatic?", at: "2026-10-23T04:53:30.000Z", artifacts: ["demo/animatic.mp4"] };

// Opens the project in the store and the query cache, with these requests and jobs.
export function openProject({ requests = [] as DirectorRequest[], jobs = [] as Job[], editable = true } = {}): Manifest {
  const m = manifest(editable);
  const entry: ProjectEntry = { name: NAME, title: "demo", has_manifest: true, editable, version: m.version };
  queryClient.setQueryData(keys.projects(), [entry]);
  queryClient.setQueryData(keys.project(NAME), m);
  queryClient.setQueryData(keys.requests(NAME), requests);
  queryClient.setQueryData(keys.jobs(NAME), jobs);
  useStudio.setState({ name: NAME });
  return m;
}

// The routes the opened project's queries refetch, answering what the cache holds.
export const routes = () => ({
  "/api/projects": () => queryClient.getQueryData(keys.projects()),
  "/api/project": () => queryClient.getQueryData(keys.project(NAME)),
  "/api/requests": () => queryClient.getQueryData(keys.requests(NAME)),
  "/api/jobs": () => queryClient.getQueryData(keys.jobs(NAME)),
  "/api/log": [],
  "/api/directions": { seams: ["inverse-zoom-through", "whip-pan"] },
});
