// lib/videogen/run.mjs — one AI image or clip through gflow-cli, as a Studio job:
//   node lib/videogen/run.mjs run '<json>'   (routes/videogen.mjs starts it; last line RESULT <json>)
// Actions: "new" (one generation), "recover" (download a clip Flow made, free), "reconcile" (look
// for an unknown run in gflow's local catalog, free).
// Invariants:
// - the intent is in the ledger (lib/ledger.mjs) before gflow starts, and gflow runs once per
//   intent: nothing is ever sent again, an unknown result is matched in the catalog or left
//   "indeterminate" for the user to decide;
// - the ledger follows the submit: phase "typed" once the prompt is in Flow's composer, "sent"
//   once the submit event was seen (lib/videogen/gflow.mjs);
// - on SIGTERM (a cancel or Studio stopping) gflow gets SIGINT, then its group and process tree
//   SIGKILL; the item is settled and RESULT printed by 3.5 s, before jobs.mjs kills this runner (5 s);
// - nothing gflow prints is logged raw: event names only, results through parseResult().
import { constants as FS, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flowProjectOf, getVideogen, knownMediaIds, newVideogenIntent, setFlowProject, setVideogenWaf, today, updateVideogen, videogenCancelRequested, videogenCount } from "../ledger.mjs";
import { withExpected } from "../quality/video.mjs";
import { writeReceipt } from "../receipts.mjs";
import { ARMED_EVENTS, SENT_EVENTS, WAF_BLOCK_MS, classify, createProject, downloadMedia, genArgv, gflowEnv, gflowTested, gflowVersion, killTree, listCatalog, matchCatalog, parseEvents, parseResult, partFiles, scrub, spawnGflow } from "./gflow.mjs";

export const RESULT_PREFIX = "RESULT ";
const SELF = fileURLToPath(import.meta.url);
const EXT = { video: "mp4", image: "png" };

// State of the run in this process, for the SIGTERM fallback.
let cur = { id: null, kind: null, phase: null, pid: null, dir: null, settled: false, collected: null };

const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "-");
const real = (dir) => { try { return realpathSync(dir); } catch { return dir; } };
const flowTitle = (dir) => `${basename(real(dir))}-${createHash("sha1").update(real(dir)).digest("hex").slice(0, 6)}`;
const finalRel = (kind, shot, id, ext = `.${EXT[kind]}`, n = 0) => `assets/gen/${kind}/${safe(shot)}-${id}${n ? `-${n + 1}` : ""}${ext.toLowerCase()}`;
const size = (f) => { try { return statSync(f).size; } catch { return 0; } };

// The item after a stop that left no finished file: free before the prompt was typed, unknown after.
// An untested gflow may have renamed its events: a stop before the prompt is seen typed is not
// trusted to be free.
const stopPhase = (phase) => (cur.untested && phase === "spawned" ? "typed" : phase);
// What a run that did not end "collected" leaves on disk. Before the prompt is typed nothing was
// made: the temp files go. After, a non-empty file may be paid output: it stays for Nhập file.
function settleParts(dir, kind, id, phase) {
  const parts = partFiles(dir, kind, id);
  if (!parts.length) return null;
  if (phase !== "typed" && phase !== "sent") { for (const f of parts) rmSync(f, { force: true }); return null; }
  return "có file tạm của lần này; bấm Dùng file tạm nếu file dùng được";
}
// A stop without the user's cancel marker is Studio stopping (lib/ledger.mjs requestVideogenCancel).
function stoppedPatch(kind, phase, id) {
  let byUser = true;
  try { byUser = !id || videogenCancelRequested(id); } catch { /* ledger gone: keep the user's wording */ }
  if (phase !== "typed" && phase !== "sent") return { state: "cancelled", charge: "none", error: byUser ? "đã huỷ trước khi gửi" : "Studio tắt trước khi gửi" };
  const error = byUser
    ? (phase === "sent" ? "ngừng chờ sau khi gửi; Flow vẫn tạo và tính credit" : "huỷ sau khi điền prompt; có thể Flow đã nhận lệnh")
    : (phase === "sent" ? "Studio tắt khi Flow đang tạo; Flow vẫn tạo và tính credit" : "Studio tắt sau khi điền prompt; có thể Flow đã nhận lệnh");
  return { state: "indeterminate", charge: "indeterminate", reconcile: kind === "video", error };
}

// Looks for the item's run in gflow's catalog. Returns the ledger patch.
async function matchPatch(item, arg, opts) {
  let rows;
  try { rows = await listCatalog(arg.bin, item.kind ?? "video", item.profile, opts); } catch (e) {
    return { state: "indeterminate", charge: "indeterminate", reconcile: false, error: scrub(`không đọc được danh mục gflow: ${e.message}`) };
  }
  const hits = matchCatalog(rows, { project: item.flow_project, prompt: item.prompt, since: item.created, known: knownMediaIds() });
  if (hits.length === 1) return { state: "made", charge: "charged", media_id: hits[0].media_id, reconcile: false, error: null, note: (item.kind ?? "video") === "video" ? "Flow đã nhận lệnh; bấm Tải về từ Flow" : "Flow đã tạo ảnh; ảnh không tải lại được, mở Flow rồi Nhập file" };
  return { state: "indeterminate", charge: "indeterminate", reconcile: false, error: hits.length ? "nhiều lần tạo khớp trong danh mục gflow; mở Flow kiểm" : "không thấy trong danh mục gflow; mở Flow kiểm trước khi tạo lại" };
}

async function receiptFor(dir, kind, spec, files, extra) {
  const write = () => writeReceipt(dir, {
    op: extra.op ?? "videogen", actor: "human", tool: { name: "gflow", version: extra.version ?? null, model: spec.model },
    params: { kind, mode: spec.mode, aspect: spec.aspect, seconds: spec.seconds ?? null, resolution: spec.resolution ?? null, media_id: extra.media_id ?? null, digest: extra.digest ?? null },
    inputs: { refs: (spec.refs ?? []).map((r) => r.path) }, outputs: files, started: extra.started,
  });
  const rec = kind === "video" && spec.seconds ? await withExpected(files, { duration: spec.seconds }, write) : await write();
  return { file: rec.file, pass: rec.pass };
}

async function runNew(arg, { log, signal }) {
  const spec = arg.spec;
  const kind = spec.kind ?? "video";
  const cap = kind === "image" ? arg.image_cap : arg.cap;
  if (videogenCount(today(), { kind }) >= cap) return { ok: false, status: 403, error: `đã đủ trần ${kind === "image" ? "ảnh" : "clip"} AI hôm nay` };
  const started = new Date();
  // An unknown version means its exit codes cannot be trusted: do not send at all.
  const version = gflowVersion(arg.bin);
  if (!version) return { ok: false, status: 503, error: "không đọc được phiên bản gflow (gflow --version)" };
  let proj = flowProjectOf(arg.profile, arg.dir);
  if (!proj) {
    try {
      const p = await createProject(arg.bin, arg.profile, flowTitle(arg.dir), { signal });
      proj = { ...p, created: new Date().toISOString() };
      setFlowProject(arg.profile, arg.dir, proj);
      log(`videogen: tạo project Flow ${proj.title}`);
    } catch (e) {
      return { ok: false, status: e.status ?? 502, error: scrub(e.message) };
    }
  }
  if (signal?.aborted) return { ok: false, cancelled: true };
  const item = newVideogenIntent({ project: arg.dir, shot: spec.shot, digest: arg.digest, prompt: spec.prompt, kind, model: spec.model, profile: arg.profile, flow_project: proj.id });
  const id = item.id;
  const outRel = `assets/gen/${kind}/.part-${id}.${EXT[kind]}`;
  const out = join(arg.dir, outRel);
  cur = { id, kind, phase: "spawned", pid: null, tree: [], dir: arg.dir, settled: false, collected: null, untested: !gflowTested(version) };
  updateVideogen(id, { state: "running", phase: "spawned", out_rel: outRel,
    spec_summary: { kind, model: spec.model, mode: spec.mode, seconds: spec.seconds ?? null, aspect: spec.aspect, resolution: spec.resolution ?? null, shot: spec.shot, refs: spec.refs } });
  log(`INTENT ${id}`);
  mkdirSync(join(arg.dir, "assets", "gen", kind), { recursive: true });
  const argv = genArgv(spec, { profile: arg.profile, project: proj.id, out, refsAbs: (spec.refs ?? []).map((r) => join(arg.dir, r.path)) });
  const cwd = mkdtempSync(join(tmpdir(), "ms-gflow-"));
  const onStderr = (line) => {
    const ev = parseEvents(line);
    for (const e of ev.events) if (ARMED_EVENTS.includes(e) || SENT_EVENTS.includes(e)) log(`videogen: gflow ${scrub(e)}`);
    if (ev.sent && cur.phase !== "sent") { cur.phase = "sent"; updateVideogen(id, { phase: "sent" }); }
    else if (ev.armed && cur.phase === "spawned") { cur.phase = "typed"; updateVideogen(id, { phase: "typed" }); }
    if (ev.agentOnly) updateVideogen(id, { note: "Flow dùng khung soạn kiểu agent: có thể tạo nhiều hơn một kết quả; kiểm trên Flow" });
  };
  let r;
  try {
    r = await spawnGflow(arg.bin, argv, { env: gflowEnv(), cwd, signal, onStderr, onSpawn: (pid) => { cur.pid = pid; }, onTree: (pids) => { cur.tree = pids; }, killAfterMs: arg.kill_after_ms ?? 3000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  if (cur.settled) return null;
  const result = parseResult(r.stdout);
  const ev = parseEvents(r.stderr);
  const aborted = r.killed || Boolean(signal?.aborted);
  const parts = partFiles(arg.dir, kind, id);
  const c = classify({ code: r.code, aborted, result, ev, fileOk: parts.length > 0, version, kind });
  log(`videogen: gflow thoát mã ${r.code ?? r.signal ?? r.spawnError}`);

  if (c.state === "collected") {
    const files = parts.map((f, n) => finalRel(kind, spec.shot, id, extname(f) || `.${EXT[kind]}`, n));
    parts.forEach((f, n) => renameSync(f, join(arg.dir, files[n])));
    const rel = files[0];
    cur.collected = files;
    let receipt = null;
    try { receipt = await receiptFor(arg.dir, kind, spec, files.map((f) => join(arg.dir, f)), { version, media_id: c.media_id, digest: arg.digest, started }); } catch (e) { log(`videogen: biên nhận lỗi: ${scrub(e.message)}`); }
    if (cur.settled) return null;
    cur.settled = true;
    const note = files.length > 1 ? `gflow trả ${files.length} kết quả; gắn ${rel}, các file khác ở assets/gen/${kind}` : undefined;
    updateVideogen(id, { state: "collected", charge: "charged", media_id: c.media_id, files: [rel, ...files.slice(1)], receipt, reconcile: false, error: null, ...(note ? { note } : {}) });
    log(`videogen: xong ${rel}`);
    return { ok: true, id, shot: spec.shot, rel, kind, seconds: spec.seconds ?? null };
  }
  const kept = settleParts(arg.dir, kind, id, stopPhase(cur.phase === "spawned" && ev.armed ? "typed" : cur.phase));
  if (c.waf) setVideogenWaf(new Date(Date.now() + WAF_BLOCK_MS).toISOString());
  // The Flow project is gone (deleted on Flow): forget it so the next run makes a new one.
  // Only forgotten; the next press makes a new project, nothing is sent again by itself.
  if (result?.error?.project_missing && !ev.armed) setFlowProject(arg.profile, arg.dir, null);
  let patch;
  if (c.state === "reconcile") {
    patch = aborted ? stoppedPatch(kind, stopPhase(cur.phase === "spawned" && ev.armed ? "typed" : cur.phase), id) : await matchPatch(getVideogen(id), arg, { signal });
  } else {
    patch = { state: c.state, charge: c.charge, media_id: c.media_id, error: c.error, reconcile: false };
    if (aborted && c.state === "cancelled") patch.error = stoppedPatch(kind, "spawned", id).error;
  }
  if (kept) patch.note = kept;
  if (cur.settled) return null;
  cur.settled = true;
  const it = updateVideogen(id, patch);
  return { ok: false, id, state: it.state, reconcile: Boolean(it.reconcile), cancelled: it.state === "cancelled", error: it.error, waf: c.waf };
}

async function runRecover(arg, { log, signal }) {
  const item = getVideogen(arg.id);
  if (!item || item.state !== "made" || !item.media_id || (item.kind ?? "video") !== "video") return { ok: false, status: 409, error: "lần tạo này không tải về được" };
  cur = { id: item.id, kind: "video", phase: null, pid: null, dir: null, settled: true, collected: null };
  const tmp = mkdtempSync(join(tmpdir(), "ms-gflow-dl-"));
  const rel = finalRel("video", item.shot, item.id);
  try {
    const d = await downloadMedia(arg.bin, item.media_id, item.profile ?? arg.profile, tmp, { signal });
    // Only a file gflow wrote in the temp dir is copied.
    if (!d?.path || !real(d.path).startsWith(real(tmp) + "/")) throw new Error("gflow trả đường dẫn ngoài thư mục tạm");
    mkdirSync(join(arg.dir, "assets", "gen", "video"), { recursive: true });
    try { copyFileSync(d.path, join(arg.dir, rel), FS.COPYFILE_EXCL); } catch (e) {
      // A runner killed right after its copy: the file is this clip.
      if (!(e.code === "EEXIST" && size(join(arg.dir, rel)) > 0)) throw e;
    }
  } catch (e) {
    // A stopped download is not a failed one: it must not unlock making the clip again.
    if (signal?.aborted) {
      const it = updateVideogen(item.id, { error: "đã dừng tải về; bấm Tải về từ Flow lại" });
      return { ok: false, id: item.id, state: it.state, cancelled: true, error: it.error };
    }
    const it = updateVideogen(item.id, { recover_failed: (item.recover_failed ?? 0) + 1, error: scrub(`tải về hỏng: ${e.code === "EEXIST" ? `đã có ${rel}` : e.message}. Flow có thể còn đang tạo; đợi vài phút rồi Tải về lại`) });
    return { ok: false, id: item.id, state: it.state, error: it.error };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  // A temp file the first run kept is not needed once the clip is here.
  for (const f of partFiles(arg.dir, "video", item.id)) rmSync(f, { force: true });
  const spec = { ...(item.spec_summary ?? {}), model: item.model };
  let receipt = null;
  try { receipt = await receiptFor(arg.dir, "video", spec, join(arg.dir, rel), { op: "videogen-recover", media_id: item.media_id, digest: item.digest, started: new Date() }); } catch (e) { log(`videogen: biên nhận lỗi: ${scrub(e.message)}`); }
  updateVideogen(item.id, { state: "collected", charge: "charged", files: [rel], receipt, error: null, note: null });
  log(`videogen: tải về ${rel}`);
  return { ok: true, id: item.id, shot: item.shot, rel, kind: "video", seconds: spec.seconds ?? null };
}

async function runReconcile(arg, { signal }) {
  const item = getVideogen(arg.id);
  if (!item || !item.flow_project || !item.prompt) return { ok: false, status: 409, error: "lần tạo này không đối chiếu được" };
  cur = { id: item.id, kind: item.kind, phase: null, pid: null, dir: null, settled: true, collected: null };
  const it = updateVideogen(item.id, await matchPatch(item, arg, { signal }));
  return { ok: false, id: item.id, state: it.state, reconciled: true, error: it.error };
}

export async function runVideogen(arg, { log = console.log, signal = null } = {}) {
  cur = { id: null, kind: null, phase: null, pid: null, dir: null, settled: false, collected: null };
  if (arg.action === "new") return runNew(arg, { log, signal });
  if (arg.action === "recover") return runRecover(arg, { log, signal });
  if (arg.action === "reconcile") return runReconcile(arg, { log, signal });
  return { ok: false, status: 400, error: `action không hợp lệ: ${arg.action}` };
}

// Job entry: node lib/videogen/run.mjs run '<json>'.
const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(SELF); } catch { return false; } };
if (isMain()) {
  const [cmd, json] = process.argv.slice(2);
  if (cmd !== "run" || !json) { console.error("usage: node lib/videogen/run.mjs run '<json>'"); process.exit(2); }
  // "@<file>": routes/videogen.mjs writes the arguments to a 0600 file so the job list, which
  // shows a job's argv, carries no prompt or local path. The file is read once, then removed.
  let arg;
  try {
    if (json.startsWith("@")) { const f = json.slice(1); try { arg = JSON.parse(readFileSync(f, "utf8")); } finally { rmSync(basename(dirname(f)).startsWith("ms-vg-") ? dirname(f) : f, { recursive: true, force: true }); } }
    else arg = JSON.parse(json);
  } catch { console.error("JSON không hợp lệ"); process.exit(2); }
  // The server may die first: a broken pipe must not stop the runner from settling the ledger.
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});
  const print = (r) => { try { console.log(RESULT_PREFIX + JSON.stringify(r)); } catch { /* pipe gone */ } };
  const ac = new AbortController();
  let stopping = false;
  process.on("SIGTERM", () => {
    if (stopping) return;
    stopping = true;
    ac.abort();
    // Last resort before jobs.mjs kills this runner: settle the item from what is known.
    setTimeout(() => {
      if (cur.pid) killTree(cur.pid, cur.tree ?? []);
      let r = { ok: false, id: cur.id, cancelled: true };
      if (cur.id && !cur.settled) {
        cur.settled = true;
        try {
          const patch = cur.collected ? { state: "collected", charge: "charged", files: cur.collected, error: "biên nhận chưa ghi xong" } : stoppedPatch(cur.kind, stopPhase(cur.phase), cur.id);
          const kept = cur.collected || !cur.dir ? null : settleParts(cur.dir, cur.kind, cur.id, stopPhase(cur.phase));
          if (kept) patch.note = kept;
          const it = updateVideogen(cur.id, patch);
          r = { ok: false, id: cur.id, state: it?.state, reconcile: Boolean(it?.reconcile), cancelled: it?.state === "cancelled" };
        } catch (e) { r = { ok: false, id: cur.id, error: e.message }; }
      }
      print(r);
      process.exit(0);
    }, Math.min(4000, (arg.kill_after_ms ?? 3000) + 500)).unref();
  });
  runVideogen(arg, { log: (l) => { try { console.log(l); } catch { /* pipe gone */ } }, signal: ac.signal }).then((r) => {
    if (!r) return; // settled by the SIGTERM fallback
    print(r);
    if (ac.signal.aborted && cur.pid) killTree(cur.pid, cur.tree ?? []);
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.error(`videogen: ${scrub(e.message)}`);
    if (cur.id && !cur.settled) { cur.settled = true; try { updateVideogen(cur.id, { state: "indeterminate", charge: "indeterminate", error: scrub(e.message) }); } catch { /* ledger gone */ } }
    print({ ok: false, error: scrub(e.message), status: e.status ?? 500, id: cur.id });
    process.exit(1);
  });
}
