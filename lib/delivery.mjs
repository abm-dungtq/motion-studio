// lib/delivery.mjs — handing an episode of a series over: every file goes into the series' delivery
// folder (delivery_dir of studio-series.json with {N} the BRIEF's episode:, e.g. kenh/tap-2/).
// Files are copied there and never written over: a different file of the same name is placed as
// <name>-2, -3 … Each step writes a receipt (op deliver-<step>, drive-upload) with name, size and
// sha of what it placed, and counts its failures for the "needs outside help" card (lib/handoff.mjs).
//   text      the series' title draft kenh/tap-<N>-tieu-de-mo-ta.md (else an empty one), chapters
//             from the manifest's scenes, written to delivery/tieu-de-mo-ta.md of the project (kept
//             there once written, so an edit is checked next time); viet-pro check-platform youtube
//             and lint on it; then tieu-de-mo-ta.md
//   captions  the provider's captions command → delivery/<project>.srt; CAPTIONS.md of the project
//             with a Facebook and a TikTok section; the provider's viet-pro gate --stage delivery;
//             then the SRT and CAPTIONS.md
//   export    the provider's export command on the newest renders/*-final.mp4 (youtube, facebook,
//             tiktok, no thumbnail); exit 5 is the final gate; then the three files
//   thumbnail an image batch of three thumbnail backgrounds (runBatch), each through the series
//             tool make-thumbnail into delivery/thumb-<i>.jpg; the user's pick becomes thumbnail.jpg
//   drive     every file of the delivery folder to Drive (lib/drive.mjs)
//
//   node lib/delivery.mjs run <export|thumbnail|drive> <json>   runs the step and prints RESULT <json> last
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RESULT_PREFIX } from "./agents/index.mjs";
import { redact, redactDeep } from "./agents/redact.mjs";
import { batchFile, runBatch } from "./assets/batch.mjs";
import { driveUpload } from "./drive.mjs";
import { tracked } from "./handoff.mjs";
import { listReceipts, writeReceipt } from "./receipts.mjs";
import { maskAccount, seriesFor, seriesPath } from "./series.mjs";
import { buildArgv } from "./series-run.mjs";
import { runCommand } from "./series-voice.mjs";
import { frontmatterOf } from "./suggest.mjs";

const SELF = fileURLToPath(import.meta.url);
export const TARGETS = ["youtube", "facebook", "tiktok"];
export const THUMB_TOOL = "make-thumbnail";
export const THUMB_BATCH = "thumbnail";
export const THUMBS = 3;
export const TEXT_FILE = "tieu-de-mo-ta.md";
export const STEP = { text: "deliver-text", captions: "deliver-captions", export: "deliver-export", thumbnail: "deliver-thumbnail", drive: "drive-upload" };
const DRIVE_EXT = /\.(mp4|jpe?g|srt|md)$/i;
const ACCENTS = ["red", "yellow", "cyan"];
const err = (status, msg) => Object.assign(new Error(msg), { status });
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const readText = (f) => { try { return readFileSync(f, "utf8"); } catch { return null; } };

// ---- where an episode is delivered ---------------------------------------------------------------

// → { dir (real project folder), name, series, episode, out (absolute delivery folder), shown }.
export function deliveryOf(P, projectDir) {
  const dir = realpathSync(projectDir);
  const series = seriesFor(P, dir);
  if (!series) throw err(404, `${basename(projectDir)} không thuộc series nào: giao nộp cần series (BRIEF.md có dòng series:)`);
  if (!series.config.delivery_dir) throw err(400, `series ${series.config.name} chưa khai báo delivery_dir`);
  const episode = Number(frontmatterOf(readText(join(dir, "BRIEF.md")) ?? "").episode);
  if (!Number.isInteger(episode) || episode < 1) throw err(400, "BRIEF.md chưa có episode: <số tập> trong frontmatter");
  const out = seriesPath(series, series.config.delivery_dir, { N: episode });
  return { dir, name: basename(projectDir), series, episode, out, shown: `S/${relative(series.dir, out)}` };
}

// Copies from into the folder `to` as name, never over another file: the same bytes already there
// count as placed; a different file makes it <stem>-2<ext>, -3 … → { file, name, size, sha, same }.
export function placeCopy(from, to, name) {
  mkdirSync(to, { recursive: true });
  const want = sha(from);
  const ext = extname(name), stem = basename(name, ext);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? name : `${stem}-${n}${ext}`;
    const f = join(to, candidate);
    const st = lstatSync(f, { throwIfNoEntry: false });
    if (st?.isSymbolicLink()) throw err(409, `${candidate} trong thư mục giao nộp là symlink; Studio không ghi xuyên qua`);
    if (st && st.isFile() && sha(f) === want) return { file: f, name: candidate, size: st.size, sha: want, same: true };
    if (st) continue;
    copyFileSync(from, f, constants.COPYFILE_EXCL);
    return { file: f, name: candidate, size: statSync(f).size, sha: want, same: false };
  }
  throw err(409, `quá nhiều bản ${name} trong thư mục giao nộp`);
}

async function receipt(ctx, step, actor, placed, extra = {}) {
  return writeReceipt(ctx.dir, {
    op: step, actor, tool: { name: step },
    params: { episode: ctx.episode, folder: ctx.shown, ...extra.params },
    inputs: { series: ctx.series.config.name, files: placed.map((p) => ({ name: p.name, size: p.size, sha256: p.sha, same: p.same })), ...extra.inputs },
    outputs: placed.map((p) => p.file),
  });
}

const need = (commands, key) => {
  if (!commands?.[key]) throw err(400, `provider chưa có lệnh ${key}; cập nhật plugin (npm run setup) rồi thử lại`);
  return commands[key];
};
const node = (file, args, cwd) => ({ cmd: process.execPath, argv: [file, ...args], cwd, timeoutMs: 10 * 60000 });

// ---- text ----------------------------------------------------------------------------------------

const clock = (s) => { const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };

// One chapter line per scene of the manifest, "m:ss <label>"; the first is always 0:00.
export function chapterLines(m) {
  const shots = new Map((m?.shots ?? []).map((s) => [s.id, s]));
  return (m?.scenes ?? []).map((c, i) => ({ t: i ? Math.min(...c.shots.map((id) => shots.get(id)?.start ?? Infinity)) : 0, label: String(c.label ?? c.id).trim() }))
    .filter((c) => Number.isFinite(c.t)).map((c) => `${clock(c.t)} ${c.label}`);
}
const CHAPTER = /^\d{1,2}:\d{2}(:\d{2})?\s+\S/m;

// The draft with the chapter lines at the end of its "## description" section; a description
// that already lists chapters is left as it is (added: false).
export function withChapters(md, lines) {
  const text = String(md ?? "").replace(/\s*$/, "\n");
  if (!lines.length) return { text, added: false };
  const head = /^## description[ \t]*$/m.exec(text);
  if (!head) return { text: `${text}\n## description\n\n${lines.join("\n")}\n`, added: true };
  const start = head.index + head[0].length;
  const next = /^## /m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  const body = text.slice(start, end);
  if (CHAPTER.test(body)) return { text, added: false };
  return { text: `${text.slice(0, start)}${body.replace(/\s*$/, "")}\n\n${lines.join("\n")}\n${next ? "\n" : ""}${text.slice(end)}`, added: true };
}

const EMPTY_DRAFT = "## title\n\n\n## description\n\n";

export async function deliverText({ P, ctx, actor = "human", run = runCommand }) {
  const platform = need(P.commands, "platform");
  const lint = join(dirname(platform), "lint-vietnamese-content.mjs");
  return tracked(ctx.dir, { step: STEP.text, command: ["deliver_text", ctx.name], where: ctx.series.dir, actor }, async () => {
    const draft = join(ctx.dir, "delivery", TEXT_FILE);
    let made = null;
    if (!existsSync(draft)) {
      const src = join(dirname(ctx.out), `${basename(ctx.out)}-${TEXT_FILE}`);
      const base = readText(src);
      const r = withChapters(base ?? EMPTY_DRAFT, chapterLines(P.manifest.load(ctx.dir)));
      mkdirSync(dirname(draft), { recursive: true });
      writeFileSync(draft, r.text, { flag: "wx" });
      made = { source: base != null ? `S/${relative(ctx.series.dir, src)}` : null, chapters: r.added };
    }
    const checks = [];
    for (const [what, cmd] of [["check-platform youtube", node(platform, ["youtube", draft], ctx.dir)], ["lint viet-pro", node(lint, [draft], ctx.dir)]]) {
      const r = await run(cmd);
      checks.push({ what, code: r.code, tail: r.tail });
      if (r.code !== 0) return { ok: false, code: r.code, step: what, draft: `delivery/${TEXT_FILE}`, made, tail: [...new Set([...r.tail.filter((l) => /\bERROR\b/.test(l)), ...r.tail])].slice(0, 12), message: `${what} báo lỗi trong delivery/${TEXT_FILE}: sửa file đó (đạo diễn sửa được) rồi giao lại` };
    }
    const placed = [placeCopy(draft, ctx.out, TEXT_FILE)];
    const rc = await receipt(ctx, STEP.text, actor, placed, { inputs: { draft: `delivery/${TEXT_FILE}`, made } });
    return { ok: true, files: placed.map((p) => `${ctx.shown}/${p.name}`), made, warnings: checks.flatMap((c) => c.tail.filter((l) => /^WARN/.test(l))), receipt: rc.file };
  });
}

// ---- captions ------------------------------------------------------------------------------------

export const captionsReady = (text) => /^##\s*Facebook/im.test(text ?? "") && /^##\s*TikTok/im.test(text ?? "");

export async function deliverCaptions({ P, ctx, actor = "human", run = runCommand }) {
  const captions = need(P.commands, "captions");
  const gate = need(P.commands, "vietPro");
  return tracked(ctx.dir, { step: STEP.captions, command: ["deliver_captions", ctx.name], where: ctx.series.dir, actor }, async () => {
    if (!captionsReady(readText(join(ctx.dir, "CAPTIONS.md")))) return { ok: false, code: "no-captions", missing: "CAPTIONS.md", message: "Cần CAPTIONS.md ở gốc dự án với mục ## Facebook và ## TikTok (đạo diễn viết, qua viet-pro) trước khi giao phụ đề" };
    const srt = join(ctx.dir, "delivery", `${ctx.name}.srt`);
    const tmp = mkdtempSync(join(tmpdir(), "ms-srt-"));
    try {
      const made = await run(node(captions, ["--project", ctx.dir, "--out", join(tmp, "a.srt")], ctx.dir));
      if (made.code !== 0) return { ok: false, code: made.code, step: "captions", tail: made.tail, message: "Không tạo được phụ đề từ words.json" };
      if (!statSync(join(tmp, "a.srt")).size) return { ok: false, code: "no-cues", step: "captions", tail: made.tail, message: "Phụ đề rỗng: tập chưa có câu lồng tiếng nào có lời" };
      mkdirSync(dirname(srt), { recursive: true });
      copyFileSync(join(tmp, "a.srt"), srt);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const g = await run(node(gate, ["--project", ctx.dir, "--stage", "delivery"], ctx.dir));
    if (g.code !== 0) return { ok: false, code: g.code, step: "viet-pro delivery", tail: g.tail, message: "Cổng viet-pro --stage delivery chưa qua; sửa theo các dòng lỗi rồi giao lại" };
    const placed = [placeCopy(srt, ctx.out, `${ctx.name}.srt`), placeCopy(join(ctx.dir, "CAPTIONS.md"), ctx.out, "CAPTIONS.md")];
    const rc = await receipt(ctx, STEP.captions, actor, placed);
    return { ok: true, files: placed.map((p) => `${ctx.shown}/${p.name}`), receipt: rc.file };
  });
}

// ---- export --------------------------------------------------------------------------------------

const exportsOf = (input) => { const base = input.replace(/\.mp4$/i, ""); return TARGETS.map((t) => `${base}-${t}.mp4`); };

// The newest renders/*-final.mp4 of the project, or null.
export function latestFinal(dir) {
  const d = join(dir, "renders");
  let best = null;
  for (const f of existsSync(d) ? readdirSync(d) : []) {
    if (!/-final\.mp4$/i.test(f)) continue;
    const st = statSync(join(d, f));
    if (st.isFile() && (!best || st.mtimeMs > best.t)) best = { f: `renders/${f}`, t: st.mtimeMs };
  }
  return best?.f ?? null;
}

export async function deliverExport({ ctx, input, commands, actor = "human", run = runCommand, log = () => {} }) {
  return tracked(ctx.dir, { step: STEP.export, command: ["node", commands.export, "--project", ctx.dir, "--input", input, "--target", TARGETS.join(","), "--no-thumb"], where: ctx.series.dir, actor }, async () => {
    const abs = join(ctx.dir, input);
    if (!/^renders\/[^/]+\.mp4$/i.test(String(input ?? "")) || !existsSync(abs)) return { ok: false, code: "no-input", message: `chưa có video final ${input ?? ""}: xuất video (render-final) trước` };
    const outs = exportsOf(abs);
    const todo = TARGETS.filter((t, i) => !existsSync(outs[i]));
    let ran = null;
    if (todo.length) {
      log(`xuất ${input} cho ${todo.join(", ")}`);
      ran = await run({ ...node(commands.export, ["--project", ctx.dir, "--input", abs, "--target", todo.join(","), "--no-thumb"], ctx.dir), timeoutMs: 90 * 60000 }, { log });
      if (ran.code === 5) return { ok: false, code: 5, gate: "blocked", tail: ran.tail, message: "Cổng final chặn: xem các dòng của preflight bên dưới, sửa rồi giao lại" };
      if (ran.code !== 0) return { ok: false, code: ran.code, tail: ran.tail, message: `export lỗi (exit ${ran.code})` };
    }
    const missing = outs.filter((f) => !existsSync(f));
    if (missing.length) return { ok: false, code: "missing", message: `export xong mà thiếu ${missing.map((f) => basename(f)).join(", ")}` };
    const placed = outs.map((f) => placeCopy(f, ctx.out, basename(f)));
    const rc = await receipt(ctx, STEP.export, actor, placed, { params: { input, targets: TARGETS }, inputs: { exported: todo } });
    return { ok: true, files: placed.map((p) => `${ctx.shown}/${p.name}`), exported: todo, receipt: rc.file };
  });
}

// ---- thumbnail -----------------------------------------------------------------------------------

export const thumbPath = (i) => `delivery/thumb-${i}.jpg`;
export const thumbTag = (series, episode) => `${series.config.name} · tập ${episode}`.toUpperCase();

// Checks the request and writes the batch file of three thumbnail backgrounds. → the items.
export function prepareThumbnail(ctx, { line1, line2, accent = "yellow", prompt = null }) {
  for (const [k, v] of [["line1", line1], ["line2", line2]]) if (typeof v !== "string" || !v.trim() || v.length > 60 || /\p{Cc}/u.test(v)) throw err(400, `${k}: một dòng chữ, tối đa 60 ký tự`);
  if (!ACCENTS.includes(accent)) throw err(400, `accent là ${ACCENTS.join(" | ")}`);
  if (prompt != null && (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000)) throw err(400, "prompt: tối đa 2000 ký tự");
  if (!ctx.series.config.tools?.[THUMB_TOOL]) throw err(400, `series ${ctx.series.config.name} chưa khai báo công cụ ${THUMB_TOOL}`);
  const title = frontmatterOf(readText(join(ctx.dir, "BRIEF.md")) ?? "").title ?? `tập ${ctx.episode}`;
  const scene = prompt?.trim() || `Một cảnh nổi bật của tập "${title}", nhân vật chính ở nửa trái, biểu cảm rõ.`;
  const items = Array.from({ length: THUMBS }, (_, i) => ({ id: `thumb-${i + 1}`, kind: "thumbnail", prompt: `${scene} Phương án ${i + 1} trong ${THUMBS}, mỗi phương án một bố cục khác.`, background: "none", size: "1536x1024" }));
  mkdirSync(dirname(batchFile(ctx.dir, THUMB_BATCH)), { recursive: true });
  writeFileSync(batchFile(ctx.dir, THUMB_BATCH), JSON.stringify(items, null, 2) + "\n");
  return items;
}

export async function deliverThumbnail({ ctx, root, line1, line2, accent = "yellow", actor = "human", env = process.env, batch = runBatch, log = () => {} }) {
  return tracked(ctx.dir, { step: STEP.thumbnail, command: ["deliver_thumbnail", ctx.name], where: ctx.series.dir, actor }, async () => {
    const sum = await batch({ projectDir: ctx.dir, root, series: { dir: ctx.series.dir, config: ctx.series.config }, batch: THUMB_BATCH, actor, env, log });
    const state = JSON.parse(readFileSync(join(ctx.dir, ".opus", "assets", `${THUMB_BATCH}.json`), "utf8"));
    const made = [];
    const failed = [];
    for (let i = 1; i <= THUMBS; i++) {
      const s = state.items?.[`thumb-${i}`];
      if (!s?.raw || !["ready", "needs_review"].includes(s.status)) { failed.push(`thumb-${i}: ${s?.status ?? "chưa vẽ"}`); continue; }
      const cmd = buildArgv({ series: ctx.series, projectDir: ctx.dir, root: root ?? dirname(ctx.dir), tool: THUMB_TOOL, flags: { "--in": s.raw, "--out": thumbPath(i), "--line1": line1, "--line2": line2, "--accent": accent, "--tag": thumbTag(ctx.series, ctx.episode) } });
      mkdirSync(join(ctx.dir, "delivery"), { recursive: true });
      const p = spawnSync(cmd.cmd, cmd.argv, { cwd: cmd.cwd, timeout: cmd.timeoutMs, encoding: "utf8", maxBuffer: 4 << 20 });
      await writeReceipt(ctx.dir, { op: "series-tool", actor, tool: { name: THUMB_TOOL, file: relative(ctx.series.dir, cmd.file) }, params: { flags: { "--in": s.raw, "--out": thumbPath(i), "--accent": accent } }, inputs: { series: ctx.series.config.name, exit: p.status, signal: p.signal }, outputs: cmd.outputs.filter((f) => existsSync(f)) });
      if (p.status !== 0) { failed.push(`thumb-${i}: ${THUMB_TOOL} lỗi (exit ${p.status ?? p.signal}) ${redact(String(p.stderr || p.stdout).trim().split("\n").slice(-1)[0] ?? "")}`); continue; }
      made.push(thumbPath(i));
    }
    const ok = made.length > 0;
    return { ok, code: ok ? 0 : sum.stopped ? 3 : "no-thumb", thumbs: made, failed, batch: sum, tail: failed, message: ok ? `Đã có ${made.length} thumbnail trong delivery/; người dùng chọn một ảnh ở bảng Giao nộp` : `Chưa ra thumbnail nào: ${failed.join("; ")}` };
  });
}

// The user's pick: delivery/thumb-<n>.jpg becomes thumbnail.jpg of the delivery folder.
export async function pickThumbnail({ ctx, n }) {
  if (!Number.isInteger(n) || n < 1 || n > THUMBS) throw err(400, `n: chọn 1 đến ${THUMBS}`);
  const f = join(ctx.dir, thumbPath(n));
  if (!existsSync(f)) throw err(409, `chưa có ${thumbPath(n)}; vẽ thumbnail trước`);
  const placed = [placeCopy(f, ctx.out, "thumbnail.jpg")];
  const rc = await receipt(ctx, STEP.thumbnail, "human", placed, { params: { pick: n } });
  return { ok: true, files: placed.map((p) => `${ctx.shown}/${p.name}`), receipt: rc.file };
}

// ---- drive ---------------------------------------------------------------------------------------

// The files of the delivery folder an upload sends (mp4, jpg, srt, md; no dotfiles).
export function driveFiles(out) {
  if (!existsSync(out)) return [];
  return readdirSync(out, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith(".") && DRIVE_EXT.test(e.name)).map((e) => ({ name: e.name, size: statSync(join(out, e.name)).size })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function deliverDrive({ ctx, dryRun = false, actor = "human", env = process.env, upload = driveUpload, log = () => {} }) {
  return tracked(ctx.dir, { step: STEP.drive, command: ["drive_upload", ctx.name, ...(dryRun ? ["--dry-run"] : [])], where: ctx.series.dir, actor }, async () => {
    const files = driveFiles(ctx.out);
    const r = await upload({ dir: ctx.out, files, account: ctx.series.config.drive?.account, folder: ctx.series.config.drive?.folder, dryRun, env, log });
    const rc = await writeReceipt(ctx.dir, {
      op: STEP.drive, actor, tool: { name: "gws" },
      params: { episode: ctx.episode, folder: ctx.shown, drive_folder: r.folder ?? null, account: r.account ?? null, dry_run: dryRun },
      inputs: { ok: r.ok, error: r.error ?? null, folder_created: r.folder_created ?? false, files: (r.files ?? []).map(({ name, size, remote_size, link, result, error }) => ({ name, size, remote_size: remote_size ?? null, link: link ?? null, result, error: error ?? null })) },
    });
    return { ...redactDeep(r), receipt: rc.file };
  });
}

// ---- status --------------------------------------------------------------------------------------

function failureOf(dir, step) {
  try { const f = JSON.parse(readFileSync(join(dir, ".opus", "failures.json"), "utf8"))[step]; return f ? { code: f.code, count: f.count, last: f.last, tail: f.tail ?? [] } : null; } catch { return null; }
}

// What the delivery panel and delivery_status show: the folder, its files, each row's state.
export function deliveryStatus(P, ctx, commands = P?.commands ?? {}) {
  const files = driveFiles(ctx.out);
  const has = (re) => files.filter((f) => re.test(f.name)).map((f) => f.name);
  const row = (key, present) => ({ files: present, error: failureOf(ctx.dir, STEP[key]) });
  const lastDrive = listReceipts(ctx.dir, { op: STEP.drive, limit: 20 }).find((r) => r.params?.dry_run !== true) ?? null;
  const thumbs = Array.from({ length: THUMBS }, (_, i) => thumbPath(i + 1)).filter((f) => existsSync(join(ctx.dir, f)));
  return {
    series: ctx.series.config.name, episode: ctx.episode, folder: ctx.shown, exists: existsSync(ctx.out), files,
    rows: {
      video: row("export", has(new RegExp(`-(${TARGETS.join("|")})(-\\d+)?\\.mp4$`, "i"))),
      thumbnail: { ...row("thumbnail", has(/^thumbnail(-\d+)?\.jpe?g$/i)), drafts: thumbs },
      text: row("text", has(/^tieu-de-mo-ta(-\d+)?\.md$/i)),
      captions: row("captions", [...has(/\.srt$/i), ...has(/^CAPTIONS(-\d+)?\.md$/)]),
      drive: { ...row("drive", lastDrive ? lastDrive.inputs?.files?.filter((f) => f.link).map((f) => f.name) ?? [] : []), last: lastDrive ? { at: lastDrive.written, ok: lastDrive.inputs?.ok ?? null } : null },
    },
    input: latestFinal(ctx.dir),
    drive: ctx.series.config.drive ? { folder: ctx.series.config.drive.folder, account: maskAccount(ctx.series.config.drive.account) } : null,
    can: { text: Boolean(commands.platform), captions: Boolean(commands.captions && commands.vietPro), export: Boolean(commands.export), thumbnail: Boolean(ctx.series.config.tools?.[THUMB_TOOL]), drive: Boolean(ctx.series.config.drive) },
  };
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === SELF && process.argv[2] === "run") {
  const [, , , step, json] = process.argv;
  const done = (r) => { console.log(RESULT_PREFIX + JSON.stringify(redactDeep(r))); process.exit(r.ok ? 0 : 1); };
  try {
    const a = JSON.parse(json ?? "{}");
    const ctx = a.ctx;
    const log = (l) => console.log(redact(l));
    if (step === "export") done(await deliverExport({ ctx, input: a.input, commands: a.commands, actor: a.actor, log }));
    else if (step === "thumbnail") done(await deliverThumbnail({ ctx, root: a.root, line1: a.line1, line2: a.line2, accent: a.accent, actor: a.actor, log }));
    else if (step === "drive") done(await deliverDrive({ ctx, dryRun: a.dry_run === true, actor: a.actor, log }));
    else done({ ok: false, error: `không có bước ${step}` });
  } catch (e) { console.error(redact(e.message)); done({ ok: false, error: redact(e.message) }); }
}
