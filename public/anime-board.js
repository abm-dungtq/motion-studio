// public/anime-board.js — the shot board of the Anime tab: one column per stage (no plate, plate,
// pose variants, animated; GET /api/anime/board derives them from files), a card per shot with
// its plate as thumbnail. Picking a shot emits "anime:shot" and, when the project is open in the
// timeline, selects that shot and seeks to its start. The picked shot shows its plates and
// variants and the "Sinh biến thể tư thế" form (POST /api/anime/variant, one image of quota).

const STATUS_HINT = { missing: "chưa có ảnh nào tên <shot>-*.png trong assets/plates/", plate: "có plate, chưa có biến thể", variants: "có biến thể, chưa có track trong manifest", animated: "đã có track hoạt hình" };

export function boardView(A) {
  const { h } = A;
  const b = A.data.board;
  if (A.errors.board) return h("p", { class: "empty" }, `Không tải được shot board: ${A.errors.board}`);
  if (!b) return h("p", { class: "muted" }, "Đang tải…");
  const head = h("div", { class: "row anime-head" },
    b.note ? h("span", { class: "anime-tag warn" }, b.note) : null,
    h("button", { class: "btn", onclick: () => A.load(["board"]) }, "Tải lại"));
  if (!b.shots.length) return [head, h("div", { class: "empty" }, h("p", {}, "Chưa có shot nào. Nhập dự án (project.json) hoặc thêm stack vào assets/anim/manifest.json ở mục Hoạt hình."))];
  const cols = b.columns.map((c) => {
    const shots = b.shots.filter((s) => s.status === c.id);
    return h("section", { class: "anime-col" }, h("h3", {}, `${c.label} `, h("span", { class: "muted" }, String(shots.length))), ...shots.map((s) => card(A, s)));
  });
  const pick = b.shots.find((s) => s.id === A.pick);
  return [head, h("div", { class: "anime-board" }, ...cols), pick ? detail(A, pick) : h("p", { class: "muted" }, "Bấm một shot để xem ảnh và sinh biến thể tư thế.")];
}

function card(A, s) {
  const { h } = A;
  const meta = [`${s.plates.length} plate`, `${s.variants.length} biến thể`, s.tracks ? `${s.tracks} track` : null].filter(Boolean).join(" · ");
  return h("button", { type: "button", class: `anime-card${A.pick === s.id ? " on" : ""}`, title: STATUS_HINT[s.status], onclick: () => pickShot(A, s) },
    s.thumb ? h("img", { src: A.src(s.thumb), alt: "", loading: "lazy" }) : h("div", { class: "anime-noimg" }, "không có ảnh"),
    h("strong", {}, s.id, s.name ? ` · ${s.name}` : ""), h("small", { class: "muted" }, meta));
}

function pickShot(A, s) {
  const { ctx } = A;
  A.pick = s.id;
  A.form = null;
  ctx.emit("anime:shot", s);
  if (ctx.state.m?.shots?.some((x) => x.id === s.id)) {
    ctx.select(s.id);
    ctx.transport?.seek(s.start);
  }
  A.paint();
}

// The form keeps its values across redraws in A.form (per shot).
function detail(A, s) {
  const { h } = A;
  const chars = A.data.board.chars.filter((c) => c.exists);
  const images = [...s.variants, ...s.plates];
  const f = (A.form ??= { base: s.variants.find((x) => /-base\.png$/.test(x)) ?? images[0] ?? "", chars: [], kind: "edit", change: "", out_name: `${s.id}-v1`, sim: 0.18, blend: 0.06, edge: false });
  const job = A.jobs.variant;
  const running = job && (job.job.status === "running" || job.job.status === "cancelling");
  const field = (label, el) => h("label", { class: "anime-field" }, h("span", {}, label), el);
  const set = (k, conv = (v) => v) => (e) => { f[k] = conv(e.target.type === "checkbox" ? e.target.checked : e.target.value); };
  const strip = (list) => (list.length ? h("div", { class: "anime-strip" }, ...list.map((rel) => h("figure", {}, h("img", { src: A.src(rel), alt: rel, loading: "lazy" }), h("figcaption", {}, rel.split("/").pop())))) : h("p", { class: "muted" }, "không có"));

  async function submit() {
    if (!f.base) return A.toast("Chọn ảnh gốc", true);
    if (!f.change.trim()) return A.toast("Ghi thay đổi cần làm", true);
    if (!confirm(`Sinh một ảnh bằng agent sinh ảnh (tốn 1 ảnh quota) cho ${s.id} → ${f.out_name}.png?`)) return;
    const r = await A.send("/api/anime/variant", { shot: s.id, base: f.base, chars: f.chars, kind: f.kind, change: f.change, out_name: f.out_name, sim: Number(f.sim), blend: Number(f.blend), edge: f.edge });
    if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true);
    A.follow("variant", r.job, {
      onEnd: (j) => {
        const line = [...j.log].reverse().find((l) => l.startsWith("RESULT "));
        let out = null;
        try { out = line ? JSON.parse(line.slice(7)) : null; } catch { /* shown in the log */ }
        A.toast(out?.ok ? `Đã có ${out.file.split("/").pop()} (${out.width}px, nền ${out.color})` : `Không sinh được: ${out?.error ?? `exit ${j.job.code}`}`, !out?.ok);
        A.load(["board"]);
      },
    });
  }

  return h("section", { class: "group anime-detail" },
    h("h3", {}, `Shot ${s.id}`, h("span", { class: "muted" }, ` · ${STATUS_HINT[s.status]}`)),
    s.stacks.length ? h("p", { class: "muted" }, `Stack trong manifest: ${s.stacks.join(", ")}`) : null,
    h("h4", {}, "Biến thể"), strip(s.variants),
    h("h4", {}, "Plate"), strip(s.plates),
    h("h4", {}, "Sinh biến thể tư thế"),
    field("Ảnh gốc", h("select", { onchange: set("base") }, ...images.map((rel) => h("option", { value: rel, selected: rel === f.base }, rel)))),
    chars.length ? field("Sheet nhân vật đính kèm", h("div", { class: "row wrap" }, ...chars.map((c) => h("label", { class: "anime-check" },
      h("input", { type: "checkbox", checked: f.chars.includes(c.id), onchange: (e) => { f.chars = e.target.checked ? [...f.chars, c.id] : f.chars.filter((x) => x !== c.id); } }), c.name)))) : h("p", { class: "muted" }, "Chưa có sheet nhân vật (mục Nhân vật)."),
    field("Kiểu", h("select", { onchange: set("kind") }, h("option", { value: "edit", selected: f.kind === "edit" }, "Sửa một chi tiết, giữ tư thế"), h("option", { value: "pose", selected: f.kind === "pose" }, "Vẽ lại ở tư thế mới"))),
    field("Thay đổi (tiếng Anh cho agent)", h("textarea", { rows: 3, value: f.change, placeholder: "mouth half open, eyes unchanged", oninput: set("change") })),
    field("Tên file", h("input", { type: "text", value: f.out_name, oninput: set("out_name", (v) => v.trim()) })),
    h("details", {}, h("summary", {}, "Tách nền"),
      field("sim (độ giống màu nền)", h("input", { type: "number", step: "0.01", min: "0.01", max: "1", value: String(f.sim), oninput: set("sim") })),
      field("blend (mép mềm)", h("input", { type: "number", step: "0.01", min: "0", max: "1", value: String(f.blend), oninput: set("blend") })),
      h("label", { class: "anime-check" }, h("input", { type: "checkbox", checked: f.edge, onchange: set("edge") }), "Despill chỉ ở viền (giữ màu áo quần bên trong)")),
    h("div", { class: "row" }, h("button", { class: "btn primary", disabled: running || !images.length, onclick: submit }, running ? "Đang sinh…" : "Sinh biến thể")),
    job ? h("pre", { class: "anime-log" }, (job.log ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-12).join("\n") || "đang chờ…") : null,
    h("p", { class: "muted" }, "Lệch khung so với ảnh gốc thì sửa bằng offsets ở mục Hoạt hình, đừng sinh lại."));
}
