// lib/library.mjs — the Thư viện mẫu: library/library.json (scripts/build-library.mjs) plus the
// provider's scene directions (tagged source: provider id, source_label: its label), searched in Vietnamese or English without accents.
// The provider's style profiles are listed and applied in the Phong cách tab (lib/lemo/catalog.mjs), not here.
// Cover images live outside the repo in thumbDir() (scripts/library-thumbs.mjs downloads them).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LIBRARY_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "library", "library.json");
export const KINDS = ["videos", "scenes", "styles", "prompts"];
export const PAGE = 24;
const THUMB = /^(\d+)\.(jpg|jpeg|png|webp|gif)$/;

export const thumbDir = (env = process.env) => env.MOTION_STUDIO_THUMBS || join(homedir(), ".cache", "motion-studio", "library", "thumbs");

// Lowercase, no Vietnamese accents, đ as d: "Cảnh" and "canh" match.
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

// Every word of the query must appear somewhere in the item's text.
export const matches = (text, q) => fold(q).split(/\s+/).filter(Boolean).every((w) => text.includes(w));

const cache = new Map(); // key → { stamp, value }
function memo(key, stamp, make) {
  const c = cache.get(key);
  if (c && c.stamp === stamp) return c.value;
  const value = make();
  cache.set(key, { stamp, value });
  return value;
}
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

// The thumbnails on disk, id → file name.
export function thumbs(dir = thumbDir()) {
  return memo(`thumbs:${dir}`, mtime(dir), () => {
    const m = new Map();
    if (existsSync(dir)) for (const f of readdirSync(dir)) { const x = f.match(THUMB); if (x) m.set(x[1], f); }
    return m;
  });
}

export function thumbFile(id, dir = thumbDir()) {
  const f = /^\d+$/.test(String(id)) ? thumbs(dir).get(String(id)) : null;
  return f ? join(dir, f) : null;
}

function readLibrary(file) {
  return memo(`lib:${file}`, mtime(file), () => {
    if (!existsSync(file)) return { videos: [], styles: [], techniques: [], prompts: [], categories: [], sources: [], toolkit: null };
    const lib = JSON.parse(readFileSync(file, "utf8"));
    for (const v of lib.videos) v._text = fold([v.id, v.title_vi, v.titles?.en, v.titles?.zh, v.author, v.category, v.style, v.kind, ...(v.tags ?? []), v.vi?.what, v.vi?.why, v.desc, String(v.prompt ?? "").slice(0, 1500)].join(" "));
    return lib;
  });
}

function providerDirections(file, src) {
  if (!file || !existsSync(file)) return [];
  return memo(`dir:${file}:${src.id}`, mtime(file), () => (JSON.parse(readFileSync(file, "utf8")).directions ?? []).map((x) => ({ id: x.id, source: src.id, source_label: src.label, name: x.ten_vi ?? x.id, what: x.mo_ta_vi ?? "", seams: x.seams ?? [] })));
}

// One page of a library section. Videos come with has_thumb; scenes, styles and prompts carry
// their example videos as { id, title, has_thumb }. A template of Studio's own (no video) keeps its
// own author and url, the credit of the work it is drawn from. source { id, label } names the provider of
// directionsFile; without it only the library's own items are listed.
export function query({ kind = "videos", q = "", cat = "", featured = false, offset = 0, limit = PAGE } = {}, { file = LIBRARY_FILE, thumbsDir = thumbDir(), directionsFile = null, source = null } = {}) {
  if (!KINDS.includes(kind)) throw Object.assign(new Error(`kind là một trong ${KINDS.join(", ")}`), { status: 400 });
  const lib = readLibrary(file);
  const th = thumbs(thumbsDir);
  const byId = new Map(lib.videos.map((v) => [v.id, v]));
  const example = (id) => { const v = byId.get(id); return v ? { id, title: v.title_vi ?? v.titles?.en ?? v.titles?.zh ?? id, has_thumb: th.has(id) } : null; };
  const examples = (ids) => (ids ?? []).map(example).filter(Boolean);
  const text = (...xs) => fold(xs.flat().filter(Boolean).join(" "));
  let rows;
  if (kind === "videos") {
    rows = lib.videos.filter((v) => (!cat || v.category === cat) && (!featured || v.featured) && (!q || matches(v._text, q)))
      .map(({ _text, thumbs: urls, ...v }) => ({ ...v, has_thumb: th.has(v.id) }));
  } else if (kind === "scenes") {
    const tech = lib.techniques.map((t) => ({ ...t, source: "library", examples: examples(t.examples), _t: text(t.id, t.name, t.what, t.when, t.prompt_hint, t.tags) }));
    const dirs = (source ? providerDirections(directionsFile, source) : []).map((d) => ({ ...d, examples: [], _t: text(d.id, d.name, d.what, d.seams) }));
    rows = [...tech, ...dirs].filter((r) => !q || matches(r._t, q)).map(({ _t, ...r }) => r);
  } else if (kind === "styles") {
    const recipes = lib.styles.map((s) => ({ id: s.id, source: "library", name: s.vi?.name ?? s.en, name_en: s.en, what: s.vi?.what ?? "", when: s.vi?.when ?? "", recipe: s.recipe, recipe_vi: s.vi?.recipe_vi ?? "", examples: examples(s.examples) }));
    rows = recipes.filter((s) => !q || matches(text(s.id, s.name, s.name_en, s.what, s.when, s.recipe), q));
  } else {
    rows = lib.prompts.map((p) => {
      const v = byId.get(p.id);
      return { ...p, author: v?.author ?? p.author, url: v?.url ?? p.url, prompt: p.template ?? v?.prompt ?? "", prompt_partial: Boolean(v?.prompt_partial), metrics: v?.metrics, has_thumb: th.has(p.id) };
    }).filter((p) => !q || matches(text(p.title, p.kind_vi, p.what, p.structure, p.adapt, p.prompt.slice(0, 1500)), q));
  }
  const start = Math.max(0, Number(offset) || 0);
  const n = Math.min(Math.max(1, Number(limit) || PAGE), 100);
  return {
    kind, total: rows.length, offset: start, items: rows.slice(start, start + n),
    ...(kind === "videos" ? { categories: lib.categories } : {}),
    ...(kind === "prompts" && start === 0 ? { toolkit: lib.toolkit } : {}),
    sources: lib.sources,
  };
}
