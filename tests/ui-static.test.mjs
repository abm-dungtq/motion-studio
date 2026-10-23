// The page is the Vite output of ui/: GET / reads <ui>/index.html and injects the run token,
// GET /assets/<file> serves its files and nothing outside <ui>/assets, and a missing page is a
// 503 that says what to run. These are static files, so BUILTIN (the API surface) stays as it was.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { BUILTIN, createServer } from "../server.mjs";

const UI = fileURLToPath(new URL("./fixtures/ui-dist", import.meta.url));
const TOKEN = "u".repeat(64);
const servers = [];
let root, outside, port;

async function start(opts) {
  const server = createServer({ root, token: TOKEN, runtime: null, ...opts });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return server.address().port;
}

function get(at, path) {
  return new Promise((res, rej) => {
    const req = request({ host: "127.0.0.1", port: at, method: "GET", path, headers: { host: `127.0.0.1:${at}` } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, type: r.headers["content-type"] ?? "", text: s }));
    });
    req.on("error", rej);
    req.end();
  });
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), "ui-static-root-"));
  outside = mkdtempSync(join(tmpdir(), "ui-static-out-"));
  port = await start({ ui: UI });
});
after(() => {
  for (const s of servers) { s.closeAllConnections?.(); s.close(); }
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test("GET / is the UI page with the run token", async () => {
  const r = await get(port, "/");
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.ok(r.text.includes(`content="${TOKEN}"`));
  assert.ok(!r.text.includes("__STUDIO_TOKEN__"));
  assert.ok(r.text.includes("<title>Motion Studio</title>"));
});

test("GET /assets/<file> serves the UI's files as JavaScript", async () => {
  const r = await get(port, "/assets/app-test.js");
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/javascript/);
  assert.equal(r.text.trim(), "export const ok = 1;");
});

test("GET /assets/ answers 404 for a missing file or a bad name", async () => {
  for (const p of ["/assets/nope.js", "/assets/", "/assets/a/b.js", "/assets/a%2Fb.js", "/assets/x%00.js"]) {
    assert.equal((await get(port, p)).status, 404, p);
  }
});

// The server refuses any dot segment of the decoded path (403) before a route runs, so a way out
// of assets never reaches the /assets/ branch; either way the page is not served.
test("GET /assets/ with a dot segment is refused and serves nothing", async () => {
  for (const p of ["/assets/..%2Findex.html", "/assets/../index.html", "/assets/%2e%2e/index.html", "/assets/.."]) {
    const r = await get(port, p);
    assert.equal(r.status, 403, p);
    assert.ok(!r.text.includes('<div id="root">'), p);
  }
});

test("GET /assets/ does not follow a file link out of the assets folder", async () => {
  const ui = mkdtempSync(join(tmpdir(), "ui-static-link-"));
  try {
    writeFileSync(join(ui, "index.html"), "<title>Motion Studio</title>");
    writeFileSync(join(outside, "secret.js"), "export const s = 1;");
    mkdirSync(join(ui, "assets"));
    writeFileSync(join(ui, "assets", "own.js"), "export const o = 1;");
    symlinkSync(join(outside, "secret.js"), join(ui, "assets", "leak.js"));
    const at = await start({ ui });
    assert.equal((await get(at, "/assets/own.js")).status, 200);
    assert.equal((await get(at, "/assets/leak.js")).status, 404);
  } finally { rmSync(ui, { recursive: true, force: true }); }
});

test("without a UI page GET / answers 503 and says to run setup", async () => {
  const empty = mkdtempSync(join(tmpdir(), "ui-static-empty-"));
  try {
    const at = await start({ ui: empty });
    const r = await get(at, "/");
    assert.equal(r.status, 503);
    assert.match(r.text, /npm run setup/);
    assert.equal((await get(at, "/assets/app-test.js")).status, 404);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("BUILTIN is unchanged: serving the UI adds no API path", () => {
  assert.deepEqual(BUILTIN, ["/", "/index.html", "/hf/runtime.js",
    "/api/projects", "/api/status", "/api/project", "/api/log", "/api/requests", "/api/agent", "/api/media/browse", "/api/media", "/api/jobs",
    "/api/settings", "/api/files", "/api/sounds", "/api/gates", "/api/directions", "/api/library", "/api/cases", "/api/styles", "/api/events",
    "/api/import", "/api/patch", "/api/undo", "/api/redo", "/api/director", "/api/projects/new", "/api/media/register", "/api/sounds/import",
    "/api/director/answer", "/api/director/cancel", "/api/jobs/cancel", "/api/export", "/api/bundle"]);
  assert.equal(BUILTIN.length, 34);
});
