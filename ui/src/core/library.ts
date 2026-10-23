// Port of public/panels.js:39-73; behaviour unchanged.
// The four sections of the Thư viện mẫu share one search box and page through GET /api/library.
// use(row) is the request text sent to the director; copy(row) what "Chép" puts on the clipboard.
// No React, so Node runs it directly.
import { clip } from "./ui-format.ts";

export { nfmt } from "./ui-format.ts";

export const LIB_EXCERPT = 1500;
export const promptExcerpt = (p: unknown): string => (p ? `\nPrompt gốc (trích):\n${clip(p, LIB_EXCERPT)}` : "");

export type LibKind = "videos" | "scenes" | "styles" | "prompts";
export const LIB_KINDS: readonly LibKind[] = ["videos", "scenes", "styles", "prompts"];

export interface LibExample { id: string; title?: string; has_thumb?: boolean }
export interface LibLink { label?: string; url?: string }

// One row of GET /api/library (lib/library.mjs). The four kinds share one flat shape: each card
// reads only its own fields.
export interface LibRow {
  id: string;
  source?: string;
  source_label?: string;
  has_thumb?: boolean;
  // videos
  title_vi?: string;
  titles?: { en?: string; zh?: string };
  author?: string;
  url?: string;
  prompt?: string;
  prompt_en?: string;
  prompt_partial?: boolean;
  vi?: { what?: string; why?: string; how?: string } | null;
  category?: string;
  featured?: boolean;
  metrics?: { bookmarks?: number } | null;
  desc?: string;
  summary_zh?: string;
  links?: LibLink[];
  // scenes
  name?: string;
  what?: string;
  when?: string;
  prompt_hint?: string;
  seams?: string[];
  examples?: LibExample[];
  // styles
  recipe?: string;
  recipe_vi?: string;
  name_en?: string;
  // prompts
  title?: string;
  structure?: string;
  adapt?: string;
  kind_vi?: string;
  template?: boolean;
  [k: string]: unknown;
}

export interface LibCategory { id: string; vi?: string }
export interface LibSource { repo: string; url: string; license: string }
export interface LibToolkit {
  source?: string;
  workflow?: { title: string; text: string }[];
  vocabulary?: { term: string; when: string; say: string; say_vi?: string }[];
  checklist?: string[];
}
export interface LibPage {
  items: LibRow[];
  total: number;
  offset: number;
  categories?: LibCategory[];
  toolkit?: LibToolkit | null;
  sources?: LibSource[];
}

export interface LibSection {
  label: string;
  placeholder: string;
  copyLabel: string;
  title(row: LibRow): string;
  copy(row: LibRow): string | undefined;
  use(row: LibRow): string;
}

export const LIBRARY: Record<LibKind, LibSection> = {
  videos: {
    label: "Video mẫu", placeholder: "Từ khoá: logo, biểu đồ, ra mắt, 3D…", copyLabel: "Chép prompt",
    title: (v) => v.title_vi ?? v.titles?.en ?? v.titles?.zh ?? v.id,
    copy: (v) => v.prompt,
    use: (v) => `Lấy cảm hứng từ video mẫu "${LIBRARY.videos.title(v)}" (@${v.author ?? "?"}, ${v.url ?? ""}) cho dự án này. ${v.vi ? `Học theo: ${v.vi.why} ${v.vi.how}` : ""} Giữ nội dung, lời và nhịp của dự án.${promptExcerpt(v.prompt)}`,
  },
  scenes: {
    label: "Cảnh mẫu", placeholder: "Từ khoá: chữ động, HUD, biến hình…", copyLabel: "Chép gợi ý",
    title: (t) => t.name ?? t.id,
    copy: (t) => t.prompt_hint,
    use: (t) => t.source !== "library"
      ? `Dùng mẫu cảnh ${t.id} (${t.name}) cho dự án này: dựng lại các shot theo hướng cảnh đó, giữ nội dung và lời của dự án.`
      : `Áp kỹ thuật cảnh "${t.name}" vào những shot hợp của dự án này: ${t.what} Gợi ý cho prompt: ${t.prompt_hint ?? ""}. Giữ nội dung, lời và nhịp.`,
  },
  styles: {
    label: "Phong cách", placeholder: "Ví dụ: tối giản, neon, pixel, 3D…", copyLabel: "Chép công thức",
    title: (s) => s.name ?? s.id,
    copy: (s) => s.recipe ?? s.what,
    use: (s) => s.source !== "library"
      ? `Áp phong cách ${s.id} (${s.name}) cho dự án này: đổi màu, chữ và chuyển động theo phong cách đó, giữ nội dung, lời và nhịp.`
      : `Áp phong cách "${s.name}" cho dự án này: đổi màu, chữ và chuyển động theo công thức sau, giữ nội dung, lời và nhịp.\n${s.recipe}`,
  },
  prompts: {
    label: "Prompt mẫu", placeholder: "Từ khoá: mẫu điền, ra mắt, beat…", copyLabel: "Chép prompt",
    title: (p) => p.title ?? p.id,
    copy: (p) => p.prompt,
    use: (p) => `Viết lại yêu cầu cho dự án này theo cấu trúc của prompt mẫu "${p.title}": ${p.structure} Giữ nội dung, lời và nhịp của dự án.${promptExcerpt(p.prompt)}`,
  },
};

// The query string of one page (panels.js page()): cat and featured only for videos.
export function libraryParams(kind: LibKind, q: string, offset: number, cat: string, featured: boolean): Record<string, string> {
  const p: Record<string, string> = { kind, q, offset: String(offset) };
  if (kind === "videos" && cat) p.cat = cat;
  if (kind === "videos" && featured) p.featured = "1";
  return p;
}

// What the library route answered, narrowed: a page without items reads as an empty page.
export function asLibPage(r: unknown): LibPage {
  const o = (r && typeof r === "object" ? r : {}) as Partial<LibPage>;
  const items = Array.isArray(o.items) ? o.items : [];
  return {
    items,
    total: Number(o.total) || 0,
    offset: Number(o.offset) || 0,
    categories: Array.isArray(o.categories) ? o.categories : undefined,
    toolkit: o.toolkit ?? null,
    sources: Array.isArray(o.sources) ? o.sources : [],
  };
}
