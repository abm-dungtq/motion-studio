// lib/anime/variant.mjs — one pose variant of a shot, or one character sheet, made through the
// agent registry (lib/agents/index.mjs generateImage, codex-pool first).
//
//   makeVariant(dir, { shot, base, chars, change, out_name, kind, sim, blend, width, edge, agent, actor })
//     1. generateImage in edit mode: refs = [base, …character sheets], the prompt of prompts.mjs
//        (kind "edit" keeps the pose and changes one thing, "pose" redraws in a new pose) →
//        <anim dir>/raw/<out>.png
//     2. measure the real background colour (keying.mjs)
//     3. upscale: realesrgan-ncnn-vulkan when it is on the search path, then lanczos to the width
//        of the shot's plate (the base image unless it is a raw one, else a plate of the shot,
//        else 2208)
//     4. chroma key + despill → <anim dir>/<out>.png (RGBA)
//     5. a receipt "anime-variant" with both files
//   → { ok, raw, file, receipt, color, spill, width, upscale, agent } or { ok: false, error }
//   out_name taken (raw or keyed) → <out>-2, -3, …; nothing is written over.
//
//   makeSheet(dir, { id, description, refs, agent, actor }) → a four-view sheet on the character's
//     key colour in assets/chars/<id>-sheet.png; the library entry then points at it.
//
// `node lib/anime/variant.mjs variant|sheet <json>` is what the "anime" job runs (routes/anime.mjs):
// json is { dir, ...arguments }; the last line is RESULT <json of the answer>.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateImage, RESULT_PREFIX } from "../agents/index.mjs";
import { redact, redactDeep } from "../agents/redact.mjs";
import { writeReceipt } from "../receipts.mjs";
import { insideProject } from "../tools.mjs";
import { charOf, saveChar, sheetOf } from "./chars.mjs";
import { DEFAULTS, key, measure, probeSize, upscale as runUpscaler, upscaler } from "./keying.mjs";
import { readManifest } from "./manifest.mjs";
import * as prompts from "./prompts.mjs";

const SELF = fileURLToPath(import.meta.url);
export const DEFAULT_WIDTH = 2208;
export const OUT_NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;
export const SHOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function animDirOf(dir) {
  let d = "assets/plates/anim";
  try { const m = readManifest(dir)?.manifest; if (typeof m?.dir === "string" && m.dir && !m.dir.split("/").some((p) => p === ".." || p.startsWith("."))) d = m.dir; } catch { /* default */ }
  return d;
}

// The first stem n where neither raw/<n>.png nor <n>.png is taken.
export function freeStem(animAbs, stem) {
  for (let n = 1; n < 1000; n++) {
    const s = n === 1 ? stem : `${stem}-${n}`;
    if (!existsSync(join(animAbs, `${s}.png`)) && !existsSync(join(animAbs, "raw", `${s}.png`))) return s;
  }
  throw bad(`không còn tên trống cho ${stem}`, 409);
}

// The width the keyed pose is scaled to: the plate it has to line up with.
export async function targetWidth(dir, baseAbs, shot, { env } = {}) {
  const tries = [];
  if (!/\/raw\//.test(baseAbs.replaceAll("\\", "/"))) tries.push(baseAbs);
  const plates = join(dir, "assets", "plates");
  if (existsSync(plates)) for (const f of readdirSync(plates).filter((x) => x.startsWith(`${shot}-`) && /\.png$/i.test(x)).sort()) tries.push(join(plates, f));
  for (const f of tries) {
    try { const { width } = await probeSize(f, { env }); if (width > 0) return width; } catch { /* next */ }
  }
  return DEFAULT_WIDTH;
}

// Checks the arguments and resolves the files, without generating anything (the route answers
// 400 from this before it starts a job).
export function planVariant(dir, args = {}) {
  const { shot, base, change, kind = "edit" } = args;
  if (typeof shot !== "string" || !SHOT_ID.test(shot)) throw bad("shot: id cảnh, ví dụ s13");
  if (kind !== "edit" && kind !== "pose") throw bad('kind là "edit" hoặc "pose"');
  const outName = String(args.out_name ?? "").trim();
  if (!OUT_NAME.test(outName)) throw bad("out_name: chữ thường, số và -, ví dụ s13-k4");
  const baseAbs = insideProject(dir, base, "base", { mustExist: true });
  if (!/\.png$/i.test(baseAbs)) throw bad("base phải là ảnh PNG");
  const charIds = (Array.isArray(args.chars) ? args.chars : []).map(String);
  if (charIds.length > 6) throw bad("chars: tối đa 6 nhân vật");
  const sheets = charIds.map((id) => sheetOf(dir, id));
  const keyColor = charIds.length ? charOf(dir, charIds[0]).key_color : "#0047FF";
  const prompt = kind === "pose" ? prompts.pose(change, { keyColor }) : prompts.edit(change, { keyColor });
  for (const [k, lo, hi] of [["sim", 0.01, 1], ["blend", 0, 1]]) if (args[k] != null && !(Number(args[k]) >= lo && Number(args[k]) <= hi)) throw bad(`${k} phải trong khoảng ${lo}–${hi}`);
  if (args.width != null && !(Number.isInteger(Number(args.width)) && Number(args.width) >= 16 && Number(args.width) <= 16384)) throw bad("width là số px nguyên 16–16384");
  if (args.spill !== undefined && args.spill !== null && args.spill !== "blue" && args.spill !== "green") throw bad("spill là blue, green hoặc null");
  return { shot, kind, outName, baseAbs, charIds, sheets, prompt };
}

export async function makeVariant(dir, args = {}, { env = process.env, log = () => {} } = {}) {
  const { shot, kind, outName, baseAbs, charIds, sheets, prompt } = planVariant(dir, args);
  const { base, change, agent = null, actor = "human", edge = false } = args;
  const sim = Number(args.sim ?? DEFAULTS.sim), blend = Number(args.blend ?? DEFAULTS.blend);
  const rel = animDirOf(dir);
  const animAbs = join(dir, ...rel.split("/"));
  mkdirSync(join(animAbs, "raw"), { recursive: true });
  const stem = freeStem(animAbs, outName);
  const raw = join(animAbs, "raw", `${stem}.png`), png = join(animAbs, `${stem}.png`);
  const started = new Date();

  log(`1/4 sinh ảnh (${kind}) từ ${base}${sheets.length ? ` + ${sheets.length} sheet` : ""} → ${rel}/raw/${stem}.png`);
  const g = await generateImage({ prompt, refs: [baseAbs, ...sheets], edit: true, out: raw, project: dir, agent, actor, env });
  if (!g.ok) return { ok: false, error: g.error, refused: g.refused, tried: g.tried };
  const rawFile = g.file;

  log("2/4 đo màu nền");
  const m = await measure(rawFile, { env });
  log(`màu nền ${m.color}, despill ${m.spill ?? "không"}`);

  const width = args.width != null ? Number(args.width) : await targetWidth(dir, baseAbs, shot, { env });
  let src = rawFile, method = "lanczos";
  const up = upscaler(env);
  const tmp = mkdtempSync(join(tmpdir(), "ms-anime-up-"));
  try {
    const { width: w0 } = await probeSize(rawFile, { env });
    if (up && w0 < width) {
      log(`3/4 phóng to bằng realesrgan-ncnn-vulkan rồi lanczos tới ${width}px`);
      src = await runUpscaler(up, rawFile, join(tmp, "up.png"), { env });
      method = "realesrgan-x4plus-anime+lanczos";
    } else log(`3/4 phóng to bằng lanczos tới ${width}px`);

    log(`4/4 tách nền → ${rel}/${basename(png)}`);
    const spill = args.spill === undefined ? m.spill : args.spill;
    const k = await key(src, png, { color: m.color, width, sim, blend, spill, edge: edge === true, env });
    const receipt = await writeReceipt(dir, {
      op: "anime-variant", actor, started, ended: new Date(),
      tool: { agent: g.agent, upscale: method, ffmpeg: k.filter },
      params: { shot, kind, change: String(change ?? ""), out_name: stem, color: m.color, spill, sim, blend, width, edge: edge === true },
      inputs: { base: String(base), chars: charIds, sheets: sheets.map((f) => f.slice(dir.length + 1)) },
      outputs: [rawFile, png],
    });
    return { ok: true, raw: rawFile, file: png, receipt: receipt.file, pass: receipt.pass, color: m.color, spill, width, upscale: method, agent: g.agent, image_receipt: g.receipt?.file ?? null };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export function planSheet(dir, args = {}) {
  const c = charOf(dir, String(args.id ?? ""));
  const refs = (Array.isArray(args.refs) ? args.refs : []).map((r, i) => insideProject(dir, r, `refs[${i}]`, { mustExist: true }));
  if (refs.length > 4) throw bad("refs: tối đa 4 ảnh");
  const description = String(args.description || c.notes || "").trim();
  return { c, refs, prompt: prompts.sheet({ name: c.name, description, keyColor: c.key_color, palette: c.palette }) };
}

export async function makeSheet(dir, args = {}, { env = process.env, log = () => {} } = {}) {
  const { c, refs, prompt } = planSheet(dir, args);
  const out = join(dir, "assets", "chars", `${c.id}-sheet.png`);
  log(`sinh sheet 4 góc cho ${c.name} → assets/chars/${basename(out)}`);
  const g = await generateImage({ prompt, refs, edit: false, out, project: dir, agent: args.agent ?? null, actor: args.actor ?? "human", env });
  if (!g.ok) return { ok: false, error: g.error, refused: g.refused, tried: g.tried };
  const sheet = `assets/chars/${basename(g.file)}`;
  const { unregistered, exists, ...entry } = c;
  saveChar(dir, { ...entry, sheet });
  return { ok: true, file: g.file, sheet, receipt: g.receipt?.file ?? null, agent: g.agent };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const [cmd, json] = process.argv.slice(2);
  const say = (out, code) => { console.log(RESULT_PREFIX + JSON.stringify(redactDeep(out))); process.exit(code); };
  let arg = null;
  try { arg = JSON.parse(json ?? ""); } catch { /* below */ }
  const fn = { variant: makeVariant, sheet: makeSheet }[cmd];
  if (!fn || !arg || typeof arg.dir !== "string") say({ ok: false, error: "cách dùng: variant.mjs variant|sheet <json có dir>" }, 2);
  else {
    const { dir, ...rest } = arg;
    fn(dir, rest, { log: (l) => console.log(redact(l)) }).then((r) => {
      console.log(r.ok ? `OK ${r.file}` : `FAIL ${redact(r.error ?? "")}`);
      say(r, r.ok ? 0 : 1);
    }, (e) => { console.error(`FAIL ${redact(e.message)}`); say({ ok: false, error: e.message, status: e.status ?? 500 }, 1); });
  }
}
