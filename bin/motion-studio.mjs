#!/usr/bin/env node
// motion-studio.mjs — run Motion Studio, the local web app over a provider's command gateway
// (server.mjs; the provider is found by lib/provider.mjs and loaded on first use: the server
// starts without one and the page says what is missing).
//   node bin/motion-studio.mjs start [--background] [--root <dir>]   serve http://127.0.0.1:4317
//   node bin/motion-studio.mjs status                                 running <url> … | stopped
//   node bin/motion-studio.mjs stop                                   SIGTERM, then the pidfile is removed
//   node bin/motion-studio.mjs setup [--yes] [--ref <ref>] [--host claude|codex|all]
//                                    install or update the provider (lib/setup.mjs; npm run setup)
//   node bin/motion-studio.mjs --help | -h
// Root: --root, else $MOTION_STUDIO_ROOT, else the root of the last run (kept in the state file),
// else /Volumes/2/Edit-Video (fallback until 2.0). Projects are its direct
// children holding project.json (or index.html + BRIEF.md, offered as "Nhập dự án").
// One server on this machine: pid, root, port and the token of the run are kept in
// ~/.config/motion-studio/studio.json (chmod 600; $MOTION_STUDIO_STATE overrides the path; the
// state file of the default provider's old Studio is copied there once, never removed). start
// with a live server for the same root prints its URL; for another root it refuses (exit 3) and
// names the running root. Port 4317 held by another process: "cổng 4317 đang bị <pid> giữ",
// exit 3; the port never changes. Binds 127.0.0.1 only. Background log: studio.log beside the
// state file.
// Settings in the same file survive stop and start: {"director": {"runner": "cli" | "mcp"}}
// (default cli: Studio runs `claude -p` itself; mcp: an open Claude Code session takes the queue)
// and "root". Old variable names (OPUS_STUDIO_ROOT, OPUS_STUDIO_STATE) still work, with a warning.
// stop waits up to 10 s: running jobs (director, export) get SIGTERM, then SIGKILL after 5 s.
// setup and start install and build ui/ when needed (lib/ui-build.mjs): setup always checks it,
// start rebuilds when the sources are newer than ui/dist (and installs only when node_modules is
// missing). Needs Node.js 22.18 or newer, which runs the .ts files of ui/src/core directly.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { logFile, migrateState, readState as readStateFile, rootDefault, settingsOf, stateFile } from "../lib/config.mjs";
import { legacyStateFiles, providerStatus } from "../lib/provider.mjs";
import { ensureUi, uiState } from "../lib/ui-build.mjs";

export const PORT = 4317;
export const HOST = "127.0.0.1";
// Resolved in main(), after the legacy state file is copied.
let STATE, LOG;
const url = () => `http://${HOST}:${PORT}/`;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
export const readState = () => readStateFile(STATE);
// Settings kept across runs (director.runner, root); the rest of the file describes the running server.
function clearState() {
  const keep = settingsOf(readState());
  if (keep) writeState(keep); else rmSync(STATE, { force: true });
}
function writeState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  const tmp = `${STATE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, STATE);
}
// lsof missing (Windows): undefined; nobody listening: null.
const portOwner = () => { try { return execFileSync("lsof", ["-ti", `tcp:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0] || null; } catch (e) { return e.code === "ENOENT" ? undefined : null; } };
const answers = async (s) => { try { const r = await fetch(new URL("/api/projects", s.url), { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };
// The state file survives a crash or kill -9, and after a reboot its pid may belong to another
// process: it is live only while that pid holds the port (or, without lsof, the URL answers).
async function live() {
  const s = readState();
  if (!s || !alive(s.pid)) return null;
  const owner = portOwner();
  return (owner === undefined ? await answers(s) : owner === String(s.pid)) ? s : null;
}
const rootOf = (o) => resolve(o.root || rootDefault());

async function serve(root) {
  const { createServer } = await import("../server.mjs");
  const token = randomBytes(32).toString("hex");
  const server = createServer({ root, token });
  await new Promise((res) => {
    server.once("error", (e) => {
      if (e.code === "EADDRINUSE") { console.error(`studio: cổng ${PORT} đang bị ${portOwner() ?? "tiến trình khác"} giữ`); process.exit(3); }
      console.error(`studio: ${e.message}`); process.exit(1);
    });
    server.listen(PORT, HOST, res);
  });
  writeState({ ...settingsOf(readState()), pid: process.pid, port: PORT, root, url: url(), token, started: new Date().toISOString() });
  const bye = async () => {
    const { stopAll } = await import("../jobs.mjs");
    await stopAll();
    if (readState()?.pid === process.pid) clearState();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.log(`Motion Studio: ${url()} (root ${root})`);
}

async function start(o) {
  let root = rootOf(o);
  if (!existsSync(root)) { console.error(`studio: không có thư mục gốc ${root}; chọn --root <dir> hoặc đặt MOTION_STUDIO_ROOT`); return 2; }
  root = realpathSync(root);
  const s = await live();
  if (s) {
    if (s.root === root) { console.log(`đang chạy: ${s.url} (pid ${s.pid})`); return 0; }
    console.error(`studio: đang chạy cho ${s.root} (pid ${s.pid}); dừng nó trước (node bin/motion-studio.mjs stop)`);
    return 3;
  }
  if (!o.child) {
    const ui = await ensureUi({ install: !uiState().hasDeps });
    if (!ui.ok) { console.error(ui.message); return 1; }
  }
  if (readState()) clearState();
  const owner = portOwner();
  if (owner) { console.error(`studio: cổng ${PORT} đang bị ${owner} giữ`); return 3; }
  if (!o.child) {
    const ps = await providerStatus();
    if (!ps.ok) console.error(`studio: chưa có provider (${ps.error}); chạy: ${ps.setup}`);
  }
  if (!o.background) { await serve(root); return null; }
  mkdirSync(dirname(STATE), { recursive: true });
  const fd = openSync(LOG, "a");
  const p = spawn(process.execPath, [fileURLToPath(import.meta.url), "start", "--root", root, "--child"], { detached: true, stdio: ["ignore", fd, fd], env: process.env });
  p.unref();
  closeSync(fd);
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const st = readState();
    if (st?.pid === p.pid) { console.log(`Motion Studio: ${st.url} (pid ${st.pid}, root ${root}; log ${LOG})`); return 0; }
    if (p.exitCode !== null) break;
  }
  console.error(`studio: không khởi động được, xem ${LOG}`);
  return 1;
}

async function status() {
  const s = await live();
  if (!s) { if (readState()) clearState(); console.log("stopped"); return 0; }
  console.log(`running ${s.url} (pid ${s.pid}, root ${s.root}, từ ${s.started})`);
  return 0;
}

async function stop() {
  const s = await live();
  if (!s) { clearState(); console.log("stopped"); return 0; }
  process.kill(s.pid, "SIGTERM");
  for (let i = 0; i < 100 && alive(s.pid); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive(s.pid)) { console.error(`studio: pid ${s.pid} chưa dừng sau 10 s`); return 1; }
  clearState();
  console.log("stopped");
  return 0;
}

// --help prints this file's leading comment block.
function help() {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split(/\r?\n/).slice(1);
  const end = lines.findIndex((l) => !l.startsWith("//"));
  process.stdout.write(lines.slice(0, end).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.some((a) => a === "--help" || a === "-h")) { help(); return 0; }
  if (!process.features?.typescript) { console.error("studio: cần Node.js 22.18 trở lên (chạy được file .ts); đang chạy " + process.version); return 2; }
  migrateState(await legacyStateFiles());
  STATE = stateFile();
  LOG = logFile();
  const [cmd, ...rest] = argv;
  if (cmd === "setup") {
    const { parseArgs, runSetup } = await import("../lib/setup.mjs");
    const so = parseArgs(rest);
    if (so.error) { console.error(`setup: ${so.error}`); return 2; }
    const ui = await ensureUi({ install: true });
    if (!ui.ok) { console.error(ui.message); return 1; }
    return runSetup(so);
  }
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--background") o.background = true;
    else if (rest[i] === "--root") o.root = rest[++i];
    else if (rest[i] === "--child") o.child = true; // the background server itself: the parent already warned
    else { console.error(`studio: unknown argument ${rest[i]}`); return 2; }
  }
  if (o.root !== undefined && (!o.root || !existsSync(o.root))) { console.error(`studio: không có thư mục ${o.root}`); return 2; }
  if (cmd === "start") return start(o);
  if (cmd === "status") return status();
  if (cmd === "stop") return stop();
  console.error("usage: node bin/motion-studio.mjs start [--background] [--root <dir>] | status | stop | setup [--yes] [--ref <ref>] [--host claude|codex|all]");
  return 2;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then((code) => { if (code !== null) process.exit(code); });
}
