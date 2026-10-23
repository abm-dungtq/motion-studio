// lib/agents/run.mjs — how the agent registry starts a CLI: never through a shell, in its own
// process group (detached), killed with SIGTERM then SIGKILL when it runs past its timeout, with
// output capped. Binaries are looked up on PATH plus the folders a user install puts them in
// (~/.local/bin, ~/.opencode/bin, /opt/homebrew/bin, /usr/local/bin): Studio started from launchd
// may have a short PATH (like agent.mjs).
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { agentPath } from "../config.mjs";

const OUT_MAX = 8 << 20;
const KILL_GRACE_MS = 2000;

// $MOTION_STUDIO_AGENT_PATH replaces the whole list (tests, or a user who wants exact control).
export function searchPath(env = process.env) {
  const fixed = agentPath(env);
  if (fixed) return fixed.split(delimiter).filter(Boolean);
  const extra = [join(homedir(), ".local", "bin"), join(homedir(), ".opencode", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  return [...new Set([...String(env.PATH ?? "").split(delimiter).filter(Boolean), ...extra])];
}

// The first executable named bin on the search path: { path, real, broken }, or null when the
// name is nowhere. A dangling symlink or a non-executable file is skipped for a working one later
// on the path, and returned (broken: true) only when there is none. A script shim whose target is
// missing looks fine here; its first run reports it.
export function which(bin, env = process.env) {
  let broken = null;
  for (const d of searchPath(env)) {
    const f = join(d, bin);
    if (!existsSync(f)) {
      if (lstatSync(f, { throwIfNoEntry: false })?.isSymbolicLink()) broken ??= { path: f, real: null, broken: true };
      continue;
    }
    let real;
    try { real = realpathSync(f); if (statSync(real).isDirectory()) continue; accessSync(real, constants.X_OK); } catch { broken ??= { path: f, real: real ?? null, broken: true }; continue; }
    return { path: f, real, broken: false };
  }
  return broken;
}

// Runs cmd with args. Resolves (never rejects) { code, signal, stdout, stderr, timedOut, error }:
// error is a short reason when the process could not start ("ENOENT") or ran past the timeout
// ("timeout"). The child's PATH is the search path, so a script's own #! interpreter is found.
export function exec(cmd, args = [], { stdin = null, cwd, timeout = 30000, env = process.env } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", timedOut = false, done = false;
    const childEnv = { ...env, PATH: searchPath(env).join(delimiter) };
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: childEnv, detached: true, stdio: [stdin == null ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch (e) { return resolve({ code: null, signal: null, stdout: "", stderr: "", timedOut: false, error: e.code ?? e.message }); }
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
    const timer = timeout > 0 ? setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS).unref();
    }, timeout) : null;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    child.stdout.on("data", (c) => { if (out.length < OUT_MAX) out += c; });
    child.stderr.on("data", (c) => { if (err.length < OUT_MAX) err += c; });
    child.on("error", (e) => finish({ code: null, signal: null, stdout: out, stderr: err, timedOut, error: e.code ?? e.message }));
    child.on("close", (code, signal) => finish({ code, signal, stdout: out, stderr: err, timedOut, error: timedOut ? "timeout" : null }));
    if (stdin != null) {
      child.stdin.on("error", () => { /* the CLI closed stdin early; its exit says what happened */ });
      child.stdin.end(stdin);
    }
  });
}

const SEMVER = /\d+\.\d+(?:\.\d+)?/;
// The first non-empty line of an output.
export const firstLine = (s) => String(s ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? null;

// Finds the first of bins and asks it for its version: { found, path, version, error }. A broken
// install (dangling link, a shim whose file is gone, non-zero exit) is found: true with error.
// run: false only checks the name is there (a CLI whose --version would do real work).
export async function detectBin(bins, { env = process.env, args = ["--version"], parse = firstLine, timeout = 8000, run = true } = {}) {
  let w = null;
  for (const b of bins) { w = which(b, env); if (w && !w.broken) break; }
  if (!w) return { found: false, path: null, version: null, error: null };
  if (w.broken) return { found: true, path: w.path, version: null, error: "không chạy được: liên kết trỏ tới file không có hoặc không có quyền chạy" };
  if (!run) return { found: true, path: w.path, version: null, error: null };
  const r = await exec(w.path, args, { env, timeout });
  if (r.error === "timeout") return { found: true, path: w.path, version: null, error: "timeout" };
  if (r.error) return { found: true, path: w.path, version: null, error: `không chạy được (${r.error})` };
  if (r.code !== 0) {
    const why = String(r.stderr || r.stdout).split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
    return { found: true, path: w.path, version: null, error: `exit ${r.code}${why ? `: ${why.slice(0, 200)}` : ""}` };
  }
  const v = parse(r.stdout || r.stderr);
  return { found: true, path: w.path, version: v && SEMVER.test(v) ? v.slice(0, 80) : null, error: null };
}

// The first JSON object or array in text (a fenced ```json block first), parsed; null if none.
export function firstJson(text) {
  const s = String(text ?? "");
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(s);
  for (const cand of [fence?.[1], s]) {
    if (!cand) continue;
    try { return JSON.parse(cand.trim()); } catch { /* look for a balanced block */ }
    for (let i = 0; i < cand.length; i++) {
      const open = cand[i];
      if (open !== "{" && open !== "[") continue;
      const close = open === "{" ? "}" : "]";
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < cand.length; j++) {
        const c = cand[j];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close && --depth === 0) {
          try { return JSON.parse(cand.slice(i, j + 1)); } catch { break; }
        }
      }
    }
  }
  return null;
}
