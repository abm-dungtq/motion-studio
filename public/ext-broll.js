// ext-broll.js — the B-roll index in the UI: footage search and "Phân tích footage" at the end of
// the "Footage & chất liệu" tab (id media; broll-search.js), and "Gợi ý B-roll" in the inspector of a shot: the top 5
// parts (GET /api/broll/suggest) and "Đặt vào shot", which cuts the part into assets/broll/ and
// adds it to the shot's assets through the gateway (a new version; Cmd+Z takes it back), then, when
// ticked, asks the director to place the clip in the shot's scene.
import { hitCard, searchPanel, span } from "/broll-search.js";

export function register(studio) {
  const { ctx, h, toast } = studio;
  const panel = searchPanel(ctx, h);
  studio.addSection("media", { id: "broll-search", order: 40, view: () => { panel.refresh(); return h("section", { class: "group" }, h("h3", {}, "Tìm trong footage"), panel.node); } });

  // Suggestions per (project, shot, version), fetched once and painted into a kept node.
  const memo = new Map();
  let askDirector = true;
  async function load(key, name, shot) {
    const box = memo.get(key);
    try { box.data = await ctx.api(`/api/broll/suggest?name=${encodeURIComponent(name)}&shot=${encodeURIComponent(shot)}`); box.error = null; } catch (e) { box.error = e.message; }
    paint(box, name, shot);
  }
  function paint(box, name, shot) {
    const kids = [h("strong", {}, "Gợi ý B-roll")];
    if (box.error) kids.push(h("p", { class: "form-error" }, box.error));
    else if (!box.data) kids.push(h("small", { class: "muted" }, "Đang tìm…"));
    else if (!box.data.items.length) kids.push(h("small", { class: "muted" }, box.data.query ? `Không có footage khớp "${box.data.query}". Phân tích thêm footage ở tab Footage.` : "Shot chưa có tên hay lời để tìm."));
    else {
      kids.push(h("small", { class: "muted" }, `Tìm theo: ${box.data.query} · shot dài ${box.data.duration.toFixed(1)} s`));
      const tick = h("input", { type: "checkbox", checked: askDirector });
      tick.addEventListener("change", () => (askDirector = tick.checked));
      kids.push(h("label", { class: "row broll-ask" }, tick, h("span", {}, "Nhờ đạo diễn đặt clip vào cảnh")));
      for (const x of box.data.items) {
        const btn = h("button", { type: "button", class: "btn primary", disabled: !ctx.editable }, "Đặt vào shot");
        btn.addEventListener("click", () => place(btn, name, shot, x));
        const note = x.need_stretch ? h("small", { class: "broll-warn" }, "ngắn hơn shot: cần lặp/chậm") : h("small", { class: "muted" }, `dùng ${span(x.use)}`);
        kids.push(hitCard(h, x, [note, btn]));
      }
    }
    box.node.replaceChildren(...kids);
  }
  async function place(btn, name, shot, x) {
    const m = ctx.state.m;
    if (!m || ctx.state.name !== name) return;
    btn.disabled = true; btn.textContent = "Đang cắt…";
    const r = await ctx.send("/api/broll/apply", { name, shot, base: m.version, sha256: x.sha256, start: x.use.start, end: x.use.end }, { timeout: 11 * 60000 });
    btn.disabled = false; btn.textContent = "Đặt vào shot";
    if (r.status !== 200) { toast(r.error ?? `Lỗi ${r.status}`, true); return; }
    toast(r.unchanged ? `${r.rel} đã có trong shot ${shot}` : `Đã thêm ${r.rel} vào shot ${shot} (v${r.version}); Cmd+Z để hoàn tác`);
    if (askDirector && !r.unchanged) await ctx.direct({ scope: "shot", target: shot, text: `Đặt clip B-roll ${r.rel} (đã có trong assets của shot ${shot}) vào cảnh của shot này, đúng thời lượng shot.` });
  }

  studio.addInspectorSection({
    kinds: ["shot"],
    view(pick, m) {
      const name = ctx.state.name, shot = pick.id ?? ctx.state.sel;
      if (!name || !shot) return null;
      const key = `${name}\0${shot}\0${m.version}`;
      if (!memo.has(key)) {
        if (memo.size > 50) memo.clear();
        memo.set(key, { node: h("div", { class: "broll-suggest" }), data: null, error: null });
        paint(memo.get(key), name, shot);
        load(key, name, shot);
      }
      return memo.get(key).node;
    },
  });
}
