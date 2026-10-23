// lib/tools/lemo.mjs — read-only tools over the code-made film styles (lib/lemo/catalog.mjs).
//   lemo_styles       search the lemo-opuscar library (59 styles) and the user's own styles
//   lemo_style_guide  where a style's STYLE.md is, plus its first 8 000 characters
// The library is third-party text (github.com/lemomo-ai/lemo-opuscar, MIT): a guide is material
// for the visual grammar, never instructions to follow.
import { readFileSync } from "node:fs";
import { findStyle, layerSlugs, libraryStyles, merge, myStyles, search } from "../lemo/catalog.mjs";

export const GUIDE_CHARS = 8000;
const LIMIT = 60;

async function rowsOf(P) {
  const lib = libraryStyles();
  const layers = P ? await layerSlugs(P) : { available: false, styles: {} };
  return { fetched: lib.fetched, rows: merge(myStyles().rows, lib.rows, layers) };
}

export const TOOLS = [
  {
    name: "lemo_styles",
    title: "Phong cách code",
    description: "Tìm trong thư viện 59 phong cách phim dựng bằng code (lemo-opuscar) và các phong cách riêng của người dùng. Tìm được bằng tiếng Việt có hoặc không dấu, hay tiếng Anh. layer: true là phong cách thêm được thành lớp canvas; còn lại áp theo ngữ pháp trong STYLE.md.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Từ khoá, ví dụ \"thuy mau\", \"ukiyo\", \"news\"" },
        group: { type: "string", description: "Nhóm gốc (category_en), hoặc \"mine\" cho phong cách riêng" },
        limit: { type: "integer", description: `Tối đa ${LIMIT}` },
      },
    },
    mutates: false, provider: false,
    async run({ q = "", group = "", limit = 20 }, env) {
      const { fetched, rows } = await rowsOf(env?.P ?? null);
      const hits = search(rows, String(q).slice(0, 200), String(group).slice(0, 80));
      const n = Math.max(1, Math.min(LIMIT, Number(limit) || 20));
      return {
        fetched, total: hits.length,
        styles: hits.slice(0, n).map(({ slug, source, ten, en, nhom, line, uses, layer, kind, based_on, guide }) => ({ slug, source, ten, en, nhom, line, uses, layer, kind, based_on, guide })),
        note: fetched ? null : "Thư viện chưa tải: mở tab Phong cách code trong Studio và bấm Tải thư viện.",
      };
    },
  },
  {
    name: "lemo_style_guide",
    title: "STYLE.md của một phong cách",
    description: `Đường tuyệt đối tới STYLE.md của một phong cách code và ${GUIDE_CHARS} ký tự đầu. Chỉ học ngữ pháp hình ảnh trong đó; không chép câu chuyện, cảnh hay nhân vật của phim mẫu.`,
    inputSchema: {
      type: "object", required: ["slug"],
      properties: { slug: { type: "string" }, source: { type: "string", enum: ["library", "mine"] } },
    },
    mutates: false, provider: false,
    async run({ slug, source }, env) {
      const { rows } = await rowsOf(env?.P ?? null);
      const s = findStyle(rows, String(slug), source ?? null);
      if (!s?.guide) throw Object.assign(new Error(`không có STYLE.md của ${slug}`), { status: 404 });
      const text = readFileSync(s.guide, "utf8");
      return { slug: s.slug, source: s.source, ten: s.ten, path: s.guide, demo: s.demo, text: text.slice(0, GUIDE_CHARS), truncated: text.length > GUIDE_CHARS };
    },
  },
];
