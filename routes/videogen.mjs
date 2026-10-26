// routes/videogen.mjs — AI images and clips for a shot through gflow-cli (lib/videogen/).
//   GET  /api/videogen/status            → { bin, found, version, tested, profile, today, cap, images_today,
//                                            image_cap, waf_until, job }
//   POST /api/videogen/auth              → { ok, code } of `gflow auth status` (free; the user's button)
//   POST /api/videogen/shot {name, shot, base, prompt, mode?, model?, aspect?, seconds, resolution?, refs?, again?}
//   POST /api/videogen/image {name, shot, base, prompt, mode?, model?, aspect?, refs?, again?}
//                                        → starts the "videogen" job (node lib/videogen/run.mjs run …): one
//                                          gflow run, its file into assets/gen/, a receipt
//   POST /api/videogen/recover {name, id} → downloads a clip Flow made again (free), then attaches it
//   POST /api/videogen/reconcile {name, id} → looks for an unknown run in gflow's local catalog (free)
//   POST /api/videogen/cancel {name}     → marks the item cancelled by the user, then SIGTERM: the runner
//                                          interrupts gflow (after the submit Flow still makes it)
//   GET  /api/videogen/items?name=       → the project's images and clips of the last 7 days
//   POST /api/videogen/attach {name, id, base} → puts a collected file into its shot again
//   POST /api/videogen/import {name, id, base, path} → copies a file the user saved from Flow, then attaches it
// A collected file goes into the shot's assets (set_shot, actor human, Undo takes it back); for a
// clip the director is then asked to place it muted.
// One videogen job at a time in the whole Studio (gflow holds one lease per profile); the caps,
// the WAF block and the 30 s gap between images are checked here, the caps again in the runner.
import { accessSync, constants as FS, copyFileSync, mkdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, jobLog, listJobs } from "../jobs.mjs";
import { videogenSettings } from "../lib/config.mjs";
import {
  clearVideogenCancel, getVideogen, lastVideogenSend, requestVideogenCancel, stuckVideogen, today, updateVideogen,
  videogenCancelRequested, videogenCount, videogenItems, videogenWafUntil,
} from "../lib/ledger.mjs";
import { normalizeSpec, specDigest } from "../lib/videogen/spec.mjs";
import { GFLOW_TESTED, authStatus, defaultProfile, gflowVersion } from "../lib/videogen/gflow.mjs";
import { attachAsset } from "../lib/attach.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { askDirector, gatewayStatus } from "./fx.mjs";

export const VIDEOGEN_KIND = "videogen";
const RUN = fileURLToPath(new URL("../lib/videogen/run.mjs", import.meta.url));
const RESULT = "RESULT ";
const LOCK_WAIT_MS = 300;
const IMAGE_GAP_MS = 30e3;
const PROFILE_TTL_MS = 60e3;
// A clip matched in the catalog right after a stop may still be in the making: a failed download
// unlocks making it again only after this long.
const RECOVER_GRACE_MS = 10 * 60e3;
const IMPORT_EXT = { video: [".mp4"], image: [".png", ".jpg", ".jpeg"] };
const fail = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const live = (j) => j.kind === VIDEOGEN_KIND && (j.status === "running" || j.status === "cancelling");
// `auth status` runs in the server, not as a job; it touches the profile like a run does.
let authBusy = false;
const runningVideogen = () => listJobs().find(live) ?? (authBusy ? { kind: VIDEOGEN_KIND, status: "running", meta: { action: "auth" } } : null);
const kindOf = (it) => it.kind ?? "video";
const resultOf = (job) => {
  const l = [...(job.tail ?? [])].reverse().find((x) => x.startsWith(RESULT));
  try { return l ? JSON.parse(l.slice(RESULT.length)) : null; } catch { return null; }
};
const BUSY = "đang có một lượt tạo AI khác (cả Studio chỉ một lúc một lượt gflow)";
const hhmm = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

const directorText = (rel, seconds, shot) => `Đặt clip AI ${rel} (${seconds ?? "?"}s) vào shot ${shot}: phủ kín khung, tắt tiếng (muted), giữ nguyên lời và chữ trên hình. Clip có trong assets của shot.`;

// gflow's version per (binary, mtime) and its default profile for a minute: both cost a process.
let versionCache = { key: null, version: null };
let profileCache = { bin: null, at: 0, name: null };
function binInfo(bin) {
  let st;
  try { accessSync(bin, FS.X_OK); st = statSync(bin); } catch { return { found: false, version: null }; }
  const key = `${bin}:${st.mtimeMs}`;
  if (versionCache.key !== key) versionCache = { key, version: gflowVersion(bin) };
  return { found: true, version: versionCache.version };
}
async function profileOf(v) {
  if (v.profile) return v.profile;
  if (profileCache.bin === v.gflow_bin && Date.now() - profileCache.at < PROFILE_TTL_MS) return profileCache.name;
  if (runningVideogen()) return profileCache.bin === v.gflow_bin ? profileCache.name : null;
  let name = null;
  try { name = await defaultProfile(v.gflow_bin, { timeoutMs: 20e3 }); } catch { name = null; }
  profileCache = { bin: v.gflow_bin, at: Date.now(), name };
  return name;
}

// gflow present and a profile known, else the error to answer.
async function ready(v) {
  if (!binInfo(v.gflow_bin).found) throw fail(503, `Chưa có gflow ở ${v.gflow_bin} (studio.json videogen.gflow_bin)`);
  const profile = await profileOf(v);
  if (!profile) throw fail(412, "Chưa có profile gflow: đặt studio.json videogen.profile hoặc chạy gflow auth login");
  return { bin: v.gflow_bin, profile };
}

// Items a runner left unfinished (Studio stopped or killed meanwhile). Only while no videogen job
// runs, and with no await between that check and the writes.
function sweepStuck() {
  if (runningVideogen()) return;
  for (const it of stuckVideogen()) {
    let tmp = false;
    try { tmp = Boolean(it.out_rel) && statSync(join(it.project, it.out_rel)).size > 0; } catch { tmp = false; }
    const patch = it.state === "intent" && !it.phase
      ? { state: "cancelled", charge: "none", error: "Studio tắt trước khi chạy gflow" }
      : { state: "indeterminate", charge: "indeterminate", reconcile: kindOf(it) === "video", error: "Studio tắt giữa chừng" };
    if (tmp) patch.note = "có file tạm của lần này; bấm Đối chiếu, hoặc Nhập file nếu file dùng được";
    updateVideogen(it.id, patch);
  }
}

// Puts a collected file into its shot; for a clip, asks the director to place it. Never throws.
function attachDone(c, name, dir, r) {
  try {
    const m = c.P.manifest.load(dir);
    if (!m?.capabilities?.editable) { updateVideogen(r.id, { note: "dự án chỉ xem; bấm Gắn vào shot sau" }); return; }
    const shot = m.shots?.find((x) => x.id === r.shot);
    const a = attachAsset(dir, c.P.gateway, { shot: r.shot, base: m.version, rel: r.rel, manifest: m, lockWaitMs: LOCK_WAIT_MS });
    if (a.gateway?.code) { updateVideogen(r.id, { error: `gắn vào shot: ${a.gateway.error}` }); return; }
    const version = a.unchanged ? a.version : a.gateway.version;
    updateVideogen(r.id, { state: "attached", version });
    if (r.kind !== "image") askDirector(c, name, dir, { target: r.shot, t: shot?.start ?? 0, base: version, text: directorText(r.rel, r.seconds, r.shot) });
  } catch (e) {
    try { updateVideogen(r.id, { error: `gắn vào shot: ${e.message}` }); } catch { /* ledger gone */ }
  }
}

function startRun(c, name, dir, arg) {
  try {
    return c.startJob({
      name, kind: VIDEOGEN_KIND, cmd: process.execPath, args: [RUN, "run", JSON.stringify(arg)], cwd: dir,
      meta: { step: "videogen", action: arg.action, shot: arg.spec?.shot ?? null, id: arg.id ?? null },
      onExit: (job) => {
        const r = resultOf(job);
        const byUser = Boolean(r?.id) && videogenCancelRequested(r.id);
        if (r?.id) clearVideogenCancel(r.id);
        if (r?.ok) { attachDone(c, name, dir, r); return; }
        // The user stopped a clip after the prompt was typed: look in the catalog now (free). Only
        // on the user's cancel: when Studio stops, a new job here would outlive the server.
        if (r?.reconcile && byUser) {
          try { startRun(c, name, dir, { action: "reconcile", id: r.id, dir, bin: arg.bin, profile: arg.profile }); } catch { /* busy: the user can press Đối chiếu */ }
        }
      },
    });
  } catch (e) {
    throw e.code === "BUSY" ? fail(409, BUSY) : e;
  }
}

// An item of this project, else 404.
function itemOf(dir, id) {
  const it = typeof id === "string" ? getVideogen(id) : null;
  if (!it || !videogenItems(dir).some((x) => x.id === id)) throw fail(404, "không có lần tạo này trong dự án");
  return it;
}

// set_shot assets for a file already in the project; for a clip, then the director request.
function attachNow(c, name, dir, it, base, rel) {
  const m = c.P.manifest.load(dir);
  if (!m?.capabilities?.editable) throw fail(423, "dự án chỉ xem, sửa qua đạo diễn");
  if (base !== m.version) throw fail(409, "đã có thay đổi mới, tải lại rồi thử lại");
  const a = attachAsset(dir, c.P.gateway, { shot: it.shot, base, rel, manifest: m, lockWaitMs: LOCK_WAIT_MS });
  if (a.gateway?.code) return { status: gatewayStatus(c.P.gateway.EXIT ?? {}, a.gateway.code), error: a.gateway.error };
  const version = a.unchanged ? a.version : a.gateway.version;
  updateVideogen(it.id, { state: "attached", version, error: null });
  if (kindOf(it) !== "image") {
    const shot = m.shots.find((x) => x.id === it.shot);
    askDirector(c, name, dir, { target: it.shot, t: shot?.start ?? 0, base: version, text: directorText(rel, it.spec_summary?.seconds, it.shot) });
  }
  return { version, rel };
}

async function startGen(c, kind) {
  const b = c.body ?? {};
  const pd = c.withManifest(b.name);
  if (pd.error) return c.send(pd.status, { error: pd.error });
  if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
  const m = c.P.manifest.load(pd.dir);
  if (!m?.capabilities?.editable) throw fail(423, "dự án chỉ xem, sửa qua đạo diễn");
  if (b.base !== m.version) throw fail(409, "đã có thay đổi mới, tải lại rồi thử lại");
  if (!m.shots?.some((x) => x.id === b.shot)) throw fail(404, `không có shot ${String(b.shot ?? "")}`);
  const v = videogenSettings();
  const spec = normalizeSpec(pd.dir, { ...b, kind }, v);
  if (runningVideogen()) throw fail(409, BUSY);
  const { bin, profile } = await ready(v);
  const waf = videogenWafUntil();
  if (waf) throw fail(429, `Flow vừa chặn vì gửi quá nhiều; Studio chờ tới ${hhmm(waf)} mới gửi tiếp`);
  const cap = kind === "image" ? v.daily_images : v.daily_clips;
  if (videogenCount(today(), { kind }) >= cap) throw fail(403, `đã đủ ${cap} ${kind === "image" ? "ảnh" : "clip"} AI hôm nay (studio.json videogen.${kind === "image" ? "daily_images" : "daily_clips"})`);
  if (kind === "image") {
    const last = lastVideogenSend("image");
    const wait = last ? IMAGE_GAP_MS - (Date.now() - Date.parse(last)) : 0;
    if (wait > 0) throw fail(429, `chờ ${Math.ceil(wait / 1000)} s nữa mới tạo ảnh tiếp (Flow chặn khi tạo ảnh dồn dập)`);
  }
  const digest = await specDigest(pd.dir, spec);
  sweepStuck();
  // The same request before. Only the newest item of this digest counts: an old unknown result
  // followed by a good retry is settled. A clip Flow made is downloaded, not made again, until a
  // download has failed (the clip may be gone on Flow); an image Flow made cannot be downloaded.
  const last = videogenItems(pd.dir).find((x) => x.digest === digest);
  if (last) {
    const made = last.state === "made";
    const gaveUp = last.recover_failed > 0 && Date.now() - Date.parse(last.created) > RECOVER_GRACE_MS;
    if (made && kindOf(last) === "video" && !gaveUp) {
      return c.send(409, { error: "Flow đã tạo clip của đúng yêu cầu này. Bấm Tải về từ Flow (miễn phí) thay vì tạo lại.", code: "RECOVERABLE", id: last.id });
    }
    if ((made || ["indeterminate", "intent", "running"].includes(last.state)) && b.again !== last.id) {
      return c.send(409, { error: "Lần trước của đúng yêu cầu này có thể đã tốn credit. Đối chiếu, nhập file, hoặc xác nhận Tạo lại.", code: "DUPLICATE", id: last.id, made });
    }
  }
  // No await between this check and the start.
  if (runningVideogen()) throw fail(409, BUSY);
  const job = startRun(c, b.name, pd.dir, { action: "new", dir: pd.dir, spec, digest, bin, profile, cap: v.daily_clips, image_cap: v.daily_images });
  return { job };
}

// A free follow-up job (recover, reconcile) for one item of the project.
async function startFollow(c, action, check) {
  const b = c.body ?? {};
  const pd = c.projectDir(b.name);
  if (pd.error) return c.send(pd.status, { error: pd.error });
  if (runningVideogen()) throw fail(409, BUSY);
  const it = itemOf(pd.dir, b.id);
  check(it);
  const { bin, profile } = await ready(videogenSettings());
  if (runningVideogen()) throw fail(409, BUSY);
  const job = startRun(c, b.name, pd.dir, { action, id: it.id, dir: pd.dir, bin, profile: it.profile ?? profile });
  return { job };
}

export const ROUTES = [
  {
    method: "GET", path: "/api/videogen/status", provider: false,
    async handler() {
      sweepStuck();
      const v = videogenSettings();
      const { found, version } = binInfo(v.gflow_bin);
      const profile = found ? await profileOf(v) : null;
      return {
        bin: v.gflow_bin, found, version, tested: Boolean(version?.startsWith(GFLOW_TESTED)), profile,
        today: videogenCount(today()), cap: v.daily_clips, images_today: videogenCount(today(), { kind: "image" }), image_cap: v.daily_images,
        waf_until: videogenWafUntil(), job: runningVideogen(),
      };
    },
  },
  {
    method: "POST", path: "/api/videogen/auth",
    async handler() {
      if (runningVideogen()) throw fail(409, BUSY);
      const { bin, profile } = await ready(videogenSettings());
      // No await between this check and the flag.
      if (runningVideogen()) throw fail(409, BUSY);
      authBusy = true;
      try { return await authStatus(bin, profile, { timeoutMs: 30e3 }); } finally { authBusy = false; }
    },
  },
  { method: "POST", path: "/api/videogen/shot", handler: (c) => startGen(c, "video") },
  { method: "POST", path: "/api/videogen/image", handler: (c) => startGen(c, "image") },
  {
    method: "POST", path: "/api/videogen/recover",
    handler: (c) => startFollow(c, "recover", (it) => {
      if (kindOf(it) === "image") throw fail(409, "ảnh không tải lại được; mở Flow, lưu ảnh rồi Nhập file");
      if (it.state !== "made" || !it.media_id) throw fail(409, "lần tạo này không có clip trên Flow để tải về");
    }),
  },
  {
    method: "POST", path: "/api/videogen/reconcile",
    handler: (c) => startFollow(c, "reconcile", (it) => {
      if (it.state !== "indeterminate" || !it.flow_project) throw fail(409, "chỉ đối chiếu lần tạo chưa rõ kết quả");
    }),
  },
  {
    method: "POST", path: "/api/videogen/cancel",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      const j = listJobs(b.name).find(live);
      if (!j) throw fail(404, "không có lượt tạo AI nào đang chạy trong dự án này");
      // The item: follow-up jobs carry it; a new job prints INTENT <id>, or (cancelled before that
      // line arrived) it is the newest unfinished item since the job started.
      const id = j.meta?.id ?? (jobLog(j.id) ?? []).find((l) => l.startsWith("INTENT "))?.slice(7)
        ?? videogenItems(pd.dir).find((x) => x.created >= j.started && ["intent", "running"].includes(x.state))?.id ?? null;
      if (id) requestVideogenCancel(id);
      return { job: cancel(j.id) };
    },
  },
  {
    method: "GET", path: "/api/videogen/items",
    async handler(c) {
      const pd = c.projectDir(c.q("name"));
      if (pd.error) return c.send(pd.status, { error: pd.error });
      sweepStuck();
      return { items: videogenItems(pd.dir).map(({ prompt, ...x }) => x) };
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
      // A file finished before a cancel is paid for and on disk: it attaches like a collected one.
      const ok = it.state === "collected" || (it.state === "cancelled" && it.charge === "charged");
      if (!ok || !it.files?.length) throw fail(409, "file này chưa tải về hoặc đã gắn rồi");
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
      sweepStuck();
      const it = itemOf(pd.dir, b.id);
      if (!["indeterminate", "failed", "cancelled", "intent", "made"].includes(it.state)) throw fail(409, "chỉ nhập file cho lần tạo chưa rõ kết quả, lỗi, đã huỷ hoặc đã tạo trên Flow");
      const kind = kindOf(it);
      const ext = typeof b.path === "string" ? (/\.[A-Za-z0-9]+$/.exec(b.path)?.[0] ?? "").toLowerCase() : "";
      if (typeof b.path !== "string" || !isAbsolute(b.path) || !IMPORT_EXT[kind].includes(ext)) throw fail(400, `path: đường dẫn tuyệt đối tới file ${IMPORT_EXT[kind].join(", ")}`);
      let st;
      try { st = statSync(b.path); } catch { st = null; }
      if (!st?.isFile() || !st.size) throw fail(404, "không có file này (hoặc file rỗng)");
      const rel = `assets/gen/${kind}/${String(it.shot).replace(/[^A-Za-z0-9._-]/g, "-")}-import-${it.id}${ext}`;
      const dest = join(pd.dir, rel);
      mkdirSync(join(pd.dir, "assets", "gen", kind), { recursive: true });
      try { copyFileSync(b.path, dest, FS.COPYFILE_EXCL); } catch (e) {
        if (e.code === "EEXIST") throw fail(409, `đã có ${rel}, không ghi đè`);
        throw e;
      }
      const rec = await writeReceipt(pd.dir, { op: "videogen-import", actor: "human", tool: { name: "gflow" }, inputs: { source: basename(b.path) }, params: { id: it.id, kind }, outputs: [dest] });
      updateVideogen(it.id, { state: "collected", files: [rel], imported: true, receipt: { file: rec.file, pass: rec.pass } });
      const r = attachNow(c, b.name, pd.dir, getVideogen(it.id), b.base, rel);
      return r.error ? c.send(r.status, { error: r.error }) : r;
    },
  },
];
