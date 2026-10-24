// routes/delivery.mjs — handing an episode of a series over (lib/delivery.mjs, docs/series.md).
// Every step writes into the series' delivery folder (delivery_dir, {N} the BRIEF's episode:) and
// never over a file: a different file of the same name is placed as <name>-2, -3 …
//   GET  /api/delivery?name=<project>
//        → deliveryStatus (folder, its files, the state of the five rows, the newest final render,
//          Drive folder and masked account) + cards (the waiting consent cards of thumbnail and
//          Drive) + jobs (the running export, thumbnail and Drive jobs of the project)
//   POST /api/delivery/text { name, actor? }       title and description, checked by viet-pro
//   POST /api/delivery/captions { name, actor? }   SRT from words.json and CAPTIONS.md, gate delivery
//        → both run now and answer { ok, files? , tail?, message? }
//   POST /api/delivery/export { name, input?, actor? }
//        → the project's "export" job: export.mjs youtube,facebook,tiktok on input (default the
//          newest renders/*-final.mp4), then the three files into the folder. → { job }
//   POST /api/delivery/thumbnail { name, line1, line2, accent?, prompt?, actor? }
//        → writes assets/gen/batches/thumbnail.json (3 backgrounds) and a consent card (kind codex,
//          action thumbnail). Nothing is drawn before the card is approved. → { waiting_consent, consent }
//   POST /api/delivery/thumbnail/pick { name, n }   delivery/thumb-<n>.jpg → thumbnail.jpg
//   POST /api/delivery/drive { name, dry_run?, actor? }
//        → dry_run true: the "drive" job now, gws' --dry-run on every write, no card. Else a
//          consent card (kind drive, action drive-upload) naming the files, their size, the masked
//          account and the folder. → { job } | { waiting_consent, consent }
//   POST /api/delivery/ask { name, row }
//        → queues a request for the director to fix that row (text: the draft's lint errors;
//          captions: CAPTIONS.md), with the last error of the row.
// Consent actions: thumbnail runs the thumbnail job (kind asset-batch, so it never runs beside
// another image batch of the project); drive-upload runs the drive job. Both cards carry the digest
// of what they show (lib/consent.mjs): changed before the yes, nothing runs and a fresh card is made.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { queueRequest } from "../director.mjs";
import { listJobs, startJob } from "../jobs.mjs";
import { listAgents } from "../lib/agents/index.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { batchFile, estimate, readBatch, validateBatch } from "../lib/assets/batch.mjs";
import { createCard, digestOf, listCards, registerAction, waitingCard } from "../lib/consent.mjs";
import { deliverCaptions, deliverText, deliveryOf, deliveryStatus, driveFiles, latestFinal, pickThumbnail, prepareThumbnail, THUMB_BATCH } from "../lib/delivery.mjs";
import { maskAccount } from "../lib/series.mjs";

const RUNNER = fileURLToPath(new URL("../lib/delivery.mjs", import.meta.url));
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
export const JOB = { export: "export", thumbnail: "asset-batch", drive: "drive" };
const bad = (status, msg) => Object.assign(new Error(msg), { status });
const actorOf = (b) => (typeof b.actor === "string" && ACTOR.test(b.actor) ? b.actor : "human");

function ctxOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  return { ...deliveryOf(c.P, pd.dir), path: pd.dir };
}
// What a runner child gets: plain JSON, no provider to load.
const plain = (ctx) => ({ dir: ctx.dir, name: ctx.name, episode: ctx.episode, out: ctx.out, shown: ctx.shown, series: { dir: ctx.series.dir, file: ctx.series.file, config: ctx.series.config } });

function startStep(c, ctx, step, arg) {
  try {
    return startJob({
      name: ctx.name, kind: JOB[step], cmd: process.execPath, args: [RUNNER, "run", step, JSON.stringify({ ...arg, ctx: plain(ctx) })], cwd: ctx.dir,
      meta: { step: `deliver-${step}`, actor: arg.actor }, onLine: (l) => redact(l),
    });
  } catch (e) {
    throw bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${ctx.name} đang có việc ${JOB[step]} chạy, chờ xong đã` : e.message);
  }
}

const mb = (n) => (n / 1048576).toFixed(1);
const DELIVERY_ACTIONS = ["thumbnail", "drive-upload"];

// What a card approves, as it is now. Thumbnail: the bytes of the batch file (written by the
// request, but the project's to change after it) and the words drawn on it. Drive: each file's
// name, size and mtime, the account and the folder.
const thumbDigest = (ctx, args) => {
  readBatch(ctx.dir, THUMB_BATCH);
  return digestOf({ batch: readFileSync(batchFile(ctx.dir, THUMB_BATCH)).toString("base64"), line1: args.line1, line2: args.line2, accent: args.accent });
};
const driveDigest = (ctx) => digestOf({
  files: driveFiles(ctx.out).map((f) => ({ ...f, mtime: statSync(join(ctx.out, f.name)).mtimeMs })),
  account: ctx.series.config.drive?.account ?? null, folder: ctx.series.config.drive?.folder ?? null,
});

// The thumbnail card of the batch file as it is now (args: the words). Reuses a waiting card of the
// same content; one of other content is declined as stale.
async function askThumbnail(ctx, args) {
  const digest = thumbDigest(ctx, args);
  const had = await waitingCard(ctx.dir, "thumbnail", () => true, digest);
  if (had) return { card: had, estimate: had.estimate, reused: true };
  const items = validateBatch(readBatch(ctx.dir, THUMB_BATCH), { series: ctx.series, projectDir: ctx.dir });
  const est = estimate(items, await listAgents());
  const card = createCard(ctx.dir, {
    kind: "codex", title: `${items.length} ảnh nền thumbnail, ước ${est.codex_turns} lượt vẽ (tối đa ${est.codex_max} lượt Codex gồm tự kiểm)`, count: items.length,
    estimate: est, quota: { accounts: est.accounts }, action: { name: "thumbnail", args }, digest,
  });
  return { card, estimate: est, reused: false };
}
async function askDrive(ctx) {
  const drive = ctx.series.config.drive;
  const files = driveFiles(ctx.out);
  if (!files.length) throw bad(409, `${ctx.shown} chưa có file nào để tải lên`);
  const digest = driveDigest(ctx);
  const had = await waitingCard(ctx.dir, "drive-upload", () => true, digest);
  if (had) return { card: had, reused: true };
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const card = createCard(ctx.dir, {
    kind: "drive", title: `Tải ${files.length} file (${mb(bytes)} MB) lên Drive ${maskAccount(drive.account)}/${drive.folder}`, count: files.length,
    estimate: { files: files.map((f) => f.name), bytes }, action: { name: "drive-upload", args: {} }, digest,
  });
  return { card, reused: false };
}

registerAction("thumbnail", (c, { args, card }) => {
  const ctx = ctxOf(c, c.name);
  return { job: startStep(c, ctx, "thumbnail", { root: c.root, line1: args.line1, line2: args.line2, accent: args.accent, actor: card.by ?? "human" }) };
}, {
  digest: (c, { args }) => thumbDigest(ctxOf(c, c.name), args),
  renew: async (c, { args }) => (await askThumbnail(ctxOf(c, c.name), args)).card,
});
registerAction("drive-upload", (c, { card }) => {
  const ctx = ctxOf(c, c.name);
  return { job: startStep(c, ctx, "drive", { dry_run: false, actor: card.by ?? "human" }) };
}, {
  digest: (c) => driveDigest(ctxOf(c, c.name)),
  renew: async (c) => (await askDrive(ctxOf(c, c.name))).card,
});

const ASK = {
  text: (ctx, err) => `Bản nháp delivery/tieu-de-mo-ta.md của tập ${ctx.episode} chưa qua kiểm tra${err ? ` (${err})` : ""}. Sửa lời trong file đó theo viet-pro (không đổi mục ## title, ## description, giữ mốc chương), rồi gọi deliver_text.`,
  captions: (ctx, err) => `Cần CAPTIONS.md ở gốc dự án với mục ## Facebook và ## TikTok cho tập ${ctx.episode}${err ? ` (lần trước: ${err})` : ""}. Viết theo viet-pro rồi gọi deliver_captions.`,
};

export const ROUTES = [
  {
    method: "GET", path: "/api/delivery",
    handler(c) {
      const ctx = ctxOf(c, c.q("name"));
      const cards = listCards(ctx.dir, { status: "waiting" }).filter((x) => DELIVERY_ACTIONS.includes(x.action?.name));
      const jobs = listJobs(ctx.name).filter((j) => /^deliver-/.test(j.meta?.step ?? "") && (j.status === "running" || j.status === "cancelling"));
      return { ...deliveryStatus(c.P, ctx), cards, jobs };
    },
  },
  {
    method: "POST", path: "/api/delivery/text",
    async handler(c) { const b = c.body ?? {}; return deliverText({ P: c.P, ctx: ctxOf(c, b.name), actor: actorOf(b) }); },
  },
  {
    method: "POST", path: "/api/delivery/captions",
    async handler(c) { const b = c.body ?? {}; return deliverCaptions({ P: c.P, ctx: ctxOf(c, b.name), actor: actorOf(b) }); },
  },
  {
    method: "POST", path: "/api/delivery/export",
    handler(c) {
      const b = c.body ?? {};
      const ctx = ctxOf(c, b.name);
      if (!c.P.commands?.export) throw bad(400, "provider chưa có lệnh export; cập nhật plugin (npm run setup) rồi thử lại");
      if (b.input != null && (typeof b.input !== "string" || !/^renders\/[^/]+\.mp4$/i.test(b.input))) throw bad(400, "input: renders/<tên>.mp4 của dự án");
      const input = b.input ?? latestFinal(ctx.dir);
      if (!input) throw bad(409, "chưa có renders/*-final.mp4: bấm Xuất video trước");
      return { job: startStep(c, ctx, "export", { input, commands: { export: c.P.commands.export }, actor: actorOf(b) }), input };
    },
  },
  {
    method: "POST", path: "/api/delivery/thumbnail",
    async handler(c) {
      const b = c.body ?? {};
      const ctx = ctxOf(c, b.name);
      const accent = b.accent ?? "yellow";
      prepareThumbnail(ctx, { line1: b.line1, line2: b.line2, accent, prompt: b.prompt ?? null });
      const { card, estimate: est, reused } = await askThumbnail(ctx, { line1: b.line1.trim(), line2: b.line2.trim(), accent });
      if (reused) return { waiting_consent: true, consent: card, message: "Đã có thẻ đồng ý vẽ thumbnail này đang chờ người dùng" };
      return { waiting_consent: true, consent: card, estimate: est, message: "Đã tạo thẻ đồng ý; chưa tốn lượt nào. Kết thúc lượt, chờ người dùng đồng ý ở bảng Giao nộp." };
    },
  },
  {
    method: "POST", path: "/api/delivery/thumbnail/pick",
    async handler(c) { const b = c.body ?? {}; return pickThumbnail({ ctx: ctxOf(c, b.name), n: b.n }); },
  },
  {
    method: "POST", path: "/api/delivery/drive",
    async handler(c) {
      const b = c.body ?? {};
      const ctx = ctxOf(c, b.name);
      if (b.dry_run != null && typeof b.dry_run !== "boolean") throw bad(400, "dry_run: true hoặc false");
      const drive = ctx.series.config.drive;
      if (!drive?.account || !drive?.folder) throw bad(400, `series ${ctx.series.config.name} chưa khai báo drive.account và drive.folder`);
      if (b.dry_run === true) {
        if (!driveFiles(ctx.out).length) throw bad(409, `${ctx.shown} chưa có file nào để tải lên`);
        return { job: startStep(c, ctx, "drive", { dry_run: true, actor: actorOf(b) }), dry_run: true };
      }
      const { card, reused } = await askDrive(ctx);
      if (reused) return { waiting_consent: true, consent: card, message: "Đã có thẻ đồng ý tải lên Drive đang chờ người dùng" };
      return { waiting_consent: true, consent: card, message: "Đã tạo thẻ đồng ý; chưa tải gì. Chờ người dùng đồng ý ở bảng Giao nộp." };
    },
  },
  {
    method: "POST", path: "/api/delivery/ask",
    handler(c) {
      const b = c.body ?? {};
      if (!Object.hasOwn(ASK, String(b.row))) throw bad(400, `row là ${Object.keys(ASK).join(" | ")}`);
      const ctx = ctxOf(c, b.name);
      const err = deliveryStatus(c.P, ctx).rows[b.row]?.error;
      const last = err ? redact(String(err.tail?.at(-1) ?? err.code)).slice(0, 300) : null;
      const r = queueRequest(c.P, b.name, ctx.path, { scope: "project", text: ASK[b.row](ctx, last) });
      return { ok: true, request: r.request?.id ?? null };
    },
  },
];
