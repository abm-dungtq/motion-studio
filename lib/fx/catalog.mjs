// lib/fx/catalog.mjs — one list of every transition Studio can offer for a shot, from three
// sources, priority in this order:
//   provider     the seams of the provider's directions file (P.library.directionsFile): the ids
//                its preflight and recipe pack know;
//   studio       the packs of fx/transitions/<id>/fx.json in this repo (recipe, snippet, preview);
//   hyperframes  the "### " sections of <hfSkills>/hyperframes-animation/transitions/css-*.md.
// An id offered by more than one source is one entry: the first source owns id, kind and
// soft; the others add their doc, recipe and preview, and are listed in `sources`. Ids in the
// provider's seam_classes.banned (fade, crossfade, cut, …) never appear, whatever the source.
// Item: { id, name, source, sources, kind, energy, soft, description, doc, recipe, preview,
//         pair_seam, duration, params }; doc and recipe are absolute paths, preview a URL path.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hfSkills } from "../config.mjs";

export const FX_DIR = fileURLToPath(new URL("../../fx/transitions/", import.meta.url));
export const PACK_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const PACK_KINDS = ["shader", "css", "svg", "canvas"];
export const ENERGY = ["em", "vua", "don-dap"];
export const PACK_FILES = ["fx.json", "recipe.md", "snippet.html", "snippet.js", "preview.html"];
export const REQUIRED = ["id", "name_vi", "kind", "description_vi", "params", "duration", "energy", "pair_seam", "source"];
// Slide swaps refused even when no provider is installed (the provider's banned list adds to it).
export const BASE_BANNED = ["fade", "fade-in", "fade-out", "crossfade", "dissolve", "opacity", "none", "cut", "dip", "color-dip"];
// HyperFrames headings that name a provider seam under another title.
const ALIAS = { "staggered-color-blocks": "staggered-blocks" };

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The problems of one fx.json (empty when it is valid), dirName being its folder.
export function validatePack(j, dirName) {
  const errs = [];
  if (!j || typeof j !== "object" || Array.isArray(j)) return ["fx.json phải là object"];
  for (const k of REQUIRED) if (j[k] === undefined || j[k] === null || j[k] === "") errs.push(`thiếu ${k}`);
  if (j.id !== undefined && (!PACK_ID.test(String(j.id)) || j.id !== dirName)) errs.push(`id "${j.id}" phải khớp ${PACK_ID} và trùng tên thư mục ${dirName}`);
  if (j.kind !== undefined && !PACK_KINDS.includes(j.kind)) errs.push(`kind phải là ${PACK_KINDS.join(" | ")}`);
  if (j.duration !== undefined && !(Number.isFinite(j.duration) && j.duration > 0 && j.duration <= 3)) errs.push("duration là số giây trong (0, 3]");
  if (j.energy !== undefined && (!Array.isArray(j.energy) || !j.energy.length || j.energy.some((e) => !ENERGY.includes(e)))) errs.push(`energy là mảng con của ${ENERGY.join(", ")}`);
  if (j.params !== undefined) {
    if (typeof j.params !== "object" || Array.isArray(j.params)) errs.push("params phải là object");
    else for (const [k, p] of Object.entries(j.params)) {
      if (!p || typeof p !== "object" || !["number", "integer", "string", "boolean"].includes(p.type) || p.default === undefined || !p.label_vi) errs.push(`params.${k}: cần type, default, label_vi`);
    }
  }
  return errs;
}

// Studio packs: [{ ...fx.json, dir }]. A pack missing a file or with a bad fx.json throws, so a
// broken pack is found by the test and at startup, not when the user clicks it.
export function studioPacks(dir = FX_DIR) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const d = join(dir, name);
    if (name.startsWith(".") || !statSync(d).isDirectory()) continue;
    const missing = PACK_FILES.filter((f) => !existsSync(join(d, f)));
    if (missing.length) throw new Error(`fx/transitions/${name}: thiếu ${missing.join(", ")}`);
    let j;
    try { j = JSON.parse(readFileSync(join(d, "fx.json"), "utf8")); } catch (e) { throw new Error(`fx/transitions/${name}/fx.json: ${e.message}`); }
    const errs = validatePack(j, name);
    if (errs.length) throw new Error(`fx/transitions/${name}/fx.json: ${errs.join("; ")}`);
    out.push({ ...j, dir: d });
  }
  return out;
}

// HyperFrames CSS transitions: [{ id, name, family, doc }] from the "### " headings of css-*.md.
export function hyperframesTransitions(skills = hfSkills()) {
  const tdir = join(skills, "hyperframes-animation", "transitions");
  if (!existsSync(tdir)) return [];
  const out = [];
  for (const f of readdirSync(tdir).filter((x) => /^css-[a-z0-9-]+\.md$/.test(x)).sort()) {
    let family = null;
    for (const line of readFileSync(join(tdir, f), "utf8").split("\n")) {
      const fam = line.match(/^##\s+(.+?)\s*$/);
      if (fam) { family = fam[1]; continue; }
      const m = line.match(/^###\s+(.+?)\s*$/);
      if (!m) continue;
      const id = ALIAS[slug(m[1])] ?? slug(m[1]);
      if (id && !out.some((x) => x.id === id)) out.push({ id, name: m[1], family, doc: join(tdir, f) });
    }
  }
  return out;
}

// The provider's seams and seam classes from its directions file (missing file → empty).
export function providerSeams(directionsFile) {
  if (!directionsFile || !existsSync(directionsFile)) return { seams: [], banned: [], soft: [] };
  const d = JSON.parse(readFileSync(directionsFile, "utf8"));
  const seams = Array.isArray(d?.seams)
    ? d.seams.filter((s) => s && typeof s.id === "string").map((s) => ({ id: s.id, kind: s.kind ?? null, heading: s.heading ?? null, description: s.mo_ta ?? s.mo_ta_vi ?? null }))
    : Object.entries(d?.seams ?? {}).map(([id, v]) => ({ id, kind: v?.kind ?? null, heading: v?.heading ?? null, description: v?.mo_ta ?? null }));
  const arr = (x) => (Array.isArray(x) ? x.map(String) : []);
  return { seams, banned: arr(d?.seam_classes?.banned), soft: arr(d?.seam_classes?.soft) };
}

const title = (id) => id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Pure merge of the three sources. provider = providerSeams(); packs = studioPacks(); hf = hyperframesTransitions().
export function buildCatalog({ provider = { seams: [], banned: [], soft: [] }, packs = [], hf = [] } = {}) {
  const banned = new Set([...BASE_BANNED, ...provider.banned].map((b) => b.toLowerCase()));
  const soft = new Set(provider.soft);
  const items = new Map();
  const add = (item) => {
    if (banned.has(item.id.toLowerCase())) return;
    const old = items.get(item.id);
    if (!old) { items.set(item.id, { ...item, sources: [item.source] }); return; }
    if (!old.sources.includes(item.source)) old.sources.push(item.source);
    for (const k of ["doc", "recipe", "preview", "pair_seam", "duration", "params", "description"]) if (old[k] == null && item[k] != null) old[k] = item[k];
    if ((!old.energy || !old.energy.length) && item.energy?.length) old.energy = item.energy;
    if (old.name === title(old.id) && item.name) old.name = item.name;
  };
  for (const s of provider.seams) add({ id: s.id, name: s.heading ?? title(s.id), source: "provider", kind: s.kind, energy: [], soft: soft.has(s.id), description: s.description, doc: null, recipe: null, preview: null, pair_seam: s.id });
  for (const p of packs) add({ id: p.id, name: p.name_vi, source: "studio", kind: p.kind, energy: p.energy, soft: false, description: p.description_vi, doc: join(p.dir, "recipe.md"), recipe: join(p.dir, "recipe.md"), preview: `/api/fx/preview/${p.id}/`, pair_seam: p.pair_seam, duration: p.duration, params: p.params });
  for (const t of hf) add({ id: t.id, name: t.name, source: "hyperframes", kind: "css", energy: [], soft: soft.has(t.id), description: t.family ? `HyperFrames · ${t.family}` : "HyperFrames", doc: t.doc, recipe: null, preview: null, pair_seam: null });
  const list = [...items.values()];
  const counts = { provider: 0, studio: 0, hyperframes: 0 };
  for (const i of list) for (const s of i.sources) counts[s]++;
  return { items: list, counts, banned: [...banned] };
}

// The catalog for a provider (null: Studio packs and HyperFrames only).
export function loadCatalog({ P = null, skills = hfSkills(), fxDir = FX_DIR } = {}) {
  return buildCatalog({ provider: providerSeams(P?.library?.directionsFile), packs: studioPacks(fxDir), hf: hyperframesTransitions(skills) });
}
