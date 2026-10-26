// lib/videogen/run.mjs — one AI clip through the G-Labs webhook, as a Studio job:
//   node lib/videogen/run.mjs run '<json>'   (routes/videogen.mjs starts it; last line RESULT <json>)
// Invariants:
// - the intent is in the ledger (lib/ledger.mjs) before anything is sent;
// - at most one POST /api/video/generate per intent, and nothing is ever re-sent: a POST without an
//   answer is matched against GET /api/tasks or left "indeterminate" for the user to decide;
// - on SIGTERM it stops its own task only, and only when the user asked (cancel_requested in the
//   ledger); a SIGTERM from Studio shutting down leaves the task to be followed later ("resume");
// - the G-Labs key is read here only (env, then glabs.env beside the state file) and never printed.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { glabsKeyFile } from "../config.mjs";
import { getVideogen, newVideogenIntent, updateVideogen, videogenCount } from "../ledger.mjs";
import { withExpected } from "../quality/video.mjs";
import { writeReceipt } from "../receipts.mjs";
import { chargeOf, checkUrl, download, recentTasks, scrub, status, stop, submit } from "./glabs.mjs";
import { toGlabsBody } from "./spec.mjs";

export const RESULT_PREFIX = "RESULT ";
const SELF = fileURLToPath(import.meta.url);
const TASK_ID = /^[0-9a-f]{8}$/;

// State of the run in this process, for the SIGTERM handler.
let id = null, taskId = null, key = null, base = null, posting = false;

export function readKey(source = process.env) {
  const env = source.G_LABS_WEBHOOK_API_KEY?.trim();
  if (env) return env;
  const file = glabsKeyFile(source);
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return null; }
  const m = /^\s*(?:export\s+)?G_LABS_WEBHOOK_API_KEY\s*=\s*["']?([^"'\n]+)["']?\s*$/m.exec(text);
  if (!m?.[1]?.trim()) return null;
  try { if (statSync(file).mode & 0o077) console.error("videogen: glabs.env nên chmod 600"); } catch { /* gone meanwhile */ }
  return m[1].trim();
}

const out = (shot, task, res) => `assets/gen/video/${String(shot).replace(/[^A-Za-z0-9._-]/g, "-")}-${task}-${res}.mp4`;
const hang = () => new Promise(() => {});
const sleep = (ms, signal) => new Promise((r) => {
  const t = setTimeout(r, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
});

export async function runVideogen(arg, { log = console.log, signal = null } = {}) {
  id = null; taskId = null; key = null; posting = false;
  base = checkUrl(arg.base_url);
  const halted = () => Boolean(signal?.aborted);
  const started = new Date();
  let item;

  if (arg.action === "new") {
    const spec = arg.spec;
    if (videogenCount() >= arg.cap) return { ok: false, status: 403, error: "đã đủ trần clip AI hôm nay" };
    item = newVideogenIntent({ project: arg.dir, shot: spec.shot, digest: arg.digest, prompt: spec.prompt });
    id = item.id;
    item = updateVideogen(id, { spec_summary: { model: spec.model, mode: spec.mode, seconds: spec.seconds, aspect: spec.aspect, resolution: spec.resolution, resolution_key: spec.resolution_key, shot: spec.shot, refs: spec.refs, prompt_head: spec.prompt.slice(0, 80) } });
    log(`INTENT ${id}`);
    key = readKey();
    if (!key) {
      updateVideogen(id, { state: "failed", charge: "none", error: "chưa có khoá G-Labs" });
      return { ok: false, id, status: 412, error: "chưa có khoá G-Labs" };
    }
    let body;
    try { body = toGlabsBody(arg.dir, spec); } catch (e) {
      updateVideogen(id, { state: "failed", charge: "none", error: e.message });
      return { ok: false, id, status: e.status ?? 400, error: e.message };
    }
    posting = true;
    const sentAt = Date.now() / 1000;
    const r = await submit(base, key, body, { timeoutMs: arg.submit_timeout_ms ?? 60000 });
    posting = false;
    if (halted()) return hang();
    if (r.kind === "accepted" && TASK_ID.test(r.task_id)) {
      taskId = r.task_id;
      item = updateVideogen(id, { state: "submitted", task_id: taskId, sent_at: sentAt });
    } else if (r.kind === "rejected") {
      updateVideogen(id, { state: "failed", charge: "none", error: r.error });
      return { ok: false, id, status: r.status, error: r.error };
    } else {
      // No usable answer: G-Labs may or may not have the task. Match it, never send again.
      const tasks = await recentTasks(base, key);
      if (halted()) return hang();
      const head = spec.prompt.slice(0, 50);
      const hits = (tasks ?? []).filter((t) => TASK_ID.test(String(t.task_id)) && t.prompt === head && Math.abs(Number(t.created_at) - sentAt) <= 120);
      if (hits.length !== 1) {
        const error = "POST không trả lời; không biết G-Labs đã nhận chưa";
        updateVideogen(id, { state: "indeterminate", charge: "indeterminate", error });
        return { ok: false, id, indeterminate: true, error };
      }
      taskId = hits[0].task_id;
      item = updateVideogen(id, { state: "submitted", task_id: taskId, sent_at: sentAt });
      log("videogen: đã khớp task sau khi POST không trả lời");
    }
  } else if (arg.action === "resume") {
    item = getVideogen(arg.id);
    if (!item || !["submitted", "running"].includes(item.state) || !TASK_ID.test(String(item.task_id))) return { ok: false, status: 409, error: "việc này không theo dõi tiếp được" };
    id = item.id;
    taskId = item.task_id;
    key = readKey();
    if (!key) return { ok: false, id, status: 412, error: "chưa có khoá G-Labs" };
  } else {
    return { ok: false, status: 400, error: `action không hợp lệ: ${arg.action}` };
  }

  const spec = arg.spec ?? item.spec_summary;
  // Follow the task.
  const deadline = Date.now() + (arg.deadline_ms ?? 1200000);
  let lastWait = 0, s;
  for (;;) {
    if (Date.now() > deadline) return { ok: false, id, resumable: true, error: "quá thời gian chờ; bấm Theo dõi tiếp sau" };
    s = await status(base, key, taskId);
    if (halted()) return hang();
    if (s.kind === "completed") break;
    if (s.kind === "pending" || s.kind === "running") {
      if (item.state !== "running") item = updateVideogen(id, { state: "running" });
    } else if (s.kind === "failed") {
      const charge = chargeOf(s);
      const state = charge === "none" ? "failed" : "indeterminate";
      const error = scrub(`${s.error_code}: ${s.error}`);
      updateVideogen(id, { state, charge, error });
      return { ok: false, id, indeterminate: state === "indeterminate", error };
    } else if (s.kind === "gone") {
      const error = "G-Labs không còn task này (app đã khởi động lại?)";
      updateVideogen(id, { state: "indeterminate", charge: "indeterminate", error });
      return { ok: false, id, indeterminate: true, error };
    } else if (s.kind === "unauthorized") {
      return { ok: false, id, status: 401, error: "khoá G-Labs sai" };
    } else if (Date.now() - lastWait > 60000) {
      lastWait = Date.now();
      log("videogen: G-Labs không trả lời, chờ…");
    }
    await sleep(arg.poll_ms ?? 5000, signal);
    if (halted()) return hang();
  }

  // Collect the files.
  const results = Array.isArray(s.results) ? s.results : [];
  const rels = [];
  try {
    if (!results.length) throw new Error("G-Labs không trả file nào");
    for (let i = 0; i < results.length; i++) {
      const rel = out(spec.shot, taskId, spec.resolution?.[i] ?? `r${i}`);
      await download(base, results[i], join(arg.dir, rel));
      if (halted()) return hang();
      rels.push(rel);
    }
  } catch (e) {
    const error = scrub(`đã tạo xong nhưng tải hỏng: ${e.message}`);
    updateVideogen(id, { state: "indeterminate", charge: "charged", error, files: rels });
    return { ok: false, id, indeterminate: true, error };
  }
  const filesAbs = rels.map((r) => join(arg.dir, r));
  const mainRel = rels.at(-1), mainAbs = filesAbs.at(-1);
  const rec = await withExpected([mainAbs], { duration: spec.seconds }, () => writeReceipt(arg.dir, {
    op: "videogen", actor: "human", tool: { name: "g-labs", model: spec.model },
    params: { mode: spec.mode, seconds: spec.seconds, aspect: spec.aspect, resolution: spec.resolution_key, task_id: taskId, digest: arg.digest ?? item.digest },
    inputs: { refs: spec.refs?.map((r) => r.path) ?? [] }, outputs: filesAbs, started,
  }));
  if (halted()) return hang();
  const receipt = { file: rec.file, pass: rec.pass };
  updateVideogen(id, { state: "collected", charge: "charged", files: rels, receipt });
  log(`videogen: xong ${mainRel}`);
  return { ok: true, id, rel: mainRel, files: rels, receipt, shot: spec.shot, seconds: spec.seconds };
}

// Job entry: node lib/videogen/run.mjs run '<json>'.
const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(SELF); } catch { return false; } };
if (isMain()) {
  const [cmd, json] = process.argv.slice(2);
  if (cmd !== "run" || !json) { console.error("usage: node lib/videogen/run.mjs run '<json>'"); process.exit(2); }
  let arg;
  try { arg = JSON.parse(json); } catch { console.error("JSON không hợp lệ"); process.exit(2); }
  const ac = new AbortController();
  let stopping = false;
  process.on("SIGTERM", async () => {
    if (stopping) return;
    stopping = true;
    ac.abort();
    let r;
    try {
      const it = id ? getVideogen(id) : null;
      if (it?.cancel_requested) {
        if (taskId) {
          try { await stop(base, key, taskId); } catch { /* best effort */ }
          updateVideogen(id, { state: "cancelled", charge: "indeterminate", error: "đã huỷ khi đang chạy" });
        } else if (posting) {
          updateVideogen(id, { state: "indeterminate", charge: "indeterminate", error: "huỷ lúc đang gửi; không biết G-Labs đã nhận chưa" });
        } else {
          updateVideogen(id, { state: "cancelled", charge: "none" });
        }
        r = { ok: false, cancelled: true, id };
      } else {
        if (id && posting && !taskId) updateVideogen(id, { state: "indeterminate", charge: "indeterminate", error: "Studio tắt lúc đang gửi; không biết G-Labs đã nhận chưa" });
        r = { ok: false, resumable: true, id };
      }
    } catch (e) {
      r = { ok: false, error: e.message, id };
    }
    console.log(RESULT_PREFIX + JSON.stringify(r));
    process.exit(0);
  });
  runVideogen(arg, { log: (l) => console.log(l), signal: ac.signal }).then((r) => {
    console.log(RESULT_PREFIX + JSON.stringify(r));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.error(`videogen: ${e.message}`);
    console.log(RESULT_PREFIX + JSON.stringify({ ok: false, error: e.message, status: e.status ?? 500, id }));
    process.exit(1);
  });
}
