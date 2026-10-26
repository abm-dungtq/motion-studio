// routes/videogen.mjs — AI clips for a shot through the G-Labs Studio webhook (lib/videogen/).
//   GET  /api/videogen/status            → { glabs_url, up, error, key, today, cap, job }
//   POST /api/videogen/shot {name, shot, base, prompt, mode?, aspect?, seconds, resolution?,
//                            refs?, again?}
//                                        → starts the "videogen" job (node lib/videogen/run.mjs
//                                          run …): one POST to G-Labs, follow, download, receipt
//   POST /api/videogen/resume {name, id} → follows a submitted task again (no new POST)
//   POST /api/videogen/cancel {name}     → marks the item cancelled by the user, then SIGTERM: the
//                                          runner stops its own G-Labs task
//   GET  /api/videogen/items?name=       → the project's clips of the last 7 days
//   POST /api/videogen/attach {name, id, base}
//                                        → puts a collected clip into its shot again
//   POST /api/videogen/import {name, id, base, path}
//                                        → copies a clip the user downloaded from G-Labs for an
//                                          item whose result is unknown, then attaches it
// When the runner ends with a clip, onExit puts it into the shot's assets (set_shot, actor
// human, Undo takes it back) and asks the director to place it muted.
// The server never reads the G-Labs key: it only checks the env var or that glabs.env exists.
// One videogen job at a time in the whole Studio; the daily cap is checked here and again in the
// runner.
import { constants as FS, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, jobLog, listJobs } from "../jobs.mjs";
import { glabsKeyFile, videogenSettings } from "../lib/config.mjs";
import { getVideogen, requestVideogenCancel, today, updateVideogen, videogenCount, videogenItems } from "../lib/ledger.mjs";
import { normalizeSpec, specDigest } from "../lib/videogen/spec.mjs";
import { checkUrl, health } from "../lib/videogen/glabs.mjs";
import { attachAsset } from "../lib/attach.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { askDirector, gatewayStatus } from "./fx.mjs";

export const VIDEOGEN_KIND = "videogen";
const RUN = fileURLToPath(new URL("../lib/videogen/run.mjs", import.meta.url));
const RESULT = "RESULT ";
const LOCK_WAIT_MS = 300;
const fail = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const keyPresent = () => Boolean(process.env.G_LABS_WEBHOOK_API_KEY?.trim()) || existsSync(glabsKeyFile());
const live = (j) => j.kind === VIDEOGEN_KIND && (j.status === "running" || j.status === "cancelling");
const runningVideogen = () => listJobs().find(live) ?? null;
const resultOf = (job) => {
  const l = [...(job.tail ?? [])].reverse().find((x) => x.startsWith(RESULT));
  try { return l ? JSON.parse(l.slice(RESULT.length)) : null; } catch { return null; }
};
const pollMs = (b) => (Number.isFinite(b.poll_ms) ? { poll_ms: Math.max(50, b.poll_ms) } : {});
const BUSY = "đang có một clip AI khác đang tạo (cả Studio chỉ một lúc một clip)";

const directorText = (rel, seconds, shot) => `Đặt clip AI ${rel} (${seconds}s) vào shot ${shot}: phủ kín khung, tắt tiếng (muted), giữ nguyên lời và chữ trên hình. Clip có trong assets của shot.`;

// Puts a collected clip into its shot and asks the director to place it. Never throws.
function attachDone(c, name, dir, r) {
  try {
    const m = c.P.manifest.load(dir);
    if (!m?.capabilities?.editable) { updateVideogen(r.id, { note: "dự án chỉ xem; bấm Gắn vào shot sau" }); return; }
    const shot = m.shots?.find((x) => x.id === r.shot);
    const a = attachAsset(dir, c.P.gateway, { shot: r.shot, base: m.version, rel: r.rel, manifest: m, lockWaitMs: LOCK_WAIT_MS });
    if (a.gateway?.code) { updateVideogen(r.id, { error: `gắn vào shot: ${a.gateway.error}` }); return; }
    const version = a.unchanged ? a.version : a.gateway.version;
    updateVideogen(r.id, { state: "attached", version });
    askDirector(c, name, dir, { target: r.shot, t: shot?.start ?? 0, base: version, text: directorText(r.rel, r.seconds, r.shot) });
  } catch (e) {
    try { updateVideogen(r.id, { error: `gắn vào shot: ${e.message}` }); } catch { /* ledger gone */ }
  }
}

function startRun(c, name, dir, arg) {
  try {
    return c.startJob({
      name, kind: VIDEOGEN_KIND, cmd: process.execPath, args: [RUN, "run", JSON.stringify(arg)], cwd: dir,
      meta: { step: "videogen", shot: arg.spec?.shot ?? null, id: arg.id ?? null },
      onExit: (job) => { const r = resultOf(job); if (r?.ok) attachDone(c, name, dir, r); },
    });
  } catch (e) {
    throw e.code === "BUSY" ? fail(409, BUSY) : e;
  }
}

// G-Labs up and a key present, else the error to answer.
async function ready() {
  const v = videogenSettings();
  const base = checkUrl(v.glabs_url);
  const h = await health(base);
  if (!h.up) throw fail(503, h.error ?? "Mở G-Labs Studio (tab Webhook, Start)");
  if (!keyPresent()) throw fail(412, "Chưa có khoá G-Labs: chép khoá ở tab Webhook vào " + glabsKeyFile());
  return { v, base };
}

// An item of this project, else 404.
function itemOf(dir, id) {
  const it = typeof id === "string" ? getVideogen(id) : null;
  if (!it || !videogenItems(dir).some((x) => x.id === id)) throw fail(404, "không có lần tạo này trong dự án");
  return it;
}

// set_shot assets for a clip already in the project, then the director request.
function attachNow(c, name, dir, it, base, rel) {
  const m = c.P.manifest.load(dir);
  if (!m?.capabilities?.editable) throw fail(423, "dự án chỉ xem, sửa qua đạo diễn");
  if (base !== m.version) throw fail(409, "đã có thay đổi mới, tải lại rồi thử lại");
  const a = attachAsset(dir, c.P.gateway, { shot: it.shot, base, rel, manifest: m, lockWaitMs: LOCK_WAIT_MS });
  if (a.gateway?.code) return { status: gatewayStatus(c.P.gateway.EXIT ?? {}, a.gateway.code), error: a.gateway.error };
  const version = a.unchanged ? a.version : a.gateway.version;
  updateVideogen(it.id, { state: "attached", version, error: null });
  const shot = m.shots.find((x) => x.id === it.shot);
  const seconds = it.spec_summary?.seconds ?? "?";
  askDirector(c, name, dir, { target: it.shot, t: shot?.start ?? 0, base: version, text: directorText(rel, seconds, it.shot) });
  return { version, rel };
}

export const ROUTES = [
  {
    method: "GET", path: "/api/videogen/status", provider: false,
    async handler() {
      const v = videogenSettings();
      let up = { up: false, error: "URL G-Labs không hợp lệ" };
      try { up = await health(checkUrl(v.glabs_url)); } catch { /* bad url */ }
      return { glabs_url: v.glabs_url, up: up.up, error: up.up ? null : up.error ?? "Mở G-Labs Studio (tab Webhook, Start)", key: keyPresent(), today: videogenCount(today()), cap: v.daily_clips, job: runningVideogen() };
    },
  },
  {
    method: "POST", path: "/api/videogen/shot",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
      const m = c.P.manifest.load(pd.dir);
      if (!m?.capabilities?.editable) throw fail(423, "dự án chỉ xem, sửa qua đạo diễn");
      if (b.base !== m.version) throw fail(409, "đã có thay đổi mới, tải lại rồi thử lại");
      if (!m.shots?.some((x) => x.id === b.shot)) throw fail(404, `không có shot ${String(b.shot ?? "")}`);
      const spec = normalizeSpec(pd.dir, { ...b, shot: b.shot });
      if (runningVideogen()) throw fail(409, BUSY);
      const { v, base } = await ready();
      if (videogenCount() >= v.daily_clips) throw fail(403, `đã đủ ${v.daily_clips} clip AI hôm nay (studio.json videogen.daily_clips)`);
      const digest = await specDigest(pd.dir, spec);
      // The same request before: an unknown result (or an intent whose runner died while sending)
      // may have cost credits; a task G-Labs still has is followed, not sent again. No job runs
      // now (checked above), so no runner owns such an item.
      // Only the newest item of this digest counts: an old unknown result followed by a good retry
      // is settled. `again` overrides an unknown result only, never a task G-Labs still has.
      const last = videogenItems(pd.dir).find((x) => x.digest === digest);
      const dup = last && ["indeterminate", "intent", "submitted", "running"].includes(last.state) ? last : null;
      if (dup && (["submitted", "running"].includes(dup.state) || b.again !== dup.id)) {
        return ["submitted", "running"].includes(dup.state)
          ? c.send(409, { error: "G-Labs đang có task của đúng yêu cầu này. Bấm Theo dõi tiếp thay vì tạo lại.", code: "RESUMABLE", id: dup.id })
          : c.send(409, { error: "Lần trước của đúng yêu cầu này chưa rõ kết quả và có thể đã tốn credit. Nhập file đã tải, hoặc xác nhận Tạo lại.", code: "DUPLICATE", id: dup.id });
      }
      // No await between this check and the start.
      if (runningVideogen()) throw fail(409, BUSY);
      const job = startRun(c, b.name, pd.dir, { action: "new", dir: pd.dir, spec, digest, base_url: base, cap: v.daily_clips, ...pollMs(b) });
      return { job };
    },
  },
  {
    method: "POST", path: "/api/videogen/resume",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      const it = itemOf(pd.dir, b.id);
      if (!["submitted", "running"].includes(it.state) || !it.task_id) throw fail(409, "việc này không theo dõi tiếp được");
      if (runningVideogen()) throw fail(409, BUSY);
      const { v, base } = await ready();
      if (runningVideogen()) throw fail(409, BUSY);
      const job = startRun(c, b.name, pd.dir, { action: "resume", id: it.id, dir: pd.dir, base_url: base, cap: v.daily_clips, ...pollMs(b) });
      return { job };
    },
  },
  {
    method: "POST", path: "/api/videogen/cancel",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      const j = listJobs(b.name).find(live);
      if (!j) throw fail(404, "không có clip AI nào đang tạo trong dự án này");
      // The item: resume jobs carry it; a new job prints INTENT <id>, or (cancelled before that
      // line arrived) it is the newest unfinished item since the job started.
      const id = j.meta?.id ?? (jobLog(j.id) ?? []).find((l) => l.startsWith("INTENT "))?.slice(7)
        ?? videogenItems(pd.dir).find((x) => x.created >= j.started && ["intent", "submitted", "running"].includes(x.state))?.id ?? null;
      if (id) requestVideogenCancel(id);
      return { job: cancel(j.id) };
    },
  },
  {
    method: "GET", path: "/api/videogen/items",
    async handler(c) {
      const pd = c.projectDir(c.q("name"));
      if (pd.error) return c.send(pd.status, { error: pd.error });
      return { items: videogenItems(pd.dir) };
    },
  },
  {
    method: "POST", path: "/api/videogen/attach",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
      // The runner writes the same day file; no ledger write from here while it runs.
      if (runningVideogen()) throw fail(409, BUSY);
      const it = itemOf(pd.dir, b.id);
      // A clip cancelled after its download is paid for and on disk: it attaches like a collected one.
      const ok = it.state === "collected" || (it.state === "cancelled" && it.charge === "charged");
      if (!ok || !it.files?.length) throw fail(409, "clip này chưa tải về hoặc đã gắn rồi");
      const r = attachNow(c, b.name, pd.dir, it, b.base, it.files.at(-1));
      return r.error ? c.send(r.status, { error: r.error }) : r;
    },
  },
  {
    method: "POST", path: "/api/videogen/import",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
      if (runningVideogen()) throw fail(409, BUSY);
      const it = itemOf(pd.dir, b.id);
      // An intent with no job running lost its runner (killed while sending): an unknown result.
      if (!["indeterminate", "failed", "cancelled", "intent"].includes(it.state)) throw fail(409, "chỉ nhập file cho lần tạo chưa rõ kết quả, lỗi hoặc đã huỷ");
      if (typeof b.path !== "string" || !isAbsolute(b.path) || !b.path.toLowerCase().endsWith(".mp4")) throw fail(400, "path: đường dẫn tuyệt đối tới file .mp4");
      let st;
      try { st = statSync(b.path); } catch { st = null; }
      if (!st?.isFile() || !st.size) throw fail(404, "không có file này (hoặc file rỗng)");
      const rel = `assets/gen/video/${String(it.shot).replace(/[^A-Za-z0-9._-]/g, "-")}-import-${it.id}.mp4`;
      const dest = join(pd.dir, rel);
      mkdirSync(join(pd.dir, "assets", "gen", "video"), { recursive: true });
      try { copyFileSync(b.path, dest, FS.COPYFILE_EXCL); } catch (e) {
        if (e.code === "EEXIST") throw fail(409, `đã có ${rel}, không ghi đè`);
        throw e;
      }
      const rec = await writeReceipt(pd.dir, { op: "videogen-import", actor: "human", tool: { name: "g-labs" }, inputs: { source: basename(b.path) }, params: { id: it.id }, outputs: [dest] });
      updateVideogen(it.id, { state: "collected", files: [rel], imported: true, receipt: { file: rec.file, pass: rec.pass } });
      const r = attachNow(c, b.name, pd.dir, getVideogen(it.id), b.base, rel);
      return r.error ? c.send(r.status, { error: r.error }) : r;
    },
  },
];
