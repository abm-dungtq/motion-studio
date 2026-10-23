// broll-search.js — the footage search of the B-roll index (GET /api/broll/search) and the
// "Phân tích footage" box: before anything runs it shows the files, the files not analysed yet
// and the vision calls the captions will cost (GET /api/broll/plan). The offline analysis is free;
// the captions button is enabled only when that number is exact (no file left to analyse
// offline) and the run is capped at it. A running "broll" job is followed until it ends.
// A result drags as text/x-ms-media { rel: null, kind: "video", path, sha256, start, end }.
// Layout of the media grid learnt from OpenCut-app/OpenCut (https://github.com/OpenCut-app/OpenCut,
// MIT; ideas only).
import { MEDIA_DRAG } from "/panels.js";
import { fmt, toast } from "/dom.js";

const POLL_MS = 1500;
const DEBOUNCE_MS = 250;
const KINDS = ["", "toàn", "trung", "cận", "đặc tả", "flycam", "khác"];
const enc = encodeURIComponent;

export const span = (h) => `${fmt(h.start)}–${fmt(h.end)}`;
const fileOf = (p) => String(p ?? "").split("/").pop();

// A result card: thumbnail, time range, caption, file; draggable onto the timeline.
export function hitCard(h, x, extra = null) {
  const card = h("div", { class: "broll-hit", draggable: "true", title: `${x.path ?? ""}\nKéo vào timeline` },
    x.thumb ? h("img", { src: x.thumb, alt: x.caption_vi ?? fileOf(x.path), loading: "lazy" }) : h("div", { class: "broll-noimg" }, "không có ảnh"),
    h("div", { class: "broll-meta" },
      h("small", { class: "muted num" }, `${span(x)} · ${x.duration.toFixed(1)} s${x.shot_type ? ` · ${x.shot_type}` : ""}`),
      h("span", { class: "broll-cap" }, x.caption_vi ?? (x.describe_error ? "chú thích lỗi" : "chưa có chú thích")),
      x.tags?.length ? h("small", { class: "broll-tags" }, x.tags.join(" · ")) : null,
      h("small", { class: "muted broll-file" }, fileOf(x.path)),
      extra));
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify({ rel: null, kind: "video", path: x.path, sha256: x.sha256, start: x.start, end: x.end }));
    e.dataTransfer.setData("text/plain", x.path ?? "");
    e.dataTransfer.effectAllowed = "copy";
  });
  return card;
}

export function searchPanel(ctx, h) {
  const st = { q: "", kind: "", scope: "workspace", items: null, error: null, plan: null, job: null, timer: 0, poll: 0, seq: 0 };
  const input = h("input", { type: "search", placeholder: "Tìm footage: biển, kiếm, phố đêm… (có dấu hay không đều được)", "aria-label": "Tìm footage", maxlength: "200" });
  const kind = h("select", { "aria-label": "Cỡ cảnh" }, ...KINDS.map((k) => h("option", { value: k }, k || "mọi cỡ cảnh")));
  const grid = h("div", { class: "broll-grid", role: "list" });
  const planBox = h("div", { class: "broll-plan" });
  const scopeSel = h("select", { "aria-label": "Phạm vi phân tích" }, h("option", { value: "workspace" }, "Cả workspace"), h("option", { value: "project" }, "Dự án đang mở"));
  const offline = h("button", { type: "button", class: "btn" }, "Phân tích offline");
  const vision = h("button", { type: "button", class: "btn primary" }, "Chú thích bằng agent");
  const logBox = h("pre", { class: "text tail broll-log", hidden: true });
  const root = h("div", { class: "broll-panel" },
    h("div", { class: "row" }, input, kind),
    grid,
    h("details", { class: "broll-index", open: true }, h("summary", {}, "Phân tích footage"),
      h("div", { class: "row" }, scopeSel, h("span", { class: "spacer" }), offline, vision), planBox, logBox));

  async function doSearch() {
    const n = ++st.seq;
    try {
      const r = await ctx.api(`/api/broll/search?q=${enc(st.q)}&kind=${enc(st.kind)}&limit=40`);
      if (n !== st.seq) return;
      st.items = r.items; st.error = null;
    } catch (e) { if (n === st.seq) { st.items = null; st.error = e.message; } }
    paintGrid();
  }
  function paintGrid() {
    if (st.error) return grid.replaceChildren(h("p", { class: "form-error" }, st.error));
    if (!st.items) return grid.replaceChildren(h("p", { class: "muted" }, "Đang tìm…"));
    if (!st.items.length) return grid.replaceChildren(h("p", { class: "muted" }, st.q ? "Không có đoạn nào khớp." : "Chưa có footage nào được phân tích."));
    grid.replaceChildren(...st.items.map((x) => hitCard(h, x)));
  }
  input.addEventListener("input", () => { st.q = input.value; clearTimeout(st.timer); st.timer = setTimeout(doSearch, DEBOUNCE_MS); });
  kind.addEventListener("change", () => { st.kind = kind.value; doSearch(); });

  const scopeQuery = () => (st.scope === "project" && ctx.state.name ? `name=${enc(ctx.state.name)}&scope=project` : "scope=workspace");
  async function loadPlan() {
    try { st.plan = await ctx.api(`/api/broll/plan?${scopeQuery()}`); } catch (e) { st.plan = { error: e.message }; }
    paintPlan();
  }
  const running = () => st.job && (st.job.status === "running" || st.job.status === "cancelling");
  function paintPlan() {
    const p = st.plan;
    offline.disabled = vision.disabled = running() || !p || Boolean(p.error);
    if (!p) return planBox.replaceChildren(h("small", { class: "muted" }, "Đang đếm…"));
    if (p.error) return planBox.replaceChildren(h("p", { class: "form-error" }, p.error));
    const lines = [`${p.files} file video, ${p.clips} clip đã phân tích offline, ${p.new_files} file chưa phân tích.`];
    if (!p.settings.vision) { lines.push("Đọc ảnh đang tắt (studio.json broll.vision: false): chỉ tìm được theo tên file và lời nói."); vision.disabled = true; }
    else if (p.new_files) { lines.push(`Chạy "Phân tích offline" trước (không tốn lượt) để biết chính xác số lượt đọc ảnh.`); vision.disabled = true; }
    else if (!p.shots_pending) { lines.push("Mọi shot đã có chú thích: không cần lượt đọc ảnh nào."); vision.disabled = true; }
    else lines.push(`${p.shots_pending} shot chưa có chú thích → ${p.sheets} contact sheet → ${p.calls} lượt đọc ảnh (tối đa ${p.settings.max_calls_per_run} lượt mỗi lần chạy).`);
    vision.textContent = p.calls && !p.new_files ? `Chú thích bằng agent (${Math.min(p.calls, p.settings.max_calls_per_run)} lượt)` : "Chú thích bằng agent";
    planBox.replaceChildren(...lines.map((l) => h("small", { class: "muted" }, l)));
  }
  scopeSel.addEventListener("change", () => { st.scope = scopeSel.value; st.plan = null; paintPlan(); loadPlan(); });

  async function start(useVision) {
    const body = { scope: st.scope, vision: useVision, ...(st.scope === "project" || ctx.state.name ? { name: ctx.state.name ?? undefined } : {}) };
    if (useVision) body.max_calls = Math.min(st.plan.calls, st.plan.settings.max_calls_per_run);
    if (st.scope === "workspace" && !ctx.state.name) delete body.name;
    const r = await ctx.send("/api/broll/index", body);
    if (r.status !== 200) { toast(r.error ?? `Lỗi ${r.status}`, true); return; }
    st.job = r.job; paintJob(); follow();
  }
  offline.addEventListener("click", () => start(false));
  vision.addEventListener("click", () => start(true));

  function paintJob() {
    const j = st.job;
    logBox.hidden = !j;
    if (j) logBox.textContent = [`${j.status === "running" ? "Đang chạy" : j.status === "cancelling" ? "Đang huỷ" : j.code === 0 ? "Xong" : `Dừng (mã ${j.code ?? j.signal})`}`, ...(j.tail ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-6)].join("\n");
    paintPlan();
  }
  async function follow() {
    clearTimeout(st.poll);
    try { st.job = (await ctx.api("/api/broll/job")).job; } catch { /* keep the last state */ }
    paintJob();
    if (running()) st.poll = setTimeout(follow, POLL_MS);
    else { loadPlan(); doSearch(); }
  }

  let shown = false;
  return {
    node: root,
    // Called on every view: the first one loads; later ones keep the state and the focus.
    refresh() { if (!shown) { shown = true; doSearch(); loadPlan(); follow(); } },
  };
}
