import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { listExtensions } from "../routes/extensions.mjs";
import { PUBLIC_FILE } from "../lib/routes.mjs";

const get = (port, path) => new Promise((res, rej) => {
  const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, text: s, json: (() => { try { return JSON.parse(s); } catch { return null; } })() }));
  });
  req.on("error", rej); req.end();
});

test("listExtensions keeps only ext-*.js / ext-*.css names the static route serves", () => {
  const d = mkdtempSync(join(tmpdir(), "ms-public-"));
  try {
    for (const f of ["ext-anime.js", "ext-anime.css", "ext-b-roll.js", "ext.js", "app.js", "ext-Bad.js", "ext-v2.js", "ext-x.mjs", "ext_y.js", ".ext-hidden.js"]) writeFileSync(join(d, f), "");
    mkdirSync(join(d, "ext-dir.js"));
    assert.deepEqual(listExtensions(d), { scripts: ["/ext-anime.js", "/ext-b-roll.js"], styles: ["/ext-anime.css"] });
    assert.deepEqual(listExtensions(join(d, "missing")), { scripts: [], styles: [] });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("GET /api/extensions answers without a provider and every listed file is served", async () => {
  const saved = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  const root = mkdtempSync(join(tmpdir(), "ms-ext-root-"));
  const server = createServer({ root, token: "e".repeat(64), runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r = await get(port, "/api/extensions");
    assert.equal(r.status, 200);
    assert.ok(r.json.scripts.includes("/ext-agents.js"), JSON.stringify(r.json));
    assert.ok(!r.json.scripts.includes("/ext.js"), "the loader itself is not an extension");
    for (const f of [...r.json.scripts, ...r.json.styles]) {
      assert.match(f, PUBLIC_FILE);
      assert.equal((await get(port, f)).status, 200, f);
    }
    const loader = await get(port, "/ext.js");
    assert.equal(loader.status, 200);
    assert.match(loader.text, /export async function loadExtensions/);
  } finally {
    server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true });
    if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
  }
});

test("every public/ file name is one the static route serves", () => {
  const dir = new URL("../public/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => /\.(js|css)$/.test(x))) assert.match(`/${f}`, PUBLIC_FILE, f);
});
