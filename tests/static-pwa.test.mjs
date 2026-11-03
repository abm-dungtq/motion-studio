// The install manifest and its icons are files of the UI build (Vite copies ui/public into
// ui/dist): GET /manifest.webmanifest and GET /icons/<file> serve them from <ui>, and nothing
// outside <ui>/icons. ui/public itself stands in for the build here.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";

const UI = fileURLToPath(new URL("../ui/public", import.meta.url));
let server, root, port;

function get(path) {
  return new Promise((res, rej) => {
    const req = request({ host: "127.0.0.1", port, method: "GET", path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c)); r.on("end", () => res({ status: r.statusCode, type: r.headers["content-type"] ?? "", body: Buffer.concat(chunks) }));
    });
    req.on("error", rej);
    req.end();
  });
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), "static-pwa-root-"));
  server = createServer({ root, token: "p".repeat(64), runtime: null, ui: UI });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.();
  server.close();
  rmSync(root, { recursive: true, force: true });
});

test("GET /manifest.webmanifest is the standalone app manifest", async () => {
  const r = await get("/manifest.webmanifest");
  assert.equal(r.status, 200);
  assert.equal(r.type, "application/manifest+json");
  const m = JSON.parse(r.body.toString("utf8"));
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.deepEqual(m.icons.map((i) => i.sizes), ["192x192", "512x512", "512x512"]);
  assert.equal(m.icons.find((i) => i.purpose === "maskable")?.src, "/icons/icon-maskable-512.png");
});

test("GET /icons/<file> serves the PNG icons", async () => {
  for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    const r = await get(`/icons/${f}`);
    assert.equal(r.status, 200, f);
    assert.equal(r.type, "image/png", f);
    assert.equal(r.body.subarray(1, 4).toString("ascii"), "PNG", f);
  }
});

test("GET /icons/ serves nothing outside the icons folder", async () => {
  for (const p of ["/icons/../server.mjs", "/icons/..%2F..%2Fserver.mjs", "/icons/%2e%2e/manifest.webmanifest", "/icons/nope.png", "/icons/", "/icons/a/b.png"]) {
    const r = await get(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.body.toString("utf8").includes("import "), p);
  }
});
