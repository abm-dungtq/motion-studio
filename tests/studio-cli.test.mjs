import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/motion-studio.mjs", import.meta.url));

test("a state file left by a crash never sends SIGTERM to a reused pid", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-state-"));
  const state = join(dir, "studio.json");
  // A live process that does not listen on the Studio port stands in for the reused pid.
  const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  try {
    const fake = () => writeFileSync(state, JSON.stringify({ pid: other.pid, port: 4317, root: dir, url: "http://127.0.0.1:4317/", token: "x", started: "2026-01-01T00:00:00.000Z" }));
    const run = (cmd) => execFileSync(process.execPath, [CLI, cmd], { encoding: "utf8", env: { ...process.env, MOTION_STUDIO_STATE: state } }).trim();
    // Only the settings survive (the root of the last run); nothing of the dead server.
    const left = () => JSON.parse(readFileSync(state, "utf8"));
    fake();
    assert.equal(run("status"), "stopped");
    assert.deepEqual(left(), { root: dir });
    fake();
    assert.equal(run("stop"), "stopped");
    assert.deepEqual(left(), { root: dir });
    assert.equal(other.exitCode, null);
    assert.doesNotThrow(() => process.kill(other.pid, 0));
  } finally {
    other.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
