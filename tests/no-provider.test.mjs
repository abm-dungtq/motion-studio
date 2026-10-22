import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";

// The default adapter is pointed at an empty folder: Studio has no provider at all.
const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const TOKEN = "n".repeat(64);
const A = await adapterFor({});
let root, empty, server, port, saved;

before(async () => {
  saved = process.env.OPUS_VIDEO_HOME;
  empty = mkdtempSync(join(tmpdir(), "no-provider-"));
  process.env.OPUS_VIDEO_HOME = empty;
  root = mkdtempSync(join(tmpdir(), "studio-np-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true }); rmSync(empty, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
});

function http(method, path, { body, token } = {}) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}

test("without a provider the server starts, serves the page and says why", async () => {
  const page = await http("GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>Motion Studio<\/title>/);
  assert.ok(page.text.includes(TOKEN));
  const st = await http("GET", "/api/status");
  assert.equal(st.status, 200);
  assert.equal(st.json.ok, false);
  assert.equal(st.json.provider, null);
  assert.equal(st.json.code, "NO_PROVIDER");
  assert.ok(st.json.error.includes(empty), st.json.error);
  assert.equal(st.json.hint, A.HINT);
  assert.equal(st.json.setup, "npm run setup");
  const agent = await http("GET", "/api/agent");
  assert.equal(agent.status, 200);
  assert.equal(agent.json.provider, null);
  assert.equal(agent.json.provider_error.code, "NO_PROVIDER");
});

test("routes that need a provider answer 503 with the reason; the rest still work", async () => {
  const list = await http("GET", "/api/projects");
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.map((p) => [p.name, p.has_manifest, p.editable]), [["demo", true, false]]);
  for (const path of ["/api/project?name=demo", "/api/log?name=demo", "/api/requests?name=demo", "/api/gates?name=demo"]) {
    const r = await http("GET", path);
    assert.equal(r.status, 503, path);
    assert.equal(r.json.provider, null, path);
    assert.match(r.json.error, /^Chưa có provider/, path);
  }
  const patch = await http("POST", "/api/patch", { body: { name: "demo", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] }, token: TOKEN });
  assert.equal(patch.status, 503);
  assert.equal((await http("POST", "/api/patch", { body: { name: "demo" } })).status, 403, "the token check comes first");
  assert.deepEqual((await http("GET", "/api/directions")).json, { seams: [], directions: [] });
  assert.deepEqual((await http("GET", "/api/cases?q=x")).json, []);
  const scenes = await http("GET", "/api/library?kind=scenes&limit=100");
  assert.equal(scenes.status, 200);
  assert.ok(scenes.json.items.every((s) => s.source === "library"));
  assert.equal((await http("GET", "/api/settings")).status, 200);
});
