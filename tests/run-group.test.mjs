// lib/run-node.mjs: a timeout or killAllRuns stops the whole process group, grandchildren too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { killAllRuns, runCmd, runNode } from "../lib/run-node.mjs";

const HANG = fileURLToPath(new URL("./fixtures/run-group/hang-with-child.mjs", import.meta.url));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function gone(pid, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (!alive(pid)) return true;
  return false;
}

test("runNode: a run answers its exit code and stdout; a failed script reads as code 1", async () => {
  const ok = await runCmd(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.deepEqual([ok.code, ok.stdout, ok.killed], [0, "ok", false]);
  const bad = await runNode(fileURLToPath(new URL("./fixtures/run-group/no-such-script.mjs", import.meta.url)), []);
  assert.deepEqual([bad.code, bad.killed], [1, false]);
});

test("runNode: a timeout kills the child and its grandchild, and reads as killed with code 1", async () => {
  const r = await runNode(HANG, [], { timeout: 800 });
  assert.equal(r.killed, true);
  assert.equal(r.code, 1);
  const pid = Number(r.stdout.trim());
  assert.ok(pid > 0, r.stdout);
  assert.ok(await gone(pid), `grandchild ${pid} still running`);
});

test("killAllRuns stops a run still going, grandchild included", async () => {
  const p = runNode(HANG, [], { timeout: 60000 });
  await wait(600);
  killAllRuns();
  const r = await p;
  const pid = Number(r.stdout.trim());
  assert.ok(pid > 0, r.stdout);
  assert.ok(await gone(pid), `grandchild ${pid} still running`);
});

test("runCmd: a missing command answers ENOENT; input goes to stdin", async () => {
  const miss = await runCmd("motion-studio-no-such-command", []);
  assert.equal(miss.error, "ENOENT");
  assert.equal(miss.code, null);
  const echo = await runCmd(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { input: "xin chào" });
  assert.equal(echo.stdout, "xin chào");
});
