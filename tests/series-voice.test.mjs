// lib/series-voice.mjs, routes/voice.mjs and lib/tools/voice.mjs: lines voiced in their speaker's
// cast voice through the series tool cast-tts, one line at once, more only after a consent card;
// new voices through voice-design behind a card, picked by the user. Fake series tools, no network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { lineNumber, linesToVoice, ttsCommand } from "../lib/series-voice.mjs";
import { seriesFor } from "../lib/series.mjs";
import { ledgerFile } from "../lib/ledger.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakePlugin } from "./fake-plugin.mjs";
import { holdDirector } from "./director-job.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "v".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "FAKE_TTS_EXIT", "FAKE_TTS_LOG", "FAKE_MP3", "FAKE_TTS_MIX_FAIL"];
let tmp, plugin, P, series, root, ep, server, port, saved, env, queued, ttsLog, director;

// cast-tts: logs its argv and OV; FAKE_TTS_EXIT=4 is the viet-pro gate refusing, 1 a failure.
// FAKE_TTS_MIX_FAIL=1: the paid voice is written, then the mix chain fails (exit 1). Otherwise the
// voice, its gate stamp, the mix and the visemes, and a line that looks like a key. --remix makes
// no voice (no API): it mixes the existing --out again.
const CAST_TTS = `import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, v] = x.replace(/^--/, "").split(/=(.*)/s); return [k, v ?? true]; }));
appendFileSync(process.env.FAKE_TTS_LOG, JSON.stringify({ ...a, OV: process.env.OV }) + "\\n");
console.log("xi-api-key: sk_" + "0123456789abcdef0123456789abcdef");
const code = Number(process.env.FAKE_TTS_EXIT || 0);
if (code) { console.error(code === 4 ? "viet-pro: chặn" : "cast-tts: lỗi"); process.exit(code); }
if (a.remix) { if (!existsSync(a.out)) process.exit(1); }
else {
  const text = readFileSync(a["text-file"], "utf8");
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, Buffer.concat([readFileSync(process.env.FAKE_MP3), Buffer.from(String(Date.now()) + Math.random())]));
  writeFileSync(a.out + ".gate.json", JSON.stringify({ sha256: createHash("sha256").update(text.replace(/\\s+/g, " ").trim()).digest("hex"), script: a["text-file"], override: null }));
  if (process.env.FAKE_TTS_MIX_FAIL) { console.error("ffmpeg: lỗi chuỗi nén"); process.exit(1); }
}
mkdirSync(dirname(a["mix-out"]), { recursive: true }); copyFileSync(process.env.FAKE_MP3, a["mix-out"]);
writeFileSync(a["visemes-out"], "[]\\n");
console.log("ok " + (a.role ?? "remix"));
`;
// voice-design: design writes three previews, save locks the pick in voices/cast.json.
const VOICE_DESIGN = `import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const role = args.find((x) => x.startsWith("--role="))?.slice(7);
const pick = args.find((x) => x.startsWith("--pick="))?.slice(7);
appendFileSync(process.env.FAKE_TTS_LOG, JSON.stringify({ design: args }) + "\\n");
if (args.includes("design")) { mkdirSync("voices/previews/" + role, { recursive: true }); for (const n of [1, 2, 3]) copyFileSync(process.env.FAKE_MP3, "voices/previews/" + role + "/" + role + "-" + n + ".mp3"); }
else if (args.includes("save")) { const c = JSON.parse(readFileSync("voices/cast.json", "utf8")); c[role] = { voice_id: "v-" + role, picked_preview: Number(pick) }; writeFileSync("voices/cast.json", JSON.stringify(c)); }
else process.exit(2);
`;

const line = (n, speaker, text) => ({ id: `vo-0${n}`, shot: "s1", text, file: `assets/mix/voice-0${n}.mp3`, start: n - 1, duration: 1, gate: "unknown", ...(speaker ? { speaker } : {}) });
const manifest = (lines) => ({ schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 10, html: "index.html", capabilities: { timing_markers: true, editable: true }, shots: [{ id: "s1", name: "", start: 0, end: 10 }], lines, music: [], assets: [], version: 1 });
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
async function jobDone(id) {
  for (let i = 0; i < 300; i++) {
    const j = (await http("GET", `/api/jobs?name=ep`)).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await sleep(100);
  }
  throw new Error(`job ${id} still running`);
}
const resetProject = (lines) => {
  if (existsSync(ep)) rmSync(ledgerFile(ep), { force: true });
  rmSync(ep, { recursive: true, force: true });
  mkdirSync(join(ep, "script"), { recursive: true });
  writeFileSync(join(ep, "BRIEF.md"), `---\ntitle: Tập thử\nseries: ${series}\n---\n`);
  writeFileSync(join(ep, "index.html"), "<div data-composition-id=\"main\" data-duration=\"10\"></div>\n");
  writeFileSync(join(ep, "project.json"), JSON.stringify(manifest(lines)));
  for (const l of lines) writeFileSync(join(ep, "script", `${lineNumber(l)}.txt`), `${l.text}\n`);
  writeFileSync(ttsLog, "");
};

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-series-voice-")));
  ttsLog = join(tmp, "tts.log");
  const mp3 = join(tmp, "silence.mp3");
  const ff = spawnSync(existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.6", "-q:a", "9", mp3]);
  assert.equal(ff.status, 0, String(ff.stderr));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true, gateway: true, ops: ["set_line_text", "set_line_speaker", "set_line_audio"] });
  queued = join(tmp, "queued.jsonl");
  const api = join(plugin, "scripts", "studio-api.mjs");
  writeFileSync(api, readFileSync(api, "utf8").replace("export const enqueue = () => null;", `import { appendFileSync as _qa } from "node:fs";\nexport const enqueue = (dir, r) => { _qa(${JSON.stringify(queued)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", ...r }; };`));
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_TTS_LOG: ttsLog, FAKE_MP3: mp3 });
  delete process.env.FAKE_TTS_EXIT;
  P = await A.create({ OPUS_VIDEO_HOME: plugin });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  writeFileSync(join(series, "tools", "cast-tts.mjs"), CAST_TTS);
  writeFileSync(join(series, "tools", "voice-design.mjs"), VOICE_DESIGN);
  writeFileSync(join(series, "voices", "cast.json"), JSON.stringify({ hero: { voice_id: "v-hero" } }));
  writeFileSync(join(series, "voices", "roles.json"), JSON.stringify([{ id: "hero", name: "Anh hùng", description_en: "x" }, { id: "narrator", name: "Người kể", description_en: "y" }, { id: "granny", name: "Bà", description_en: "z" }]));
  const decl = JSON.parse(readFileSync(join(series, "studio-series.json"), "utf8"));
  decl.voices = { roles: "voices/roles.json", cast: "voices/cast.json", previews: "voices/previews" };
  decl.tools["cast-tts"] = { file: "tools/cast-tts.mjs", flags: { "--role": "id", "--text-file": "path:read", "--out": "path:write", "--mix-out": "path:write", "--visemes-out": "path:write", "--speed": "number", "--remix": "bool" }, writes: ["{project}/assets"], timeout_s: 30 };
  decl.tools["voice-design"] = { file: "tools/voice-design.mjs", positional: "word", flags: { "--role": "id", "--pick": "int" }, writes: ["voices"], timeout_s: 30 };
  writeFileSync(join(series, "studio-series.json"), JSON.stringify(decl));
  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(root, { recursive: true });
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  env = { ...toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) }), actor: "director", request: "r-7" };
  director = holdDirector("ep", "r-7");
});
after(() => {
  director.stop();
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("a line is joined to its number; its cast-tts argv keeps every path in the project", () => {
  resetProject([line(1, "hero", "Một.")]);
  assert.equal(lineNumber({ file: "assets/mix/voice-07.mp3" }), "07");
  assert.equal(lineNumber({ id: "vo-12", file: null }), "12");
  const s = seriesFor(P, ep);
  const cmd = ttsCommand({ series: s, projectDir: ep, root, nn: "01", speaker: "hero" });
  assert.deepEqual(cmd.argv.slice(1), ["--role=hero", `--text-file=${join(ep, "script/01.txt")}`, `--out=${join(ep, "assets/voice/01.mp3")}`, `--mix-out=${join(ep, "assets/mix/voice-01.mp3")}`, `--visemes-out=${join(ep, "assets/voice/01.visemes.json")}`]);
  assert.equal(cmd.cwd, s.dir);
  assert.throws(() => linesToVoice(manifest([line(1, "narrator", "x")]), ["vo-01"], s), /giọng narrator chưa có trong cast/);
  assert.throws(() => linesToVoice(manifest([line(1, null, "x")]), ["vo-01"], s), /Chọn người nói trước/);
});

// Voices lines through a card and the user's yes; answers the job.
async function voiceWithCard(ids) {
  const r = await callTool("series_tts", { project: "ep", ids }, env);
  assert.equal(r.result?.waiting_consent, true, JSON.stringify(r));
  const yes = await http("POST", "/api/consent/answer", { name: "ep", id: r.result.consent.id, ok: true });
  assert.equal(yes.status, 200, yes.text);
  return jobDone(yes.json.job.id);
}

test("a line never voiced asks for a card even alone; once voiced through it, re-voicing it runs at once", async () => {
  resetProject([line(1, "hero", "Câu một."), line(2, "hero", "Câu hai.")]);
  const first = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.result.waiting_consent, true, "the first voicing of a line always goes through a card");
  assert.deepEqual(first.result.estimate, { lines: 1, chars: 8 });
  assert.equal(readLines(ttsLog).length, 0, "nothing voiced before the answer");
  assert.equal((await jobDone((await http("POST", "/api/consent/answer", { name: "ep", id: first.result.consent.id, ok: true })).json.job.id)).code, 0);
  writeFileSync(ttsLog, "");
  rmSync(join(ep, ".patches.jsonl"), { force: true });
  rmSync(join(ep, ".opus", "receipts"), { recursive: true, force: true });
  const r = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual(r.result.voiced, ["vo-01"]);
  assert.equal((await http("GET", "/api/consent?name=ep")).json.cards.length, 0, "re-voicing one voiced line needs no card");
  const other = await callTool("series_tts", { project: "ep", ids: ["vo-02"] }, env);
  assert.equal(other.result.waiting_consent, true, "the line beside it was never voiced");
  const calls = readLines(ttsLog);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role, "hero");
  assert.equal(calls[0].OV, plugin, "the gate runs with the provider's plugin");
  const patches = readLines(join(ep, ".patches.jsonl"));
  assert.equal(patches.length, 1);
  assert.equal(patches[0].actor, "director");
  assert.equal(patches[0].ops[0].op, "set_line_audio");
  assert.equal(patches[0].ops[0].file, "assets/mix/voice-01.mp3");
  assert.ok(patches[0].ops[0].duration > 0.4 && patches[0].ops[0].duration < 1, String(patches[0].ops[0].duration));
  assert.match(readFileSync(join(ep, ".timing-runs"), "utf8"), /--project/);
  const rec = listReceipts(ep, { op: "series-tts" });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].params.role, "hero");
  assert.equal(rec[0].inputs.text_written, false, "the text file already held the line");
  assert.equal(rec[0].inputs.exit, 0);
  assert.equal(rec[0].actor, "director:r-7");
  const all = readdirSync(join(ep, ".opus", "receipts"), { recursive: true }).filter((f) => String(f).endsWith(".json")).map((f) => readFileSync(join(ep, ".opus", "receipts", String(f)), "utf8")).join("\n");
  assert.doesNotMatch(all, /sk_[0-9a-f]{16}|xi-api-key/);
});

test("three lines make a consent card and spend nothing until the yes; the yes voices them all", async () => {
  resetProject([line(1, "hero", "Một hai."), line(2, "hero", "Ba bốn năm."), line(3, "hero", "Sáu.")]);
  const ids = ["vo-01", "vo-02", "vo-03"];
  const r = await callTool("series_tts", { project: "ep", ids }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.waiting_consent, true);
  assert.equal(r.result.consent.kind, "elevenlabs");
  assert.deepEqual(r.result.estimate, { lines: 3, chars: 23 });
  assert.match(r.result.consent.title, /^Lồng tiếng 3 câu .*ước 23 ký tự ElevenLabs$/);
  assert.equal(readLines(ttsLog).length, 0, "nothing voiced before the answer");
  const again = await callTool("series_tts", { project: "ep", ids: [...ids].reverse() }, env);
  assert.equal(again.result.consent.id, r.result.consent.id, "the same lines answer the same card");
  const cards = (await http("GET", "/api/consent?name=ep")).json.cards;
  assert.deepEqual(cards.map((c) => c.id), [r.result.consent.id]);
  const yes = await http("POST", "/api/consent/answer", { name: "ep", id: r.result.consent.id, ok: true });
  assert.equal(yes.status, 200, yes.text);
  assert.equal(yes.json.job.kind, "tts");
  const j = await jobDone(yes.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  assert.deepEqual(readLines(ttsLog).map((c) => c["text-file"].split("/").pop()), ["01.txt", "02.txt", "03.txt"]);
  assert.equal(listReceipts(ep, { op: "series-tts" }).length, 3);
  assert.equal(readFileSync(join(ep, ".timing-runs"), "utf8").trim().split("\n").length, 1, "timing runs once");
});

test("exit 4 of cast-tts is the gate refusing: gate blocked, no retry, no audio patch", async () => {
  resetProject([line(1, "hero", "Lời bị chặn.")]);
  await voiceWithCard(["vo-01"]);
  writeFileSync(ttsLog, "");
  rmSync(join(ep, ".patches.jsonl"), { force: true });
  rmSync(join(ep, ".opus", "receipts"), { recursive: true, force: true });
  process.env.FAKE_TTS_EXIT = "4";
  try {
    const r = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.ok, false);
    assert.equal(r.result.gate, "blocked");
    assert.ok(r.result.tail.some((l) => /viet-pro: chặn/.test(l)), r.result.tail.join("|"));
    assert.ok(!r.result.tail.some((l) => /sk_[0-9a-f]{16}/.test(l)), "the tail is redacted");
    assert.equal(readLines(ttsLog).length, 1, "tried once");
    assert.equal(readLines(join(ep, ".patches.jsonl")).length, 0);
    assert.equal(listReceipts(ep, { op: "series-tts" })[0].inputs.gate, "blocked");
  } finally { delete process.env.FAKE_TTS_EXIT; }
});

test("a line without a speaker, an unknown line and a project outside a series are refused", async () => {
  resetProject([line(1, null, "Chưa có ai nói."), line(2, "hero", "Có.")]);
  const no = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
  assert.match(no.error, /Chọn người nói trước/);
  const two = await http("POST", "/api/voice/tts", { name: "ep", ids: ["vo-02", "vo-01"] });
  assert.equal(two.status, 400);
  const unknown = await http("POST", "/api/voice/tts", { name: "ep", ids: ["vo-09"] });
  assert.match(unknown.json.error, /không có câu vo-09/);
  assert.equal(readLines(ttsLog).length, 0);
  mkdirSync(join(root, "plain"), { recursive: true });
  writeFileSync(join(root, "plain", "BRIEF.md"), "# Không series\n");
  assert.equal((await http("GET", "/api/voice/previews?name=plain")).status, 404);
});

test("voice_design asks first, the yes makes three previews, the user's pick locks the voice", async () => {
  resetProject([line(1, "granny", "Ăn cơm chưa?")]);
  const had = await callTool("voice_design", { project: "ep", role: "hero" }, env);
  assert.match(had.error, /đã có giọng/);
  const unknown = await callTool("voice_design", { project: "ep", role: "ghost" }, env);
  assert.match(unknown.error, /chưa có trong file roles/);
  const r = await callTool("voice_design", { project: "ep", role: "granny" }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.consent.kind, "elevenlabs");
  assert.equal(r.result.consent.title, "Tạo 3 giọng thử cho Bà, 1 lượt Voice Design");
  assert.equal(readLines(ttsLog).length, 0, "nothing designed before the answer");
  const yes = await http("POST", "/api/consent/answer", { name: "ep", id: r.result.consent.id, ok: true });
  assert.equal(yes.status, 200, yes.text);
  const j = await jobDone(yes.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  assert.deepEqual(readLines(ttsLog)[0].design, ["--role=granny", "design"]);
  let pv;
  for (let i = 0; i < 50 && !(pv = (await http("GET", "/api/voice/previews?name=ep")).json).roles.length; i++) await sleep(50);
  assert.deepEqual(pv.roles, [{ role: "granny", name: "Bà", previews: [1, 2, 3].map((n) => ({ n, file: `.opus/voice-design/granny/granny-${n}.mp3` })) }]);
  assert.equal(pv.can_set_speaker, true);
  assert.equal((await http("GET", `/p/ep/${pv.roles[0].previews[0].file}`)).status, 200, "the page can play a preview");
  for (let i = 0; i < 50 && !listReceipts(ep, { op: "voice-design" }).length; i++) await sleep(50);
  assert.equal(listReceipts(ep, { op: "voice-design" }).length, 1);
  assert.equal(JSON.parse(readFileSync(join(series, "voices", "cast.json"), "utf8")).granny, undefined, "no voice before the pick");

  assert.equal((await http("POST", "/api/voice/pick", { name: "ep", role: "granny", pick: 4 })).status, 400);
  const pick = await http("POST", "/api/voice/pick", { name: "ep", role: "granny", pick: 2 });
  assert.equal(pick.status, 200, pick.text);
  assert.equal((await jobDone(pick.json.job.id)).code, 0);
  for (let i = 0; i < 50 && !listReceipts(ep, { op: "voice-pick" }).length; i++) await sleep(50);
  assert.deepEqual(JSON.parse(readFileSync(join(series, "voices", "cast.json"), "utf8")).granny, { voice_id: "v-granny", picked_preview: 2 });
  assert.equal(listReceipts(ep, { op: "voice-pick" })[0].params.pick, 2);
  for (let i = 0; i < 50 && !readLines(queued).length; i++) await sleep(50);
  assert.equal(readLines(queued).at(-1).text, "Giọng Bà đã chọn. Lồng tiếng các câu của Bà bằng series_tts.");
  assert.deepEqual((await http("GET", "/api/voice/previews?name=ep")).json.roles, [], "a role with a voice waits for no pick");
});

test("a card voices only the text it showed: text changed after the card gets a fresh card, the old yes voices nothing", async () => {
  resetProject([line(1, "hero", "Một."), line(2, "hero", "Hai.")]);
  const ids = ["vo-01", "vo-02"];
  const r = await callTool("series_tts", { project: "ep", ids }, env);
  assert.deepEqual(r.result.estimate, { lines: 2, chars: 8 });
  // The director rewrites a line after the card (set_line_text in the real gateway).
  const m = JSON.parse(readFileSync(join(ep, "project.json"), "utf8"));
  m.lines[1].text = "Hai câu dài hơn rất nhiều so với thẻ đã cho người dùng xem.";
  writeFileSync(join(ep, "project.json"), JSON.stringify(m));
  const stale = await http("POST", "/api/consent/answer", { name: "ep", id: r.result.consent.id, ok: true });
  assert.equal(stale.status, 409, stale.text);
  assert.match(stale.json.error, /đã đổi sau khi thẻ được tạo/);
  assert.equal(readLines(ttsLog).length, 0, "nothing voiced");
  assert.equal(stale.json.consent.estimate.chars, 4 + [..."Hai câu dài hơn rất nhiều so với thẻ đã cho người dùng xem."].length, "the fresh card counts the text as it is now");
  // Asking again with the text changed once more does not answer the waiting card of the old text.
  m.lines[0].text = "Một nữa.";
  writeFileSync(join(ep, "project.json"), JSON.stringify(m));
  const again = await callTool("series_tts", { project: "ep", ids }, env);
  assert.notEqual(again.result.consent.id, stale.json.consent.id);
  assert.deepEqual((await http("GET", "/api/consent?name=ep")).json.cards.map((c) => c.id), [again.result.consent.id]);
});

test("the text file is written from the line when it is missing or differs, and the receipt lists it", async () => {
  resetProject([line(1, "hero", "Lời trong dự án."), line(2, "hero", "Câu hai.")]);
  rmSync(join(ep, "script", "01.txt"));
  writeFileSync(join(ep, "script", "02.txt"), "Lời cũ khác.\n");
  assert.equal((await voiceWithCard(["vo-01", "vo-02"])).code, 0);
  assert.equal(readFileSync(join(ep, "script", "01.txt"), "utf8"), "Lời trong dự án.\n");
  assert.equal(readFileSync(join(ep, "script", "02.txt"), "utf8"), "Câu hai.\n");
  const rec = listReceipts(ep, { op: "series-tts" });
  assert.deepEqual(rec.map((x) => x.inputs.text_written), [true, true]);
  assert.ok(rec.every((x) => x.outputs.some((o) => /script\/0[12]\.txt$/.test(o.path))), JSON.stringify(rec.map((x) => x.outputs)));
});

test("a voice paid for whose mix failed is mixed again with --remix, never paid twice", async () => {
  resetProject([line(1, "hero", "Một câu.")]);
  process.env.FAKE_TTS_MIX_FAIL = "1";
  try { assert.notEqual((await voiceWithCard(["vo-01"])).code, 0); } finally { delete process.env.FAKE_TTS_MIX_FAIL; }
  assert.equal(readLines(ttsLog).filter((c) => !c.remix).length, 1, "one paid call");
  const r = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  const calls = readLines(ttsLog);
  assert.equal(calls.filter((c) => !c.remix).length, 1, "still one paid call");
  assert.equal(calls.at(-1).remix, true);
  assert.equal(calls.at(-1).role, undefined, "a remix sends no text to the voice");
  assert.equal(readLines(join(ep, ".patches.jsonl")).at(-1).ops[0].op, "set_line_audio");
  // Once the line is voiced, a new take is a paid call again (the remix was used up).
  writeFileSync(ttsLog, "");
  assert.equal((await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env)).result.ok, true);
  assert.equal(readLines(ttsLog).filter((c) => !c.remix).length, 1);
});

test("without --remix declared the paid voice is not paid again: the line stops with what to declare", async () => {
  resetProject([line(1, "hero", "Câu khác.")]);
  process.env.FAKE_TTS_MIX_FAIL = "1";
  try { assert.notEqual((await voiceWithCard(["vo-01"])).code, 0); } finally { delete process.env.FAKE_TTS_MIX_FAIL; }
  const decl = JSON.parse(readFileSync(join(series, "studio-series.json"), "utf8"));
  const full = structuredClone(decl);
  delete decl.tools["cast-tts"].flags["--remix"];
  writeFileSync(join(series, "studio-series.json"), JSON.stringify(decl));
  try {
    const r = await callTool("series_tts", { project: "ep", ids: ["vo-01"] }, env);
    assert.equal(r.result?.ok, false, JSON.stringify(r));
    assert.match(JSON.stringify(r.result), /--remix/);
    assert.equal(readLines(ttsLog).length, 1, "no second call at all");
  } finally { writeFileSync(join(series, "studio-series.json"), JSON.stringify(full)); }
});

test("voice_design runs only for the role as the card showed it", async () => {
  resetProject([line(1, "narrator", "Ngày xưa.")]);
  const r = await callTool("voice_design", { project: "ep", role: "narrator" }, env);
  const roles = JSON.parse(readFileSync(join(series, "voices", "roles.json"), "utf8"));
  const before = structuredClone(roles);
  roles.find((x) => x.id === "narrator").description_en = "a much longer, different voice prompt";
  writeFileSync(join(series, "voices", "roles.json"), JSON.stringify(roles));
  try {
    const stale = await http("POST", "/api/consent/answer", { name: "ep", id: r.result.consent.id, ok: true });
    assert.equal(stale.status, 409, stale.text);
    assert.equal(readLines(ttsLog).length, 0, "no Voice Design run");
    assert.equal(stale.json.consent.action.args.role, "narrator");
  } finally { writeFileSync(join(series, "voices", "roles.json"), JSON.stringify(before)); }
});
