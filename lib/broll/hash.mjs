// lib/broll/hash.mjs — the content hash that keys the B-roll cache. sha256 is read as a 4 MB
// stream; the result is remembered per (realpath, size, mtimeMs) in <cache>/hashes.json, so a
// file is read again only when it changed. A copied or moved file hashes to the same sha256 and
// so finds its analysis already done. The cache folder is $MOTION_STUDIO_BROLL_CACHE, else
// ~/.cache/motion-studio/broll (safe to delete at any time).
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CHUNK = 4 << 20;
export const SHA_RE = /^[0-9a-f]{64}$/;
export const cacheRoot = (env = process.env) => env.MOTION_STUDIO_BROLL_CACHE || join(env.HOME || homedir(), ".cache", "motion-studio", "broll");
export const clipDir = (sha, env = process.env) => {
  if (!SHA_RE.test(String(sha))) throw Object.assign(new Error("sha256 không hợp lệ"), { status: 400 });
  return join(cacheRoot(env), sha);
};

// JSON helpers shared by the index: a missing or broken file reads as fallback; writes are atomic.
export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}
export function writeJson(file, value) {
  mkdirSync(join(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}

export function sha256Stream(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file, { highWaterMark: CHUNK }).on("data", (c) => h.update(c)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

const memoFile = (env) => join(cacheRoot(env), "hashes.json");
const keyOf = (real, st) => `${real}\0${st.size}\0${st.mtimeMs}`;

// The remembered sha256 of path when it has not changed since it was hashed, else null (no read).
export function peekHash(path, { env = process.env } = {}) {
  try {
    const real = realpathSync(path);
    const v = readJson(memoFile(env), {})[keyOf(real, statSync(real))];
    return SHA_RE.test(v ?? "") ? v : null;
  } catch { return null; }
}

// { sha256, size, mtimeMs, real, cached } for a regular file. Entries whose file is gone are
// dropped when the memo is written.
export async function hashFile(path, { env = process.env } = {}) {
  const real = realpathSync(path);
  const st = statSync(real);
  if (!st.isFile()) throw Object.assign(new Error(`không phải file thường: ${path}`), { status: 400 });
  const memo = readJson(memoFile(env), {});
  const key = keyOf(real, st);
  if (SHA_RE.test(memo[key] ?? "")) return { sha256: memo[key], size: st.size, mtimeMs: st.mtimeMs, real, cached: true };
  const sha256 = await sha256Stream(real);
  // Read again before writing: another run may have added entries meanwhile.
  const now = readJson(memoFile(env), {});
  const next = {};
  for (const [k, v] of Object.entries(now)) { const p = k.split("\0")[0]; if (p !== real && existsSync(p)) next[k] = v; }
  next[key] = sha256;
  writeJson(memoFile(env), next);
  return { sha256, size: st.size, mtimeMs: st.mtimeMs, real, cached: false };
}
