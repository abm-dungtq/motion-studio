// lemo-mystyle.js — "Phong cách riêng" at the end of the Phong cách code tab, after lemo-opuscar's
// MY-STYLES.md (github.com/lemomo-ai/lemo-opuscar, MIT): ask the director to draft a style in the
// project's lemo-style/ (from a library style or a blank page), see its style frame and
// CHANGES.md, and keep it in the own-styles folder. Only this button keeps a style.
import { h, toast } from "/dom.js";

const fileUrl = (name, rel) => `/p/${encodeURIComponent(name)}/${rel.split("/").map(encodeURIComponent).join("/")}`;

export function myStyleView(ctx, store) {
  const d = store.data;
  if (!d) return null;
  const name = ctx.state.name;
  const out = [h("h3", {}, "Phong cách riêng")];
  if (!name || !ctx.state.m) {
    out.push(h("p", { class: "muted" }, "Mở một dự án để tạo phong cách riêng. Phong cách đã giữ nằm ở " + (d.my_dir ?? "~/lemo-my-styles") + "."));
    return h("section", { class: "group lemo-mine" }, ...out);
  }
  const draft = d.project?.draft;
  if (draft) {
    const s = draft.style;
    out.push(h("div", { class: "card lemo-draft" },
      h("strong", {}, s ? `Bản nháp: ${s.en || s.cn || s.slug} (${s.slug})` : "Bản nháp trong lemo-style/ có style.json hỏng"),
      s?.based_on ? h("span", { class: "muted" }, `Dựa trên ${s.based_on}`) : null,
      s?.line ? h("p", { class: "lemo-line" }, s.line) : null,
      draft.frame ? h("img", { class: "lemo-frame", src: `${fileUrl(name, draft.frame)}?v=${Date.now()}`, alt: "Khung phong cách" }) : h("p", { class: "muted" }, "Chưa có styleframe.jpg."),
      draft.changes ? h("details", { class: "lib-more", open: true }, h("summary", {}, "CHANGES.md"), Object.assign(h("pre", { class: "lemo-guide" }), { textContent: draft.changes })) : null,
      h("div", { class: "row" },
        h("button", {
          class: "btn primary", disabled: !draft.valid || !draft.has_guide || store.busy,
          title: draft.has_guide ? "" : "Cần lemo-style/STYLE.md",
          onclick: async () => {
            if (!confirm(`Giữ "${s.en || s.slug}" vào ${d.my_dir}/${s.slug}/? Thư mục đã có thì không ghi đè.`)) return;
            const r = await ctx.send("/api/lemo/keep", { name });
            if (r.status === 200) toast(`Đã giữ phong cách ở ${r.dir}`); else toast(r.error ?? `Lỗi ${r.status}`, true);
            await store.load();
          },
        }, "Giữ phong cách"))));
  }
  const rows = (store.allRows ?? d.rows).filter((r) => r.guide);
  const base = h("select", { "aria-label": "Phong cách gốc" },
    h("option", { value: "" }, "Từ trang trắng"),
    ...rows.map((r) => h("option", { value: `${r.source}:${r.slug}` }, `${r.source === "mine" ? "★ " : ""}${r.ten}`)));
  const title = h("input", { type: "text", placeholder: "Tên phong cách (tuỳ chọn)", maxlength: 120 });
  const desc = h("textarea", { placeholder: "Muốn phong cách trông thế nào, dùng cho phim gì…", maxlength: 2000 });
  out.push(h("details", { class: "lib-more", open: !draft },
    h("summary", {}, draft ? "Tạo bản nháp khác" : "Tạo phong cách riêng"),
    h("div", { class: "stack" },
      h("p", { class: "muted" }, "Đạo diễn hỏi bạn từng câu bằng thẻ, viết STYLE.md, CHANGES.md và khung phong cách trong lemo-style/ của dự án. Bấm Giữ phong cách khi đã ưng."),
      base, title, desc,
      h("button", {
        class: "btn", disabled: !d.fetched,
        title: d.fetched ? "" : "Tải thư viện trước",
        onclick: async () => {
          const [source, slug] = base.value ? base.value.split(":") : [null, null];
          const r = await ctx.send("/api/lemo/draft", { name, base: slug, source, title: title.value, description: desc.value });
          if (r.status === 200) toast("Đã gửi yêu cầu tạo phong cách riêng cho đạo diễn"); else toast(r.error ?? `Lỗi ${r.status}`, true);
        },
      }, "Nhờ đạo diễn tạo"))));
  return h("section", { class: "group lemo-mine" }, ...out);
}
