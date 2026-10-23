// public/anime-chars.js — the character library of the Anime tab (assets/chars/chars.json over
// /api/anime/chars): sheet, name, key colour, palette, notes. A sheet PNG that the library does
// not list yet shows with "Lưu vào thư viện". "Sinh sheet" makes a four-view sheet on the key
// colour through the agent registry (one image of quota) and points the entry at it.

const blank = () => ({ id: "", name: "", key_color: "#0047FF", palette: "", notes: "", sheet: "" });

export function charsView(A) {
  const { h } = A;
  if (A.errors.chars) return h("p", { class: "empty" }, `Không tải được thư viện nhân vật: ${A.errors.chars}`);
  const list = A.data.chars?.chars;
  if (!list) return h("p", { class: "muted" }, "Đang tải…");
  const job = A.jobs.sheet;
  const running = job && (job.job.status === "running" || job.job.status === "cancelling");
  const edit = (A.charForm ??= blank());

  async function save(c) {
    const r = await A.send("/api/anime/chars", { char: c });
    if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true);
    A.toast(`Đã lưu ${r.char.name}`);
    A.charForm = blank();
    A.load(["chars", "board"]);
  }
  async function remove(c) {
    if (!confirm(`Bỏ ${c.name} khỏi thư viện? File sheet vẫn giữ nguyên.`)) return;
    const r = await A.send("/api/anime/chars", { remove: c.id });
    if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true);
    A.load(["chars", "board"]);
  }
  async function generate(c, description) {
    if (!description.trim()) return A.toast("Ghi mô tả nhân vật trước (tiếng Anh cho agent)", true);
    if (!confirm(`Sinh sheet 4 góc cho ${c.name} (tốn 1 ảnh quota)?`)) return;
    const r = await A.send("/api/anime/chars", { generate: { id: c.id, description } });
    if (r.status !== 200) return A.toast(r.error ?? `Lỗi ${r.status}`, true);
    A.follow("sheet", r.job, { onEnd: (j) => { A.toast(j.job.code === 0 ? `Đã có sheet của ${c.name}` : `Không sinh được sheet (exit ${j.job.code})`, j.job.code !== 0); A.load(["chars", "board"]); } });
  }

  const rows = list.map((c) => {
    const desc = { value: c.notes ?? "" };
    return h("div", { class: "card anime-char" },
      c.sheet && c.exists ? h("img", { src: A.src(c.sheet), alt: `Sheet ${c.name}`, loading: "lazy" }) : h("div", { class: "anime-noimg" }, "chưa có sheet"),
      h("div", { class: "row" }, h("strong", {}, c.name), h("span", { class: "muted" }, c.id),
        h("span", { class: "anime-swatch", title: `Màu nền ${c.key_color}`, style: { background: c.key_color } }),
        ...(c.palette ?? []).map((p) => h("span", { class: "anime-swatch small", title: p, style: { background: p } })),
        c.unregistered ? h("span", { class: "anime-tag" }, "chưa trong thư viện") : null),
      c.sheet ? h("small", { class: "muted" }, c.sheet) : null,
      c.notes ? h("p", {}, c.notes) : null,
      h("details", {}, h("summary", {}, "Sinh sheet 4 góc"),
        h("textarea", { rows: 3, value: desc.value, placeholder: "young swordsman, green hair, three katanas, white shirt", oninput: (e) => { desc.value = e.target.value; } }),
        h("button", { class: "btn", disabled: running || c.unregistered, title: c.unregistered ? "Lưu vào thư viện trước" : "", onclick: () => generate(c, desc.value) }, "Sinh sheet")),
      h("div", { class: "row" },
        c.unregistered ? h("button", { class: "btn primary", onclick: () => save({ id: c.id, name: c.name, sheet: c.sheet, key_color: c.key_color }) }, "Lưu vào thư viện")
          : h("button", { class: "btn", onclick: () => { A.charForm = { ...c, palette: (c.palette ?? []).join(", "), sheet: c.sheet ?? "" }; A.paint(); } }, "Sửa"),
        c.unregistered ? null : h("button", { class: "btn", onclick: () => remove(c) }, "Bỏ")));
  });

  const set = (k) => (e) => { edit[k] = e.target.value; };
  const form = h("section", { class: "group" }, h("h3", {}, edit.id && list.some((c) => c.id === edit.id && !c.unregistered) ? `Sửa ${edit.id}` : "Thêm nhân vật"),
    h("label", { class: "anime-field" }, h("span", {}, "Id (chữ thường, số, -)"), h("input", { type: "text", value: edit.id, oninput: set("id") })),
    h("label", { class: "anime-field" }, h("span", {}, "Tên"), h("input", { type: "text", value: edit.name, oninput: set("name") })),
    h("label", { class: "anime-field" }, h("span", {}, "Màu nền tách (không dùng xanh lá nếu nhân vật có màu xanh lá)"), h("input", { type: "color", value: edit.key_color, oninput: set("key_color") })),
    h("label", { class: "anime-field" }, h("span", {}, "Bảng màu (#RRGGBB, cách nhau bằng dấu phẩy)"), h("input", { type: "text", value: edit.palette, oninput: set("palette") })),
    h("label", { class: "anime-field" }, h("span", {}, "Sheet (đường trong dự án, có thể để trống)"), h("input", { type: "text", value: edit.sheet, placeholder: "assets/chars/<id>-sheet.png", oninput: set("sheet") })),
    h("label", { class: "anime-field" }, h("span", {}, "Ghi chú, mô tả"), h("textarea", { rows: 3, value: edit.notes, oninput: set("notes") })),
    h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => save({ ...edit, palette: edit.palette.split(",").map((x) => x.trim()).filter(Boolean), sheet: edit.sheet.trim() || null }) }, "Lưu")));

  return [
    list.length ? h("div", { class: "anime-chars" }, ...rows) : h("div", { class: "empty" }, h("p", {}, "Chưa có nhân vật. Thêm một nhân vật rồi sinh sheet 4 góc, hoặc đặt sẵn assets/chars/<id>-sheet.png.")),
    job ? h("pre", { class: "anime-log" }, (job.log ?? []).filter((l) => !l.startsWith("RESULT ")).slice(-8).join("\n") || "đang chờ…") : null,
    form,
  ];
}
