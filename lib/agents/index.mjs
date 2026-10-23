// lib/agents/index.mjs — the registry of coding-agent CLIs on this machine and the one way the
// rest of Studio gets text, image reading or image making done by them.
//
//   listAgents({ refresh })        → { agents: [{ id, label, found, path, version, logged_in,
//                                      method, caps, verified, quota, models?, error }], order, at }
//   generateImage({ prompt, refs, edit, out, size, project, agent }) → { ok, file, agent, receipt, tried }
//   describeImages({ images, prompt, schema, agent })                → { ok, json, text, agent, tried }
//   complete({ prompt, schema, agent })                               → { ok, text, json, agent, tried }
//   probe(id, cap)                 → "Thử khả năng": one real run, result kept in agents.json
//
// Adapters are lib/agents/cli/*.mjs (default export: an adapter or a list of them):
//   { id, label, rank, bins, caps: { text, vision, image: "yes" | "no" | "unknown" },
//     detect(io) → { found, path, version, error }, auth(io) → { logged_in, method, models? },
//     quota?(io), run: { text?, vision?, image? }(io, req) → { code, stdout, stderr, error, text } }
// io = { env, bin }. A scan is cached 60 s (refresh: true drops it); nothing a CLI prints about an
// account leaves an adapter except booleans, counts, model ids and percentages, and every string
// of the result goes through redact().
//
// Routing: studio.json agents.order[cap] (lib/config.mjs SETTINGS), else DEFAULT_ORDER. An agent
// is skipped when it is not found, broken, logged out, has caps[cap] "no", or (codex-pool) has no
// account that can run; codex is skipped while codex-pool can run, so every Codex call goes
// through its quota balancing. "unknown" agents come after every "yes" one. A quota error
// (QUOTA_RE) or a failed run moves to the next agent; a refusal stops and says why. One run at a
// time per agent. Runs happen in a fresh temp folder that is removed afterwards.
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentsFile, readState, stateFile } from "../config.mjs";
import { IMAGE_EXT } from "../../media.mjs";
import { writeReceipt } from "../receipts.mjs";
import { redact, redactDeep } from "./redact.mjs";
import { exec, firstJson } from "./run.mjs";

const CLI_DIR = fileURLToPath(new URL("./cli/", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const CACHE_MS = 60000;
export const CAPS = ["text", "vision", "image"];
export const DEFAULT_ORDER = {
  image: ["codex-pool", "codex", "agy", "gemini"],
  vision: ["agy", "codex-pool", "claude", "gemini"],
  text: ["agy", "codex-pool", "claude", "opencode"],
};
export const QUOTA_RE = /out of credits|usage limit|rate limit|quota exceeded|429/i;
// A final message that says no to the request itself (not a crash): stop, do not try another agent.
export const REFUSE_RE = /\b(?:can(?:no|')t|unable to|won't|will not|not able to|refuse[sd]?|declin(?:e|ed|ing))\b[^.\n]{0,80}\b(?:generate|create|make|produce|draw|help|comply|assist|edit)\b|content polic|safety (?:system|polic)|against (?:my|the) (?:guidelines|policy)/i;
const TIMEOUT = { image: 6 * 60000, vision: 3 * 60000, text: 3 * 60000 };
// Where "Thử khả năng" keeps the image it made, with its receipt.
export const probeDir = (env = process.env) => join(env.HOME || homedir(), ".cache", "motion-studio", "agent-probe");

// ---- adapters and scan ------------------------------------------------------------------------
let adapterList = null;
export function loadAdapters(dir = CLI_DIR) {
  if (dir !== CLI_DIR) return importAdapters(dir);
  adapterList ??= importAdapters(dir);
  return adapterList;
}
async function importAdapters(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    for (const a of [mod.default].flat()) {
      if (!a?.id || typeof a.detect !== "function" || typeof a.auth !== "function") throw new Error(`lib/agents/cli/${f}: adapter thiếu id, detect() hoặc auth()`);
      if (out.some((x) => x.id === a.id)) throw new Error(`lib/agents/cli/${f}: agent ${a.id} trùng`);
      out.push(a);
    }
  }
  return out.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.id.localeCompare(b.id));
}

// "Thử khả năng" results: { <id>: { <cap>: { ok, at, detail } } }.
export function readVerified(env = process.env) {
  try { const v = JSON.parse(readFileSync(agentsFile(env), "utf8")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function writeVerified(env, data) {
  const f = agentsFile(env);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, f);
  chmodSync(f, 0o600);
}

// A proven capability is "yes"; one that a probe disproved is "no" only if it was not known "yes".
export function effectiveCaps(caps, verified = {}) {
  const out = {};
  for (const c of CAPS) {
    const base = caps?.[c] ?? "unknown", v = verified?.[c];
    out[c] = v?.ok === true ? "yes" : v?.ok === false && base === "unknown" ? "no" : base;
  }
  return out;
}

export function orderOf(env = process.env) {
  const set = readState(stateFile(env))?.agents?.order;
  const out = {};
  for (const c of CAPS) {
    const v = set?.[c];
    out[c] = Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? [...new Set(v)] : DEFAULT_ORDER[c];
  }
  return out;
}

async function scanOne(a, env, verified) {
  const row = { id: a.id, label: a.label ?? a.id, found: false, path: null, version: null, logged_in: null, method: null, caps: effectiveCaps(a.caps, verified[a.id]), verified: verified[a.id] ?? null, quota: null, detect_only: Boolean(a.detectOnly), error: null };
  try {
    const d = await a.detect({ env });
    Object.assign(row, { found: Boolean(d.found), path: d.path ?? null, version: d.version ?? null, error: d.error ?? null });
    if (!row.found || row.error) return row;
    const io = { env, bin: row.path };
    const au = await a.auth(io);
    row.logged_in = typeof au?.logged_in === "boolean" ? au.logged_in : null;
    row.method = au?.method ?? null;
    if (Array.isArray(au?.models)) row.models = au.models.slice(0, 50);
    if (a.quota) row.quota = (await a.quota(io)) ?? null;
  } catch (e) { row.error = `lỗi khi quét: ${e.message}`; }
  return row;
}

let cache = null; // { key, at, promise }
// The last scan, without starting one (null before the first). For GET /api/agent.
export function peekAgents() { return cache?.value ?? null; }

export function listAgents({ refresh = false, env = process.env, adapters = null } = {}) {
  const key = [env.PATH, env.MOTION_STUDIO_AGENT_PATH, env.HOME, stateFile(env)].join("\0");
  if (!adapters && !refresh && cache?.key === key && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = (async () => {
    const list = adapters ?? await loadAdapters();
    const verified = readVerified(env);
    const agents = await Promise.all(list.map((a) => scanOne(a, env, verified)));
    const value = { agents: redactDeep(agents), order: orderOf(env), at: new Date().toISOString() };
    if (!adapters && cache?.promise === promise) cache.value = value;
    return value;
  })();
  if (!adapters) {
    const prev = cache?.value ?? null;
    cache = { key, at: Date.now(), promise, value: prev };
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
  }
  return promise;
}
export const dropCache = () => { cache = null; };

// Short rows for the topbar chip (GET /api/agent): no paths, no model lists.
export const summarize = (scan) => scan ? scan.agents.map(({ id, label, found, version, logged_in, caps, error }) => ({ id, label, found, version, logged_in, caps, error: error ? true : undefined })) : null;

// ---- routing ----------------------------------------------------------------------------------
const poolDown = (a) => a.id === "codex-pool" && Array.isArray(a.quota?.accounts) && !a.quota.accounts.some((x) => x.ok);
const usable = (a, cap) => a.found && !a.error && a.logged_in !== false && a.caps?.[cap] !== "no" && !poolDown(a);

// The agents to try for cap, in order (pure: scan rows and the order list).
export function pick(cap, agents, order = DEFAULT_ORDER[cap]) {
  const by = new Map(agents.map((a) => [a.id, a]));
  let list = order.map((id) => by.get(id)).filter((a) => a && usable(a, cap));
  if (list.some((a) => a.id === "codex-pool")) list = list.filter((a) => a.id !== "codex");
  return [...list.filter((a) => a.caps[cap] === "yes"), ...list.filter((a) => a.caps[cap] !== "yes")];
}

const locks = new Map(); // agent id → tail of its queue
function locked(id, fn) {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return run;
}

// Runs cap on each candidate until accept(result, agent) says ok. Returns { ok, agent, value,
// tried: [{ id, error, quota? }], refused?, error? }.
async function route(cap, makeReq, accept, { agent: only = null, env = process.env, adapters = null, timeout = TIMEOUT[cap] } = {}) {
  const [scan, list] = await Promise.all([listAgents({ env, adapters }), adapters ?? loadAdapters()]);
  const byId = new Map(list.map((a) => [a.id, a]));
  // The order is read on every call: a changed studio.json applies without a rescan.
  const cands = only ? scan.agents.filter((a) => a.id === only && a.found && !a.error) : pick(cap, scan.agents, orderOf(env)[cap]);
  if (only && !cands.length) return { ok: false, error: `không dùng được agent ${only} (không thấy hoặc lỗi)`, tried: [] };
  if (!cands.length) return { ok: false, error: `không có agent nào làm được "${cap}" (xem chip Agent trên máy)`, tried: [] };
  const tried = [];
  for (const a of cands) {
    const run = byId.get(a.id)?.run?.[cap];
    if (!run) { tried.push({ id: a.id, error: "adapter không có lệnh cho việc này" }); continue; }
    const cwd = mkdtempSync(join(tmpdir(), `ms-agent-${cap}-`));
    try {
      const out = await locked(a.id, async () => {
        const req = await makeReq(cwd);
        const started = Date.now();
        const r = await run({ env, bin: a.path }, { ...req, timeout, cwd });
        return { r, req, started };
      });
      const { r } = out;
      const all = redact(`${r.stdout ?? ""}\n${r.stderr ?? ""}\n${r.text ?? ""}`);
      if (r.error === "timeout") { tried.push({ id: a.id, error: "timeout" }); continue; }
      const ok = await accept(out, a, cwd);
      if (ok.ok) return { ok: true, agent: a.id, version: a.version, value: ok.value, tried, text: redact(r.text ?? "") };
      if (QUOTA_RE.test(all)) { tried.push({ id: a.id, error: "hết quota", quota: true }); continue; }
      const last = redact(String(r.text ?? "").trim()).slice(0, 400);
      if (r.code === 0 && REFUSE_RE.test(last)) return { ok: false, refused: true, agent: a.id, error: `${a.label} từ chối: ${last}`, tried: [...tried, { id: a.id, error: "từ chối" }] };
      tried.push({ id: a.id, error: ok.error ?? (r.error ? `không chạy được (${r.error})` : r.code ? `exit ${r.code}: ${redact(String(r.stderr || r.stdout).trim().split("\n").at(-1) ?? "").slice(0, 200)}` : "không ra kết quả") });
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
  return { ok: false, error: `mọi agent đều không xong: ${tried.map((t) => `${t.id}: ${t.error}`).join("; ")}`, tried };
}

// ---- the three jobs ---------------------------------------------------------------------------
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const isImage = (f) => IMAGE_EXT.includes(extname(f).toLowerCase());
const needFile = (f, what) => {
  if (typeof f !== "string" || !isAbsolute(f)) throw bad(`${what}: cần đường dẫn tuyệt đối`);
  if (!statSync(f, { throwIfNoEntry: false })?.isFile()) throw bad(`${what}: không có file ${f}`);
  if (!isImage(f)) throw bad(`${what}: ${basename(f)} không phải ảnh (${IMAGE_EXT.join(" ")})`);
  return f;
};
const needPrompt = (p) => {
  if (typeof p !== "string" || !p.trim()) throw bad("cần prompt");
  if (p.length > 8000) throw bad("prompt dài quá 8000 ký tự");
  return p.trim();
};
// Copies files into dir as <stem>-1.ext, <stem>-2.ext, …; returns the names.
const stage = (files, dir, stem) => files.map((f, i) => { const n = `${stem}-${i + 1}${extname(f).toLowerCase()}`; copyFileSync(f, join(dir, n)); return n; });

// out, or out-2.png, out-3.png, … when taken; the file is moved there (never overwriting).
export function placeFree(src, out) {
  mkdirSync(dirname(out), { recursive: true });
  const ext = extname(out), stem = out.slice(0, -ext.length);
  for (let n = 1; n < 10000; n++) {
    const dest = n === 1 ? out : `${stem}-${n}${ext}`;
    try { copyFileSync(src, dest, constants.COPYFILE_EXCL); rmSync(src, { force: true }); return dest; } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  throw new Error(`không còn tên trống cho ${out}`);
}
// The nearest folder above file that holds project.json, else null.
function projectOf(file) {
  for (let d = dirname(resolve(file)); d !== dirname(d); d = dirname(d)) if (existsSync(join(d, "project.json"))) return d;
  return null;
}
// The newest PNG the run made in cwd (not a staged reference), else a .png path its answer names.
function madePng(cwd, since, skip, text) {
  const fresh = readdirSync(cwd).filter((f) => f.toLowerCase().endsWith(".png") && !skip.includes(f))
    .map((f) => ({ f: join(cwd, f), t: statSync(join(cwd, f)).mtimeMs })).filter((x) => x.t >= since - 2000).sort((a, b) => b.t - a.t);
  if (fresh.length) return fresh[0].f;
  for (const m of String(text ?? "").matchAll(/(\/[^\s"'`<>()]+\.png)\b/gi)) {
    const st = statSync(m[1], { throwIfNoEntry: false });
    if (st?.isFile() && st.mtimeMs >= since - 2000) return m[1];
  }
  return null;
}

export async function generateImage({ prompt, refs = [], edit = false, out, size = null, project = null, agent = null, actor = "studio", timeout, env = process.env, adapters = null } = {}) {
  const text = needPrompt(prompt);
  if (typeof out !== "string" || !isAbsolute(out) || extname(out).toLowerCase() !== ".png") throw bad("out: cần đường dẫn tuyệt đối tới file .png");
  if (!Array.isArray(refs) || refs.length > 8) throw bad("refs: tối đa 8 ảnh");
  refs.forEach((f, i) => needFile(f, `refs[${i}]`));
  if (edit && !refs.length) throw bad("edit cần ít nhất một ảnh trong refs");
  if (size != null && !/^\d{2,5}x\d{2,5}$/.test(String(size))) throw bad("size dạng 1024x1024");
  const started = new Date();
  let names = [];
  const r = await route("image", (cwd) => {
    names = stage(refs, cwd, "ref");
    return { prompt: text, images: names, edit: Boolean(edit), size, outName: "out.png" };
  }, ({ r: res, started: t0 }, _a, cwd) => {
    const f = madePng(cwd, t0, names, res.text);
    if (!f) return { ok: false, error: "không thấy file PNG nào được tạo" };
    return { ok: true, value: placeFree(f, out) };
  }, { agent, env, adapters, timeout });
  if (!r.ok) return { ok: false, error: r.error, refused: Boolean(r.refused), agent: r.agent ?? null, tried: r.tried };
  const dir = project ?? projectOf(r.value) ?? dirname(r.value);
  const receipt = await writeReceipt(dir, {
    op: "image-generate", actor, tool: { agent: r.agent, version: r.version ?? null },
    params: { prompt: text, edit: Boolean(edit), size }, inputs: { refs }, outputs: [r.value], started, ended: new Date(),
  });
  return { ok: true, file: r.value, agent: r.agent, receipt, tried: r.tried };
}

const jsonAsk = (schema) => `\n\nChỉ trả về đúng một khối JSON hợp lệ, không thêm chữ nào khác${schema ? `, theo JSON Schema này:\n${JSON.stringify(schema)}` : "."}`;
function withSchema(schema, cwd) {
  if (schema == null) return {};
  if (typeof schema !== "object" || Array.isArray(schema)) throw bad("schema phải là một object JSON Schema");
  const schemaFile = join(cwd, "schema.json");
  writeFileSync(schemaFile, JSON.stringify(schema));
  return { schemaFile, schema };
}

export async function describeImages({ images, prompt, schema = null, agent = null, timeout, env = process.env, adapters = null } = {}) {
  const text = needPrompt(prompt);
  if (!Array.isArray(images) || !images.length || images.length > 16) throw bad("images: 1 đến 16 ảnh");
  images.forEach((f, i) => needFile(f, `images[${i}]`));
  const r = await route("vision", (cwd) => ({ prompt: text + jsonAsk(schema), images: stage(images, cwd, "img"), ...withSchema(schema, cwd) }),
    ({ r: res }) => { const j = firstJson(res.text); return j == null ? { ok: false, error: "câu trả lời không có JSON" } : { ok: true, value: j }; }, { agent, env, adapters, timeout });
  return r.ok ? { ok: true, json: r.value, text: r.text, agent: r.agent, tried: r.tried } : { ok: false, error: r.error, refused: Boolean(r.refused), agent: r.agent ?? null, tried: r.tried };
}

export async function complete({ prompt, schema = null, agent = null, timeout, env = process.env, adapters = null } = {}) {
  const text = needPrompt(prompt);
  const r = await route("text", (cwd) => ({ prompt: schema ? text + jsonAsk(schema) : text, ...withSchema(schema, cwd) }), ({ r: res }) => {
    const t = String(res.text ?? "").trim();
    if (!t || res.code) return { ok: false, error: res.code ? `exit ${res.code}` : "câu trả lời rỗng" };
    if (!schema) return { ok: true, value: { text: t } };
    const j = firstJson(t);
    return j == null ? { ok: false, error: "câu trả lời không có JSON" } : { ok: true, value: { text: t, json: j } };
  }, { agent, env, adapters, timeout });
  return r.ok ? { ok: true, text: redact(r.value.text), json: r.value.json ?? null, agent: r.agent, tried: r.tried } : { ok: false, error: r.error, refused: Boolean(r.refused), agent: r.agent ?? null, tried: r.tried };
}

// ---- "Thử khả năng" ---------------------------------------------------------------------------
// One real run of cap on agent id (spends quota); the result is kept in agents.json.
export async function probe(id, cap, { env = process.env, log = () => {} } = {}) {
  if (!CAPS.includes(cap)) throw bad(`cap là ${CAPS.join(" | ")}`);
  let res;
  if (cap === "image") {
    const dir = probeDir(env);
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    log(`sinh một ảnh 256 px bằng ${id} → ${out}`);
    const r = await generateImage({ agent: id, env, out, project: dir, size: "256x256", prompt: "A simple flat red circle centered on a plain white background, minimal flat vector style, no text." });
    res = { ok: r.ok, detail: r.ok ? r.file : r.error, file: r.file ?? null, receipt: r.receipt?.file ? join(dir, r.receipt.file) : null };
  } else if (cap === "vision") {
    const dir = mkdtempSync(join(tmpdir(), "ms-probe-"));
    try {
      const img = join(dir, "solid.png");
      const ff = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
      const g = await exec(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=128x128", "-frames:v", "1", img], { env, timeout: 20000 });
      if (g.code !== 0) throw new Error(`ffmpeg không tạo được ảnh thử (${g.error ?? `exit ${g.code}`})`);
      log(`đọc một ảnh màu đặc bằng ${id}`);
      const r = await describeImages({ agent: id, env, images: [img], prompt: "What is the single dominant colour of this image? Use one English colour word.", schema: { type: "object", properties: { color: { type: "string" } }, required: ["color"] } });
      const ok = r.ok && /red/i.test(String(r.json?.color ?? ""));
      res = { ok, detail: r.ok ? `trả lời: ${JSON.stringify(r.json).slice(0, 120)}` : r.error };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  } else {
    log(`hỏi một câu ngắn bằng ${id}`);
    const r = await complete({ agent: id, env, prompt: "Reply with exactly: OK" });
    res = { ok: r.ok && /\bOK\b/.test(r.text), detail: r.ok ? r.text.slice(0, 120) : r.error };
  }
  const all = readVerified(env);
  all[id] = { ...(all[id] ?? {}), [cap]: { ok: res.ok, at: new Date().toISOString(), detail: redact(String(res.detail ?? "")).slice(0, 300) } };
  writeVerified(env, all);
  dropCache();
  return res;
}

// The last line of `generate`: what a caller of the job reads back (lib/tools/agents.mjs).
export const RESULT_PREFIX = "RESULT ";

// `node lib/agents/index.mjs probe <id> <cap>`: what POST /api/agents/probe runs as a job.
// `node lib/agents/index.mjs generate <json>`: what POST /api/agents/image runs as a job; json is
// the generateImage() argument; the last line is RESULT <json of its answer>.
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const [cmd, ...rest] = process.argv.slice(2);
  const fail = (e) => { console.error(`FAIL ${redact(e.message)}`); process.exit(2); };
  if (cmd === "probe") {
    const [id, cap] = rest;
    probe(id, cap, { log: (l) => console.log(redact(l)) }).then((r) => {
      console.log(r.ok ? `OK ${redact(r.detail ?? "")}` : `FAIL ${redact(r.detail ?? "")}`);
      if (r.receipt) console.log(`biên nhận: ${r.receipt}`);
      process.exit(r.ok ? 0 : 1);
    }, fail);
  } else if (cmd === "generate") {
    let arg;
    try { arg = JSON.parse(rest[0] ?? ""); } catch { fail(new Error("generate cần một đối số JSON")); }
    if (arg) {
      console.log(`sinh ảnh → ${arg.out}`);
      generateImage(arg).then((r) => {
        const out = { ok: r.ok, file: r.file ?? null, agent: r.agent ?? null, receipt: r.receipt?.file ?? null, error: r.error ?? null, refused: r.refused ?? false, tried: r.tried ?? [] };
        console.log(r.ok ? `OK ${r.agent}: ${r.file}` : `FAIL ${redact(r.error ?? "")}`);
        console.log(RESULT_PREFIX + JSON.stringify(redactDeep(out)));
        process.exit(r.ok ? 0 : 1);
      }, fail);
    }
  }
}
