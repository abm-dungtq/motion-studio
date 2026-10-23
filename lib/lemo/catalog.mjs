// lib/lemo/catalog.mjs — the code-made film styles Studio offers: the lemo-opuscar library
// (lib/lemo/fetch.mjs downloads it) and the user's own styles in $LEMO_MY_STYLES, else
// ~/lemo-my-styles (the folder and shape of lemo-opuscar's MY-STYLES.md, so its own plugin finds
// the same styles). Both are untrusted data: only the fields below are kept, strings are cut to
// 400 characters, uses to 6 items, and a style.json that does not parse is skipped with a warning.
//   libraryStyles(home, { pin, vi }) → { fetched, dir, rows, warnings }
//   myStyles(dir, { vi }) → { dir, rows, warnings }
//   search(rows, q, group) → rows whose text holds every word of q (accents and case ignored)
//   layerSlugs(P, { run }) → { available, styles: { <slug>: { kind } } }: the styles the provider's
//     lemo command lists as "verified", which it can add as a canvas layer
//   merge(mine, library, layers) → own styles first, then the library, with layer and kind set
import { execFile } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fold, matches } from "../library.mjs";
import { PIN, readyDir, cacheHome } from "./fetch.mjs";

export const VI = JSON.parse(readFileSync(new URL("./vi.json", import.meta.url), "utf8"));
export const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
export const MAX_TEXT = 400;
export const MAX_USES = 6;
const JSON_MAX = 64 << 10;
const STR = ["slug", "num", "en", "cn", "category_en", "film", "line", "based_on", "created"];
const NUM = ["frame_sec", "dur"];
const LIST_TTL_MS = 60000;

export const myStylesDir = (source = process.env) => source.LEMO_MY_STYLES || join(homedir(), "lemo-my-styles");

const cut = (s) => String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, MAX_TEXT);

// The kept fields of a parsed style.json; unknown fields are dropped.
export function clean(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of STR) if (typeof raw[k] === "string" || typeof raw[k] === "number") out[k] = cut(raw[k]);
  for (const k of NUM) if (Number.isFinite(Number(raw[k])) && raw[k] !== null && raw[k] !== "") out[k] = Number(raw[k]);
  for (const k of ["uses", "borrows"]) if (Array.isArray(raw[k])) out[k] = raw[k].filter((x) => typeof x === "string").slice(0, MAX_USES).map(cut);
  return out;
}

// A regular file (not a symlink) under maxBytes, as text; else null.
function readSmall(file, maxBytes = JSON_MAX) {
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.size > maxBytes) return null;
    return readFileSync(file, "utf8");
  } catch { return null; }
}
const isFile = (f) => { try { return lstatSync(f).isFile(); } catch { return false; } };

function readStyle(folder, slug, warnings, where) {
  const text = readSmall(join(folder, "style.json"));
  if (text == null) return null;
  let raw;
  try { raw = JSON.parse(text); } catch (e) { warnings.push(`${where}/${slug}/style.json hỏng: ${e.message}`); return null; }
  const s = clean(raw);
  if (s.slug && s.slug !== slug) warnings.push(`${where}/${slug}/style.json ghi slug "${s.slug}", dùng tên thư mục`);
  return { ...s, slug };
}

const groupOf = (en, vi) => ({ nhom: (en && vi.groups[en]) || en || "Khác", group_en: en || "" });

export function libraryStyles(home = cacheHome(), { pin = PIN, vi = VI } = {}) {
  const dir = readyDir(home, pin);
  if (!dir) return { fetched: false, dir: null, rows: [], warnings: [] };
  const warnings = [], rows = [];
  const stylesDir = join(dir, "styles");
  const slugs = existsSync(stylesDir) ? readdirSync(stylesDir).filter((s) => SLUG.test(s)).sort() : [];
  for (const slug of slugs) {
    const s = readStyle(join(stylesDir, slug), slug, warnings, "styles");
    if (!s) continue;
    const guide = join(stylesDir, slug, "STYLE.md");
    rows.push({
      slug, source: "library", ten: vi.styles[slug] || s.en || slug, en: s.en ?? "", cn: s.cn ?? "", ...groupOf(s.category_en, vi),
      line: s.line ?? "", uses: s.uses ?? [], dur: s.dur ?? null, num: s.num ?? null,
      frame: isFile(join(dir, "docs", "frames", `${slug}.jpg`)) ? `/api/lemo/frame/${slug}.jpg` : null,
      film_url: pin.films ? `${pin.films}${slug}.mp4` : null,
      guide: isFile(guide) ? guide : null, demo: isFile(join(stylesDir, slug, "DEMO.md")) ? join(stylesDir, slug, "DEMO.md") : null,
      layer: false, kind: null,
    });
  }
  return { fetched: true, dir, rows, warnings };
}

export function myStyles(dir = myStylesDir(), { vi = VI } = {}) {
  const warnings = [], rows = [];
  let names = [];
  try { names = readdirSync(dir).filter((s) => SLUG.test(s)).sort(); } catch { return { dir, rows, warnings }; }
  for (const slug of names) {
    const folder = join(dir, slug);
    try { if (!lstatSync(folder).isDirectory()) continue; } catch { continue; }
    const s = readStyle(folder, slug, warnings, dir);
    if (!s) continue;
    const frame = ["styleframe.jpg", "test.jpg"].find((f) => isFile(join(folder, f)));
    rows.push({
      slug, source: "mine", ten: s.en || slug, en: s.en ?? "", cn: s.cn ?? "", nhom: "Của bạn", group_en: "mine",
      line: s.line ?? "", uses: s.uses ?? [], dur: s.dur ?? null, based_on: s.based_on ?? null, borrows: s.borrows ?? [], created: s.created ?? null,
      base_ten: s.based_on ? vi.styles[s.based_on] ?? s.based_on : null,
      frame: frame ? `/api/lemo/frame/mine/${slug}.jpg` : null, film_url: null,
      guide: isFile(join(folder, "STYLE.md")) ? join(folder, "STYLE.md") : null, demo: isFile(join(folder, "DEMO.md")) ? join(folder, "DEMO.md") : null,
      layer: false, kind: null,
    });
  }
  return { dir, rows, warnings };
}

const textOf = (r) => fold([r.slug, r.ten, r.en, r.cn, r.nhom, r.group_en, r.line, ...(r.uses ?? []), r.based_on, r.base_ten].filter(Boolean).join(" "));

export function search(rows, q = "", group = "") {
  return rows.filter((r) => (!group || r.group_en === group || (group === "mine" && r.source === "mine")) && (!String(q).trim() || matches(textOf(r), q)));
}

const runList = (cmd) => new Promise((res) => {
  execFile(process.execPath, [cmd, "list", "--json"], { shell: false, encoding: "utf8", timeout: 20000, maxBuffer: 1 << 20 }, (err, stdout) => res(err ? null : stdout));
});
const listCache = new Map(); // command → { at, stamp, value }

// Reads `lemo list --json` defensively: a row without a slug is skipped, a row without status
// "verified" is not a layer style, output that is not a JSON list means no layer styles.
export function parseList(stdout) {
  let rows;
  try { rows = JSON.parse(String(stdout ?? "")); } catch { return {}; }
  if (!Array.isArray(rows)) return {};
  const out = {};
  for (const r of rows) {
    if (typeof r?.slug !== "string" || !SLUG.test(r.slug) || r.status !== "verified") continue;
    out[r.slug] = { kind: r.kind === "3d" ? "3d" : "2d" };
  }
  return out;
}

export async function layerSlugs(P, { run = runList, now = Date.now() } = {}) {
  const cmd = typeof P?.commands?.lemo === "string" ? P.commands.lemo : null;
  if (!cmd || !existsSync(cmd)) return { available: false, styles: {} };
  const stamp = statSync(cmd).mtimeMs;
  const c = listCache.get(cmd);
  if (c && c.stamp === stamp && now - c.at < LIST_TTL_MS) return c.value;
  const value = { available: true, styles: parseList(await run(cmd)) };
  listCache.set(cmd, { at: now, stamp, value });
  return value;
}
export const dropListCache = () => listCache.clear();

export function merge(mine, library, layers = { styles: {} }) {
  const taken = new Set();
  const out = [];
  for (const r of mine) { taken.add(r.slug); out.push(r); }
  for (const r of library) {
    const l = layers.styles?.[r.slug];
    out.push({ ...r, layer: Boolean(l), kind: l?.kind ?? null, shadowed: taken.has(r.slug) || undefined });
  }
  return out;
}

// The 11 groups in the order of vi.json with their counts, own styles first when there are some.
export function groupsOf(rows, vi = VI) {
  const count = new Map();
  for (const r of rows) count.set(r.group_en, (count.get(r.group_en) ?? 0) + 1);
  const out = [];
  if (count.get("mine")) out.push({ id: "mine", ten: "Của bạn", count: count.get("mine") });
  for (const [en, ten] of Object.entries(vi.groups)) if (count.get(en)) out.push({ id: en, ten, count: count.get(en) });
  for (const [en, n] of count) if (en !== "mine" && !vi.groups[en]) out.push({ id: en, ten: en || "Khác", count: n });
  return out;
}

// One style by slug and source ("mine" first when not given), or null.
export function findStyle(rows, slug, source = null) {
  return rows.find((r) => r.slug === slug && (!source || r.source === source)) ?? null;
}
