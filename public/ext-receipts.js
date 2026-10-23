// public/ext-receipts.js — receipts in the export tab (the 20 newest: op, time, verdict, output
// files; a click shows each check and the JSON) and, in the inspector of a shot, the receipts of
// the files in shot.assets. Data: GET /api/receipts and GET /api/receipt (routes/receipts.mjs).
import { receiptDetail, receiptRows, receiptsStore } from "/receipts-view.js";

export function register(studio) {
  const { ctx, h } = studio;
  let open = null, detail = null, repaint = null;
  const store = receiptsStore(ctx, () => repaint?.());

  // redraw: what shows the detail (the export section by default, the inspector box from there).
  async function show(id, redraw = () => repaint?.()) {
    open = id; detail = null; redraw();
    if (!id) return;
    const name = ctx.state.name;
    try { detail = receiptDetail(h, await ctx.api(`/api/receipt?name=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`)); } catch (e) { detail = h("p", { class: "form-error" }, `Không đọc được biên nhận: ${e.message}`); }
    if (open === id) redraw();
  }

  studio.addSection("output", {
    id: "receipts", order: 80,
    view({ h, render, loading }) {
      repaint = render;
      const name = ctx.state.name;
      if (!name) return null;
      store.load(name);
      const s = store.get(name);
      const head = h("div", { class: "row rc-head" }, h("h3", {}, "Biên nhận"), h("button", { class: "btn", type: "button", onclick: () => store.load(name, true) }, "Làm mới"));
      if (!s || (s.pending && !s.at)) return h("section", { class: "group" }, head, loading());
      const body = s.rows.length
        ? receiptRows(h, s.rows, { open, detail, onOpen: show })
        : [h("p", { class: "empty" }, "Chưa có biên nhận. Mỗi lần sinh ảnh, kiểm media hay xuất file sẽ ghi một biên nhận ở đây.")];
      return h("section", { class: "group receipts" }, head, s.error ? h("p", { class: "form-error" }, s.error) : null, ...body);
    },
  });

  studio.addInspectorSection({
    kinds: ["shot"],
    view(pick, m) {
      const shot = m.shots?.find((x) => x.id === pick.id);
      const files = new Set(shot?.assets ?? []);
      const name = ctx.state.name;
      if (!files.size || !name) return null;
      const box = h("div", { class: "rc-inspector" });
      const fill = () => {
        const rows = (store.get(name)?.rows ?? []).filter((r) => (r.outputs ?? []).some((f) => files.has(f)));
        box.replaceChildren(h("h4", {}, "Biên nhận của file trong shot"),
          ...(rows.length ? receiptRows(h, rows, { open, detail, onOpen: (id) => show(id, fill) }) : [h("p", { class: "muted" }, "Chưa có biên nhận cho file của shot này.")]));
      };
      fill();
      store.load(name).then(() => { if (box.isConnected) fill(); });
      return box;
    },
  });
}
