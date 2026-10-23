import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { BUILTIN, createServer, transitionItems } from "../server.mjs";
import { loadRoutes } from "../lib/routes.mjs";
import { callTool, checkArgs, insideProject, loadTools, studioClient, toolEnv } from "../lib/tools.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

// The provider is a fake plugin with its own directions file, so the test never depends on the
// installed one.
const A = await adapterFor({});
const TOKEN = "r".repeat(64);
let root, plugin, server, port, saved, extDir;

// A routes folder with the given modules ({ "a.mjs": "source" }).
const routesDir = (files) => {
  const d = mkdtempSync(join(tmpdir(), "ms-routes-"));
  for (const [f, src] of Object.entries(files)) writeFileSync(join(d, f), src);
  return d;
};
const EXT = `export const ROUTES = [
  { method: "GET", path: "/api/hello", handler: (c) => ({ hi: c.q("who"), provider: Boolean(c.P) }) },
  { method: "GET", path: "/api/free", provider: false, handler: (c) => c.send(200, { free: true, provider: Boolean(c.P) }) },
  { method: "POST", path: "/api/echo", handler: (c) => ({ got: c.body.x }) },
  { method: "GET", path: "/api/tree", prefix: true, handler: (c) => ({ rest: c.url.pathname.slice("/api/tree/".length) }) },
  { method: "GET", path: "/api/boom", handler: () => { throw Object.assign(new Error("nope"), { status: 418 }); } },
];`;

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
  extDir = routesDir({ "a-ext.mjs": EXT });
  server = createServer({ root, token: TOKEN, runtime: null, routes: await loadRoutes(extDir) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true }); rmSync(extDir, { recursive: true, force: true });
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

test("an extension route answers after the built-in ones: returned value, c.send, POST body, prefix, thrown status", async () => {
  assert.deepEqual((await http("GET", "/api/hello?who=an")).json, { hi: "an", provider: true });
  assert.deepEqual((await http("GET", "/api/free")).json, { free: true, provider: true });
  assert.deepEqual((await http("POST", "/api/echo", { body: { x: 7 }, token: TOKEN })).json, { got: 7 });
  assert.deepEqual((await http("GET", "/api/tree/a/b")).json, { rest: "a/b" });
  const boom = await http("GET", "/api/boom");
  assert.equal(boom.status, 418);
  assert.equal(boom.json.error, "nope");
  assert.equal((await http("GET", "/api/nothing-here")).status, 404);
  assert.equal((await http("POST", "/api/hello", { body: {}, token: TOKEN })).status, 404, "a GET route does not answer POST");
});

test("a POST to an extension route without the token is 403 before anything else", async () => {
  const r = await http("POST", "/api/echo", { body: { x: 1 } });
  assert.equal(r.status, 403);
});

test("provider: false keeps answering without a provider; other extension routes answer 503", async () => {
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  try {
    const free = await http("GET", "/api/free");
    assert.equal(free.status, 200);
    assert.deepEqual(free.json, { free: true, provider: false });
    const r = await http("GET", "/api/hello");
    assert.equal(r.status, 503);
    assert.equal(r.json.code, "NO_PROVIDER");
  } finally { process.env.OPUS_VIDEO_HOME = plugin; }
});

test("a path that repeats a built-in or another extension route makes createServer throw", async () => {
  const cases = [
    `export const ROUTES = [{ method: "POST", path: "/api/agent", handler: () => 1 }];`,
    `export const ROUTES = [{ method: "GET", path: "/api/director", prefix: true, handler: () => 1 }];`,
    `export const ROUTES = [{ method: "GET", path: "/api/x", handler: () => 1 }, { method: "GET", path: "/api/x", handler: () => 2 }];`,
  ];
  for (const src of cases) {
    const d = routesDir({ "x.mjs": src });
    try {
      const routes = await loadRoutes(d);
      assert.throws(() => createServer({ root, token: TOKEN, runtime: null, routes }), /trùng/, src);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
  const bad = routesDir({ "y.mjs": `export const ROUTES = [{ method: "GET", path: "/p/x", handler: () => 1 }];` });
  try { await assert.rejects(loadRoutes(bad), /\/api\//); } finally { rmSync(bad, { recursive: true, force: true }); }
  assert.deepEqual(await loadRoutes(join(tmpdir(), "ms-routes-none")), [], "a missing folder has no routes");
});

test("BUILTIN lists exactly the paths server.mjs answers itself", () => {
  const src = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function route("), src.indexOf("const server = httpServer("));
  const used = new Set([...body.matchAll(/\bp === "(\/[^"]*)"/g)].map((m) => m[1]));
  assert.ok(used.size > 20, "the route() body was found");
  assert.deepEqual([...new Set(BUILTIN)].sort(), [...used].sort());
  assert.equal(new Set(BUILTIN).size, BUILTIN.length);
});

test("tools load from lib/tools/, arguments are checked against inputSchema before a tool runs", async () => {
  const names = (await loadTools()).map((t) => t.name);
  for (const n of ["agents_list", "image_generate", "image_describe"]) assert.ok(names.includes(n), n);
  const d = routesDir({
    "a.mjs": `export const TOOLS = [{ name: "echo_args", inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, n: { type: "integer" }, tags: { type: "array", items: { type: "string" } }, mode: { type: "string", enum: ["a", "b"] } } }, run: (a, env) => ({ a, root: env.root }) },
      { name: "needs_p", provider: true, inputSchema: { type: "object" }, run: () => 1 }];`,
  });
  try {
    assert.deepEqual(await callTool("echo_args", { text: "hi", n: 2 }, { root: "/r" }, { dir: d }), { ok: true, result: { a: { text: "hi", n: 2 }, root: "/r" } });
    assert.match((await callTool("echo_args", {}, {}, { dir: d })).error, /thiếu text/);
    assert.match((await callTool("echo_args", { text: 1 }, {}, { dir: d })).error, /text phải là string/);
    assert.match((await callTool("echo_args", { text: "x", n: 1.5 }, {}, { dir: d })).error, /n phải là integer/);
    assert.match((await callTool("echo_args", { text: "x", tags: ["a", 2] }, {}, { dir: d })).error, /tags\[1\]/);
    assert.match((await callTool("echo_args", { text: "x", mode: "c" }, {}, { dir: d })).error, /mode/);
    assert.match((await callTool("needs_p", {}, {}, { dir: d })).error, /cần provider/);
    assert.match((await callTool("nope", {}, {}, { dir: d })).error, /không có tool/);
    assert.equal(checkArgs({ type: "object" }, []), "đối số phải là một object");
  } finally { rmSync(d, { recursive: true, force: true }); }
  const dup = routesDir({ "a.mjs": `export const TOOLS = [{ name: "same_one", inputSchema: { type: "object" }, run: () => 1 }];`, "b.mjs": `export const TOOLS = [{ name: "same_one", inputSchema: { type: "object" }, run: () => 1 }];` });
  try { await assert.rejects(loadTools(dup), /trùng tên/); } finally { rmSync(dup, { recursive: true, force: true }); }
});

test("studioClient reaches the running Studio with its token and says so when there is none", async () => {
  const c = studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } });
  assert.deepEqual(await c.post("/api/echo", { x: 3 }), { got: 3 });
  assert.deepEqual(await c.get("/api/hello?who=b"), { hi: "b", provider: true });
  await assert.rejects(c.get("/api/boom"), (e) => e.status === 418 && e.message === "nope");
  await assert.rejects(studioClient({ state: null }).get("/api/agents"), /Studio chưa chạy/);
  await assert.rejects(studioClient({ state: { url: "http://127.0.0.1:9/", token: "x" } }).get("/api/agents"), /Studio chưa chạy/);
  const env = toolEnv({ root, studio: c });
  assert.throws(() => env.projectDir("../x"), /không hợp lệ/);
  assert.throws(() => env.projectDir("missing"), /không có dự án/);
  mkdirSync(join(root, "pj", "assets"), { recursive: true });
  assert.equal(insideProject(join(root, "pj"), "assets/a.png", "out"), join(root, "pj", "assets", "a.png"));
  for (const bad of ["../a.png", "/etc/a.png", ".opus/a.png", "assets/../../a.png", ""]) assert.throws(() => insideProject(join(root, "pj"), bad, "out"), /out/, bad);
});
