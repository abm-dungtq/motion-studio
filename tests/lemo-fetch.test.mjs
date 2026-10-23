import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fetchLibrary, readyDir, SPARSE, allowed } from "../lib/lemo/fetch.mjs";
import { gitLibrary } from "./fixtures/lemo/make.mjs";

const made = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// A git that logs its argv (one JSON line per call) and then runs the real git.
function loggingGit() {
  const d = tmp("lemo-git-");
  const log = join(d, "git.log");
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const f = join(d, "git");
  writeFileSync(f, `#!/usr/bin/env node
require("fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const r = require("child_process").spawnSync(${JSON.stringify(real)}, process.argv.slice(2), { stdio: "inherit" });
process.exit(r.status ?? 1);
`);
  chmodSync(f, 0o755);
  return { git: f, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []) };
}

const files = (dir) => {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f); else out.push(relative(dir, f)); } };
  walk(dir);
  return out.sort();
};

const lib = gitLibrary();
made.push(lib.dir);

test("fetch keeps only the sparse files and no script; the second call runs no git", async () => {
  const home = tmp("lemo-home-");
  const g = loggingGit();
  const pin = { repo: lib.url, sha: lib.sha };
  const r = await fetchLibrary({ home, pin, git: g.git });
  assert.equal(r.fetched, true);
  assert.equal(readyDir(home, pin), join(home, lib.sha));
  const got = files(r.dir).filter((f) => f !== ".pin.json");
  assert.ok(got.length > 0);
  for (const f of got) assert.ok(allowed(f), `${f} is outside the sparse list`);
  assert.ok(got.includes("styles/watercolor/style.json") && got.includes("docs/frames/watercolor.jpg") && got.includes("MY-STYLES.md"));
  assert.deepEqual(got.filter((f) => /\.(js|py|sh)$/.test(f)), [], "no script is checked out");
  assert.ok(!existsSync(join(r.dir, ".git")), "the checkout keeps no repository data");
  // git ran without a shell: each pattern is one literal argument, never expanded.
  const sparse = g.calls().find((a) => a.includes("sparse-checkout"));
  for (const p of SPARSE) assert.ok(sparse.includes(p), `${p} passed as one argument`);
  assert.ok(g.calls().some((a) => a.includes("fetch") && a.includes("--depth") && a.includes(lib.sha)));
  const n = g.calls().length;
  const again = await fetchLibrary({ home, pin, git: g.git });
  assert.equal(again.fetched, false);
  assert.equal(g.calls().length, n, "no git call the second time");
});

test("an unknown sha fails and leaves no folder behind", async () => {
  const home = tmp("lemo-home-");
  const sha = "0".repeat(40);
  await assert.rejects(fetchLibrary({ home, pin: { repo: lib.url, sha } }), /git (fetch|checkout|rev-parse)/);
  assert.equal(existsSync(join(home, sha)), false);
  assert.deepEqual(readdirSync(home), [], "no temp folder either");
});

test("a bad pin is refused before any git call", async () => {
  const g = loggingGit();
  await assert.rejects(fetchLibrary({ home: tmp("lemo-home-"), pin: { repo: lib.url, sha: "abc" }, git: g.git }), /sha/);
  await assert.rejects(fetchLibrary({ home: tmp("lemo-home-"), pin: { repo: "ext::sh -c x", sha: lib.sha }, git: g.git }), /repo/);
  assert.deepEqual(g.calls(), []);
});
