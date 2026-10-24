// routes/assets.mjs — image batches of a series episode over HTTP (lib/assets/batch.mjs,
// docs/assets.md).
//   GET  /api/assets?name=<project>   → { series, batches: [batchStatus + consent (the waiting
//                                       card of that batch) + job (the running batch job)] }
//   POST /api/assets/batch { name, batch, actor? }
//        → checks the batch file and writes a consent card (kind codex, action asset-batch):
//          { waiting_consent: true, consent, estimate, message }. A batch that already has a
//          waiting card answers that card. Nothing is drawn until the card is approved.
//   POST /api/assets/redo { name, batch, ids, reason?, actor? }
//        → redraws those images now, as the project's "asset-batch" job: the user's click is the
//          consent. A redraw the director (or a tool) asks for counts per image; after
//          MAX_AI_REDOS of them the image needs the user (409). from: "board" (the Tài sản tab)
//          needs a reason.
//   POST /api/assets/approve { name, batch, board, ids, notes? }
//        → the user approves images of one board: board is character:<id> (poses of that
//          character), background or prop. Every id must be keyed (or needs_review, when the user
//          still picks it). The files go into the series, never over a different file:
//          character: each raw drawing to its target, and characters/<id>/approval.json written
//          (old content kept, the old file as previous); background: the keyed image to its target
//          or the writable "backgrounds" folder, and to assets/bg/ of the project; prop: the keyed
//          .pxl to the writable "props" folder. Then a line in DEMO.md, the images approved, a
//          receipt (op asset-approve) and a request for the director to carry on.
// The consent action asset-batch starts the whole batch as the "asset-batch" job (one per
// project at a time). When a batch job started by the user ends, a request is queued for the
// director to carry on once the user has gone through the board.
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BY, writeDemoNote } from "../gates.mjs";
import { queueRequest } from "../director.mjs";
import { running, startJob } from "../jobs.mjs";
import { listAgents } from "../lib/agents/index.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { batchStatus, estimate, estimateTitle, listBatches, MAX_AI_REDOS, readBatch, readState, summarize, validateBatch, writeState } from "../lib/assets/batch.mjs";
import { createCard, listCards, registerAction } from "../lib/consent.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { ID as CHAR_ID, seriesFor, seriesPath } from "../lib/series.mjs";
import { insideProject } from "../lib/tools.mjs";

export const KIND = "asset-batch";
const BATCH = fileURLToPath(new URL("../lib/assets/batch.mjs", import.meta.url));
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
const bad = (status, msg) => Object.assign(new Error(msg), { status });
const actorOf = (b) => (typeof b.actor === "string" && ACTOR.test(b.actor) ? b.actor : "human");
const byAi = (actor) => /^(director|tool)\b/.test(actor);

function projectOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  const series = seriesFor(c.P, pd.dir);
  if (!series) throw bad(404, `${name} không thuộc series nào: đợt ảnh cần series (BRIEF.md có dòng series:)`);
  return { path: pd.dir, dir: realpathSync(pd.dir), series };
}
const waitingCard = (dir, batch) => listCards(dir, { status: "waiting" }).find((x) => x.action?.name === KIND && x.action.args?.batch === batch) ?? null;

// The line the director gets when a batch it did not start itself has ended.
export function doneText(batch, sum) {
  const head = `Đợt ${batch} ${sum.stopped ? "dừng giữa chừng" : "xong"}: ${sum.passed} ảnh đạt, ${sum.review} ảnh cần xem.`;
  return `${head}${sum.message ? ` ${sum.message}` : ""} Gọi asset_status rồi làm tiếp (nhập rig, nền, đạo cụ) sau khi người dùng duyệt bảng.`;
}

function startBatch(c, name, { batch, ids = null, reason = null, actor, aiRedo = false }) {
  const p = projectOf(c, name);
  validateBatch(readBatch(p.dir, batch), { series: p.series, projectDir: p.dir });
  const arg = { projectDir: p.dir, root: c.root, series: { dir: p.series.dir, config: p.series.config }, batch, ids, reason, aiRedo, actor };
  const notify = !byAi(actor);
  try {
    return startJob({
      name, kind: KIND, cmd: process.execPath, args: [BATCH, "run", JSON.stringify(arg)], cwd: p.dir,
      meta: { step: KIND, batch, ids, actor }, onLine: (l) => redact(l),
      onExit: () => {
        if (!notify) return;
        try { queueRequest(c.P, name, p.path, { scope: "project", text: doneText(batch, summarize(readState(p.dir, batch), ids)) }); }
        catch (e) { console.error(`motion-studio: không xếp được yêu cầu cho đạo diễn sau đợt ${batch}: ${e.message}`); }
      },
    });
  } catch (e) {
    throw bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${name} đang chạy một đợt ảnh, chờ xong đã` : e.message);
  }
}

// ---- approving a board ---------------------------------------------------------------------------
const APPROVABLE = ["keyed", "needs_review"];
const inside = (p, dir) => p === dir || p.startsWith(dir + sep);
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const localDate = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");

// The realpath of the deepest existing part of p, with the rest appended.
function realish(p) {
  let probe = p;
  const rest = [];
  while (!existsSync(probe)) { rest.unshift(basename(probe)); const up = dirname(probe); if (up === probe) break; probe = up; }
  return join(realpathSync(probe), ...rest);
}

// board → { kind, char, label }: character:<id> takes the poses of that character.
function boardOf(board) {
  if (board === "background" || board === "prop") return { kind: board, char: null };
  const m = /^character:(.+)$/.exec(String(board ?? ""));
  if (m && CHAR_ID.test(m[1])) return { kind: "pose", char: m[1] };
  throw bad(400, `board là character:<id nhân vật>, background hoặc prop (nhận "${String(board ?? "")}")`);
}
const onBoard = (it, b) => it.kind === b.kind && (b.char == null || it.character === b.char);

// An absolute path in the series that a writable folder of it holds (not under build/, not a link).
function writableFile(series, file, char) {
  const real = realish(file);
  const bases = Object.values(series.config.writable ?? {}).flatMap((rel) => { try { return [realish(seriesPath(series, rel, { char }))]; } catch { return []; } });
  const rel = relative(series.dir, real);
  if (!bases.some((d) => inside(real, d)) || inside(real, join(series.dir, "build"))) throw bad(400, `S/${rel} không nằm trong thư mục writable nào của series (${Object.keys(series.config.writable ?? {}).join(", ") || "không có"})`);
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw bad(400, `S/${rel} là symlink, không ghi qua được`);
  return real;
}
// The folder of writable key `key`, for an image that has no target.
function writableDir(series, key, what) {
  const rel = series.config.writable?.[key];
  if (!rel) throw bad(400, `${what}: series chưa khai báo khóa writable "${key}" (hoặc ảnh cần target)`);
  return seriesPath(series, rel);
}

// One copy to make: refused when the destination holds a different file. same: already there.
function plannedCopy(from, to, shown) {
  const st = lstatSync(to, { throwIfNoEntry: false });
  if (st?.isSymbolicLink()) throw bad(409, `${shown} là symlink, không ghi qua được`);
  if (st && !st.isFile()) throw bad(409, `${shown} đã có và không phải file`);
  if (st && sha(to) !== sha(from)) throw bad(409, `${shown} đã có một file khác (sha ${sha(to).slice(0, 12)}); không ghi đè ảnh đã duyệt. Đặt target khác hoặc chuyển file cũ đi rồi duyệt lại`);
  return { from, to, shown, same: Boolean(st) };
}
const sShown = (series, f) => `S/${relative(series.dir, f)}`;

function writeJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  renameSync(tmp, file);
}

// Checks everything first, then copies; nothing is written when one image is refused.
export async function approveBoard(c, b) {
  const p = projectOf(c, b.name);
  const board = boardOf(b.board);
  const items = validateBatch(readBatch(p.dir, b.batch), { series: p.series, projectDir: p.dir });
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids)] : [];
  if (!ids.length || ids.length > 50) throw bad(400, "ids: 1 đến 50 id ảnh của bảng");
  if (b.notes != null && (typeof b.notes !== "string" || b.notes.length > 1000)) throw bad(400, "notes: chữ, tối đa 1000 ký tự");
  const notes = b.notes?.replace(/\s+/g, " ").trim() || null;
  if (running(b.name, KIND)) throw bad(409, `${b.name} đang chạy một đợt ảnh, chờ xong rồi duyệt`);
  const state = readState(p.dir, b.batch);
  if (!state || state.running) throw bad(409, state ? `đợt ${b.batch} đang chạy, chờ xong rồi duyệt` : `đợt ${b.batch} chưa chạy`);
  const series = p.series;
  const copies = [];
  const picked = ids.map((id) => {
    const it = items.find((x) => x.id === id);
    if (!it) throw bad(400, `đợt ${b.batch} không có ảnh ${String(id)}`);
    if (!onBoard(it, board)) throw bad(400, `ảnh ${id} không thuộc bảng ${b.board}`);
    const s = state.items?.[id];
    if (!APPROVABLE.includes(s?.status)) throw bad(409, `ảnh ${id} đang ${s?.status ?? "chưa vẽ"}, chỉ duyệt được ảnh đã tách nền (keyed) hoặc cần xem (needs_review)`);
    const src = (rel, what) => {
      const f = rel ? insideProject(p.dir, rel, `${id} ${what}`) : null;
      if (!f || !existsSync(f)) throw bad(409, `ảnh ${id} chưa có file ${what}${rel ? ` (${rel})` : ""}`);
      return f;
    };
    if (board.kind === "pose") {
      const raw = src(s.raw, "raw");
      if (it.abs_target) copies.push(plannedCopy(raw, writableFile(series, it.abs_target, it.character), sShown(series, it.abs_target)));
      return { id, image: it.abs_target ? sShown(series, it.abs_target) : s.raw };
    }
    const keyed = src(s.keyed, "keyed");
    if (board.kind === "background") {
      const to = it.abs_target ?? join(writableDir(series, "backgrounds", id), `${id.replace(/^bg-/, "")}.png`);
      const dest = writableFile(series, to, null);
      copies.push(plannedCopy(keyed, dest, sShown(series, dest)));
      const local = insideProject(p.dir, `assets/bg/${basename(dest)}`, `${id} assets/bg`);
      copies.push(plannedCopy(keyed, local, `assets/bg/${basename(dest)}`));
      return { id, image: sShown(series, dest) };
    }
    const name = it.target ? basename(it.target).replace(/\.png$/i, "") : id.replace(/^prop-/, "");
    const dest = writableFile(series, join(writableDir(series, "props", id), `${name}.pxl`), null);
    copies.push(plannedCopy(keyed, dest, sShown(series, dest)));
    return { id, image: sShown(series, dest) };
  });
  const dests = new Map();
  for (const x of copies) {
    if (dests.has(x.to) && dests.get(x.to) !== sha(x.from)) throw bad(409, `hai ảnh cùng ghi vào ${x.shown}`);
    dests.set(x.to, sha(x.from));
  }

  let approvalFile = null, approval = null;
  const now = new Date();
  if (board.kind === "pose") {
    if (!series.config.characters) throw bad(400, "series chưa khai báo thư mục characters");
    approvalFile = join(seriesPath(series, series.config.characters), board.char, "approval.json");
    writableFile(series, approvalFile, board.char);
    let previous = null;
    if (existsSync(approvalFile)) {
      try { previous = JSON.parse(readFileSync(approvalFile, "utf8")); } catch (e) { throw bad(409, `${sShown(series, approvalFile)} hỏng (${e.message}); sửa tay trước khi duyệt`); }
      if (!previous || typeof previous !== "object" || Array.isArray(previous)) throw bad(409, `${sShown(series, approvalFile)} không phải một object JSON; sửa tay trước khi duyệt`);
    }
    approval = { ...(previous ?? {}), approved: true, date: localDate(now), by: BY, notes, images: picked.map((x) => x.image), previous };
  }

  const t0 = new Date();
  for (const x of copies) {
    if (x.same || existsSync(x.to)) continue;
    mkdirSync(dirname(x.to), { recursive: true });
    copyFileSync(x.from, x.to, constants.COPYFILE_EXCL);
  }
  if (approvalFile) writeJson(approvalFile, approval);
  const at = now.toISOString();
  for (const { id } of picked) state.items[id] = { ...state.items[id], status: "approved", approved: { at, by: BY, board: b.board } };
  writeState(p.dir, b.batch, state);
  const demo = writeDemoNote(p.dir, `tài sản ${b.board}: approved ${BY} ${at} ${ids.join(", ")}`);
  const outputs = [...new Set([...copies.map((x) => x.to), ...(approvalFile ? [approvalFile] : []), join(p.dir, "DEMO.md")])];
  const receipt = await writeReceipt(p.dir, { op: "asset-approve", actor: "human", params: { batch: b.batch, board: b.board, ids, notes }, inputs: { series: series.config.name, by: BY, images: picked.map((x) => x.image) }, outputs, started: t0, ended: new Date() });
  let request = null;
  try { request = queueRequest(c.P, b.name, p.path, { scope: "project", text: approvedText(b.board, ids) }).request?.id ?? null; }
  catch (e) { console.error(`motion-studio: không xếp được yêu cầu cho đạo diễn sau khi duyệt bảng ${b.board}: ${e.message}`); }
  return { ok: true, board: b.board, ids, images: picked.map((x) => x.image), copied: copies.filter((x) => !x.same).map((x) => x.shown), approval: approvalFile ? sShown(series, approvalFile) : null, demo, receipt: receipt.file, request };
}

// The line the director gets once a board is approved.
export const approvedText = (board, ids) => `Bảng ${board} đã duyệt: ${ids.join(", ")}. Làm tiếp: build-rig/props, sync-to-project, dùng tên mới trong scenes.`;

registerAction(KIND, (ctx, { args, card }) => ({ job: startBatch(ctx, ctx.name, { batch: args.batch, actor: card.by ?? "human" }) }));

export const ROUTES = [
  {
    method: "GET", path: "/api/assets",
    handler(c) {
      const name = c.q("name");
      const p = projectOf(c, name);
      const job = running(name, KIND);
      const batches = listBatches(p.dir).map((b) => {
        let s;
        try { s = batchStatus(p.dir, b); } catch (e) { s = { batch: b, error: e.message, items: [] }; }
        const card = waitingCard(p.dir, b);
        return { ...s, consent: card, job: job?.meta?.batch === b ? { id: job.id, status: job.status, started: job.started } : null };
      });
      return { series: p.series.config.name, batches };
    },
  },
  {
    method: "POST", path: "/api/assets/batch",
    async handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const items = validateBatch(readBatch(p.dir, b.batch), { series: p.series, projectDir: p.dir });
      const message = "Chờ người dùng bấm Đồng ý ở tab Tài sản";
      const had = waitingCard(p.dir, b.batch);
      if (had) return { waiting_consent: true, consent: had, estimate: had.estimate, message };
      const est = estimate(items, await listAgents());
      const card = createCard(p.dir, { kind: "codex", title: estimateTitle(b.batch, est), count: items.length, estimate: est, quota: { accounts: est.accounts }, action: { name: KIND, args: { batch: b.batch } } });
      return { waiting_consent: true, consent: card, estimate: est, message };
    },
  },
  {
    method: "POST", path: "/api/assets/redo",
    handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const items = readBatch(p.dir, b.batch);
      const ids = Array.isArray(b.ids) ? [...new Set(b.ids)] : [];
      if (!ids.length || ids.length > 50) throw bad(400, "ids: 1 đến 50 id ảnh của đợt");
      for (const id of ids) if (!(Array.isArray(items) && items.some((it) => it?.id === id))) throw bad(400, `đợt ${b.batch} không có ảnh ${String(id)}`);
      if (b.reason != null && (typeof b.reason !== "string" || b.reason.length > 1000)) throw bad(400, "reason: chữ, tối đa 1000 ký tự");
      if (b.from === "board" && !b.reason?.trim()) throw bad(400, "reason: cần một câu lý do vẽ lại");
      const actor = actorOf(b);
      const aiRedo = byAi(actor);
      if (aiRedo) {
        const st = readState(p.dir, b.batch);
        const spent = ids.filter((id) => (st?.items?.[id]?.ai_redos ?? 0) >= MAX_AI_REDOS);
        if (spent.length) throw bad(409, `ảnh ${spent.join(", ")} đã vẽ lại ${MAX_AI_REDOS} lần theo yêu cầu của AI trong đợt này; cần người dùng xem ở tab Tài sản`);
      }
      const job = startBatch(c, b.name, { batch: b.batch, ids, reason: b.reason?.trim() || null, actor, aiRedo });
      return { job };
    },
  },
  {
    method: "POST", path: "/api/assets/approve",
    handler(c) { return approveBoard(c, c.body ?? {}); },
  },
];
