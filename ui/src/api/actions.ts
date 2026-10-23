// The Studio's commands, ported from the ctx functions of public/app.js:50-198 and the shell
// functions next to them (open, importProject, refreshQueue, refreshGates, the Delete key, the
// onCreated of the new-project dialog). Same order of calls, same toast text. ctx.reload() is
// a refetch of the project and its log; ctx.state comes from the store and the query cache.
// actions.transport is the player's control, set by shell/Stage.tsx; until a Stage mounts it is a
// no-op transport whose time() is the store's playhead.
import { answerFailure, ANSWER_TIMEOUT_MS } from "@/core/gate-cards.ts";
import { nextSfxId, splitOps } from "@/core/timeline-edit.ts";
import type { AudioRule } from "@/core/player.ts";
import { openPointMenu } from "@/shell/PointMenu.tsx";
import { useStudio, type PickKind } from "@/store/studio.ts";
import { queryClient, say } from "./client.ts";
import * as Q from "./queries.ts";
import type { Manifest, ProjectEntry, SfxEventFull, SoundsList } from "./types.ts";

export interface Transport {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  step(dt: number): void;
  time(): number;
  duration(): number;
  playing(): boolean;
  reload(): void;               // load the same version again at the same time (TIMING changed)
  timing(): unknown;            // the composition's window.TIMING, null when none (bus "timing")
  audioIds(): string[];         // ids of the composition's <audio> tags
  setMute(rule: AudioRule): void;
}

export const idleTransport: Transport = {
  play() {}, pause() {}, toggle() {}, seek() {}, step() {}, reload() {}, setMute() {},
  time: () => useStudio.getState().t,
  duration: () => current().m?.duration ?? 0,
  playing: () => false,
  timing: () => null,
  audioIds: () => [],
};

export interface DirectorRequestBody { scope: "project" | "shot" | "line" | string; target?: string | null; t?: number | null; text: string; [k: string]: unknown }
export interface AnswerOutcome { ok: boolean; message: string | null }

// The open project: name, its entry in the projects list, its manifest and the edit flag.
export function current(): { name: string | null; entry: ProjectEntry | null; m: Manifest | null; editable: boolean } {
  const { name } = useStudio.getState();
  const entry = name ? queryClient.getQueryData<ProjectEntry[]>(Q.keys.projects())?.find((p) => p.name === name) ?? null : null;
  const m = name ? queryClient.getQueryData<Manifest>(Q.keys.project(name)) ?? null : null;
  return { name, entry, m, editable: Boolean(m?.capabilities?.editable) };
}

const fresh = { staleTime: 0 } as const;

// ctx.reload(): the manifest and the log again. A failure already said so (queries.ts).
async function reload(): Promise<void> {
  const { name, entry } = current();
  if (!name || !entry?.has_manifest) return;
  await Promise.all([queryClient.fetchQuery({ ...Q.projectQuery(name), ...fresh }), queryClient.fetchQuery({ ...Q.logQuery(name), ...fresh })]).catch(() => {});
}

// Jobs and requests of the open project; SSE keeps them current afterwards.
async function refreshQueue(): Promise<void> {
  const { name, entry } = current();
  if (!name || !entry?.has_manifest) return;
  await Promise.all([queryClient.fetchQuery({ ...Q.jobsQuery(name), ...fresh }), queryClient.fetchQuery({ ...Q.requestsQuery(name), ...fresh })]).catch(() => { /* the panel shows what it has */ });
}

// Export gates (check-preflight --stage final) of the open project, for the gate chip.
async function refreshGates(): Promise<void> {
  const { name, m } = current();
  if (!name || !m) return;
  await queryClient.fetchQuery({ ...Q.gatesQuery(name), ...fresh }).catch(() => {});
}

async function answered(r: Q.WriteResult): Promise<AnswerOutcome> {
  const ok = r.status === 200;
  const message = ok ? null : answerFailure({ ...r, stderr: r.data?.stderr });
  say(message ?? "Đã gửi câu trả lời, đạo diễn làm tiếp", !ok);
  await refreshQueue();
  return { ok, message };
}

// Queries of one project that start empty when it is opened again (app.js open() reset them).
const projectScoped = (name: string) => [Q.keys.jobs(name), Q.keys.jobLogs(name), Q.keys.requests(name), Q.keys.gates(name)];

const playButtonRect = (): DOMRect | null => document.querySelector("[data-transport=\"toggle\"]")?.getBoundingClientRect() ?? null;
const timelineRect = (): DOMRect | null => document.querySelector("[data-slot=\"timeline\"]")?.getBoundingClientRect() ?? null;

export const actions = {
  transport: idleTransport as Transport,

  async patch(ops: unknown[]): Promise<boolean> {
    const { name, m, editable } = current();
    if (!name || !m || !editable) { say("Dự án chỉ xem, sửa qua đạo diễn", true); return false; }
    const r = await Q.patch({ name, base: m.version, ops });
    await reload();
    if (r.status === 200) return true;
    if (r.status === 409) say("Đã có thay đổi mới, đã tải lại");
    else say(r.error ?? `Lỗi ${r.status}`, true);
    return false;
  },

  async undo(): Promise<void> {
    const { name, m, editable } = current();
    if (!name || !m || !editable) return;
    const r = await Q.undo({ name, base: m.version });
    await reload();
    if (r.status === 200) say(`Đã hoàn tác (v${r.data?.version})`);
    else if (r.status === 409) say("Đã có thay đổi mới, đã tải lại");
    else if (r.status === 422) say("Không còn gì để hoàn tác");
    else say(r.error ?? `Lỗi ${r.status}`, true);
  },

  // Replays the last undo. The server answers 422 when there is nothing to redo, so the button
  // stays enabled on editable projects and that case is a toast.
  async redo(): Promise<void> {
    const { name, m, editable } = current();
    if (!name || !m || !editable) return;
    const r = await Q.redo({ name, base: m.version });
    await reload();
    if (r.status === 200) say(`Đã làm lại (v${r.data?.version})`);
    else if (r.status === 409) say("Đã có thay đổi mới, đã tải lại");
    else if (r.status === 422) say("Không còn gì để làm lại");
    else say(r.error ?? `Lỗi ${r.status}`, true);
  },

  // Split the selected shot at the playhead: one patch; the new shot has no scene yet.
  async split(): Promise<void> {
    const { m, editable } = current();
    if (!m) return;
    if (!editable) return say("Dự án chỉ xem, sửa qua đạo diễn", true);
    const sel = useStudio.getState().sel ?? "";
    const { ops, error, straddle = [], cut = 0 } = splitOps(m, sel, actions.transport.time());
    if (error) return say(error, true);
    if (!(await actions.patch(ops))) return;
    const shots = current().m?.shots ?? [];
    const next = shots[shots.findIndex((s) => s.id === sel) + 1];
    say(`Đã cắt shot. Shot mới trống, cần đạo diễn dựng cảnh${straddle.length ? ". Câu vắt qua điểm cắt vẫn thuộc shot trước" : ""}`);
    if (!next) return;
    const r = playButtonRect();
    openPointMenu(r?.left ?? 120, (r?.bottom ?? 120) + 6, [{
      label: "Nhờ đạo diễn dựng shot mới",
      run: () => { void actions.direct({ scope: "shot", target: next.id, t: Math.round(cut * 10) / 10, text: "Dựng cảnh cho shot mới vừa cắt ra, nối tiếp cảnh trước." }); },
    }]);
  },

  // "Thêm SFX tại đây…": pick a sound (project assets or shared-assets/sfx), then add_event at t
  // with an explicit id that no event, line or <audio> tag of the composition uses.
  async addSfx(t: number): Promise<void> {
    const { name, m, editable } = current();
    if (!name || !m || !editable) return;
    let list: SoundsList;
    try { list = await queryClient.fetchQuery({ ...Q.soundsQuery(name), ...fresh }); } catch (e) { return say(`Không đọc được danh sách âm thanh: ${(e as Error).message}`, true); }
    const project = list?.project ?? [], shared = list?.shared ?? [];
    if (!project.length && !shared.length) return say("Chưa có file âm thanh trong assets/ hay shared-assets/sfx", true);
    const add = async (sound: string) => {
      const cur = current();
      if (!cur.m || cur.name !== name) return;
      const id = nextSfxId([...(cur.m.events ?? []).map((e) => e.id), ...cur.m.lines.map((l) => l.id), ...actions.transport.audioIds()]);
      if (await actions.patch([{ op: "add_event", start: t, sound, id }])) {
        actions.pick("event", id);
        say(`Đã thêm ${id} lúc ${t.toFixed(2)}s`);
      }
    };
    const importShared = async (file: string) => {
      const r = await Q.soundsImport({ name, file });
      const path = r.data?.path;
      if (r.status !== 200 || !path) return say(r.error ?? `Lỗi ${r.status}`, true);
      await add(String(path));
    };
    const tl = timelineRect();
    openPointMenu((tl?.left ?? 0) + 120, (tl?.top ?? 0) + 20, [
      ...project.map((f) => ({ label: `Dự án · ${f.path}`, run: () => { void add(f.path); } })),
      ...shared.map((f) => ({ label: `Dùng chung · ${f.file}`, run: () => { void importShared(f.file); } })),
    ]);
  },

  // An SFX the director placed is removed by the director (the gateway only removes Studio SFX).
  directRemoveSfx(e: { id: string; shot: string; offset?: unknown }): Promise<boolean> {
    const s = current().m?.shots.find((x) => x.id === e.shot);
    return actions.direct({ scope: "shot", target: e.shot, t: Math.round(((s?.start ?? 0) + (Number(e.offset) || 0)) * 10) / 10, text: `Xoá SFX ${e.id}` });
  },

  // The Delete key (app.js runKey "delete"): only an SFX added in Studio is removed here.
  async deletePicked(): Promise<boolean | void> {
    const { m } = current();
    const p = useStudio.getState().pick;
    const ev: SfxEventFull | null = p?.kind === "event" ? m?.events?.find((x) => x.id === p.id) ?? null : null;
    if (!ev) return say("Delete chỉ xoá SFX; xoá shot hay câu nhờ đạo diễn");
    if (!ev.studio) return say("SFX này do đạo diễn đặt; bấm \"Nhờ đạo diễn xoá SFX này\" ở khung bên phải");
    return actions.patch([{ op: "remove_event", id: ev.id }]);
  },

  // A request to the director (scope project | shot | line). Read-only projects take them too.
  async direct(req: DirectorRequestBody): Promise<boolean> {
    const { name, m } = current();
    if (!name || !m) return false;
    if (!String(req.text ?? "").trim()) { say("Viết yêu cầu cho đạo diễn trước", true); return false; }
    const r = await Q.director({ name, ...req });
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return false; }
    say(r.data?.message ?? "Đã gửi cho đạo diễn");
    await refreshQueue();
    return true;
  },

  // The user's answer to a director card (choice id, "approve", { reject } or text). The card
  // shows message itself, so a failed answer is seen where it was given.
  async answer(id: string, value: unknown): Promise<AnswerOutcome> {
    const name = useStudio.getState().name ?? "";
    return answered(await Q.directorAnswer({ name, id, value }, { timeout: ANSWER_TIMEOUT_MS }));
  },

  // The answer to a question that expired: a new request carrying the old question and the answer.
  async reask(req: DirectorRequestBody): Promise<AnswerOutcome> {
    const name = useStudio.getState().name ?? "";
    return answered(await Q.director({ name, ...req }));
  },

  async cancelRequest(id: string): Promise<void> {
    const name = useStudio.getState().name ?? "";
    const r = await Q.directorCancel({ name, id });
    if (r.status !== 200) say(r.error ?? `Lỗi ${r.status}`, true);
    await refreshQueue();
  },

  async cancelJob(id: string): Promise<void> {
    const name = useStudio.getState().name ?? "";
    const r = await Q.jobsCancel({ name, id });
    if (r.status !== 200) say(r.error ?? `Lỗi ${r.status}`, true);
  },

  async exportVideo(): Promise<void> {
    const { name, m } = current();
    if (!name || !m) return;
    const r = await Q.exportJob({ name });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    say("Đang xuất video: render bản giao rồi nén");
    await refreshQueue();
  },

  // Bộ lớp dựng (bundle.mjs): shot MP4s, stems, SRT and manifest for an NLE, as an export job.
  async exportBundle(): Promise<void> {
    const { name, m } = current();
    if (!name || !m) return;
    const r = await Q.bundle({ name });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    say("Đang xuất bộ lớp dựng: render rồi cắt từng shot");
    await refreshQueue();
  },

  // Open a project ("" or an unknown name: none). Resets what belonged to the last one.
  async open(name: string): Promise<void> {
    const entry = queryClient.getQueryData<ProjectEntry[]>(Q.keys.projects())?.find((p) => p.name === name) ?? null;
    const prev = useStudio.getState().name;
    for (const n of new Set([prev, entry ? name : null])) if (n) for (const queryKey of projectScoped(n)) void queryClient.resetQueries({ queryKey });
    useStudio.setState({ name: entry ? name : null, pick: null, sel: null, audio: { mute: [], solo: [] }, retimed: false });
    try {
      const url = new URL(window.location.href);
      if (entry) url.searchParams.set("name", name); else url.searchParams.delete("name");
      window.history.replaceState(window.history.state, "", url);
    } catch { /* no history (tests) */ }
    if (!entry?.has_manifest || useStudio.getState().providerStatus?.ok === false) return;
    await reload();
    await refreshQueue();
  },

  async importProject(name: string): Promise<void> {
    const r = await Q.importManifest({ name });
    if (r.status !== 200) return say(r.error ?? `Lỗi ${r.status}`, true);
    say("Đã nhập dự án");
    await queryClient.fetchQuery({ ...Q.projectsQuery(), ...fresh }).catch(() => {});
    await actions.open(name);
  },

  // After "Dự án mới" (new-project.js onCreated): reload the list, open it, say so.
  async projectCreated(name: string, mode: string): Promise<void> {
    await queryClient.fetchQuery({ ...Q.projectsQuery(), ...fresh }).catch(() => {});
    await actions.open(name);
    say(`Đã tạo dự án ${name}`);
    if (mode === "video-co-san") useStudio.getState().setLeftTab("media");
  },

  refreshQueue,
  refreshGates,
  reload,

  // Show a block in the inspector; sel follows to the shot it belongs to (music keeps sel).
  pick(kind: PickKind, id: string): void {
    useStudio.getState().setPick(kind, id, current().m);
  },
  select(id: string): void { actions.pick("shot", id); },
  seek(t: number): void { actions.transport.seek(t); },

  // Runs the extension loader; an unexpected failure of the loader itself is one toast.
  async loadExtensions(run: () => Promise<unknown>): Promise<void> {
    try { await run(); } catch (e) { say(`Extension lỗi: ${(e as Error).message}`, true); }
  },
};

export type Actions = typeof actions;
