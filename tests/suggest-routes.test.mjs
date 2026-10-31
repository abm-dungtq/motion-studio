import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor, loadProvider } from "../lib/provider.mjs";
import { columnsOf, readPickLog, readRecord } from "../lib/suggest.mjs";
import { callTool, toolEnv } from "../lib/tools.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const A = await adapterFor({});
const MANIFEST = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const DIRECTIONS = fileURLToPath(new URL("./fixtures/suggest/directions.json", import.meta.url));
const ID_OF = new Map(JSON.parse(readFileSync(DIRECTIONS, "utf8")).directions.map((d) => [d.ten_vi, d.id]));
const TOKEN = "s".repeat(64);
const KEY = "test-key";
const ENV = ["HOME", "OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "TYPESAFE_API_KEY", "FAKE_CHOOSE_LOG", "FAKE_REQUESTS", "FAKE_INIT_LOG", "FAKE_PATCH_LOG", "FAKE_CASES_LOG", "FAKE_CASES_FAIL"];
const BRIEF = ["---", "topic: dòng tiền cho chủ doanh nghiệp nhỏ", "aspect: 16:9", "category: explainer", "energy: vua", "---", "", "# Brief", ""].join("\n");
const realFetch = globalThis.fetch;
let tmp, root, saved, reqLog, chooseLog, initLog, patchLog, casesLog, scripts;
const bodies = [];

// The provider's commands, faked as scripts run with node: directions pick gives A6, A8, A3;
// styles suggest gives two styles; choose logs its argv and writes direction: pick-<n> into BRIEF.md;
// pitch init logs its argv and writes pitch/PICK.json in the order of --directions.
function writeScripts() {
  const d = join(tmp, "scripts");
  mkdirSync(d, { recursive: true });
  const f = (name, src) => { writeFileSync(join(d, name), src); return join(d, name); };
  return {
    directions: f("fake-directions.mjs", `console.log(${JSON.stringify(JSON.stringify([
      { n: 1, id: "A6", tier: "fit", score: 4, why: ["hợp nhóm explainer"], ten_vi: "x", mo_ta_vi: "x" },
      { n: 2, id: "A8", tier: "continuous", score: 3, why: [], ten_vi: "y", mo_ta_vi: "y" },
      { n: 3, id: "A3", tier: "bold", score: 0, why: [], ten_vi: "z", mo_ta_vi: "z" },
    ]))});\n`),
    styles: f("fake-styles.mjs", `console.log(${JSON.stringify(JSON.stringify([
      { id: "data-editorial", ten_vi: "Báo chí dữ liệu", energy: 2, mo_ta_vi: "x" },
      { id: "swiss-kinetic-editorial", ten_vi: "Chữ Thuỵ Sĩ", energy: 3, mo_ta_vi: "y" },
    ]))});\n`),
    choose: f("fake-choose.mjs", [
      `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";`,
      `const a = process.argv.slice(2);`,
      `appendFileSync(process.env.FAKE_CHOOSE_LOG, JSON.stringify(a) + "\\n");`,
      `const f = a[a.indexOf("--project") + 1] + "/BRIEF.md";`,
      `const n = a[a.indexOf("--pick") + 1];`,
      `writeFileSync(f, readFileSync(f, "utf8").replace(/^---\\n/, "---\\ndirection: pick-" + n + "\\n"));`,
    ].join("\n")),
    // The provider's case suggestion: logs its argv and writes CASES.md in the provider's format,
    // or exits 1 when FAKE_CASES_FAIL is set.
    cases: f("fake-cases.mjs", [
      `import { appendFileSync, writeFileSync } from "node:fs";`,
      `const a = process.argv.slice(2);`,
      `appendFileSync(process.env.FAKE_CASES_LOG, JSON.stringify(a) + "\\n");`,
      `if (process.env.FAKE_CASES_FAIL) { console.error("rerank-cases: boom"); process.exit(1); }`,
      `writeFileSync(a[a.indexOf("--project") + 1] + "/CASES.md", ${JSON.stringify(["## Gợi ý case từ thư viện mẫu Opus 5.5", "", "> ⚠ Jev không chạy (no TYPESAFE_API_KEY): danh sách dưới đây chỉ xếp theo từ khoá.", "", "1. **y:ror-fly-880547** · @Ror_Fly · explainer: Recipe motion graphic", "   Vì sao: loại video khớp (3.05/4).", "   Video demo: https://skillry.dev/ai-videos/opus-5-5/ror-fly-880547", "   https://x.com/Ror_Fly/status/1", "", "case_search: find-cases (no TYPESAFE_API_KEY)", ""].join("\n"))});`,
    ].join("\n")),
    pitchInit: f("fake-pitch-init.mjs", [
      `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";`,
      `const a = process.argv.slice(2);`,
      `appendFileSync(process.env.FAKE_INIT_LOG, JSON.stringify(a) + "\\n");`,
      `const dir = a[a.indexOf("--project") + 1];`,
      `const ids = a[a.indexOf("--directions") + 1].split(",");`,
      `mkdirSync(dir + "/pitch", { recursive: true });`,
      `writeFileSync(dir + "/pitch/PICK.json", JSON.stringify({ picks: ids.map((id, i) => ({ n: i + 1, id })) }));`,
    ].join("\n")),
  };
}

// A STUDIO_API 4 plugin whose manifest loader reads project.json, whose queue appends to a file
// and lists FAKE_REQUESTS, and whose gateway patch logs its arguments.
function plugin({ next = false } = {}) {
  const commands = {
    directions: scripts.directions, styles: scripts.styles,
    choose: { file: scripts.choose, args: ["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"] },
    ...(next ? {
      pitchInit: { file: scripts.pitchInit, args: ["init", "--project", "{project}", "--topic", "{topic}", "--aspect", "{aspect}", "--directions", "{directions}"] },
      suggestCases: { file: scripts.cases, args: ["--suggest", "--cases-only", "--project", "{project}"], output: "CASES.md" },
    } : {}),
  };
  const extra = `export const COMMANDS = ${JSON.stringify(commands)};${next ? `\nexport const OPS = ["set_workflow_mode"];\nexport const casesStale = () => process.env.FAKE_CASES_STALE === "1";` : ""}`;
  const d = fakePlugin({ schema: A.NEED.schema, api: 4, extra });
  mkdirSync(join(d, "data"));
  cpSync(DIRECTIONS, join(d, "data", "directions.json"));
  const f = join(d, "scripts", "studio-api.mjs");
  const src = readFileSync(f, "utf8")
    .replace("export const load = () => null;", `import { appendFileSync as _a, readFileSync as _r } from "node:fs";\nexport const load = (dir) => ({ ...JSON.parse(_r(dir + "/project.json", "utf8")), version: 7 });`)
    .replace("export const enqueue = () => null;", `export const enqueue = (dir, r) => { _a(${JSON.stringify(reqLog)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", status: "queued", ...r }; };`)
    .replace("export const list = () => null;", `export const list = () => JSON.parse(process.env.FAKE_REQUESTS || "[]");`)
    .replace("export const answer = () => null;", `export const answer = () => ({ next: { id: "r-2" } });`)
    .replace("export const patch = () => null;", `export const patch = function () { _a(process.env.FAKE_PATCH_LOG, JSON.stringify(arguments[1]) + "\\n"); return { version: 8 }; };`);
  writeFileSync(f, src);
  return d;
}

// Jev, faked: A6 scores 4, A7 3, every other direction 1; every style 2; mode dao-dien.
function jevFetch() {
  const fn = async (url, init) => {
    fn.calls++;
    const { questions } = JSON.parse(init.body);
    const answers = {};
    for (const [k, q] of Object.entries(questions)) {
      if (k === "mode") answers.mode = { type: "choice", choice: "dao-dien", probabilities: { "dao-dien": 0.7, nhanh: 0.1, "tu-nhac": 0.1, timeline: 0.1 }, confidence: 0.6 };
      else if (k.startsWith("d")) {
        const id = ID_OF.get(q.instructions.candidate_direction.name);
        answers[k] = { type: "score", score: id === "A6" ? 4 : id === "A7" ? 3 : 1, confidence: 0.8 };
      } else answers[k] = { type: "score", score: 2, confidence: 0.4 };
    }
    return new Response(JSON.stringify({ answers, usage: { input_tokens: 100, output_tokens: 0 } }), { status: 200 });
  };
  fn.calls = 0;
  return fn;
}

function http(port, method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json", "x-studio-token": TOKEN } : {}) } }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        bodies.push(text);
        let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
        res({ status: r.statusCode, json });
      });
    });
    req.on("error", rej); req.end(data ?? undefined);
  });
}

const dir = () => join(root, "demo");
const lines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean) : []);
const writePitch = (picks) => { mkdirSync(join(dir(), "pitch"), { recursive: true }); writeFileSync(join(dir(), "pitch", "PICK.json"), JSON.stringify({ picks })); };

// Starts a server on a fresh fake plugin; returns { server, port, plugin }.
async function serve(opts) {
  const p = plugin(opts);
  process.env.OPUS_VIDEO_HOME = p;
  const server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port, plugin: p };
}
const stop = (s) => { s.server.closeAllConnections?.(); s.server.close(); rmSync(s.plugin, { recursive: true, force: true }); };

before(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "suggest-routes-")));
  // The provider reads the key file under HOME: keep it inside tmp, never the user's own.
  process.env.HOME = tmp;
  delete process.env.TYPESAFE_API_KEY;
  reqLog = join(tmp, "requests.jsonl");
  chooseLog = join(tmp, "choose.log");
  initLog = join(tmp, "init.log");
  casesLog = join(tmp, "cases.log");
  patchLog = join(tmp, "patch.log");
  scripts = writeScripts();
  writeFileSync(join(tmp, "studio.json"), JSON.stringify({ director: { runner: "mcp" }, suggest: { source: "observe" } }));
  Object.assign(process.env, { MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_CHOOSE_LOG: chooseLog, FAKE_INIT_LOG: initLog, FAKE_PATCH_LOG: patchLog, FAKE_CASES_LOG: casesLog });
  root = join(tmp, "root");
  mkdirSync(root);
  cpSync(MANIFEST, dir(), { recursive: true });
  writeFileSync(join(dir(), "BRIEF.md"), BRIEF);
  mkdirSync(join(dir(), "script"));
  writeFileSync(join(dir(), "script", "01.txt"), "Chủ doanh nghiệp nhỏ thường hết tiền trước khi hết khách.\n");
});

after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true });
});

function reset() {
  rmSync(join(dir(), "pitch"), { recursive: true, force: true });
  rmSync(join(dir(), "CASES.md"), { force: true });
  delete process.env.FAKE_CASES_FAIL;
  delete process.env.FAKE_CASES_STALE;
  rmSync(join(dir(), ".opus", "suggest"), { recursive: true, force: true });
  writeFileSync(join(dir(), "BRIEF.md"), BRIEF);
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.FAKE_REQUESTS;
  globalThis.fetch = jevFetch();
}

describe("with the provider as it is today", () => {
  let s;
  const get = (path) => http(s.port, "GET", path);
  const post = (path, body) => http(s.port, "POST", path, body);
  before(async () => { s = await serve(); });
  after(() => stop(s));
  beforeEach(reset);

  test("GET /api/suggest answers no record and the pitch rows", async () => {
    writePitch([{ n: 1, id: "A6" }, { n: 2, id: "A7" }]);
    const r = await get("/api/suggest?name=demo");
    assert.equal(r.status, 200);
    assert.equal(r.json.record, null);
    assert.equal(r.json.columns, null);
    assert.equal(r.json.picks.length, 2);
    assert.equal(r.json.source, "observe");
    assert.equal(r.json.source_setting, "observe");
    assert.deepEqual(r.json.modes.map((m) => m.id), ["dao-dien", "nhanh", "tu-nhac", "timeline"]);
    assert.equal(r.json.can_save_mode, false);
    assert.equal(r.json.can_init_pitch, false);
  });

  test("POST /api/suggest with a key in observe mode stores both sources", async () => {
    process.env.TYPESAFE_API_KEY = KEY;
    const r = await post("/api/suggest", { name: "demo" });
    assert.equal(r.status, 200);
    assert.notEqual(r.json.record.jev, null);
    assert.equal(r.json.record.det.directions.length, 3);
    assert.equal(r.json.record.shown, "jev");
    assert.deepEqual(r.json.columns, columnsOf(r.json.record));
    assert.equal(r.json.columns.length, 2);
    assert.equal(globalThis.fetch.calls, 2);
    assert.ok(existsSync(join(dir(), ".opus", "suggest", "latest.json")));
  });

  test("POST /api/suggest without a key falls back to the deterministic source", async () => {
    const r = await post("/api/suggest", { name: "demo" });
    assert.equal(r.status, 200);
    assert.equal(r.json.record.error.code, "no-key");
    assert.equal(r.json.record.shown, "det");
    assert.equal(globalThis.fetch.calls, 0);
  });

  test("a Jev timeout and a 5xx still answer 200 with the deterministic source", async () => {
    process.env.TYPESAFE_API_KEY = KEY;
    globalThis.fetch = async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
    const t = await post("/api/suggest", { name: "demo", refresh: true });
    assert.equal(t.status, 200);
    assert.equal(t.json.record.shown, "det");
    assert.equal(t.json.record.error.code, "timeout");
    globalThis.fetch = async () => new Response("busy", { status: 503 });
    const h = await post("/api/suggest", { name: "demo", refresh: true });
    assert.equal(h.status, 200);
    assert.equal(h.json.record.shown, "det");
    assert.equal(h.json.record.error.code, "http");
  });

  test("POST /api/suggest without BRIEF.md is 409", async () => {
    rmSync(join(dir(), "BRIEF.md"));
    const r = await post("/api/suggest", { name: "demo" });
    assert.equal(r.status, 409);
    assert.match(r.json.error, /BRIEF\.md/);
  });

  test("every deterministic reason names a BRIEF field or the script", async () => {
    const r = await post("/api/suggest", { name: "demo" });
    const det = r.json.record.det;
    for (const x of [...det.directions, ...det.styles, det.workflow]) assert.match(x.reason, /`[a-z_]+|kịch bản/, x.reason);
  });

  test("a brief without energy still gives style reasons that name a BRIEF field", async () => {
    writeFileSync(join(dir(), "BRIEF.md"), BRIEF.replace(/^energy:.*\n/m, ""));
    const r = await post("/api/suggest", { name: "demo" });
    const styles = r.json.record.det.styles;
    assert.ok(styles.length > 0);
    for (const x of styles) {
      assert.match(x.reason, /`energy`/, x.reason);
      assert.deepEqual(x.fields, []);
    }
    for (const x of [...r.json.record.det.directions, r.json.record.det.workflow]) assert.match(x.reason, /`[a-z_]+|kịch bản/, x.reason);
  });

  test("choose with a direction in the pitch runs choose with --pick and --style-profile", async () => {
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6", style_profile: "glass-keynote" }]);
    const before = lines(chooseLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "data-editorial" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "chosen");
    assert.equal(r.json.pick, 2);
    assert.equal(r.json.style, "data-editorial");
    assert.equal(r.json.answered, null);
    assert.equal(r.json.initialized, false);
    assert.deepEqual(r.json.mode, { saved: false, reason: null });
    const log = lines(chooseLog);
    assert.equal(log.length, before + 1);
    assert.ok(log.at(-1).includes('"--pick","2"'), log.at(-1));
    assert.ok(log.at(-1).includes('"--style-profile","data-editorial"'), log.at(-1));
    assert.match(readFileSync(join(dir(), "BRIEF.md"), "utf8"), /^direction: pick-2$/m);
  });

  test("choose without a style keeps the pitch row's style and passes no style argument", async () => {
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6", style_profile: "glass-keynote" }]);
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6" });
    assert.equal(r.json.style, "glass-keynote");
    assert.ok(!lines(chooseLog).at(-1).includes("--style-profile"));
  });

  test("choose reports the style BRIEF.md keeps when it differs from the click", async () => {
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6", style_profile: "glass-keynote" }]);
    const brief = join(dir(), "BRIEF.md");
    const original = readFileSync(brief, "utf8");
    writeFileSync(brief, original.replace(/^---\n/, "---\nstyle_profile: lemo-watercolor\n"));
    try {
      const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "data-editorial" });
      assert.equal(r.json.outcome, "chosen");
      assert.equal(r.json.style, "lemo-watercolor");
      assert.equal(r.json.requested_style, "data-editorial");
    } finally {
      writeFileSync(brief, original);
    }
  });

  test("choose answers a waiting direction card", async () => {
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6" }]);
    process.env.FAKE_REQUESTS = JSON.stringify([{ id: "r-w", status: "waiting_user", ask: { gate: "direction", kind: "choice", options: [{ id: "1", label: "a" }, { id: "2", label: "b" }] } }]);
    const before = lines(chooseLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "data-editorial" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "chosen");
    assert.equal(r.json.answered, "r-w");
    assert.equal(r.json.next, "r-2");
    assert.equal(lines(chooseLog).length, before + 1);
    assert.ok(lines(chooseLog).at(-1).includes('"--style-profile","data-editorial"'));
  });

  test("choose with a direction missing from the pitch lists the pitch rows", async () => {
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6" }]);
    const before = lines(chooseLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A1" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "not_in_pitch");
    assert.equal(r.json.picks.length, 2);
    assert.equal(lines(chooseLog).length, before);
  });

  test("choose before any pitch queues a director request with the user's preference", async () => {
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "data-editorial" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "queued");
    assert.equal(r.json.runner, "mcp");
    assert.equal(r.json.job, null);
    assert.equal(r.json.request.id, "r-1");
    const last = JSON.parse(lines(reqLog).at(-1));
    assert.match(last.text, /A6/);
    assert.match(last.text, /data-editorial/);
    assert.equal(last.scope, "project");
    assert.equal(last.base, 7);
  });

  test("choose before any pitch without project.json is 409", async () => {
    const pj = join(dir(), "project.json");
    const keep = readFileSync(pj);
    rmSync(pj);
    try {
      const r = await post("/api/suggest/choose", { name: "demo", direction: "A6" });
      assert.equal(r.status, 409);
      assert.match(r.json.error, /project\.json/);
    } finally { writeFileSync(pj, keep); }
  });

  test("the operating mode is reported as not saved while the provider cannot write it", async () => {
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", mode: "dao-dien" });
    assert.equal(r.status, 200);
    assert.equal(r.json.mode.saved, false);
    assert.match(r.json.mode.reason, /project\.json/);
    assert.match(JSON.parse(lines(reqLog).at(-1)).text, /chế độ vận hành dao-dien/);
  });

  test("bad arguments are 400", async () => {
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "x" })).status, 400);
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "../x" })).status, 400);
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A6", mode: "khac" })).status, 400);
    assert.equal((await post("/api/suggest/choose", { name: "../x", direction: "A6" })).status, 400);
    assert.equal((await get("/api/suggest?name=khong-co")).status, 404);
  });

  test("a failing choose command is 422 with its stderr", async () => {
    writePitch([{ n: 1, id: "A6" }]);
    const keep = process.env.FAKE_CHOOSE_LOG;
    process.env.FAKE_CHOOSE_LOG = join(tmp, "no-such-dir", "x.log");
    try {
      const r = await post("/api/suggest/choose", { name: "demo", direction: "A6" });
      assert.equal(r.status, 422);
      assert.match(r.json.error, /exit 1/);
      assert.match(r.json.stderr, /ENOENT/);
    } finally { process.env.FAKE_CHOOSE_LOG = keep; }
  });

  test("style_suggest through callTool returns the compact result", async () => {
    const r = await callTool("style_suggest", { project: "demo" }, toolEnv({ root, P: await loadProvider() }));
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.shown, "det");
    assert.match(r.result.error, /khoá TypeSafe/);
    assert.match(r.result.card, /tab Đạo diễn/);
    assert.equal(r.result.sources.length, 1);
    const [only] = r.result.sources;
    assert.equal(only.source, "det");
    assert.equal(only.label, "Tất định");
    assert.equal(only.directions.length, 3);
    assert.equal(r.result.compare, undefined);
    assert.deepEqual(Object.keys(only.directions[0]).sort(), ["id", "label", "reason", "score", "source"]);
    assert.equal(readFileSync(join(dir(), "BRIEF.md"), "utf8"), BRIEF);
  });

  test("style_suggest while observing returns both sources, labelled, in the card's order", async () => {
    process.env.TYPESAFE_API_KEY = KEY;
    const r = await callTool("style_suggest", { project: "demo" }, toolEnv({ root, P: await loadProvider() }));
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.source, "observe");
    assert.deepEqual(r.result.sources.map((x) => x.source), columnsOf(readRecord(dir())));
    const by = Object.fromEntries(r.result.sources.map((x) => [x.source, x]));
    assert.equal(by.jev.label, "Jev");
    assert.equal(by.det.label, "Tất định");
    assert.equal(by.jev.directions[0].id, "A6");
    assert.equal(by.jev.directions[0].source, "jev");
    assert.equal(by.det.directions.length, 3);
    assert.ok(by.det.directions.every((d) => d.source === "det"));
    assert.ok(by.jev.styles.length > 0 && by.det.styles.length > 0);
    assert.ok(by.jev.workflow && by.det.workflow);
    assert.match(r.result.compare, /cả hai nguồn ngang nhau/);
  });

  test("style_suggest without BRIEF.md is an error", async () => {
    rmSync(join(dir(), "BRIEF.md"));
    const r = await callTool("style_suggest", { project: "demo" }, toolEnv({ root, P: await loadProvider() }));
    assert.equal(r.ok, false);
    assert.match(r.error, /BRIEF\.md/);
  });

  test("every choice with a stored suggestion appends one line to the pick log", async () => {
    process.env.TYPESAFE_API_KEY = KEY;
    assert.equal((await post("/api/suggest", { name: "demo" })).status, 200);
    writePitch([{ n: 1, id: "A7" }, { n: 2, id: "A6" }]);
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A6", style: "data-editorial" })).json.outcome, "chosen");
    let log = readPickLog(dir());
    assert.equal(log.length, 1);
    assert.equal(log[0].chosen.direction, "A6");
    assert.equal(log[0].chosen.style, "data-editorial");
    assert.equal(log[0].outcome, "chosen");
    assert.notEqual(log[0].jev, null);
    assert.notEqual(log[0].det, null);
    assert.ok(["jev", "det", "both", "none"].includes(log[0].direction_from));
    const shown = (await get("/api/suggest?name=demo")).json.columns;
    assert.equal(shown.length, 2);
    assert.deepEqual(log[0].columns, shown, "the log records the column order the card shows");
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A1" })).json.outcome, "not_in_pitch");
    log = readPickLog(dir());
    assert.equal(log.length, 2);
    assert.equal(log[1].outcome, "not_in_pitch");
    assert.equal(log[1].chosen.direction, "A1");
    assert.deepEqual(log[1].columns, shown);
    rmSync(join(dir(), "pitch"), { recursive: true, force: true });
    assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A8" })).json.outcome, "queued");
    log = readPickLog(dir());
    assert.equal(log.length, 3);
    assert.equal(log[2].outcome, "queued");
    assert.equal(log[2].chosen.direction, "A8");
  });

  test("a choice without any stored suggestion writes no log line", async () => {
    writePitch([{ n: 1, id: "A6" }]);
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6" });
    assert.equal(r.status, 200);
    assert.equal(existsSync(join(dir(), ".opus", "suggest", "picks.jsonl")), false);
  });

  test("the key never reaches the stored record or the answers", async () => {
    process.env.TYPESAFE_API_KEY = KEY;
    await post("/api/suggest", { name: "demo", refresh: true });
    assert.ok(!readFileSync(join(dir(), ".opus", "suggest", "latest.json"), "utf8").includes(KEY));
    assert.ok(bodies.length > 10);
    for (const b of bodies) assert.ok(!b.includes(KEY));
  });
});

describe("when the provider declares pitchInit and set_workflow_mode", () => {
  let s;
  const post = (path, body) => http(s.port, "POST", path, body);
  before(async () => { s = await serve({ next: true }); });
  after(() => stop(s));
  beforeEach(reset);

  test("GET /api/suggest says the mode can be saved and the pitch built", async () => {
    const r = await http(s.port, "GET", "/api/suggest?name=demo");
    assert.equal(r.json.can_save_mode, true);
    assert.equal(r.json.can_init_pitch, true);
    assert.equal(r.json.can_suggest_cases, true);
    assert.equal(r.json.cases, null);
  });

  test("POST /api/suggest runs the case suggestion once and returns the parsed cases, the Jev warning kept", async () => {
    const before = lines(casesLog).length;
    const r = await post("/api/suggest", { name: "demo" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(JSON.parse(lines(casesLog).at(-1)), ["--suggest", "--cases-only", "--project", dir()]);
    assert.match(r.json.cases.warning, /Jev không chạy \(no TYPESAFE_API_KEY\)/);
    assert.deepEqual(r.json.cases.items.map((c) => [c.id, c.author, c.demo, c.url]), [["y:ror-fly-880547", "Ror_Fly", "https://skillry.dev/ai-videos/opus-5-5/ror-fly-880547", "https://x.com/Ror_Fly/status/1"]]);
    assert.match(r.json.cases.items[0].why, /loại video khớp/);
    assert.equal(r.json.cases.case_search, "find-cases (no TYPESAFE_API_KEY)");
    await post("/api/suggest", { name: "demo" });
    assert.equal(lines(casesLog).length, before + 1, "a project with CASES.md is not ranked again");
    await post("/api/suggest", { name: "demo", refresh: true });
    assert.equal(lines(casesLog).length, before + 2, "refresh ranks again");
  });

  test("cases ranked for an older brief are flagged and ranked again on the next Gợi ý", async () => {
    const before = lines(casesLog).length;
    assert.equal((await post("/api/suggest", { name: "demo" })).status, 200);
    assert.equal((await http(s.port, "GET", "/api/suggest?name=demo")).json.cases_stale, false);
    process.env.FAKE_CASES_STALE = "1";
    assert.equal((await http(s.port, "GET", "/api/suggest?name=demo")).json.cases_stale, true);
    assert.equal(lines(casesLog).length, before + 1, "GET never ranks");
    await post("/api/suggest", { name: "demo" });
    assert.equal(lines(casesLog).length, before + 2, "a stale file is ranked again without refresh");
  });

  test("a failing case command is reported in cases_error, the direction ranking still answers", async () => {
    process.env.FAKE_CASES_FAIL = "1";
    const r = await post("/api/suggest", { name: "demo" });
    assert.equal(r.status, 200);
    assert.ok(r.json.record, "directions still ranked");
    assert.match(r.json.cases_error, /exit 1.*boom/s);
    assert.equal(r.json.cases, null);
  });

  test("building the pitch from a click suggests cases first", async () => {
    const before = lines(casesLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A8" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(lines(casesLog).length, before + 1);
    assert.ok(existsSync(join(dir(), "CASES.md")));
  });

  test("a failing case suggestion stops the pitch build and its reason reaches the user", async () => {
    process.env.FAKE_CASES_FAIL = "1";
    const before = lines(initLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A8" });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /Chưa gợi ý được case mẫu \(exit 1\).*boom/s);
    assert.equal(r.json.cases_error, r.json.error);
    assert.equal(lines(initLog).length, before, "the pitch command is not run");
  });

  test("choose before any pitch builds the pitch from the chosen direction and chooses it", async () => {
    assert.equal((await post("/api/suggest", { name: "demo" })).status, 200);
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A8" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.outcome, "chosen");
    assert.equal(r.json.initialized, true);
    assert.equal(r.json.pick, 1);
    assert.ok(lines(initLog).at(-1).includes('"--directions","A8,'), lines(initLog).at(-1));
    assert.ok(lines(initLog).at(-1).includes('"--topic","dòng tiền cho chủ doanh nghiệp nhỏ"'));
    assert.ok(lines(chooseLog).at(-1).includes('"--pick","1"'));
    assert.equal(readPickLog(dir()).at(-1).outcome, "chosen");
  });

  test("the operating mode is saved through the gateway as the user", async () => {
    writePitch([{ n: 1, id: "A6" }]);
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6", mode: "nhanh" });
    assert.equal(r.status, 200);
    assert.equal(r.json.mode.saved, true);
    assert.equal(r.json.mode.reason, null);
    const last = lines(patchLog).at(-1);
    assert.ok(last.includes('"actor":"human"'), last);
    assert.ok(last.includes('{"op":"set_workflow_mode","mode":"nhanh"}'), last);
  });

  test("a direction missing from the pitch does not save the operating mode", async () => {
    writePitch([{ n: 1, id: "A6" }]);
    const before = lines(patchLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A1", mode: "nhanh" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "not_in_pitch");
    assert.deepEqual(r.json.mode, { saved: false, reason: null });
    assert.equal(lines(patchLog).length, before);
  });

  test("a failing choose command does not save the operating mode", async () => {
    writePitch([{ n: 1, id: "A6" }]);
    const before = lines(patchLog).length;
    const keep = process.env.FAKE_CHOOSE_LOG;
    process.env.FAKE_CHOOSE_LOG = join(tmp, "no-such-dir", "x.log");
    try {
      assert.equal((await post("/api/suggest/choose", { name: "demo", direction: "A6", mode: "nhanh" })).status, 422);
    } finally { process.env.FAKE_CHOOSE_LOG = keep; }
    assert.equal(lines(patchLog).length, before);
  });

  test("a brief without topic still queues instead of building a pitch", async () => {
    writeFileSync(join(dir(), "BRIEF.md"), BRIEF.replace(/^topic:.*\n/m, ""));
    const before = lines(initLog).length;
    const r = await post("/api/suggest/choose", { name: "demo", direction: "A6" });
    assert.equal(r.status, 200);
    assert.equal(r.json.outcome, "queued");
    assert.equal(lines(initLog).length, before);
  });
});
