// lib/setup.mjs — `node bin/motion-studio.mjs setup [--yes] [--ref <ref>] [--host claude|codex|all]`
// (npm run setup). Finds the provider (lib/provider.mjs), asks its adapter whether it is missing,
// outdated or current against the latest release (adapter.setup.check), and installs or updates it
// (adapter.setup.install) after a [Y/n] question; --yes answers it, and without a terminal and
// without --yes nothing is installed and the command to run is printed (exit 3). After an install
// the provider is loaded again in a fresh process to check its compatibility.
// Exit 0 current or installed and compatible · 1 install failed or provider incompatible ·
// 2 bad usage · 3 needs an install that was not confirmed (no terminal).
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { adapterFor, providerStatus, SETUP_COMMAND as COMMAND } from "./provider.mjs";

const PROVIDER = fileURLToPath(new URL("./provider.mjs", import.meta.url));
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const FETCH_TIMEOUT_MS = 15000;

// The real side effects; tests pass their own.
export const defaultIo = {
  exec: (cmd, args) => new Promise((res) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 30000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout ?? "", stderr: (stderr ?? "") || (err && typeof err.code !== "number" ? err.message : "") }));
  }),
  run: (cmd, args) => new Promise((res) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", () => res(127));
    p.on("close", (code) => res(code ?? 1));
  }),
  async fetchText(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.text();
  },
};

// providerStatus() in a new node process, so an updated provider is imported fresh.
export const recheckInChild = (env = process.env) => new Promise((res) => {
  const code = `import { providerStatus } from ${JSON.stringify(PROVIDER)}; console.log(JSON.stringify(await providerStatus()));`;
  execFile(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env, timeout: 30000 }, (err, stdout) => {
    try { res(JSON.parse(stdout)); } catch { res({ ok: false, provider: null, error: err?.message ?? "không đọc được kết quả kiểm tra" }); }
  });
});

async function askYes(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return !/^\s*n/i.test(await rl.question(question)); } finally { rl.close(); }
}

const short = (sha) => (sha ? String(sha).slice(0, 7) : null);
const describe = (v) => (v ? [v.version, short(v.commit)].filter(Boolean).join(" @ ") || "không rõ bản" : "?");

export function parseArgs(argv) {
  const o = { yes: false, ref: "main", host: "all" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") o.yes = true;
    else if (a === "--ref" || a === "--host") {
      const v = argv[++i];
      if (v === undefined) return { error: `${a} cần giá trị` };
      o[a.slice(2)] = v;
    } else return { error: `tham số lạ: ${a}` };
  }
  if (!REF.test(o.ref)) return { error: `--ref không hợp lệ: ${o.ref}` };
  return o;
}

export async function runSetup(o, { env = process.env, io = defaultIo, ask = askYes, isTTY = Boolean(process.stdin.isTTY), recheck = recheckInChild, log = console.log, err = console.error } = {}) {
  let a;
  try { a = await adapterFor(env); } catch (e) { err(`setup: ${e.message}`); return 1; }
  const name = a.ID;
  if (!a.setup) {
    log(`${name}: provider này không có bước cài tự động`);
    const st = await providerStatus(env);
    return st.ok ? 0 : 1;
  }
  if (!a.setup.hosts.includes(o.host)) { err(`setup: --host là ${a.setup.hosts.join(" | ")}`); return 2; }

  const st = await a.setup.check({ env, ref: o.ref }, io);
  const latest = st.latest ? `bản mới nhất ${describe(st.latest)} (${o.ref})` : `không kiểm được bản mới nhất: ${st.error}`;
  if (st.state === "missing") log(`${name}: chưa cài ở ${st.home}; ${latest}`);
  else if (st.state === "outdated") log(`${name}: cũ, ${describe(st.installed)} → ${describe(st.latest)} (${st.home})`);
  else if (st.state === "current") log(`${name}: đã mới nhất, ${describe(st.installed)} (${st.home})`);
  else log(`${name}: đã cài ${describe(st.installed)} ở ${st.home}; ${latest}`);

  if (st.state === "current" || st.state === "unknown") {
    const ps = await providerStatus(env);
    if (ps.ok) { log(`${name}: tương thích (STUDIO_API ${ps.provider.api})`); return 0; }
    err(`${name}: ${ps.error}`);
    return 1;
  }

  const again = `${COMMAND} -- --yes${o.ref !== "main" ? ` --ref ${o.ref}` : ""}${o.host !== "all" ? ` --host ${o.host}` : ""}`;
  if (!o.yes) {
    if (!isTTY) { log(`Không có terminal để hỏi; chưa cài gì. Để cài, chạy: ${again}`); return 3; }
    if (!(await ask(`Cài/cập nhật ${name} bản mới nhất? [Y/n] `))) { log(`Bỏ qua. Lúc khác chạy: ${COMMAND}`); return 0; }
  }
  const r = await a.setup.install(st, { host: o.host, ref: o.ref, env }, io);
  if (!r.ok) { err(`${name}: ${r.error}`); return 1; }
  const ps = await recheck(env);
  if (!ps.ok) { err(`${name}: đã chạy ${r.how} nhưng Studio vẫn chưa dùng được: ${ps.error}`); return 1; }
  log(`${name}: đã cài ${ps.provider.version} bằng ${r.how}, tương thích (STUDIO_API ${ps.provider.api})`);
  return 0;
}
