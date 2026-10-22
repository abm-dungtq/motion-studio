#!/usr/bin/env node
// scripts/build-library.mjs — builds library/library.json, the Thư viện mẫu of Studio, from public
// lists of Claude Opus 5.5 videos and prompts, plus the Vietnamese text in library/vi/.
//   node scripts/build-library.mjs --src <dir> [--out library/library.json] [--candidates <file>]
// <dir> holds one clone per source in SOURCES, named owner_repo, checked out at the pinned commit
// (a different commit stops the build). Nothing inside a clone is run; only its data files are read.
// Videos are merged by the id of their X post. Each keeps every title, its prompt (the longest full
// one; prompts belong to their authors and keep author and link), category, tags, metrics and the
// image URLs scripts/library-thumbs.mjs downloads.
// library/vi/: titles.json { id: "tên" } · videos.json { id: { title, what, why, how } } (the
// featured videos) · styles.json · techniques.json · prompts.json · toolkit.json.
// --candidates writes the videos without Vietnamese text, ranked for curation, as JSON.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "motion-studio/library@1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_MAX = 12000;

export const SOURCES = {
  yihui: { repo: "yihui-dev/awesome-opus5-5-videos", commit: "92aee2f", license: "MIT" },
  chus: { repo: "chuspeeism/awesome-opus-5-5-videos", commit: "028bc52", license: "MIT" },
  hiapi: { repo: "HiAPIAI/awesome-opus-5-5-video-styles", commit: "b1a796c", license: "CC-BY-4.0" },
  lievan: { repo: "Li-Evan/awesome-opus-5.5-video-prompts", commit: "7f73121", license: "CC-BY-4.0" },
  phy: { repo: "PHY041/claude-motion-playbook", commit: "e056bf9", license: "CC-BY-4.0" },
  xray: { repo: "X-RayLuan/awesome-opus-5-5-video-prompts", commit: "b952455", license: "MIT (tài liệu và công cụ của repo; nội dung bên thứ ba giữ quyền của tác giả)" },
};

// One Vietnamese category for every source's own scheme.
export const CATEGORIES = [
  { id: "motion", vi: "Motion và showreel" },
  { id: "launch", vi: "Ra mắt sản phẩm" },
  { id: "explainer", vi: "Giải thích và dữ liệu" },
  { id: "3d", vi: "3D và không gian" },
  { id: "interactive", vi: "Tương tác và game" },
  { id: "story", vi: "Kể chuyện và âm nhạc" },
];
const CAT = {
  motion: "motion", "3d": "3d", explainer: "explainer", interactive: "interactive",
  "叙事与音乐": "story", "品牌与产品": "launch", "动效与片头": "motion", "知识与教学": "explainer", "三维与空间": "3d",
  launch: "launch", showreel: "motion", story: "story", history: "explainer", music: "story", self: "motion", worlds: "3d", remix: "motion",
  "product-launch-film": "launch", "showreel-montage": "motion", "explainer-data-viz": "explainer", "saas-ui-walkthrough": "launch",
  "kinetic-typography": "motion", "character-story-animation": "story", "social-ad-vertical": "launch", "3d-world-scene": "3d",
  "personal-intro-reel": "motion", "generative-abstract": "motion", "logo-brand-ident": "launch",
  productui: "launch", cinematic3d: "3d", lowpoly: "3d", typography: "motion", cartoon: "story", handdrawn: "story", collage: "story",
  pixel: "interactive", generative: "motion", retro: "motion", photoreal: "3d",
};

export const postId = (url) => String(url ?? "").match(/status(?:es)?\/(\d+)/)?.[1] ?? null;
const list = (d) => (Array.isArray(d) ? d : Object.values(d).find(Array.isArray) ?? []);
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);
const clean = (s) => String(s ?? "").trim();
const unpublished = (p) => !p || /原帖未公开|未公开完整提示词|not (?:shared|public)/i.test(p.slice(0, 80));

// Merge records of the same post. Each source adds what it has; the first category and non-empty
// title win, and the longest full prompt wins.
export function merge(records) {
  const by = new Map();
  for (const r of records) {
    if (!r.id) continue;
    const v = by.get(r.id) ?? { id: r.id, titles: {}, sources: [], tags: [], thumbs: [], links: [] };
    by.set(r.id, v);
    if (!v.sources.includes(r.source)) v.sources.push(r.source);
    for (const k of ["en", "zh"]) if (!v.titles[k] && clean(r.titles?.[k])) v.titles[k] = clean(r.titles[k]);
    v.author ??= r.author || undefined;
    v.url ??= r.url;
    v.category ??= CAT[r.category];
    for (const t of r.tags ?? []) if (!v.tags.includes(t)) v.tags.push(t);
    for (const t of r.thumbs ?? []) if (t && !v.thumbs.includes(t)) v.thumbs.push(t);
    for (const l of r.links ?? []) if (!v.links.some((x) => x.url === l.url)) v.links.push(l);
    if (r.style) v.style ??= r.style;
    if (r.kind) v.kind ??= r.kind;
    if (r.techniques?.length) v.techniques ??= r.techniques;
    if (r.summary_zh) v.summary_zh ??= r.summary_zh;
    if (r.desc) v.desc ??= r.desc;
    if (r.metrics) v.metrics = { ...r.metrics, ...v.metrics };
    if (r.likes && !(v.metrics?.likes >= r.likes)) v.metrics = { ...v.metrics, likes: r.likes };
    const p = clean(r.prompt);
    if (!unpublished(p)) {
      const full = !r.partial;
      const better = !v.prompt || (full && v.prompt_partial) || (full === !v.prompt_partial && p.length > v.prompt.length);
      if (better) Object.assign(v, { prompt: p.slice(0, PROMPT_MAX), prompt_partial: !full || p.length > PROMPT_MAX, prompt_from: r.source });
    }
    if (clean(r.prompt_en) && !v.prompt_en) v.prompt_en = clean(r.prompt_en).slice(0, PROMPT_MAX);
  }
  return [...by.values()];
}

// Ranking for curation: saves and views where a list has them, how many lists picked it, a full
// prompt and an image.
export function score(v) {
  const m = v.metrics ?? {};
  return Math.log10(1 + (m.bookmarks ?? 0)) * 2 + Math.log10(1 + (m.likes ?? 0)) + Math.log10(1 + (m.views ?? 0)) * 0.5
    + v.sources.length * 1.5 + (v.prompt && !v.prompt_partial ? 2 : 0) + (v.thumbs.length ? 1 : 0);
}

function read(src) {
  const at = (key, ...p) => join(src, SOURCES[key].repo.replace("/", "_"), ...p);
  for (const [key, s] of Object.entries(SOURCES)) {
    const head = execFileSync("git", ["-C", at(key), "rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
    if (head !== s.commit) throw new Error(`${s.repo} đang ở ${head}, cần ${s.commit}`);
  }
  const raw = (key, path) => `https://raw.githubusercontent.com/${SOURCES[key].repo}/${SOURCES[key].commit}/${path}`;
  const out = [];
  for (const r of list(JSON.parse(readFileSync(at("yihui", "data", "videos.json"), "utf8"))))
    out.push({ source: "yihui", id: postId(r.post_url), url: r.post_url, author: r.author, category: r.category, tags: r.tech_tags, prompt: r.prompt, partial: r.prompt_partial, thumbs: [r.poster_url] });
  const lv = JSON.parse(readFileSync(at("lievan", "site", "data.json"), "utf8"));
  for (const r of lv.entries)
    out.push({ source: "lievan", id: postId(r.url), url: r.url, author: r.author, category: r.category, titles: { en: r.title, zh: r.title_zh }, tags: r.tools, kind: r.kind, metrics: r.metrics, prompt: r.prompt, prompt_en: r.prompt_lang !== "en" ? r.prompt_en : null, thumbs: [r.media?.thumb], desc: r.description });
  const hi = JSON.parse(readFileSync(at("hiapi", "data", "cases.json"), "utf8"));
  for (const r of hi.cases) {
    const still = `assets/stills/${r.id}.jpg`;
    out.push({ source: "hiapi", id: postId(r.post_url), url: r.post_url, author: r.author, category: r.style, titles: { en: r.title_en, zh: r.title_zh }, style: r.style, likes: r.likes_2026_09_29, prompt: r.prompt, partial: r.prompt_partial, thumbs: existsSync(at("hiapi", still)) ? [raw("hiapi", still)] : [] });
  }
  for (const r of list(JSON.parse(readFileSync(at("phy", "catalog", "catalog.json"), "utf8"))))
    out.push({ source: "phy", id: postId(r.post_url), url: r.post_url, author: String(r.handle ?? "").replace(/^@/, ""), category: r.category, titles: { en: r.title }, tags: r.tags, techniques: r.techniques, summary_zh: r.summary_zh });
  for (const r of list(JSON.parse(readFileSync(at("xray", "data", "entries.json"), "utf8"))))
    out.push({ source: "xray", id: postId(r.post), url: r.post, author: r.handle, category: r.cat, titles: { en: r.title, zh: r.title_zh }, desc: r.desc, links: (r.links ?? []).map(([label, url]) => ({ label, url })) });
  for (const r of list(JSON.parse(readFileSync(at("chus", "data", "cases.json"), "utf8"))))
    out.push({ source: "chus", id: postId(r.sourceUrl), url: r.sourceUrl, author: r.sourceAuthor, category: r.category, titles: { zh: r.title }, summary_zh: r.summary, prompt: r.prompt });
  // The source read first wins a video's category and titles: the most specific schemes first.
  const order = ["lievan", "phy", "hiapi", "xray", "chus", "yihui"];
  out.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
  return { records: out, hiStyles: hi.styles, toolkit: lv.toolkit, lvKinds: lv.kinds };
}

export function build({ records, hiStyles }, vi) {
  const videos = merge(records).map((v) => {
    const f = vi.videos[v.id];
    return {
      ...v, category: v.category ?? "motion",
      title_vi: f?.title ?? vi.titles[v.id] ?? null,
      vi: f ? { what: f.what, why: f.why, how: f.how } : null,
      featured: Boolean(f),
    };
  }).sort((a, b) => b.featured - a.featured || score(b) - score(a));
  const ids = new Set(videos.map((v) => v.id));
  const examples = (pred) => videos.filter(pred).slice(0, 8).map((v) => v.id);
  const styles = hiStyles.map((s) => ({ id: s.id, en: s.en, recipe: s.recipe, vi: vi.styles[s.id] ?? null, examples: examples((v) => v.style === s.id) }));
  const techniques = Object.entries(vi.techniques).map(([id, t]) => ({ id, ...t, examples: examples((v) => (t.tags ?? []).some((g) => v.tags.includes(g))) }));
  // Templates of Motion Studio's own (ids that are not post ids) first, then by saves.
  const saves = (id) => byId.get(id)?.metrics?.bookmarks ?? 0;
  const byId = new Map(videos.map((v) => [v.id, v]));
  const prompts = Object.entries(vi.prompts).filter(([id]) => ids.has(id) || !/^\d+$/.test(id)).map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => /^\d+$/.test(a.id) - /^\d+$/.test(b.id) || saves(b.id) - saves(a.id));
  return {
    schema: SCHEMA,
    sources: Object.values(SOURCES).map((s) => ({ ...s, url: `https://github.com/${s.repo}` })),
    categories: CATEGORIES,
    videos, styles, techniques, prompts, toolkit: Object.keys(vi.toolkit ?? {}).length ? vi.toolkit : null,
  };
}

export function loadVi(dir) {
  const f = (n) => readJson(join(dir, `${n}.json`), {});
  return { titles: f("titles"), videos: f("videos"), styles: f("styles"), techniques: f("techniques"), prompts: f("prompts"), toolkit: f("toolkit") };
}

function sourcesMd(lib) {
  const rows = lib.sources.map((s) => `| ${s.url} | ${s.commit} | ${s.license} |`).join("\n");
  return `# Nguồn của thư viện mẫu\n\n| Repo | Commit | Giấy phép |\n|---|---|---|\n${rows}\n\n`
    + "Video, ảnh và prompt thuộc về tác giả gốc; mỗi mẫu ghi tên tác giả và link bài gốc. Thư viện chỉ trích prompt kèm nguồn và không phân phối lại video. Ảnh bìa được tải về máy người dùng (`scripts/library-thumbs.mjs`), không nằm trong repo.\n\n"
    + "Phần tiếng Việt trong `library/vi/` do Motion Studio viết.\n\n"
    + "Dựng lại: clone từng repo vào một thư mục trống với tên `owner_repo`, checkout đúng commit, rồi chạy `node scripts/build-library.mjs --src <thư mục>`.\n";
}

export async function main(argv = process.argv.slice(2)) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!o.src) { console.error("dùng: node scripts/build-library.mjs --src <dir> [--out library/library.json] [--candidates <file>]"); return 2; }
  const data = read(resolve(o.src));
  const lib = build(data, loadVi(join(ROOT, "library", "vi")));
  const out = resolve(o.out ?? join(ROOT, "library", "library.json"));
  writeFileSync(out, JSON.stringify(lib) + "\n");
  writeFileSync(join(dirname(out), "SOURCES.md"), sourcesMd(lib));
  if (o.candidates) {
    const rest = lib.videos.filter((v) => !v.featured).map((v) => ({ ...v, score: Math.round(score(v) * 100) / 100 }));
    writeFileSync(resolve(o.candidates), JSON.stringify({ toolkit: data.toolkit, kinds: data.lvKinds, styles: data.hiStyles, videos: rest }, null, 1));
  }
  const n = lib.videos.length;
  console.log(`library: ${n} video (${lib.videos.filter((v) => v.featured).length} tuyển chọn, ${lib.videos.filter((v) => v.title_vi).length} có tên tiếng Việt, ${lib.videos.filter((v) => v.thumbs.length).length} có ảnh), ${lib.styles.length} phong cách, ${lib.techniques.length} kỹ thuật, ${lib.prompts.length} prompt mẫu`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
