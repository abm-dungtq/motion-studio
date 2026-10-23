// lemo-gallery.js — the "Phong cách code" tab: the lemo-opuscar library (59 code-made film styles,
// github.com/lemomo-ai/lemo-opuscar; frames and films CC BY 4.0 by LemoLab) plus the user's own
// styles, searched and filtered by group, and applied to the open project (routes/lemo.mjs).
// STYLE.md is third-party text: it is shown with textContent only, never as HTML.
import { h, toast } from "/dom.js";

const POLL_MS = 1500;
const FETCH_MAX_MS = 10 * 60000;
const DEBOUNCE_MS = 200;
const safeUrl = (u) => /^https:\/\//.test(String(u ?? ""));

// Shared state of the tab, the shot section and the own-style section.
export function createStore(ctx) {
  const listeners = new Set();
  const s = {
    data: null, allRows: null, error: null, q: "", group: "", fetching: false, busy: false,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    changed() { for (const fn of listeners) fn(); },
    // quiet: the search box's own reloads, which must not redraw the panel (and drop its focus).
    async load({ quiet = false } = {}) {
      const qs = new URLSearchParams({ q: s.q, group: s.group });
      if (ctx.state.name) qs.set("name", ctx.state.name);
      try {
        s.data = await ctx.api(`/api/lemo/styles?${qs}`); s.error = null;
        if (!s.q && !s.group) s.allRows = s.data.rows;
      } catch (e) { s.error = e; }
      if (!quiet) s.changed();
      return s.data;
    },
    async fetchLibrary() {
      if (s.fetching) return;
      s.fetching = true; s.changed();
      const r = await ctx.send("/api/lemo/fetch", {});
      if (r.status !== 200) { s.fetching = false; toast(r.error ?? `Lỗi ${r.status}`, true); s.changed(); return; }
      const t0 = Date.now();
      while (Date.now() - t0 < FETCH_MAX_MS) {
        const d = await s.load();
        if (d?.fetched) break;
        const j = d?.fetch_job;
        if (j && j.status !== "running" && j.status !== "cancelling") { toast(`Tải thư viện lỗi: ${(j.tail ?? []).slice(-1)[0] ?? `exit ${j.code}`}`, true); break; }
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
      s.fetching = false; s.changed();
    },
  };
  ctx.on("project", () => { s.load(); });
  return s;
}

// POST /api/lemo/apply, with the follow-ups the answer asks for: replace an existing layer, or
// ask the director to insert the markers first.
export async function applyStyle(ctx, store, { style, mode, shot = null }) {
  const name = ctx.state.name;
  if (!name || !ctx.state.m) { toast("Mở một dự án trước", true); return; }
  const where = shot ? `shot ${shot}` : "cả dự án";
  const how = mode === "layer" ? "thêm lớp canvas (sửa index.html, ghi lemo_style vào BRIEF.md)" : "nhờ đạo diễn dựng theo ngữ pháp của STYLE.md (BRIEF.md giữ nguyên)";
  if (!confirm(`Áp "${style.ten}" cho ${where}: ${how}?`)) return;
  const body = { name, slug: style.slug, source: style.source, mode, shot };
  store.busy = true; store.changed();
  try {
    let r = await ctx.send("/api/lemo/apply", body);
    if (r.code === "exists" && confirm("Dự án đã có một lớp canvas. Thay lớp cũ bằng phong cách này? (scene đã viết được giữ)")) r = await ctx.send("/api/lemo/apply", { ...body, replace: true });
    else if (r.code === "markers") {
      if (confirm("index.html thiếu bốn dấu của lớp canvas. Nhờ đạo diễn chèn dấu? Xong thì bấm áp lại.")) {
        const m = await ctx.send("/api/lemo/apply", { ...body, mode: "markers" });
        toast(m.status === 200 ? "Đã gửi yêu cầu chèn dấu cho đạo diễn" : (m.error ?? `Lỗi ${m.status}`), m.status !== 200);
      }
      return;
    }
    if (r.status === 200) toast(`Đã áp "${style.ten}" cho ${where}; đã gửi yêu cầu cho đạo diễn${r.runner === "mcp" ? " (chờ phiên Claude Code nhận việc)" : ""}`);
    else if (r.code !== "exists") toast(r.error ?? `Lỗi ${r.status}`, true);
  } finally { store.busy = false; await store.load(); }
}

// STYLE.md as plain text in a modal dialog.
export async function showGuide(ctx, style) {
  let text;
  try { text = (await ctx.api(`/api/lemo/guide?${new URLSearchParams({ slug: style.slug, source: style.source })}`)).text; } catch (e) { toast(`Không đọc được STYLE.md: ${e.message}`, true); return; }
  const pre = h("pre", { class: "lemo-guide" });
  pre.textContent = text;
  const dlg = h("dialog", { class: "lemo-dialog", "aria-label": `STYLE.md của ${style.ten}` },
    h("div", { class: "row lemo-dialog-head" }, h("strong", {}, `STYLE.md · ${style.ten}`), h("button", { class: "btn", onclick: () => dlg.close() }, "Đóng")),
    style.source === "library" ? h("p", { class: "muted" }, "Văn bản của bên thứ ba (MIT). Chỉ học ngữ pháp hình ảnh, không chép câu chuyện phim mẫu.") : null,
    pre);
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// Short warnings a card shows before its apply button.
function cautions(style, project) {
  const out = [];
  if (style.layer && project?.vertical) out.push("Lớp canvas chỉ vẽ cho khung 16:9; bản dọc cần scene riêng.");
  if (style.kind === "3d") out.push("Phong cách 3D: render chậm khoảng 5 lần.");
  return out;
}

export function styleCard(ctx, store, style) {
  const project = store.data?.project;
  const mode = style.layer ? "layer" : "grammar";
  const tag = style.source === "mine" ? "Của bạn" : style.layer ? "Lớp canvas" : "Theo ngữ pháp";
  const current = project?.project?.slug === style.slug;
  return h("div", { class: `card lemo-card${current ? " current" : ""}`, "data-slug": style.slug },
    style.frame ? h("img", { class: "lemo-frame", src: style.frame, alt: "", loading: "lazy", width: 800, height: 450 }) : h("div", { class: "lemo-frame lemo-noframe" }, style.en || style.slug),
    h("div", { class: "row lemo-title" }, h("strong", {}, style.ten), h("span", { class: `badge${style.layer ? " pass" : ""}`, title: style.layer ? "Studio thêm được thành lớp canvas" : "Đạo diễn dựng bằng composition HyperFrames theo STYLE.md" }, tag)),
    h("span", { class: "muted" }, [style.en, style.cn, style.nhom, style.based_on && `dựa trên ${style.base_ten ?? style.based_on}`].filter(Boolean).join(" · ")),
    style.line ? h("p", { class: "lemo-line" }, style.line) : null,
    style.uses?.length ? h("p", { class: "muted lemo-uses" }, `Hợp với: ${style.uses.join(", ")}`) : null,
    ...cautions(style, project).map((t) => h("p", { class: "note" }, t)),
    current ? h("p", { class: "muted" }, `Đang dùng cho dự án (${project.project.mode === "layer" ? "lớp canvas" : "theo ngữ pháp"})`) : null,
    h("div", { class: "row lemo-actions" },
      h("button", { class: "btn primary", disabled: !ctx.state.m || store.busy, title: ctx.state.m ? "" : "Mở một dự án có project.json trước", onclick: () => applyStyle(ctx, store, { style, mode }) }, "Áp cho dự án"),
      style.guide ? h("button", { class: "btn", onclick: () => showGuide(ctx, style) }, "Đọc STYLE.md") : null,
      safeUrl(style.film_url) ? h("a", { class: "ext", href: style.film_url, target: "_blank", rel: "noopener noreferrer" }, "Xem phim mẫu ↗") : null));
}

const credit = (c) => h("p", { class: "muted lemo-credit" }, `${c?.text ?? "Ảnh và phim mẫu: LemoLab, CC BY 4.0"}, `,
  safeUrl(c?.url) ? h("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.url.replace(/^https:\/\//, "")) : "github.com/lemomo-ai/lemo-opuscar",
  `. Mã và tài liệu: ${c?.code_license ?? "MIT"}.`);

export function galleryView(ctx, store, helpers) {
  const { loading, fail } = helpers;
  if (!store.data && !store.error) { store.load(); return loading(); }
  if (store.error && !store.data) return [fail(store.error), h("button", { class: "btn", onclick: () => { store.error = null; store.load(); } }, "Thử lại")];
  const d = store.data;
  if (!d.fetched) {
    return [
      h("div", { class: "empty" },
        h("p", {}, "Thư viện 59 phong cách phim dựng bằng code chưa có trên máy. Tải một lần (khoảng 5 MB: ảnh khung, STYLE.md, DEMO.md; không tải mã chạy được)."),
        h("button", { class: "btn primary", disabled: store.fetching, onclick: () => store.fetchLibrary() }, store.fetching ? "Đang tải…" : "Tải thư viện (≈ 5 MB)")),
      d.rows.length ? h("div", { class: "stack" }, h("h3", {}, "Của bạn"), ...d.rows.map((r) => styleCard(ctx, store, r))) : null,
      credit(d.credit),
    ];
  }
  const grid = h("div", { class: "lemo-grid", "aria-live": "polite" });
  const count = h("p", { class: "muted" });
  const fill = () => {
    const rows = store.data.rows;
    count.textContent = `${rows.length} / ${store.data.total} phong cách${store.data.layer_available ? "" : " · chưa có lệnh lớp canvas, mọi phong cách áp theo ngữ pháp"}`;
    const mine = rows.filter((r) => r.source === "mine"), lib = rows.filter((r) => r.source !== "mine");
    grid.replaceChildren(
      ...(mine.length ? [h("h3", { class: "lemo-head" }, "Của bạn"), ...mine.map((r) => styleCard(ctx, store, r))] : []),
      ...(mine.length && lib.length ? [h("h3", { class: "lemo-head" }, "Thư viện")] : []),
      ...lib.map((r) => styleCard(ctx, store, r)),
      rows.length ? null : h("p", { class: "empty" }, `Không có phong cách nào khớp "${store.q}". Thử từ khoá ngắn hơn hoặc bỏ dấu.`));
  };
  let timer = 0;
  const input = h("input", { type: "search", value: store.q, placeholder: "Tìm: thuỷ màu, ukiyo, tin tức…", "aria-label": "Tìm phong cách code",
    oninput: (e) => { clearTimeout(timer); timer = setTimeout(async () => { store.q = e.target.value; await store.load({ quiet: true }); fill(); }, DEBOUNCE_MS); } });
  const group = h("select", { "aria-label": "Nhóm phong cách", onchange: async (e) => { store.group = e.target.value; await store.load({ quiet: true }); fill(); } },
    h("option", { value: "", selected: !store.group }, `Mọi nhóm (${d.groups.length})`),
    ...d.groups.map((g) => h("option", { value: g.id, selected: g.id === store.group }, `${g.ten} (${g.count})`)));
  fill();
  return [
    h("div", { class: "row lemo-filters" }, input, group),
    count,
    d.warnings?.length ? h("details", { class: "lib-more" }, h("summary", {}, `${d.warnings.length} cảnh báo khi đọc thư viện`), h("ul", {}, ...d.warnings.map((w) => h("li", {}, w)))) : null,
    grid,
    credit(d.credit),
  ];
}

// The shot inspector: the project's style, this shot's, and a compact picker to apply one.
export function shotSection(ctx, store, pick) {
  const shot = pick.id ?? ctx.state.sel;
  const box = h("div", { class: "group lemo-shot" }, h("h3", {}, "Phong cách code"));
  if (!shot) return null;
  const draw = () => {
    const d = store.data;
    if (!d) { box.append(h("p", { class: "muted" }, "Đang tải…")); return; }
    const p = d.project ?? {};
    const name = (slug) => (store.allRows ?? d.rows).find((r) => r.slug === slug)?.ten ?? slug;
    const lines = [
      p.project ? `Dự án: ${name(p.project.slug)} (${p.project.mode === "layer" ? "lớp canvas" : "theo ngữ pháp"})` : "Dự án chưa áp phong cách code nào.",
      p.shots?.[shot] ? `Shot ${shot}: ${name(p.shots[shot].slug)} (${p.shots[shot].mode === "layer" ? "lớp canvas" : "theo ngữ pháp"})` : null,
    ].filter(Boolean);
    const rows = store.allRows ?? d.rows;
    const sel = h("select", { "aria-label": "Phong cách cho shot này" }, ...rows.map((r) => h("option", { value: `${r.source}:${r.slug}` }, `${r.source === "mine" ? "★ " : ""}${r.ten}${r.layer ? " · lớp canvas" : ""}`)));
    const open = h("details", { class: "lib-more" }, h("summary", {}, "Áp phong cách cho shot này"),
      rows.length ? h("div", { class: "stack" }, sel,
        h("button", { class: "btn primary", disabled: !ctx.state.m || store.busy, onclick: () => {
          const [source, slug] = sel.value.split(":");
          const style = rows.find((r) => r.slug === slug && r.source === source);
          if (style) applyStyle(ctx, store, { style, mode: style.layer ? "layer" : "grammar", shot });
        } }, "Áp")) : h("p", { class: "muted" }, "Chưa có phong cách nào: mở tab Phong cách code và tải thư viện."));
    box.replaceChildren(box.firstChild, ...lines.map((t) => h("p", { class: "muted" }, t)), open);
  };
  // Redraw on every store change while this inspector section is on the page.
  const off = store.on(() => (box.isConnected ? draw() : off()));
  if (!store.data) store.load(); else draw();
  return box;
}
