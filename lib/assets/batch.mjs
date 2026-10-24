// lib/assets/batch.mjs — image batches: many drawings of one series (poses, backgrounds, props,
// screen cards, thumbnails) made in one job, each checked by an image-reading agent and keyed
// with the series' own tools. See docs/assets.md.
//
// A batch is assets/gen/batches/<batch>.json of the project: an array of items
//   { id, kind: pose | background | prop | ui-card | thumbnail, prompt, character?, refs?,
//     background?: green | none, size?, target?, import?: { height?, width?, w?, h? } }
// refs (≤ 8) are "S/<path>" in a `read` folder of the series or paths in the project; target is
// "S/<path>" inside a `writable` folder of the series (copied there only when the user approves
// the board, never here). The state of a run is .opus/assets/<batch>.json:
//   { batch, started, ended, running, stopped, interrupted, message,
//     items: { <id>: { status, raw, keyed, preview, receipt, tries, reasons, error, check, unchecked,
//                      interrupted_at, ai_redos } } }
// status: queued → drawing → checking → keying → keyed | ready | needs_review | failed, or
// waiting_quota while every drawing agent is out of turns, or interrupted when the run was cut
// short (Studio stopped, the job cancelled, the runner died): running is false then, the images
// already done stay as they are and a resume run (resume: true) does only the interrupted ones,
// from the reading when the drawing was already made. keyed: drawn, checked and keyed into
// assets/gen/keyed/; ready: drawn and checked, nothing to key (ui-card, thumbnail).
// The self-check: right_character only when a reference is the character's own (a folder named
// after it, or <id>-hd, on the reference's path), single_figure for a pose or prop, flat_green on
// a green background, no_text always. Only a failed no_text or single_figure redraws (once); any
// other failure goes to the board as drawn. A reading that fails (agent error, timeout) is no
// failure: the image goes to the board as not checked (unchecked, needs_review), never redrawn.
// The director's redraw count lives in Studio's ledger (lib/ledger.mjs), not here; ai_redos here
// only shows it.
//
//   node lib/assets/batch.mjs run <json>   runs runBatch(json) and prints RESULT <json> last
// Raw drawings go to assets/gen/raw/<id>.png and are never overwritten (a redraw is <id>-2.png …).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describeImages, generateImage, listAgents, orderOf, pick, RESULT_PREFIX, slotsOf } from "../agents/index.mjs";
import { redact, redactDeep } from "../agents/redact.mjs";
import { writeReceipt } from "../receipts.mjs";
import { ID as CHAR_ID, seriesPath } from "../series.mjs";
import { buildArgv } from "../series-run.mjs";
import { insideProject } from "../tools.mjs";

const SELF = fileURLToPath(import.meta.url);
export const NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;
export const KINDS = ["pose", "background", "prop", "ui-card", "thumbnail"];
export const MAX_ITEMS = 50;
export const MAX_REFS = 8;
// Redraws of one image the director may ask for in a batch; the next one needs the user.
export const MAX_AI_REDOS = 3;
export const DONE = ["keyed", "ready"];
export const REVIEW = ["needs_review", "failed", "waiting_quota", "interrupted"];
// Checks whose failure is worth one automatic redraw; the others are left to the user.
export const REDRAW_ON = ["no_text", "single_figure"];
const LIVE = ["queued", "drawing", "checking", "keying", "waiting_quota"];
const KEY_TOOL = { pose: "import-sprite", prop: "import-sprite", background: "quantize" };
const BG_SIZE = { w: 480, h: 270 };
const QUOTA_WAIT_MS = 60000;
const QUOTA_MAX_MS = 30 * 60000;
const IMAGE = /\.(png|jpe?g|webp)$/i;
const err = (status, msg) => Object.assign(new Error(msg), { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inside = (p, dir) => p === dir || p.startsWith(dir + sep);

export const batchesDir = (dir) => join(dir, "assets", "gen", "batches");
export const batchFile = (dir, name) => join(batchesDir(dir), `${name}.json`);
export const stateFile = (dir, name) => join(dir, ".opus", "assets", `${name}.json`);

export function listBatches(dir) {
  try { return readdirSync(batchesDir(dir)).filter((f) => f.endsWith(".json") && NAME.test(f.slice(0, -5))).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}

export function readBatch(dir, name) {
  if (!NAME.test(String(name ?? ""))) throw err(400, `tên đợt "${String(name ?? "")}" không hợp lệ (chữ thường, số, -)`);
  const f = batchFile(dir, name);
  if (!existsSync(f)) throw err(404, `không có file đợt assets/gen/batches/${name}.json`);
  try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { throw err(400, `assets/gen/batches/${name}.json: JSON hỏng (${e.message})`); }
}

export function readState(dir, name) {
  try { return JSON.parse(readFileSync(stateFile(dir, name), "utf8")); } catch { return null; }
}
export function writeState(dir, name, state) {
  const f = stateFile(dir, name);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, f);
}

// The realpath of the deepest existing part of p, with the rest appended.
function realish(p) {
  let probe = p;
  const rest = [];
  while (!existsSync(probe)) { rest.unshift(basename(probe)); const up = dirname(probe); if (up === probe) break; probe = up; }
  return join(realpathSync(probe), ...rest);
}
// "S/<rel>" → its absolute path in the series folder ('..', dot segments, '\' and S/build refused).
function seriesRel(series, v, what) {
  const parts = v.slice(2).split("/");
  if (v.includes("\\") || parts.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) throw err(400, `${what}: đường "${v}" không hợp lệ`);
  const real = realish(join(series.dir, ...parts));
  if (!inside(real, series.dir) || inside(real, join(series.dir, "build"))) throw err(400, `${what}: "${v}" nằm ngoài thư mục series hoặc dưới S/build`);
  return real;
}
function refPath(v, what, { series, projectDir, char }) {
  if (typeof v !== "string" || !v) throw err(400, `${what}: cần một đường dẫn`);
  let f;
  if (v.startsWith("S/")) {
    f = seriesRel(series, v, what);
    const reads = (series.config.read ?? []).map((r) => realish(seriesPath(series, r, { char })));
    if (!reads.some((d) => inside(f, d))) throw err(400, `${what}: "${v}" không nằm trong một thư mục read của series (${(series.config.read ?? []).join(", ")})`);
  } else f = insideProject(projectDir, v, what);
  if (!IMAGE.test(f)) throw err(400, `${what}: "${v}" không phải ảnh (.png, .jpg, .webp)`);
  if (!statSync(f, { throwIfNoEntry: false })?.isFile()) throw err(400, `${what}: không có file "${v}"`);
  return realpathSync(f);
}
// A reference is the character's own when a folder on its path (in the series or the project) is
// named after it, or <id>-hd: refs/<id>/…, refs/<id>-hd/…, characters/<id>/….
function ownRef(abs, char, { series, projectDir }) {
  const sd = realpathSync(series.dir);
  const base = inside(abs, sd) ? sd : projectDir;
  const dirs = relative(base, abs).split(sep).slice(0, -1);
  return dirs.some((d) => d === char || d === `${char}-hd`);
}
function targetPath(v, what, { series, char }) {
  if (typeof v !== "string" || !v.startsWith("S/")) throw err(400, `${what}: cần "S/<đường>" trong một thư mục writable của series`);
  if (extname(v).toLowerCase() !== ".png") throw err(400, `${what}: cần file .png`);
  const f = seriesRel(series, v, what);
  for (const rel of Object.values(series.config.writable ?? {})) {
    let base;
    try { base = realish(seriesPath(series, rel, { char })); } catch { continue; } // {char} without a character
    if (inside(f, base)) return f;
  }
  throw err(400, `${what}: "${v}" không nằm trong thư mục writable nào của series (${Object.keys(series.config.writable ?? {}).join(", ") || "không có"})`);
}

const BG = (kind) => (["pose", "prop", "ui-card"].includes(kind) ? "green" : "none");
const posInt = (v, what) => {
  if (!Number.isInteger(v) || v < 1 || v > 4096) throw err(400, `${what}: cần số nguyên 1–4096`);
  return v;
};

// Checks a batch; answers its items with absolute refs and target (abs_refs, abs_target) and the
// defaults filled in. Throws a 400 naming the first problem.
export function validateBatch(items, { series, projectDir }) {
  if (!series) throw err(404, "dự án không thuộc series nào: đợt ảnh cần series (khuôn ảnh, công cụ tách nền)");
  if (!Array.isArray(items) || !items.length) throw err(400, "file đợt phải là một mảng có ít nhất một ảnh");
  if (items.length > MAX_ITEMS) throw err(400, `một đợt tối đa ${MAX_ITEMS} ảnh`);
  const seen = new Set();
  return items.map((it, i) => {
    const at = `ảnh ${i + 1}`;
    if (!it || typeof it !== "object" || Array.isArray(it)) throw err(400, `${at}: cần một object`);
    if (!NAME.test(String(it.id ?? ""))) throw err(400, `${at}: id "${String(it.id ?? "")}" phải khớp ${NAME}`);
    if (seen.has(it.id)) throw err(400, `${at}: id ${it.id} trùng`);
    seen.add(it.id);
    const w = `${it.id}`;
    if (!KINDS.includes(it.kind)) throw err(400, `${w}: kind là ${KINDS.join(" | ")}`);
    if (typeof it.prompt !== "string" || !it.prompt.trim() || it.prompt.length > 4000) throw err(400, `${w}: cần prompt, tối đa 4000 ký tự`);
    if (it.character != null && !CHAR_ID.test(String(it.character))) throw err(400, `${w}: character "${it.character}" không hợp lệ`);
    if (it.kind === "pose" && !it.character) throw err(400, `${w}: ảnh pose cần character`);
    const background = it.background ?? BG(it.kind);
    if (!["green", "none"].includes(background)) throw err(400, `${w}: background là green | none`);
    if (it.size != null && !/^\d{2,5}x\d{2,5}$/.test(String(it.size))) throw err(400, `${w}: size dạng 1024x1024`);
    const refs = it.refs ?? [];
    if (!Array.isArray(refs) || refs.length > MAX_REFS) throw err(400, `${w}: refs tối đa ${MAX_REFS} ảnh`);
    const ctx = { series, projectDir, char: it.character ?? null };
    const absRefs = refs.map((r, k) => refPath(r, `${w} refs[${k}]`, ctx));
    const absTarget = it.target == null ? null : targetPath(it.target, `${w} target`, ctx);
    const imp = it.import ?? {};
    if (typeof imp !== "object" || Array.isArray(imp)) throw err(400, `${w}: import phải là object`);
    for (const k of ["height", "width", "w", "h"]) if (imp[k] != null) posInt(imp[k], `${w} import.${k}`);
    if ((it.kind === "pose" || it.kind === "prop") && imp.height == null && imp.width == null) throw err(400, `${w}: ảnh ${it.kind} cần import.height hoặc import.width (cỡ trong rig)`);
    if (KEY_TOOL[it.kind] && !series.config.tools?.[KEY_TOOL[it.kind]]) throw err(400, `${w}: series chưa khai báo công cụ ${KEY_TOOL[it.kind]} để tách nền`);
    const ownRefs = Boolean(it.character) && absRefs.some((f) => ownRef(f, it.character, { series, projectDir: realpathSync(projectDir) }));
    return { ...it, refs, background, size: it.size ?? null, import: imp, abs_refs: absRefs, abs_target: absTarget, own_refs: ownRefs };
  });
}

// What the consent card shows: images, drawing turns, the most Codex turns the batch can spend and
// the 5-hour use of each codex-pool account. runBatch draws each image and reads it back to check
// it; a failed no_text or single_figure check draws and reads it once more. Every image has
// no_text, so the most is 2 drawings and 2 readings per image. codex_max counts the drawings when
// a Codex agent can draw and the readings when one can read (they fall through to Codex when the
// agents before it are out); with no scan, both.
const isCodex = (a) => /^codex/.test(a.id);
export function estimate(items, scan) {
  const pool = scan?.agents?.find((a) => a.id === "codex-pool");
  const draw = scan ? pick("image", scan.agents, scan.order?.image) : [];
  const drawsCodex = !scan || draw.some(isCodex);
  const readsCodex = !scan || pick("vision", scan.agents, scan.order?.vision).some(isCodex);
  const n = items.length;
  const turns = items.reduce((t, it) => t + (checkKeys(it).some((k) => REDRAW_ON.includes(k)) ? 2 : 1), 0);
  return {
    images: n, codex_turns: n, codex_max: (drawsCodex ? turns : 0) + (readsCodex ? turns : 0), agent: draw[0]?.id ?? null,
    accounts: (pool?.quota?.accounts ?? []).map(({ name, ok, h5, reset_h5 }) => ({ name, ok, h5, reset_h5 })),
  };
}
export function estimateTitle(name, est) {
  const acc = est.accounts.map((a) => (a.h5 == null ? `${a.name} ${a.ok ? "chưa có số liệu" : "hết lượt"}` : `${a.name} còn ${Math.max(0, 100 - a.h5)}% trong 5 giờ`));
  const max = est.codex_max ? `, tối đa ${est.codex_max} lượt Codex (gồm một lần vẽ lại tự động khi ảnh có chữ hoặc sai số hình, và đọc ảnh tự kiểm)` : "";
  return `Đợt ${name}: ${est.images} ảnh, ${est.agent ?? "codex-pool"}, ước ${est.codex_turns} lượt vẽ${max}${acc.length ? `; ${acc.join(", ")}` : ""}`;
}

// The JSON the reading agent answers for an item: which checks apply to it.
export function checkKeys(item) {
  return [item.character && item.own_refs ? "right_character" : null, item.kind === "pose" || item.kind === "prop" ? "single_figure" : null, item.background === "green" ? "flat_green" : null, "no_text"].filter(Boolean);
}
export function checkSchema(item) {
  const keys = checkKeys(item);
  return { type: "object", properties: { ...Object.fromEntries(keys.map((k) => [k, { type: "boolean" }])), note: { type: "string" } }, required: [...keys, "note"] };
}
const CHECK_TEXT = {
  right_character: (it) => `right_character: the drawn figure is the character "${it.character}" of the reference images (same design, colours, proportions)`,
  single_figure: (it) => `single_figure: exactly one ${it.kind === "prop" ? "object" : "figure"}, whole and not cut by the frame`,
  flat_green: () => "flat_green: the background is one flat solid pure green (#00FF00), no gradient, floor, shadow or texture",
  no_text: () => "no_text: no letters, numbers, captions, logos or watermarks anywhere",
};
export function checkPrompt(item, refCount) {
  return [
    `Check one generated image of an asset batch (${item.kind} "${item.id}").`,
    refCount ? `The first image is the new drawing; the other ${refCount} are reference images it should match.` : "There is one image, the new drawing.",
    `What it was asked to show: ${item.prompt.slice(0, 600)}`,
    "Answer each check true or false:",
    ...checkKeys(item).map((k) => `- ${CHECK_TEXT[k](item)}`),
    "- note: when any check is false, one short sentence on what to fix; else an empty string.",
  ].join("\n");
}
export function passes(item, json) {
  return Boolean(json) && checkKeys(item).every((k) => json[k] === true);
}

export function drawPrompt(item, series, { reason = null, note = null } = {}) {
  const style = series.config.image_styles?.[item.kind];
  return [item.prompt.trim(), style, reason ? `Sửa theo góp ý: ${reason}` : null, note ? `Sửa lỗi lần trước: ${note}` : null].filter(Boolean).join("\n\n");
}

// The keying command of an item, as buildArgv's flags (paths relative to the project).
function keyFlags(item, rawRel) {
  const keyed = `assets/gen/keyed/${item.id}`;
  if (item.kind === "background") return { tool: "quantize", flags: { "--in": rawRel, "--out": `${keyed}.png`, "--w": item.import.w ?? BG_SIZE.w, "--h": item.import.h ?? BG_SIZE.h }, keyed: `${keyed}.png`, preview: `${keyed}.png` };
  const size = item.kind === "prop" ? (item.import.width != null ? { "--width": item.import.width } : { "--height": item.import.height }) : (item.import.height != null ? { "--height": item.import.height } : { "--width": item.import.width });
  return { tool: "import-sprite", flags: { "--in": rawRel, "--out": `${keyed}.pxl`, ...size, "--preview": `${keyed}.png` }, keyed: `${keyed}.pxl`, preview: `${keyed}.png` };
}

// Marks a state cut short: running off, every image still under way "interrupted" (what it was
// doing kept as interrupted_at), the message saying so. Returns the state.
export function markInterrupted(state, why) {
  const left = [];
  for (const [id, it] of Object.entries(state.items ?? {})) {
    if (!LIVE.includes(it.status)) continue;
    Object.assign(it, { status: "interrupted", interrupted_at: it.status, updated: new Date().toISOString() });
    left.push(id);
  }
  const at = new Date();
  return Object.assign(state, {
    running: false, stopped: true, interrupted: true, ended: at.toISOString(),
    message: `Đợt ${state.batch} bị ngắt (${why}); ảnh đã vẽ giữ nguyên. ${left.length ? `Còn ${left.length} ảnh (${left.join(", ")}): bấm Chạy tiếp để làm nốt, không cần thẻ mới.` : "Không còn ảnh nào dở."}`,
  });
}
// A state file still saying running while no job runs it: marks it interrupted. true when it did.
export function interruptStale(dir, batch, why) {
  const st = readState(dir, batch);
  if (!st?.running) return false;
  writeState(dir, batch, markInterrupted(st, why));
  return true;
}
const stateNames = (dir) => { try { return readdirSync(join(dir, ".opus", "assets")).filter((f) => f.endsWith(".json") && NAME.test(f.slice(0, -5))).map((f) => f.slice(0, -5)); } catch { return []; } };
// Every batch of the project left running (Studio was stopped under it): marked interrupted.
export function sweepInterrupted(dir, why) {
  return stateNames(dir).filter((b) => interruptStale(dir, b, why));
}

// Runs a batch (or the items ids of it; reason is the user's or the director's note for a redraw).
// resume: only the interrupted images of the last run, without a new card: an image whose drawing
// was made goes on from its reading, the others are drawn. trap: on SIGTERM (a cancelled job, a
// Studio stop) the state is marked interrupted before the process ends. Returns the RESULT object.
// The state file is written after every change, so the page can follow; nothing is copied into
// the series folder.
export async function runBatch({ projectDir, root, series, batch, ids = null, reason = null, aiRedo = false, resume = false, trap = false, actor = "studio", env = process.env, quotaWaitMs = QUOTA_WAIT_MS, quotaMaxMs = QUOTA_MAX_MS, log = () => {} }) {
  const dir = realpathSync(projectDir);
  const all = validateBatch(readBatch(dir, batch), { series, projectDir: dir });
  if (ids != null && (!Array.isArray(ids) || !ids.length || ids.some((x) => !all.some((it) => it.id === x)))) throw err(400, `ids: chỉ nhận id có trong đợt ${batch}`);
  const prev = readState(dir, batch);
  if (resume && !prev?.interrupted) throw err(409, `đợt ${batch} không bị ngắt, không có gì để chạy tiếp`);
  const todo = resume ? all.filter((it) => prev.items?.[it.id]?.status === "interrupted") : ids ? all.filter((it) => ids.includes(it.id)) : all;
  const state = { batch, started: new Date().toISOString(), ended: null, running: true, stopped: false, interrupted: false, message: null, items: { ...(prev?.items ?? {}) } };
  const fromReading = new Set();
  for (const it of todo) {
    const was = { raw: null, keyed: null, preview: null, receipt: null, tries: 0, reasons: [], error: null, check: null, unchecked: false, ai_redos: 0, ...(state.items[it.id] ?? {}) };
    if (resume && ["checking", "keying"].includes(was.interrupted_at) && was.raw && existsSync(join(dir, was.raw))) fromReading.add(it.id);
    state.items[it.id] = { ...was, status: "queued", error: null, interrupted_at: null, ai_redos: was.ai_redos + (aiRedo ? 1 : 0) };
  }
  const save = () => writeState(dir, batch, state);
  const set = (id, patch) => { Object.assign(state.items[id], patch, { updated: new Date().toISOString() }); save(); };
  save();
  const onTerm = () => { try { markInterrupted(state, "việc bị dừng"); save(); } finally { process.exit(143); } };
  if (trap) process.once("SIGTERM", onTerm);

  const scan = await listAgents({ env, refresh: true });
  const first = pick("image", scan.agents, orderOf(env).image)[0]?.id ?? null;
  const slots = first ? await slotsOf(first, { env, scan }) : 1;
  log(`đợt ${batch}: ${todo.length} ảnh, ${first ?? "chưa có agent vẽ"}, ${slots} ảnh cùng lúc`);

  // One wait for every worker while the drawing agents are out of turns. Resolves true when an
  // agent can draw again, false after quotaMaxMs (counted from the first quota hit since the last
  // drawing that worked).
  let deadline = null, waiting = null;
  const quotaIds = new Set();
  const canDraw = (s) => pick("image", s.agents, orderOf(env).image).some((a) => a.id === "codex-pool" || (a.caps.image === "yes" && !quotaIds.has(a.id)));
  const waitQuota = () => {
    deadline ??= Date.now() + quotaMaxMs;
    waiting ??= (async () => {
      while (Date.now() < deadline) {
        log(`hết lượt vẽ ở mọi agent; quét lại sau ${Math.round(quotaWaitMs / 1000)} giây`);
        await sleep(Math.min(quotaWaitMs, Math.max(0, deadline - Date.now())));
        if (canDraw(await listAgents({ env, refresh: true }))) return true;
      }
      return false;
    })().finally(() => { waiting = null; });
    return waiting;
  };

  // One drawing: { ok, file } | { quota } | { failed, error }.
  const draw = async (it, note) => {
    for (;;) {
      if (state.stopped) return { stopped: true };
      set(it.id, { status: "drawing", tries: state.items[it.id].tries + 1 });
      const r = await generateImage({ prompt: drawPrompt(it, series, { reason, note }), refs: it.abs_refs, size: it.size, out: join(dir, "assets", "gen", "raw", `${it.id}.png`), project: dir, actor, env });
      if (r.ok) { deadline = null; return { ok: true, file: r.file, receipt: r.receipt?.file ?? null }; }
      if (r.refused) return { failed: true, error: r.error };
      const quota = r.tried?.some((t) => t.quota) || !r.tried?.length;
      if (!quota) return { failed: true, error: r.error };
      for (const t of r.tried ?? []) if (t.quota) quotaIds.add(t.id);
      set(it.id, { status: "waiting_quota", error: r.error });
      if (!(await waitQuota())) {
        if (!state.stopped) Object.assign(state, { stopped: true, message: `Hết lượt vẽ ở mọi agent sau ${Math.round(quotaMaxMs / 60000)} phút chờ; đợt ${batch} dừng. Chạy lại đợt khi có lượt (ảnh đã xong được giữ).` });
        return { stopped: true };
      }
    }
  };

  // Reads the drawing; one image-check receipt per read. unread: the reading itself failed.
  const check = async (it, file) => {
    set(it.id, { status: "checking" });
    const images = [file, ...it.abs_refs.slice(0, 2)];
    const t0 = new Date();
    const r = await describeImages({ images, prompt: checkPrompt(it, images.length - 1), schema: checkSchema(it), env });
    const verdict = r.ok ? Object.fromEntries([...checkKeys(it), "note"].map((k) => [k, r.json?.[k] ?? null])) : null;
    const ok = r.ok && passes(it, r.json);
    await writeReceipt(dir, { op: "image-check", actor, tool: { agent: r.agent ?? null }, params: { batch, item: it.id, checks: checkKeys(it), verdict, pass: ok }, inputs: { image: relative(dir, file), refs: it.refs.slice(0, 2), error: r.ok ? null : r.error }, started: t0, ended: new Date() });
    const failed = r.ok ? checkKeys(it).filter((k) => r.json?.[k] !== true) : [];
    const note = r.ok ? String(r.json?.note ?? "").trim() || `trượt: ${failed.join(", ")}` : `chưa kiểm được: ${redact(String(r.error ?? "agent đọc ảnh lỗi")).slice(0, 200)}`;
    return { ok, verdict, note, unread: !r.ok, redraw: failed.some((k) => REDRAW_ON.includes(k)) };
  };

  const key = async (it, file) => {
    const k = keyFlags(it, relative(dir, file));
    if (!KEY_TOOL[it.kind]) return { keyed: null, preview: null };
    mkdirSync(join(dir, "assets", "gen", "keyed"), { recursive: true });
    const cmd = buildArgv({ series, projectDir: dir, root: root ?? dirname(dir), tool: k.tool, flags: k.flags });
    const t0 = new Date();
    const p = spawnSync(cmd.cmd, cmd.argv, { cwd: cmd.cwd, timeout: cmd.timeoutMs, encoding: "utf8", maxBuffer: 4 << 20 });
    const outputs = cmd.outputs.filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile());
    await writeReceipt(dir, { op: "series-tool", actor, tool: { name: k.tool, file: relative(series.dir, cmd.file) }, params: { flags: k.flags }, inputs: { series: series.config.name, batch, item: it.id, exit: p.status, signal: p.signal }, outputs, started: t0, ended: new Date() });
    if (p.status !== 0) throw new Error(`${k.tool} lỗi (${p.error?.code ?? `exit ${p.status ?? p.signal}`}): ${redact(String(p.stderr || p.stdout).trim().split("\n").slice(-2).join(" ")).slice(0, 300)}`);
    return { keyed: k.keyed, preview: k.preview };
  };

  const one = async (it) => {
    try {
      let d;
      if (fromReading.has(it.id)) d = { ok: true, file: join(dir, state.items[it.id].raw), receipt: state.items[it.id].receipt };
      else {
        d = await draw(it, null);
        if (d.stopped) return;
        if (d.failed) return set(it.id, { status: "failed", error: d.error });
        set(it.id, { raw: relative(dir, d.file), receipt: d.receipt });
      }
      let c = await check(it, d.file);
      const reasons = [...state.items[it.id].reasons];
      if (!c.ok) reasons.push(c.note);
      if (!c.ok && c.redraw) {
        set(it.id, { raw: relative(dir, d.file), receipt: d.receipt, check: c.verdict, reasons });
        const again = await draw(it, c.note);
        if (again.stopped) return;
        if (again.failed) return set(it.id, { status: "needs_review", error: again.error });
        d = again;
        set(it.id, { raw: relative(dir, d.file), receipt: d.receipt });
        c = await check(it, d.file);
        if (!c.ok) reasons.push(c.note);
      }
      set(it.id, { status: "keying", raw: relative(dir, d.file), receipt: d.receipt, check: c.verdict, unchecked: c.unread, reasons });
      const k = await key(it, d.file);
      set(it.id, { status: !c.ok ? "needs_review" : KEY_TOOL[it.kind] ? "keyed" : "ready", ...k, error: null });
    } catch (e) { set(it.id, { status: "failed", error: redact(e.message).slice(0, 400) }); }
  };

  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.min(slots, queue.length) }, async () => {
    while (queue.length && !state.stopped) await one(queue.shift());
  }));
  if (trap) process.off("SIGTERM", onTerm);
  for (const it of todo) if (["queued", "drawing", "waiting_quota"].includes(state.items[it.id].status)) state.items[it.id].status = "waiting_quota";
  Object.assign(state, { running: false, ended: new Date().toISOString() });
  save();
  return summarize(state, todo.map((it) => it.id));
}

// Counts of a state (over ids, else every item) and the line the director gets.
export function summarize(state, ids = null) {
  const items = Object.entries(state?.items ?? {}).filter(([id]) => !ids || ids.includes(id));
  const counts = {};
  for (const [, s] of items) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const passed = items.filter(([, s]) => DONE.includes(s.status)).length;
  return { ok: !state?.stopped && passed === items.length, batch: state?.batch ?? null, counts, passed, review: items.length - passed, stopped: Boolean(state?.stopped), message: state?.message ?? null };
}

// What asset_status and GET /api/assets answer for one batch.
export function batchStatus(dir, name) {
  const items = readBatch(dir, name);
  const state = readState(dir, name);
  return {
    batch: name, running: Boolean(state?.running), stopped: Boolean(state?.stopped), interrupted: Boolean(state?.interrupted), message: state?.message ?? null, started: state?.started ?? null, ended: state?.ended ?? null,
    items: (Array.isArray(items) ? items : []).map((it) => ({ id: it?.id ?? null, kind: it?.kind ?? null, character: it?.character ?? null, target: it?.target ?? null, ...(state?.items?.[it?.id] ?? { status: "new" }) })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const [cmd, json] = process.argv.slice(2);
  const fail = (e, code = 2) => { console.error(`FAIL ${redact(e.message)}`); console.log(RESULT_PREFIX + JSON.stringify({ ok: false, error: redact(e.message) })); process.exit(code); };
  if (cmd !== "run") fail(new Error("dùng: node lib/assets/batch.mjs run <json>"));
  let arg;
  try { arg = JSON.parse(json ?? ""); } catch { fail(new Error("run cần một đối số JSON")); }
  runBatch({ ...arg, trap: true, log: (l) => console.log(redact(l)) }).then((r) => {
    console.log(`${r.stopped ? "DỪNG" : "XONG"} đợt ${r.batch}: ${r.passed} ảnh đạt, ${r.review} ảnh cần xem`);
    console.log(RESULT_PREFIX + JSON.stringify(redactDeep(r)));
    process.exit(r.stopped ? 3 : 0);
  }, (e) => fail(e, e.status === 400 || e.status === 404 ? 2 : 1));
}
