import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { adapterFor } from "../lib/provider.mjs";
import { parseArgs, runSetup } from "../lib/setup.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

// No network: git, the installer and raw.githubusercontent.com are a fake io.
const A = await adapterFor({});
const REMOTE = "b".repeat(40), OLD = "a".repeat(40);
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const plugin = (o) => { const d = fakePlugin({ schema: A.NEED.schema, ...o }); made.push(d); return d; };

function fakeIo({ version = "2.4.0", head = REMOTE, branch = "main", dirty = false, ancestor = false, lsFail = false, runCode = 0 } = {}) {
  const calls = [];
  return {
    calls,
    runs: () => calls.filter((c) => c[0] === "run"),
    async exec(cmd, args) {
      calls.push([cmd, ...args]);
      if (args[0] === "ls-remote") return lsFail ? { code: 128, stdout: "", stderr: "fatal: unable to access" } : { code: 0, stdout: `${REMOTE}\trefs/heads/main\n`, stderr: "" };
      const sub = args[2];
      if (sub === "rev-parse") return { code: 0, stdout: `${args[3] === "HEAD" ? head : branch}\n`, stderr: "" };
      if (sub === "status") return { code: 0, stdout: dirty ? " M scripts/x.mjs\n" : "", stderr: "" };
      if (sub === "merge-base") return { code: ancestor ? 0 : 1, stdout: "", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    },
    async run(cmd, args) { calls.push(["run", cmd, ...args]); return runCode; },
    async fetchText(url) {
      calls.push(["fetch", url]);
      if (url.endsWith("/.claude-plugin/plugin.json")) return JSON.stringify({ version });
      if (url.endsWith("/install.sh")) return "#!/usr/bin/env bash\nexit 0\n";
      throw new Error("404");
    },
  };
}

async function setup(argv, { env, io, ask = async () => true, isTTY = true, recheck = async () => ({ ok: true, provider: { version: "2.4.0", api: 3 } }) }) {
  const out = [], errs = [];
  const o = parseArgs(argv);
  const code = await runSetup(o, { env, io, ask, isTTY, recheck, log: (s) => out.push(s), err: (s) => errs.push(s) });
  return { code, out: out.join("\n"), err: errs.join("\n") };
}

test("missing without a terminal: nothing installed, the command is printed (exit 3)", async () => {
  const io = fakeIo();
  const r = await setup([], { env: { OPUS_VIDEO_HOME: join(tmpdir(), "no-such-plugin") }, io, isTTY: false });
  assert.equal(r.code, 3);
  assert.match(r.out, /chưa cài/);
  assert.match(r.out, /bản mới nhất 2\.4\.0 @ bbbbbbb/);
  assert.match(r.out, /npm run setup -- --yes/);
  assert.deepEqual(io.runs(), []);
});

test("missing with --yes: the official install.sh runs with --ref and the host flag, then the provider is checked", async () => {
  const io = fakeIo();
  let rechecked = false;
  const r = await setup(["--yes", "--host", "claude"], { env: { OPUS_VIDEO_HOME: join(tmpdir(), "no-such-plugin") }, io, recheck: async () => { rechecked = true; return { ok: true, provider: { version: "2.4.0", api: 4 } }; } });
  assert.equal(r.code, 0, r.err);
  const [run] = io.runs();
  assert.equal(run[1], "bash");
  assert.match(run[2], /install\.sh$/);
  assert.deepEqual(run.slice(3), ["--ref", "main", "--claude"]);
  assert.ok(io.calls.some((c) => c[0] === "fetch" && c[1].endsWith("/main/install.sh")));
  assert.ok(rechecked);
  assert.match(r.out, /đã cài 2\.4\.0 bằng install\.sh, tương thích \(STUDIO_API 4\)/);
});

test("an outdated copy is reported installed → latest; answering n installs nothing, Y runs the installer", async () => {
  const dir = plugin({ version: "2.3.0" });
  const no = fakeIo();
  const r = await setup([], { env: { OPUS_VIDEO_HOME: dir }, io: no, ask: async (q) => { assert.match(q, /\[Y\/n\]/); return false; } });
  assert.equal(r.code, 0);
  assert.match(r.out, /cũ, 2\.3\.0 → 2\.4\.0 @ bbbbbbb/);
  assert.deepEqual(no.runs(), []);
  const yes = fakeIo();
  assert.equal((await setup([], { env: { OPUS_VIDEO_HOME: dir }, io: yes })).code, 0);
  assert.deepEqual(yes.runs()[0].slice(3), ["--ref", "main", "--all"]);
});

test("an outdated git checkout is pulled --ff-only; a dirty one or one on another branch is refused", async () => {
  const dir = plugin({ git: true });
  const io = fakeIo({ head: OLD });
  const r = await setup(["--yes"], { env: { OPUS_VIDEO_HOME: dir }, io });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /cũ, 2\.4\.0 @ aaaaaaa → 2\.4\.0 @ bbbbbbb/);
  assert.deepEqual(io.runs(), [["run", "git", "-C", dir, "pull", "--ff-only"]]);
  assert.match(r.out, /bằng git pull/);

  const dirty = fakeIo({ head: OLD, dirty: true });
  const d = await setup(["--yes"], { env: { OPUS_VIDEO_HOME: dir }, io: dirty });
  assert.equal(d.code, 1);
  assert.match(d.err, /thay đổi chưa commit/);
  assert.deepEqual(dirty.runs(), []);

  const other = fakeIo({ head: OLD, branch: "feat/x" });
  const b = await setup(["--yes"], { env: { OPUS_VIDEO_HOME: dir }, io: other });
  assert.equal(b.code, 1);
  assert.match(b.err, /đang ở feat\/x/);
  assert.deepEqual(other.runs(), []);
});

test("a failing pull is exit 1; a provider still unusable after the install is exit 1", async () => {
  const dir = plugin({ git: true });
  assert.equal((await setup(["--yes"], { env: { OPUS_VIDEO_HOME: dir }, io: fakeIo({ head: OLD, runCode: 1 }) })).code, 1);
  const r = await setup(["--yes"], { env: { OPUS_VIDEO_HOME: dir }, io: fakeIo({ head: OLD }), recheck: async () => ({ ok: false, error: "STUDIO_API cần <= 4, đang có 5" }) });
  assert.equal(r.code, 1);
  assert.match(r.err, /vẫn chưa dùng được: STUDIO_API/);
});

test("up to date (HEAD is the remote tip, or already contains it): nothing installed, compatibility reported", async () => {
  const dir = plugin({ git: true, api: 4 });
  for (const io of [fakeIo(), fakeIo({ head: OLD, ancestor: true })]) {
    const r = await setup([], { env: { OPUS_VIDEO_HOME: dir }, io, ask: async () => assert.fail("no question when current") });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /đã mới nhất/);
    assert.match(r.out, /tương thích \(STUDIO_API 4\)/);
    assert.deepEqual(io.runs(), []);
  }
  // A copy with the latest version, and an incompatible one.
  assert.equal((await setup([], { env: { OPUS_VIDEO_HOME: plugin() }, io: fakeIo() })).code, 0);
  const bad = await setup([], { env: { OPUS_VIDEO_HOME: plugin({ api: 5 }) }, io: fakeIo() });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /STUDIO_API cần <= 4, đang có 5/);
});

test("latest unknown (no network): the installed provider is still checked, nothing installed", async () => {
  const io = fakeIo({ lsFail: true });
  const r = await setup([], { env: { OPUS_VIDEO_HOME: plugin() }, io });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /không kiểm được bản mới nhất: git ls-remote .* lỗi \(exit 128\)/);
  assert.deepEqual(io.runs(), []);
});

test("bad arguments", async () => {
  assert.match(parseArgs(["--ref"]).error, /cần giá trị/);
  assert.match(parseArgs(["--ref", "; rm -rf /"]).error, /không hợp lệ/);
  assert.match(parseArgs(["--nope"]).error, /tham số lạ/);
  assert.equal((await setup(["--host", "vim"], { env: {}, io: fakeIo() })).code, 2);
});

test("refCommit and olderThan", () => {
  const ls = `${"1".repeat(40)}\trefs/heads/main\n${"2".repeat(40)}\trefs/tags/v2.4.0\n${"3".repeat(40)}\trefs/tags/v2.4.0^{}\n`;
  assert.equal(A.refCommit(ls, "main"), "1".repeat(40));
  assert.equal(A.refCommit(ls, "v2.4.0"), "3".repeat(40), "a peeled tag names the commit");
  assert.equal(A.refCommit(ls, "nope"), null);
  assert.equal(A.refCommit("", "c".repeat(40)), "c".repeat(40));
  assert.ok(A.olderThan("2.3.9", "2.4.0") && A.olderThan("2.4.0", "10.0.0"));
  assert.ok(!A.olderThan("2.4.0", "2.4.0") && !A.olderThan("2.5.0", "2.4.0"));
});
