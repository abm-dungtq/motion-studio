import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWER_TIMEOUT_MS, answerFailure, cardCache, cardKey, liveDirectorJob, pressGate } from "../ui/src/core/gate-cards.ts";

const ask = { kind: "approve", gate: "animatic", question: "Duyệt animatic?", at: "2026-10-17T09:00:00.000Z" };
const waiting = { id: "r1", status: "waiting_user", ask };

test("a waiting card is the same node across redraws, so a press in progress keeps its button", () => {
  const cards = cardCache();
  let built = 0;
  const draw = (r, rejecting = false) => cards.get(cardKey("demo", r, false, rejecting), () => ({ n: ++built }));
  const first = draw(waiting);
  cards.sweep();
  assert.equal(draw(waiting), first);
  cards.sweep();
  assert.equal(built, 1);
  // Opening the reject note changes the markup: a new card.
  assert.notEqual(draw(waiting, true), first);
  cards.sweep();
  // A card not drawn in a redraw (answered, project changed) is dropped.
  cards.sweep();
  assert.equal(cards.has(cardKey("demo", waiting, false, true)), false);
  // A new question on the same request is a new card.
  assert.notEqual(cardKey("demo", waiting, false, false), cardKey("demo", { ...waiting, ask: { ...ask, at: "2026-10-17T09:05:00.000Z" } }, false, false));
});

test("the director job that asked is not shown as working while its card waits", () => {
  const job = { id: "j1", kind: "director", status: "running", meta: { request: "r1" } };
  assert.equal(liveDirectorJob([job], [waiting]), null);
  assert.equal(liveDirectorJob([job], [{ id: "r1", status: "running" }]), job);
  const other = { id: "j2", kind: "director", status: "running", meta: { request: "r2" } };
  assert.equal(liveDirectorJob([other], [waiting, { id: "r2", status: "running" }]), other);
  assert.equal(liveDirectorJob([{ ...job, kind: "export" }], []), null);
});

test("a failed answer says why in Vietnamese and what to do", () => {
  assert.match(answerFailure({ status: 403, error: "thiếu X-Studio-Token" }), /khởi động lại.*Tải lại trang/);
  assert.match(answerFailure({ status: 0, network: true }), /mất kết nối/);
  const gate = answerFailure({ status: 422, error: "Chưa có DEMO.md", stderr: "x\nmake-demo: thiếu animatic\n" });
  assert.match(gate, /^Chưa gửi được câu trả lời: Chưa có DEMO\.md \(make-demo: thiếu animatic\)\. Bấm lại/);
  assert.match(answerFailure({ status: 503 }), /lỗi 503/);
});

test("a redraw during a press waits for the release, so the pressed button stays in the page", () => {
  const press = pressGate();
  const drawn = [];
  assert.equal(press.run(() => drawn.push("idle")), true);
  press.press();
  // Request and job events arriving mid-press: nothing is drawn, only the latest draw is kept.
  assert.equal(press.run(() => drawn.push("first")), false);
  assert.equal(press.run(() => drawn.push("latest")), false);
  assert.deepEqual(drawn, ["idle"]);
  assert.equal(press.pressed, true);
  const held = press.release();
  assert.equal(press.pressed, false);
  held();
  assert.deepEqual(drawn, ["idle", "latest"]);
  // A press with no redraw in between has nothing to run on release.
  press.press();
  assert.equal(press.release(), null);
  assert.equal(press.run(() => drawn.push("after")), true);
});

test("an answer that times out or throws in the page still shows a line on the card", () => {
  assert.ok(ANSWER_TIMEOUT_MS > 60000, "longer than make-pitch choose");
  assert.match(answerFailure({ status: 0, timeout: true }), /chưa trả lời sau 90 giây/);
  assert.match(answerFailure({ error: "boom" }), /Chưa gửi được câu trả lời: boom/);
});
