// lib/ui-build.mjs — keeps ui/dist (the Vite build of ui/, which server.mjs serves at /) in step
// with its sources. uiState() says whether ui/node_modules needs `npm ci` (missing, or older than
// ui/package-lock.json) and whether the build is stale (missing, or older than the newest source:
// ui/src minus tests, index.html, package.json, the lockfile and the Vite/TS/shadcn configs).
// ensureUi() installs and builds when needed: `setup` runs it with install, `start` before it
// serves (bin/motion-studio.mjs). A failed install or build keeps an older build with a warning;
// with no build at all it fails and says to run npm run setup. Vite runs through
// node ui/node_modules/vite/bin/vite.js, never npx, so nothing is fetched at start.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const UI_DIR = fileURLToPath(new URL("../ui", import.meta.url));
export const DIST_INDEX = join(UI_DIR, "dist", "index.html");
const TOP_SOURCES = ["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "components.json"];
const TAIL_LINES = 15;

const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return null; } };
const vitePath = (dir) => join(dir, "node_modules", "vite", "bin", "vite.js");

function newestIn(d) {
  let newest = 0;
  let entries;
  try { entries = readdirSync(d, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const f = join(d, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestIn(f));
    else if (!/\.test\./.test(e.name)) newest = Math.max(newest, mtime(f) ?? 0);
  }
  return newest;
}

// { hasDeps, needInstall, built, stale, newestSource, builtAt } of the ui/ folder at dir.
export function uiState(dir = UI_DIR) {
  const hasDeps = existsSync(vitePath(dir));
  const lock = mtime(join(dir, "package-lock.json"));
  const installed = mtime(join(dir, "node_modules", ".package-lock.json"));
  const needInstall = !hasDeps || (lock !== null && (installed === null || lock > installed));
  const builtAt = mtime(join(dir, "dist", "index.html"));
  const built = builtAt !== null;
  const newestSource = Math.max(newestIn(join(dir, "src")), ...TOP_SOURCES.map((f) => mtime(join(dir, f)) ?? 0));
  const stale = !built || newestSource > builtAt;
  return { hasDeps, needInstall, built, stale, newestSource, builtAt };
}

// Runs cmd in cwd and resolves { code, output } (stdout and stderr together); never rejects.
export function runCommand(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    let output = "";
    let p;
    try { p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env }); } catch (e) { return resolve({ code: 1, output: e.message }); }
    p.stdout.on("data", (c) => (output += c));
    p.stderr.on("data", (c) => (output += c));
    p.on("error", (e) => resolve({ code: 1, output: `${output}${e.message}` }));
    p.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

const tail = (r) => String(r?.output ?? "").trim().split("\n").slice(-TAIL_LINES).join("\n");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function installUi({ dir = UI_DIR, run = runCommand } = {}) {
  return run(npm, ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: dir });
}

export function buildUi({ dir = UI_DIR, run = runCommand } = {}) {
  return run(process.execPath, [vitePath(dir), "build"], { cwd: dir });
}

// Installs (when install is true and node_modules is missing or old) and builds (when stale or
// just installed). { ok, action, message }, action one of fresh, built, installed+built,
// stale-kept, failed. log gets progress lines, err the warnings and the failure.
export async function ensureUi({ dir = UI_DIR, install = false, run = runCommand, log = console.log, err = console.error } = {}) {
  const s = uiState(dir);
  if (!s.stale && !s.needInstall) {
    log("giao diện: đã mới");
    return { ok: true, action: "fresh", message: "giao diện: đã mới" };
  }
  const keep = (warning, detail) => {
    if (detail) err(detail);
    err(warning);
    return { ok: true, action: "stale-kept", message: warning };
  };
  const fail = (detail) => {
    const message = "giao diện: chưa có bản build; chạy npm run setup";
    if (detail) err(detail);
    err(message);
    return { ok: false, action: "failed", message };
  };
  let installed = false;
  if (s.needInstall) {
    if (!install) return s.built ? keep("giao diện: thư viện chưa cài hoặc cũ hơn package-lock.json, dùng bản build cũ; chạy npm run setup") : fail();
    log("giao diện: cài thư viện…");
    const r = await installUi({ dir, run });
    if (r?.code !== 0) return s.built ? keep("giao diện: cài thư viện lỗi, dùng bản build cũ", tail(r)) : fail(tail(r));
    installed = true;
  }
  log(s.built ? "giao diện: build lại (nguồn mới hơn bản build)…" : "giao diện: build lần đầu…");
  const t0 = Date.now();
  const r = await buildUi({ dir, run });
  if (r?.code !== 0) return s.built ? keep("giao diện: build lỗi, dùng bản build cũ", tail(r)) : fail(tail(r));
  log(`giao diện: build xong trong ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const action = installed ? "installed+built" : "built";
  return { ok: true, action, message: `giao diện: ${action}` };
}
