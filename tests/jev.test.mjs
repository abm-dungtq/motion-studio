import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_URL, MODEL, ask, readKey } from "../lib/jev.mjs";

const KEY = "test-key";
const noSleep = async () => {};
const results = [];

// A fetch that replays the given responses in order and records every call.
function fakeFetch(steps) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const s = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (s instanceof Error) throw s;
    return new Response(typeof s.body === "string" ? s.body : JSON.stringify(s.body ?? {}), { status: s.status ?? 200 });
  };
  fn.calls = calls;
  return fn;
}
const named = (name) => Object.assign(new Error(name), { name });
const OK_BODY = { answers: { q: { score: 3 } }, usage: {} };

async function run(steps, opts = {}) {
  const fetchImpl = fakeFetch(steps);
  const r = await ask({ state: { a: 1 }, questions: { q: { type: "score" } } }, { key: KEY, fetchImpl, sleep: noSleep, ...opts });
  results.push(r);
  return { r, calls: fetchImpl.calls };
}

test("readKey: the environment wins over the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-key-"));
  try {
    const f = join(dir, ".env");
    writeFileSync(f, "OTHER=1\nX_KEY=\"abc\"\n");
    assert.equal(readKey({ env: { X_KEY: "from-env" }, keyVar: "X_KEY", envFile: f }), "from-env");
    assert.equal(readKey({ env: {}, keyVar: "X_KEY", envFile: f }), "abc");
    writeFileSync(f, "  X_KEY = 'single'  \n");
    assert.equal(readKey({ env: {}, keyVar: "X_KEY", envFile: f }), "single");
    assert.equal(readKey({ env: {}, keyVar: "MISSING", envFile: f }), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readKey: no file and no variable give an empty key", () => {
  assert.equal(readKey({ env: {}, keyVar: "X_KEY", envFile: join(tmpdir(), "no-such-dir", ".env") }), "");
  assert.equal(readKey({ env: { X_KEY: "v" }, keyVar: "" }), "");
});

test("ask without a key fails at once and never calls fetch", async () => {
  const fetchImpl = fakeFetch([{ body: OK_BODY }]);
  const r = await ask({ questions: {} }, { key: "", fetchImpl, sleep: noSleep });
  results.push(r);
  assert.equal(r.ok, false);
  assert.equal(r.error, "no-key");
  assert.equal(fetchImpl.calls.length, 0);
});

test("ask returns the answers of a 200 and sends the bearer key, model and body", async () => {
  const { r, calls } = await run([{ body: OK_BODY }]);
  assert.equal(r.ok, true);
  assert.equal(r.data.answers.q.score, 3);
  assert.equal(typeof r.ms, "number");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, MODEL);
  assert.deepEqual(body.state, { a: 1 });
});

test("ask does not retry a 401", async () => {
  const { r, calls } = await run([{ status: 401, body: { error: "no" } }, { body: OK_BODY }]);
  assert.equal(r.ok, false);
  assert.equal(r.error, "http");
  assert.equal(r.status, 401);
  assert.equal(calls.length, 1);
});

test("ask retries a 529 and returns the next 200", async () => {
  const { r, calls } = await run([{ status: 529 }, { body: OK_BODY }]);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
});

test("ask gives up on a 503 after the retry and names the status", async () => {
  const { r, calls } = await run([{ status: 503 }, { status: 503 }]);
  assert.equal(r.ok, false);
  assert.equal(r.error, "http");
  assert.equal(r.status, 503);
  assert.equal(calls.length, 2);
});

test("ask reports a timeout without retrying", async () => {
  const { r, calls } = await run([named("TimeoutError"), { body: OK_BODY }]);
  assert.equal(r.ok, false);
  assert.equal(r.error, "timeout");
  assert.equal(calls.length, 1);
});

test("ask retries a network error once, then reports it", async () => {
  const { r, calls } = await run([new TypeError("fetch failed"), new TypeError("fetch failed")]);
  assert.equal(r.ok, false);
  assert.equal(r.error, "network");
  assert.equal(calls.length, 2);
});

test("ask reports a body that is not JSON, or has no answers, as malformed", async () => {
  assert.equal((await run([{ body: "<html>oops" }])).r.error, "malformed");
  assert.equal((await run([{ body: { usage: {} } }])).r.error, "malformed");
});

test("no result of ask carries the key", () => {
  assert.ok(results.length >= 9);
  for (const r of results) assert.ok(!JSON.stringify(r).includes(KEY), JSON.stringify(r));
});
