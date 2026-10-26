// lib/videogen/glabs.mjs — the G-Labs Studio webhook client (WEBHOOK_INTEGRATION.en.md of
// duckmartians/G-Labs-Studio). Three rules: no function here retries; submit() is the only call
// that creates work (and so may cost credits); download() only fetches /api/files/ from the
// configured G-Labs, whatever host the result URL names. The key never reaches a log.
import { createWriteStream, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TASK_ID = /^[0-9a-f]{8}$/;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function checkUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw bad("G-Labs chỉ được ở máy này (127.0.0.1)"); }
  if (u.protocol !== "http:" || !LOOPBACK.has(u.hostname)) throw bad("G-Labs chỉ được ở máy này (127.0.0.1)");
  return u.origin;
}

// Drops e-mail addresses (G-Labs account names) from error text.
export const scrub = (s) => String(s ?? "").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[tài khoản]").slice(0, 500);

async function call(base, path, { method = "GET", key = null, body = null, timeoutMs }) {
  const headers = {};
  if (key) headers["X-API-Key"] = key;
  if (body) headers["content-type"] = "application/json";
  try {
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    let json = null;
    try { json = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, error: scrub(e?.message) };
  }
}

export async function health(base, { timeoutMs = 1500 } = {}) {
  const r = await call(base, "/api/health", { timeoutMs });
  if (r.status === 200 && r.json?.status === "ok") return { up: true, pending: r.json.tasks_pending ?? 0, running: r.json.tasks_running ?? 0 };
  if (r.status === 403) return { up: false, error: "G-Labs cần gói MAX để bật webhook" };
  return { up: false, error: r.status ? `G-Labs trả HTTP ${r.status}` : "Mở G-Labs Studio (tab Webhook, Start)" };
}

// accepted: G-Labs has the task; rejected: it surely did not start; unknown: it may have.
export async function submit(base, key, body, { timeoutMs = 60000 } = {}) {
  const r = await call(base, "/api/video/generate", { method: "POST", key, body, timeoutMs });
  if (r.status === 202 && typeof r.json?.task_id === "string") return { kind: "accepted", task_id: r.json.task_id };
  if ([400, 401, 403, 404, 413].includes(r.status)) return { kind: "rejected", status: r.status, error: scrub(r.json?.error) || `HTTP ${r.status}` };
  return { kind: "unknown", status: r.status, error: r.error ?? scrub(r.json?.error) ?? `HTTP ${r.status}` };
}

const checkId = (id) => { if (!TASK_ID.test(String(id))) throw bad("task_id không hợp lệ"); return id; };

export async function status(base, key, id, { timeoutMs = 30000 } = {}) {
  checkId(id);
  const r = await call(base, `/api/status/${encodeURIComponent(id)}`, { key, timeoutMs });
  if (r.status === 200) {
    const kind = ["pending", "running", "completed", "failed"].includes(r.json?.status) ? r.json.status : "running";
    return { ...r.json, kind };
  }
  if (r.status === 404) return { kind: "gone" };
  if (r.status === 401) return { kind: "unauthorized" };
  return { kind: "unreachable", error: r.error ?? `HTTP ${r.status}` };
}

export async function recentTasks(base, key) {
  const r = await call(base, "/api/tasks", { key, timeoutMs: 10000 });
  return r.status === 200 && Array.isArray(r.json?.tasks) ? r.json.tasks : null;
}

export async function stop(base, key, id) {
  checkId(id);
  const r = await call(base, `/api/stop/${encodeURIComponent(id)}`, { method: "POST", key, body: {}, timeoutMs: 3000 });
  return r.status === 200;
}

// Fetches one result file to out (via out.part). The URL may name the LAN address G-Labs binds;
// the file is always fetched from base.
export async function download(base, url, out, { timeoutMs = 180000 } = {}) {
  const b = new URL(base);
  let u;
  try { u = new URL(url, base); } catch { throw bad("URL kết quả không thuộc G-Labs"); }
  if (u.port !== b.port || !u.pathname.startsWith("/api/files/")) throw bad("URL kết quả không thuộc G-Labs");
  const r = await fetch(new URL(u.pathname, base), { signal: AbortSignal.timeout(timeoutMs) });
  if (r.status !== 200 || !r.body) throw bad(`tải file: HTTP ${r.status}`, 502);
  mkdirSync(dirname(out), { recursive: true });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(`${out}.part`));
  renameSync(`${out}.part`, out);
  return out;
}

// Whether a failed task may have cost credits: "none" only for failures before generation.
export function chargeOf({ error_code, error } = {}) {
  const e = String(error ?? "");
  if (error_code === 429) return "none";
  if (/^(INVALID_|MISSING_|NO_|TOO_MANY_)/.test(e) && !e.startsWith("NO_OUTPUT")) return "none";
  if (e.includes("No active accounts") || e.includes("Missing required field")) return "none";
  return "indeterminate";
}
