// lib/series-run.mjs, routes/series.mjs and lib/tools/series.mjs: series tools run only as
// declared, with checked arguments, as a project job with a receipt.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { seriesFor } from "../lib/series.mjs";
import { buildArgv } from "../lib/series-run.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { waitJob } from "../lib/tools/series.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { cancel, startJob } from "../jobs.mjs";
import { recordApproved } from "../lib/ledger.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "q".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE"];
let tmp, plugin, P, series, root, video, server, port, saved, env, director;

const brief = (dir, title) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: ${title}\nseries: ${series}\n---\n`); };

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-series-tool-")));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json") });
  P = await A.create({ OPUS_VIDEO_HOME: plugin });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  mkdirSync(join(series, "build"), { recursive: true });
  video = join(tmp, "video");
  root = join(tmp, "root");
  mkdirSync(root, { recursive: true });
  // ep-01 lives beside its series and is linked into the root; direct sits in the root itself.
  brief(join(video, "ep-01"), "Tập 1");
  mkdirSync(join(video, "ep-01", "assets", "gen"), { recursive: true });
  writeFileSync(join(video, "ep-01", "assets", "gen", "draft.txt"), "bản nháp\n");
  symlinkSync(join(video, "ep-01"), join(root, "ep-01"));
  brief(join(root, "direct"), "Trực tiếp");
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  env = toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) });
  // The director of request r-1 works on ep-01 (a job Studio itself holds).
  director = startJob({ name: "ep-01", kind: "director", cmd: "/bin/sleep", args: ["600"], cwd: tmp, meta: { request: "r-1" } });
});
after(() => {
  cancel(director.id);
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function finished(id) {
  for (let i = 0; i < 100; i++) {
    const r = await http("GET", `/api/series/job?id=${id}`);
    if (r.json?.job && r.json.job.status !== "running" && r.json.job.status !== "cancelling") return r.json;
    await sleep(100);
  }
  throw new Error(`job ${id} did not end`);
}

const argvOf = (o) => buildArgv({ series: seriesFor(P, join(root, "ep-01")), projectDir: join(root, "ep-01"), root, ...o });
const refuses = (o, re) => assert.throws(() => argvOf(o), (e) => e.status === 400 && re.test(e.message), JSON.stringify(o));

test("buildArgv refuses undeclared flags and flags that smuggle code", () => {
  refuses({ tool: "echo-args", flags: { "--eval": "1" } }, /không có cờ --eval/);
  refuses({ tool: "echo-args", flags: { "-e": "process.exit(0)" } }, /không có cờ -e/);
  refuses({ tool: "nope" }, /không có công cụ "nope"/);
  refuses({ tool: "toString" }, /không có công cụ/);
  refuses({ tool: "echo-args", positional: ["x"] }, /không nhận đối số vị trí/);
  refuses({ tool: "pose", char: "hero", positional: ["-e"] }, /không đúng kiểu id/);
});

test("buildArgv refuses paths outside the project, absolute paths and S/build", () => {
  refuses({ tool: "echo-args", flags: { "--out": "../x" } }, /'\.\.'/);
  refuses({ tool: "echo-args", flags: { "--out": "/tmp/x" } }, /không nhận đường tuyệt đối/);
  refuses({ tool: "echo-args", flags: { "--out": "S/build/x" } }, /S\/build/);
  refuses({ tool: "echo-args", flags: { "--in": "S/../../etc/passwd" } }, /'\.\.'/);
  refuses({ tool: "echo-args", flags: { "--out": "S/refs/x.png" } }, /không nằm trong dự án hay một thư mục writes/);
  refuses({ tool: "echo-args", flags: { "--in": "S/tools/fail.mjs" } }, /không nằm trong dự án hay một thư mục read/);
  refuses({ tool: "echo-args", flags: { "--out": ".opus/x" } }, /dấu chấm/);
  refuses({ tool: "echo-args", flags: { "--out": "a\\b" } }, /dấu \\/);
});

test("a positional path:read is held to the read folders like a flag", () => {
  refuses({ tool: "read-list", positional: ["S/tools/fail.mjs"] }, /positional\[0\]: "S\/tools\/fail\.mjs" không nằm trong dự án hay một thư mục read/);
  refuses({ tool: "read-list", positional: ["S/refs/a.txt", "S/studio-series.json"] }, /positional\[1\].*không nằm trong dự án hay một thư mục read/);
  const r = argvOf({ tool: "read-list", positional: ["S/refs/a.txt", "assets/gen/draft.txt"] });
  assert.deepEqual(r.argv.slice(1), [join(series, "refs", "a.txt"), join(video, "ep-01", "assets", "gen", "draft.txt")]);
});

test("a writes folder with {char} opens only the named character's folder", () => {
  assert.deepEqual(argvOf({ tool: "sprite", flags: { "--out": "assets/gen/a.pxl" } }).writes, [join(video, "ep-01", "assets", "gen")]);
  refuses({ tool: "sprite", flags: { "--out": "S/characters/hero/poses/a.pxl" } }, /không nằm trong dự án hay một thư mục writes/);
  assert.equal(argvOf({ tool: "sprite", char: "hero", flags: { "--out": "S/characters/hero/poses/a.pxl" } }).outputs[0], join(series, "characters", "hero", "poses", "a.pxl"));
  refuses({ tool: "sprite", char: "hero", flags: { "--out": "S/characters/villain/poses/a.pxl" } }, /không nằm trong dự án hay một thư mục writes/);
  refuses({ tool: "sprite", char: "hero", flags: { "--out": "S/characters/hero/src/pose.mjs" } }, /không nằm trong dự án hay một thư mục writes/);
});

test("a series folder inside the project itself is refused", () => {
  const inner = join(tmp, "nested");
  mkdirSync(inner, { recursive: true });
  cpSync(FIXTURE, join(inner, "own-series"), { recursive: true });
  writeFileSync(join(inner, "BRIEF.md"), "---\ntitle: Lồng\nseries: own-series\n---\n");
  assert.throws(() => seriesFor(P, inner), (e) => e.status === 400 && /nằm trong chính dự án/.test(e.message));
  writeFileSync(join(inner, "BRIEF.md"), "---\ntitle: Lồng\nseries: .\n---\n");
  writeFileSync(join(inner, "studio-series.json"), readFileSync(join(FIXTURE, "studio-series.json")));
  assert.throws(() => seriesFor(P, inner), (e) => e.status === 400 && /nằm trong chính dự án/.test(e.message));
  symlinkSync(inner, join(tmp, "nested-link"));
  assert.throws(() => seriesFor(P, join(tmp, "nested-link")), (e) => e.status === 400 && /nằm trong chính dự án/.test(e.message));
  rmSync(join(tmp, "nested-link")); rmSync(inner, { recursive: true, force: true });
});

test("buildArgv checks every type", () => {
  refuses({ tool: "echo-args", flags: { "--n": "ba" } }, /cần số nguyên/);
  refuses({ tool: "echo-args", flags: { "--n": 1.5 } }, /cần số nguyên/);
  refuses({ tool: "echo-args", flags: { "--x": "1e9" } }, /cần một số/);
  refuses({ tool: "echo-args", flags: { "--all": "yes" } }, /true hoặc false/);
  refuses({ tool: "echo-args", flags: { "--label": "a\nb" } }, /một dòng/);
  refuses({ tool: "echo-args", flags: { "--slot": ["eyes:1,2", "bad"] } }, /kiểu slot/);
  refuses({ tool: "echo-args", flags: { "--n": [1, 2] } }, /chỉ nhận một giá trị/);
  refuses({ tool: "echo-args", flags: { "--project": "direct" } }, /chỉ nhận dự án đang chạy/);
  refuses({ tool: "echo-args", flags: { "--char": "Hero!" } }, /kiểu id/);
  refuses({ tool: "pose", positional: ["stand"] }, /id nhân vật/);
  refuses({ tool: "pose", char: "nobody", positional: ["stand"] }, /không có file/);
});

test("the root type takes Studio's root or the real folder holding the project, nothing else", () => {
  const flags = { "--episode": 2, "--title": "Tập hai" };
  assert.equal(argvOf({ tool: "new-episode", flags: { "--root": root, ...flags } }).argv[1], `--root=${root}`);
  assert.equal(argvOf({ tool: "new-episode", flags: { "--root": video, ...flags } }).argv[1], `--root=${video}`);
  refuses({ tool: "new-episode", flags: { ...flags, "--root": tmp } }, /chỉ nhận thư mục gốc của Studio hoặc thư mục thật chứa dự án/);
  refuses({ tool: "new-episode", flags: { ...flags, "--root": series } }, /chỉ nhận thư mục gốc/);
  refuses({ tool: "new-episode", flags: { ...flags, "--root": "root" } }, /chỉ nhận thư mục gốc/);
});

test("buildArgv answers the argv in order, as --flag=value, with cwd the series folder", () => {
  const ep = join(video, "ep-01");
  const r = argvOf({ tool: "echo-args", flags: { "--in": "S/refs/a.txt", "--out": "assets/gen/x.txt", "--n": "7", "--all": true, "--slot": ["eyes:1,2", "mouth:3,4"], "--project": "ep-01", "--label": "--eval" } });
  assert.equal(r.cmd, process.execPath);
  assert.equal(r.cwd, series);
  assert.deepEqual(r.argv, [join(series, "tools", "echo-args.mjs"), `--in=${join(series, "refs", "a.txt")}`, `--out=${join(ep, "assets", "gen", "x.txt")}`, "--n=7", "--all", "--slot=eyes:1,2", "--slot=mouth:3,4", `--project=${ep}`, "--label=--eval"]);
  assert.deepEqual(r.outputs, [join(ep, "assets", "gen", "x.txt")]);
  assert.equal(r.timeoutMs, 30000);
  assert.deepEqual(r.writes, [join(ep, "assets", "gen"), join(series, "props")]);
  const pose = argvOf({ tool: "pose", char: "hero", positional: ["stand", "sit"] });
  assert.deepEqual(pose.argv, [join(series, "characters", "hero", "src", "pose.mjs"), "stand", "sit"]);
  assert.equal(argvOf({ tool: "echo-args", flags: { "--out": "S/props/p.txt" } }).argv[1], `--out=${join(series, "props", "p.txt")}`);
});

test("POST /api/series/run runs the tool and writes a receipt without anything like a token", async () => {
  const g = await http("GET", "/api/series?name=ep-01");
  assert.equal(g.status, 200, g.text);
  assert.equal(g.json.name, "Series Thử");
  const r = await http("POST", "/api/series/run", { name: "ep-01", tool: "echo-args", flags: { "--out": "assets/gen/out.txt", "--label": "sk-abcdefghijklmnopqrstuvwxyz0123" }, actor: "director:r-1" });
  assert.equal(r.status, 200, r.text);
  const done = await finished(r.json.job.id);
  assert.equal(done.job.code, 0);
  assert.equal(readFileSync(join(video, "ep-01", "assets", "gen", "out.txt"), "utf8"), "ok\n");
  assert.deepEqual(done.receipt.outputs, ["assets/gen/out.txt"]);
  const [rec] = listReceipts(join(video, "ep-01"), { op: "series-tool" });
  assert.equal(rec.actor, "director:r-1");
  assert.deepEqual(rec.tool, { name: "echo-args", file: "tools/echo-args.mjs" });
  assert.equal(rec.inputs.exit, 0);
  assert.doesNotMatch(JSON.stringify(rec), /sk-[A-Za-z0-9]{20}/);
  const bad = await http("POST", "/api/series/run", { name: "ep-01", tool: "echo-args", flags: { "--eval": "x" } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /không có cờ --eval/);
  const lone = await http("POST", "/api/series/run", { name: "nope", tool: "echo-args" });
  assert.equal(lone.status, 404);
});

test("series_tool answers ok false with the exit code of a failing tool", async () => {
  const r = await callTool("series_tool", { project: "ep-01", tool: "fail" }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.ok, false);
  assert.equal(r.result.code, 3);
  assert.ok(r.result.tail.some((l) => /thất bại có chủ đích/.test(l)));
  assert.ok(r.result.receipt.id);
});

test("a tool that runs past its timeout_s is stopped", async () => {
  const r = await http("POST", "/api/series/run", { name: "direct", tool: "slow" });
  assert.equal(r.status, 200, r.text);
  const done = await finished(r.json.job.id);
  assert.equal(done.job.status, "cancelled");
});

test("a second series tool on the same project while one runs is a 409 and starts nothing", async () => {
  const first = await http("POST", "/api/series/run", { name: "direct", tool: "slow" });
  assert.equal(first.status, 200, first.text);
  const second = await http("POST", "/api/series/run", { name: "direct", tool: "echo-args", flags: { "--out": "assets/gen/busy.txt" } });
  assert.equal(second.status, 409, second.text);
  assert.match(second.json.error, /direct đang chạy một công cụ series khác, chờ xong đã/);
  await finished(first.json.job.id);
  assert.ok(!existsSync(join(root, "direct", "assets", "gen", "busy.txt")));
});

test("series_tool stops waiting after the tool's timeout and says the job still runs", async () => {
  let polls = 0;
  const studio = { post: async () => ({ job: { id: "j-long" }, timeout_s: 0 }), get: async () => { polls++; return { job: { id: "j-long", status: "running" } }; } };
  const r = await waitJob({ studio }, { job: { id: "j-long" }, timeout_s: 0 }, { pollMs: 5, slackMs: 40 });
  assert.equal(r.ok, false);
  assert.match(r.error, /việc j-long vẫn chạy sau thời hạn; xem trong Studio/);
  assert.ok(polls >= 1, "it polled before giving up");
});

test("series_list answers the project's series; without project every series of the root", async () => {
  const one = await callTool("series_list", { project: "direct" }, env);
  assert.equal(one.result.name, "Series Thử");
  const all = await callTool("series_list", {}, env);
  assert.deepEqual(all.result.series.map((s) => s.projects), [["direct", "ep-01"]]);
});

test("series_file_put copies into a writable folder, never overwrites without replace, keeps a .bak-", async () => {
  writeFileSync(join(video, "ep-01", "assets", "gen", "pose.mjs"), "// v1\n");
  const put = (extra = {}) => callTool("series_file_put", { project: "ep-01", from: "assets/gen/pose.mjs", to: "rig_src/src/pose-new.mjs", char: "hero", ...extra }, env);
  const first = await put();
  assert.equal(first.ok, true, first.error);
  assert.equal(first.result.to, "characters/hero/src/pose-new.mjs");
  assert.equal(readFileSync(join(series, "characters", "hero", "src", "pose-new.mjs"), "utf8"), "// v1\n");
  writeFileSync(join(video, "ep-01", "assets", "gen", "pose.mjs"), "// v2\n");
  const again = await put();
  assert.equal(again.ok, false);
  assert.match(again.error, /đã có; gửi replace: true/);
  assert.equal(readFileSync(join(series, "characters", "hero", "src", "pose-new.mjs"), "utf8"), "// v1\n");
  const replaced = await put({ replace: true });
  assert.equal(replaced.ok, true, replaced.error);
  assert.match(replaced.result.backup, /^characters\/hero\/src\/pose-new\.mjs\.bak-\d{12}$/);
  assert.equal(readFileSync(join(series, replaced.result.backup), "utf8"), "// v1\n");
  assert.equal(readFileSync(join(series, "characters", "hero", "src", "pose-new.mjs"), "utf8"), "// v2\n");
  assert.equal(listReceipts(join(video, "ep-01"), { op: "series-put" }).length, 2);
  for (const [to, re] of [["tools/x.mjs", /khóa ghi được/], ["refs/../tools/x.mjs", /không hợp lệ/], ["refs", /không hợp lệ/], ["rig_src/x.mjs", /id nhân vật/]]) {
    const r = await callTool("series_file_put", { project: "ep-01", from: "assets/gen/pose.mjs", to }, env);
    assert.equal(r.ok, false, to);
    assert.match(r.error, re, to);
  }
  const outside = await callTool("series_file_put", { project: "ep-01", from: "../../series/thu/tools/fail.mjs", to: "refs/x.mjs" }, env);
  assert.equal(outside.ok, false);
});

test("series_file_put never replaces what the user approved: approval.json, its images, files Studio recorded", async () => {
  const hero = join(series, "characters", "hero");
  mkdirSync(join(hero, "poses"), { recursive: true });
  const approval = JSON.stringify({ approved: true, date: "2026-10-24", by: "user@studio", images: ["S/characters/hero/poses/idle.png"] });
  writeFileSync(join(hero, "approval.json"), approval);
  writeFileSync(join(hero, "poses", "idle.png"), "duyệt");
  writeFileSync(join(series, "refs", "hero-sheet.png"), "bảng đã duyệt");
  recordApproved(series, [{ rel: "refs/hero-sheet.png", sha: "0".repeat(64) }]);
  writeFileSync(join(video, "ep-01", "assets", "gen", "fake.json"), JSON.stringify({ approved: true, by: "director" }));
  for (const [to, char] of [["rig_src/approval.json", "hero"], ["rig_src/poses/idle.png", "hero"], ["refs/hero-sheet.png", null], ["rig_src/approval.json", "villain"]]) {
    for (const replace of [false, true]) {
      const r = await http("POST", "/api/series/put", { name: "ep-01", from: "assets/gen/fake.json", to, char, replace });
      assert.equal(r.status, 409, `${to} ${char} ${replace}: ${r.text}`);
      assert.match(r.json.error, /người dùng đã duyệt|lời duyệt/, to);
    }
  }
  assert.equal(readFileSync(join(hero, "approval.json"), "utf8"), approval);
  assert.equal(readFileSync(join(hero, "poses", "idle.png"), "utf8"), "duyệt");
  assert.equal(readFileSync(join(series, "refs", "hero-sheet.png"), "utf8"), "bảng đã duyệt");
  assert.ok(!existsSync(join(series, "characters", "villain", "approval.json")), "no approval.json is made either");
  // Another file of the same folder is still written.
  const ok = await http("POST", "/api/series/put", { name: "ep-01", from: "assets/gen/fake.json", to: "rig_src/poses/note.json", char: "hero" });
  assert.equal(ok.status, 200, ok.text);
});

test("a director's tools change only the project of its request, also when Studio is asked directly", async () => {
  const had = listReceipts(join(root, "direct"), {}).length;
  mkdirSync(join(root, "direct", "assets", "gen"), { recursive: true });
  writeFileSync(join(root, "direct", "assets", "gen", "card.txt"), "x");
  // Studio's side: the request id names its project; any other project, or an unknown request, is refused.
  for (const [body, re] of [
    [{ name: "direct", tool: "echo-args", flags: { "--out": "assets/gen/o.txt" }, actor: "director:r-1" }, /chỉ được làm trên ep-01/],
    [{ name: "ep-01", tool: "echo-args", flags: { "--out": "assets/gen/o.txt" }, actor: "director:r-gone" }, /không có yêu cầu r-gone/],
  ]) {
    const r = await http("POST", "/api/series/run", body);
    assert.equal(r.status, 403, r.text);
    assert.match(r.json.error, re);
  }
  const put = await http("POST", "/api/series/put", { name: "direct", from: "assets/gen/card.txt", to: "refs/from-direct.txt", actor: "director:r-1" });
  assert.equal(put.status, 403, put.text);
  const ep = await http("POST", "/api/series/episode", { from: "direct", episode: 9, title: "x", actor: "director:r-1" });
  assert.equal(ep.status, 403, ep.text);
  assert.ok(!existsSync(join(series, "refs", "from-direct.txt")));
  assert.equal(listReceipts(join(root, "direct"), {}).length, had, "nothing written into the other project");
  // The MCP side: a server started for ep-01 refuses a changing tool on another project, reads still work.
  const mine = { ...env, actor: "director", request: "r-1", project: "ep-01" };
  const w = await callTool("series_file_put", { project: "direct", from: "assets/gen/card.txt", to: "refs/from-direct.txt" }, mine);
  assert.equal(w.ok, false);
  assert.match(w.error, /chỉ được làm trên ep-01/);
  const read = await callTool("receipts_list", { project: "direct" }, mine);
  assert.equal(read.ok, true, read.error);
});

test("series_file_put never writes through a symlink already at the target", async () => {
  const away = join(tmp, "away.txt");
  writeFileSync(away, "ngoài series\n");
  writeFileSync(join(video, "ep-01", "assets", "gen", "card.txt"), "thẻ\n");
  symlinkSync(away, join(series, "refs", "linked.txt"));
  symlinkSync(join(tmp, "nowhere.txt"), join(series, "refs", "dangling.txt"));
  for (const [to, replace] of [["refs/linked.txt", true], ["refs/linked.txt", false], ["refs/dangling.txt", false], ["refs/dangling.txt", true]]) {
    const r = await http("POST", "/api/series/put", { name: "ep-01", from: "assets/gen/card.txt", to, replace });
    assert.equal(r.status, 400, `${to} ${replace}: ${r.text}`);
    assert.match(r.json.error, /liên kết \(symlink\)/);
  }
  assert.equal(readFileSync(away, "utf8"), "ngoài series\n");
  assert.ok(!existsSync(join(tmp, "nowhere.txt")));
  assert.ok(!readdirSync(join(series, "refs")).some((f) => f.includes(".bak-")));
  assert.equal(listReceipts(join(video, "ep-01"), { op: "series-put" }).filter((r) => r.params.to.startsWith("refs/")).length, 0);
});

test("series_episode_new from a linked episode makes the next one beside it and links it into the root", async () => {
  const r = await callTool("series_episode_new", { project: "ep-01", episode: 2, title: "Tập hai" }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.result.name, "ep-02");
  assert.equal(r.result.linked, true);
  assert.ok(existsSync(join(video, "ep-02", "BRIEF.md")));
  assert.ok(lstatSync(join(root, "ep-02")).isSymbolicLink());
  assert.equal(readlinkSync(join(root, "ep-02")), join(video, "ep-02"));
  assert.equal(listReceipts(join(video, "ep-02"), { op: "series-episode" }).length, 1);
  const again = await http("POST", "/api/series/episode", { from: "ep-01", episode: 2, title: "Lại" });
  assert.equal(again.status, 409);
  const listed = (await http("GET", "/api/projects")).json.map((p) => p.name);
  assert.ok(listed.includes("ep-02"), listed.join(","));
});

test("series_episode_new from a project inside the root makes no symlink", async () => {
  const r = await callTool("series_episode_new", { project: "direct", episode: 3, title: "Tập ba" }, env);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.result.linked, false);
  assert.ok(!lstatSync(join(root, "ep-03")).isSymbolicLink());
  assert.ok(existsSync(join(root, "ep-03", "BRIEF.md")));
  assert.ok(!existsSync(join(video, "ep-03")));
  assert.deepEqual(readdirSync(video).sort(), ["ep-01", "ep-02"]);
});
