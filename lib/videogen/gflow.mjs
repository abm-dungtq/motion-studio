// lib/videogen/gflow.mjs — gflow (https://github.com/abm-dungtq/gflow-studio, the abm-dungtq edition of gflow-cli) as a child process:
// argv and env of a generation, the submit events of its log, the classification of how a run
// ended, the match against gflow's local catalog, and the free calls (version, profiles, project
// create, catalog list, media download).
// Facts of gflow 0.90 to 0.92 this module relies on (docs/videogen.md):
// - stdout of --json is ONE object indented over many lines (json_output.emit, indent=2);
// - stderr with GFLOW_CLI_LOG_FORMAT=json is structlog JSON lines; the name is under "event"
//   (default JSONRenderer, no EventRenamer: gflow_cli/observability.py);
// - exit codes as in USAGE.md § Exit codes; the browser is spawned detached by Playwright, so it
//   sits in its own process group: SIGINT lets the driver close it, SIGKILL needs the whole tree.
// Nothing read here is printed raw: emails and signed URLs go through scrub(), profile entries
// keep their name only, results keep the fields listed in parseResult().
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Releases whose exit codes, events and JSON were checked against this module. 0.91 changed none
// of them (its lost-submit recovery only turns some exit 9 runs into a downloaded clip); nor did
// 0.92 (MCP path checks, a cross-disk -o move, and gflow-studio's run/batch flags Studio never passes).
export const GFLOW_TESTED = ["0.90.", "0.91.", "0.92."];
export const gflowTested = (version) => GFLOW_TESTED.some((p) => String(version ?? "").startsWith(p));
// Exit codes gflow returns before anything is sent to Flow (USAGE.md § Exit codes). 10 (WAF) and
// 6 are handled on their own; 11 is here only when no submit event was seen.
export const PRE_SUBMIT = new Set([2, 3, 4, 8, 11, 12, 14, 16, 17, 18, 22, 23, 24, 27, 28, 29, 31, 32, 36, 37, 38, 39]);
export const SENT_EVENTS = ["migrated.submit_clicked", "ui_automation.prompt_submitted", "migrated.agent_only.submitted"];
// The prompt is in the composer: from here a kill may race the click. The agent-only and the old
// labs paths do not log prompt_typed, and the submit events come only after the click returned.
export const ARMED_EVENTS = ["migrated.prompt_typed", "migrated.agent_only_composer", "ui_automation.prompt_input_found"];
export const WAF_BLOCK_MS = 45 * 60e3;
// The temp output of a run: Studio asks for `.part-<id>.<ext>`, gflow swaps the extension for the
// real format (Flow serves JPEG images) and saves several results as `<stem>_1.<ext>`, `_2`, ...
// Returns the absolute paths of the non-empty ones, in name order.
export function partFiles(dir, kind, id) {
  const gen = join(dir, "assets", "gen", kind);
  let names;
  try { names = readdirSync(gen); } catch { return []; }
  const stem = `.part-${id}`;
  return names.filter((n) => n.startsWith(`${stem}.`) || n.startsWith(`${stem}_`)).sort()
    .map((n) => join(gen, n)).filter((f) => { try { return statSync(f).isFile() && statSync(f).size > 0; } catch { return false; } });
}
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

// Signed URLs lose their query, emails and absolute local paths (a ProfileLockedError names the
// profile directory) are replaced.
export const scrub = (text) => String(text ?? "")
  .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, "$1")
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
  // A segment with a space ("Application Support/…") stays part of the path.
  .replace(/(?<![\w:/])(?:~|\/(?:Users|home|private|var|tmp|Volumes|root|opt))\/[^\s'"),]+(?: [^\s'"),/]+\/[^\s'"),]*)*/g, "[đường dẫn]");

const oneUuid = (...texts) => {
  const ids = new Set(texts.flatMap((t) => String(t ?? "").match(UUID) ?? []).map((x) => x.toLowerCase()));
  return ids.size === 1 ? [...ids][0] : null;
};

// The fields Studio keeps of gflow's stdout (an allow-list). Signed URLs, local paths and incident
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
    const cls = typeof e.class === "string" ? e.class : null;
    // Read on the raw text, before scrub and the 300-character cut: gflow has no reason field.
    // The project-not-found landing is a ConfigurationError (api/transports/_common.py); the id of
    // a clip Flow made but could not hand over sits in the detail (labs host) or only in the hint
    // (flow.google.com).
    r.error = { class: cls, exit_code: Number.isInteger(e.exit_code) ? e.exit_code : null, retryable: e.retryable === true,
      detail: scrub(e.detail ?? e.title ?? "").slice(0, 300), hint: scrub(e.remediation_hint ?? "").slice(0, 300),
      project_missing: cls === "ConfigurationError" && /project-not-found page/.test(String(e.detail ?? "")),
      media_id: oneUuid(e.detail, e.remediation_hint) };
  }
  return r;
}

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
  const okOut = r.status === "ok" && (kind === "image" ? r.images?.length >= 1 : r.succeeded === true);
  if (code === 0 && okOut && fileOk) return { ...base, state: "collected", charge: "charged", media_id: kind === "image" ? r.images[0].media_name : r.media_id ?? null };
  const reconcile = (error) => ({ ...base, state: "reconcile", charge: "indeterminate", reconcile: true, error });
  if (version && !gflowTested(version)) return reconcile(`gflow ${version} chưa được kiểm với Studio; ${why(r, code)}`);
  const e = r.error ?? null;
  // The image path on flow.google.com clicks submit without logging it (migrated_composer.py): for
  // an image the prompt in the composer counts as sent.
  const sent = ev.sent || (kind === "image" && ev.armed);
  if (code === 6 && e?.class === "MediaDownloadError" && sent) {
    const made = kind === "image" ? "Flow đã tạo ảnh nhưng tải file hỏng; ảnh không tải lại được, mở Flow rồi Nhập file" : "Flow đã tạo nhưng tải file hỏng; bấm Tải về từ Flow";
    return e.media_id ? { ...base, state: "made", charge: "charged", media_id: e.media_id, error: made } : reconcile(why(r, code));
  }
  if (r.succeeded === false || code === 5 || /^video generation failed/i.test(e?.detail ?? "")) {
    const reasons = r.failure_reasons?.length ? ` (${r.failure_reasons.join(", ")})` : "";
    return { ...base, state: "failed", charge: "indeterminate", media_id: r.media_id ?? null, error: `Flow báo tạo hỏng${reasons}` };
  }
  if (code === 10) {
    // A video WAF is a refused submit. An image is downloaded after it is made, and a 403 on that
    // download is reported as WAF too: only a refused submit is free.
    if (kind !== "image" || !sent || /refused the submit|likely WAF/i.test(e?.detail ?? "")) return { ...base, state: "failed", charge: "none", waf: true, error: "Flow chặn tạm vì gửi quá nhiều (WAF); chờ rồi thử lại" };
    return { ...reconcile("Flow chặn tải ảnh (WAF) sau khi điền prompt; ảnh có thể đã được tạo, mở Flow kiểm"), waf: true };
  }
  if (!sent && NOTICE[code]) return { ...base, state: "failed", charge: "none", error: `${NOTICE[code]} (${why(r, code)})` };
  if (!sent && (PRE_SUBMIT.has(code) || (code === 6 && e?.retryable === true))) return { ...base, state: "failed", charge: "none", error: why(r, code) };
  if (aborted && !ev.armed && !sent) return { ...base, state: "cancelled", charge: "none" };
  return reconcile(aborted ? (sent ? "ngừng chờ sau khi gửi; Flow vẫn tạo và tính credit" : "huỷ sau khi điền prompt") : why(r, code));
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
export const snapshotTree = (pid) => treeOf(pid);
// SIGKILL to a gflow run's group, its tree now and the pids of earlier snapshots: once gflow has
// exited, a browser it left behind is re-parented and no longer under it.
export function killTree(pid, known = []) {
  const all = new Set([...treeOf(pid), ...known]);
  kill(-pid, "SIGKILL");
  for (const p of all) kill(p, "SIGKILL");
}

// Runs gflow in its own process group. On abort: SIGINT to the group (the Playwright driver closes
// the browser), then after killAfterMs SIGKILL to the group, to every descendant and to every pid
// seen under it (snapshots when the prompt is typed and at the abort), even if gflow has exited by
// then. onTree(pids) gets each snapshot (the runner's last resort uses them).
// Resolves once gflow has exited and its stdout has ended (at most 2 s after the exit: a browser
// left alive may hold the pipes open).
export function spawnGflow(bin, argv, { env = gflowEnv(), cwd, signal = null, onStderr = null, onSpawn = null, onTree = null, killAfterMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", partial = "", killed = false, settled = false, timer = null, exitTimer = null;
    let exited = null, outEnded = false, snapped = false;
    const seen = new Set();
    let child;
    try { child = spawn(bin, argv, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {
      resolve({ code: null, signal: null, stdout: "", stderr: String(e.message), killed: false, spawnError: e.code ?? e.message });
      return;
    }
    if (child.pid) onSpawn?.(child.pid);
    const snap = () => {
      for (const p of treeOf(child.pid)) if (p !== child.pid) seen.add(p);
      onTree?.([...seen]);
    };
    const finish = (code, sig) => {
      if (settled) return;
      settled = true;
      // After an abort, whatever gflow left behind (a browser in its own group) is killed now: the
      // caller may exit right after, and a timer would die with it.
      if (killed) killTree(child.pid, [...seen]);
      clearTimeout(timer);
      clearTimeout(exitTimer);
      signal?.removeEventListener("abort", onAbort);
      if (partial && onStderr) onStderr(partial);
      resolve({ code, signal: sig, stdout, stderr, killed });
    };
    const onAbort = () => {
      if (settled || killed) return;
      killed = true;
      snap();
      kill(-child.pid, "SIGINT");
      timer = setTimeout(() => killTree(child.pid, [...seen]), killAfterMs);
    };
    child.on("error", (e) => { stderr += String(e.message); finish(null, null); });
    child.stdout.on("data", (d) => { if (stdout.length < MAX_OUT) stdout += d; });
    child.stderr.on("data", (d) => {
      const s = String(d);
      if (stderr.length < MAX_OUT) stderr += s;
      const parts = (partial + s).split("\n");
      partial = parts.pop();
      for (const l of parts) {
        if (!snapped && ARMED_EVENTS.some((e) => l.includes(`"${e}"`))) { snapped = true; snap(); }
        onStderr?.(l);
      }
    });
    child.stdout.on("end", () => { outEnded = true; if (exited) finish(...exited); });
    child.on("exit", (code, sig) => {
      exited = [code, sig];
      if (outEnded) finish(code, sig); else exitTimer = setTimeout(() => finish(code, sig), 2000);
    });
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
  // `auth status` has no --json: exit 0 signed in, 1 not.
  const r = await call(bin, ["auth", "status", "--profile", profile], { timeoutMs: 30e3, ...opts });
  return { ok: r.code === 0, code: r.code };
}

export async function createProject(bin, profile, title, opts) {
  // gflow waits up to 120 s for the page RPC (PAGE_RPC_TIMEOUT_S).
  const r = await call(bin, ["project", "create", "--name", title, "--profile", profile, "--json"], { timeoutMs: 150e3, ...opts });
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
