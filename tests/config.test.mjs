import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compressScript, env, rootDefault, LEGACY_ROOT, OLD } from "../lib/config.mjs";
import { adapterFor } from "../lib/provider.mjs";

const CLI = fileURLToPath(new URL("../bin/motion-studio.mjs", import.meta.url));
const CONFIG = fileURLToPath(new URL("../lib/config.mjs", import.meta.url));
const WARN = /đã cũ, sẽ bỏ ở 2\.0/;

// The environment without any Studio variable, plus extra.
function clean(extra = {}) {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith("MOTION_STUDIO_") || Object.values(OLD).includes(k)) delete e[k];
  return { ...e, ...extra };
}
const cli = (args, extra) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: clean(extra) });
const warnings = (stderr) => stderr.split("\n").filter((l) => WARN.test(l));

test("env reads the new name first and the old one as a fallback", () => {
  assert.equal(env("ROOT", { MOTION_STUDIO_ROOT: "/new", OPUS_STUDIO_ROOT: "/old" }), "/new");
  assert.equal(env("ROOT", {}), undefined);
  assert.equal(env("THUMBS", { MOTION_STUDIO_THUMBS: "/t" }), "/t");
  assert.equal(compressScript("/w", {}), "/w/scripts/compress-final.sh");
  assert.equal(compressScript("/w", { MOTION_STUDIO_COMPRESS: "/c.sh" }), "/c.sh");
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  try {
    const state = join(dir, "studio.json");
    assert.equal(rootDefault({ MOTION_STUDIO_STATE: state }), LEGACY_ROOT);
    writeFileSync(state, JSON.stringify({ root: "/last" }));
    assert.equal(rootDefault({ MOTION_STUDIO_STATE: state }), "/last");
    assert.equal(rootDefault({ MOTION_STUDIO_STATE: state, MOTION_STUDIO_ROOT: "/env" }), "/env");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("only the old names set: Studio works and warns once per name", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-old-"));
  try {
    const r = cli(["status"], { OPUS_STUDIO_STATE: join(dir, "studio.json") });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "stopped");
    const w = warnings(r.stderr);
    assert.equal(w.length, 1, r.stderr);
    assert.match(w[0], /OPUS_STUDIO_STATE .*MOTION_STUDIO_STATE/);
    // Many reads of two old names in one process: one line each.
    const code = `import { env } from ${JSON.stringify(CONFIG)}; for (let i = 0; i < 3; i++) { env("ROOT"); env("COMPRESS"); } console.log(env("ROOT"), env("COMPRESS"));`;
    const e = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: clean({ OPUS_STUDIO_ROOT: "/old-root", OPUS_COMPRESS_FINAL: "/old.sh" }) });
    assert.equal(e.stdout.trim(), "/old-root /old.sh");
    assert.deepEqual(warnings(e.stderr).map((l) => l.match(/OPUS_\w+/)[0]), ["OPUS_STUDIO_ROOT", "OPUS_COMPRESS_FINAL"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the new names set: no warning", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-new-"));
  try {
    const r = cli(["status"], { MOTION_STUDIO_STATE: join(dir, "studio.json"), MOTION_STUDIO_ROOT: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "stopped");
    assert.deepEqual(warnings(r.stderr), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the legacy state file is copied to ~/.config/motion-studio once and never removed", async () => {
  const home = mkdtempSync(join(tmpdir(), "cfg-home-"));
  try {
    // LEGACY_STATE of the default adapter, under this HOME.
    const A = await adapterFor({});
    const rel = A.LEGACY_STATE.slice(A.LEGACY_STATE.indexOf("/.config/") + 1);
    const legacy = join(home, rel);
    mkdirSync(join(legacy, ".."), { recursive: true });
    writeFileSync(legacy, JSON.stringify({ director: { runner: "mcp" } }));
    const fresh = join(home, ".config", "motion-studio", "studio.json");
    const r = cli(["status"], { HOME: home });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /đã chép trạng thái/);
    assert.deepEqual(JSON.parse(readFileSync(fresh, "utf8")), { director: { runner: "mcp" } });
    assert.equal(statSync(fresh).mode & 0o777, 0o600);
    assert.ok(existsSync(legacy), "the old file stays");
    const again = cli(["status"], { HOME: home });
    assert.doesNotMatch(again.stderr, /đã chép/, "copied only once");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
