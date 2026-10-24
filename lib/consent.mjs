// lib/consent.mjs — consent cards: before Studio spends paid turns (Codex images, ElevenLabs
// voices, a Drive upload) it writes a card that says what will run and what it costs, and runs it
// only when the user answers yes. One card is .opus/consent/<id>.json of the project:
//   { id, kind: "codex" | "elevenlabs" | "drive", title, count, estimate, quota,
//     action: { name, args }, digest, status: "waiting" | "approved" | "declined", created, decided,
//     by, job?, error?, stale? }
// digest is the sha256 of what the card shows and approves (the batch file, the lines and their
// text, the files to upload, the parameters). An action registered with a digest function is run
// only while that content is unchanged: a yes on a card whose content changed since runs nothing,
// declines that card as stale (by studio), makes a fresh card of the current content (the
// action's renew) and answers 409 with it. waitingCard does the same for a route asked again: a
// waiting card of other content is declined as stale, never answered again.
// Writes are atomic (temp file, then rename). A card is answered once: the second answer is a 409.
// What a yes runs is an action registered by name (registerAction), so a card never carries code.
// Every answer writes a receipt (op "consent").
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeReceipt } from "./receipts.mjs";

export const KINDS = ["codex", "elevenlabs", "drive"];
export const STATUSES = ["waiting", "approved", "declined"];
export const CARD_ID = /^c-[a-z0-9]{6,16}-[a-f0-9]{4}$/;
const ACTION = /^[a-z][a-z0-9-]{1,40}$/;
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
const err = (status, msg) => Object.assign(new Error(msg), { status });

export const consentDir = (dir) => join(dir, ".opus", "consent");
const cardFile = (dir, id) => join(consentDir(dir), `${id}.json`);

// The sha256 of a value: a string or Buffer as is, anything else as its JSON.
export const digestOf = (v) => createHash("sha256").update(typeof v === "string" || Buffer.isBuffer(v) ? v : JSON.stringify(v ?? null)).digest("hex");

const actions = new Map(); // name → { fn, digest, renew }
// fn(ctx, { dir, name, card, args }) runs when a card naming it is approved; what it returns is
// answered to the caller. digest(ctx, { dir, args }) → the digest of the content as it is now
// (throwing when it cannot be read: the card is stale then too); renew(ctx, { dir, args, card }) →
// a fresh waiting card of the current content (or null).
export function registerAction(name, fn, { digest = null, renew = null } = {}) {
  if (!ACTION.test(String(name))) throw new Error(`registerAction: tên "${name}" không hợp lệ`);
  if (typeof fn !== "function") throw new Error(`registerAction ${name}: cần một hàm`);
  actions.set(name, { fn, digest, renew });
}
export const hasAction = (name) => actions.has(name);

function writeCard(dir, card) {
  mkdirSync(consentDir(dir), { recursive: true });
  const f = cardFile(dir, card.id);
  const tmp = `${f}.${process.pid}.${randomBytes(2).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(card, null, 2) + "\n");
  renameSync(tmp, f);
  return card;
}

export function readCard(dir, id) {
  if (!CARD_ID.test(String(id))) return null;
  try { return JSON.parse(readFileSync(cardFile(dir, id), "utf8")); } catch { return null; }
}

// Cards of the project, oldest first; status filters ("waiting" for the ones to answer).
export function listCards(dir, { status = null } = {}) {
  const d = consentDir(dir);
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) {
    const c = readCard(dir, f.slice(0, -5));
    if (c && (!status || c.status === status)) out.push(c);
  }
  return out.sort((a, b) => String(a.created).localeCompare(String(b.created)) || a.id.localeCompare(b.id));
}

const nonNeg = (v, what) => {
  if (!Number.isInteger(v) || v < 0) throw err(400, `${what}: cần số nguyên không âm`);
  return v;
};

// Writes a waiting card and returns it. estimate and quota are what the card shows (plain JSON).
export function createCard(dir, { kind, title, count, estimate = null, quota = null, action, digest = null }) {
  if (!KINDS.includes(kind)) throw err(400, `kind là ${KINDS.join(" | ")}`);
  if (typeof title !== "string" || !title.trim() || title.length > 300) throw err(400, "title: một dòng, tối đa 300 ký tự");
  nonNeg(count, "count");
  if (!action || !ACTION.test(String(action.name))) throw err(400, "action.name không hợp lệ");
  if (!actions.has(action.name)) throw err(400, `chưa có việc "${action.name}" để chạy khi đồng ý`);
  if (actions.get(action.name).digest && !/^[a-f0-9]{64}$/.test(String(digest))) throw err(500, `thẻ ${action.name} cần digest của nội dung được duyệt`);
  const now = new Date();
  const card = {
    id: `c-${now.getTime().toString(36)}-${randomBytes(2).toString("hex")}`, kind, title: title.trim(), count,
    estimate, quota, action: { name: action.name, args: action.args ?? {} }, digest,
    status: "waiting", created: now.toISOString(), decided: null, by: null,
  };
  return writeCard(dir, card);
}

// Declines a waiting card whose content changed (by studio, stale: true), with a receipt.
async function retire(dir, card, why) {
  const done = { ...card, status: "declined", decided: new Date().toISOString(), by: "studio", stale: true, error: why };
  writeCard(dir, done);
  await writeReceipt(dir, {
    op: "consent", actor: "studio", tool: { name: "consent" },
    params: { id: card.id, kind: card.kind, ok: false, stale: true, action: card.action.name, count: card.count, estimate: card.estimate },
    inputs: { title: card.title, reason: why },
  });
  return done;
}
const STALE = "nội dung đã đổi sau khi thẻ được tạo";

// The waiting card of action name whose args match and whose digest is digest; a waiting card of
// the same match with another digest is declined as stale. null when none is left.
export async function waitingCard(dir, name, match, digest) {
  let keep = null;
  for (const c of listCards(dir, { status: "waiting" })) {
    if (c.action?.name !== name || !match(c.action.args ?? {})) continue;
    if (!keep && c.digest === digest) keep = c;
    else await retire(dir, c, STALE);
  }
  return keep;
}

const answering = new Set(); // dir + id while an answer runs: a second one is a 409 meanwhile

// Answers a card: ok true runs its action and returns { card, result }; ok false declines it.
// 404 for an unknown card, 409 once it was answered. When the action throws, the card goes back
// to waiting (with the error noted) and the error is thrown on: nothing ran, so it can be asked again.
export async function answerCard(dir, id, ok, { by = "human", ctx = {} } = {}) {
  if (typeof ok !== "boolean") throw err(400, "ok: cần true hoặc false");
  const actor = typeof by === "string" && ACTOR.test(by) ? by : "human";
  const key = `${dir}\0${id}`;
  const card = readCard(dir, id);
  if (!card) throw err(404, `không có thẻ ${String(id ?? "")}`);
  if (card.status !== "waiting" || answering.has(key)) throw err(409, `thẻ ${id} đã được trả lời (${card.status})`);
  answering.add(key);
  try {
    const decided = new Date().toISOString();
    let result = null;
    const done = { ...card, status: ok ? "approved" : "declined", decided, by: actor, error: undefined };
    if (ok) {
      const a = actions.get(card.action.name);
      if (!a) throw err(500, `không có việc "${card.action.name}" để chạy`);
      if (a.digest) {
        let now = null;
        try { now = await a.digest(ctx, { dir, args: card.action.args }); } catch { /* unreadable: stale */ }
        if (!card.digest || now !== card.digest) {
          await retire(dir, card, STALE);
          let fresh = null;
          try { fresh = a.renew ? await a.renew(ctx, { dir, args: card.action.args, card }) : null; } catch (e) {
            throw Object.assign(err(409, `Thẻ ${id} không chạy: ${STALE}, và chưa tạo được thẻ mới (${e.message})`), { card: null });
          }
          throw Object.assign(err(409, `Thẻ ${id} không chạy: ${STALE}. ${fresh ? `Đã tạo thẻ mới ${fresh.id} theo nội dung hiện tại; xem rồi đồng ý lại.` : "Tạo thẻ mới rồi đồng ý lại."}`), { card: fresh });
        }
      }
      try { result = await a.fn(ctx, { dir, name: card.action.name, card, args: card.action.args }); } catch (e) {
        writeCard(dir, { ...card, error: e.message });
        throw e;
      }
      if (result?.job?.id) done.job = result.job.id;
    }
    writeCard(dir, done);
    await writeReceipt(dir, {
      op: "consent", actor, tool: { name: "consent" },
      params: { id, kind: card.kind, ok, action: card.action.name, count: card.count, estimate: card.estimate },
      inputs: { title: card.title, job: done.job ?? null },
    });
    return { card: done, result };
  } finally { answering.delete(key); }
}
