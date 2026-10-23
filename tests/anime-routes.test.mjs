import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { callTool, toolEnv } from "../lib/tools.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/anime/zoro-manifest.json", import.meta.url));
const TOKEN = "n".repeat(64);
let root, server, port, saved;

function call(method, path, body, token = TOKEN) {
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
async function waitJob(name, id) {
  for (let i = 0; i < 200; i++) {
    const j = (await call("GET", `/api/jobs?name=${name}`)).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`job ${id} did not end`);
}

// A project laid out like zoro-vs-mihawk: no project.json, the Zoro manifest, a TIMING block, plates.
function zoroLike(name) {
  const d = join(root, name);
  mkdirSync(join(d, "assets", "anim"), { recursive: true });
  mkdirSync(join(d, "assets", "plates", "anim"), { recursive: true });
  mkdirSync(join(d, "assets", "chars"), { recursive: true });
  copyFileSync(FIXTURE, join(d, "assets", "anim", "manifest.json"));
  const scenes = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`s${i + 1}`, { start: i, end: i + 1 }]));
  writeFileSync(join(d, "index.html"), `<script>/* TIMING:BEGIN */\nwindow.TIMING = ${JSON.stringify({ fps: 30, scenes })};\n/* TIMING:END */</script>\n`);
  for (const f of ["s1-bg.png", "s1-zoro.png", "s3-full.png", "s10-bg.png"]) writeFileSync(join(d, "assets", "plates", f), "");
  for (const f of ["s1-zoro-w1.png", "s2-k1.png"]) writeFileSync(join(d, "assets", "plates", "anim", f), "");
  writeFileSync(join(d, "assets", "chars", "zoro-sheet.png"), "");
  return d;
}

before(async () => {
  saved = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  root = mkdtempSync(join(tmpdir(), "ms-anime-routes-"));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
});

test("the board works without project.json: shots come from the manifest, in TIMING order", async () => {
  zoroLike("zoro");
  const r = await call("GET", "/api/anime/board?name=zoro");
  assert.equal(r.status, 200, r.text);
  const b = r.json;
  assert.equal(b.source, "manifest");
  assert.match(b.note, /chưa nhập project\.json/);
  const want = [...new Set(Object.values(JSON.parse(readFileSync(FIXTURE, "utf8")).stacks).map((s) => s.shot))];
  assert.deepEqual(b.shots.map((s) => s.id), want);
  const s1 = b.shots.find((s) => s.id === "s1");
  assert.equal(s1.thumb, "assets/plates/s1-bg.png");
  assert.deepEqual(s1.plates, ["assets/plates/s1-bg.png", "assets/plates/s1-zoro.png"]);
  assert.equal(s1.status, "animated");
  assert.equal(b.shots.find((s) => s.id === "s10").plates.length, 1, "s1- does not take s10- files");
  assert.equal(b.shots.find((s) => s.id === "s3").thumb, "assets/plates/s3-full.png");
  assert.deepEqual(b.chars.map((c) => [c.id, c.unregistered]), [["zoro", true]], "a sheet without chars.json still shows");
  assert.equal(b.enabled, false);
});

test("with project.json the board shows its shots and derives every column from files", async () => {
  const d = join(root, "pj");
  mkdirSync(join(d, "assets", "plates", "anim"), { recursive: true });
  writeFileSync(join(d, "project.json"), JSON.stringify({ shots: [{ id: "s1", name: "Mở", start: 0, end: 2 }, { id: "s2", start: 2, end: 3 }, { id: "s3", start: 3, end: 4 }] }));
  writeFileSync(join(d, "assets", "plates", "s2-bg.png"), "");
  writeFileSync(join(d, "assets", "plates", "s3-bg.png"), "");
  writeFileSync(join(d, "assets", "plates", "anim", "s3-k1.png"), "");
  const b = (await call("GET", "/api/anime/board?name=pj")).json;
  assert.equal(b.source, "project");
  assert.equal(b.note, null);
  assert.deepEqual(b.shots.map((s) => [s.id, s.status, s.start]), [["s1", "missing", 0], ["s2", "plate", 2], ["s3", "variants", 3]]);
  assert.deepEqual(b.columns.map((c) => c.id), ["missing", "plate", "variants", "animated"]);
});

test("a bad project name is 400, an unknown one 404, a POST without token 403", async () => {
  assert.equal((await call("GET", "/api/anime/board?name=..%2Fetc")).status, 400);
  assert.equal((await call("GET", "/api/anime/board?name=")).status, 400);
  assert.equal((await call("GET", "/api/anime/manifest?name=nope")).status, 404);
  for (const p of ["/api/anime/chars", "/api/anime/variant", "/api/anime/manifest", "/api/anime/enable", "/api/anime/rebuild"]) {
    assert.equal((await call("POST", p, { name: "zoro" }, null)).status, 403, p);
  }
});

test("characters: add, list, refuse a bad id, remove", async () => {
  const add = await call("POST", "/api/anime/chars", { name: "pj", char: { id: "hero", name: "Hero", key_color: "0x004cfe", palette: ["#ff0000"], notes: "áo đỏ" } });
  assert.equal(add.status, 200, add.text);
  assert.deepEqual(add.json.char, { id: "hero", name: "Hero", sheet: null, key_color: "#004CFE", notes: "áo đỏ", palette: ["#FF0000"] });
  assert.equal((await call("POST", "/api/anime/chars", { name: "pj", char: { id: "Bad Id" } })).status, 400);
  assert.equal((await call("POST", "/api/anime/chars", { name: "pj", char: { id: "x", sheet: "../x.png" } })).status, 400);
  assert.equal((await call("GET", "/api/anime/chars?name=pj")).json.chars.length, 1);
  const rm = await call("POST", "/api/anime/chars", { name: "pj", remove: "hero" });
  assert.equal(rm.json.removed, true);
  assert.deepEqual(rm.json.chars, []);
  assert.equal((await call("POST", "/api/anime/chars", { name: "pj", generate: { id: "hero" } })).status, 404);
});

test("manifest: enable, write with base_sha, build job with its WARN lines, 409 on a stale sha", async () => {
  const d = join(root, "anim");
  mkdirSync(d);
  writeFileSync(join(d, "index.html"), '<div id="s1-hero"></div><script>/* TIMING:BEGIN */\nwindow.TIMING = {"fps":30,"scenes":{"s1":{"start":0,"end":1}}};\n/* TIMING:END */</script>\n');
  const g0 = await call("GET", "/api/anime/manifest?name=anim");
  assert.deepEqual([g0.json.exists, g0.json.enabled], [false, false]);
  assert.equal((await call("POST", "/api/anime/rebuild", { name: "anim" })).status, 404, "nothing to build before enable");
  const en = await call("POST", "/api/anime/enable", { name: "anim" });
  assert.equal(en.status, 200, en.text);
  assert.ok(en.json.copied.includes("assets/anim/build.mjs"));
  const g = (await call("GET", "/api/anime/manifest?name=anim")).json;
  assert.equal(g.enabled, true);
  const next = { ...g.manifest, stacks: { "s1-hero": { shot: "s1", tracks: [{ type: "blink", pose: "s1-blink", at: [0.5], frames: 3 }] } } };
  const w = await call("POST", "/api/anime/manifest", { name: "anim", base_sha: g.sha, manifest: next });
  assert.equal(w.status, 200, w.text);
  assert.match(w.json.backup, /^\.opus\/anim-backups\//);
  assert.equal(w.json.job.kind, "anime-build");
  const j = await waitJob("anim", w.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  const full = await call("GET", `/api/anime/job?name=anim&id=${j.id}`);
  assert.equal(full.status, 200);
  assert.ok(full.json.warnings.some((x) => /s1-blink\.png -> base/.test(x)), full.json.log.join("\n"));
  assert.ok(existsSync(join(d, "assets", "anim", "anim-data.js")));
  assert.equal((await call("GET", `/api/anime/job?name=pj&id=${j.id}`)).status, 404, "another project's job is not shown");
  const stale = await call("POST", "/api/anime/manifest", { name: "anim", base_sha: g.sha, manifest: next });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.sha, w.json.sha);
  const invalid = await call("POST", "/api/anime/manifest", { name: "anim", base_sha: w.json.sha, manifest: { ...next, impacts: [{ at: 1, mode: "silhouette" }] } });
  assert.equal(invalid.status, 400);
  assert.match(invalid.json.errors[0], /silhouette cần stack/);
});

test("a delivered project (final video in renders/) needs confirm before its manifest changes", async () => {
  const d = zoroLike("done");
  mkdirSync(join(d, "renders"));
  writeFileSync(join(d, "renders", "done-final.mp4"), "");
  const g = (await call("GET", "/api/anime/manifest?name=done")).json;
  assert.deepEqual(g.final, ["renders/done-final.mp4"]);
  const no = await call("POST", "/api/anime/manifest", { name: "done", base_sha: g.sha, manifest: g.manifest });
  assert.equal(no.status, 428);
  assert.match(no.json.error, /xác nhận/);
  assert.equal((await call("POST", "/api/anime/rebuild", { name: "done" })).status, 428);
  const yes = await call("POST", "/api/anime/manifest", { name: "done", base_sha: g.sha, manifest: g.manifest, confirm: true });
  assert.equal(yes.status, 200, yes.text);
  assert.equal(yes.json.job, null, "no build.mjs in this project, so no build");
});

test("the manifest tools read and write through the same rules", async () => {
  const env = toolEnv({ root });
  const get = await callTool("anime_manifest_get", { project: "anim" }, env);
  assert.equal(get.ok, true, get.error);
  const m = get.result.manifest;
  m.stacks["s1-hero"].tracks[0].at = [0.2];
  const set = await callTool("anime_manifest_set", { project: "anim", manifest: m, base_sha: get.result.sha }, env);
  assert.equal(set.ok, true, set.error);
  assert.equal(set.result.build.ok, true, set.result.build.error);
  assert.ok(set.result.build.warnings.length >= 1);
  const again = await callTool("anime_manifest_set", { project: "anim", manifest: m, base_sha: get.result.sha }, env);
  assert.equal(again.ok, false);
  assert.match(again.error, /vừa được sửa/);
  const locked = await callTool("anime_manifest_set", { project: "done", manifest: {}, base_sha: "x" }, env);
  assert.match(locked.error, /confirm: true/);
});
