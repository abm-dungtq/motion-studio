// app.js — Motion Studio shell: project choice, manifest state, the SSE feed and the edit calls
// shared by the player, timeline, inspector and panels. Edits go to /api/patch with the shown
// version as base; a 409 reloads the manifest and says so. ctx.state.pick is the block shown in the
// inspector ({ kind: shot | line | music | event, id }); ctx.state.sel stays the shot it belongs to.
// ctx.state.audio is the player's mute/solo rule per audio group; ctx.state.gates the last
// GET /api/gates answer, which drives the top bar's gate chip and the Xuất bản tab's FAIL lines.
// Once everything is mounted, ext.js loads the UI extensions with the studio object below.
import { h, toast } from "/dom.js";
import { mountPlayer } from "/player.js";
import { mountTimeline } from "/timeline.js";
import { mountInspector } from "/inspector.js";
import { mountPanels } from "/panels.js";
import { mountNewProject } from "/new-project.js";
import { mountAgent } from "/agent.js";
import { ANSWER_TIMEOUT_MS, answerFailure } from "/gate-cards.js";
import { keyAction, nextSfxId, splitOps } from "/timeline-edit.js";
import { openMenu } from "/context-menu.js";
import { icon } from "/icons.js";
import { loadExtensions } from "/ext.js";

const $ = (id) => document.getElementById(id);
const TOKEN = document.querySelector('meta[name="studio-token"]').content;
const listeners = {};
let events = null;

const ctx = {
  state: { projects: [], name: null, entry: null, m: null, sel: null, pick: null, log: [], t: 0, jobs: [], logs: new Map(), requests: [], timing: null, audio: { mute: new Set(), solo: new Set() }, gates: null },
  on(ev, fn) { (listeners[ev] ??= []).push(fn); },
  emit(ev, ...a) { for (const fn of listeners[ev] ?? []) fn(...a); },
  get editable() { return Boolean(ctx.state.m?.capabilities?.editable); },
  async api(path) {
    const r = await fetch(path);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(j?.error ?? r.statusText), { status: r.status });
    return j;
  },
  // timeout (ms): no answer by then is { status: 0, timeout: true }.
  async send(path, body, { timeout = 0 } = {}) {
    let r;
    try { r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-studio-token": TOKEN }, body: JSON.stringify(body), signal: timeout ? AbortSignal.timeout(timeout) : undefined }); } catch (e) {
      if (e.name === "TimeoutError") return { status: 0, timeout: true, error: "Studio không trả lời kịp" };
      return { status: 0, network: true, error: `không kết nối được Studio (${e.message})` };
    }
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  },
  async patch(ops) {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) { toast("Dự án chỉ xem, sửa qua đạo diễn", true); return false; }
    const r = await ctx.send("/api/patch", { name, base: m.version, ops });
    await reload();
    if (r.status === 200) return true;
    if (r.status === 409) toast("Đã có thay đổi mới, đã tải lại");
    else toast(r.error ?? `Lỗi ${r.status}`, true);
    return false;
  },
  async undo() {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) return;
    const r = await ctx.send("/api/undo", { name, base: m.version });
    await reload();
    if (r.status === 200) toast(`Đã hoàn tác (v${r.version})`);
    else if (r.status === 409) toast("Đã có thay đổi mới, đã tải lại");
    else if (r.status === 422) toast("Không còn gì để hoàn tác");
    else toast(r.error ?? `Lỗi ${r.status}`, true);
  },
  // Replays the last undo. The server answers 422 when there is nothing to redo, so the button
  // stays enabled on editable projects and that case is a toast.
  async redo() {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) return;
    const r = await ctx.send("/api/redo", { name, base: m.version });
    await reload();
    if (r.status === 200) toast(`Đã làm lại (v${r.version})`);
    else if (r.status === 409) toast("Đã có thay đổi mới, đã tải lại");
    else if (r.status === 422) toast("Không còn gì để làm lại");
    else toast(r.error ?? `Lỗi ${r.status}`, true);
  },
  // Split the selected shot at the playhead: one patch; the new shot has no scene yet.
  async split() {
    const m = ctx.state.m;
    if (!m) return;
    if (!ctx.editable) return toast("Dự án chỉ xem, sửa qua đạo diễn", true);
    const sel = ctx.state.sel;
    const { ops, error, straddle, cut } = splitOps(m, sel, ctx.transport.time());
    if (error) return toast(error, true);
    if (!(await ctx.patch(ops))) return;
    const shots = ctx.state.m?.shots ?? [];
    const fresh = shots[shots.findIndex((s) => s.id === sel) + 1];
    toast(`Đã cắt shot. Shot mới trống, cần đạo diễn dựng cảnh${straddle.length ? ". Câu vắt qua điểm cắt vẫn thuộc shot trước" : ""}`);
    if (!fresh) return;
    const r = $("play-btn").getBoundingClientRect();
    openMenu(r.left, r.bottom + 6, [{
      label: "Nhờ đạo diễn dựng shot mới",
      run: () => ctx.direct({ scope: "shot", target: fresh.id, t: Math.round(cut * 10) / 10, text: "Dựng cảnh cho shot mới vừa cắt ra, nối tiếp cảnh trước." }),
    }]);
  },
  // "Thêm SFX tại đây…": pick a sound (project assets or shared-assets/sfx), then add_event at t
  // with an explicit id that no event, line or <audio> tag of the composition uses.
  async addSfx(t) {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) return;
    let list;
    try { list = await ctx.api(`/api/sounds?name=${encodeURIComponent(name)}`); } catch (e) { return toast(`Không đọc được danh sách âm thanh: ${e.message}`, true); }
    const project = list?.project ?? [], shared = list?.shared ?? [];
    if (!project.length && !shared.length) return toast("Chưa có file âm thanh trong assets/ hay shared-assets/sfx", true);
    const add = async (sound) => {
      const cur = ctx.state.m;
      if (!cur || ctx.state.name !== name) return;
      const doc = $("player").querySelector("iframe")?.contentDocument;
      const tags = doc ? [...doc.querySelectorAll("audio[id]")].map((a) => a.id) : [];
      const id = nextSfxId([...(cur.events ?? []).map((e) => e.id), ...cur.lines.map((l) => l.id), ...tags]);
      if (await ctx.patch([{ op: "add_event", start: t, sound, id }])) {
        ctx.pick("event", id);
        toast(`Đã thêm ${id} lúc ${t.toFixed(2)}s`);
      }
    };
    const importShared = async (file) => {
      const r = await ctx.send("/api/sounds/import", { name, file });
      if (r.status !== 200 || !r.path) return toast(r.error ?? `Lỗi ${r.status}`, true);
      await add(r.path);
    };
    const tl = $("timeline").getBoundingClientRect();
    openMenu(tl.left + 120, tl.top + 20, [
      ...project.map((f) => ({ label: `Dự án · ${f.path}`, run: () => add(f.path) })),
      ...shared.map((f) => ({ label: `Dùng chung · ${f.file}`, run: () => importShared(f.file) })),
    ]);
  },
  // An SFX the director placed is removed by the director (the gateway only removes Studio SFX).
  directRemoveSfx(e) {
    const m = ctx.state.m;
    const s = m?.shots.find((x) => x.id === e.shot);
    return ctx.direct({ scope: "shot", target: e.shot, t: Math.round(((s?.start ?? 0) + (Number(e.offset) || 0)) * 10) / 10, text: `Xoá SFX ${e.id}` });
  },
  // A request to the director (scope project | shot | line). Read-only projects take them too.
  async direct(req) {
    const { name } = ctx.state;
    if (!name || !ctx.state.m) return false;
    if (!String(req.text ?? "").trim()) { toast("Viết yêu cầu cho đạo diễn trước", true); return false; }
    const r = await ctx.send("/api/director", { name, ...req });
    if (r.status !== 200) { toast(r.error ?? `Lỗi ${r.status}`, true); return false; }
    toast(r.message ?? "Đã gửi cho đạo diễn");
    await refreshQueue();
    return true;
  },
  // The user's answer to a director card (choice id, "approve", { reject } or text). Returns
  // { ok, message }: the card shows message itself, so a failed answer is seen where it was given.
  async answer(id, value) {
    return answered(await ctx.send("/api/director/answer", { name: ctx.state.name, id, value }, { timeout: ANSWER_TIMEOUT_MS }));
  },
  // The answer to a question that expired: a new request carrying the old question and the answer.
  async reask(req) {
    return answered(await ctx.send("/api/director", { name: ctx.state.name, ...req }));
  },
  async cancelRequest(id) {
    const r = await ctx.send("/api/director/cancel", { name: ctx.state.name, id });
    if (r.status !== 200) toast(r.error ?? `Lỗi ${r.status}`, true);
    await refreshQueue();
  },
  async cancelJob(id) {
    const r = await ctx.send("/api/jobs/cancel", { name: ctx.state.name, id });
    if (r.status !== 200) toast(r.error ?? `Lỗi ${r.status}`, true);
  },
  async exportVideo() {
    const { name } = ctx.state;
    if (!name || !ctx.state.m) return;
    const r = await ctx.send("/api/export", { name });
    if (r.status !== 200) return toast(r.error ?? `Lỗi ${r.status}`, true);
    toast("Đang xuất video: render bản giao rồi nén");
    await refreshQueue();
  },
  // Bộ lớp dựng (bundle.mjs): shot MP4s, stems, SRT and manifest for an NLE, as an export job.
  async exportBundle() {
    const { name } = ctx.state;
    if (!name || !ctx.state.m) return;
    const r = await ctx.send("/api/bundle", { name });
    if (r.status !== 200) return toast(r.error ?? `Lỗi ${r.status}`, true);
    toast("Đang xuất bộ lớp dựng: render rồi cắt từng shot");
    await refreshQueue();
  },
  // Show a block in the inspector; sel follows to the shot it belongs to (music keeps sel).
  pick(kind, id) {
    const m = ctx.state.m;
    ctx.state.pick = { kind, id };
    if (kind === "shot") ctx.state.sel = id;
    else if (kind === "line") ctx.state.sel = m?.lines.find((l) => l.id === id)?.shot ?? ctx.state.sel;
    else if (kind === "event") ctx.state.sel = m?.events?.find((e) => e.id === id)?.shot ?? ctx.state.sel;
    ctx.emit("select", id);
  },
  select(id) { ctx.pick("shot", id); },
  seek(t) { player.seek(t); },
  toast,
};

const player = mountPlayer(ctx, $("player"), { playBtn: $("play-btn"), timeEl: $("time") });
ctx.transport = player;
const timeline = mountTimeline(ctx, $("timeline"), { zoomIn: $("zoom-in"), zoomOut: $("zoom-out"), zoomFit: $("zoom-fit"), snapBtn: $("snap-btn") });
const inspector = mountInspector(ctx, $("inspector"));
const panels = mountPanels(ctx, document.querySelector(".rail"), $("panel"));
ctx.openTab = (id) => panels.select(id, true);
const agent = mountAgent(ctx, $("agent-chip"));
mountNewProject(ctx, $("new-btn"), {
  async onCreated(name, mode) {
    await loadProjects();
    await open(name);
    toast(`Đã tạo dự án ${name}`);
    if (mode === "video-co-san") panels.select("media");
  },
});

function setManifest(m) {
  ctx.state.m = m;
  if (m && !m.shots.some((s) => s.id === ctx.state.sel)) ctx.state.sel = m.shots[0]?.id ?? null;
  const p = ctx.state.pick;
  const lists = { shot: m?.shots, line: m?.lines, music: m?.music, event: m?.events };
  if (!p || !(lists[p.kind] ?? []).some((x) => x.id === p.id)) ctx.state.pick = ctx.state.sel ? { kind: "shot", id: ctx.state.sel } : null;
  const banner = $("banner");
  if (m && !m.capabilities?.editable) { banner.replaceChildren("Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn"); banner.hidden = false; }
  else if (m) banner.hidden = true;
  $("project-title").textContent = m?.title ?? "";
  $("undo-btn").disabled = !ctx.editable;
  $("redo-btn").disabled = !ctx.editable;
  ctx.emit("manifest", m);
  renderVersions();
}

async function reload() {
  const { name } = ctx.state;
  if (!name || !ctx.state.entry?.has_manifest) return;
  try {
    const [m, log] = await Promise.all([ctx.api(`/api/project?name=${encodeURIComponent(name)}`), ctx.api(`/api/log?name=${encodeURIComponent(name)}`)]);
    if (name !== ctx.state.name) return;
    ctx.state.log = log;
    setManifest(m);
  } catch (e) { toast(`Không tải được dự án: ${e.message}`, true); }
}

function renderVersions() {
  const { m, log } = ctx.state;
  const sel = $("version-select");
  if (!m) { sel.replaceChildren(); sel.disabled = true; return; }
  const vs = log.length ? [...log].reverse() : [{ v: m.version }];
  sel.replaceChildren(...vs.map((e) => h("option", { value: String(e.v), selected: e.v === m.version }, `v${e.v} · ${e.v === m.version ? "hiện tại" : (e.actor ?? "")}`)));
  sel.disabled = false;
}
$("version-select").addEventListener("change", (e) => {
  toast("Danh sách chỉ để xem; quay lại bản trước bằng Hoàn tác");
  e.target.value = String(ctx.state.m?.version ?? "");
});

// Jobs and requests of the open project; SSE keeps them current afterwards.
async function refreshQueue() {
  const { name } = ctx.state;
  if (!name || !ctx.state.entry?.has_manifest) return;
  try {
    const [jobs, requests] = await Promise.all([ctx.api(`/api/jobs?name=${encodeURIComponent(name)}`), ctx.api(`/api/requests?name=${encodeURIComponent(name)}`)]);
    if (name !== ctx.state.name) return;
    for (const j of jobs) if (!ctx.state.logs.has(j.id)) ctx.state.logs.set(j.id, [...(j.tail ?? [])]);
    ctx.state.jobs = jobs;
    setRequests(requests);
    ctx.emit("jobs", null);
  } catch { /* the panel shows what it has */ }
}

async function answered(r) {
  const ok = r.status === 200;
  const message = ok ? null : answerFailure(r);
  toast(message ?? "Đã gửi câu trả lời, đạo diễn làm tiếp", !ok);
  await refreshQueue();
  return { ok, message };
}

function setRequests(list) {
  const before = new Map(ctx.state.requests.map((r) => [r.id, r.status]));
  ctx.state.requests = list;
  for (const r of list) {
    const was = before.get(r.id);
    if (was && was !== r.status && r.status === "done") toast(`Đạo diễn xong: ${String(r.receipt ?? "").slice(0, 160)}`);
    if (was && was !== r.status && r.status === "failed") toast(`Yêu cầu không xong: ${String(r.error ?? "").split("\n")[0].slice(0, 160)}`, true);
  }
  ctx.emit("requests", list);
}

function onJob(e) {
  const jobs = ctx.state.jobs.filter((j) => j.id !== e.job.id);
  ctx.state.jobs = [...jobs, e.job].sort((a, b) => a.started.localeCompare(b.started));
  if (!ctx.state.logs.has(e.job.id)) ctx.state.logs.set(e.job.id, []);
  if (e.type === "log") ctx.state.logs.get(e.job.id).push(e.line);
  if (e.type === "exit" && e.job.kind === "export") {
    if (e.job.code === 5) toast(e.job.meta?.message ?? "Thiếu cổng", true);
    else if (e.job.code === 0 && e.job.meta?.step === "compress") toast(`Đã xuất ${e.job.meta.output}`);
    else if (e.job.code === 0 && e.job.meta?.step === "bundle") toast(`Đã xuất bộ lớp dựng ${e.job.meta.output}`);
    else if (e.job.code !== 0 && e.job.status !== "cancelled") toast(`${e.job.meta?.step === "bundle" ? "Xuất bộ lớp dựng" : "Xuất video"} lỗi (exit ${e.job.code})`, true);
  }
  ctx.emit("jobs", e);
}

function subscribe(name) {
  events?.close();
  events = new EventSource(`/api/events?name=${encodeURIComponent(name)}`);
  events.addEventListener("manifest", (e) => {
    const m = JSON.parse(e.data);
    if (name === ctx.state.name && m.version !== ctx.state.m?.version) reload();
  });
  events.addEventListener("request", (e) => { if (name === ctx.state.name) setRequests(JSON.parse(e.data)); });
  events.addEventListener("job", (e) => { if (name === ctx.state.name) onJob(JSON.parse(e.data)); });
}

async function importProject(name) {
  const r = await ctx.send("/api/import", { name });
  if (r.status !== 200) return toast(r.error ?? `Lỗi ${r.status}`, true);
  toast("Đã nhập dự án");
  await loadProjects();
  open(name);
}

async function open(name) {
  events?.close(); events = null;
  const entry = ctx.state.projects.find((p) => p.name === name) ?? null;
  Object.assign(ctx.state, { name: entry ? name : null, entry, m: null, sel: null, pick: null, log: [], jobs: [], logs: new Map(), requests: [], audio: { mute: new Set(), solo: new Set() }, gates: null });
  clearTimeout(gateTimer);
  showGates();
  const url = new URL(location.href);
  if (entry) url.searchParams.set("name", name); else url.searchParams.delete("name");
  history.replaceState(null, "", url);
  $("project-select").value = entry ? name : "";
  const banner = $("banner");
  banner.hidden = true;
  setManifest(null);
  const ps = ctx.state.providerStatus;
  if (ps && !ps.ok) {
    banner.replaceChildren(h("strong", {}, ps.error ?? "Chưa có provider."), " Chạy ", h("code", {}, ps.setup ?? "npm run setup"), " trong thư mục Motion Studio, rồi tải lại trang.");
    banner.hidden = false;
    player.clear("Chưa có provider: xem hướng dẫn phía trên");
    ctx.emit("project", entry);
    return;
  }
  if (entry && !entry.has_manifest) {
    banner.replaceChildren("Dự án chưa có project.json. ", h("button", { class: "btn", onclick: () => importProject(name) }, "Nhập dự án"));
    banner.hidden = false;
    player.clear("Nhập dự án để xem");
  }
  ctx.emit("project", entry);
  if (entry?.has_manifest) { await reload(); clearTimeout(gateTimer); subscribe(name); refreshGates(); await refreshQueue(); }
}

// Export gates (check-preflight --stage final) of the open project. The chip says what blocks the
// export: a stale or missing animatic approval first, any other FAIL otherwise; hidden on PASS.
let gateTimer = 0, gateSeq = 0;
async function refreshGates() {
  const { name } = ctx.state;
  if (!name || !ctx.state.m) return;
  const seq = ++gateSeq;
  try {
    const g = await ctx.api(`/api/gates?name=${encodeURIComponent(name)}`);
    if (seq !== gateSeq || name !== ctx.state.name) return;
    ctx.state.gates = { pass: g?.pass === true, fails: Array.isArray(g?.fails) ? g.fails.map(String) : [], animatic: g?.animatic === true };
  } catch (e) {
    if (seq !== gateSeq || name !== ctx.state.name) return;
    ctx.state.gates = null;
    console.warn("gates:", e.message);
  }
  showGates();
}
function showGates() {
  const chip = $("gate-chip"), g = ctx.state.gates;
  if (!g || g.pass) { chip.hidden = true; chip.removeAttribute("data-to"); }
  else {
    chip.textContent = g.animatic ? "Cần duyệt lại animatic" : "Chưa đủ cổng xuất";
    chip.title = g.fails.join("\n");
    chip.dataset.to = g.animatic ? "ai" : "output";
    chip.hidden = false;
  }
  ctx.emit("gates", g);
}
$("gate-chip").addEventListener("click", (e) => { const to = e.currentTarget.dataset.to; if (to) ctx.openTab(to); });
ctx.on("manifest", (m) => {
  if (!m) return;
  clearTimeout(gateTimer);
  gateTimer = setTimeout(refreshGates, 1500);
});

async function loadProjects() {
  ctx.state.projects = await ctx.api("/api/projects");
  $("project-select").replaceChildren(h("option", { value: "" }, "— chọn dự án —"),
    ...ctx.state.projects.map((p) => h("option", { value: p.name }, `${p.name}${p.has_manifest ? (p.editable ? "" : " (chỉ xem)") : " (chưa nhập)"}`)));
}

$("project-select").addEventListener("change", (e) => open(e.target.value));
$("undo-btn").addEventListener("click", () => ctx.undo());
$("redo-btn").addEventListener("click", () => ctx.redo());
$("export-btn").addEventListener("click", () => ctx.exportVideo());
ctx.on("time", (t) => (ctx.state.t = t));
// One handler for every timeline shortcut (timeline-edit.js keyAction). Nothing fires while the
// caret is in a field, a dialog is open, or focus is on the tab rail (its arrows move between tabs).
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || e.target.closest?.('[role="tablist"]')) return;
  const inField = e.target.closest?.("input, textarea, select, [contenteditable]");
  const a = keyAction(e, { inField: Boolean(inField) });
  if (!a) return;
  e.preventDefault();
  runKey(a);
});

function runKey(a) {
  const m = ctx.state.m;
  const tr = ctx.transport;
  const fps = m?.fps || 30;
  switch (a) {
    case "toggle": return tr.toggle();
    case "play": return tr.play();
    case "pause": return tr.pause();
    case "back1": return tr.step(-1);
    case "fwd1": return tr.step(1);
    case "prevFrame": return tr.step(-1 / fps);
    case "nextFrame": return tr.step(1 / fps);
    case "start": return tr.seek(0);
    case "end": return tr.seek(tr.duration());
    case "split": return ctx.split();
    case "delete": {
      const p = ctx.state.pick;
      const ev = p?.kind === "event" ? m?.events?.find((x) => x.id === p.id) : null;
      if (!ev) return toast("Delete chỉ xoá SFX; xoá shot hay câu nhờ đạo diễn");
      if (!ev.studio) return toast("SFX này do đạo diễn đặt; bấm \"Nhờ đạo diễn xoá SFX này\" ở khung bên phải");
      return ctx.patch([{ op: "remove_event", id: ev.id }]);
    }
    case "undo": return ctx.undo();
    case "redo": return ctx.redo();
    case "zoomIn": return timeline.zoomBy(1.25);
    case "zoomOut": return timeline.zoomBy(1 / 1.25);
    case "fit": return timeline.fit();
    case "snap": return timeline.toggleSnap?.();
  }
}

// What an extension's register(studio) gets (docs/extensions.md).
const studio = {
  ctx,
  h,
  toast,
  addTab: (t) => panels.addTab(t),
  addSection: (tabId, s) => panels.addSection(tabId, s),
  addInspectorSection: (s) => inspector.addSection(s),
  addAgentRows: (fn, opts) => agent.addRows(fn, opts),
  addTimelineDecorator: (fn) => timeline.addDecorator(fn),
  icon,
};
// Extensions load beside the project, not before it; a tab they add that ?tab= or localStorage
// named is selected once they are in.
loadExtensions(studio).then(() => panels.restore()).catch((e) => toast(`Extension lỗi: ${e.message}`, true));

ctx.state.providerStatus = await ctx.api("/api/status").catch(() => null);
await loadProjects().catch((e) => toast(`Không tải được danh sách dự án: ${e.message}`, true));
open(new URL(location.href).searchParams.get("name") ?? "");
