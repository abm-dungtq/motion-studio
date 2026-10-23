// lib/lemo/fetch.mjs — downloads the lemo-opuscar style library (github.com/lemomo-ai/lemo-opuscar;
// code and docs MIT, frames and films CC BY 4.0 by LemoLab) at the commit pinned in pin.json, as
// data only: style.json, STYLE.md and DEMO.md of every style, the 800×450 frames, LICENSE and
// MY-STYLES.md. The download is untrusted: nothing in it is ever run or imported.
//   fetchLibrary({ home, pin, git, log }) → { dir, sha, fetched: true | false, files }
// home/<sha>/ holds the checkout plus .pin.json, written last. A folder with a .pin.json of the
// same sha is reused without running git. Otherwise git (no shell, prompts and hooks off) does
// init → fetch --depth 1 --filter=blob:none origin <sha> → sparse-checkout → checkout in a temp
// folder beside it; then .git and anything outside the allow list (or a symlink) is deleted, and
// the folder is renamed into place. Any failure removes the temp folder and throws.
// CLI (the Studio job "lemo"): node lib/lemo/fetch.mjs; the last line is RESULT <json>.
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { env } from "../config.mjs";

export const PIN = JSON.parse(readFileSync(new URL("./pin.json", import.meta.url), "utf8"));
// Sparse-checkout patterns (non-cone mode, gitignore syntax) and the same list as path tests.
export const SPARSE = ["/LICENSE", "/MY-STYLES.md", "/styles/*/style.json", "/styles/*/STYLE.md", "/styles/*/DEMO.md", "/docs/frames/*.jpg"];
const KEEP = [/^LICENSE$/, /^MY-STYLES\.md$/, /^styles\/[a-z0-9_-]+\/(style\.json|STYLE\.md|DEMO\.md)$/, /^docs\/frames\/[a-z0-9_-]+\.jpg$/];
export const allowed = (rel) => KEEP.some((re) => re.test(rel.split(sep).join("/")));
const SHA = /^[0-9a-f]{40}$/;
const MARK = ".pin.json";
const GIT_TIMEOUT_MS = 5 * 60000;

// $MOTION_STUDIO_LEMO_CACHE, else ~/.cache/motion-studio/lemo-opuscar.
export const cacheHome = (source = process.env) => env("LEMO_CACHE", source) || join(homedir(), ".cache", "motion-studio", "lemo-opuscar");
export const libraryDir = (home = cacheHome(), pin = PIN) => join(home, pin.sha);

// The checkout of pin.sha when it is complete, else null.
export function readyDir(home = cacheHome(), pin = PIN) {
  const dir = libraryDir(home, pin);
  try { return JSON.parse(readFileSync(join(dir, MARK), "utf8")).sha === pin.sha ? dir : null; } catch { return null; }
}

const runGit = (git, args, cwd) => new Promise((res) => {
  execFile(git, args, {
    cwd, shell: false, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: 8 << 20,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GIT_CONFIG_NOSYSTEM: "1", LC_ALL: "C" },
  }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout ?? "", stderr: (stderr ?? "") || (err && typeof err.code !== "number" ? err.message : "") }));
});

// Deletes every entry the allow list does not name (symlinks always); returns the kept files.
function prune(dir) {
  const kept = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e), rel = relative(dir, f), st = lstatSync(f);
      if (st.isSymbolicLink()) { rmSync(f, { force: true }); continue; }
      if (st.isDirectory()) {
        walk(f);
        if (!readdirSync(f).length) rmSync(f, { recursive: true, force: true });
        continue;
      }
      if (st.isFile() && allowed(rel)) kept.push(rel.split(sep).join("/"));
      else rmSync(f, { force: true });
    }
  };
  walk(dir);
  return kept.sort();
}

export async function fetchLibrary({ home = cacheHome(), pin = PIN, git = "git", log = () => {} } = {}) {
  if (!SHA.test(String(pin?.sha ?? ""))) throw new Error("pin.json: sha phải là 40 ký tự hex");
  if (!/^(https:\/\/|file:\/\/)/.test(String(pin?.repo ?? ""))) throw new Error("pin.json: repo phải là URL https:// (hoặc file:// khi thử)");
  home = resolve(home);
  const ready = readyDir(home, pin);
  if (ready) return { dir: ready, sha: pin.sha, fetched: false, files: null };
  mkdirSync(home, { recursive: true });
  const dir = libraryDir(home, pin);
  const tmp = join(home, `.tmp-${pin.sha.slice(0, 12)}-${randomBytes(3).toString("hex")}`);
  const step = async (what, args) => {
    log(`git ${what}`);
    const r = await runGit(git, ["-c", "core.hooksPath=/dev/null", "-c", "init.templateDir=", "-c", "advice.detachedHead=false", ...args], tmp);
    if (r.code) throw new Error(`git ${what} lỗi (exit ${r.code}): ${String(r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ")}`);
    return r;
  };
  try {
    mkdirSync(tmp);
    await step("init", ["init", "-q"]);
    await step("remote", ["remote", "add", "origin", pin.repo]);
    await step("fetch", ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", pin.sha]);
    await step("sparse-checkout", ["sparse-checkout", "set", "--no-cone", ...SPARSE]);
    await step("checkout", ["checkout", "-q", "--detach", pin.sha]);
    const head = (await step("rev-parse", ["rev-parse", "HEAD"])).stdout.trim();
    if (head !== pin.sha) throw new Error(`commit tải về là ${head}, không phải ${pin.sha}`);
    rmSync(join(tmp, ".git"), { recursive: true, force: true });
    const files = prune(tmp);
    if (!files.some((f) => f.endsWith("/style.json"))) throw new Error("bản tải về không có styles/*/style.json");
    writeFileSync(join(tmp, MARK), JSON.stringify({ sha: pin.sha, repo: pin.repo, at: new Date().toISOString(), files: files.length }, null, 2) + "\n");
    // A leftover folder of this sha without its mark is a half-finished older run.
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
    log(`xong: ${files.length} file trong ${dir}`);
    return { dir, sha: pin.sha, fetched: true, files: files.length };
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchLibrary({ log: (l) => console.log(l) })
    .then((r) => { console.log(`RESULT ${JSON.stringify({ ok: true, ...r })}`); })
    .catch((e) => { console.error(e.message); console.log(`RESULT ${JSON.stringify({ ok: false, error: e.message })}`); process.exitCode = 1; });
}
