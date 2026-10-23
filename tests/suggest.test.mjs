import { test, before, after } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterFor } from "../lib/provider.mjs";
import * as S from "../lib/suggest.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const A = await adapterFor({});
const FIXTURE = fileURLToPath(new URL("./fixtures/suggest/directions.json", import.meta.url));
const DIRS = JSON.parse(readFileSync(FIXTURE, "utf8")).directions;
const ID_OF = new Map(DIRS.map((d) => [d.ten_vi, d.id]));
const KEY_ENV = { SUGGEST_TEST_KEY: "test-key" };
let tmp, plugin, P, dir;

// The provider's commands, faked: `directions pick` gives A6, A8, A3; `styles suggest` gives the
// four styles the fixture lists for --direction.
const run = async (cmd, args) => {
  if (args[0] === "/fake/directions.mjs") {
    return { code: 0, stdout: JSON.stringify([
      { n: 1, id: "A6", tier: "fit", score: 4, why: ["hợp nhóm explainer"], ten_vi: "x", mo_ta_vi: "x" },
      { n: 2, id: "A8", tier: "continuous", score: 3, why: [], ten_vi: "y", mo_ta_vi: "y" },
      { n: 3, id: "A3", tier: "bold", score: 0, why: [], ten_vi: "z", mo_ta_vi: "z" },
    ]), stderr: "" };
  }
  if (args[0] === "/fake/styles.mjs") {
    const id = args[args.indexOf("--direction") + 1];
    const d = DIRS.find((x) => x.id === id);
    return { code: 0, stdout: JSON.stringify((d?.styles_goi_y ?? []).map((s) => ({ id: s, ten_vi: s, energy: 3, mo_ta_vi: s }))), stderr: "" };
  }
  return { code: 2, stdout: "", stderr: "unknown" };
};

// Jev, faked: A6 scores 4, A7 3, every other direction 1; every style 2 (unsure); mode dao-dien.
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
function failingFetch(kind) {
  const fn = async () => {
    fn.calls++;
    if (kind === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    return new Response("busy", { status: 503 });
  };
  fn.calls = 0;
  return fn;
}

const base = (extra = {}) => ({ dir, project: "demo", P, run, env: KEY_ENV, ...extra });

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "suggest-"));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4 });
  const p = await A.create({ OPUS_VIDEO_HOME: plugin });
  P = { ...p, commands: { ...p.commands, directions: "/fake/directions.mjs", styles: "/fake/styles.mjs" },
    library: { ...p.library, directionsFile: FIXTURE }, jev: { keyVar: "SUGGEST_TEST_KEY", envFile: join(tmp, "none.env") } };
  dir = join(tmp, "demo");
  mkdirSync(join(dir, "script"), { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), [
    "---", "topic: dòng tiền cho chủ doanh nghiệp nhỏ", "aspect: 16:9", "category: explainer", "energy: vua",
    "duration_s: 60", "direction: A1", "style_profile: glass-keynote", "---", "", "# Brief", "",
  ].join("\n"));
  writeFileSync(join(dir, "script", "01.txt"), Array.from({ length: 400 }, (_, i) => `từ${i}`).join(" ") + "\n");
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(plugin, { recursive: true, force: true });
});

let observed;

test("deterministic source never calls Jev, even with a key", async () => {
  const fetchImpl = jevFetch();
  const r = await S.suggest(base({ source: "deterministic", fetchImpl }));
  assert.equal(fetchImpl.calls, 0);
  assert.equal(r.jev, null);
  assert.equal(r.error, null);
  assert.equal(r.shown, "det");
  assert.equal(r.questions, 0);
  assert.equal(r.usage, null);
  assert.equal(r.det.directions.length, 3);
  assert.deepEqual(r.det.directions.map((d) => d.id), ["A6", "A8", "A3"]);
});

test("observe with a key returns both sources and stays under the question budget", async () => {
  const fetchImpl = jevFetch();
  const r = await S.suggest(base({ source: "observe", fetchImpl }));
  observed = r;
  assert.equal(fetchImpl.calls, 2);
  assert.equal(r.error, null);
  assert.equal(r.jev.directions[0].id, "A6");
  assert.equal(r.jev.directions[1].id, "A7");
  assert.equal(r.jev.directions.length, 8);
  assert.equal(r.det.directions[0].id, "A6");
  assert.ok(r.questions <= S.MAX_QUESTIONS, `${r.questions} questions`);
  assert.equal(r.questions, 8 + 12 + 1);
  assert.equal(r.shown, "jev");
  assert.deepEqual(r.usage, { input_tokens: 200, output_tokens: 0 });
  assert.equal(r.jev.workflow.mode, "dao-dien");
  assert.equal(r.jev.workflow.p, 0.7);
  assert.match(r.jev.styles[0].reason, /Jev chưa chắc/);
});

test("no key falls back with the reason", async () => {
  const fetchImpl = jevFetch();
  const r = await S.suggest(base({ env: {}, fetchImpl }));
  assert.equal(fetchImpl.calls, 0);
  assert.equal(r.error.code, "no-key");
  assert.match(r.error.message, /khoá TypeSafe/);
  assert.equal(r.jev, null);
  assert.equal(r.shown, "det");
  assert.equal(r.det.directions.length, 3);
});

test("a timeout falls back", async () => {
  const r = await S.suggest(base({ fetchImpl: failingFetch("timeout") }));
  assert.equal(r.error.code, "timeout");
  assert.equal(r.jev, null);
  assert.equal(r.det.directions.length, 3);
});

test("a 503 after the retry falls back and names the status", async () => {
  const fetchImpl = failingFetch("503");
  const r = await S.suggest(base({ fetchImpl }));
  assert.equal(fetchImpl.calls, 2);
  assert.equal(r.error.code, "http");
  assert.match(r.error.message, /503/);
  assert.equal(r.jev, null);
  assert.equal(r.det.directions.length, 3);
});

test("every reason names a BRIEF field or the script", () => {
  const reasons = [];
  for (const side of [observed.det, observed.jev]) {
    for (const x of [...side.directions, ...side.styles]) reasons.push(x.reason);
    reasons.push(side.workflow.reason);
  }
  for (const r of reasons) assert.match(r, /`[a-z_]+|kịch bản/, r);
});

test("the state leaves chosen fields out and keeps 300 script words", () => {
  const { state, hash } = S.buildState(dir, P);
  assert.equal("direction" in state.brief, false);
  assert.equal("style_profile" in state.brief, false);
  assert.equal(state.brief.topic, "dòng tiền cho chủ doanh nghiệp nhỏ");
  assert.equal(state.script_head.split(" ").length, 300);
  assert.match(hash, /^[0-9a-f]{12}$/);
});

test("a direction already set skips pitch and choose", () => {
  const skipped = observed.det.workflow.skip.map((s) => s.step);
  assert.ok(skipped.includes("pitch") && skipped.includes("choose"), skipped.join(","));
  assert.ok(!observed.det.workflow.steps.includes("pitch"));
  assert.equal(observed.det.workflow.pitch, false);
});

test("the cache is reused for the same brief and refreshed on request", async () => {
  const fetchImpl = jevFetch();
  const first = await S.suggestCached(base({ fetchImpl }));
  assert.equal(fetchImpl.calls, 2);
  assert.deepEqual(S.readRecord(dir), first);
  const again = await S.suggestCached(base({ fetchImpl }));
  assert.equal(fetchImpl.calls, 2);
  assert.equal(again.at, first.at);
  await S.suggestCached(base({ fetchImpl, refresh: true }));
  assert.equal(fetchImpl.calls, 4);
});

test("effectiveSource prefers the setting and falls back to observe", () => {
  assert.equal(S.DEFAULT_SOURCE, "observe");
  assert.equal(S.effectiveSource("x"), "observe");
  assert.equal(S.effectiveSource("jev"), "jev");
  assert.equal(S.effectiveSource("deterministic"), "deterministic");
  assert.equal(S.effectiveSource(null), S.DEFAULT_SOURCE);
  assert.equal("OBSERVE_UNTIL" in S, false);
});

test("a pick entry records both rankings and where the choice came from", () => {
  const e = S.pickEntry({ record: observed, project: "demo", chosen: { direction: "A7", style: null, mode: "dao-dien" }, outcome: "queued" });
  assert.equal(e.v, 1);
  assert.equal(e.project, "demo");
  assert.equal(e.hash, observed.hash);
  assert.equal(e.record_source, "observe");
  assert.equal(e.jev.directions.length, 3);
  assert.deepEqual(e.det.directions, ["A6", "A8", "A3"]);
  assert.equal(e.direction_from, "jev");
  assert.equal(e.style_from, null);
  assert.deepEqual(e.chosen, { direction: "A7", style: null, mode: "dao-dien" });
  assert.equal(e.outcome, "queued");
  assert.deepEqual(e.columns, S.columnsOf(observed));
  const both = S.pickEntry({ record: observed, project: "demo", chosen: { direction: "A6", style: observed.det.styles[0].id }, outcome: "chosen" });
  assert.equal(both.direction_from, "both");
  assert.ok(["det", "both"].includes(both.style_from));
  assert.equal(both.chosen.mode, null);
});

test("the pick log appends one line per choice and skips broken lines", () => {
  const d = join(tmp, "log");
  mkdirSync(d);
  assert.deepEqual(S.readPickLog(d), []);
  const e = S.pickEntry({ record: observed, project: "log", chosen: { direction: "A6" }, outcome: "chosen" });
  S.appendPick(d, e);
  S.appendPick(d, { ...e, outcome: "queued" });
  appendFileSync(S.picksLogPath(d), "{not json\n");
  assert.equal(readFileSync(S.picksLogPath(d), "utf8").trim().split("\n").length, 3);
  const log = S.readPickLog(d);
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((x) => x.outcome), ["chosen", "queued"]);
});

test("the key never reaches the record", async () => {
  assert.ok(!JSON.stringify(observed).includes("test-key"));
  assert.ok(!readFileSync(S.recordPath(dir), "utf8").includes("test-key"));
});

test("columnsOf orders the two columns by the brief hash while observing", () => {
  const rec = (hash, over = {}) => ({ hash, source: "observe", shown: "jev", jev: observed.jev, det: observed.det, ...over });
  assert.deepEqual(S.columnsOf(rec("abc0")), ["jev", "det"]);
  assert.deepEqual(S.columnsOf(rec("abc1")), ["det", "jev"]);
  assert.deepEqual(S.columnsOf(rec("abcf")), ["det", "jev"]);
  assert.deepEqual(S.columnsOf(rec("abc1")), S.columnsOf(rec("abc1")), "one brief always gets the same order");
  assert.deepEqual(S.columnsOf(rec("abc1", { jev: null, shown: "det" })), ["det"]);
  assert.deepEqual(S.columnsOf(rec("abc1", { source: "jev" })), ["jev"]);
  assert.deepEqual(S.columnsOf(rec("abc1", { source: "deterministic", shown: "det" })), ["det"]);
  assert.equal(S.columnsOf(null), null);
});

test("columnsOf puts each source on the left for about half of many briefs", () => {
  let jevLeft = 0;
  const N = 1000;
  for (let i = 0; i < N; i++) {
    const hash = createHash("sha256").update(`brief ${i}`).digest("hex").slice(0, 12);
    if (S.columnsOf({ hash, source: "observe", shown: "jev", jev: observed.jev, det: observed.det })[0] === "jev") jevLeft++;
  }
  assert.ok(jevLeft > N * 0.45 && jevLeft < N * 0.55, `Jev on the left ${jevLeft}/${N}`);
});
