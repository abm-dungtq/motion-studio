// lib/delivery.mjs, routes/delivery.mjs and lib/tools/delivery.mjs: an episode handed over into the
// series' delivery folder (delivery_dir), never over a file. Fake plugin commands, fake viet-pro
// checks, fake image CLIs and a fake make-thumbnail series tool; no network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { dropCache } from "../lib/agents/index.mjs";
import { listCards } from "../lib/consent.mjs";
import { chapterLines, placeCopy, withChapters } from "../lib/delivery.mjs";
import { openHandoffs } from "../lib/handoff.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakeAgents } from "./fake-cli.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "d".repeat(64);
let tmp, plugin, P, series, root, ep, out, server, port, saved, env, agents, queued;

// The plugin's export, captions and viet-pro gate, and viet-pro's check-platform and lint. Each
// logs its argv to $FAKE_DELIVERY_LOG; FAKE_<NAME>_EXIT makes it fail with that code.
const script = (name, body) => `import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const argv = process.argv.slice(2);
const opt = (k) => argv[argv.indexOf(k) + 1];
appendFileSync(process.env.FAKE_DELIVERY_LOG, JSON.stringify({ name: ${JSON.stringify(name)}, argv }) + "\\n");
const code = Number(process.env.FAKE_${name.toUpperCase()}_EXIT || 0);
${body}
`;
const EXPORT = script("export", `if (code === 5) { console.log("FAIL preflight: demo chưa duyệt"); process.exit(5); }
if (code) { console.error("ffmpeg lỗi"); process.exit(code); }
const base = opt("--input").replace(/\\.mp4$/, "");
for (const t of opt("--target").split(",")) { const f = base + "-" + t + ".mp4"; if (existsSync(f)) { console.error("đã có " + f); process.exit(2); } writeFileSync(f, "video " + t); }
console.log("EXPORT ok");`);
const CAPTIONS = script("captions", `if (code) process.exit(code);
mkdirSync(dirname(opt("--out")), { recursive: true });
writeFileSync(opt("--out"), process.env.FAKE_CAPTIONS_EMPTY ? "" : "1\\n00:00:00,000 --> 00:00:01,000\\nXin chào\\n");
console.log("CAPTIONS " + opt("--out") + " cues=1 lines=1");`);
const VIETPRO = script("vietpro", `if (code) { console.log("FAIL CAPTIONS.md: câu sáo rỗng"); process.exit(code); } console.log("PASS");`);
const PLATFORM = script("platform", `if (code) { console.log("ERROR title: dài quá 100 ký tự"); console.log("WARN description: thiếu hashtag"); process.exit(code); } console.log("OK youtube");`);
const LINT = script("lint", `if (code) { console.log("ERROR dòng 3: từ sáo rỗng"); process.exit(code); } console.log("WARN dòng 5: câu dài");`);
// make-thumbnail: copies --in to --out and logs its flags.
const THUMB = `import { appendFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
appendFileSync(process.env.FAKE_DELIVERY_LOG, JSON.stringify({ name: "make-thumbnail", a }) + "\\n");
mkdirSync(dirname(a.out), { recursive: true });
copyFileSync(a.in, a.out);
`;

const calls = (name) => (existsSync(join(tmp, "calls.log")) ? readFileSync(join(tmp, "calls.log"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.name === name) : []);
const files = () => (existsSync(out) ? readdirSync(out).sort() : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = () => ({
  schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 70, html: "index.html", capabilities: { timing_markers: true, editable: true },
  shots: [{ id: "s1", name: "", start: 0, end: 65 }, { id: "s2", name: "", start: 65, end: 70 }],
  scenes: [{ id: "c1", label: "Mở đầu", shots: ["s1"] }, { id: "c2", label: "Cao trào", shots: ["s2"] }],
  lines: [], music: [], assets: [], version: 1,
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
async function jobDone(id) {
  for (let i = 0; i < 300; i++) {
    const j = (await http("GET", "/api/jobs?name=ep")).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await sleep(100);
  }
  throw new Error(`job ${id} still running`);
}
const setExit = (name, code) => { if (code) process.env[`FAKE_${name.toUpperCase()}_EXIT`] = String(code); else delete process.env[`FAKE_${name.toUpperCase()}_EXIT`]; };

before(async () => {
  saved = { ...process.env };
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-delivery-")));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true, gateway: true });
  const s = (f, body) => { writeFileSync(join(plugin, "scripts", f), body); return join(plugin, "scripts", f); };
  const vp = join(tmp, "viet-pro", "scripts");
  mkdirSync(vp, { recursive: true });
  writeFileSync(join(vp, "check-platform.mjs"), PLATFORM);
  writeFileSync(join(vp, "lint-vietnamese-content.mjs"), LINT);
  const cmds = { export: s("export.mjs", EXPORT), captions: s("captions-from-words.mjs", CAPTIONS), vietPro: s("check-viet-pro.mjs", VIETPRO), platform: join(vp, "check-platform.mjs") };
  queued = join(tmp, "queued.jsonl");
  const api = join(plugin, "scripts", "studio-api.mjs");
  writeFileSync(api, readFileSync(api, "utf8").replace("export const enqueue = () => null;", `import { appendFileSync as _qa } from "node:fs";\nexport const enqueue = (dir, r) => { _qa(${JSON.stringify(queued)}, JSON.stringify({ dir, ...r }) + "\\n"); return { id: "r-1", ...r }; };`) + `\nexport const COMMANDS = ${JSON.stringify(cmds)};\n`);

  agents = fakeAgents({ vars: { FAKE_AGY: "check" } });
  writeFileSync(agents.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { vision: ["agy"] } } }));
  Object.assign(process.env, agents.env, { OPUS_VIDEO_HOME: plugin, FAKE_DELIVERY_LOG: join(tmp, "calls.log") });
  dropCache();
  P = await A.create({ OPUS_VIDEO_HOME: plugin });

  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  writeFileSync(join(series, "tools", "make-thumbnail.mjs"), THUMB);
  const decl = JSON.parse(readFileSync(join(series, "studio-series.json"), "utf8"));
  decl.image_styles.thumbnail = "bright, empty right half";
  decl.tools["make-thumbnail"] = { file: "tools/make-thumbnail.mjs", flags: { "--in": "path:read", "--out": "path:write", "--line1": "text", "--line2": "text", "--accent": "word", "--tag": "text" }, writes: ["{project}/delivery"], timeout_s: 30 };
  writeFileSync(join(series, "studio-series.json"), JSON.stringify(decl));
  mkdirSync(join(series, "delivery"), { recursive: true });
  writeFileSync(join(series, "delivery", "tap-2-tieu-de-mo-ta.md"), "## title\n\nTập hai\n\n## description\n\nMô tả tập hai.\n\n## tags\n\nhoạt hình, kể chuyện\n");
  out = join(series, "delivery", "tap-2");

  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(join(ep, "renders"), { recursive: true });
  writeFileSync(join(ep, "BRIEF.md"), `---\ntitle: Tập thử\nseries: ${series}\nepisode: 2\n---\n`);
  writeFileSync(join(ep, "index.html"), "<div data-composition-id=\"main\" data-duration=\"70\"></div>\n");
  writeFileSync(join(ep, "project.json"), JSON.stringify(manifest()));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  env = { ...toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) }), actor: "director", request: "r-3" };
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  dropCache();
  agents.rm?.();
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("a copy never goes over a file: the same bytes count as placed, other bytes take -2, a symlink is refused", () => {
  const d = join(tmp, "place");
  mkdirSync(d, { recursive: true });
  const a = join(tmp, "a.txt"), b = join(tmp, "b.txt");
  writeFileSync(a, "một"); writeFileSync(b, "hai");
  assert.deepEqual([placeCopy(a, d, "x.txt").name, placeCopy(a, d, "x.txt").same], ["x.txt", true]);
  assert.equal(placeCopy(b, d, "x.txt").name, "x-2.txt");
  assert.equal(placeCopy(b, d, "x.txt").name, "x-2.txt", "the -2 copy is found again");
  assert.equal(readFileSync(join(d, "x.txt"), "utf8"), "một");
  symlinkSync(a, join(d, "y.txt"));
  assert.throws(() => placeCopy(b, d, "y.txt"), /symlink/);
});

test("chapters: one line per scene, the first at 0:00, added at the end of the description only once", () => {
  const lines = chapterLines(manifest());
  assert.deepEqual(lines, ["0:00 Mở đầu", "1:05 Cao trào"]);
  const r = withChapters("## title\n\nA\n\n## description\n\nB.\n\n## tags\n\nx\n", lines);
  assert.equal(r.text, "## title\n\nA\n\n## description\n\nB.\n\n0:00 Mở đầu\n1:05 Cao trào\n\n## tags\n\nx\n");
  assert.equal(withChapters(r.text, lines).added, false);
  assert.match(withChapters("## title\n\nA\n", lines).text, /## description\n\n0:00 Mở đầu/);
  assert.equal(withChapters("x", []).added, false);
});

test("deliver_text: the series draft with chapters, checked, copied; a failed check copies nothing", async () => {
  setExit("platform", 1);
  const bad = await callTool("deliver_text", { project: "ep" }, env);
  assert.equal(bad.ok, true, bad.error);
  assert.equal(bad.result.ok, false);
  assert.equal(bad.result.tail[0], "ERROR title: dài quá 100 ký tự");
  assert.deepEqual(files(), [], "nothing reaches the delivery folder");
  const draft = readFileSync(join(ep, "delivery", "tieu-de-mo-ta.md"), "utf8");
  assert.match(draft, /Mô tả tập hai\.\n\n0:00 Mở đầu\n1:05 Cao trào\n\n## tags/);
  assert.equal(bad.result.made.source, "S/delivery/tap-2-tieu-de-mo-ta.md");
  setExit("platform", 0);
  const ok = await callTool("deliver_text", { project: "ep" }, env);
  assert.equal(ok.result.ok, true, JSON.stringify(ok.result));
  assert.deepEqual(ok.result.files, ["S/delivery/tap-2/tieu-de-mo-ta.md"]);
  assert.deepEqual(ok.result.warnings, ["WARN dòng 5: câu dài"]);
  assert.equal(readFileSync(join(out, "tieu-de-mo-ta.md"), "utf8"), draft);
  assert.deepEqual(calls("platform").at(-1).argv, ["youtube", join(realpathSync(ep), "delivery", "tieu-de-mo-ta.md")]);
  // Twice: the same file stays; an edited draft is placed beside it, never over it.
  await callTool("deliver_text", { project: "ep" }, env);
  assert.deepEqual(files(), ["tieu-de-mo-ta.md"]);
  writeFileSync(join(ep, "delivery", "tieu-de-mo-ta.md"), draft.replace("Tập hai", "Tập hai, sửa"));
  const again = await callTool("deliver_text", { project: "ep" }, env);
  assert.deepEqual(again.result.files, ["S/delivery/tap-2/tieu-de-mo-ta-2.md"]);
  assert.equal(readFileSync(join(out, "tieu-de-mo-ta.md"), "utf8"), draft);
  const rc = listReceipts(realpathSync(ep), { op: "deliver-text" })[0];
  assert.equal(rc.inputs.files[0].name, "tieu-de-mo-ta-2.md");
  assert.match(rc.inputs.files[0].sha256, /^[a-f0-9]{64}$/);
});

test("deliver_captions: needs CAPTIONS.md, runs the delivery gate, copies the SRT and CAPTIONS.md", async () => {
  process.env.FAKE_CAPTIONS_EMPTY = "1";
  writeFileSync(join(ep, "CAPTIONS.md"), "## Facebook\n\nx\n\n## TikTok\n\ny\n");
  const empty = await callTool("deliver_captions", { project: "ep" }, env);
  delete process.env.FAKE_CAPTIONS_EMPTY;
  rmSync(join(ep, "CAPTIONS.md"));
  assert.equal(empty.result.code, "no-cues", "an episode without voiced lines delivers no empty SRT");
  assert.deepEqual(calls("vietpro"), []);
  const none = await callTool("deliver_captions", { project: "ep" }, env);
  assert.equal(none.result.code, "no-captions");
  assert.match(none.result.message, /CAPTIONS\.md/);
  writeFileSync(join(ep, "CAPTIONS.md"), "## Facebook\n\nXem tập hai.\n\n## TikTok\n\nTập hai đây.\n");
  setExit("vietpro", 1);
  const gate = await callTool("deliver_captions", { project: "ep" }, env);
  assert.equal(gate.result.ok, false);
  assert.match(gate.result.message, /viet-pro --stage delivery/);
  assert.ok(!files().includes("CAPTIONS.md"));
  setExit("vietpro", 0);
  const ok = await callTool("deliver_captions", { project: "ep" }, env);
  assert.equal(ok.result.ok, true, JSON.stringify(ok.result));
  assert.deepEqual(ok.result.files, ["S/delivery/tap-2/ep.srt", "S/delivery/tap-2/CAPTIONS.md"]);
  assert.deepEqual(calls("vietpro").at(-1).argv, ["--project", realpathSync(ep), "--stage", "delivery"]);
  assert.match(readFileSync(join(out, "ep.srt"), "utf8"), /Xin chào/);
  // The SRT is made again from words.json each time: an existing delivery/ep.srt is not kept.
  const twice = await callTool("deliver_captions", { project: "ep" }, env);
  assert.deepEqual(twice.result.files, ok.result.files);
});

test("deliver_export: the newest final render; the final gate stops it twice → a handoff card; then three files", async () => {
  const none = await callTool("deliver_export", { project: "ep" }, env);
  assert.match(none.error, /renders\/\*-final\.mp4/);
  writeFileSync(join(ep, "renders", "ep-1-final.mp4"), "old");
  await sleep(20);
  writeFileSync(join(ep, "renders", "ep-2-final.mp4"), "new");
  setExit("export", 5);
  const blocked = await callTool("deliver_export", { project: "ep" }, env);
  assert.equal(blocked.result.input, "renders/ep-2-final.mp4");
  assert.equal(blocked.result.gate, "blocked");
  assert.match(blocked.result.message, /Cổng final chặn/);
  assert.ok(blocked.result.tail.includes("FAIL preflight: demo chưa duyệt"));
  assert.equal(blocked.result.handoff, undefined, "one failure is not a handoff yet");
  const twice = await callTool("deliver_export", { project: "ep" }, env);
  assert.equal(twice.result.handoff.step, "deliver-export");
  assert.deepEqual(openHandoffs(realpathSync(ep)).map((h) => h.step), ["deliver-export"]);
  assert.ok(!files().some((f) => f.endsWith(".mp4")));
  setExit("export", 0);
  const ok = await callTool("deliver_export", { project: "ep" }, env);
  assert.equal(ok.result.ok, true, JSON.stringify(ok.result));
  assert.deepEqual(ok.result.files, ["youtube", "facebook", "tiktok"].map((t) => `S/delivery/tap-2/ep-2-final-${t}.mp4`));
  assert.deepEqual(calls("export").at(-1).argv.slice(4), ["--target", "youtube,facebook,tiktok", "--no-thumb"]);
  // Again: the exports exist, export.mjs is not run (it would refuse them), nothing new placed.
  const n = calls("export").length;
  const again = await callTool("deliver_export", { project: "ep" }, env);
  assert.deepEqual([again.result.ok, again.result.exported, calls("export").length], [true, [], n]);
  assert.equal(files().filter((f) => f.endsWith(".mp4")).length, 3);
  const bad = await callTool("deliver_export", { project: "ep", input: "../x.mp4" }, env);
  assert.match(bad.error, /input/);
});

test("deliver_thumbnail draws nothing before the card; the yes draws three, the pick becomes thumbnail.jpg", async () => {
  const bad = await callTool("deliver_thumbnail", { project: "ep", line1: "", line2: "x" }, env);
  assert.match(bad.error, /line1/);
  const t = await callTool("deliver_thumbnail", { project: "ep", line1: "BÍ MẬT", line2: "CUỐI CÙNG", accent: "red" }, env);
  assert.equal(t.ok, true, t.error);
  assert.equal(t.result.waiting_consent, true);
  assert.match(t.result.consent.title, /^3 ảnh nền thumbnail, ước 3 lượt vẽ/);
  assert.equal(t.result.consent.kind, "codex");
  assert.doesNotMatch(agents.calls(), / exec /, "no drawing before the answer");
  const again = await callTool("deliver_thumbnail", { project: "ep", line1: "A", line2: "B" }, env);
  assert.equal(again.result.consent.id, t.result.consent.id, "one waiting card");
  const st = await http("GET", "/api/delivery?name=ep");
  assert.deepEqual(st.json.cards.map((c) => c.id), [t.result.consent.id]);

  const yes = await http("POST", "/api/consent/answer", { name: "ep", id: t.result.consent.id, ok: true });
  assert.equal(yes.status, 200, yes.text);
  assert.equal(yes.json.job.kind, "asset-batch");
  const j = await jobDone(yes.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  for (const i of [1, 2, 3]) assert.ok(existsSync(join(ep, "delivery", `thumb-${i}.jpg`)), `thumb-${i}`);
  const made = calls("make-thumbnail");
  assert.equal(made.length, 3);
  assert.deepEqual([made[0].a.line1, made[0].a.line2, made[0].a.accent, made[0].a.tag], ["BÍ MẬT", "CUỐI CÙNG", "red", "SERIES THỬ · TẬP 2"]);

  assert.equal((await http("POST", "/api/delivery/thumbnail/pick", { name: "ep", n: 4 })).status, 400);
  const pick = await http("POST", "/api/delivery/thumbnail/pick", { name: "ep", n: 2 });
  assert.deepEqual(pick.json.files, ["S/delivery/tap-2/thumbnail.jpg"]);
  assert.equal(readFileSync(join(out, "thumbnail.jpg"), "base64"), readFileSync(join(ep, "delivery", "thumb-2.jpg"), "base64"));
});

test("delivery_status: the folder, the rows, the masked Drive account; the Drive button only asks", async () => {
  const st = await callTool("delivery_status", { project: "ep" }, env);
  const r = st.result;
  assert.equal(r.folder, "S/delivery/tap-2");
  assert.equal(r.rows.video.files.length, 3);
  assert.equal(r.rows.video.error, null, "the export that worked cleared its count");
  assert.deepEqual(r.rows.thumbnail.files, ["thumbnail.jpg"]);
  assert.deepEqual(r.rows.thumbnail.drafts, ["delivery/thumb-1.jpg", "delivery/thumb-2.jpg", "delivery/thumb-3.jpg"]);
  assert.deepEqual(r.rows.captions.files, ["ep.srt", "CAPTIONS.md"]);
  assert.equal(r.drive.account, "som…@example.com");
  assert.equal(r.input, "renders/ep-2-final.mp4");

  const card = await callTool("drive_upload", { project: "ep" }, env);
  assert.equal(card.result.waiting_consent, true);
  assert.match(card.result.consent.title, /^Tải \d+ file \([\d.]+ MB\) lên Drive som…@example\.com\/thu$/);
  assert.equal(card.result.consent.kind, "drive");
  assert.equal(listCards(realpathSync(ep), { status: "waiting" }).filter((c) => c.action.name === "drive-upload").length, 1);

  const ask = await http("POST", "/api/delivery/ask", { name: "ep", row: "text" });
  assert.equal(ask.status, 200, ask.text);
  const req = readFileSync(queued, "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  assert.match(req.text, /delivery\/tieu-de-mo-ta\.md/);
  assert.equal((await http("POST", "/api/delivery/ask", { name: "ep", row: "x" })).status, 400);
});

test("a project outside a series, or without episode:, is refused", async () => {
  mkdirSync(join(root, "loose"), { recursive: true });
  writeFileSync(join(root, "loose", "BRIEF.md"), "---\ntitle: x\n---\n");
  assert.match((await callTool("delivery_status", { project: "loose" }, env)).error, /không thuộc series/);
  mkdirSync(join(root, "noep"), { recursive: true });
  writeFileSync(join(root, "noep", "BRIEF.md"), `---\ntitle: x\nseries: ${series}\n---\n`);
  assert.match((await callTool("deliver_text", { project: "noep" }, env)).error, /episode:/);
});
