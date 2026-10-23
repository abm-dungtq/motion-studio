// lib/jev.mjs — a small client for TypeSafe Jev (POST https://api.typesafe.ai/v1/systemone,
// header Authorization: Bearer <key>, body { model, state, questions }; the reply carries
// answers keyed by question id and usage). Only Node's fetch, no dependency. ask() never throws
// and never returns or logs the key. Unlike the provider's older client: an 8 s timeout instead of
// 30 s, and no retry after a timeout, so the UI stays fast; 429, 529 and other 5xx are retried with
// backoff, other 4xx (400, 401, 413, 415, 422) are not.
import { existsSync, readFileSync } from "node:fs";

export const API_URL = "https://api.typesafe.ai/v1/systemone";
export const MODEL = "jev-latest";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The key from env[keyVar], else from a `KEY=value` line of envFile (quotes stripped); "" when absent.
export function readKey({ env = process.env, keyVar, envFile } = {}) {
  if (!keyVar) return "";
  if (env?.[keyVar]) return String(env[keyVar]);
  try {
    if (!envFile || !existsSync(envFile)) return "";
    const re = new RegExp(`^\\s*${esc(keyVar)}\\s*=\\s*(.*?)\\s*$`);
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(re);
      if (m) return m[1].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch { /* unreadable file: same as no key */ }
  return "";
}

const RETRY = (s) => s === 429 || s === 529 || s >= 500;

// { ok: true, data, ms } | { ok: false, error: "no-key" | "timeout" | "network" | "http" | "malformed", status?, ms }
export async function ask(body, { key, fetchImpl = globalThis.fetch, timeoutMs = 8000, retries = 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const t0 = Date.now();
  const done = (r) => ({ ...r, ms: Date.now() - t0 });
  if (!key) return done({ ok: false, error: "no-key" });
  const payload = JSON.stringify({ model: MODEL, ...body });
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") return done({ ok: false, error: "timeout" });
      if (attempt < retries) { await sleep(300 * 2 ** attempt); continue; }
      return done({ ok: false, error: "network" });
    }
    if (!res.ok) {
      if (RETRY(res.status) && attempt < retries) { await sleep(300 * 2 ** attempt); continue; }
      return done({ ok: false, error: "http", status: res.status });
    }
    try {
      const data = JSON.parse(await res.text());
      if (!data || typeof data.answers !== "object" || data.answers === null) return done({ ok: false, error: "malformed" });
      return done({ ok: true, data });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") return done({ ok: false, error: "timeout" });
      return done({ ok: false, error: "malformed" });
    }
  }
}
