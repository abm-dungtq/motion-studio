// lib/assets/batch.mjs and routes/assets.mjs: a consent card runs only the batch it showed, a
// redraw without a card is only a redraw of an image a card paid for (counted where the director
// cannot write), a batch cut short is marked interrupted and can carry on, an image the reader
// could not read is not redrawn, and only a missing-text or one-figure failure redraws.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { dropCache } from "../lib/agents/index.mjs";
import { batchStatus, checkKeys, estimate, estimateTitle, readState, runBatch, validateBatch, writeState } from "../lib/assets/batch.mjs";
import { ledgerFile } from "../lib/ledger.mjs";
import { listCards } from "../lib/consent.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakeAgents, PNG_1PX } from "./fake-cli.mjs";
import { fakePlugin } from "./fake-plugin.mjs";
import { holdDirector } from "./director-job.mjs";
import { cancel, startJob } from "../jobs.mjs";

const A = await adapterFor({});
const TOKEN = "g".repeat(64);
let tmp, seriesDir, series;

const KEY_TOOL = `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
const { values: a } = parseArgs({ options: { in: { type: "string" }, out: { type: "string" }, height: { type: "string" }, width: { type: "string" }, preview: { type: "string" }, w: { type: "string" }, h: { type: "string" } } });
for (const f of [a.out, a.preview].filter(Boolean)) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(a)); }
`;
const DECL = {
  schema: "fake/series@1", name: "Thử", characters: "characters",
  read: ["refs", "characters", "style"], writable: { refs: "refs", rig_src: "characters/{char}" },
  tools: {
    "import-sprite": { file: "tools/import-sprite.mjs", flags: { "--in": "path:read", "--out": "path:write", "--height": "int", "--width": "int", "--preview": "path:write" }, writes: ["{project}/assets/gen"] },
    quantize: { file: "tools/quantize.mjs", flags: { "--in": "path:read", "--out": "path:write", "--w": "int", "--h": "int" }, writes: ["{project}/assets/gen"] },
  },
};
const png = (f) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, Buffer.from(PNG_1PX, "base64")); };
const pose = (id, over = {}) => ({ id, kind: "pose", character: "hero", prompt: `hero ${id}`, refs: ["S/refs/hero/design.png"], import: { height: 195 }, ...over });
function makeProject(dir, items, name = "dot") {
  mkdirSync(join(dir, "assets", "gen", "batches"), { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: Tập thử\nseries: ${seriesDir}\n---\n`);
  writeFileSync(join(dir, "project.json"), "{}");
  writeBatch(dir, items, name);
  return dir;
}
const writeBatch = (dir, items, name = "dot") => writeFileSync(join(dir, "assets", "gen", "batches", `${name}.json`), JSON.stringify(items, null, 2));
const fake = (vars, { only } = {}) => {
  const f = fakeAgents({ ...(only ? { only } : {}), vars: { FAKE_AGY: "check", ...vars } });
  writeFileSync(f.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { vision: ["agy"] } } }));
  return f;
};
const opts = (f, dir, over = {}) => ({ projectDir: dir, root: tmp, series, batch: "dot", actor: "human", env: f.env, quotaWaitMs: 50, quotaMaxMs: 2000, ...over });

before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-asset-guards-")));
  seriesDir = join(tmp, "series");
  mkdirSync(join(seriesDir, "tools"), { recursive: true });
  for (const f of ["refs/hero/design.png", "refs/hero-hd/front.png", "refs/heroine/x.png", "characters/hero/sheet.png", "style/line.png"]) png(join(seriesDir, f));
  writeFileSync(join(seriesDir, "tools", "import-sprite.mjs"), KEY_TOOL);
  writeFileSync(join(seriesDir, "tools", "quantize.mjs"), KEY_TOOL);
  writeFileSync(join(seriesDir, "studio-series.json"), JSON.stringify(DECL, null, 2));
  series = { dir: seriesDir, config: DECL };
});
after(() => rmSync(tmp, { recursive: true, force: true }));

// ---- what the reader checks and when it redraws --------------------------------------------------

test("right_character is checked only when a reference is the character's own (its refs or characters folder)", () => {
  const dir = makeProject(mkdtempSync(join(tmp, "pj-")), [pose("a")]);
  const keys = (refs) => checkKeys(validateBatch([pose("a", { refs })], { series, projectDir: dir })[0]);
  assert.deepEqual(keys(["S/refs/hero/design.png"]), ["right_character", "single_figure", "flat_green", "no_text"]);
  assert.ok(keys(["S/refs/hero-hd/front.png"]).includes("right_character"), "the -hd folder of the character is its own");
  assert.ok(keys(["S/characters/hero/sheet.png"]).includes("right_character"));
  assert.deepEqual(keys(["S/style/line.png"]), ["single_figure", "flat_green", "no_text"], "a line-style reference is not the character");
  assert.ok(!keys(["S/refs/heroine/x.png"]).includes("right_character"), "another character whose id starts the same is not it");
  assert.ok(!keys([]).includes("right_character"), "no reference, nothing to compare with");
});

test("only a no_text or single_figure failure redraws; flat_green or right_character goes to the board as drawn", async () => {
  for (const [key, redraw] of [["flat_green", false], ["right_character", false], ["single_figure", true], ["no_text", true]]) {
    const f = fake({ FAKE_AGY_FAILS: "1", FAKE_AGY_FAIL_KEY: key });
    try {
      const dir = makeProject(mkdtempSync(join(tmp, "pj-")), [pose("a")]);
      await runBatch(opts(f, dir));
      const it = batchStatus(dir, "dot").items[0];
      assert.equal(it.tries, redraw ? 2 : 1, `${key}: ${JSON.stringify(it)}`);
      assert.equal(it.status, redraw ? "keyed" : "needs_review", key);
      assert.equal(it.keyed, "assets/gen/keyed/a.pxl", `${key}: keyed so the board can show it`);
      assert.equal(listReceipts(dir, { op: "image-generate" }).length, redraw ? 2 : 1, key);
    } finally { f.rm(); }
  }
});

test("an image the reader could not read is not redrawn: it waits on the board as not checked", async () => {
  const f = fake({ FAKE_AGY: "quota" }, { only: ["codex-pool", "codex", "agy"] });
  // codex-pool draws; agy, the reader, is out of turns (and codex-pool answers no JSON when reading).
  writeFileSync(f.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { image: ["codex-pool"], vision: ["agy"] } } }));
  try {
    const dir = makeProject(mkdtempSync(join(tmp, "pj-")), [pose("a")]);
    const r = await runBatch(opts(f, dir));
    const it = batchStatus(dir, "dot").items[0];
    assert.equal(it.tries, 1, JSON.stringify(it));
    assert.equal(it.status, "needs_review");
    assert.equal(it.unchecked, true);
    assert.match(it.reasons.at(-1), /^chưa kiểm được/);
    assert.equal(listReceipts(dir, { op: "image-generate" }).length, 1, "one drawing, no redraw");
    assert.equal(r.review, 1);
  } finally { f.rm(); }
});

test("the card's most turns follow the redraw rule: every image can be redrawn once for text", () => {
  const dir = makeProject(mkdtempSync(join(tmp, "pj-")), [pose("a")]);
  const items = validateBatch([pose("a"), { id: "nen", kind: "background", prompt: "street" }], { series, projectDir: dir });
  const est = estimate(items, null);
  assert.deepEqual([est.codex_turns, est.codex_max], [2, 8]);
  assert.match(estimateTitle("dot", est), /tối đa 8 lượt Codex \(gồm một lần vẽ lại tự động khi ảnh có chữ hoặc sai số hình, và đọc ảnh tự kiểm\)/);
});

// ---- over HTTP ---------------------------------------------------------------------------------
const http = (port, method, path, body) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  if (data) req.write(data);
  req.end();
});

async function studio(vars, fn) {
  const f = fake(vars);
  const plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { OPUS_VIDEO_HOME: plugin });
  dropCache();
  const root = mkdtempSync(join(tmp, "root-"));
  const P = await A.create({ OPUS_VIDEO_HOME: plugin });
  const server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const env = { ...toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) }), actor: "director", request: "r-9" };
  const director = holdDirector("ep", "r-9");
  const call = (m, p, b) => http(port, m, p, b);
  const jobDone = async (name, id) => {
    for (let i = 0; i < 400; i++) {
      const j = (await call("GET", `/api/jobs?name=${name}`)).json.find((x) => x.id === id);
      if (j && j.status !== "running" && j.status !== "cancelling") return j;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${id} still running`);
  };
  try { await fn({ f, root, env, call, jobDone, port, P }); } finally {
    director.stop();
    server.closeAllConnections?.(); server.close();
    await new Promise((r) => setTimeout(r, 50));
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    dropCache();
    rmSync(plugin, { recursive: true, force: true }); f.rm();
  }
}

test("a card runs only the batch it showed: a changed file gets a new card, and a yes on the old one draws nothing", async () => {
  await studio({}, async ({ f, root, env, call, jobDone }) => {
    const dir = makeProject(join(root, "ep"), [pose("a"), pose("b")]);
    const first = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    assert.equal(first.result.consent.count, 2);
    writeBatch(dir, [pose("a"), pose("b"), pose("c")]);
    const second = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    assert.notEqual(second.result.consent.id, first.result.consent.id, "a waiting card of other content is not answered again");
    assert.equal(second.result.consent.count, 3);
    assert.deepEqual(listCards(dir, { status: "waiting" }).map((c) => c.id), [second.result.consent.id], "the old card is no longer waiting");
    // The file changes after the card: a yes runs nothing, answers 409 and a fresh card.
    writeBatch(dir, Array.from({ length: 20 }, (_, i) => pose(`p${i}`)));
    const stale = await call("POST", "/api/consent/answer", { name: "ep", id: second.result.consent.id, ok: true });
    assert.equal(stale.status, 409, stale.text);
    assert.match(stale.json.error, /đã đổi sau khi thẻ được tạo/);
    assert.doesNotMatch(f.calls(), / exec /, "nothing drawn");
    const fresh = listCards(dir, { status: "waiting" });
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].count, 20);
    assert.match(fresh[0].title, /20 ảnh/);
    const old = JSON.parse(readFileSync(join(dir, ".opus", "consent", `${second.result.consent.id}.json`), "utf8"));
    assert.equal(old.status, "declined");
    assert.equal(old.stale, true);
    // The fresh card, unchanged, runs.
    writeBatch(dir, [pose("a")]);
    const again = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    const yes = await call("POST", "/api/consent/answer", { name: "ep", id: again.result.consent.id, ok: true });
    assert.equal(yes.status, 200, yes.text);
    assert.equal((await jobDone("ep", yes.json.job.id)).code, 0);
    assert.equal(listReceipts(dir, { op: "image-generate" }).length, 1);
  });
});

test("a yes while another image batch of the project runs is a 409; the card waits on and runs later", async () => {
  await studio({}, async ({ f, root, env, call, jobDone }) => {
    const dir = makeProject(join(root, "ep"), [pose("a")]);
    const card = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    const other = startJob({ name: "ep", kind: "asset-batch", cmd: "/bin/sleep", args: ["600"], cwd: dir });
    let busy;
    try { busy = await call("POST", "/api/consent/answer", { name: "ep", id: card.result.consent.id, ok: true }); } finally { cancel(other.id); }
    assert.equal(busy.status, 409, busy.text);
    assert.match(busy.json.error, /ep đang chạy một đợt ảnh, chờ xong đã/);
    assert.doesNotMatch(f.calls(), / exec /);
    assert.deepEqual(listCards(dir, { status: "waiting" }).map((c) => c.id), [card.result.consent.id], "nothing ran, so the card can be answered again");
    await jobDone("ep", other.id);
    const yes = await call("POST", "/api/consent/answer", { name: "ep", id: card.result.consent.id, ok: true });
    assert.equal(yes.status, 200, yes.text);
    assert.equal((await jobDone("ep", yes.json.job.id)).code, 0);
  });
});

test("a redraw without a card is only for an image a card paid for; the count lives outside the project", async () => {
  await studio({}, async ({ f, root, env, call, jobDone }) => {
    const dir = makeProject(join(root, "ep"), [pose("a"), pose("b")]);
    // Never asked: no redraw of an image that was never drawn through a card.
    const first = await callTool("asset_redo", { project: "ep", batch: "dot", id: "a", reason: "vẽ đi" }, env);
    assert.match(first.error ?? "", /chưa được vẽ qua thẻ đồng ý/, JSON.stringify(first));
    assert.doesNotMatch(f.calls(), / exec /, "nothing drawn without a card");
    const card = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    const yes = await call("POST", "/api/consent/answer", { name: "ep", id: card.result.consent.id, ok: true });
    assert.equal((await jobDone("ep", yes.json.job.id)).code, 0);
    // An image added to the file after the card was never paid for.
    writeBatch(dir, [pose("a"), pose("b"), pose("c")]);
    const added = await callTool("asset_redo", { project: "ep", batch: "dot", id: "c", reason: "vẽ" }, env);
    assert.match(added.error ?? "", /chưa được vẽ qua thẻ đồng ý/);
    for (let i = 1; i <= 3; i++) {
      const r = await callTool("asset_redo", { project: "ep", batch: "dot", id: "a", reason: "tay to" }, env);
      assert.equal(r.ok, true, r.error);
      // Wiping the count in the project's own state file does not give redraws back.
      const st = readState(dir, "dot");
      st.items.a.ai_redos = 0;
      writeState(dir, "dot", st);
    }
    const fourth = await callTool("asset_redo", { project: "ep", batch: "dot", id: "a", reason: "nữa" }, env);
    assert.match(fourth.error ?? "", /cần người dùng xem/);
    // A copy of the batch under another name starts no new count: it was never paid for.
    writeFileSync(join(dir, "assets", "gen", "batches", "dot2.json"), readFileSync(join(dir, "assets", "gen", "batches", "dot.json")));
    const renamed = await callTool("asset_redo", { project: "ep", batch: "dot2", id: "a", reason: "lại" }, env);
    assert.match(renamed.error ?? "", /chưa được vẽ qua thẻ đồng ý/);
    // Where the count is kept: beside Studio's state file, not under the project.
    const ledger = ledgerFile(dir);
    assert.ok(existsSync(ledger));
    assert.ok(!ledger.startsWith(realpathSync(dir) + sep), ledger);
    assert.ok(ledger.startsWith(dirname(process.env.MOTION_STUDIO_STATE) + sep), ledger);
    // The user's own click is not limited.
    const user = await call("POST", "/api/assets/redo", { name: "ep", batch: "dot", ids: ["a"], reason: "sửa nữa", from: "board" });
    assert.equal(user.status, 200, user.text);
    await jobDone("ep", user.json.job.id);
  });
});

test("a batch cut short is marked interrupted, the buttons open again, and it carries on without redrawing what was drawn", async () => {
  await studio({ FAKE_DELAY: "1.5" }, async ({ root, env, call, jobDone }) => {
    const dir = makeProject(join(root, "ep"), [pose("a"), pose("b"), pose("c"), pose("d")]);
    const card = await callTool("asset_batch", { project: "ep", batch: "dot" }, env);
    const yes = await call("POST", "/api/consent/answer", { name: "ep", id: card.result.consent.id, ok: true });
    // Wait for the first two to be drawn, then stop the job as a restart of Studio would.
    for (let i = 0; i < 200 && !(readState(dir, "dot")?.items?.a?.status === "keyed" || readState(dir, "dot")?.items?.b?.status === "keyed"); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal((await call("POST", "/api/jobs/cancel", { name: "ep", id: yes.json.job.id })).status, 200);
    await jobDone("ep", yes.json.job.id);
    await new Promise((r) => setTimeout(r, 100));
    const st = readState(dir, "dot");
    assert.equal(st.running, false, JSON.stringify(st));
    assert.equal(st.interrupted, true);
    assert.match(st.message, /bị ngắt/);
    const done = Object.entries(st.items).filter(([, s]) => s.status === "keyed").map(([id]) => id);
    const left = Object.entries(st.items).filter(([, s]) => s.status === "interrupted").map(([id]) => id);
    assert.ok(done.length >= 1 && left.length >= 1, JSON.stringify(st.items));
    assert.equal(done.length + left.length, 4, JSON.stringify(st.items));
    const view = (await call("GET", "/api/assets?name=ep")).json.batches[0];
    assert.equal(view.running, false);
    assert.equal(view.interrupted, true);
    assert.equal(view.can_resume, true);
    const draws = listReceipts(dir, { op: "image-generate" }).length;
    const resumed = await call("POST", "/api/assets/resume", { name: "ep", batch: "dot" });
    assert.equal(resumed.status, 200, resumed.text);
    assert.equal((await jobDone("ep", resumed.json.job.id)).code, 0);
    const end = readState(dir, "dot");
    assert.deepEqual(Object.values(end.items).map((s) => s.status), ["keyed", "keyed", "keyed", "keyed"], JSON.stringify(end.items));
    assert.equal(end.interrupted, false);
    assert.ok(listReceipts(dir, { op: "image-generate" }).length - draws <= left.length, "only the images left are drawn again");
    for (const id of done) assert.equal(end.items[id].raw, st.items[id].raw, `${id} kept as drawn`);
    // A resume is for an interrupted run only; the board takes approvals again.
    assert.equal((await call("POST", "/api/assets/resume", { name: "ep", batch: "dot" })).status, 409);
  });
});

test("a state left running by a stopped Studio is marked interrupted when Studio starts", async () => {
  await studio({}, async ({ root }) => {
    const dir = makeProject(join(root, "ep"), [pose("a")]);
    writeState(dir, "dot", { batch: "dot", started: new Date().toISOString(), ended: null, running: true, stopped: false, message: null, items: { a: { status: "drawing", tries: 1 } } });
    const again = createServer({ root, token: TOKEN, runtime: null });
    await new Promise((r) => again.listen(0, "127.0.0.1", r));
    try {
      for (let i = 0; i < 50 && readState(dir, "dot").running; i++) await new Promise((r) => setTimeout(r, 20));
      const st = readState(dir, "dot");
      assert.equal(st.running, false);
      assert.equal(st.interrupted, true);
      assert.equal(st.items.a.status, "interrupted");
    } finally { again.closeAllConnections?.(); again.close(); }
  });
});
