import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { loadRoutes } from "../lib/routes.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { editBeat, editsDir, editWord, listBackups, readMarkers, sha256, undoLast } from "../lib/timing-edit.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const WORDS = [
  { text: "Bạn", start: 0.08, end: 0.3 },
  { text: "đưa", start: 0.32, end: 0.55 },
  { text: "cả", start: 0.6, end: 0.74 },
  { text: "mã", start: 0.8, end: 1.02 },
  { text: "nguồn", start: 1.05, end: 1.5 },
];
const BEATS = { bpm: 120, beat0: 0.043, beatLen: 0.5, bars: [], kick: [[0, 8]], drops: [4], stability: 6 };
const M = {
  version: 3,
  capabilities: { editable: true },
  shots: [{ id: "s1", start: 0, end: 4 }],
  lines: [{ id: "vo-01", shot: "s1", file: "assets/voice/01.mp3", start: 0.5, duration: 1.6 }],
  music: [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: null, gain: 0.3 }],
};

function project(root = mkdtempSync(join(tmpdir(), "ms-timing-")), name = "p") {
  const dir = join(root, name);
  mkdirSync(join(dir, "assets", "voice"), { recursive: true });
  mkdirSync(join(dir, "assets", "bgm"), { recursive: true });
  writeFileSync(join(dir, "assets", "voice", "01.mp3.words.json"), JSON.stringify(WORDS, null, 2) + "\n");
  writeFileSync(join(dir, "assets", "bgm", "bgm.mp3.beats.json"), JSON.stringify(BEATS, null, 2) + "\n");
  writeFileSync(join(dir, "project.json"), JSON.stringify(M, null, 2));
  return { root, dir };
}
const wordsText = (dir) => readFileSync(join(dir, "assets", "voice", "01.mp3.words.json"), "utf8");
const beatsText = (dir) => readFileSync(join(dir, "assets", "bgm", "bgm.mp3.beats.json"), "utf8");

test("editWord changes exactly one value of words.json and keeps the layout", () => {
  const { root, dir } = project();
  try {
    const before = wordsText(dir);
    const r = editWord(dir, M, { line_id: "vo-01", index: 2, base_sha: sha256(before), start: 0.65 });
    assert.equal(r.changed, true);
    const after = wordsText(dir);
    assert.equal(r.sha, sha256(after));
    const want = structuredClone(WORDS);
    want[2].start = 0.65;
    assert.deepEqual(JSON.parse(after), want);
    // Same indentation and final newline: the diff is one line.
    const diff = before.split("\n").filter((l, i) => l !== after.split("\n")[i]);
    assert.deepEqual(diff, ['    "start": 0.6,']);
    assert.equal(before.split("\n").length, after.split("\n").length);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("editWord refuses to cross a neighbour or shrink under 10 ms (422), a stale base (409)", () => {
  const { root, dir } = project();
  try {
    const base = sha256(wordsText(dir));
    const err = (body) => { try { editWord(dir, M, { line_id: "vo-01", base_sha: base, ...body }); return null; } catch (e) { return e; } };
    assert.equal(err({ index: 2, start: 0.5 }).status, 422, "before the end of the word before");
    assert.equal(err({ index: 2, start: 0.735 }).status, 422, "less than 10 ms left");
    assert.equal(err({ index: 2, end: 0.81 }).status, 422, "past the start of the next word");
    assert.equal(err({ index: 9, start: 0.1 }).status, 404);
    assert.equal(err({ index: 2 }).status, 400);
    assert.equal(wordsText(dir), JSON.stringify(WORDS, null, 2) + "\n", "nothing written");
    const stale = (() => { try { editWord(dir, M, { line_id: "vo-01", index: 2, base_sha: "0".repeat(64), start: 0.62 }); } catch (e) { return e; } })();
    assert.equal(stale.status, 409);
    assert.equal(listBackups(dir).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("each edit leaves a backup; undoLast puts back the old sha, newest first", () => {
  const { root, dir } = project();
  try {
    const w0 = sha256(wordsText(dir)), b0 = sha256(beatsText(dir));
    const w = editWord(dir, M, { line_id: "vo-01", index: 2, base_sha: w0, start: 0.62 });
    const b = editBeat(dir, M, { music_id: "bgm", base_sha: b0, beat0: 0.093 });
    assert.equal(JSON.parse(beatsText(dir)).beat0, 0.093);
    const backs = listBackups(dir);
    assert.deepEqual(backs.map((x) => x.rel), ["assets/voice/01.mp3.words.json", "assets/bgm/bgm.mp3.beats.json"]);
    assert.deepEqual(backs.map((x) => x.sha), [w0, b0]);
    assert.deepEqual(backs.map((x) => x.name), [w.backup, b.backup]);
    assert.ok(readdirSync(editsDir(dir)).every((f) => f.endsWith(".json")));
    // The markers show the value before Studio first moved them.
    const mk = readMarkers(dir, M);
    assert.equal(mk.grid.original, 0.043);
    assert.equal(mk.grid.beat0, 0.093);
    assert.equal(mk.lines[0].original[2].start, 0.6);
    assert.equal(mk.lines[0].words[2].start, 0.62);
    assert.equal(mk.lines[0].offset, 0.5);
    assert.equal(mk.undo, 2);
    assert.equal(undoLast(dir).sha, b0);
    assert.equal(sha256(beatsText(dir)), b0);
    assert.equal(undoLast(dir).sha, w0);
    assert.equal(sha256(wordsText(dir)), w0);
    assert.equal((() => { try { undoLast(dir); } catch (e) { return e.status; } })(), 422);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("undoLast does not overwrite a file another tool changed after the edit (409)", () => {
  const { root, dir } = project();
  try {
    editWord(dir, M, { line_id: "vo-01", index: 0, base_sha: sha256(wordsText(dir)), end: 0.31 });
    writeFileSync(join(dir, "assets", "voice", "01.mp3.words.json"), "[]\n");
    assert.equal((() => { try { undoLast(dir); } catch (e) { return e.status; } })(), 409);
    assert.equal(wordsText(dir), "[]\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("beats.json: beat0 outside [0, beatLen) is 422", () => {
  const { root, dir } = project();
  try {
    const base = sha256(beatsText(dir));
    for (const beat0 of [-0.01, 0.5, 0.75]) {
      assert.equal((() => { try { editBeat(dir, M, { music_id: "bgm", base_sha: base, beat0 }); } catch (e) { return e.status; } })(), 422, String(beat0));
    }
    assert.equal(editBeat(dir, M, { music_id: "bgm", base_sha: base, beat0: 0.499 }).value, 0.499);
    assert.equal((() => { try { editBeat(dir, M, { music_id: "nope", base_sha: base, beat0: 0.1 }); } catch (e) { return e.status; } })(), 404);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The routes run the provider's timing command; here a fake plugin whose timing.mjs records how
// it was called.
const A = await adapterFor({});
const TOKEN = "m".repeat(64);
let root, plugin, server, port, saved, dir;

before(async () => {
  saved = process.env.OPUS_VIDEO_HOME;
  plugin = fakePlugin({ schema: A.NEED.schema, api: 3 });
  const api = join(plugin, "scripts", "studio-api.mjs");
  writeFileSync(api, readFileSync(api, "utf8").replace("export const load = () => null;",
    'import { readFileSync as _r } from "node:fs"; import { join as _j } from "node:path";\nexport const load = (d) => JSON.parse(_r(_j(d, "project.json"), "utf8"));'));
  writeFileSync(join(plugin, "scripts", "timing.mjs"), `import { writeFileSync } from "node:fs";
const i = process.argv.indexOf("--project");
writeFileSync(process.argv[i + 1] + "/timing-ran.json", JSON.stringify(process.argv.slice(2)));
console.log("TIMING s1 0.000–4.000 words=5");\n`);
  process.env.OPUS_VIDEO_HOME = plugin;
  ({ root, dir } = project(mkdtempSync(join(tmpdir(), "ms-timing-route-")), "demo"));
  server = createServer({ root, token: TOKEN, runtime: null, routes: await loadRoutes() });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
});

function http(method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}
async function ran() {
  const f = join(dir, "timing-ran.json");
  for (let i = 0; i < 100 && !existsSync(f); i++) await new Promise((r) => setTimeout(r, 50));
  const args = JSON.parse(readFileSync(f, "utf8"));
  rmSync(f);
  // Let the job's exit land before the next edit (one timing job per project at a time).
  for (let i = 0; i < 100; i++) {
    const jobs = (await http("GET", "/api/jobs?name=demo")).json;
    if (!jobs.some((j) => j.kind === "timing" && j.status === "running")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return args;
}

test("POST /api/timing/word and /beat edit the file and run the timing command with --project <dir>", async () => {
  const g = await http("GET", "/api/timing?name=demo");
  assert.equal(g.status, 200);
  assert.equal(g.json.lines[0].id, "vo-01");
  assert.equal(g.json.grid.music_id, "bgm");
  const w = await http("POST", "/api/timing/word", { name: "demo", line_id: "vo-01", index: 1, base_sha: g.json.lines[0].sha, start: 0.35 });
  assert.equal(w.status, 200, JSON.stringify(w.json));
  assert.equal(w.json.job.kind, "timing");
  const args = await ran();
  assert.equal(args[0], "--project");
  assert.ok(args[1].endsWith("/demo"), args[1]);
  assert.equal(JSON.parse(wordsText(dir))[1].start, 0.35);

  const stale = await http("POST", "/api/timing/word", { name: "demo", line_id: "vo-01", index: 1, base_sha: g.json.lines[0].sha, start: 0.36 });
  assert.equal(stale.status, 409);
  const bad = await http("POST", "/api/timing/beat", { name: "demo", music_id: "bgm", base_sha: g.json.grid.sha, beat0: 0.6 });
  assert.equal(bad.status, 422);
  const b = await http("POST", "/api/timing/beat", { name: "demo", music_id: "bgm", base_sha: g.json.grid.sha, beat0: 0.093 });
  assert.equal(b.status, 200);
  assert.deepEqual((await ran()).slice(0, 1), ["--project"]);

  const u = await http("POST", "/api/timing/undo", { name: "demo" });
  assert.equal(u.status, 200);
  assert.equal(u.json.sha, g.json.grid.sha);
  await ran();
  assert.equal((await http("POST", "/api/timing/undo", { name: "demo" })).status, 200);
  await ran();
  assert.equal(sha256(wordsText(dir)), g.json.lines[0].sha);
  assert.equal((await http("POST", "/api/timing/undo", { name: "demo" })).status, 422);
});

test("timing routes refuse read-only projects (423) and unknown ones (404)", async () => {
  const p = join(root, "ro");
  project(root, "ro");
  writeFileSync(join(p, "project.json"), JSON.stringify({ ...M, capabilities: { editable: false } }));
  const g = await http("GET", "/api/timing?name=ro");
  assert.equal(g.status, 200);
  assert.equal((await http("POST", "/api/timing/beat", { name: "ro", music_id: "bgm", base_sha: g.json.grid.sha, beat0: 0.1 })).status, 423);
  assert.equal((await http("POST", "/api/timing/undo", { name: "missing" })).status, 404);
});
