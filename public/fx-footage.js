// fx-footage.js — "Sửa clip": trim, speed ramp, freeze, grade (LUT or preset) and reframe of one
// video, rendered ahead of time by POST /api/fx/footage (the project's "fx" job, output in
// footage/cut/). When the job ends the editor shows the clip before and after (two <video>
// from GET /api/fx/clip) and the receipt. "Dùng trong shot" POSTs /api/fx/use-clip: the clip is
// copied into the project's assets/footage/, put in the shot's assets and the director is asked
// to switch the src in the HTML. Used by the Footage tab (any registered clip) and by the shot
// inspector (the shot's own videos, replace preset to that asset).
const OPS = [
  ["trim", "Cắt đoạn"], ["speed", "Đổi tốc độ"], ["freeze", "Đứng hình"], ["grade", "Chỉnh màu"], ["reframe", "Cắt khung"],
];
const PRESETS = [["warm", "Ấm"], ["cool", "Lạnh"], ["punchy", "Đậm"], ["mono", "Đen trắng"], ["faded", "Phai"]];
const ASPECTS = ["9:16", "1:1", "4:5", "16:9"];
const POLL_MS = 1000;
const WAIT_MS = 30 * 60 * 1000;
const RESULT = "RESULT ";
const isVideo = (p) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(String(p));

const states = new Map(); // key → editor state, so a re-render keeps the form and the result
let luts = null;          // { name, list }

const clipUrl = (name, src) => `/api/fx/clip?name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`;

// "0:1, 2:2" → [{ t: 0, rate: 1 }, { t: 2, rate: 2 }] ; keys names the fields of each point.
export function parsePoints(text, keys) {
  const out = [];
  for (const part of String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const nums = part.split(/[:\s]+/).map(Number);
    if (nums.length !== keys.length || nums.some((n) => !Number.isFinite(n))) throw new Error(`"${part}" phải có dạng ${keys.join(":")}`);
    out.push(Object.fromEntries(keys.map((k, i) => [k, nums[i]])));
  }
  if (!out.length) throw new Error(`cần ít nhất một điểm ${keys.join(":")}`);
  return out;
}

function paramsOf(s) {
  const n = (v, what) => { const x = Number(v); if (v === "" || !Number.isFinite(x)) throw new Error(`${what} phải là số`); return x; };
  if (s.op === "trim") return { in: n(s.in, "Từ giây"), out: n(s.out, "Đến giây") };
  if (s.op === "speed") return { anchors: parsePoints(s.anchors, ["t", "rate"]), audio: s.audio };
  if (s.op === "freeze") return { at: n(s.at, "Tại giây"), duration: n(s.hold, "Giữ") };
  if (s.op === "grade") return { ...(s.look.startsWith("preset:") ? { preset: s.look.slice(7) } : { lut: s.look }), intensity: n(s.intensity, "Cường độ") };
  return { aspect: s.aspect, anchors: parsePoints(s.points, ["t", "x", "y"]) };
}

// sources: [{ value, label }] (value is a src /api/fx/footage accepts); shot presets the
// "Dùng trong shot" target, replacing the edited clip when it is one of that shot's assets.
export function clipEditor(ctx, h, { key, sources, shot = null }) {
  const name = ctx.state.name;
  const s = states.get(key) ?? { src: sources[0]?.value ?? "", op: "trim", in: "0", out: "2", anchors: "0:1, 2:2", audio: false, at: "1", hold: "1", look: "identity", intensity: "1", aspect: "9:16", points: "0:0.5:0.5", job: null, result: null, error: null, busy: false };
  states.set(key, s);
  s.views ??= new Set();
  if (!sources.some((x) => x.value === s.src)) s.src = sources[0]?.value ?? "";
  const box = h("div", { class: "fx-editor" });

  const field = (label, input) => h("label", {}, label, input);
  const num = (k, step = "0.1") => { const i = h("input", { type: "number", step, value: s[k] }); i.addEventListener("input", () => { s[k] = i.value; }); return i; };
  const text = (k, ph) => { const i = h("input", { type: "text", value: s[k], placeholder: ph, spellcheck: "false" }); i.addEventListener("input", () => { s[k] = i.value; }); return i; };

  function form() {
    if (s.op === "trim") return [field("Từ giây", num("in")), field("Đến giây", num("out"))];
    if (s.op === "speed") {
      const au = h("input", { type: "checkbox", checked: s.audio });
      au.addEventListener("change", () => { s.audio = au.checked; });
      return [field("Điểm neo t:tốc độ (0,25–4), mỗi điểm giữ tới điểm sau", text("anchors", "0:1, 2:2")), h("label", { class: "row" }, au, "Giữ tiếng (atempo, có thể nghe lạ)")];
    }
    if (s.op === "freeze") return [field("Đứng hình tại giây", num("at")), field("Giữ bao lâu (giây)", num("hold"))];
    if (s.op === "grade") {
      const sel = h("select", {}, h("option", { value: s.look }, s.look));
      const fill = (list) => sel.replaceChildren(
        h("optgroup", { label: "LUT" }, list.map((l) => h("option", { value: l.id, selected: l.id === s.look }, `${l.name} (${l.source})`))),
        h("optgroup", { label: "Preset" }, PRESETS.map(([id, vi]) => h("option", { value: `preset:${id}`, selected: s.look === `preset:${id}` }, vi))));
      if (luts?.name === name) fill(luts.list);
      else ctx.api(`/api/fx/luts?name=${encodeURIComponent(name)}`).then((r) => { luts = { name, list: r.luts ?? [] }; fill(luts.list); }).catch((e) => ctx.toast(`Không đọc được danh sách LUT: ${e.message}`, true));
      sel.addEventListener("change", () => { s.look = sel.value; });
      const range = h("input", { type: "range", min: "0.05", max: "1", step: "0.05", value: s.intensity });
      range.addEventListener("input", () => { s.intensity = range.value; });
      return [field("Màu", sel), field("Cường độ", range)];
    }
    const asp = h("select", {}, ASPECTS.map((a) => h("option", { value: a, selected: a === s.aspect }, a)));
    asp.addEventListener("change", () => { s.aspect = asp.value; });
    return [field("Khung đích", asp), field("Tâm khung t:x:y (x, y 0–1), di chuyển thẳng giữa các điểm", text("points", "0:0.5:0.5, 4:0.7:0.5"))];
  }

  async function runIt(btn) {
    let params;
    try { params = paramsOf(s); } catch (e) { return ctx.toast(e.message, true); }
    if (!s.src) return ctx.toast("Chọn clip trước", true);
    s.busy = true; s.error = null; s.result = null; btn.disabled = true; btn.textContent = "Đang render…";
    const r = await ctx.send("/api/fx/footage", { name, src: s.src, op: s.op, params });
    if (r.status !== 200) { s.busy = false; s.error = r.error ?? `Lỗi ${r.status}`; return drawAll(); }
    s.job = r.job.id;
    const until = Date.now() + WAIT_MS;
    while (Date.now() < until) {
      await new Promise((res) => setTimeout(res, POLL_MS));
      let j;
      try { j = (await ctx.api(`/api/jobs?name=${encodeURIComponent(name)}`)).find((x) => x.id === s.job); } catch { continue; }
      if (!j || j.status === "running" || j.status === "cancelling") continue;
      const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT));
      const out = line ? JSON.parse(line.slice(RESULT.length)) : null;
      s.busy = false;
      if (out?.ok) s.result = out; else s.error = out?.error ?? `job ${j.status}: ${(j.tail ?? []).slice(-2).join(" | ")}`;
      return drawAll();
    }
    s.busy = false; s.error = "Quá 30 phút; job vẫn chạy trong Studio";
    drawAll();
  }
  // The inspector may have re-rendered while the job ran: redraw every editor still on screen.
  function drawAll() { for (const d of [...s.views]) { if (d.box.isConnected || d === draw) d(); else s.views.delete(d); } }

  function resultView() {
    const r = s.result;
    const shots = ctx.state.m?.shots ?? [];
    const target = h("select", {}, shots.map((x) => h("option", { value: x.id, selected: x.id === (shot?.id ?? ctx.state.sel) }, `${x.id} · ${x.name || ""}`)));
    const repl = h("select", {});
    const fillRepl = () => {
      const sh = shots.find((x) => x.id === target.value);
      const vids = (sh?.assets ?? []).filter(isVideo);
      repl.replaceChildren(h("option", { value: "" }, "(thêm vào, không thay)"), ...vids.map((a) => h("option", { value: a, selected: Boolean(shot) && sh?.id === shot.id && a === s.src }, `thay ${a}`)));
    };
    target.addEventListener("change", fillRepl);
    fillRepl();
    const use = h("button", { type: "button", class: "btn primary", disabled: !ctx.editable, onclick: async () => {
      use.disabled = true;
      const res = await ctx.send("/api/fx/use-clip", { name, shot: target.value, base: ctx.state.m.version, clip: r.rel, replace: repl.value || null });
      use.disabled = false;
      if (res.status !== 200) return ctx.toast(res.error ?? `Lỗi ${res.status}`, true);
      ctx.toast(res.message ?? `Đã đưa ${res.asset} vào ${target.value} và nhờ đạo diễn đổi src`);
    } }, "Dùng trong shot");
    const pass = r.receipt?.pass;
    return h("div", { class: "fx-result" },
      h("div", { class: "fx-ab" },
        h("figure", {}, h("video", { src: clipUrl(name, s.src), controls: true, muted: true, preload: "metadata" }), h("figcaption", {}, "Trước")),
        h("figure", {}, h("video", { src: clipUrl(name, r.rel), controls: true, muted: true, preload: "metadata" }), h("figcaption", {}, "Sau"))),
      h("small", { class: "muted fx-path", title: r.out }, `${r.rel} · ${Number(r.actual_duration).toFixed(2)}s${r.cached ? " · dùng lại bản đã render" : ""}`),
      h("span", { class: `fx-receipt ${pass ? "ok" : "bad"}`, title: r.receipt?.file }, `Biên nhận ${r.receipt?.id ?? "?"}: ${pass ? "kiểm đạt" : "kiểm không đạt"}`),
      ...(r.warnings ?? []).map((w) => h("small", { class: "form-error" }, w)),
      h("div", { class: "row" }, target, repl, use));
  }

  function draw() {
    const src = h("select", { "aria-label": "Clip" }, sources.length ? sources.map((x) => h("option", { value: x.value, selected: x.value === s.src }, x.label)) : h("option", { value: "" }, "(chưa có video)"));
    src.addEventListener("change", () => { s.src = src.value; s.result = null; draw(); });
    const op = h("select", { "aria-label": "Thao tác" }, OPS.map(([id, vi]) => h("option", { value: id, selected: id === s.op }, vi)));
    op.addEventListener("change", () => { s.op = op.value; draw(); });
    const go = h("button", { type: "button", class: "btn primary", disabled: s.busy || !sources.length }, s.busy ? "Đang render…" : "Render");
    go.addEventListener("click", () => runIt(go));
    // replaceChildren turns null into the text "null", so drop the empty slots first.
    box.replaceChildren(...[
      h("div", { class: "row" }, src, op),
      ...form(),
      h("div", { class: "row" }, go, h("small", { class: "muted" }, "Ra footage/cut/, tất định, có biên nhận")),
      s.error ? h("p", { class: "form-error" }, s.error) : null,
      s.result ? resultView() : null,
    ].filter(Boolean));
  }
  draw.box = box;
  s.views.add(draw);
  draw();
  return box;
}

// The Footage tab section: every registered video of the project.
export function footageSection(ctx, h) {
  const name = ctx.state.name;
  const box = h("section", { class: "fx-footage" }, h("h3", {}, "Sửa clip"), h("p", { class: "muted" }, "Đang tải…"));
  if (!name) return box;
  ctx.api(`/api/media?name=${encodeURIComponent(name)}`).then((list) => {
    const sources = list.filter((m) => m.kind === "video").map((m) => ({ value: m.rel ?? m.path, label: String(m.rel ?? m.path).split("/").pop() }));
    box.replaceChildren(h("h3", {}, "Sửa clip"),
      h("p", { class: "muted" }, "Cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung dọc. Render trước bằng ffmpeg, bản gốc giữ nguyên."),
      sources.length ? clipEditor(ctx, h, { key: `media:${name}`, sources }) : h("p", { class: "empty" }, "Chưa có video đã đăng ký. Thêm footage ở trên trước."));
  }, (e) => box.replaceChildren(h("h3", {}, "Sửa clip"), h("p", { class: "form-error" }, e.message)));
  return box;
}

// The inspector section for a shot with video assets.
export function shotClipsSection(ctx, h, pick, m) {
  const shot = m?.shots?.find((s) => s.id === (pick?.id ?? ctx.state.sel));
  const vids = (shot?.assets ?? []).filter(isVideo);
  if (!shot || !vids.length) return null;
  return h("section", { class: "fx-footage" }, h("h3", {}, "Sửa clip của shot"),
    clipEditor(ctx, h, { key: `shot:${ctx.state.name}:${shot.id}`, sources: vids.map((a) => ({ value: a, label: a.split("/").pop() })), shot }));
}
