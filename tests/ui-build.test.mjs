// ensureUi decides when ui/ needs npm ci and a Vite build, and what start does when either fails:
// a fake ui/ folder (sources, dist/index.html, an empty node_modules/vite/bin/vite.js) and a fake
// run that records the commands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUi, uiState } from "../lib/ui-build.mjs";

const OLD = new Date("2026-01-01T00:00:00Z");
const NEW = new Date("2026-06-01T00:00:00Z");

function fakeUi({ deps = true, dist = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ui-build-"));
  const put = (rel, text, when = OLD) => {
    const f = join(dir, rel);
    mkdirSync(join(f, ".."), { recursive: true });
    writeFileSync(f, text);
    utimesSync(f, when, when);
  };
  put("src/main.tsx", "export {};");
  put("src/styles/tokens.test.ts", "// a test file");
  for (const f of ["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "components.json"]) put(f, "{}");
  if (deps) {
    put("node_modules/vite/bin/vite.js", "");
    put("node_modules/.package-lock.json", "{}", NEW);
  }
  if (dist) put("dist/index.html", "<title>Motion Studio</title>", NEW);
  return { dir, put };
}

function fakeRun(code = 0) {
  const calls = [];
  const run = async (cmd, args, opts) => { calls.push({ cmd, args, cwd: opts?.cwd }); return { code, output: code ? "boom" : "" }; };
  return { run, calls };
}

const quiet = { log: () => {}, err: () => {} };

test("a build newer than every source is fresh and runs nothing", async () => {
  const { dir } = fakeUi();
  try {
    const { run, calls } = fakeRun();
    const st = uiState(dir);
    assert.equal(st.stale, false);
    assert.equal(st.needInstall, false);
    const r = await ensureUi({ dir, run, ...quiet });
    assert.deepEqual([r.ok, r.action], [true, "fresh"]);
    assert.equal(calls.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a source newer than the build runs vite.js build once (a newer test file does not)", async () => {
  const { dir, put } = fakeUi();
  try {
    put("src/styles/tokens.test.ts", "// newer test", new Date("2026-09-01T00:00:00Z"));
    assert.equal(uiState(dir).stale, false, "test files are not sources");
    put("src/main.tsx", "export const x = 1;", new Date("2026-09-01T00:00:00Z"));
    const { run, calls } = fakeRun();
    const lines = [];
    const r = await ensureUi({ dir, run, log: (l) => lines.push(l), err: () => {} });
    assert.deepEqual([r.ok, r.action], [true, "built"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, process.execPath);
    assert.deepEqual(calls[0].args, [join(dir, "node_modules", "vite", "bin", "vite.js"), "build"]);
    assert.equal(calls[0].cwd, dir);
    assert.ok(lines.includes("giao diện: build lại (nguồn mới hơn bản build)…"));
    assert.ok(lines.some((l) => /^giao diện: build xong trong \d+\.\d s$/.test(l)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a failed build with an older build keeps it and warns", async () => {
  const { dir, put } = fakeUi();
  try {
    put("src/main.tsx", "export const x = 1;", new Date("2026-09-01T00:00:00Z"));
    const { run } = fakeRun(1);
    const errs = [];
    const r = await ensureUi({ dir, run, log: () => {}, err: (l) => errs.push(l) });
    assert.deepEqual([r.ok, r.action], [true, "stale-kept"]);
    assert.ok(errs.includes("giao diện: build lỗi, dùng bản build cũ"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a failed build with no build at all fails and says to run npm run setup", async () => {
  const { dir } = fakeUi({ dist: false });
  try {
    const { run, calls } = fakeRun(1);
    const r = await ensureUi({ dir, run, ...quiet });
    assert.deepEqual([r.ok, r.action], [false, "failed"]);
    assert.match(r.message, /npm run setup/);
    assert.equal(calls.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("missing node_modules without install keeps the old build and runs nothing", async () => {
  const { dir, put } = fakeUi({ deps: false });
  try {
    put("src/main.tsx", "export const x = 1;", new Date("2026-09-01T00:00:00Z"));
    const { run, calls } = fakeRun();
    const r = await ensureUi({ dir, install: false, run, ...quiet });
    assert.deepEqual([r.ok, r.action], [true, "stale-kept"]);
    assert.equal(calls.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("missing node_modules with install runs npm ci, then vite.js build", async () => {
  const { dir } = fakeUi({ deps: false });
  try {
    const { run, calls } = fakeRun();
    const r = await ensureUi({ dir, install: true, run, ...quiet });
    assert.deepEqual([r.ok, r.action], [true, "installed+built"]);
    assert.equal(calls.length, 2);
    assert.match(calls[0].cmd, /^npm(\.cmd)?$/);
    assert.deepEqual(calls[0].args, ["ci", "--prefer-offline", "--no-audit", "--no-fund"]);
    assert.equal(calls[0].cwd, dir);
    assert.equal(calls[1].cmd, process.execPath);
    assert.deepEqual(calls[1].args.slice(-1), ["build"]);
    assert.match(calls[1].args[0], /vite\.js$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
