// public/anime-manifest.js — the limited-animation editor of the Anime tab: assets/anim/manifest.json
// over /api/anime/manifest. Forms for the six things one tunes most (lipsync, blink, wind, keys,
// impacts, per-pose offsets) and a raw JSON box for the other keys of a stack (tweens, smears,
// tremor, steps, ghosts, streaks, breathe, origin). Edits go to a draft; "Lưu và build" sends it
// with the sha it started from (409 when the file changed meanwhile), asks again when the project
// already has a final video (428), then follows the build job and lists its WARN lines.

const TYPES = ["lipsync", "blink", "wind", "keys"];
const NEW_TRACK = {
  lipsync: () => ({ type: "lipsync", voice: "", open: "", half: "", closed: "", idle: "closed" }),
  blink: () => ({ type: "blink", pose: "", at: [], frames: 3 }),
  wind: () => ({ type: "wind", frames: ["base"], fps: 6, phase: 0 }),
  keys: () => ({ type: "keys", keys: [{ pose: "base", frames: 6 }] }),
};
const OWN = new Set(["shot", "tracks", "offsets"]); // stack keys with a form; the rest is raw JSON

// "" → undefined, "1.5" → 1.5, "s13+0.1" → "s13+0.1".
const time = (v) => { const t = String(v).trim(); return t === "" ? undefined : /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : t; };
const int = (v) => { const t = String(v).trim(); return t === "" ? undefined : Number.parseInt(t, 10); };
const num = (v) => { const t = String(v).trim(); return t === "" ? undefined : Number(t); };
const list = (v) => String(v).split(",").map((x) => x.trim()).filter(Boolean);
const show = (v) => (v === undefined || v === null ? "" : String(v));

export function manifestView(A) {
  const { h } = A;
  const g = A.data.manifest;
  if (A.errors.manifest) return h("p", { class: "empty" }, `Không tải được manifest: ${A.errors.manifest}`);
  if (!g) return h("p", { class: "muted" }, "Đang tải…");
  const build = A.jobs.build;
  const building = build && (build.job.status === "running" || build.job.status === "cancelling");

  if (!g.enabled && !g.exists) {
    return h("div", { class: "empty" }, h("p", {}, "Dự án chưa có hệ lật ảnh (assets/anim/). Bật để chép build.mjs, anim.js, manifest mẫu và tạo manifest.json trống. File có sẵn không bị ghi đè."),
      h("button", { class: "btn primary", onclick: async () => { const r = await A.send("/api/anime/enable", {}); if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true); A.toast(`Đã chép ${r.copied.length} file vào assets/anim/`); A.draft = null; A.load(["manifest", "board"]); } }, "Bật hệ lật ảnh"));
  }
  const d = (A.draft ??= { sha: g.sha, m: structuredClone(g.manifest ?? { stacks: {}, impacts: [] }), stack: Object.keys(g.manifest?.stacks ?? {})[0] ?? null, rawErr: null });
  const m = d.m;
  m.stacks ??= {};
  m.impacts ??= [];
  const stale = d.sha !== g.sha;
  const field = (label, el) => h("label", { class: "anime-field" }, h("span", {}, label), el);
  const input = (value, onchange, attrs = {}) => h("input", { type: "text", value: show(value), onchange: (e) => onchange(e.target.value), ...attrs });
  const put = (o, k, v) => { if (v === undefined || (typeof v === "number" && Number.isNaN(v))) delete o[k]; else o[k] = v; };
  const stackIds = Object.keys(m.stacks);

  async function save(confirmed = false) {
    if (d.rawErr) return A.toast(`Ô JSON chưa hợp lệ: ${d.rawErr}`, true);
    const r = await A.send("/api/anime/manifest", { base_sha: d.sha, manifest: m, confirm: confirmed });
    if (r.status === 428) { if (confirm(`${r.error}\n\nVẫn lưu? Bản cũ được sao lưu vào .opus/anim-backups/.`)) return save(true); return; }
    if (r.status === 409) { A.toast("Manifest vừa được sửa ở chỗ khác. Bấm Bỏ bản nháp để tải bản mới.", true); return; }
    if (r.status !== 200) { A.toast(r.error ?? `Lỗi ${r.status}`, true); return; }
    d.sha = r.sha;
    g.sha = r.sha;
    A.toast(`Đã lưu (sao lưu ${r.backup ?? "không cần"})`);
    if (r.job) A.follow("build", r.job, { onEnd: () => A.load(["board"]) });
    else A.paint();
  }
  async function rebuild(confirmed = false) {
    const r = await A.send("/api/anime/rebuild", { confirm: confirmed });
    if (r.status === 428) { if (confirm(`${r.error}\n\nVẫn build?`)) return rebuild(true); return; }
    if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true);
    A.follow("build", r.job, { onEnd: () => A.load(["board"]) });
  }

  const st = d.stack ? m.stacks[d.stack] : null;
  return [
    g.final.length ? h("p", { class: "anime-tag warn" }, `Dự án đã có bản final (${g.final.join(", ")}). Lưu sẽ hỏi xác nhận; bản cũ luôn được sao lưu.`) : null,
    stale ? h("p", { class: "anime-tag warn" }, "Bản nháp dựa trên manifest cũ hơn file hiện tại.") : null,
    h("div", { class: "row wrap" },
      h("button", { class: "btn primary", disabled: building, onclick: () => save() }, "Lưu và build"),
      h("button", { class: "btn", disabled: building || !g.enabled, onclick: () => rebuild() }, "Build lại"),
      h("button", { class: "btn", onclick: () => { A.draft = null; A.load(["manifest"]); } }, "Bỏ bản nháp")),
    build ? buildBox(A, build) : null,
    h("section", { class: "group" }, h("h3", {}, "Stack"),
      h("div", { class: "row wrap" },
        h("select", { onchange: (e) => { d.stack = e.target.value; A.paint(); } }, ...stackIds.map((id) => h("option", { value: id, selected: id === d.stack }, `${id} (${m.stacks[id].shot})`))),
        addStack(A, d)),
      st ? stackForm(A, d, st, { field, input, put }) : h("p", { class: "muted" }, "Chưa có stack. Mỗi stack là một phần tử id=… trong index.html.")),
    h("section", { class: "group" }, h("h3", {}, "Khung impact"),
      ...m.impacts.map((im, i) => h("div", { class: "card anime-row" },
        field("at", input(im.at, (v) => put(im, "at", time(v)))),
        field("frames", input(im.frames, (v) => put(im, "frames", int(v)), { inputmode: "numeric" })),
        field("mode", h("select", { onchange: (e) => { put(im, "mode", e.target.value); if (e.target.value !== "silhouette") delete im.stack; A.paint(); } }, ...["invert", "silhouette"].map((x) => h("option", { value: x, selected: (im.mode ?? "invert") === x }, x)))),
        (im.mode ?? "invert") === "silhouette" ? field("stack", h("select", { onchange: (e) => put(im, "stack", e.target.value) }, h("option", { value: "" }, "—"), ...stackIds.map((id) => h("option", { value: id, selected: im.stack === id }, id)))) : null,
        h("button", { class: "btn", onclick: () => { m.impacts.splice(i, 1); A.paint(); } }, "Bỏ"))),
      h("button", { class: "btn", onclick: () => { m.impacts.push({ at: 0, frames: 2, mode: "invert" }); A.paint(); } }, "Thêm impact")),
  ];
}

function buildBox(A, b) {
  const { h } = A;
  const live = b.job.status === "running" || b.job.status === "cancelling";
  const warns = b.warnings ?? [];
  const tail = (b.log ?? []).filter((l) => !/\bWARN\b/.test(l)).slice(-3);
  return h("section", { class: `group anime-build${!live && b.job.code ? " err" : ""}` },
    h("strong", {}, live ? "Đang build…" : b.job.code === 0 ? `Build xong${warns.length ? `, ${warns.length} cảnh báo` : ""}` : `Build lỗi (exit ${b.job.code ?? b.job.signal})`),
    warns.length ? h("ul", { class: "anime-warn" }, ...warns.map((w) => h("li", {}, w))) : null,
    tail.length ? h("pre", { class: "anime-log" }, tail.join("\n")) : null);
}

function addStack(A, d) {
  const { h } = A;
  const nw = { id: "", shot: "" };
  return h("details", {}, h("summary", {}, "Thêm stack"),
    h("input", { type: "text", placeholder: "id phần tử, ví dụ s3-hero", oninput: (e) => { nw.id = e.target.value.trim(); } }),
    h("input", { type: "text", placeholder: "shot, ví dụ s3", oninput: (e) => { nw.shot = e.target.value.trim(); } }),
    h("button", { class: "btn", onclick: () => {
      if (!/^[A-Za-z0-9_-]+$/.test(nw.id) || !nw.shot) return A.toast("Cần id và shot", true);
      if (d.m.stacks[nw.id]) return A.toast(`Đã có stack ${nw.id}`, true);
      d.m.stacks[nw.id] = { shot: nw.shot, tracks: [] };
      d.stack = nw.id;
      A.paint();
    } }, "Thêm"));
}

function stackForm(A, d, st, { field, input, put }) {
  const { h } = A;
  st.tracks ??= [];
  const others = Object.fromEntries(Object.entries(st).filter(([k]) => !OWN.has(k)));
  const offsets = st.offsets ?? {};
  const raw = h("textarea", { rows: 6, class: "anime-json", spellcheck: "false", value: JSON.stringify(others, null, 2) });
  raw.addEventListener("change", () => {
    try {
      const v = JSON.parse(raw.value || "{}");
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("cần một object");
      for (const k of Object.keys(st)) if (!OWN.has(k)) delete st[k];
      for (const [k, x] of Object.entries(v)) if (!OWN.has(k)) st[k] = x;
      d.rawErr = null;
      raw.classList.remove("bad");
    } catch (e) { d.rawErr = e.message; raw.classList.add("bad"); }
  });
  return h("div", { class: "group" },
    field("shot", input(st.shot, (v) => { st.shot = v.trim(); })),
    ...st.tracks.map((tr, i) => trackForm(A, st, tr, i, { field, input, put })),
    h("div", { class: "row wrap" }, ...TYPES.map((t) => h("button", { class: "btn", onclick: () => { st.tracks.push(NEW_TRACK[t]()); A.paint(); } }, `+ ${t}`))),
    h("h4", {}, "Offsets theo tư thế (lệch khung thì sửa ở đây, đừng sinh lại)"),
    ...Object.entries(offsets).map(([pose, o]) => h("div", { class: "card anime-row" }, h("strong", {}, pose),
      ...["x", "y", "scale"].map((k) => field(k, input(o[k], (v) => put(o, k, num(v)), { inputmode: "decimal" }))),
      h("button", { class: "btn", onclick: () => { delete offsets[pose]; if (!Object.keys(offsets).length) delete st.offsets; A.paint(); } }, "Bỏ"))),
    h("div", { class: "row" }, h("input", { type: "text", placeholder: "tên tư thế, ví dụ s13-k2", onkeydown: (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      (st.offsets ??= {})[e.target.value.trim()] = { x: 0, y: 0 };
      A.paint();
    } }), h("span", { class: "muted" }, "Enter để thêm")),
    h("h4", {}, "Khoá khác (JSON)"), raw,
    h("button", { class: "btn", onclick: () => { if (confirm(`Xoá stack ${d.stack}?`)) { delete d.m.stacks[d.stack]; d.stack = Object.keys(d.m.stacks)[0] ?? null; A.paint(); } } }, "Xoá stack"));
}

function trackForm(A, st, tr, i, { field, input, put }) {
  const { h } = A;
  const rows = [];
  if (tr.type === "lipsync") {
    rows.push(field("voice (id thẻ audio)", input(tr.voice, (v) => put(tr, "voice", v.trim()))));
    for (const k of ["open", "half", "closed"]) rows.push(field(k, input(tr[k], (v) => put(tr, k, v.trim() || undefined))));
    rows.push(field("idle", h("select", { onchange: (e) => { tr.idle = e.target.value === "null" ? null : e.target.value; } }, ...["closed", "half", "open", "null"].map((x) => h("option", { value: x, selected: show(tr.idle ?? "closed") === x || (x === "null" && tr.idle === null) }, x)))));
    rows.push(field("from", input(tr.from, (v) => put(tr, "from", time(v)))), field("to", input(tr.to, (v) => put(tr, "to", time(v)))));
  } else if (tr.type === "blink") {
    rows.push(field("pose", input(tr.pose, (v) => put(tr, "pose", v.trim()))));
    rows.push(field("at (giây hoặc s4+0.5, cách nhau bằng dấu phẩy)", input((tr.at ?? []).join(", "), (v) => { tr.at = list(v).map(time); })));
    rows.push(field("frames", input(tr.frames, (v) => put(tr, "frames", int(v)), { inputmode: "numeric" })));
  } else if (tr.type === "wind") {
    rows.push(field("frames (tư thế, cách nhau bằng dấu phẩy)", input((tr.frames ?? []).join(", "), (v) => { tr.frames = list(v); })));
    rows.push(field("fps", input(tr.fps, (v) => put(tr, "fps", num(v)), { inputmode: "decimal" })), field("phase", input(tr.phase, (v) => put(tr, "phase", int(v)), { inputmode: "numeric" })));
  } else if (tr.type === "keys") {
    tr.keys ??= [];
    rows.push(...tr.keys.map((k, j) => h("div", { class: "row anime-key" },
      input(k.pose, (v) => put(k, "pose", v.trim()), { "aria-label": `Tư thế ${j + 1}` }),
      input(k.frames, (v) => put(k, "frames", int(v)), { "aria-label": `Số khung ${j + 1}`, inputmode: "numeric", class: "num" }),
      h("select", { "aria-label": `Smear ${j + 1}`, onchange: (e) => put(k, "smear", e.target.value || undefined) }, h("option", { value: "" }, "không nhoè"), ...["left", "right"].map((x) => h("option", { value: x, selected: k.smear === x }, `nhoè ${x}`))),
      h("button", { class: "btn", onclick: () => { tr.keys.splice(j, 1); A.paint(); } }, "Bỏ"))));
    rows.push(h("button", { class: "btn", onclick: () => { tr.keys.push({ pose: "base", frames: 6 }); A.paint(); } }, "Thêm tư thế"));
  }
  const extra = Object.keys(tr).filter((k) => !["type", "voice", "open", "half", "closed", "idle", "from", "to", "pose", "at", "frames", "fps", "phase", "keys"].includes(k));
  return h("div", { class: "card anime-track" },
    h("div", { class: "row" }, h("strong", {}, `${i + 1}. ${tr.type}`), extra.length ? h("small", { class: "muted" }, `giữ nguyên: ${extra.join(", ")}`) : null,
      h("button", { class: "btn", onclick: () => { st.tracks.splice(i, 1); A.paint(); } }, "Bỏ track")),
    ...rows);
}
