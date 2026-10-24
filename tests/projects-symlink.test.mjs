// A project folder kept outside the root and linked into it is listed and served like one inside.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
let tmp, server, port;

before(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-symlink-")));
  const root = join(tmp, "root");
  const elsewhere = join(tmp, "series-episodes");
  mkdirSync(root);
  mkdirSync(elsewhere);
  cpSync(FIXTURE, join(root, "here"), { recursive: true });
  cpSync(FIXTURE, join(elsewhere, "ep-02"), { recursive: true });
  symlinkSync(join(elsewhere, "ep-02"), join(root, "linked"));
  symlinkSync(join(tmp, "missing"), join(root, "broken"));
  symlinkSync(join(FIXTURE, "index.html"), join(root, "a-file"));
  server = createServer({ root, token: "s".repeat(64), runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => { server.closeAllConnections?.(); server.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (path) => new Promise((res, rej) => {
  const req = request({ host: "127.0.0.1", port, method: "GET", path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  req.end();
});

test("a symlink to a project folder is listed; a broken link and a link to a file are not", async () => {
  const r = await get("/api/projects");
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.map((p) => p.name), ["here", "linked"]);
  assert.ok(r.json.every((p) => p.has_manifest));
});

test("files of the linked project are served", async () => {
  assert.equal((await get("/p/linked/index.html")).status, 200);
  assert.equal((await get("/p/here/index.html")).status, 200);
  assert.equal((await get("/p/broken/index.html")).status, 404);
});
