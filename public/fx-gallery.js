// fx-gallery.js — "Thư viện chuyển cảnh" in the shot inspector. Lists GET /api/fx/catalog (seams
// of the provider, Studio packs, HyperFrames transitions; banned seams are never in it) with a
// source label, a filter and source chips. A picked Studio pack plays its preview in a sandboxed
// iframe; the others show their description and where their recipe lives. "Áp dụng cho shot"
// POSTs /api/fx/apply-transition: transition_in of the shot, then a director request naming the
// recipe. The manifest and the request queue refresh through Studio's own SSE.
const SOURCE_VI = { provider: "Provider", studio: "Studio", hyperframes: "HyperFrames" };
const ENERGY_VI = { em: "Êm", vua: "Vừa", "don-dap": "Dồn dập" };

let catalog = null;   // Promise<{ items, counts }>
const ui = { q: "", source: "", picked: null };

const load = (ctx) => {
  catalog ??= ctx.api("/api/fx/catalog").catch((e) => { catalog = null; throw e; });
  return catalog;
};

export function gallerySection(ctx, h, pick, m) {
  const shotId = pick?.id ?? ctx.state.sel;
  const shot = m?.shots?.find((s) => s.id === shotId);
  if (!shot) return null;
  const box = h("section", { class: "fx-gallery", "aria-label": "Thư viện chuyển cảnh" },
    h("h3", {}, "Thư viện chuyển cảnh"),
    h("p", { class: "muted" }, "Đang tải…"));
  load(ctx).then((cat) => box.replaceChildren(...view(ctx, h, cat, shot, m)), (e) => box.replaceChildren(h("h3", {}, "Thư viện chuyển cảnh"), h("p", { class: "form-error" }, `Không đọc được thư viện: ${e.message}`)));
  return box;
}

function view(ctx, h, cat, shot, m) {
  const out = [h("h3", {}, `Thư viện chuyển cảnh (${cat.items.length})`)];
  const list = h("div", { class: "fx-list", role: "listbox", "aria-label": "Chuyển cảnh" });
  const detail = h("div", { class: "fx-detail" });
  const q = h("input", { type: "search", value: ui.q, placeholder: "Tìm: zoom, glitch, mực…", "aria-label": "Tìm chuyển cảnh" });
  const chips = h("div", { class: "row fx-chips" }, ["", "provider", "studio", "hyperframes"].map((s) =>
    h("button", { type: "button", class: "btn fx-chip", "data-src": s, onclick: () => { ui.source = s; redraw(); } },
      s ? `${SOURCE_VI[s]} (${cat.counts[s] ?? 0})` : "Tất cả")));

  function redraw() {
    for (const b of chips.children) { const on = b.dataset.src === ui.source; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    const needle = ui.q.toLowerCase().trim();
    const items = cat.items.filter((i) => (!ui.source || i.sources.includes(ui.source)) && (!needle || [i.id, i.name, i.description].some((s) => String(s ?? "").toLowerCase().includes(needle))));
    list.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "muted" }, "Không có chuyển cảnh nào khớp")]));
    showDetail(cat.items.find((i) => i.id === ui.picked) ?? null);
  }
  function card(i) {
    const on = i.id === ui.picked, cur = i.id === shot.transition_in;
    return h("button", { type: "button", role: "option", "aria-selected": String(on), class: `fx-card${on ? " on" : ""}${cur ? " current" : ""}`, title: i.description ?? i.id, onclick: () => { ui.picked = i.id; redraw(); } },
      h("span", { class: "fx-name" }, i.name),
      h("span", { class: "fx-meta" },
        h("code", {}, i.id),
        ...i.sources.map((s) => h("span", { class: `fx-src fx-src-${s}` }, SOURCE_VI[s])),
        i.soft ? h("span", { class: "fx-src fx-soft", title: "Chỉ hợp hướng cho phép chuyển cảnh mềm" }, "mềm") : null,
        cur ? h("span", { class: "fx-src fx-cur" }, "đang dùng") : null));
  }
  function showDetail(i) {
    if (!i) { detail.replaceChildren(h("p", { class: "muted" }, "Chọn một chuyển cảnh để xem.")); return; }
    const ro = !ctx.editable;
    const kids = [
      h("strong", {}, i.name),
      h("small", { class: "muted" }, [i.kind, ...(i.energy ?? []).map((e) => ENERGY_VI[e] ?? e), i.duration ? `${i.duration}s` : null].filter(Boolean).join(" · ")),
      i.description ? h("p", {}, i.description) : null,
    ];
    if (i.preview) kids.push(h("iframe", { class: "fx-preview", src: i.preview, title: `Xem thử ${i.id}`, sandbox: "allow-scripts", loading: "lazy" }));
    if (i.recipe) kids.push(h("small", { class: "muted fx-path", title: i.recipe }, `Recipe: ${i.recipe}`));
    else if (i.doc) kids.push(h("small", { class: "muted fx-path", title: i.doc }, `Tài liệu: ${i.doc}`));
    else if (i.source === "provider") kids.push(h("small", { class: "muted" }, "Recipe do recipe pack của provider gom khi PLAN.md ghi seam này."));
    if (i.pair_seam && i.pair_seam !== i.id) kids.push(h("small", { class: "muted" }, `PLAN.md ghi seam: ${i.pair_seam}`));
    const apply = h("button", { type: "button", class: "btn primary", disabled: ro, onclick: async () => {
      apply.disabled = true;
      const r = await ctx.send("/api/fx/apply-transition", { name: ctx.state.name, shot: shot.id, id: i.id, base: ctx.state.m.version });
      apply.disabled = false;
      if (r.status !== 200) return ctx.toast(r.error ?? `Lỗi ${r.status}`, true);
      ctx.toast(r.message ?? `Đã đặt ${i.id} cho ${shot.id} và nhờ đạo diễn gắn vào HTML`);
    } }, "Áp dụng cho shot");
    kids.push(h("div", { class: "row" }, apply, ro ? h("small", { class: "muted" }, "Dự án chỉ xem") : null));
    detail.replaceChildren(...kids.filter(Boolean));
  }

  q.addEventListener("input", () => { ui.q = q.value; redraw(); });
  out.push(h("p", { class: "muted" }, `Shot ${shot.id} đang dùng: ${shot.transition_in || "(không)"}`), q, chips, list, detail);
  redraw();
  return out;
}
