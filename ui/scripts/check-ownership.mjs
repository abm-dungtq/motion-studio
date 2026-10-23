#!/usr/bin/env node
// check-ownership.mjs <area> [--base <ref>]: proves an area branch only changed its own files.
// The changed files are the union of `git diff --name-only <base>...HEAD` and the working tree
// (`git status --porcelain --untracked-files=all`). Each one must match a glob of the area in
// ui/ownership.json, or one of its every_area globs ({area} is the area name). Prints
// "NGOÀI VÙNG <file>" for each stray file and exits 1; otherwise "ok <area> <n> file", exit 0.
// An area not in the map: "vùng lạ: <area>", exit 2. Bad usage or a git failure: exit 2 as well.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MAP_PATH = join(here, "..", "ownership.json");

export const loadMap = (path = MAP_PATH) => JSON.parse(readFileSync(path, "utf8"));

// Glob to regex, with no library: "**" matches anything (slashes too), "*" anything inside one
// path segment; every other character is literal.
export function globToRegex(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") { out += ".*"; i++; }
    else if (c === "*") out += "[^/]*";
    else out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export const matches = (glob, path) => globToRegex(glob).test(path);

// Every glob that counts for an area: its own and the every_area ones with {area} filled in.
export const globsOf = (map, area) => [...(map.areas[area] ?? []), ...(map.every_area ?? []).map((g) => g.replaceAll("{area}", area))];

// A sample path for a glob: "**" becomes "x/y.tsx", "*" becomes "x".
const sampleOf = (glob) => glob.replaceAll("**", "x/y.tsx").replaceAll("*", "x");

// Pairs of areas where a glob of one matches a sample path of another's glob: [] when the map
// gives every file to at most one area.
export function overlaps(map) {
  const found = [];
  const areas = Object.keys(map.areas);
  for (const a of areas) {
    for (const b of areas) {
      if (a === b) continue;
      for (const gb of globsOf(map, b)) {
        const sample = sampleOf(gb);
        const hit = globsOf(map, a).find((ga) => matches(ga, sample));
        if (hit) found.push({ area: a, glob: hit, other: b, path: sample });
      }
    }
  }
  return found;
}

export function strays(map, area, files) {
  const globs = globsOf(map, area).map(globToRegex);
  return files.filter((f) => !globs.some((re) => re.test(f)));
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function changedFiles(base, cwd) {
  const diff = git(["diff", "--name-only", `${base}...HEAD`], cwd).split("\n");
  // Porcelain v1: two status columns and a space; a rename shows "old -> new" (keep the new path).
  const status = git(["status", "--porcelain", "--untracked-files=all"], cwd).split("\n")
    .map((l) => l.slice(3)).map((p) => (p.includes(" -> ") ? p.split(" -> ").pop() : p))
    .map((p) => (p.startsWith('"') && p.endsWith('"') ? JSON.parse(p) : p));
  return [...new Set([...diff, ...status].map((s) => s.trim()).filter(Boolean))].sort();
}

function main(argv) {
  const area = argv[0];
  const bi = argv.indexOf("--base");
  if (!area || area.startsWith("--") || (bi >= 0 && !argv[bi + 1])) {
    console.error("cách dùng: check-ownership.mjs <vùng> [--base <ref>]");
    return 2;
  }
  const map = loadMap();
  if (!Object.hasOwn(map.areas, area)) { console.log(`vùng lạ: ${area}`); return 2; }
  const root = join(here, "..", "..");
  let files;
  try { files = changedFiles(bi >= 0 ? argv[bi + 1] : map.base, root); }
  catch (e) { console.error(`git lỗi: ${String(e.stderr ?? e.message).trim()}`); return 2; }
  const bad = strays(map, area, files);
  for (const f of bad) console.log(`NGOÀI VÙNG ${f}`);
  if (bad.length) return 1;
  console.log(`ok ${area} ${files.length} file`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
