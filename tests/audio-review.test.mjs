// The "hear it again" card of the final gate: GET /api/gates says audio_changed when the
// provider's final preflight warns that the sound changed after the animatic; POST
// /api/gates/audio-check runs the provider's mixBalance, POST /api/gates/audio-review its
// make-demo --record-audio-review. Fake plugin scripts log their argv.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { balanceSummary } from "../routes/gates-audio.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const A = await adapterFor({});
const TOKEN = "a".repeat(64);
const ENV = ["OPUS_VIDEO_HOME", "MOTION_STUDIO_STATE", "FAKE_LOG", "FAKE_AUDIO_CHANGED", "FAKE_BALANCE"];
let tmp, plugin, root, ep, server, port, saved, log;

const LOGGER = `import { appendFileSync } from "node:fs";
const log = (name) => appendFileSync(process.env.FAKE_LOG, JSON.stringify({ name, args: process.argv.slice(2) }) + "\\n");
`;
// Final preflight: passes, with the sound warning when FAKE_AUDIO_CHANGED=1.
const PREFLIGHT = `${LOGGER}log("preflight");
const warnings = process.env.FAKE_AUDIO_CHANGED === "1" ? ["animatic: tiếng đã đổi sau animatic: nghe lại, chạy mix-balance.mjs và qc âm thanh, rồi bấm Nghe rồi, được"] : [];
console.log(JSON.stringify({ pass: true, errors: [], warnings }));
`;
const BALANCE = `${LOGGER}log("mixBalance");
console.log("đo giọng và nhạc…");
console.log(process.env.FAKE_BALANCE || "PASS BALANCE nhạc dưới giọng 5.3 dB (lúc có lời), nhạc lúc không lời −18.0 dBFS");
`;
const DEMO = `${LOGGER}log("demo");
import { appendFileSync as add } from "node:fs";
import { join } from "node:path";
const i = process.argv.indexOf("--project");
if (process.argv.indexOf("--record-audio-review") < 0) process.exit(2);
add(join(process.argv[i + 1], "DEMO.md"), "audio_review: user@studio 2026-10-24T10:00:00.000Z abc123\\n");
console.log("make-demo: audio_review: user@studio 2026-10-24T10:00:00.000Z abc123");
`;
const readLines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

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

before(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-audio-review-")));
  log = join(tmp, "calls.log");
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, gateway: true, extra: "export const COMMANDS = { mixBalance: SCRIPTS + \"/mix-balance.mjs\" };" });
  writeFileSync(join(plugin, "scripts", "check-preflight.mjs"), PREFLIGHT);
  writeFileSync(join(plugin, "scripts", "mix-balance.mjs"), BALANCE);
  writeFileSync(join(plugin, "scripts", "make-demo.mjs"), DEMO);
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, MOTION_STUDIO_STATE: join(tmp, "studio.json"), FAKE_LOG: log });
  delete process.env.FAKE_AUDIO_CHANGED;
  delete process.env.FAKE_BALANCE;
  root = join(tmp, "root");
  ep = join(root, "ep");
  mkdirSync(ep, { recursive: true });
  writeFileSync(join(ep, "BRIEF.md"), "---\ntitle: Thử\n---\n");
  writeFileSync(join(ep, "DEMO.md"), "# DEMO\n\napproval: user@studio 2026-10-24T09:00:00.000Z duyệt animatic\n\n## Frames\n");
  writeFileSync(join(ep, "project.json"), JSON.stringify({ schema: A.NEED.schema, title: "t", fps: 30, width: 1920, height: 1080, duration: 6, html: "index.html", capabilities: { editable: true }, shots: [{ id: "s1", start: 0, end: 6 }], lines: [], music: [], assets: [], version: 1 }));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("the gate says audio_changed only when the final preflight warns that the sound changed", async () => {
  const quiet = await http("GET", "/api/gates?name=ep");
  assert.equal(quiet.status, 200, quiet.text);
  assert.deepEqual(quiet.json, { pass: true, fails: [], animatic: false, audio_changed: false });
  process.env.FAKE_AUDIO_CHANGED = "1";
  try {
    const warned = await http("GET", "/api/gates?name=ep");
    assert.equal(warned.json.audio_changed, true);
    assert.equal(warned.json.pass, true, "a warning does not fail the gate");
  } finally { delete process.env.FAKE_AUDIO_CHANGED; }
  assert.deepEqual(readLines(log).map((c) => c.args), [["--project", ep, "--stage", "final", "--json"], ["--project", ep, "--stage", "final", "--json"]]);
});

test("Đo tiếng runs the provider's mixBalance on the project and answers its summary line", async () => {
  writeFileSync(log, "");
  const r = await http("POST", "/api/gates/audio-check", { name: "ep" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.level, "PASS");
  assert.match(r.json.line, /^PASS BALANCE nhạc dưới giọng 5\.3 dB/);
  assert.equal(r.json.code, 0);
  assert.deepEqual(readLines(log), [{ name: "mixBalance", args: ["--project", ep] }]);
  assert.deepEqual(balanceSummary(["x", "WARN BALANCE nhạc dưới giọng 8.1 dB", "y"]), { level: "WARN", line: "WARN BALANCE nhạc dưới giọng 8.1 dB" });
  assert.deepEqual(balanceSummary(["lỗi"]), { level: null, line: null });
  assert.equal((await http("POST", "/api/gates/audio-check", { name: "nope" })).status, 404);
});

test("Nghe rồi, được records the review through make-demo, leaves approval alone, writes a receipt", async () => {
  writeFileSync(log, "");
  const r = await http("POST", "/api/gates/audio-review", { name: "ep" });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.line, /audio_review: user@studio/);
  assert.deepEqual(readLines(log), [{ name: "demo", args: ["--project", ep, "--record-audio-review", "user@studio"] }]);
  const demo = readFileSync(join(ep, "DEMO.md"), "utf8");
  assert.match(demo, /^approval: user@studio 2026-10-24T09:00:00\.000Z duyệt animatic$/m);
  assert.match(demo, /^audio_review: user@studio /m);
  const rec = listReceipts(ep, { op: "audio-review" });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].actor, "human");
  assert.deepEqual(rec[0].outputs.map((o) => o.path), ["DEMO.md"]);
});
