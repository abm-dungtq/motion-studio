// lib/broll/ffmpeg.mjs — how the B-roll index runs ffmpeg and ffprobe: no shell, a timeout
// (SIGTERM, then SIGKILL), stderr kept for parsing. Children are not detached, so cancelling the
// index job (its process group) stops them too. onExec(fn) lets tests count every run:
// fn({ bin, args }) is called before each spawn.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const OUT_MAX = 32 << 20;
const brew = (b) => (existsSync(`/opt/homebrew/bin/${b}`) ? `/opt/homebrew/bin/${b}` : b);
export const FFMPEG = brew("ffmpeg");
export const FFPROBE = brew("ffprobe");

const hooks = new Set();
export function onExec(fn) { hooks.add(fn); return () => hooks.delete(fn); }

// Resolves { code, stdout, stderr, error } (never rejects). error: "timeout", "aborted" or a spawn code.
export function run(bin, args, { timeout = 600000, signal = null, cwd } = {}) {
  for (const fn of hooks) fn({ bin, args });
  return new Promise((resolve) => {
    let out = "", err = "", why = null, done = false;
    let child;
    try { child = spawn(bin, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return resolve({ code: null, stdout: "", stderr: "", error: e.code ?? e.message }); }
    const stop = (reason) => {
      why ??= reason;
      try { child.kill("SIGTERM"); } catch { /* gone */ }
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 2000).unref();
    };
    const timer = timeout > 0 ? setTimeout(() => stop("timeout"), timeout) : null;
    const onAbort = () => stop("aborted");
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve(r); };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => { if (out.length < OUT_MAX) out += c; });
    child.stderr.on("data", (c) => { if (err.length < OUT_MAX) err += c; });
    child.on("error", (e) => finish({ code: null, stdout: out, stderr: err, error: e.code ?? e.message }));
    child.on("close", (code) => finish({ code, stdout: out, stderr: err, error: why }));
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args], opts);
// The last lines of a failed run, for a log line or an error.
export const tail = (r) => (r.error ? r.error : `exit ${r.code}: ${String(r.stderr).trim().split("\n").slice(-2).join(" ").slice(0, 300)}`);

const ratio = (s) => { const [a, b] = String(s ?? "").split("/").map(Number); return a > 0 && b > 0 ? a / b : null; };
// { duration, width, height, fps, codec, audio } or null when ffprobe cannot read the file.
export async function probe(file, opts = {}) {
  const r = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeout: 20000, ...opts });
  if (r.code !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams ?? [];
    const v = s.find((x) => x.codec_type === "video" && !x.disposition?.attached_pic) ?? null;
    const a = s.find((x) => x.codec_type === "audio") ?? null;
    const d = Number(j.format?.duration);
    const fps = ratio(v?.avg_frame_rate) ?? ratio(v?.r_frame_rate);
    return { duration: Number.isFinite(d) ? d : null, width: v?.width ?? null, height: v?.height ?? null, fps: fps ? Math.round(fps * 1000) / 1000 : null, codec: (v ?? a)?.codec_name ?? null, audio: Boolean(a) };
  } catch { return null; }
}
