// lib/videogen/gflow.mjs — gflow-cli (https://github.com/ffroliva/gflow-cli) as a child process:
// argv and env of a generation, the submit events of its log, the classification of how a run
// ended, the match against gflow's local catalog, and the free calls (version, profiles, project
// create, catalog list, media download).
// Facts of gflow 0.90 this module relies on (docs/videogen.md):
// - stdout of --json is ONE object indented over many lines (json_output.emit, indent=2);
// - stderr with GFLOW_CLI_LOG_FORMAT=json is structlog JSON lines; the name is under "event"
//   (default JSONRenderer, no EventRenamer: gflow_cli/observability.py);
// - exit codes as in USAGE.md § Exit codes; the browser is spawned detached by Playwright, so it
//   sits in its own process group: SIGINT lets the driver close it, SIGKILL needs the whole tree.
// Nothing read here is printed raw: emails and signed URLs go through scrub(), profile entries
// keep their name only, results keep the fields listed in parseResult().
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GFLOW_TESTED = "0.90.";
// Exit codes gflow returns before anything is sent to Flow (USAGE.md § Exit codes). 10 (WAF) and
// 6 are handled on their own; 11 is here only when no submit event was seen.
export const PRE_SUBMIT = new Set([2, 3, 4, 8, 11, 12, 14, 16, 17, 18, 22, 23, 24, 27, 28, 29, 31, 32, 36, 37, 38, 39]);
export const SENT_EVENTS = ["migrated.submit_clicked", "ui_automation.prompt_submitted", "migrated.agent_only.submitted"];
// The prompt is in the composer: from here a kill may race the click. The agent-only and the old
// labs paths do not log prompt_typed, and the submit events come only after the click returned.
export const ARMED_EVENTS = ["migrated.prompt_typed", "migrated.agent_only_composer", "ui_automation.prompt_input_found"];
export const WAF_BLOCK_MS = 45 * 60e3;
const MAX_OUT = 2 * 1024 * 1024;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NOTICE = {
  3: "đăng nhập Google Flow hết hạn: chạy gflow auth login",
  11: "gflow không chạy được với cấu hình này (profile đang bận, project Flow không dùng được hoặc thiếu quyền ghi)",
  37: "hết credit Flow",
  39: "tài khoản không có quyền dùng Flow",
};

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function gflowEnv(base = process.env) {
  const env = { ...base };
  delete env.GFLOW_CLI_PROJECT;
  delete env.GFLOW_CLI_PROFILE;
  // A cloud storage URI together with -o makes gflow refuse the run (exit 11).
  delete env.GFLOW_CLI_STORAGE_URI;
  return { ...env, GFLOW_CLI_LOG_FORMAT: "json", GFLOW_CLI_LOG_LEVEL: "INFO", GFLOW_CLI_UPDATE_CHECK: "0", GFLOW_CLI_LEASE_WAIT_SECONDS: "0" };
}

// argv of one generation. refsAbs: absolute paths of spec.refs, in order.
export function genArgv(spec, { profile, project, out, refsAbs = [] }) {
  if (typeof spec.prompt !== "string" || !spec.prompt.trim() || spec.prompt.includes("\0")) throw bad("prompt rỗng hoặc có ký tự không hợp lệ");
  if (!profile || !project || !out) throw bad("thiếu profile, project hoặc file ra");
  const common = ["--profile", profile, "--project", project, "--model", spec.model];
  if (spec.kind === "image") {
    const i2i = spec.mode === "i2i";
    return ["image", i2i ? "i2i" : "t2i", ...common, "--aspect", spec.aspect, "-n", "1", "-o", out, "--json", ...(i2i ? ["--ref", refsAbs[0]] : []), "--", spec.prompt];
  }
  const i2v = spec.mode !== "t2v";
  return ["video", i2v ? "i2v" : "t2v", ...common, "--duration", String(spec.seconds), "--aspect", spec.aspect,
    ...(spec.model === "omni-flash" && spec.resolution ? ["--resolution", spec.resolution] : []),
    "--count", "1", "-o", out, "--json",
    ...(i2v ? ["-i", refsAbs[0]] : []), ...(spec.mode === "start_end" ? ["-e", refsAbs[1]] : []),
    "--", spec.prompt];
}

// Event names of gflow's JSON log lines; other lines are skipped.
export function parseEvents(text) {
  const events = [];
  for (const l of String(text ?? "").split("\n")) {
    if (!l.startsWith("{")) continue;
    try { const o = JSON.parse(l); if (typeof o.event === "string") events.push(o.event); } catch { /* not a log line */ }
  }
  return { events, armed: events.some((e) => ARMED_EVENTS.includes(e)), sent: events.some((e) => SENT_EVENTS.includes(e)), agentOnly: events.includes("migrated.agent_only_composer") };
}

export const scrub = (text) => String(text ?? "").replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, "$1").replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");

// The fields Studio keeps of gflow's stdout. Signed URLs (fife_url), local paths and incident
// files stay behind.
export function parseResult(stdout) {
  const s = String(stdout ?? "").trim();
  let o = null;
  try { o = JSON.parse(s); } catch {
    const i = s.lastIndexOf("\n{");
    try { o = JSON.parse(i >= 0 ? s.slice(i + 1) : s.slice(s.indexOf("{"))); } catch { o = null; }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = { status: typeof o.status === "string" ? o.status : null };
  if (typeof o.succeeded === "boolean") r.succeeded = o.succeeded;
  if (typeof o.media_id === "string") r.media_id = o.media_id;
  if (Array.isArray(o.failure_reasons)) r.failure_reasons = o.failure_reasons.filter((x) => typeof x === "string").map(scrub);
  if (Array.isArray(o.images)) r.images = o.images.map((x) => ({ media_name: typeof x?.media_name === "string" ? x.media_name : null }));
  if (o.error && typeof o.error === "object") {
    const e = o.error;
    r.error = { class: typeof e.class === "string" ? e.class : null, exit_code: Number.isInteger(e.exit_code) ? e.exit_code : null, retryable: e.retryable === true,
      detail: scrub(e.detail ?? e.title ?? "").slice(0, 300), hint: scrub(e.remediation_hint ?? "").slice(0, 300), reason: typeof e.reason === "string" ? e.reason : null };
  }
  return r;
}

const oneUuid = (...texts) => {
  const ids = new Set(texts.flatMap((t) => String(t ?? "").match(UUID) ?? []).map((x) => x.toLowerCase()));
  return ids.size === 1 ? [...ids][0] : null;
};
const why = (result, code) => {
  const e = result?.error;
  return e ? `gflow ${code}${e.class ? ` ${e.class}` : ""}${e.detail ? `: ${e.detail}` : ""}` : `gflow thoát mã ${code}`;
};

// How a run ended (plan table in docs/videogen.md). result: parseResult(stdout); ev: parseEvents;
// fileOk: the -o file exists and is not empty; aborted: Studio stopped it.
// Returns { state, charge, media_id, error, reconcile, waf }; state "reconcile" means: look in the
// catalog before deciding.
export function classify({ code, aborted = false, result = null, ev = { armed: false, sent: false }, fileOk = false, version = null, kind = "video" }) {
  const r = result ?? {};
  const base = { media_id: null, error: null, reconcile: false, waf: false };
  const okOut = r.status === "ok" && (kind === "image" ? r.images?.length === 1 : r.succeeded === true);
  if (code === 0 && okOut && fileOk) return { ...base, state: "collected", charge: "charged", media_id: kind === "image" ? r.images[0].media_name : r.media_id ?? null };
  const reconcile = (error) => ({ ...base, state: "reconcile", charge: "indeterminate", reconcile: true, error });
  if (version && !String(version).startsWith(GFLOW_TESTED)) return reconcile(`gflow ${version} chưa được kiểm với Studio; ${why(r, code)}`);
  const e = r.error ?? null;
  if (code === 6 && (e?.class === "MediaDownloadError" || e?.retryable === false)) {
    const id = oneUuid(e?.detail, e?.hint);
    return id ? { ...base, state: "made", charge: "charged", media_id: id, error: "Flow đã tạo nhưng tải file hỏng; bấm Tải về từ Flow" } : reconcile(why(r, code));
  }
  if (r.succeeded === false || code === 5 || /^video generation failed/i.test(e?.detail ?? "")) {
    const reasons = r.failure_reasons?.length ? ` (${r.failure_reasons.join(", ")})` : "";
    return { ...base, state: "failed", charge: "indeterminate", media_id: r.media_id ?? null, error: `Flow báo tạo hỏng${reasons}` };
  }
  if (code === 10) return { ...base, state: "failed", charge: "none", waf: true, error: "Flow chặn tạm vì gửi quá nhiều (WAF); chờ rồi thử lại" };
  if (!ev.sent && NOTICE[code]) return { ...base, state: "failed", charge: "none", error: `${NOTICE[code]} (${why(r, code)})` };
  if (!ev.sent && (PRE_SUBMIT.has(code) || (code === 6 && e?.retryable === true))) return { ...base, state: "failed", charge: "none", error: why(r, code) };
  if (aborted && !ev.armed && !ev.sent) return { ...base, state: "cancelled", charge: "none" };
  return reconcile(aborted ? (ev.sent ? "ngừng chờ sau khi gửi; Flow vẫn tạo và tính credit" : "huỷ sau khi điền prompt") : why(r, code));
}

// Catalog rows that are this run: same Flow project and exact prompt, created no earlier than 5 s
// before the intent, not failed, not an id the ledger has already.
export function matchCatalog(rows, { project, prompt, since, known = [] }) {
  const t0 = Date.parse(since) - 5000;
  const seen = new Set(known);
  return (rows ?? []).filter((x) => x && x.project_id === project && x.prompt != null && x.prompt === prompt
    && Date.parse(x.created_at) >= t0 && !String(x.status ?? "").toUpperCase().includes("FAILED") && !seen.has(x.media_id));
}

// pid and every descendant of it, from one `ps` snapshot (follows ppid, so a browser in its own
// process group is included).
function treeOf(pid) {
  let text = "";
  try { text = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }); } catch { return [pid]; }
  const kids = new Map();
  for (const l of text.split("\n")) {
    const [p, pp] = l.trim().split(/\s+/).map(Number);
    if (!p || Number.isNaN(pp)) continue;
    if (!kids.has(pp)) kids.set(pp, []);
    kids.get(pp).push(p);
  }
  const out = [pid];
  for (let i = 0; i < out.length; i++) for (const c of kids.get(out[i]) ?? []) out.push(c);
  return out;
}
const kill = (pid, sig) => { try { process.kill(pid, sig); } catch { /* gone */ } };
// SIGKILL to a gflow run's group and its whole tree (the runner's last resort before it exits).
export function killTree(pid) {
  const tree = treeOf(pid);
  kill(-pid, "SIGKILL");
  for (const p of tree) kill(p, "SIGKILL");
}

// Runs gflow in its own process group. On abort: SIGINT to the group (the Playwright driver closes
// the browser), then after killAfterMs SIGKILL to the group and to every descendant.
export function spawnGflow(bin, argv, { env = gflowEnv(), cwd, signal = null, onStderr = null, onSpawn = null, killAfterMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", partial = "", killed = false, settled = false, timer = null, exitTimer = null;
    let child;
    try { child = spawn(bin, argv, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {
      resolve({ code: null, signal: null, stdout: "", stderr: String(e.message), killed: false, spawnError: e.code ?? e.message });
      return;
    }
    if (child.pid) onSpawn?.(child.pid);
    const finish = (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(exitTimer);
      signal?.removeEventListener("abort", onAbort);
      if (partial && onStderr) onStderr(partial);
      resolve({ code, signal: sig, stdout, stderr, killed });
    };
    const onAbort = () => {
      if (settled || killed) return;
      killed = true;
      kill(-child.pid, "SIGINT");
      timer = setTimeout(() => killTree(child.pid), killAfterMs);
    };
    child.on("error", (e) => { stderr += String(e.message); finish(null, null); });
    child.stdout.on("data", (d) => { if (stdout.length < MAX_OUT) stdout += d; });
    child.stderr.on("data", (d) => {
      const s = String(d);
      if (stderr.length < MAX_OUT) stderr += s;
      if (!onStderr) return;
      const parts = (partial + s).split("\n");
      partial = parts.pop();
      for (const l of parts) onStderr(l);
    });
    // A browser left alive may hold our pipes open: do not wait for "close" forever after exit.
    child.on("exit", (code, sig) => { exitTimer = setTimeout(() => finish(code, sig), 300); });
    child.on("close", (code, sig) => finish(code, sig));
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  });
}

// One free gflow call in an empty working directory, stopped after timeoutMs or when signal aborts.
async function call(bin, argv, { timeoutMs = 60e3, env = gflowEnv(), signal = null, onSpawn = null } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "ms-gflow-"));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const stop = () => ac.abort();
  if (signal) { if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true }); }
  try { return await spawnGflow(bin, argv, { env, cwd, signal: ac.signal, onSpawn, killAfterMs: 2000 }); } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", stop);
    rmSync(cwd, { recursive: true, force: true });
  }
}
const failed = (r, what) => Object.assign(new Error(`${what}: ${why(parseResult(r.stdout), r.code)}`), { status: 502, code: r.code, result: parseResult(r.stdout) });

export function gflowVersion(bin) {
  const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15e3, env: gflowEnv(), cwd: tmpdir() });
  return r.status === 0 ? /version\s+(\S+)/.exec(r.stdout)?.[1] ?? null : null;
}

// The name of gflow's default profile, nothing else of its profile list.
export async function defaultProfile(bin, opts) {
  const r = await call(bin, ["auth", "list", "--json"], opts);
  if (r.code !== 0) return null;
  let list;
  try { list = JSON.parse(r.stdout); } catch { return null; }
  const p = Array.isArray(list) ? list.find((x) => x?.is_default) : null;
  return typeof p?.name === "string" ? p.name : null;
}

export async function authStatus(bin, profile, opts) {
  const r = await call(bin, ["auth", "status", "--profile", profile, "--json"], { timeoutMs: 30e3, ...opts });
  return { ok: r.code === 0, code: r.code };
}

export async function createProject(bin, profile, title, opts) {
  const r = await call(bin, ["project", "create", "--name", title, "--profile", profile, "--json"], opts);
  let o = null;
  try { o = JSON.parse(r.stdout); } catch { /* below */ }
  if (r.code !== 0 || typeof o?.project_id !== "string") throw failed(r, "tạo project Flow");
  return { id: o.project_id, title: typeof o.title === "string" ? o.title : title };
}

export async function listCatalog(bin, kind, profile, opts) {
  const r = await call(bin, ["data", "list", kind === "image" ? "images" : "videos", "--profile", profile, "--limit", "50", "--json"], opts);
  if (r.code !== 0) throw failed(r, "đọc danh mục gflow");
  const rows = [];
  for (const l of r.stdout.split("\n")) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l); rows.push({ media_id: o.media_id, project_id: o.project_id, prompt: o.prompt, created_at: o.created_at, status: o.status ?? null, model: o.model ?? null }); } catch { /* skip */ }
  }
  return rows;
}

// Downloads a finished clip again (free). Returns { path, bytes }.
export async function downloadMedia(bin, mediaId, profile, outDir, opts) {
  const r = await call(bin, ["data", "download", mediaId, "--out", outDir, "--profile", profile, "--json"], { timeoutMs: 180e3, ...opts });
  let o = null;
  try { o = JSON.parse(r.stdout); } catch { /* below */ }
  if (r.code !== 0 || typeof o?.path !== "string") throw failed(r, "tải về từ Flow");
  return { path: o.path, bytes: o.bytes ?? null };
}
