// The login LaunchAgent (lib/launch-agent.mjs): the plist it writes, the refusal while a Studio
// answers on the port, and the launchctl calls of install and uninstall (a fake exec, a temp home).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, plistFor, plistPath, portBusy, THROTTLE_S, uninstall } from "../lib/launch-agent.mjs";

const base = { label: "com.motion-studio.test", node: "/usr/local/bin/node", bin: "/opt/ms/bin/motion-studio.mjs", root: "/Volumes/2/A&B", port: 4318, state: "/tmp/st.json" };
const fakeExec = () => { const calls = []; const exec = (cmd, args) => { calls.push([cmd, ...args]); return Buffer.from(""); }; return { calls, exec }; };

test("plistFor has every key, runs start in the foreground, throttles and escapes", () => {
  const x = plistFor({ ...base, logDir: "/tmp/logs" });
  for (const k of ["Label", "ProgramArguments", "EnvironmentVariables", "RunAtLoad", "KeepAlive", "SuccessfulExit", "ThrottleInterval", "StandardOutPath", "StandardErrorPath"]) assert.ok(x.includes(`<key>${k}</key>`), k);
  assert.ok(x.includes(`<integer>${THROTTLE_S}</integer>`));
  assert.ok(x.includes("<key>ProcessType</key><string>Interactive</string>"));
  assert.ok(x.includes("<string>start</string><string>--root</string><string>/Volumes/2/A&amp;B</string>"));
  assert.ok(!x.includes("--background"));
  assert.ok(!x.includes("A&B"));
  assert.ok(x.includes("<key>MOTION_STUDIO_PORT</key><string>4318</string>"));
  assert.ok(x.includes("<key>MOTION_STUDIO_STATE</key><string>/tmp/st.json</string>"));
  assert.ok(!plistFor({ ...base, port: null, state: null, logDir: "/tmp" }).includes("EnvironmentVariables"));
});

test("install refuses while a server answers on the port and writes nothing", async () => {
  const home = mkdtempSync(join(tmpdir(), "la-home-"));
  const srv = createServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  try {
    const port = srv.address().port;
    assert.equal(await portBusy(port), true);
    const { calls, exec } = fakeExec();
    const r = await install({ ...base, port, home, logDir: join(home, "logs"), exec });
    assert.equal(r.ok, false);
    assert.match(r.error, new RegExp(`Cổng ${port} đang có Studio chạy`));
    assert.equal(existsSync(plistPath(base.label, home)), false);
    assert.deepEqual(calls, []);
  } finally { srv.close(); rmSync(home, { recursive: true, force: true }); }
});

test("install writes the plist and bootstraps it; uninstall boots it out and removes it", async () => {
  const home = mkdtempSync(join(tmpdir(), "la-home-"));
  try {
    const { calls, exec } = fakeExec();
    const r = await install({ ...base, home, logDir: join(home, "logs"), exec, busy: async () => false });
    const file = plistPath(base.label, home);
    assert.deepEqual(r, { ok: true, file });
    assert.ok(readFileSync(file, "utf8").includes(`<string>${base.label}</string>`));
    const uid = process.getuid();
    assert.deepEqual(calls, [["launchctl", "bootout", `gui/${uid}/${base.label}`], ["launchctl", "bootstrap", `gui/${uid}`, file]]);
    const u = fakeExec();
    assert.deepEqual(uninstall({ label: base.label, home, exec: u.exec }), { ok: true, file, removed: true });
    assert.deepEqual(u.calls, [["launchctl", "bootout", `gui/${uid}/${base.label}`]]);
    assert.equal(existsSync(file), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a label that is not a plain reverse-DNS name is refused", async () => {
  const { calls, exec } = fakeExec();
  assert.equal((await install({ ...base, label: "../x", home: tmpdir(), logDir: tmpdir(), exec, busy: async () => false })).ok, false);
  assert.equal(uninstall({ label: "a/b", exec }).ok, false);
  assert.deepEqual(calls, []);
});
