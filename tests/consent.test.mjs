// lib/consent.mjs and routes/consent.mjs: a paid run waits for the user's yes, a card is answered
// once, and every answer leaves a receipt.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { answerCard, consentDir, createCard, listCards, readCard, registerAction } from "../lib/consent.mjs";
import { listReceipts } from "../lib/receipts.mjs";

const TOKEN = "c".repeat(64);
let tmp, root, pj, server, port, saved;
const ran = [];
registerAction("test-run", (ctx, { args, card }) => {
  if (args.fail) throw Object.assign(new Error("không chạy được"), { status: 409 });
  ran.push({ args, card: card.id, name: ctx.name ?? null });
  return { job: { id: `j-${ran.length}` } };
});

before(async () => {
  saved = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-consent-")));
  root = join(tmp, "root");
  pj = join(root, "pj");
  mkdirSync(pj, { recursive: true });
  writeFileSync(join(pj, "project.json"), "{}");
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
  rmSync(tmp, { recursive: true, force: true });
});

const http = (method, path, body, token = TOKEN) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
  });
  req.on("error", rej);
  if (data) req.write(data);
  req.end();
});
const card = (over = {}) => createCard(pj, { kind: "codex", title: "Đợt thử: 2 ảnh", count: 2, estimate: { images: 2 }, quota: { accounts: [] }, action: { name: "test-run", args: { batch: "thu" } }, ...over });

test("a card is a file of the project, written whole, and lists while it waits", () => {
  const c = card();
  assert.match(c.id, /^c-[a-z0-9]+-[a-f0-9]{4}$/);
  assert.deepEqual(JSON.parse(readFileSync(join(consentDir(pj), `${c.id}.json`), "utf8")), c);
  assert.equal(c.status, "waiting");
  assert.equal(c.decided, null);
  assert.ok(listCards(pj, { status: "waiting" }).some((x) => x.id === c.id));
  assert.throws(() => card({ kind: "paypal" }), /kind/);
  assert.throws(() => card({ action: { name: "unknown-action" } }), /chưa có việc/);
  assert.throws(() => card({ count: -1 }), /count/);
});

test("yes runs the action once with its args; a second answer is 409; no runs nothing", async () => {
  const yes = card();
  const before = ran.length;
  const r = await http("POST", "/api/consent/answer", { name: "pj", id: yes.id, ok: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.card.status, "approved");
  assert.equal(r.json.card.by, "human");
  assert.equal(r.json.job.id, `j-${before + 1}`);
  assert.equal(ran.length, before + 1);
  assert.deepEqual(ran.at(-1), { args: { batch: "thu" }, card: yes.id, name: "pj" });
  assert.equal(readCard(pj, yes.id).job, `j-${before + 1}`);
  const again = await http("POST", "/api/consent/answer", { name: "pj", id: yes.id, ok: true });
  assert.equal(again.status, 409);
  assert.equal(ran.length, before + 1, "the second answer runs nothing");
  const no = card();
  const d = await http("POST", "/api/consent/answer", { name: "pj", id: no.id, ok: false });
  assert.equal(d.status, 200, d.text);
  assert.equal(d.json.card.status, "declined");
  assert.equal(d.json.job, null);
  assert.equal(ran.length, before + 1, "a declined card runs nothing");
  assert.equal((await http("POST", "/api/consent/answer", { name: "pj", id: no.id, ok: true })).status, 409);
  const w = await http("GET", "/api/consent?name=pj");
  assert.ok(!w.json.cards.some((x) => x.id === yes.id || x.id === no.id), "answered cards leave the waiting list");
  const all = await http("GET", "/api/consent?name=pj&all=1");
  assert.ok(all.json.cards.some((x) => x.id === yes.id) && all.json.cards.some((x) => x.id === no.id));
  // Each answer left a receipt saying who, what and the estimate.
  const recs = listReceipts(pj, { op: "consent" });
  const of = (id) => recs.find((x) => x.params.id === id);
  assert.deepEqual([of(yes.id).params.ok, of(yes.id).params.action, of(yes.id).params.count, of(yes.id).actor], [true, "test-run", 2, "human"]);
  assert.equal(of(no.id).params.ok, false);
  assert.deepEqual(of(yes.id).params.estimate, { images: 2 });
});

test("an unknown card is 404, a bad id or answer 400 or 404, and POST needs the token", async () => {
  assert.equal((await http("POST", "/api/consent/answer", { name: "pj", id: "c-zzzzzzzz-0000", ok: true })).status, 404);
  assert.equal((await http("POST", "/api/consent/answer", { name: "pj", id: "../x", ok: true })).status, 404);
  const c = card();
  assert.equal((await http("POST", "/api/consent/answer", { name: "pj", id: c.id, ok: "yes" })).status, 400);
  assert.equal((await http("POST", "/api/consent/answer", { name: "pj", id: c.id, ok: true }, null)).status, 403);
  assert.equal((await http("POST", "/api/consent/answer", { name: "nope", id: c.id, ok: true })).status, 404);
  assert.equal(readCard(pj, c.id).status, "waiting");
});

test("an action that fails leaves the card waiting with the error, so it can be answered again", async () => {
  const c = card({ action: { name: "test-run", args: { fail: true } } });
  await assert.rejects(answerCard(pj, c.id, true), /không chạy được/);
  const left = readCard(pj, c.id);
  assert.equal(left.status, "waiting");
  assert.equal(left.error, "không chạy được");
  const d = await answerCard(pj, c.id, false, { by: "director:r-1" });
  assert.equal(d.card.status, "declined");
  assert.equal(d.card.by, "director:r-1");
  assert.equal(d.card.error, undefined);
});
