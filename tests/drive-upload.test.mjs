// lib/drive.mjs and the Drive row of routes/delivery.mjs: the delivery folder uploaded with gws
// (here tests/fake-gws.mjs). The account is checked before any write, the folder made once, sizes
// compared; nothing is written without the user's card; no token reaches a receipt or a job log.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { driveUpload, gwsCommand } from "../lib/drive.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-gws.mjs", import.meta.url));
const A = await adapterFor({});
const TOKEN = "g".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_GWS", "FAKE_GWS_STATE", "FAKE_GWS_EMAIL", "FAKE_GWS_SKEW", "FAKE_GWS_FAIL"];
let tmp, saved, plugin, series, root, ep, out, server, port;

const gws = { cmd: process.execPath, pre: [FAKE] };
const stateOf = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { folders: [], files: [], calls: [] });
const writes = (f) => stateOf(f).calls.filter((c) => c[2] === "create");
function folder(name, files) {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), body);
  return d;
}
const list = (d) => readdirSync(d).sort().map((name) => ({ name }));
const envFor = (state, more = {}) => ({ ...process.env, FAKE_GWS_STATE: state, FAKE_GWS_EMAIL: "Someone@Example.com", ...more });

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
async function jobDone(id) {
  for (let i = 0; i < 300; i++) {
    const j = (await http("GET", "/api/jobs?name=ep")).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} still running`);
}

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-drive-")));
});
after(() => {
  if (server) { server.closeAllConnections?.(); server.close(); }
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true });
  if (plugin) rmSync(plugin, { recursive: true, force: true });
});

test("the gws command: MOTION_STUDIO_GWS (a .mjs runs under node), else gws on the search path", () => {
  assert.deepEqual(gwsCommand({ MOTION_STUDIO_GWS: FAKE }), { cmd: process.execPath, pre: [FAKE] });
  assert.deepEqual(gwsCommand({ MOTION_STUDIO_GWS: "/opt/gws" }), { cmd: "/opt/gws", pre: [] });
  assert.equal(gwsCommand({ MOTION_STUDIO_AGENT_PATH: join(tmp, "nothing"), PATH: join(tmp, "nothing") }), null);
});

test("another signed-in account stops before any write, with both emails masked", async () => {
  const state = join(tmp, "wrong.json");
  const d = folder("wrong", { "a.md": "x" });
  const r = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", gws, env: envFor(state, { FAKE_GWS_EMAIL: "other@gmail.com" }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "account");
  assert.match(r.error, /oth…@gmail\.com.*som…@example\.com/);
  assert.doesNotMatch(r.error, /other@gmail\.com/);
  assert.deepEqual(writes(state), []);
});

test("the folder is made once and reused; a file already there is not sent again; sizes are compared", async () => {
  const state = join(tmp, "ok.json");
  const d = folder("ok", { "ep-youtube.mp4": "video bytes", "tieu-de-mo-ta.md": "## title\n" });
  const first = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", gws, env: envFor(state) });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.folder_created, true);
  assert.deepEqual(first.files.map((f) => [f.name, f.size, f.remote_size, f.result]), [["ep-youtube.mp4", 11, 11, "đã tải, khớp kích thước"], ["tieu-de-mo-ta.md", 9, 9, "đã tải, khớp kích thước"]]);
  assert.match(first.files[0].link, /^https:\/\/drive\.example\//);
  const s1 = stateOf(state);
  assert.deepEqual([s1.folders.length, s1.files.length], [1, 2]);
  assert.ok(s1.files.every((f) => f.parent === s1.folders[0].id));
  // The upload ran in the delivery folder with a bare file name (gws refuses paths outside its cwd).
  assert.ok(s1.calls.some((c) => c.includes("--upload") && c[c.indexOf("--upload") + 1] === "ep-youtube.mp4"));

  writeFileSync(join(d, "ep.srt"), "1\n");
  const second = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", gws, env: envFor(state) });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.folder_created, false);
  assert.deepEqual(second.files.map((f) => f.result), ["đã có trên Drive", "đã tải, khớp kích thước", "đã có trên Drive"]);
  const s2 = stateOf(state);
  assert.deepEqual([s2.folders.length, s2.files.length], [1, 3]);

  const skew = folder("skew", { "a.jpg": "jpg", "b.srt": "srt" });
  const r = await driveUpload({ dir: skew, files: list(skew), account: "someone@example.com", folder: "lech", gws, env: envFor(join(tmp, "skew.json"), { FAKE_GWS_SKEW: "b.srt" }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "size");
  assert.deepEqual(r.files.map((f) => [f.name, f.ok]), [["a.jpg", true], ["b.srt", false]]);
  assert.match(r.files[1].error, /máy 3 byte, Drive 4 byte/);
});

test("dry_run sends gws' --dry-run on every write and makes nothing", async () => {
  const state = join(tmp, "dry.json");
  const d = folder("dry", { "a.md": "x", "b.jpg": "yy" });
  const r = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", dryRun: true, gws, env: envFor(state) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.dry_run, true);
  assert.deepEqual(r.files.map((f) => f.result), ["chạy khô: gws nhận lệnh", "chạy khô: gws nhận lệnh"]);
  const s = stateOf(state);
  assert.deepEqual([s.folders.length, s.files.length], [0, 0]);
  assert.ok(writes(state).length === 3 && writes(state).every((c) => c.includes("--dry-run")));
});

test("a gws failure is an answer, never a throw, and its stderr is redacted", async () => {
  const d = folder("fail", { "a.md": "x" });
  const r = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", gws, env: envFor(join(tmp, "fail.json"), { FAKE_GWS_FAIL: "4" }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "gws-4");
  assert.doesNotMatch(JSON.stringify(r), /ya29\.FAKE|access_token=ya29/);
  const none = await driveUpload({ dir: d, files: list(d), account: "someone@example.com", folder: "thu", gws: null });
  assert.equal(none.code, "no-gws");
  await assert.rejects(() => driveUpload({ dir: d, files: [], account: "a@b.c", folder: "x", gws }), /chưa có file/);
});

test("over HTTP: no write before the card; the yes uploads; receipts and job logs hold no token", async () => {
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true, gateway: true });
  const state = join(tmp, "http.json");
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_GWS: FAKE, FAKE_GWS_STATE: state, FAKE_GWS_EMAIL: "someone@example.com" });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(ep, { recursive: true });
  writeFileSync(join(ep, "BRIEF.md"), `---\ntitle: x\nseries: ${series}\nepisode: 7\n---\n`);
  out = join(series, "delivery", "tap-7");
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;

  assert.equal((await http("POST", "/api/delivery/drive", { name: "ep" })).status, 409, "an empty folder has nothing to send");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ep-youtube.mp4"), "v".repeat(2048));
  writeFileSync(join(out, "thumbnail.jpg"), "j");
  writeFileSync(join(out, ".DS_Store"), "skip");

  const card = await http("POST", "/api/delivery/drive", { name: "ep" });
  assert.equal(card.status, 200, card.text);
  assert.equal(card.json.consent.kind, "drive");
  assert.equal(card.json.consent.title, "Tải 2 file (0.0 MB) lên Drive som…@example.com/thu");
  assert.deepEqual(stateOf(state).calls, [], "no gws call at all before the answer");

  const dry = await http("POST", "/api/delivery/drive", { name: "ep", dry_run: true });
  const dj = await jobDone(dry.json.job.id);
  assert.equal(dj.code, 0, dj.tail.join("\n"));
  assert.deepEqual(stateOf(state).files, []);

  // A file added to the folder after the card: the yes sends nothing, a fresh card names it.
  writeFileSync(join(out, "extra.mp4"), "x".repeat(4096));
  const stale = await http("POST", "/api/consent/answer", { name: "ep", id: card.json.consent.id, ok: true });
  assert.equal(stale.status, 409, stale.text);
  assert.deepEqual(stale.json.consent.estimate.files, ["ep-youtube.mp4", "extra.mp4", "thumbnail.jpg"]);
  assert.deepEqual(stateOf(state).files, [], "nothing uploaded on a changed folder");
  rmSync(join(out, "extra.mp4"));
  const card2 = await http("POST", "/api/delivery/drive", { name: "ep" });
  const yes = await http("POST", "/api/consent/answer", { name: "ep", id: card2.json.consent.id, ok: true });
  assert.equal(yes.status, 200, yes.text);
  const j = await jobDone(yes.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  assert.deepEqual(stateOf(state).files.map((f) => [f.name, f.size]), [["ep-youtube.mp4", 2048], ["thumbnail.jpg", 1]]);

  const rdir = join(ep, ".opus", "receipts");
  const all = readdirSync(rdir, { recursive: true }).map((f) => join(rdir, f)).filter((f) => statSync(f).isFile()).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /access_token|ya29\./);
  assert.doesNotMatch(j.tail.join("\n") + dj.tail.join("\n"), /access_token|ya29\./);
  const st = await http("GET", "/api/delivery?name=ep");
  assert.deepEqual(st.json.rows.drive.files, ["ep-youtube.mp4", "thumbnail.jpg"]);
  assert.equal(st.json.rows.drive.last.ok, true);
});
