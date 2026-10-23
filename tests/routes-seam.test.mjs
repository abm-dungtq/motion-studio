import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer, transitionItems } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

// The provider is a fake plugin with its own directions file, so the test never depends on the
// installed one.
const A = await adapterFor({});
const TOKEN = "r".repeat(64);
let root, plugin, server, port, saved;

const DIRECTIONS = {
  seam_classes: { banned: ["fade", "dissolve"] },
  seams: [{ id: "zoom-through", kind: "cut-catalog", heading: "Zoom-Through" }, { id: "whip-pan", kind: "motion" }, { id: "fade", kind: "x" }],
  directions: [{ id: "d1", ten_vi: "Một", mo_ta_vi: "mô tả", seams: ["whip-pan"] }],
};

before(async () => {
  saved = process.env.OPUS_VIDEO_HOME;
  plugin = fakePlugin({ schema: A.NEED.schema, api: 3 });
  mkdirSync(join(plugin, "data"));
  writeFileSync(join(plugin, "data", "directions.json"), JSON.stringify(DIRECTIONS));
  process.env.OPUS_VIDEO_HOME = plugin;
  root = mkdtempSync(join(tmpdir(), "studio-routes-"));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
});

function http(method, path, { body, token, p = port } = {}) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port: p, method, path, headers: { host: `127.0.0.1:${p}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}

test("/api/directions lists transition ids, not array indexes, and leaves banned ones out", async () => {
  const r = await http("GET", "/api/directions");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.seams, ["zoom-through", "whip-pan"]);
  assert.deepEqual(r.json.seam_items, [{ id: "zoom-through", kind: "cut-catalog" }, { id: "whip-pan", kind: "motion" }]);
  assert.equal(r.json.directions[0].id, "d1");
});

test("transitionItems still reads an older directions file keyed by id", () => {
  assert.deepEqual(transitionItems({ seams: { a: { kind: "k" }, fade: {} }, seam_classes: { banned: ["fade"] } }), [{ id: "a", kind: "k" }]);
  assert.deepEqual(transitionItems({}), []);
});
