// Export gate results (the provider's check-preflight --stage final) kept per project while the
// project's files have not changed, so GET /api/gates answers at once and the welcome screen can
// show a gate without starting a check.
//
// The signature is the stat of what the final preflight reads:
//   root files  project.json BRIEF.md PLAN.md STORYBOARD.md DEMO.md QA.md REVISIONS.md CASES.md
//               index.html audio_meta.json
//   folders     assets compositions scenes build demo script renders .opus/approvals
//               (file count and newest mtime, walked recursively)
// Left out: assets/sfx-onsets.json and *.tmp files (the preflight rewrites its onset cache while it
// runs, which would make every run look like an edit), node_modules, .hyperframes, and the rest of
// .opus (caches and history). Plugin files (directions, styles) are not in it: "Kiểm lại" runs the
// check again after a plugin update.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT_FILES = ["project.json", "BRIEF.md", "PLAN.md", "STORYBOARD.md", "DEMO.md", "QA.md", "REVISIONS.md", "CASES.md", "index.html", "audio_meta.json"];
export const DIRS = ["assets", "compositions", "scenes", "build", "demo", "script", "renders", join(".opus", "approvals")];
export const CACHE_FILE = join(".opus", "gates-cache.json");
const SKIP_DIRS = new Set(["node_modules", ".hyperframes"]);
const skipFile = (rel) => rel === join("assets", "sfx-onsets.json") || rel.endsWith(".tmp");

// { count, newest } of the files under dir; symlinked folders are followed once (realpath seen).
function walk(root, rel, acc, seen) {
  let real;
  try { real = statSync(join(root, rel)); } catch { return; }
  const id = `${real.dev}:${real.ino}`;
  if (seen.has(id)) return;
  seen.add(id);
  let entries;
  try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = join(rel, e.name);
    let s;
    try { s = e.isSymbolicLink() ? statSync(join(root, r)) : lstatSync(join(root, r)); } catch { continue; }
    if (s.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, r, acc, seen); continue; }
    if (!s.isFile() || skipFile(r)) continue;
    acc.count++;
    acc.size += s.size;
    if (s.mtimeMs > acc.newest) acc.newest = s.mtimeMs;
  }
}

export function gateSignature(dir) {
  const parts = ROOT_FILES.map((f) => {
    try { const s = statSync(join(dir, f)); return `${f}:${s.mtimeMs}:${s.size}`; } catch { return `${f}:-`; }
  });
  for (const d of DIRS) {
    if (!existsSync(join(dir, d))) { parts.push(`${d}:-`); continue; }
    const acc = { count: 0, size: 0, newest: 0 };
    walk(dir, d, acc, new Set());
    parts.push(`${d}:${acc.count}:${acc.size}:${acc.newest}`);
  }
  return parts.join("|");
}

// One result per project, in memory and in <dir>/.opus/gates-cache.json, so a restarted Studio
// still knows the last gate of each project without running the check again.
export function createGateCache() {
  const mem = new Map(); // name → { sig, value }
  const load = (name, dir) => {
    if (mem.has(name)) return mem.get(name);
    try {
      const c = JSON.parse(readFileSync(join(dir, CACHE_FILE), "utf8"));
      if (typeof c?.sig === "string" && c.value && typeof c.value === "object") { mem.set(name, c); return c; }
    } catch { /* none or unreadable: no entry */ }
    return null;
  };
  return {
    // The stored value when its signature is sig, else null.
    get(name, dir, sig) {
      const c = load(name, dir);
      return c && c.sig === sig ? c.value : null;
    },
    set(name, dir, sig, value) {
      const c = { sig, value, created: new Date().toISOString() };
      mem.set(name, c);
      const file = join(dir, CACHE_FILE), tmp = `${file}.${process.pid}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(tmp, JSON.stringify(c) + "\n");
        renameSync(tmp, file);
      } catch { /* read-only project: the memory copy still serves this run */ }
    },
  };
}
