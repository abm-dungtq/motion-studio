// POST /api/assets/approve: approving a board copies the images into the series without ever
// writing over a different file, records the character's approval (keeping the old one), notes it
// in DEMO.md above ## Frames, and leaves every raw drawing of the project in place.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { cancel, running, startJob } from "../jobs.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { dropCache } from "../lib/agents/index.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { approvedFiles } from "../lib/ledger.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "c".repeat(64);
const DEMO = "# DEMO\n\napproval: pending\n\n## Frames\n\n- demo/f1.png\n";
let tmp, seriesDir, root, server, port, plugin;
const saved = { ...process.env };

const http = (method, path, body) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  if (data) req.write(data);
  req.end();
});

const pose = (id, char = "thu") => ({ id, kind: "pose", character: char, prompt: `${char} ${id}`, target: `S/refs/${char}/${id}.png`, import: { height: 195 } });
const bg = (id, over = {}) => ({ id, kind: "background", prompt: `nền ${id}`, ...over });
const prop = (id) => ({ id, kind: "prop", prompt: `đạo cụ ${id}`, import: { width: 40 } });

// A project whose batch already ran: files under assets/gen and the state file, as the job leaves
// them. Each image's bytes are its id, so two images never share a sha.
function project(name, items, statuses) {
  const dir = join(root, name);
  mkdirSync(join(dir, "assets", "gen", "batches"), { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: Tập thử\nseries: ${seriesDir}\n---\n`);
  writeFileSync(join(dir, "project.json"), "{}");
  writeFileSync(join(dir, "DEMO.md"), DEMO);
  writeFileSync(join(dir, "assets", "gen", "batches", "dot.json"), JSON.stringify(items));
  const state = { batch: "dot", started: "x", ended: "y", running: false, stopped: false, message: null, items: {} };
  for (const it of items) {
    const ext = it.kind === "background" ? "png" : "pxl";
    const files = { raw: `assets/gen/raw/${it.id}.png`, preview: `assets/gen/keyed/${it.id}.png`, keyed: `assets/gen/keyed/${it.id}.${ext}` };
    // A background's keyed image is its preview: keyed is written last.
    for (const [k, f] of Object.entries(files)) { mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), `${k}:${it.id}`); }
    state.items[it.id] = { status: statuses[it.id] ?? "keyed", ...files, tries: 1, reasons: [], error: null, check: null, ai_redos: 0 };
  }
  mkdirSync(join(dir, ".opus", "assets"), { recursive: true });
  writeFileSync(join(dir, ".opus", "assets", "dot.json"), JSON.stringify(state));
  return dir;
}
const rawList = (dir) => readdirSync(join(dir, "assets", "gen", "raw")).sort();
const state = (dir) => JSON.parse(readFileSync(join(dir, ".opus", "assets", "dot.json"), "utf8"));

before(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-asset-approve-")));
  seriesDir = join(tmp, "series");
  cpSync(FIXTURE, seriesDir, { recursive: true });
  // The fixture series plus the keying tools a batch needs and a writable backgrounds folder.
  const decl = JSON.parse(readFileSync(join(seriesDir, "studio-series.json"), "utf8"));
  decl.writable.backgrounds = "backgrounds";
  decl.tools["import-sprite"] = { file: "tools/echo-args.mjs", flags: { "--in": "path:read", "--out": "path:write", "--height": "int", "--width": "int", "--preview": "path:write" }, writes: ["{project}/assets/gen"] };
  decl.tools.quantize = { file: "tools/echo-args.mjs", flags: { "--in": "path:read", "--out": "path:write", "--w": "int", "--h": "int" }, writes: ["{project}/assets/gen"] };
  writeFileSync(join(seriesDir, "studio-series.json"), JSON.stringify(decl, null, 2));
  mkdirSync(join(seriesDir, "backgrounds"), { recursive: true });
  root = join(tmp, "root");
  mkdirSync(root, { recursive: true });
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  // runner mcp: the request for the director stays queued instead of starting one.
  writeFileSync(join(tmp, "studio.json"), JSON.stringify({ director: { runner: "mcp" } }));
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json") });
  dropCache();
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  dropCache();
  rmSync(plugin, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
});

test("approving a new character sheet copies the raw drawings and writes approval.json with the date", async () => {
  const dir = project("ep-new", [pose("ngoi"), pose("dung"), pose("khac", "villain")], { dung: "needs_review" });
  const before = rawList(dir);
  const r = await http("POST", "/api/assets/approve", { name: "ep-new", batch: "dot", board: "character:thu", ids: ["ngoi", "dung"], notes: "ổn,\n giữ màu áo" });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.copied, ["S/refs/thu/ngoi.png", "S/refs/thu/dung.png"]);
  assert.equal(readFileSync(join(seriesDir, "refs", "thu", "ngoi.png"), "utf8"), "raw:ngoi");
  const a = JSON.parse(readFileSync(join(seriesDir, "characters", "thu", "approval.json"), "utf8"));
  assert.equal(a.approved, true);
  assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(a.by, "user@studio");
  assert.equal(a.notes, "ổn, giữ màu áo");
  assert.deepEqual(a.images, ["S/refs/thu/ngoi.png", "S/refs/thu/dung.png"]);
  assert.ok(approvedFiles(seriesDir)["refs/thu/ngoi.png"], "an approved pose is recorded");
  assert.equal(a.previous, null);
  assert.deepEqual(readdirSync(join(seriesDir, "characters", "thu")), ["approval.json"], "a new character folder holds only approval.json");
  const st = state(dir);
  assert.deepEqual([st.items.ngoi.status, st.items.dung.status, st.items.khac.status], ["approved", "approved", "keyed"]);
  assert.match(readFileSync(join(dir, "DEMO.md"), "utf8"), /^approval: pending\n\n- tài sản character:thu: approved user@studio \d{4}-\d\d-\d\dT[\d:.]+Z ngoi, dung\n\n## Frames\n/m);
  const rc = listReceipts(dir, { op: "asset-approve" });
  assert.equal(rc.length, 1);
  assert.deepEqual(rc[0].params.ids, ["ngoi", "dung"]);
  assert.deepEqual(rawList(dir), before, "no raw drawing is removed");
  // Approved once is not approved again; a pose of another character is not on this board.
  assert.equal((await http("POST", "/api/assets/approve", { name: "ep-new", batch: "dot", board: "character:thu", ids: ["ngoi"] })).status, 409);
  assert.equal((await http("POST", "/api/assets/approve", { name: "ep-new", batch: "dot", board: "character:thu", ids: ["khac"] })).status, 400);
});

test("approving a character that already has an approval keeps the old one as previous", async () => {
  const old = { approved: true, date: "2026-10-01", by: "user@studio", images: ["S/refs/villain/old.png"], rig: "v1" };
  mkdirSync(join(seriesDir, "characters", "villain"), { recursive: true });
  writeFileSync(join(seriesDir, "characters", "villain", "approval.json"), JSON.stringify(old));
  project("ep-again", [pose("cuoi", "villain")], {});
  const r = await http("POST", "/api/assets/approve", { name: "ep-again", batch: "dot", board: "character:villain", ids: ["cuoi"] });
  assert.equal(r.status, 200, r.text);
  const a = JSON.parse(readFileSync(join(seriesDir, "characters", "villain", "approval.json"), "utf8"));
  assert.equal(a.rig, "v1", "the old content stays");
  assert.deepEqual(a.previous, old);
  assert.deepEqual(a.images, ["S/refs/villain/cuoi.png"]);
  assert.notEqual(a.date, "2026-10-01");
});

test("a destination that holds a different file is refused and nothing is written", async () => {
  writeFileSync(join(seriesDir, "backgrounds", "pho.png"), "nền tập 1");
  const dir = project("ep-clash", [bg("bg-pho"), bg("bg-cho")], {});
  const r = await http("POST", "/api/assets/approve", { name: "ep-clash", batch: "dot", board: "background", ids: ["bg-cho", "bg-pho"] });
  assert.equal(r.status, 409, r.text);
  assert.match(r.json.error, /S\/backgrounds\/pho\.png đã có một file khác/);
  assert.equal(readFileSync(join(seriesDir, "backgrounds", "pho.png"), "utf8"), "nền tập 1");
  assert.equal(existsSync(join(seriesDir, "backgrounds", "cho.png")), false, "the other image waits too");
  assert.equal(existsSync(join(dir, "assets", "bg")), false);
  assert.equal(state(dir).items["bg-cho"].status, "keyed");
  assert.equal(readFileSync(join(dir, "DEMO.md"), "utf8"), DEMO);
  assert.equal(listReceipts(dir, { op: "asset-approve" }).length, 0);
});

test("backgrounds go to the series and assets/bg, props to the props folder; the same file again is fine", async () => {
  const dir = project("ep-bg", [bg("bg-san"), bg("cong", { target: "S/backgrounds/cong-truong.png" }), prop("prop-ly"), prop("dt")], {});
  const before = rawList(dir);
  const b = await http("POST", "/api/assets/approve", { name: "ep-bg", batch: "dot", board: "background", ids: ["bg-san", "cong"] });
  assert.equal(b.status, 200, b.text);
  assert.equal(readFileSync(join(seriesDir, "backgrounds", "san.png"), "utf8"), "keyed:bg-san");
  assert.equal(readFileSync(join(seriesDir, "backgrounds", "cong-truong.png"), "utf8"), "keyed:cong");
  assert.equal(readFileSync(join(dir, "assets", "bg", "san.png"), "utf8"), "keyed:bg-san");
  assert.equal(readFileSync(join(dir, "assets", "bg", "cong-truong.png"), "utf8"), "keyed:cong");
  const p = await http("POST", "/api/assets/approve", { name: "ep-bg", batch: "dot", board: "prop", ids: ["prop-ly", "dt"] });
  assert.equal(p.status, 200, p.text);
  assert.equal(readFileSync(join(seriesDir, "props", "ly.pxl"), "utf8"), "keyed:prop-ly");
  assert.equal(readFileSync(join(seriesDir, "props", "dt.pxl"), "utf8"), "keyed:dt");
  assert.equal(p.json.approval, null);
  const demo = readFileSync(join(dir, "DEMO.md"), "utf8");
  assert.ok(demo.indexOf("tài sản background:") < demo.indexOf("tài sản prop:") && demo.indexOf("tài sản prop:") < demo.indexOf("## Frames"));
  // A second project approving the very same bytes is not a clash.
  const dir2 = project("ep-same", [bg("bg-san")], {});
  writeFileSync(join(dir2, "assets", "gen", "keyed", "bg-san.png"), "keyed:bg-san");
  const same = await http("POST", "/api/assets/approve", { name: "ep-same", batch: "dot", board: "background", ids: ["bg-san"] });
  assert.equal(same.status, 200, same.text);
  assert.deepEqual(same.json.copied, ["assets/bg/san.png"]);
  assert.deepEqual(rawList(dir), before);
  // Studio remembers what went into the series, outside it: series_file_put never writes these.
  const held = approvedFiles(seriesDir);
  for (const rel of ["backgrounds/san.png", "backgrounds/cong-truong.png", "props/ly.pxl", "props/dt.pxl"]) assert.match(held[rel] ?? "", /^[a-f0-9]{64}$/, rel);
  assert.ok(!Object.keys(held).some((k) => k.startsWith("assets/")), "the project's own copy is not the series'");
});

test("bad requests: unknown board, image not keyed yet, a running batch", async () => {
  const dir = project("ep-bad", [pose("a"), pose("b")], { b: "drawing" });
  const no = async (body, status, re) => {
    const r = await http("POST", "/api/assets/approve", { name: "ep-bad", batch: "dot", ...body });
    assert.equal(r.status, status, r.text);
    assert.match(r.json.error, re);
  };
  await no({ board: "nhan-vat", ids: ["a"] }, 400, /board là/);
  await no({ board: "character:Thu", ids: ["a"] }, 400, /board là/);
  await no({ board: "character:thu", ids: [] }, 400, /ids/);
  await no({ board: "character:thu", ids: ["zz"] }, 400, /không có ảnh zz/);
  await no({ board: "character:thu", ids: ["b"] }, 409, /đang drawing/);
  await no({ board: "prop", ids: ["a"] }, 400, /không thuộc bảng prop/);
  // A live batch job of the project holds the board.
  const job = startJob({ name: "ep-bad", kind: "asset-batch", cmd: process.execPath, args: ["-e", "setTimeout(() => {}, 30000)"], cwd: dir });
  try { await no({ board: "character:thu", ids: ["a"] }, 409, /đang chạy một đợt ảnh/); } finally { cancel(job.id); }
  for (let i = 0; i < 100 && running("ep-bad", "asset-batch"); i++) await new Promise((r) => setTimeout(r, 20));
  // A state left running with no job behind it (Studio stopped under it) is interrupted, not held.
  const st = state(dir);
  st.running = true;
  writeFileSync(join(dir, ".opus", "assets", "dot.json"), JSON.stringify(st));
  const r = await http("POST", "/api/assets/approve", { name: "ep-bad", batch: "dot", board: "character:thu", ids: ["a"] });
  assert.equal(r.status, 200, r.text);
  const left = JSON.parse(readFileSync(join(dir, ".opus", "assets", "dot.json"), "utf8"));
  assert.equal(left.running, false);
  assert.equal(left.interrupted, true);
  assert.equal(left.items.b.status, "interrupted");
});

test("a redraw from the board needs a reason", async () => {
  project("ep-redo", [pose("a")], {});
  const r = await http("POST", "/api/assets/redo", { name: "ep-redo", batch: "dot", ids: ["a"], from: "board", reason: "  " });
  assert.equal(r.status, 400, r.text);
  assert.match(r.json.error, /lý do/);
});
