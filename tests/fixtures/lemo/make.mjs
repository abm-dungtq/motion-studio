// Test helpers for the lemo style library: a copy of repo/ (three styles and one broken
// style.json) with frames and demo sources added (binary files and demo/ folders stay out of git),
// optionally as a git repository with one commit.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("./repo/", import.meta.url));
export const FAKE_LEMO = fileURLToPath(new URL("./fake-lemo.mjs", import.meta.url));
// The first bytes of a JPEG (SOI + APP0 "JFIF").
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

export function makeLibrary(dir = mkdtempSync(join(tmpdir(), "lemo-lib-"))) {
  cpSync(REPO, dir, { recursive: true });
  for (const s of ["watercolor", "ukiyoe", "ink-wash"]) {
    mkdirSync(join(dir, "styles", s, "demo"), { recursive: true });
    writeFileSync(join(dir, "styles", s, "demo", "main.js"), "console.log('demo');\n");
  }
  writeFileSync(join(dir, "docs", "frames", "watercolor.jpg"), JPEG);
  writeFileSync(join(dir, "docs", "frames", "ukiyoe.jpg"), JPEG);
  writeFileSync(join(dir, "docs", "frames", "ink-wash.jpg"), "not a jpeg");
  return dir;
}

const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// { dir, sha, url }: a git repository of makeLibrary() that serves any commit by sha.
export function gitLibrary() {
  const dir = makeLibrary();
  git(dir, "init", "-q");
  git(dir, "config", "uploadpack.allowAnySHA1InWant", "true");
  git(dir, "config", "uploadpack.allowFilter", "true");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "fixture");
  return { dir, sha: git(dir, "rev-parse", "HEAD"), url: `file://${dir}` };
}
