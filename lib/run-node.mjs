// Runs a command as the leader of its own process group, so a timeout or a closing server stops
// the whole tree (a provider check and the ffmpeg it spawned), not only the direct child; a
// killed node parent would otherwise leave its ffmpeg running under pid 1.
import { spawn } from "node:child_process";

const live = new Set(); // children still running

// SIGTERM to the group, SIGKILL after graceMs if it is still there. ESRCH (already gone) is fine.
function killGroup(child, graceMs = 3000) {
  const sig = (s) => { try { process.kill(-child.pid, s); } catch { /* group already gone */ } };
  sig("SIGTERM");
  setTimeout(() => sig("SIGKILL"), graceMs).unref();
}

// Stops every run still going (the server calls this when it closes).
export function killAllRuns() {
  for (const child of live) killGroup(child);
}

// → Promise<{ code, stdout, stderr, killed, error? }>. code is the exit status (null when killed
// by a signal or never started); killed means the timeout or maxBuffer stopped it; error is
// "ENOENT" when the command does not exist. Never rejects.
export function runCmd(cmd, args, { timeout = 30000, cwd, env, input, maxBuffer = 32 << 20, encoding = "utf8" } = {}) {
  return new Promise((res) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, detached: true, stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch (e) {
      return res({ code: null, stdout: "", stderr: "", killed: false, error: e.code ?? e.message });
    }
    const out = [], err = [];
    let size = 0, killed = false, done = false;
    const stop = () => { if (!killed) { killed = true; killGroup(child); } };
    const take = (list) => (b) => { size += b.length; if (size > maxBuffer) stop(); else list.push(b); };
    child.stdout.on("data", take(out));
    child.stderr.on("data", take(err));
    const timer = setTimeout(stop, timeout);
    live.add(child);
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      live.delete(child);
      const text = (list) => (encoding === "buffer" ? Buffer.concat(list) : Buffer.concat(list).toString(encoding));
      res({ stdout: text(out), stderr: text(err), killed, ...r });
    };
    child.on("error", (e) => finish({ code: null, error: e.code ?? e.message }));
    child.on("close", (code) => finish({ code }));
    if (input != null) child.stdin.end(input);
  });
}

// A provider command (an absolute .mjs path) run with this node. A run that never exited on its
// own (killed, failed to start) reads as code 1, so `if (r.code)` callers see a failure.
export async function runNode(file, args, { timeout = 60000, maxBuffer = 32 << 20 } = {}) {
  const r = await runCmd(process.execPath, [file, ...args], { timeout, maxBuffer });
  return { ...r, code: r.code ?? 1 };
}
