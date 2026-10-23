import { test } from "node:test";
import assert from "node:assert/strict";
import { listAgents, summarize } from "../lib/agents/index.mjs";
import { detectBin, exec, firstJson, which } from "../lib/agents/run.mjs";
import { redact, MASK } from "../lib/agents/redact.mjs";
import { parseStatus } from "../lib/agents/cli/codex-pool.mjs";
import { parseModels } from "../lib/agents/cli/agy.mjs";
import { fakeAgents } from "./fake-cli.mjs";

const byId = (scan) => Object.fromEntries(scan.agents.map((a) => [a.id, a]));

test("listAgents finds the CLIs on the path with version, login state and caps; missing ones are found: false", async () => {
  const f = fakeAgents();
  try {
    const scan = await listAgents({ env: f.env, refresh: true });
    const a = byId(scan);
    assert.equal(a.claude.found, true);
    assert.equal(a.claude.version, "2.1.304");
    assert.equal(a.claude.logged_in, true);
    assert.equal(a.codex.version, "codex-cli 0.163.0");
    assert.equal(a.codex.logged_in, true);
    assert.equal(a.codex.method, "ChatGPT");
    assert.equal(a["codex-pool"].found, true);
    assert.equal(a["codex-pool"].version, "codex-cli 0.163.0", "codex-pool shows the codex it drives");
    assert.equal(a["codex-pool"].logged_in, true);
    assert.equal(a.agy.version, "1.4.5");
    assert.equal(a.agy.logged_in, true);
    assert.deepEqual(a.agy.models, ["gemini-4-argon-medium", "claude-opus-5-5-low"]);
    assert.equal(a.opencode.version, "v2.0.32");
    assert.equal(a.opencode.method, "2 provider");
    for (const id of ["gemini", "cursor-agent", "goose", "hermes"]) assert.equal(a[id].found, false, id);
    assert.deepEqual(a.claude.caps, { text: "yes", vision: "yes", image: "no" });
    assert.deepEqual(a.agy.caps, { text: "yes", vision: "unknown", image: "unknown" });
    assert.deepEqual(scan.order.image, ["codex-pool", "codex", "agy", "gemini"]);
    assert.deepEqual(summarize(scan).find((x) => x.id === "claude"), { id: "claude", label: "Claude Code", found: true, version: "2.1.304", logged_in: true, caps: a.claude.caps, error: undefined });
  } finally { f.rm(); }
});

test("codex-pool status gives per-account quota for OK and exhausted accounts", async () => {
  const ok = parseStatus("acct1: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)\nacct2: OK   ok; no usage data yet\npin=auto -> next: acct2\n");
  assert.deepEqual(ok.accounts[0], { name: "acct1", state: "OK", ok: true, reason: "ok", h5: 38, reset_h5: "22/10 20:47", week: 12, reset_week: "29/10 10:36" });
  assert.equal(ok.accounts[1].h5, null);
  assert.equal(ok.next, "acct2");
  assert.equal(ok.pin, "auto");
  const f = fakeAgents({ vars: { FAKE_POOL: "exhausted" } });
  try {
    const pool = byId(await listAgents({ env: f.env, refresh: true }))["codex-pool"];
    assert.equal(pool.quota.accounts.length, 2);
    assert.deepEqual(pool.quota.accounts.map((x) => [x.name, x.ok, x.h5, x.week]), [["acct1", false, 100, 40], ["acct2", false, null, null]]);
    assert.equal(pool.quota.accounts[0].reason, "exhausted until 24/10 03:00");
    assert.equal(pool.quota.next, null);
    assert.equal(pool.logged_in, true, "one account still has a login");
  } finally { f.rm(); }
  assert.equal(parseStatus("nothing here"), null);
  assert.deepEqual(parseModels("a-1\tA One\nFetching available models...\n"), [{ id: "a-1", name: "A One" }]);
});

test("a broken shim is found with an error and the other CLIs are still listed", async () => {
  const f = fakeAgents({ only: ["claude"], broken: ["hermes"] });
  f.link("goose", `${f.dir}/missing-goose`);
  try {
    const a = byId(await listAgents({ env: f.env, refresh: true }));
    assert.equal(a.hermes.found, true);
    assert.match(a.hermes.error, /exit \d+/);
    assert.equal(a.goose.found, true, "a dangling symlink is a broken install, not a missing one");
    assert.match(a.goose.error, /không chạy được/);
    assert.equal(a.claude.found, true);
    assert.equal(a.claude.error, null);
  } finally { f.rm(); }
});

test("a CLI that hangs past its timeout is killed and reported as timeout", async () => {
  const f = fakeAgents({ only: [], slow: ["slowcli"] });
  try {
    const t0 = Date.now();
    const d = await detectBin(["slowcli"], { env: f.env, timeout: 300 });
    assert.deepEqual([d.found, d.error], [true, "timeout"]);
    assert.ok(Date.now() - t0 < 5000, "killed well before the script's own 30 s");
    const r = await exec(which("slowcli", f.env).path, [], { env: f.env, timeout: 200 });
    assert.equal(r.timedOut, true);
    assert.equal(r.error, "timeout");
  } finally { f.rm(); }
});

test("secrets in CLI output never reach the scan result", async () => {
  const f = fakeAgents();
  try {
    const text = JSON.stringify(await listAgents({ env: f.env, refresh: true }));
    assert.doesNotMatch(text, /sk-ant-fake|eyJhbGci|someone@example\.com|me@example\.com/);
    assert.ok(text.includes(MASK), "the auth method the fake claude reports is masked, not dropped silently");
  } finally { f.rm(); }
  assert.equal(redact("Bearer abcdefghijklmnop and ghp_0123456789abcdefABCDEF and ya29.a0AfH6SMBxxxxxxxxxx"), `${MASK} and ${MASK} and ${MASK}`);
  assert.equal(redact('"api_key": "0123456789abcdef0123456789abcdef01"'), `"api_key": "${MASK}"`);
  assert.equal(redact("plain words 12% ok"), "plain words 12% ok");
});

test("firstJson reads a fenced block, a bare object or one inside text", () => {
  assert.deepEqual(firstJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(firstJson('The answer is {"b":"x}y"} done'), { b: "x}y" });
  assert.deepEqual(firstJson("[1,2]"), [1, 2]);
  assert.equal(firstJson("no json"), null);
});
