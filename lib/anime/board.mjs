// lib/anime/board.mjs — the shot board of an anime motion-comic project. Nothing is stored: every
// column is read off the files the project has now.
//
//   board(dir) → { source, note, columns, shots: [{ id, name, start, end, thumb, plates, variants,
//                  stacks, tracks, status }], chars, enabled, final }
//
// Shots come from project.json when the project has one, else from the shots the animation
// manifest names (stacks[*].shot, in TIMING order when index.html has a TIMING block), else none.
// Files of a shot are named after it: assets/plates/<shot>-*.png (plates, raw/ excluded) and
// <manifest dir, default assets/plates/anim>/<shot>-*.png (pose variants).
// Status: "missing" (no plate), "plate", "variants" (pose variants, no track yet), "animated"
// (a manifest stack of the shot has tracks).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listChars } from "./chars.mjs";
import { finalRenders, isEnabled, readManifest } from "./manifest.mjs";

export const COLUMNS = [
  { id: "missing", label: "Thiếu plate" },
  { id: "plate", label: "Có plate" },
  { id: "variants", label: "Có biến thể" },
  { id: "animated", label: "Đã có track" },
];

const pngs = (d) => (existsSync(d) && statSync(d).isDirectory() ? readdirSync(d).filter((f) => /\.png$/i.test(f) && !f.startsWith(".")).sort() : []);
const ofShot = (files, id) => files.filter((f) => f.startsWith(`${id}-`) || f === `${id}.png`);

// window.TIMING of index.html as JSON (the block build.mjs reads), or null.
export function timingOf(dir) {
  const f = join(dir, "index.html");
  if (!existsSync(f)) return null;
  const m = readFileSync(f, "utf8").match(/\/\* TIMING:BEGIN \*\/\s*window\.TIMING\s*=\s*(\{[\s\S]*?\});\s*\/\* TIMING:END \*\//);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function projectShots(dir) {
  const f = join(dir, "project.json");
  if (!existsSync(f)) return null;
  try {
    const m = JSON.parse(readFileSync(f, "utf8"));
    return Array.isArray(m?.shots) ? m.shots.filter((s) => s && typeof s.id === "string").map((s) => ({ id: s.id, name: s.name || "", start: Number(s.start) || 0, end: Number(s.end) || 0 })) : [];
  } catch { return null; }
}

// Best plate to show: the background, then the full-frame plate, then any.
function pickThumb(plates, variants) {
  return plates.find((f) => /-bg\.png$/i.test(f)) ?? plates.find((f) => /-full\.png$/i.test(f)) ?? plates[0] ?? variants.find((f) => /-base\.png$/i.test(f)) ?? variants[0] ?? null;
}

export function board(dir) {
  let man = null, manError = null;
  try { man = readManifest(dir); } catch (e) { manError = e.message; }
  const M = man?.manifest ?? null;
  const stacks = M && typeof M.stacks === "object" && M.stacks ? M.stacks : {};
  const timing = timingOf(dir);
  let shots = projectShots(dir), source = "project", note = null;
  if (!shots) {
    const ids = [...new Set(Object.values(stacks).map((s) => s?.shot).filter((x) => typeof x === "string"))];
    const order = Object.keys(timing?.scenes ?? {});
    ids.sort((a, b) => (order.includes(a) ? order.indexOf(a) : 1e9) - (order.includes(b) ? order.indexOf(b) : 1e9) || a.localeCompare(b, "en", { numeric: true }));
    shots = ids.map((id) => ({ id, name: "", start: Number(timing?.scenes?.[id]?.start) || 0, end: Number(timing?.scenes?.[id]?.end) || 0 }));
    source = ids.length ? "manifest" : "none";
    note = ids.length ? "chưa nhập project.json: shot lấy từ assets/anim/manifest.json" : "chưa có project.json hay manifest hoạt hình";
  }
  const varDir = typeof M?.dir === "string" && M.dir && !M.dir.split("/").includes("..") ? M.dir : "assets/plates/anim";
  const plateFiles = pngs(join(dir, "assets", "plates"));
  const variantFiles = pngs(join(dir, ...varDir.split("/")));
  const rows = shots.map((s) => {
    const plates = ofShot(plateFiles, s.id).map((f) => `assets/plates/${f}`);
    const variants = ofShot(variantFiles, s.id).map((f) => `${varDir}/${f}`);
    const mine = Object.entries(stacks).filter(([, st]) => st?.shot === s.id);
    const tracks = mine.reduce((n, [, st]) => n + (Array.isArray(st.tracks) ? st.tracks.length : 0), 0);
    const status = tracks > 0 ? "animated" : variants.length ? "variants" : plates.length ? "plate" : "missing";
    return { ...s, thumb: pickThumb(plates, variants), plates, variants, stacks: mine.map(([id]) => id), tracks, status };
  });
  let chars = [], charsError = null;
  try { chars = listChars(dir); } catch (e) { charsError = e.message; }
  return { source, note, columns: COLUMNS, shots: rows, chars, enabled: isEnabled(dir), manifest: Boolean(man), manifest_error: manError, chars_error: charsError, final: finalRenders(dir) };
}
