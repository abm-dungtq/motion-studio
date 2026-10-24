// lib/assets/batch.mjs, routes/assets.mjs and lib/tools/assets.mjs: a batch of drawings runs in
// parallel up to the agent's slots, survives an account running out midway, checks and keys
// every image, and spends nothing before the user's yes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { dropCache } from "../lib/agents/index.mjs";
import { batchStatus, estimate, estimateTitle, runBatch, validateBatch } from "../lib/assets/batch.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakeAgents, PNG_1PX } from "./fake-cli.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const A = await adapterFor({});
let tmp, seriesDir, series;

// A series folder with stand-ins for its keying tools: they write what they were asked to.
const KEY_TOOL = `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
const { values: a } = parseArgs({ options: { in: { type: "string" }, out: { type: "string" }, height: { type: "string" }, width: { type: "string" }, preview: { type: "string" }, w: { type: "string" }, h: { type: "string" } } });
if (process.env.FAKE_KEY_FAIL) { console.error("không tách được nền"); process.exit(4); }
for (const f of [a.out, a.preview].filter(Boolean)) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(a)); }
console.log("wrote " + a.out);
`;
const DECL = {
  schema: "fake/series@1", name: "Thử", characters: "characters",
  read: ["refs", "characters"], writable: { refs: "refs", rig_src: "characters/{char}" },
  image_styles: { pose: "POSE STYLE flat green", background: "BG STYLE" },
  tools: {
    "import-sprite": { file: "tools/import-sprite.mjs", flags: { "--in": "path:read", "--out": "path:write", "--height": "int", "--width": "int", "--preview": "path:write" }, writes: ["{project}/assets/gen"] },
    quantize: { file: "tools/quantize.mjs", flags: { "--in": "path:read", "--out": "path:write", "--w": "int", "--h": "int" }, writes: ["{project}/assets/gen"] },
  },
};
function makeSeries(dir) {
  mkdirSync(join(dir, "tools"), { recursive: true });
  mkdirSync(join(dir, "refs", "hero"), { recursive: true });
  mkdirSync(join(dir, "characters", "hero"), { recursive: true });
  mkdirSync(join(dir, "build"), { recursive: true });
  mkdirSync(join(dir, "private"), { recursive: true });
  for (const f of ["refs/hero/design.png", "build/x.png", "private/x.png"]) writeFileSync(join(dir, f), Buffer.from(PNG_1PX, "base64"));
  writeFileSync(join(dir, "tools", "import-sprite.mjs"), KEY_TOOL);
  writeFileSync(join(dir, "tools", "quantize.mjs"), KEY_TOOL);
  writeFileSync(join(dir, "studio-series.json"), JSON.stringify(DECL, null, 2));
}
function makeProject(dir, items, name = "dot") {
  mkdirSync(join(dir, "assets", "gen", "batches"), { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: Tập thử\nseries: ${seriesDir}\n---\n`);
  writeFileSync(join(dir, "project.json"), "{}");
  writeFileSync(join(dir, "assets", "gen", "batches", `${name}.json`), JSON.stringify(items, null, 2));
  return dir;
}
const pose = (id, over = {}) => ({ id, kind: "pose", character: "hero", prompt: `hero ${id}`, refs: ["S/refs/hero/design.png"], target: `S/refs/hero/poses/${id}.png`, import: { height: 195 }, ...over });
const freshProject = (items, name) => makeProject(mkdtempSync(join(tmp, "pj-")), items, name);
// The highest number of exec runs of cli in flight at once, from the fake log ("end" lines).
const maxOverlap = (f, cli) => {
  let n = 0, max = 0;
  for (const l of f.calls().split("\n")) {
    if (l.startsWith(`${cli} exec `)) max = Math.max(max, ++n);
    else if (l === `end ${cli}`) n--;
  }
  return max;
};
const opts = (f, dir, over = {}) => ({ projectDir: dir, root: tmp, series, batch: "dot", actor: "human", env: f.env, quotaWaitMs: 50, quotaMaxMs: 2000, ...over });
// Fake CLIs whose image check is read by agy (the fake codex-pool answers no JSON when reading).
const fake = (vars, { only, parallel } = {}) => {
  const f = fakeAgents({ ...(only ? { only } : {}), vars: { FAKE_AGY: "check", ...vars } });
  writeFileSync(f.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { vision: ["agy"] }, ...(parallel ? { parallel } : {}) } }));
  return f;
};

before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-asset-batch-")));
  seriesDir = join(tmp, "series");
  makeSeries(seriesDir);
  series = { dir: seriesDir, config: DECL };
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test("a batch file is checked before anything runs: ids, kinds, refs in read folders, targets in writable ones", () => {
  const dir = freshProject([pose("a")]);
  const ok = validateBatch([pose("a"), { id: "nen", kind: "background", prompt: "a street" }], { series, projectDir: dir });
  assert.equal(ok[0].abs_refs[0], join(seriesDir, "refs", "hero", "design.png"));
  assert.equal(ok[0].abs_target, join(seriesDir, "refs", "hero", "poses", "a.png"));
  assert.equal(ok[0].background, "green");
  assert.equal(ok[1].background, "none", "a background is not drawn on green");
  const no = (items, re) => assert.throws(() => validateBatch(items, { series, projectDir: dir }), re);
  no([], /ít nhất một ảnh/);
  no([pose("a"), pose("a")], /trùng/);
  no([pose("Bad id")], /id/);
  no([pose("a", { kind: "video" })], /kind/);
  no([pose("a", { refs: ["S/private/x.png"] })], /read/);
  no([pose("a", { refs: ["S/build/x.png"] })], /S\/build/);
  no([pose("a", { refs: ["S/refs/../private/x.png"] })], /không hợp lệ/);
  no([pose("a", { refs: ["/etc/hosts"] })], /tương đối/);
  no([pose("a", { refs: ["S/refs/hero/none.png"] })], /không có file/);
  no([pose("a", { target: "S/private/a.png" })], /writable/);
  no([pose("a", { target: "assets/a.png" })], /S\/<đường>/);
  no([pose("a", { import: {} })], /import\.height/);
  no([pose("a", { character: undefined })], /character/);
  no(Array.from({ length: 51 }, (_, i) => pose(`p${i}`)), /tối đa 50/);
  assert.throws(() => validateBatch([pose("a")], { series: null, projectDir: dir }), /series/);
  const est = estimate(ok, { agents: [{ id: "codex-pool", found: true, logged_in: true, caps: { image: "yes" }, quota: { accounts: [{ name: "acct1", ok: true, h5: 38, reset_h5: "x" }, { name: "acct2", ok: true, h5: null }] } }], order: { image: ["codex-pool"] } });
  // Each image: a drawing and a reading, both again when the check fails; codex-pool does both.
  assert.deepEqual([est.images, est.codex_turns, est.codex_max, est.agent], [2, 2, 8, "codex-pool"]);
  assert.equal(estimateTitle("dot", est), "Đợt dot: 2 ảnh, codex-pool, ước 2 lượt vẽ, tối đa 8 lượt Codex (gồm vẽ lại tự động và đọc ảnh tự kiểm); acct1 còn 62% trong 5 giờ, acct2 chưa có số liệu");
  // Four images cost at most 16 Codex turns; readings that no Codex agent can do are left out.
  const agy = { id: "agy", found: true, logged_in: true, caps: { vision: "yes", image: "no" } };
  assert.equal(estimate([...ok, ...ok], { agents: [{ id: "codex-pool", found: true, logged_in: true, caps: { image: "yes" }, quota: { accounts: [{ name: "a", ok: true }] } }] }).codex_max, 16);
  assert.equal(estimate(ok, { agents: [{ id: "codex", found: true, logged_in: true, caps: { image: "yes", vision: "no" } }, agy] }).codex_max, 4);
  assert.equal(estimate(ok, { agents: [{ id: "gemini", found: true, logged_in: true, caps: { image: "yes" } }, agy] }).codex_max, 0);
  assert.equal(estimate(ok, null).codex_max, 8);
});

test("seven poses: parallel up to the slots, acct1 runs out midway, every image drawn, checked and keyed", async () => {
  const f = fake({ FAKE_DELAY: "0.3", FAKE_POOL_CREDITS: "3 20" });
  try {
    const items = Array.from({ length: 7 }, (_, i) => pose(`tu-the-${i + 1}`));
    const dir = freshProject(items);
    const r = await runBatch(opts(f, dir));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.counts, { keyed: 7 });
    const st = batchStatus(dir, "dot");
    assert.ok(st.items.every((x) => x.status === "keyed" && x.raw === `assets/gen/raw/${x.id}.png` && x.keyed === `assets/gen/keyed/${x.id}.pxl`), JSON.stringify(st.items));
    assert.equal(readdirSync(join(dir, "assets", "gen", "keyed")).filter((x) => x.endsWith(".pxl")).length, 7);
    assert.equal(listReceipts(dir, { op: "image-generate" }).length, 7);
    assert.equal(listReceipts(dir, { op: "image-check" }).length, 7);
    assert.equal(listReceipts(dir, { op: "series-tool" }).length, 7);
    assert.match(f.calls(), /stdin=Use your image generation tool to create ONE image\. hero tu-the-1\s+POSE STYLE flat green/);
    assert.equal(Number(readFileSync(`${f.log}.acct1`, "utf8")), 3);
    assert.equal(Number(readFileSync(`${f.log}.acct2`, "utf8")), 4, "the rest went to acct2 after acct1 ran out");
    assert.equal(maxOverlap(f, "codex-pool"), 2, "two accounts that can run: two drawings at once, never more");
    // Nothing was copied into the series folder.
    assert.equal(existsSync(join(seriesDir, "refs", "hero", "poses")), false);
  } finally { f.rm(); }
});

test("agents.parallel raises the slots and the batch never goes past them", async () => {
  const f = fake({ FAKE_DELAY: "0.3" }, { parallel: { "codex-pool": 3 } });
  try {
    const dir = freshProject(Array.from({ length: 7 }, (_, i) => pose(`p${i}`)));
    const r = await runBatch(opts(f, dir));
    assert.equal(r.passed, 7);
    assert.equal(maxOverlap(f, "codex-pool"), 3);
  } finally { f.rm(); }
});

test("a failed check redraws once with the note; failing twice leaves the image for the board", async () => {
  const once = fake({ FAKE_AGY_FAILS: "1" });
  try {
    const dir = freshProject([pose("a")]);
    const r = await runBatch(opts(once, dir));
    assert.equal(r.ok, true);
    const it = batchStatus(dir, "dot").items[0];
    assert.equal(it.status, "keyed");
    assert.equal(it.tries, 2);
    assert.deepEqual(it.reasons, ["có chữ ở góc"]);
    assert.equal(it.raw, "assets/gen/raw/a-2.png", "the second drawing is kept beside the first");
    assert.ok(existsSync(join(dir, "assets", "gen", "raw", "a.png")), "the first drawing is not deleted");
    assert.match(once.calls(), /Sửa lỗi lần trước: có chữ ở góc/);
  } finally { once.rm(); }
  const twice = fake({ FAKE_AGY_FAILS: "2" });
  try {
    const dir = freshProject([pose("a")]);
    const r = await runBatch(opts(twice, dir));
    assert.equal(r.ok, false);
    assert.deepEqual(r.counts, { needs_review: 1 });
    const it = batchStatus(dir, "dot").items[0];
    assert.equal(it.tries, 2, "only one automatic redraw");
    assert.equal(it.check.no_text, false);
    assert.equal(it.keyed, "assets/gen/keyed/a.pxl", "keyed anyway, so the board can show it");
  } finally { twice.rm(); }
});

test("a background is quantized, a screen card is kept as drawn, and a refusal fails that image only", async () => {
  const f = fake({});
  try {
    const dir = freshProject([{ id: "nen", kind: "background", prompt: "street" }, { id: "the", kind: "ui-card", prompt: "phone" }]);
    const r = await runBatch(opts(f, dir));
    assert.deepEqual(r.counts, { keyed: 1, ready: 1 });
    const [nen, the] = batchStatus(dir, "dot").items;
    assert.equal(nen.keyed, "assets/gen/keyed/nen.png");
    assert.deepEqual(JSON.parse(readFileSync(join(dir, nen.keyed), "utf8")), { in: join(dir, "assets/gen/raw/nen.png"), out: join(dir, "assets/gen/keyed/nen.png"), w: "480", h: "270" });
    assert.equal(the.keyed, null);
    assert.match(f.calls(), /no_text: no letters/);
    const checks = Object.fromEntries(listReceipts(dir, { op: "image-check" }).map((x) => [x.params.item, x.params.checks]));
    assert.deepEqual(checks, { nen: ["no_text"], the: ["flat_green", "no_text"] }, "no green check for a background, no figure check without a character");
  } finally { f.rm(); }
  const no = fake({ FAKE_IMAGE: "refuse" });
  try {
    const dir = freshProject([pose("a")]);
    const r = await runBatch(opts(no, dir));
    assert.deepEqual(r.counts, { failed: 1 });
    assert.match(batchStatus(dir, "dot").items[0].error, /từ chối/);
  } finally { no.rm(); }
});

test("with every account out the batch waits, then stops after the limit; turns coming back let it finish", async () => {
  const out = fake({ FAKE_POOL_CREDITS: "1 0" }, { only: ["codex-pool", "codex", "agy"] });
  try {
    const dir = freshProject([pose("a"), pose("b"), pose("c")]);
    const r = await runBatch(opts(out, dir, { quotaWaitMs: 50, quotaMaxMs: 300 }));
    assert.equal(r.stopped, true);
    assert.match(r.message, /Hết lượt vẽ ở mọi agent/);
    assert.equal(r.counts.keyed, 1);
    assert.equal(r.counts.waiting_quota, 2);
  } finally { out.rm(); }
  const back = fake({ FAKE_POOL_CREDITS: "0 5" }, { only: ["codex-pool", "codex", "agy"] });
  try {
    writeFileSync(`${back.log}.acct2`, "5");
    const dir = freshProject([pose("a")]);
    // codex-pool keeps a status answer for 5 s, so the first look after the wait sees the reset.
    setTimeout(() => writeFileSync(`${back.log}.acct2`, "0"), 1000);
    const r = await runBatch(opts(back, dir, { quotaWaitMs: 5500, quotaMaxMs: 20000 }));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(batchStatus(dir, "dot").items[0].status, "keyed");
  } finally { back.rm(); }
});

// ---- over HTTP and through the tools -----------------------------------------------------------
const TOKEN = "b".repeat(64);
const http = (port, method, path, body) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  if (data) req.write(data);
  req.end();
});

test("asset_batch only asks; the yes starts the job, the director gets a request, asset_redo stops after three", async () => {
  const f = fake({});
  const plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  // A request queue that leaves a line per enqueued request, to see what the director gets.
  const api = join(plugin, "scripts", "studio-api.mjs");
  const queued = join(tmp, "queued.jsonl");
  writeFileSync(api, readFileSync(api, "utf8").replace("export const enqueue = () => null;", `import { appendFileSync as _qa } from "node:fs";\nexport const enqueue = (dir, r) => { _qa(${JSON.stringify(queued)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", ...r }; };`));
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { OPUS_VIDEO_HOME: plugin });
  dropCache();
  const root = join(tmp, "root");
  mkdirSync(root, { recursive: true });
  makeProject(join(root, "ep"), [pose("a"), pose("b")]);
  const P = await A.create({ OPUS_VIDEO_HOME: plugin });
  const server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const env = { ...toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) }), actor: "director", request: "r-9" };
  const jobDone = async (id) => {
    for (let i = 0; i < 300; i++) {
      const j = (await http(port, "GET", "/api/jobs?name=ep")).json.find((x) => x.id === id);
      if (j && j.status !== "running") return j;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${id} still running`);
  };
  try {
    const t = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    assert.equal(t.ok, true, t.error);
    assert.equal(t.result.waiting_consent, true);
    assert.equal(t.result.estimate.images, 2);
    assert.match(t.result.consent.title, /^Đợt dot: 2 ảnh, codex-pool, ước 2 lượt vẽ, tối đa 4 lượt Codex \(gồm vẽ lại tự động và đọc ảnh tự kiểm\); acct1 còn 62% trong 5 giờ/);
    assert.equal(t.result.message, "Chờ người dùng bấm Đồng ý ở tab Tài sản");
    assert.doesNotMatch(f.calls(), / exec /, "no drawing before the answer");
    const again = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    assert.equal(again.result.consent.id, t.result.consent.id, "one waiting card per batch");
    const list = await http(port, "GET", "/api/assets?name=ep");
    assert.equal(list.json.batches[0].consent.id, t.result.consent.id);
    assert.equal(list.json.batches[0].items[0].status, "new");
    const bad = await callTool("asset_batch", { project: "ep", batch: "../x" }, env);
    assert.match(bad.error, /tên đợt/);

    const yes = await http(port, "POST", "/api/consent/answer", { name: "ep", id: t.result.consent.id, ok: true });
    assert.equal(yes.status, 200, yes.text);
    assert.equal(yes.json.job.kind, "asset-batch");
    const j = await jobDone(yes.json.job.id);
    assert.equal(j.code, 0, j.tail.join("\n"));
    const st = await callTool("asset_status", { project: "ep", batch: "dot" }, env);
    assert.deepEqual(st.result.items.map((x) => x.status), ["keyed", "keyed"]);
    assert.equal(listReceipts(join(root, "ep"), { op: "image-generate" }).length, 2);
    // The director was asked to carry on.
    await new Promise((r) => setTimeout(r, 100));
    const req = readFileSync(queued, "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
    assert.equal(req.text, "Đợt dot xong: 2 ảnh đạt, 0 ảnh cần xem. Gọi asset_status rồi làm tiếp (nhập rig, nền, đạo cụ) sau khi người dùng duyệt bảng.");

    // The director redraws one image itself, three times at most.
    const before = readFileSync(queued, "utf8");
    for (let i = 1; i <= 3; i++) {
      const r = await callTool("asset_redo", { project: "ep", batch: "dot", id: "a", reason: "tay trái to quá" }, env);
      assert.equal(r.ok, true, r.error);
      assert.equal(r.result.item.status, "keyed");
      assert.equal(r.result.item.ai_redos, i);
      assert.equal(r.result.item.raw, `assets/gen/raw/a-${i + 1}.png`);
    }
    assert.match(f.calls(), /Sửa theo góp ý: tay trái to quá/);
    const fourth = await callTool("asset_redo", { project: "ep", batch: "dot", id: "a", reason: "nữa" }, env);
    assert.match(fourth.error, /cần người dùng xem/);
    assert.equal(readFileSync(queued, "utf8"), before, "the director's own redraws queue nothing");
    // The user's click is not limited and needs no second card.
    const user = await http(port, "POST", "/api/assets/redo", { name: "ep", batch: "dot", ids: ["a"], reason: "sửa nữa" });
    assert.equal(user.status, 200, user.text);
    await jobDone(user.json.job.id);
    assert.equal((await http(port, "POST", "/api/assets/redo", { name: "ep", batch: "dot", ids: ["zz"] })).status, 400);
    assert.equal(listReceipts(join(root, "ep"), { op: "consent" }).length, 1);
  } finally {
    server.closeAllConnections?.(); server.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    dropCache();
    rmSync(plugin, { recursive: true, force: true }); f.rm();
  }
});
