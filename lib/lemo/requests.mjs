// lib/lemo/requests.mjs — the director requests Studio queues for code-made film styles. Pure
// functions returning Vietnamese text. Paths are passed in; a style guide's text is never pasted
// in, the director reads the file and treats it as material. The shared rules come from the
// canvas-layer contract (window.lemoRender(t, win), Vietnamese text in the DOM) and from
// lemo-opuscar's DIRECTOR.md §12 (github.com/lemomo-ai/lemo-opuscar, MIT).
const MAX_NOTE = 2000;
const one = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
const note = (s) => String(s ?? "").trim().slice(0, MAX_NOTE);

export const RULES = [
  "Chủ đề, lời và nhịp là của dự án này. Chỉ học ngữ pháp hình ảnh trong STYLE.md; không chép câu chuyện, cảnh, nhân vật hay thẻ kết của phim mẫu.",
  "Mọi chữ tiếng Việt nằm ở lớp DOM, dùng phông Be Vietnam Pro, và đi qua cổng viet-pro như mọi lời khác.",
  "Hình là hàm thuần của t: không Math.random, Date hay performance.now; mốc thời gian đặt theo tỉ lệ độ dài của shot.",
  "Xong thì chạy kiểm của dự án (npm run check) và sửa hết lỗi trước khi báo xong.",
];
const rules = () => ["Luật:", ...RULES.map((r) => `- ${r}`)].join("\n");
const label = (s) => (s.ten && s.ten !== s.slug ? `${one(s.ten)} (${s.slug})` : s.slug);

// The canvas layer was added; next is the "next:" line the add command printed.
export function layerScene({ slug, ten, next, shot = null }) {
  const head = shot
    ? `Phong cách ${label({ slug, ten })} đã được thêm thành lớp canvas. Chỉ dùng nó cho shot ${one(shot)}: trong window.lemoRender(t, win) chỉ vẽ khi t nằm trong win["${one(shot)}"], ngoài khoảng đó trả canvas trống. Giữ nguyên các shot khác.`
    : `Phong cách ${label({ slug, ten })} đã được thêm thành lớp canvas cho cả dự án. Viết scene cho brief của dự án, mỗi shot một khoảng trong win.`;
  return [head, next ? `Bước tiếp theo mà lệnh thêm lớp đã in: ${one(next)}` : "Đọc STYLE.md của phong cách này rồi viết scene trong assets/lemo/.", rules()].join("\n\n");
}

export function grammarProject({ slug, ten, guide }) {
  return [
    `Dựng cả dự án theo ngữ pháp của phong cách ${label({ slug, ten })}. Đọc STYLE.md ở ${guide}.`,
    "Dựng bằng chính composition HyperFrames của dự án (GSAP, DOM, canvas trong index.html). Không thêm bộ render khác, không đổi BRIEF.md.",
    rules(),
  ].join("\n\n");
}

export function grammarShot({ slug, ten, guide, shot }) {
  return [
    `Dựng lại riêng shot ${one(shot)} theo ngữ pháp của phong cách ${label({ slug, ten })}. Đọc STYLE.md ở ${guide}.`,
    `Chỉ sửa shot ${one(shot)}, giữ nguyên các shot khác và thời lượng của shot. Dựng bằng composition HyperFrames của dự án, không đổi BRIEF.md.`,
    rules(),
  ].join("\n\n");
}

// base: { slug, ten, guide } or null for a blank page; myGuide: the library's MY-STYLES.md.
export function draftStyle({ base = null, myGuide, title = "", description = "" }) {
  const start = base
    ? `Tạo một phong cách riêng bằng cách đổi phong cách ${label(base)} của thư viện. Đọc toàn bộ STYLE.md gốc ở ${base.guide} trước câu hỏi đầu tiên.`
    : "Tạo một phong cách riêng từ trang trắng. Câu hỏi đầu tiên là chọn phong cách nền kỹ thuật gần nhất trong thư viện, kèm lý do một dòng.";
  return [
    start,
    `Làm theo quy trình ở ${myGuide}, với các thay đổi sau:`,
    [
      "- Hỏi người dùng từng câu bằng thẻ hỏi của Studio (studio_ask), tối đa khoảng mười câu, mỗi câu có đề xuất của bạn.",
      "- Làm mọi file trong thư mục lemo-style/ của dự án: style.json (slug, en, cn, based_on, borrows, created, line), STYLE.md, CHANGES.md. DEMO.md và demo/ nếu làm phim thử.",
      "- Chụp một khung phong cách từ composition của dự án vào lemo-style/ dưới dạng PNG, chạy đúng một lần với một mốc, ví dụ npx hyperframes snapshot . --at <giây> --no-end --no-browser-gpu -o lemo-style. Không cần đổi tên hay đổi định dạng: Studio tự chuyển thành styleframe.jpg khi người dùng bấm Giữ phong cách. Không dùng cp hay mv.",
      "- Slug không được trùng phong cách nào của thư viện.",
      "- Không tự chép ra ngoài dự án. Người dùng tự bấm \"Giữ phong cách\" trong Studio khi đã ưng.",
    ].join("\n"),
    title ? `Tên người dùng muốn: ${one(title).slice(0, 120)}` : null,
    description ? `Người dùng mô tả:\n${note(description)}` : null,
    rules(),
  ].filter(Boolean).join("\n\n");
}

// The add command exited 3: index.html has not the four empty markers of the canvas layer.
export function insertMarkers({ slug }) {
  return [
    `index.html của dự án thiếu dấu của lớp canvas nên chưa thêm được phong cách ${one(slug)}. Chèn bốn dấu rỗng, không viết gì giữa chúng:`,
    [
      "- <!-- LEMO-LAYER:BEGIN --> và <!-- LEMO-LAYER:END --> bên trong <div id=\"bg\">;",
      "- /* LEMO:BEGIN */ và /* LEMO:END */ ngay sau khối WINDOWS.forEach của script timeline.",
    ].join("\n"),
    "Không đổi gì khác. Chạy npm run check rồi báo xong; người dùng sẽ bấm áp lại phong cách.",
  ].join("\n\n");
}
