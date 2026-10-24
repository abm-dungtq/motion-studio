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
//          MAX_AI_REDOS of them the image needs the user (409).
// The consent action asset-batch starts the whole batch as the "asset-batch" job (one per
// project at a time). When a batch job started by the user ends, a request is queued for the
// director to carry on once the user has gone through the board.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { queueRequest } from "../director.mjs";
import { running, startJob } from "../jobs.mjs";
import { listAgents } from "../lib/agents/index.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { batchStatus, estimate, estimateTitle, listBatches, MAX_AI_REDOS, readBatch, readState, summarize, validateBatch } from "../lib/assets/batch.mjs";
import { createCard, listCards, registerAction } from "../lib/consent.mjs";
import { seriesFor } from "../lib/series.mjs";

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
];
