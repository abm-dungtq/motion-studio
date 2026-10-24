// lib/scenes.mjs, routes/scenes.mjs and lib/tools/scenes.mjs: one scene of an episode rebuilt on
// its own (preview page from the series tool, a draft render of that page, a stills sheet) and
// approved by the user in DEMO.md. Fake series tool and a fake npx on PATH; ffmpeg is real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { approvalNote, sceneApprovals, sceneList, sceneWindow } from "../lib/scenes.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "s".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "PATH", "FAKE_PREVIEW_EXIT", "FAKE_NPX_LOG"];
let tmp, plugin, P, series, root, ep, plain, server, port, saved, env, queued, npxLog;

// scene-preview: writes the page --out names with the span's length; FAKE_PREVIEW_EXIT=3 is a bad cue.
const SCENE_PREVIEW = `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
if (process.env.FAKE_PREVIEW_EXIT === "3") { console.log("ERROR shot@0 actor 0 (song) key t=0: move 'spin' is not allowed"); process.exit(3); }
mkdirSync(dirname(a.out), { recursive: true });
writeFileSync(a.out, '<div data-composition-id="main" data-duration="' + (Number(a.to) - Number(a.from)) + '"></div>');
console.log("RESULT " + JSON.stringify({ html: a.out, from: Number(a.from), to: Number(a.to), scene: a.scene }));
`;
// npx: logs its argv; "hyperframes render -c <page> -o <out>" makes a clip as long as the page says.
const NPX = (ffmpeg) => `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_NPX_LOG, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
const c = args[args.indexOf("-c") + 1], o = args[args.indexOf("-o") + 1];
const d = readFileSync(c, "utf8").match(/data-duration="([\\d.]+)"/)[1];
const r = spawnSync(${JSON.stringify(ffmpeg)}, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", d, "-pix_fmt", "yuv420p", o]);
process.exit(r.status ?? 1);
`;

const manifest = (shots, scenes) => ({ schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 6, html: "index.html", capabilities: { editable: true, picture_from_code: true }, shots, lines: [], music: [], assets: [], scenes, version: 1 });
const SHOTS = [{ id: "s1", name: "", start: 0, end: 2 }, { id: "s2", name: "", start: 2, end: 3.5 }, { id: "s3", name: "", start: 3.5, end: 6 }];
const SCENES = [{ id: "c1", label: "Mở đầu", shots: ["s1"] }, { id: "c2", label: "Bà nội gọi", shots: ["s2", "s3"] }];
const DEMO = "# DEMO\n\napproval: pending\n\n## Frames\n\n- demo/frame-00-at-1s.png (main)\n";
const readLines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function http(method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}
async function jobDone(id, name = "ep") {
  for (let i = 0; i < 300; i++) {
    const j = (await http("GET", `/api/jobs?name=${name}`)).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await sleep(100);
  }
  throw new Error(`job ${id} still running`);
}
function resetProject(dir, { brief = `---\ntitle: Tập thử\nseries: ${series}\n---\n`, shots = SHOTS, scenes = SCENES } = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), brief);
  writeFileSync(join(dir, "index.html"), '<div data-composition-id="main" data-duration="6"></div>\n');
  writeFileSync(join(dir, "project.json"), JSON.stringify(manifest(shots, scenes)));
  writeFileSync(join(dir, "DEMO.md"), DEMO);
  writeFileSync(npxLog, "");
}

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-scene-rebuild-")));
  npxLog = join(tmp, "npx.log");
  const bin = join(tmp, "bin");
  mkdirSync(bin);
  const ffmpeg = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
  writeFileSync(join(bin, "npx"), NPX(ffmpeg));
  chmodSync(join(bin, "npx"), 0o755);
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true, gateway: true });
  queued = join(tmp, "queued.jsonl");
  const api = join(plugin, "scripts", "studio-api.mjs");
  writeFileSync(api, readFileSync(api, "utf8").replace("export const enqueue = () => null;", `import { appendFileSync as _qa } from "node:fs";\nexport const enqueue = (dir, r) => { _qa(${JSON.stringify(queued)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", ...r }; };`));
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_NPX_LOG: npxLog, PATH: `${bin}${delimiter}${process.env.PATH}` });
  delete process.env.FAKE_PREVIEW_EXIT;
  P = await A.create({ OPUS_VIDEO_HOME: plugin });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  writeFileSync(join(series, "tools", "scene-preview.mjs"), SCENE_PREVIEW);
  const decl = JSON.parse(readFileSync(join(series, "studio-series.json"), "utf8"));
  decl.tools["scene-preview"] = { file: "tools/scene-preview.mjs", flags: { "--project": "project", "--scene": "word", "--from": "number", "--to": "number", "--out": "path:write" }, writes: ["{project}/demo"], timeout_s: 30 };
  writeFileSync(join(series, "studio-series.json"), JSON.stringify(decl));
  root = join(tmp, "root");
  ep = join(root, "ep");
  plain = join(root, "plain");
  mkdirSync(root, { recursive: true });
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  env = { ...toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) }), actor: "director", request: "r-9" };
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("a scene's window runs from its first shot's start to its last shot's end", () => {
  const m = manifest(SHOTS, SCENES);
  assert.deepEqual(sceneWindow(m, "c2"), { id: "c2", label: "Bà nội gọi", from: 2, to: 6, shots: ["s2", "s3"] });
  assert.throws(() => sceneWindow(manifest(SHOTS, undefined), "c1"), (e) => e.status === 400 && /chưa có nhóm cảnh/.test(e.message));
  assert.throws(() => sceneWindow(m, "c9"), (e) => e.status === 400 && /không có cảnh c9/.test(e.message));
  assert.throws(() => sceneWindow(m, "s1"), /dạng c3/);
  assert.equal(approvalNote({ id: "c12", label: "Kết\nthúc" }, "user@studio", "2026-10-24T09:00:00.000Z"), "cảnh 12: approved user@studio 2026-10-24T09:00:00.000Z Kết thúc");
});

test("rebuilding a scene renders only its preview page: clip, stills, record and receipt", async () => {
  resetProject(ep);
  const r = await callTool("scene_rebuild", { project: "ep", scene: "c2" }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual([r.result.from, r.result.to, r.result.clip, r.result.stills], [2, 6, "demo/scenes/c2.mp4", "demo/scenes/c2-stills.png"]);
  for (const f of ["demo/scenes/preview-c2.html", "demo/scenes/c2.mp4", "demo/scenes/c2-stills.png", ".opus/scenes/c2.json"]) assert.ok(existsSync(join(ep, f)), f);
  assert.ok(!existsSync(join(ep, "demo/scenes/c2.part.mp4")), "the temporary render is renamed");
  const calls = readLines(npxLog);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["hyperframes", "render", "-c", "demo/scenes/preview-c2.html", "--quality", "draft", "-o", "demo/scenes/c2.part.mp4"]);
  assert.equal(calls[0].cwd, realpathSync(ep));
  assert.ok(!existsSync(join(ep, "renders")), "no whole-film render");
  const rec = listReceipts(ep, { op: "scene-rebuild" });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].actor, "director:r-9");
  assert.deepEqual(rec[0].params, { scene: "c2", from: 2, to: 6, shots: ["s2", "s3"] });
  assert.deepEqual(rec[0].outputs.map((o) => o.path), ["demo/scenes/preview-c2.html", "demo/scenes/c2.mp4", "demo/scenes/c2-stills.png", ".opus/scenes/c2.json"]);
  assert.ok(rec[0].outputs.every((o) => o.size > 0));
  const list = (await http("GET", "/api/scenes?name=ep")).json;
  assert.equal(list.can_rebuild, true);
  assert.equal(list.job, null);
  const c2 = list.scenes.find((s) => s.id === "c2");
  assert.equal(c2.current, true);
  assert.equal(c2.clip, "demo/scenes/c2.mp4");
  assert.equal(list.scenes.find((s) => s.id === "c1").clip, null);
});

test("an unknown scene is a 400, a project outside a series cannot rebuild, a bad cue makes no clip", async () => {
  resetProject(ep);
  const unknown = await http("POST", "/api/scenes/rebuild", { name: "ep", scene: "c7" });
  assert.equal(unknown.status, 400);
  assert.match(unknown.json.error, /không có cảnh c7/);
  const none = await http("POST", "/api/scenes/rebuild", { name: "ep", scene: "x1" });
  assert.equal(none.status, 400);
  resetProject(plain, { brief: "---\ntitle: Không series\n---\n" });
  const out = await http("POST", "/api/scenes/rebuild", { name: "plain", scene: "c1" });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /scene-preview của series/);
  assert.equal((await http("GET", "/api/scenes?name=plain")).json.can_rebuild, false);

  process.env.FAKE_PREVIEW_EXIT = "3";
  try {
    const r = await http("POST", "/api/scenes/rebuild", { name: "ep", scene: "c1" });
    assert.equal(r.status, 200, r.text);
    const j = await jobDone(r.json.job.id);
    assert.equal(j.code, 3);
    assert.ok(j.tail.some((l) => /move 'spin' is not allowed/.test(l)), j.tail.join("\n"));
    assert.ok(!existsSync(join(ep, "demo/scenes/c1.mp4")));
    assert.equal(readLines(npxLog).length, 0, "nothing rendered after a bad cue");
    assert.equal(listReceipts(ep, { op: "scene-rebuild" })[0].inputs.step, "scene-preview");
  } finally { delete process.env.FAKE_PREVIEW_EXIT; }
});

test("approving: a scene not built is refused; two built scenes write two notes above ## Frames", async () => {
  resetProject(ep);
  writeFileSync(queued, "");
  const early = await http("POST", "/api/scenes/approve", { name: "ep", scenes: ["c1"] });
  assert.equal(early.status, 409);
  assert.match(early.json.error, /chưa dựng/);
  for (const id of ["c1", "c2"]) {
    const r = await http("POST", "/api/scenes/rebuild", { name: "ep", scene: id });
    assert.equal(r.status, 200, r.text);
    assert.equal((await jobDone(r.json.job.id)).code, 0);
  }
  assert.equal((await http("POST", "/api/scenes/approve", { name: "ep", scenes: ["c1", "c1"] })).status, 400);
  const ok = await http("POST", "/api/scenes/approve", { name: "ep", scenes: ["c1", "c2"], note: "đẹp" });
  assert.equal(ok.status, 200, ok.text);
  const demo = readFileSync(join(ep, "DEMO.md"), "utf8");
  assert.match(demo, /^approval: pending$/m, "the animatic approval line is left alone");
  const lines = demo.split("\n");
  const frames = lines.indexOf("## Frames");
  const n1 = lines.findIndex((l) => /^- cảnh 1: approved user@studio \S+ Mở đầu$/.test(l));
  const n2 = lines.findIndex((l) => /^- cảnh 2: approved user@studio \S+ Bà nội gọi$/.test(l));
  assert.ok(n1 > 0 && n2 === n1 + 1 && n2 < frames, demo);
  assert.equal(Object.keys(sceneApprovals(ep)).length, 2);
  assert.equal(listReceipts(ep, { op: "scene-approve" })[0].params.note, "đẹp");
  const asked = readLines(queued);
  assert.equal(asked.length, 1);
  assert.match(asked[0].text, /^Người dùng duyệt cảnh 1, 2\. Ghi chú: đẹp\.$/);
  const list = sceneList(P.manifest.load(ep), ep);
  assert.ok(list.every((s) => s.approved_current), JSON.stringify(list));

  // A moved line moves the scene: its clip no longer matches, so it is rebuilt before approval.
  const m = JSON.parse(readFileSync(join(ep, "project.json"), "utf8"));
  m.shots[1].start = 2.5; m.shots[0].end = 2.5;
  writeFileSync(join(ep, "project.json"), JSON.stringify(m));
  const stale = await http("POST", "/api/scenes/approve", { name: "ep", scenes: ["c2"] });
  assert.equal(stale.status, 409);
  assert.match(stale.json.error, /đổi mốc/);
});
