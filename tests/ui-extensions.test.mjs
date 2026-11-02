import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";

const get = (port, path) => new Promise((res, rej) => {
  const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, text: s, json: (() => { try { return JSON.parse(s); } catch { return null; } })() }));
  });
  req.on("error", rej); req.end();
});

test("the old extension loader is gone: /api/extensions and /ext.js are not served", async () => {
  const saved = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  const root = mkdtempSync(join(tmpdir(), "ms-ext-root-"));
  const server = createServer({ root, token: "e".repeat(64), runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    assert.notEqual((await get(port, "/api/extensions")).status, 200, "no route answers it any more");
    assert.equal((await get(port, "/ext.js")).status, 404);
  } finally {
    server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true });
    if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
  }
});

test("the agent table shows codex-pool quota per account and the next account, never more", async () => {
  const { poolLines } = await import("../ui/src/core/pool-lines.ts");
  assert.deepEqual(poolLines({ accounts: [{ name: "acct1", ok: true, h5: 38, week: 12 }, { name: "acct2", ok: true, h5: null, week: null }], next: "acct2" }), ["acct1 5h 38% · tuần 12%", "acct2 chưa dùng", "kế tiếp: acct2"]);
  assert.deepEqual(poolLines({ accounts: [{ name: "acct1", ok: false, h5: 100, week: 40 }], next: null }), ["acct1 5h 100% · tuần 40% · hết lượt"]);
  assert.deepEqual(poolLines(null), []);
});
