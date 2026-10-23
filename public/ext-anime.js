// public/ext-anime.js — the "Anime" tab: character library (anime-chars.js), shot board with
// "Sinh biến thể tư thế" (anime-board.js) and the limited-animation manifest editor
// (anime-manifest.js), over routes/anime.mjs. It needs a project folder, not project.json, so a
// project made outside Studio (zoro-vs-mihawk) opens here before it is imported.
// The tab keeps one root node per project and redraws only its own content: a panel redraw never
// drops what is being typed in a form.
import { charsView } from "/anime-chars.js";
import { boardView } from "/anime-board.js";
import { manifestView } from "/anime-manifest.js";

const SUBS = [["board", "Shot board"], ["chars", "Nhân vật"], ["anim", "Hoạt hình"]];
const POLL_MS = 1200;
const JOB_MAX_MS = 10 * 60000;

export function register(studio) {
  const { ctx, h, toast } = studio;
  studio.icon("anime", [["rect", { x: 3, y: 4, width: 18, height: 14, rx: 2 }], ["path", { d: "M8 4v14M16 4v14M3 11h5M16 11h5" }], ["circle", { cx: 12, cy: 11, r: 2 }]]);

  const root = h("div", { class: "anime" });
  // State shared by the three views; A.paint() redraws the open one.
  const A = {
    ctx, h, toast, sub: "board", name: null,
    data: { board: null, chars: null, manifest: null }, errors: {}, jobs: {},
    async api(path) { return ctx.api(path); },
    async send(path, body) { return ctx.send(path, { name: A.name, ...body }); },
    q: (path) => `${path}${path.includes("?") ? "&" : "?"}name=${encodeURIComponent(A.name)}`,
    src: (rel) => `/p/${encodeURIComponent(A.name)}/${rel.split("/").map(encodeURIComponent).join("/")}`,
    paint,
    load,
    // Polls one anime job until it ends; onLine sees new log lines, onEnd the job with its whole log.
    follow(slot, job, { onEnd } = {}) {
      const name = A.name, t0 = Date.now();
      A.jobs[slot] = { job, log: [] };
      paint();
      const tick = async () => {
        if (A.name !== name) return;
        let r;
        try { r = await ctx.api(`/api/anime/job?name=${encodeURIComponent(name)}&id=${encodeURIComponent(job.id)}`); } catch (e) { A.jobs[slot] = { job, log: [`không đọc được job: ${e.message}`] }; return paint(); }
        A.jobs[slot] = r;
        paint();
        if (r.job.status === "running" || r.job.status === "cancelling") {
          if (Date.now() - t0 < JOB_MAX_MS) setTimeout(tick, POLL_MS);
          return;
        }
        onEnd?.(r);
      };
      setTimeout(tick, POLL_MS);
    },
  };

  async function load(what = ["board", "chars", "manifest"]) {
    const name = A.name;
    if (!name) return;
    await Promise.all(what.map(async (k) => {
      try { A.data[k] = await ctx.api(A.q(`/api/anime/${k}`)); A.errors[k] = null; } catch (e) { A.errors[k] = e.message; }
    }));
    if (A.name === name) paint();
  }

  function paint() {
    if (!A.name) return root.replaceChildren(h("div", { class: "empty" }, h("p", {}, "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng.")));
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Mục của tab Anime" },
      ...SUBS.map(([id, label]) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(A.sub === id), onclick: () => { A.sub = id; paint(); } }, label)));
    const view = { board: boardView, chars: charsView, anim: manifestView }[A.sub];
    let body;
    try { body = view(A); } catch (e) { console.error("anime", e); body = h("p", { class: "empty" }, `Lỗi giao diện: ${e.message}`); }
    root.replaceChildren(seg, ...[body].flat().filter(Boolean));
  }

  // A new project resets everything; the same one keeps its drafts.
  function sync() {
    const name = ctx.state.name ?? null;
    if (name === A.name) return;
    Object.assign(A, { name, data: { board: null, chars: null, manifest: null }, errors: {}, jobs: {}, draft: null, pick: null });
    paint();
    if (name) load();
  }
  ctx.on("project", sync);

  studio.addTab({
    id: "anime", label: "Anime", lead: "Motion comic: nhân vật, shot board, biến thể tư thế và hoạt hình lật ảnh", icon: "anime",
    view: () => { sync(); return root; },
  });
}
