// panels.js — the left rail and its six panels, in the order a video gets made: give the AI work,
// footage, lines and voice, music, the reference library, export. Timeline edits go through
// ctx.patch; anything for the director (a task, "Dùng cho dự án", a changed line) through
// ctx.direct. The open panel is kept in localStorage ("studio.tab") and in the URL (?tab=).
// Keys: Alt+1…Alt+6 pick a panel; arrow keys, Home and End move along the rail (ARIA tabs).
import { h, thumb, fmtS, isMedia, toast } from "/dom.js";
import { icon } from "/icons.js";
import { answerFailure, cardCache, cardKey, liveDirectorJob, pressGate } from "/gate-cards.js";

const TABS = [
  { id: "ai", label: "Giao việc cho AI", lead: "Viết việc cần làm. Đạo diễn AI làm trên máy bạn và hỏi lại khi cần bạn chọn hoặc duyệt." },
  { id: "media", label: "Footage & chất liệu", lead: "Thêm video quay sẵn, B-roll, ảnh. File nằm ngoài workspace sẽ được chép vào footage/raw." },
  { id: "voice", label: "Lời & giọng", lead: "Sửa lời từng câu. Câu đã sửa cần qua cổng viet-pro và lồng tiếng lại." },
  { id: "music", label: "Nhạc & âm thanh", lead: "Nhạc nền và hiệu ứng âm thanh gắn theo shot." },
  { id: "library", label: "Thư viện mẫu", lead: "Video, cảnh, phong cách và prompt mẫu làm bằng Claude Opus 5.5, có giải thích tiếng Việt, để AI làm theo." },
  { id: "output", label: "Xuất bản", lead: "Xuất MP4 bản giao (render rồi nén), bộ lớp dựng cho phần mềm dựng, và tải file đã xuất." },
];
const IDS = TABS.map((t) => t.id);
const STORE = "studio.tab";

const KIND = { director: "Đạo diễn", export: "Xuất video" };
const STEP = { bundle: "bộ lớp dựng" };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? u : null);
// Shortens text at a word boundary so a card never ends mid-word.
const clip = (t, n) => { const s = String(t ?? "").trim(); if (s.length <= n) return s; const cut = s.slice(0, n); return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n * 0.6)).trimEnd()}…`; };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const KIND_VI = { video: "Video", audio: "Âm thanh", image: "Ảnh" };
// 75.4 → "1:15".
const mss = (s) => { const t = Math.round(Number(s) || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); };
const fileUrl = (name, path) => `/p/${encodeURIComponent(name)}/${path.split("/").map(encodeURIComponent).join("/")}`;

// The four library sections share one search box and page through GET /api/library. use(row) is
// the request text sent to the director; copy(row) what "Chép" puts on the clipboard.
const LIB_EXCERPT = 1500;
const promptExcerpt = (p) => (p ? `\nPrompt gốc (trích):\n${clip(p, LIB_EXCERPT)}` : "");
const LIBRARY = {
  videos: {
    label: "Video mẫu", placeholder: "Từ khoá: logo, biểu đồ, ra mắt, 3D…",
    title: (v) => v.title_vi ?? v.titles?.en ?? v.titles?.zh ?? v.id,
    copy: (v) => v.prompt,
    use: (v) => `Lấy cảm hứng từ video mẫu "${LIBRARY.videos.title(v)}" (@${v.author ?? "?"}, ${v.url ?? ""}) cho dự án này. ${v.vi ? `Học theo: ${v.vi.why} ${v.vi.how}` : ""} Giữ nội dung, lời và nhịp của dự án.${promptExcerpt(v.prompt)}`,
  },
  scenes: {
    label: "Cảnh mẫu", placeholder: "Từ khoá: chữ động, HUD, biến hình…",
    title: (t) => t.name ?? t.id,
    copy: (t) => t.prompt_hint,
    use: (t) => t.source !== "library"
      ? `Dùng mẫu cảnh ${t.id} (${t.name}) cho dự án này: dựng lại các shot theo hướng cảnh đó, giữ nội dung và lời của dự án.`
      : `Áp kỹ thuật cảnh "${t.name}" vào những shot hợp của dự án này: ${t.what} Gợi ý cho prompt: ${t.prompt_hint ?? ""}. Giữ nội dung, lời và nhịp.`,
  },
  styles: {
    label: "Phong cách", placeholder: "Ví dụ: tối giản, neon, pixel, 3D…",
    title: (s) => s.name ?? s.id,
    copy: (s) => s.recipe ?? s.what,
    use: (s) => s.source !== "library"
      ? `Áp phong cách ${s.id} (${s.name}) cho dự án này: đổi màu, chữ và chuyển động theo phong cách đó, giữ nội dung, lời và nhịp.`
      : `Áp phong cách "${s.name}" cho dự án này: đổi màu, chữ và chuyển động theo công thức sau, giữ nội dung, lời và nhịp.\n${s.recipe}`,
  },
  prompts: {
    label: "Prompt mẫu", placeholder: "Từ khoá: mẫu điền, ra mắt, beat…",
    title: (p) => p.title ?? p.id,
    copy: (p) => p.prompt,
    use: (p) => `Viết lại yêu cầu cho dự án này theo cấu trúc của prompt mẫu "${p.title}": ${p.structure} Giữ nội dung, lời và nhịp của dự án.${promptExcerpt(p.prompt)}`,
  },
};
const nfmt = (n) => (Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(Number(n) >= 10000 ? 0 : 1)}k` : String(n));

function readTab() {
  const fromUrl = new URL(location.href).searchParams.get("tab");
  if (IDS.includes(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem(STORE); if (IDS.includes(saved)) return saved; } catch { /* storage blocked */ }
  return "ai";
}

export function mountPanels(ctx, railEl, panelEl) {
  let tab = readTab();
  // Panel state that survives a redraw: drafts, the browse folder, reopened and rejecting cards.
  const memo = { brief: "", libMode: "videos", libQuery: "", libCat: "", libFeatured: false, libCats: [], browse: null, drafts: {}, reopen: new Set(), rejecting: new Set() };
  const logEls = new Map(); // job id → <pre> of the open Xuất bản panel
  let liveLog = null; // { id, pre } of the running director job in the open Giao việc panel
  const cards = cardCache(); // live director cards, kept across redraws (see gate-cards.js)
  const press = pressGate(); // redraws wait while a mouse or Space press is on the panel

  // Rail buttons with icon, label and a count badge; roving tabindex as in the ARIA tabs pattern.
  const buttons = new Map(TABS.map((t, i) => {
    const count = h("span", { class: "rail-count", hidden: true });
    const b = h("button", { type: "button", role: "tab", id: `tab-${t.id}`, class: "rail-item", "data-tab": t.id, "aria-controls": "panel", title: `${t.label} (Alt+${i + 1})` },
      h("span", { class: "rail-icon" }, icon(t.id), count), h("span", { class: "rail-label" }, t.label));
    railEl.append(b);
    return [t.id, { b, count, label: t.label }];
  }));

  const loading = () => h("p", { class: "muted" }, "Đang tải…");
  const fail = (e) => h("p", { class: "empty" }, `Không tải được: ${e.message}. Thử bấm lại mục này trên thanh trái.`);
  // Every empty state says what to do next, with a button when the next step is in the Studio.
  const empty = (text, action, to) => h("div", { class: "empty" }, h("p", {}, text), action ? h("button", { class: "btn", onclick: () => select(to, true) }, action) : null);
  const needManifest = () => {
    if (ctx.state.m) return null;
    if (!ctx.state.name) return h("div", { class: "empty" }, h("p", {}, "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu."),
      h("button", { class: "btn", onclick: () => document.getElementById("project-select")?.focus() }, "Chọn dự án"));
    return h("div", { class: "empty" }, h("p", {}, "Dự án chưa có project.json. Bấm \"Nhập dự án\" trên dải vàng phía trên để mở nó trong Studio."));
  };

  const views = {
    ai() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      // Threads: a follow-up request (follows: id) joins the thread of the request it answers.
      const threads = [], threadOf = new Map();
      for (const r of ctx.state.requests) {
        const t = r.follows ? threadOf.get(r.follows) : null;
        if (t) t.push(r); else threads.push([r]);
        threadOf.set(r.id, t ?? threads[threads.length - 1]);
      }
      const chat = h("div", { class: "chat", "aria-live": "polite" },
        ...(threads.length ? threads.slice(-12).flatMap((t) => t.flatMap((r, i) => turn(name, r, i > 0)))
          : [h("p", { class: "empty" }, "Chưa giao việc nào. Viết việc đầu tiên ở ô dưới rồi bấm Giao việc.")]));
      const story = h("pre", { class: "text" }, "…");
      fetch(fileUrl(name, "STORYBOARD.md")).then((r) => (r.ok ? r.text() : "Chưa có STORYBOARD.md")).then((t) => (story.textContent = t)).catch(() => (story.textContent = "Chưa có STORYBOARD.md"));
      return [h("details", {}, h("summary", {}, "Storyboard"), story), chat, working(), composer()];
    },
    media() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const reg = h("div", { class: "stack" }, loading());
      const loadReg = () => ctx.api(`/api/media?name=${encodeURIComponent(name)}`).then((list) => {
        if (name !== ctx.state.name) return;
        reg.replaceChildren(...(list.length ? list.map(mediaRow) : [h("p", { class: "empty" }, "Chưa có footage. Chọn file bên dưới.")]));
      }).catch((e) => reg.replaceChildren(fail(e)));
      loadReg();

      const pathIn = h("input", { type: "text", value: memo.browse ?? "", "aria-label": "Thư mục đang xem", spellcheck: "false", placeholder: "/Users/…/Movies" });
      const up = h("button", { class: "btn", type: "button", disabled: true }, "Lên");
      const list = h("div", { class: "browser", "aria-label": "Thư mục và file media" }, loading());
      let parent = null;
      const add = async (e, btn) => {
        btn.disabled = true;
        btn.textContent = "Đang thêm…";
        const r = await ctx.send("/api/media/register", { name, src: e.path }).catch((x) => ({ status: 0, error: x.message }));
        if (r.status !== 200) { btn.disabled = false; btn.textContent = "Thêm"; return ctx.toast(r.error ?? `Lỗi ${r.status}`, true); }
        btn.textContent = "Đã thêm";
        ctx.toast(r.existing ? `${e.name} đã có trong danh sách` : `Đã thêm ${e.name}${r.copied ? ", đã chép vào footage/raw" : ""}`);
        loadReg();
      };
      const entry = (e) => {
        if (e.type === "dir") return h("button", { type: "button", class: "entry dir", title: e.path, onclick: () => go(e.path) }, h("span", { class: "entry-name" }, e.name), h("span", { class: "muted", "aria-hidden": "true" }, "›"));
        const btn = h("button", { type: "button", class: "btn", "aria-label": `Thêm ${e.name}` }, "Thêm");
        btn.addEventListener("click", () => add(e, btn));
        return h("div", { class: "entry file" }, h("span", { class: "entry-name", title: e.path }, e.name), h("small", { class: "muted num" }, `${KIND_VI[e.kind] ?? e.kind} · ${mb(e.size)}`), btn);
      };
      const go = async (path, first = false) => {
        list.replaceChildren(loading());
        try {
          let d = await ctx.api(`/api/media/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`);
          // First visit: ~/Movies when it exists, else the home folder the server reports.
          const movies = first ? d.entries.find((x) => x.type === "dir" && x.name === "Movies") : null;
          if (movies) d = await ctx.api(`/api/media/browse?path=${encodeURIComponent(movies.path)}`);
          memo.browse = d.path;
          pathIn.value = d.path;
          requestAnimationFrame(() => (pathIn.scrollLeft = pathIn.scrollWidth)); // show the deepest folder
          parent = d.parent;
          up.disabled = !parent;
          list.replaceChildren(...(d.entries.length ? d.entries.map(entry) : [h("p", { class: "empty" }, "Thư mục này không có thư mục con hay file media. Bấm Lên hoặc gõ đường dẫn khác.")]));
        } catch (e) {
          list.replaceChildren(h("p", { class: "empty" }, `Không mở được: ${e.message}. Gõ đường dẫn khác hoặc bấm Lên.`));
        }
      };
      up.addEventListener("click", () => parent && go(parent));
      pathIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(pathIn.value.trim()); } });
      go(memo.browse, !memo.browse);

      const assets = h("div", { class: "thumbs" }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=assets`).then((fs) => {
        const shown = fs.filter((f) => !/\.json$/i.test(f.path));
        if (shown.length) assets.replaceChildren(...shown.map((f) => thumb(name, f.path)));
        else assets.replaceWith(empty("Chưa có file nào trong assets/. Giao việc cho AI tìm footage hoặc tạo hình cho dự án.", "Giao việc cho AI", "ai"));
      }).catch((e) => assets.replaceWith(fail(e)));
      return [
        h("section", { class: "group" }, h("h3", {}, "Footage đã thêm"), reg),
        h("section", { class: "group" }, h("h3", {}, "Chọn file trên máy"), h("div", { class: "search" }, pathIn, up), list),
        h("section", { class: "group" }, h("h3", {}, "File trong assets/"), assets),
      ];
    },
    voice() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      if (!m.lines.length) return [empty("Chưa có câu thoại. Giao việc cho AI viết kịch bản.", "Giao việc cho AI", "ai")];
      return m.lines.map((l, i) => {
        const text = h("textarea", { value: l.text, disabled: !ctx.editable, "aria-label": `Câu ${i + 1}` });
        const save = async () => {
          if (text.value === l.text) return ctx.toast("Không có gì thay đổi");
          if (await ctx.patch([{ op: "set_line_text", id: l.id, text: text.value }])) ctx.toast("Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại");
        };
        return h("div", { class: "card", "data-id": l.id },
          h("div", { class: "row" }, h("strong", {}, `${i + 1}. ${l.id}`), h("span", { class: `badge ${l.gate ?? "unknown"}` }, l.gate ?? "unknown")),
          text,
          l.gate === "stale" ? h("p", { class: "muted" }, "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại") : null,
          h("div", { class: "row" },
            h("button", { class: "btn", disabled: !ctx.editable, onclick: save }, "Lưu lời"),
            l.gate === "stale" ? h("button", { class: "btn", onclick: () => ctx.direct({ scope: "line", target: l.id, text: `Câu ${l.id} đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.` }) }, "Nhờ duyệt và lồng tiếng lại") : null));
      });
    },
    music() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      const tracks = m.music.map((mu) => {
        const pct = h("span", { class: "num" }, `${Math.round(mu.gain * 100)}%`);
        const slider = h("input", { type: "range", min: "0", max: "100", step: "1", value: String(Math.round(mu.gain * 100)), disabled: !ctx.editable, "aria-label": `Âm lượng ${mu.file}` });
        slider.addEventListener("input", () => (pct.textContent = `${slider.value}%`));
        slider.addEventListener("change", () => ctx.patch([{ op: "set_music", id: mu.id, field: "gain", value: Number(slider.value) / 100 }]));
        return h("div", { class: "card" }, h("strong", {}, mu.file.split("/").pop()), h("div", { class: "row" }, slider, pct));
      });
      const events = (m.events ?? []).map((ev) => h("div", { class: "card" },
        h("div", { class: "row" }, h("strong", {}, ev.label || ev.id), h("span", { class: "muted num" }, `${ev.shot} + ${fmtS(ev.offset)}`)),
        ev.sound ? h("span", { class: "muted" }, ev.sound.split("/").pop()) : null));
      return [
        h("section", { class: "group" }, h("h3", {}, "Nhạc nền"), ...(tracks.length ? tracks : [empty("Chưa có nhạc nền. Giao việc cho AI chọn nhạc hợp nội dung.", "Giao việc cho AI", "ai")])),
        h("section", { class: "group" }, h("h3", {}, "Hiệu ứng âm thanh"), ...(events.length ? events : [h("p", { class: "empty" }, "Chưa có hiệu ứng âm thanh nào gắn theo shot. Giao việc cho AI nếu cần tiếng nhấn.")])),
      ];
    },
    library() {
      const mode = memo.libMode, src = LIBRARY[mode];
      const input = h("input", { type: "search", value: memo.libQuery, "aria-label": "Tìm trong thư viện mẫu", placeholder: src.placeholder });
      const out = h("div", { class: "stack", "aria-live": "polite" });
      const seg = h("div", { class: "seg seg-4", role: "group", "aria-label": "Loại mẫu" }, ...Object.entries(LIBRARY).map(([k, x]) =>
        h("button", { type: "button", class: "seg-btn", "aria-pressed": String(k === mode), onclick: () => { memo.libMode = k; memo.libQuery = ""; render(); } }, x.label)));
      const copy = (text) => navigator.clipboard.writeText(String(text ?? "")).then(() => toast("Đã chép vào bộ nhớ tạm"), () => toast("Trình duyệt không cho chép", true));
      const thumbImg = (id, cls = "lib-thumb") => h("img", { class: cls, src: `/library/thumb/${encodeURIComponent(id)}`, alt: "", loading: "lazy" });
      const more = (label, text) => (text ? h("details", { class: "lib-more" }, h("summary", {}, label), h("pre", { class: "lib-prompt" }, text)) : null);
      const para = (label, text) => (text ? h("p", { class: "lib-p" }, label ? h("b", {}, `${label} `) : null, text) : null);
      const exampleRow = (xs) => (xs?.length ? h("div", { class: "lib-examples" }, ...xs.slice(0, 4).map((x) =>
        h("button", { type: "button", class: "lib-example", title: x.title, onclick: () => { memo.libMode = "videos"; memo.libQuery = x.id; memo.libCat = ""; memo.libFeatured = false; render(); } },
          x.has_thumb ? thumbImg(x.id, "") : h("span", { class: "lib-noimg" }), h("span", {}, clip(x.title, 40))))) : null);
      const actions = (row, url) => h("div", { class: "row" },
        h("button", { class: "btn", disabled: !ctx.state.m, title: ctx.state.m ? "Gửi cho đạo diễn của dự án đang mở" : "Mở một dự án trước", onclick: () => ctx.direct({ scope: "project", text: src.use(row) }) }, "Dùng cho dự án"),
        src.copy(row) ? h("button", { class: "btn", onclick: () => copy(src.copy(row)) }, mode === "styles" ? "Chép công thức" : mode === "scenes" ? "Chép gợi ý" : "Chép prompt") : null,
        safeUrl(url) ? h("a", { class: "ext", href: url, target: "_blank", rel: "noopener noreferrer", title: url }, "Xem bản gốc") : null);
      const CARD = {
        videos: (v) => h("div", { class: "card lib-card" },
          v.has_thumb ? thumbImg(v.id) : null,
          h("strong", {}, src.title(v)),
          h("span", { class: "muted" }, [v.author && `@${v.author}`, memo.libCats.find((c) => c.id === v.category)?.vi, v.featured && "Tuyển chọn", v.metrics?.bookmarks && `${nfmt(v.metrics.bookmarks)} lượt lưu`].filter(Boolean).join(" · ")),
          v.vi ? [para("", v.vi.what), para("Đáng học:", v.vi.why), para("Cách dùng:", v.vi.how)] : para("", clip(v.titles?.en ?? v.desc ?? v.summary_zh, 200)),
          more(v.prompt_partial ? "Xem prompt (bản gốc chỉ công bố một phần)" : "Xem prompt", v.prompt),
          v.prompt_en && v.prompt_en !== v.prompt ? more("Bản dịch tiếng Anh của prompt", v.prompt_en) : null,
          ...(v.links ?? []).filter((l) => safeUrl(l.url)).map((l) => h("a", { class: "ext", href: l.url, target: "_blank", rel: "noopener noreferrer" }, `${l.label} ↗`)),
          actions(v, v.url)),
        scenes: (t) => h("div", { class: "card lib-card" },
          h("strong", {}, src.title(t)),
          t.source_label ? h("span", { class: "muted" }, t.source_label) : null,
          para("", t.what), para("Dùng khi:", t.when),
          t.prompt_hint ? h("p", { class: "lib-p" }, h("b", {}, "Gợi ý cho prompt: "), h("code", {}, t.prompt_hint)) : null,
          t.seams?.length ? para("Chuyển cảnh:", t.seams.join(", ")) : null,
          exampleRow(t.examples), actions(t)),
        styles: (s) => h("div", { class: "card lib-card" },
          s.examples?.[0]?.has_thumb ? thumbImg(s.examples[0].id) : null,
          h("strong", {}, src.title(s)),
          h("span", { class: "muted" }, [s.name_en, s.source_label].filter(Boolean).join(" · ")),
          para("", s.what), para("Hợp với:", s.when),
          more("Công thức (tiếng Việt)", s.recipe_vi), more("Công thức gốc để dán vào prompt", s.recipe),
          exampleRow(s.examples), actions(s)),
        prompts: (p) => h("div", { class: "card lib-card" },
          p.has_thumb ? thumbImg(p.id) : null,
          h("strong", {}, src.title(p)),
          h("span", { class: "muted" }, [p.kind_vi, p.author && `@${p.author}`, p.metrics?.bookmarks && `${nfmt(p.metrics.bookmarks)} lượt lưu`].filter(Boolean).join(" · ")),
          para("", p.what), para("Cấu trúc:", p.structure), para("Chuyển thể:", p.adapt),
          more(p.template ? "Xem khung prompt" : "Xem prompt", p.prompt),
          actions(p, p.url)),
      };
      const toolkitCard = (k) => (k ? h("div", { class: "card lib-card" },
        h("strong", {}, "Bộ công cụ đạo diễn"),
        h("span", { class: "muted" }, k.source ?? ""),
        k.workflow?.length ? h("details", { class: "lib-more" }, h("summary", {}, "Quy trình làm video"), h("ol", { class: "lib-list" }, ...k.workflow.map((w) => h("li", {}, h("b", {}, `${w.title}. `), w.text)))) : null,
        k.vocabulary?.length ? h("details", { class: "lib-more" }, h("summary", {}, "Cách góp ý như đạo diễn"), h("ul", { class: "lib-list" }, ...k.vocabulary.map((w) => h("li", {}, h("b", {}, `${w.term}: `), `${w.when} Nói: `, h("code", {}, w.say), w.say_vi ? ` (${w.say_vi})` : "")))) : null,
        k.checklist?.length ? h("details", { class: "lib-more" }, h("summary", {}, "Kiểm tra trước khi render"), h("ul", { class: "lib-list" }, ...k.checklist.map((c) => h("li", {}, c)))) : null) : null);
      const footer = (sources) => h("p", { class: "muted lib-sources" }, "Nguồn: ", ...(sources ?? []).flatMap((x, i) => [i ? ", " : "", h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer" }, x.repo), ` (${x.license.split(" ")[0]})`]), ". Prompt và video thuộc về tác giả gốc.");
      let offset = 0;
      const page = async (append) => {
        const qs = new URLSearchParams({ kind: mode, q: memo.libQuery, offset: String(offset) });
        if (mode === "videos" && memo.libCat) qs.set("cat", memo.libCat);
        if (mode === "videos" && memo.libFeatured) qs.set("featured", "1");
        const r = await ctx.api(`/api/library?${qs}`);
        if (r.categories) { const had = memo.libCats.length; memo.libCats = r.categories; if (!had && mode === "videos") fillCats(); }
        const cards = r.items.map((row) => CARD[mode](row));
        offset = r.offset + r.items.length;
        const tail = offset < r.total ? h("button", { class: "btn", onclick: (e) => { e.currentTarget.replaceWith(loading()); page(true).catch((err) => out.append(fail(err))); } }, `Xem thêm (còn ${r.total - offset})`) : footer(r.sources);
        if (append) { out.querySelector(":scope > p.muted:last-child")?.remove(); out.append(...cards, tail); return; }
        if (!r.items.length) return out.replaceChildren(h("p", { class: "empty" }, `Không thấy ${src.label.toLowerCase()} nào khớp "${memo.libQuery}". Thử từ khoá ngắn hơn, bỏ dấu, hoặc đổi loại mẫu.`), footer(r.sources));
        out.replaceChildren(h("p", { class: "muted" }, `${r.total} mẫu`), ...(r.toolkit && !memo.libQuery ? [toolkitCard(r.toolkit)] : []), ...cards, tail);
      };
      const go = () => {
        memo.libQuery = input.value.trim();
        offset = 0;
        out.replaceChildren(loading());
        page(false).catch((e) => out.replaceChildren(fail(e)));
      };
      const cat = h("select", { "aria-label": "Thể loại", onchange: (e) => { memo.libCat = e.target.value; go(); } });
      const fillCats = () => cat.replaceChildren(h("option", { value: "" }, "Mọi thể loại"), ...memo.libCats.map((c) => h("option", { value: c.id, selected: c.id === memo.libCat }, c.vi)));
      fillCats();
      const filters = mode === "videos" ? h("div", { class: "row lib-filters" }, cat,
        h("label", { class: "lib-check" }, h("input", { type: "checkbox", checked: memo.libFeatured, onchange: (e) => { memo.libFeatured = e.target.checked; go(); } }), "Chỉ mẫu tuyển chọn")) : null;
      const hint = ctx.state.m ? null : h("p", { class: "muted" }, "Chưa mở dự án: vẫn xem và chép prompt được. Mở một dự án để gửi mẫu cho đạo diễn.");
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      go();
      return [seg, h("div", { class: "search" }, input, h("button", { class: "btn", onclick: go }, "Tìm")), filters, hint, out];
    },
    output() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const renders = h("div", { class: "stack" }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=renders`).then((fs) => {
        // A bundle folder is one row (its manifest), not one row per shot MP4.
        const bundles = new Map();
        for (const f of fs) {
          const m = /^renders\/([^/]+-bundle)\//.exec(f.path);
          if (m) { const x = bundles.get(m[1]) ?? { size: 0, manifest: null }; x.size += f.size; if (f.path.endsWith("/manifest.json")) x.manifest = f.path; bundles.set(m[1], x); }
        }
        const mp4 = fs.filter((f) => /\.mp4$/i.test(f.path) && !/^renders\/[^/]+-bundle\//.test(f.path)).reverse();
        const rows = [
          ...[...bundles].filter(([, x]) => x.manifest).reverse().map(([dir, x]) => h("div", { class: "card file-row" }, h("a", { href: fileUrl(name, x.manifest), target: "_blank", rel: "noopener", title: "manifest.json của bộ lớp dựng" }, `${dir}/`), h("span", { class: "muted num" }, mb(x.size)))),
          ...mp4.map((f) => h("div", { class: "card file-row" }, h("a", { href: fileUrl(name, f.path), target: "_blank", rel: "noopener" }, f.path.replace(/^renders\//, "")), h("span", { class: "muted num" }, mb(f.size)))),
        ];
        renders.replaceChildren(...(rows.length ? rows
          : [h("p", { class: "empty" }, "Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong.")]));
      }).catch((e) => renders.replaceChildren(fail(e)));
      logEls.clear();
      const jobs = [...ctx.state.jobs].reverse().slice(0, 4).map((j) => {
        const pre = h("pre", { class: "text" }, (ctx.state.logs.get(j.id) ?? []).join("\n"));
        logEls.set(j.id, pre);
        const live = j.status === "running" || j.status === "cancelling";
        return h("div", { class: "card" },
          h("div", { class: "row" }, h("strong", {}, `${KIND[j.kind] ?? j.kind}${j.meta?.step ? ` · ${STEP[j.meta.step] ?? j.meta.step}` : ""}`), h("span", { class: "muted" }, live ? "đang chạy" : j.status === "cancelled" ? "đã huỷ" : `exit ${j.code ?? j.signal}`)),
          j.meta?.message ? h("span", {}, j.meta.message) : null,
          h("details", { open: live }, h("summary", {}, "Log"), pre),
          live ? h("div", { class: "row" }, h("button", { class: "btn", onclick: () => ctx.cancelJob(j.id) }, "Dừng")) : null);
      });
      const g = ctx.state.gates;
      const gates = g && !g.pass && g.fails.length
        ? h("section", { class: "group gate-fails" }, h("h3", {}, g.animatic ? "Cần duyệt lại animatic" : "Chưa đủ cổng xuất"),
          h("ul", {}, ...g.fails.map((f) => h("li", {}, f))))
        : null;
      return [
        gates,
        h("section", { class: "group" }, h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => ctx.exportVideo() }, "Xuất video"),
          h("button", { class: "btn", title: "MP4 từng shot, tiếng tách lớp (giọng, nhạc, SFX), phụ đề SRT và manifest.json, để dựng tiếp trong Concat, CapCut hay DaVinci", onclick: () => ctx.exportBundle() }, "Xuất bộ lớp dựng"))),
        h("section", { class: "group" }, h("h3", {}, "Việc đang chạy"), ...(jobs.length ? jobs : [h("p", { class: "empty" }, "Không có việc nào đang chạy. Bấm Xuất video để render bản giao.")])),
        h("section", { class: "group" }, h("h3", {}, "File đã xuất"), renders),
      ];
    },
  };

  // One request as chat turns: the user's words on the right, the director's answer on the left.
  // A follow-up (joined) request shows no user words; its trigger is the answer above it.
  function turn(name, r, joined) {
    const out = [];
    if (!joined) out.push(h("div", { class: "bubble me" }, h("span", {}, r.text), h("small", { class: "muted" }, `${r.scope === "project" ? "cả dự án" : `${r.scope} ${r.target ?? ""}`} · v${r.base} · ${when(r.at)}`)));
    const bot = (cls, ...kids) => h("div", { class: `bubble bot ${cls}` }, ...kids);
    const cancel = () => h("div", { class: "row" }, h("button", { class: "btn", onclick: () => ctx.cancelRequest(r.id) }, "Huỷ yêu cầu"));
    if (r.status === "queued") out.push(bot("pending", h("span", { class: "muted" }, "Đang chờ tới lượt."), cancel()));
    else if (r.status === "running") out.push(bot("pending", h("span", { class: "muted" }, "Đang làm…"), cancel()));
    else if (r.status === "waiting_user" && r.ask) out.push(liveCard(name, r, false));
    else if (r.status === "done" && r.ask && r.decision) {
      out.push(bot("", h("small", { class: "muted" }, "Đạo diễn hỏi"), h("span", {}, r.ask.question)));
      out.push(h("div", { class: "bubble me" }, h("span", {}, r.decision.value)));
    } else if (r.status === "done") out.push(bot("", h("span", { class: "receipt" }, r.receipt ?? "Xong.")));
    else if (r.status === "failed" && r.ask && /^Hết hạn chờ/.test(r.error ?? "")) {
      out.push(memo.reopen.has(r.id) ? liveCard(name, r, true) : h("div", { class: "card gate expired" },
        h("strong", {}, r.ask.question),
        h("span", { class: "muted" }, "Hết hạn chờ trả lời. Trả lời lại để đạo diễn làm tiếp."),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { memo.reopen.add(r.id); render(); } }, "Trả lời lại"))));
    } else if (r.status === "failed") out.push(bot("err", h("span", { class: "receipt" }, r.error ?? "Không xong.")));
    return out;
  }

  // The same card node while the question waits, so a redraw neither swaps the button out under a
  // press nor restarts the animatic the user is watching.
  const liveCard = (name, r, again) => cards.get(cardKey(name, r, again, memo.rejecting.has(r.id)), () => gateCard(name, r, again));

  // A director question waiting for the user (studio_ask). again: the question had expired, so the
  // answer goes out as a new request with the old question and the answer in its text.
  function gateCard(name, r, again) {
    const a = r.ask;
    const err = h("p", { class: "gate-err", role: "alert", hidden: true });
    const card = h("div", { class: `card gate${again ? " again" : ""}`, role: "group", "aria-label": "Câu hỏi của đạo diễn" }, h("small", { class: "muted" }, again ? "Trả lời lại câu hỏi đã hết hạn" : "Đạo diễn cần bạn trả lời"), h("strong", {}, a.question));
    const lock = (on) => { for (const el of card.querySelectorAll("button, textarea")) el.disabled = on; };
    const submit = async (value, text) => {
      lock(true);
      err.hidden = true;
      let res;
      try {
        res = again
          ? await ctx.reask({ scope: r.scope, ...(r.target ? { target: r.target } : {}), text: `Trả lời lại câu hỏi "${a.question}": ${text}` })
          : await ctx.answer(r.id, value);
      } catch (e) {
        res = { ok: false, message: answerFailure({ error: e.message }) };
      }
      if (!res.ok) {
        err.textContent = res.message;
        err.hidden = false;
        return lock(false);
      }
      memo.reopen.delete(r.id);
      memo.rejecting.delete(r.id);
      delete memo.drafts[r.id];
      render();
    };
    const art = (a.artifacts ?? []).filter(Boolean);
    const draft = (key, label, placeholder) => {
      const t = h("textarea", { value: memo.drafts[key] ?? "", "aria-label": label, placeholder, maxlength: "2000", rows: "3" });
      t.addEventListener("input", () => (memo.drafts[key] = t.value));
      return t;
    };
    if (a.kind === "choice") {
      const imgs = art.filter((p) => isMedia(p) === "img");
      const paired = imgs.length && imgs.length === art.length && imgs.length === a.options.length;
      if (imgs.length && !paired) card.append(h("div", { class: "thumbs" }, ...imgs.map((p) => thumb(name, p))));
      card.append(h("div", { class: `options${paired ? " pics" : ""}` }, ...a.options.map((o, i) =>
        h("button", { type: "button", class: "btn opt", onclick: () => submit(o.id, `${o.label} (${o.id})`) },
          paired ? h("img", { src: fileUrl(name, imgs[i]), alt: "", loading: "lazy" }) : null, h("span", {}, o.label)))));
    } else if (a.kind === "approve") {
      const first = art[0];
      if (first) {
        const kind = isMedia(first);
        if (kind === "video") card.append(h("video", { class: "preview", src: fileUrl(name, first), controls: true, preload: "metadata" }));
        else if (kind === "img") card.append(h("img", { class: "preview", src: fileUrl(name, first), alt: first }));
        card.append(h("div", { class: "row" }, ...art.map((p) => h("a", { class: "ext", href: fileUrl(name, p), target: "_blank", rel: "noopener", title: p }, p.split("/").pop()))));
      }
      const note = memo.rejecting.has(r.id) ? draft(`${r.id}:reject`, "Ghi chú: chưa được ở đâu", "Chỗ nào chưa được? Đạo diễn sẽ sửa theo ghi chú này.") : null;
      if (note) card.append(note);
      card.append(h("div", { class: "row" },
          note ? h("button", { type: "button", class: "btn", onclick: () => submit({ reject: note.value.trim() }, note.value.trim() ? `Không duyệt: ${note.value.trim()}` : "Không duyệt") }, "Gửi ghi chú")
            : h("button", { type: "button", class: "btn", onclick: () => { memo.rejecting.add(r.id); render(); } }, "Chưa được"),
          h("button", { type: "button", class: "btn primary", onclick: () => submit("approve", "Duyệt") }, "Duyệt")));
    } else {
      const t = draft(r.id, "Câu trả lời", "Viết câu trả lời…");
      card.append(t, h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const v = t.value.trim();
        if (!v) return ctx.toast("Viết câu trả lời trước", true);
        submit(v, v);
      } }, "Gửi")));
    }
    card.append(err);
    return card;
  }

  // "Đạo diễn đang làm…" with the last 3 log lines of the running director job.
  function working() {
    liveLog = null;
    const job = liveDirectorJob(ctx.state.jobs, ctx.state.requests);
    const busy = job || ctx.state.requests.some((r) => r.status === "running");
    if (!busy) return null;
    if (job) liveLog = { id: job.id, pre: h("pre", { class: "text tail" }, tail3(job.id)) };
    return h("div", { class: "working", role: "status" }, h("strong", {}, "Đạo diễn đang làm…"), liveLog?.pre);
  }
  const tail3 = (id) => (ctx.state.logs.get(id) ?? []).slice(-3).join("\n") || "Đang khởi động…";

  function composer() {
    const brief = h("textarea", { value: memo.brief, rows: "3", "aria-label": "Việc giao cho AI", placeholder: "Ví dụ: shot 2 chậm lại, chữ to hơn, thêm logo cuối video…" });
    brief.addEventListener("input", () => (memo.brief = brief.value));
    const send = h("button", { type: "button", class: "btn primary" }, "Giao việc");
    const ask = async () => {
      send.disabled = true;
      const ok = await ctx.direct({ scope: "project", text: brief.value.trim() });
      send.disabled = false;
      if (ok) { memo.brief = ""; brief.value = ""; render(); }
    };
    send.addEventListener("click", ask);
    brief.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); ask(); } });
    return h("div", { class: "composer" }, brief, h("div", { class: "row" }, h("small", { class: "muted" }, "⌘/Ctrl+Enter để gửi"), h("span", { class: "spacer" }), send));
  }

  function mediaRow(m) {
    const file = String(m.rel ?? m.path ?? "").split("/").pop();
    const meta = [KIND_VI[m.kind] ?? m.kind, Number.isFinite(m.duration) ? mss(m.duration) : null, m.width && m.height ? `${m.width}×${m.height}` : null].filter(Boolean).join(" · ");
    return h("div", { class: "card media-row" }, h("span", { class: "entry-name", title: m.rel ?? m.path }, file), h("small", { class: "muted num" }, meta));
  }

  function badges() {
    const counts = {
      ai: ctx.state.requests.filter((r) => r.status === "waiting_user").length,
      voice: (ctx.state.m?.lines ?? []).filter((l) => l.gate === "stale").length,
    };
    for (const [id, { b, count, label }] of buttons) {
      const n = counts[id] ?? 0;
      count.hidden = !n;
      count.textContent = n > 99 ? "99+" : String(n);
      if (n) b.setAttribute("aria-label", `${label}, ${n} việc chờ bạn`); else b.removeAttribute("aria-label");
    }
  }

  let drawnFor = null; // project name whose manifest the open panel was drawn with
  const render = () => press.run(draw);
  function draw() {
    const t = TABS.find((x) => x.id === tab);
    drawnFor = ctx.state.m ? ctx.state.name : null;
    for (const [id, { b }] of buttons) {
      const on = id === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    panelEl.setAttribute("aria-labelledby", `tab-${tab}`);
    const head = h("header", { class: "panel-head" }, h("h2", {}, t.label), h("p", {}, t.lead));
    // A live card drawn again stays where the user sees it; otherwise the chat follows its end.
    const anchor = tab === "ai" ? panelEl.querySelector(".card.gate:not(.expired)") : null;
    const top = anchor?.getBoundingClientRect().top;
    panelEl.replaceChildren(head, ...views[tab]().filter(Boolean));
    if (tab === "ai") cards.sweep();
    badges();
    if (anchor?.isConnected) panelEl.scrollTop += anchor.getBoundingClientRect().top - top;
    else if (tab === "ai") requestAnimationFrame(() => { if (tab === "ai") panelEl.scrollTop = panelEl.scrollHeight; });
  }

  function select(id, focus = false) {
    if (!IDS.includes(id)) return;
    if (id !== tab) {
      tab = id;
      try { localStorage.setItem(STORE, id); } catch { /* storage blocked: the URL still keeps it */ }
      const url = new URL(location.href);
      url.searchParams.set("tab", id);
      history.replaceState(null, "", url);
      render();
      panelEl.scrollTop = 0;
    }
    if (focus) buttons.get(id).b.focus();
  }

  // The click that ends a press is dispatched after pointerup, so the held redraw runs after it.
  const release = () => { if (!press.pressed) return; const fn = press.release(); if (fn) setTimeout(fn); };
  panelEl.addEventListener("pointerdown", (e) => { if (e.button === 0) press.press(); });
  for (const ev of ["pointerup", "pointercancel"]) window.addEventListener(ev, release, true);
  window.addEventListener("blur", (e) => { if (e.target === window) release(); }); // the window, not a field losing focus
  panelEl.addEventListener("keydown", (e) => { if (e.key === " " && e.target.matches?.("button")) press.press(); });
  window.addEventListener("keyup", (e) => { if (e.key === " ") release(); }, true);

  railEl.addEventListener("click", (e) => { const b = e.target.closest(".rail-item"); if (b) select(b.dataset.tab); });
  railEl.addEventListener("keydown", (e) => {
    const i = IDS.indexOf(tab);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: IDS.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    select(IDS[(next + IDS.length) % IDS.length], true);
  });
  // e.code, not e.key: on macOS Alt+digit types a symbol (Alt+1 → "¡"). Inside an editable field
  // that symbol is what the user wants, so the shortcut stays out of the way there and in a dialog.
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (!m) return;
    e.preventDefault();
    select(IDS[Number(m[1]) - 1], true);
  });

  ctx.on("project", render);
  // Manifest-driven panels follow new versions, unless the user is typing in the panel.
  const typing = () => panelEl.contains(document.activeElement) && document.activeElement.matches("textarea, input[type=text], input[type=search]");
  // The first manifest of a project always redraws: the panel was drawn on "project", before the
  // manifest arrived, and would otherwise keep saying the project has no project.json.
  ctx.on("manifest", (m) => {
    if (m && drawnFor !== ctx.state.name) render();
    else if ((tab === "voice" || tab === "music") && !typing()) render();
    else badges();
  });
  ctx.on("gates", () => { if (tab === "output" && !typing()) render(); });
  ctx.on("requests", () => { if (tab === "ai" && !typing()) render(); else badges(); });
  // A log line only extends its <pre>; start and exit redraw the panel (export list included).
  ctx.on("jobs", (e) => {
    if (tab === "ai") {
      if (e?.type === "log" && liveLog?.id === e.job.id) liveLog.pre.textContent = tail3(e.job.id);
      else if (e?.type !== "log" && !typing()) render();
      return;
    }
    if (tab !== "output") return;
    const pre = e?.type === "log" ? logEls.get(e.job.id) : null;
    if (pre) { pre.textContent += (pre.textContent ? "\n" : "") + e.line; pre.scrollTop = pre.scrollHeight; }
    else if (!typing()) render();
  });
  render();
  return { render, select };
}
