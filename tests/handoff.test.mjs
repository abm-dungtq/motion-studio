// lib/handoff.mjs and routes/handoff.mjs: a step that fails twice in a row with the same code
// writes .opus/handoff/<step>.md, a note to paste into Claude Code, and shows a card until the
// file has a resolved: line. Driven here through series_tool and a failing fake series tool.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { failuresFile, noteFailure, noteSuccess, openHandoffs, resolveHandoff, tracked } from "../lib/handoff.mjs";
import { adapterFor } from "../lib/provider.mjs";
import { listReceipts } from "../lib/receipts.mjs";
import { callTool, studioClient, toolEnv } from "../lib/tools.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
const TOKEN = "h".repeat(64);
const SECRET = "gia-tri-bien-moi-truong-khong-duoc-chep-7f3a";
// build-rig: fails with $FAKE_RIG_EXIT (3 by default) and prints a line that looks like a key.
const RIG = `console.log("đọc rig " + process.argv.slice(2).join(" "));
console.error("ELEVENLABS_API_KEY=sk_" + "0123456789abcdef0123456789abcdef");
console.error("không có nhân vật");
process.exit(Number(process.env.FAKE_RIG_EXIT || 3));
`;
let tmp, saved, plugin, P, series, root, ep, server, port, env;

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
const project = (name) => { const d = join(root, name); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "BRIEF.md"), `---\ntitle: x\nseries: ${series}\n---\n`); return realpathSync(d); };
const rig = (name) => callTool("series_tool", { project: name, tool: "build-rig", flags: { "--char": "khong-co" } }, env);

before(async () => {
  saved = { OPUS_VIDEO_HOME: process.env.OPUS_VIDEO_HOME, FAKE_RIG_EXIT: process.env.FAKE_RIG_EXIT, HANDOFF_SECRET: process.env.HANDOFF_SECRET };
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-handoff-")));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  Object.assign(process.env, { OPUS_VIDEO_HOME: plugin, HANDOFF_SECRET: SECRET });
  delete process.env.FAKE_RIG_EXIT;
  P = await A.create({ OPUS_VIDEO_HOME: plugin });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  writeFileSync(join(series, "tools", "build-rig.mjs"), RIG);
  const decl = JSON.parse(readFileSync(join(series, "studio-series.json"), "utf8"));
  decl.tools["build-rig"] = { file: "tools/build-rig.mjs", flags: { "--char": "id" }, writes: [], timeout_s: 30 };
  writeFileSync(join(series, "studio-series.json"), JSON.stringify(decl));
  root = join(tmp, "root");
  mkdirSync(root, { recursive: true });
  ep = project("ep");
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  env = toolEnv({ root, P, studio: studioClient({ state: { url: `http://127.0.0.1:${port}/`, token: TOKEN } }) });
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true });
});

test("build-rig failing twice with code 3 opens a card with the note to paste; no key, no environment", async () => {
  const one = await rig("ep");
  assert.equal(one.result.ok, false);
  assert.equal(one.result.code, 3);
  assert.equal(one.result.handoff, undefined);
  assert.deepEqual(openHandoffs(ep), []);
  const two = await rig("ep");
  assert.equal(two.result.handoff.step, "build-rig");
  assert.match(two.result.handoff.message, /dừng thử lại/);
  const cards = (await http("GET", "/api/handoff?name=ep")).json.cards;
  assert.deepEqual(cards.map((c) => [c.step, c.file]), [["build-rig", ".opus/handoff/build-rig.md"]]);
  const text = readFileSync(join(ep, ".opus", "handoff", "build-rig.md"), "utf8");
  assert.match(text, /^# Cần xử lý ngoài: build-rig/);
  assert.match(text, /- Mã lỗi: 3/);
  assert.match(text, /--char=khong-co/);
  assert.match(text, /không có nhân vật/);
  assert.match(text, /Sửa xong thì thêm một dòng `resolved: <ghi chú>` vào file này\.\n$/);
  assert.ok(text.includes(series), "the paste names the series folder");
  assert.match(cards[0].paste, /^Trong thư mục dự án .* hoặc kho series .*: bước "build-rig"/);
  assert.doesNotMatch(text, /sk_0123456789abcdef/);
  assert.ok(!text.includes(SECRET), "the environment is never written");
  assert.equal(listReceipts(ep, { op: "handoff" }).length, 1);
  // A third failure keeps the open card as it is.
  await rig("ep");
  assert.equal(listReceipts(ep, { op: "handoff" }).length, 1);
});

test("code 3 then code 4 is not a handoff; a success clears the count", async () => {
  const d = project("ep2");
  process.env.FAKE_RIG_EXIT = "3";
  await rig("ep2");
  process.env.FAKE_RIG_EXIT = "4";
  const r = await rig("ep2");
  delete process.env.FAKE_RIG_EXIT;
  assert.equal(r.result.handoff, undefined);
  assert.deepEqual(openHandoffs(d), []);
  assert.deepEqual(JSON.parse(readFileSync(failuresFile(d), "utf8"))["build-rig"].count, 1);
  noteSuccess(d, "build-rig");
  assert.equal(JSON.parse(readFileSync(failuresFile(d), "utf8"))["build-rig"], undefined);
});

test("resolved: closes the card; the next pair of failures keeps the old note and writes a new one", async () => {
  const bad = await http("POST", "/api/handoff/resolve", { name: "ep", step: "no-such" });
  assert.equal(bad.status, 404);
  const ok = await http("POST", "/api/handoff/resolve", { name: "ep", step: "build-rig", note: "đã thêm nhân vật" });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual((await http("GET", "/api/handoff?name=ep")).json.cards, []);
  assert.match(readFileSync(join(ep, ".opus", "handoff", "build-rig.md"), "utf8"), /\nresolved: user@studio \S+ đã thêm nhân vật\n$/);
  assert.equal((await http("POST", "/api/handoff/resolve", { name: "ep", step: "build-rig" })).status, 409);
  // A resolved: line added by hand closes a card too.
  const d = project("ep3");
  await noteFailure(d, { step: "tts", code: 1, tail: ["x"] });
  await noteFailure(d, { step: "tts", code: 1, tail: ["x"] });
  assert.equal(openHandoffs(d).length, 1);
  appendFileSync(join(d, ".opus", "handoff", "tts.md"), "resolved: sửa tay\n");
  assert.deepEqual(openHandoffs(d), []);
  // Failing again after resolving: the old note is kept beside the new one.
  await noteFailure(d, { step: "tts", code: 1 });
  await noteFailure(d, { step: "tts", code: 1 });
  assert.equal(openHandoffs(d).length, 1);
  assert.ok(readdirSync(join(d, ".opus", "handoff")).some((f) => /^tts\.resolved-\d{8}T\d{6}\.md$/.test(f)));
  assert.throws(() => resolveHandoff(d, "../x"), /không hợp lệ/);
});

test("tracked: a thrown error counts by its HTTP status and still throws; a waiting card is not a failure", async () => {
  const d = project("ep4");
  const boom = () => { throw Object.assign(new Error("Studio trả 500"), { status: 500 }); };
  await assert.rejects(() => tracked(d, { step: "asset-batch" }, boom), /Studio trả 500$/);
  await assert.rejects(() => tracked(d, { step: "asset-batch" }, boom), /Cần xử lý ngoài|cần xử lý ngoài/i);
  assert.equal(JSON.parse(readFileSync(failuresFile(d), "utf8"))["asset-batch"].code, "http-500");
  await tracked(d, { step: "asset-batch" }, async () => ({ waiting_consent: true }));
  assert.equal(JSON.parse(readFileSync(failuresFile(d), "utf8"))["asset-batch"], undefined);
  assert.ok(existsSync(join(d, ".opus", "handoff", "asset-batch.md")), "the note stays until resolved");
});
