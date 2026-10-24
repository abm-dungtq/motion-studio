// lib/handoff.mjs — "needs outside help" cards. When a step that runs a tool (a series tool, an
// image batch, voicing, a scene rebuild, a delivery step, the Drive upload) fails twice in a row
// with the same exit code, trying a third time from Studio rarely helps: Studio writes
// .opus/handoff/<step>.md, a note the user pastes into Claude Code in a terminal, and the page shows
// a card until the file has a line `resolved: …`.
//   .opus/failures.json   { <step>: { code, count, last, tail } }, the run of the same code so far
//   .opus/handoff/<step>.md   title, step, the argv run (never the environment), the code, the last
//                         30 lines, the project, the text to paste, and how to close it
// A resolved file is kept: when the step needs help again it is renamed <step>.resolved-<stamp>.md
// and a new one is written. Every string that reaches a file goes through redact(). Writes are
// atomic (temp file, then rename).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { redact } from "./agents/redact.mjs";
import { writeReceipt } from "./receipts.mjs";

export const STEP = /^[a-z0-9][a-z0-9-]{0,60}$/;
export const TAIL = 30;
export const RESOLVED = /^resolved:/m;
const err = (status, msg) => Object.assign(new Error(msg), { status });

export const failuresFile = (dir) => join(dir, ".opus", "failures.json");
export const handoffDir = (dir) => join(dir, ".opus", "handoff");
const handoffFile = (dir, step) => join(handoffDir(dir), `${step}.md`);
const checkStep = (step) => { if (!STEP.test(String(step ?? ""))) throw err(400, `bước "${String(step ?? "")}" không hợp lệ (chữ thường, số, -)`); return step; };
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(2).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
function readFailures(dir) {
  try { const j = JSON.parse(readFileSync(failuresFile(dir), "utf8")); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
const lines = (tail) => (Array.isArray(tail) ? tail : String(tail ?? "").split("\n")).map((l) => redact(String(l))).filter((l) => l.trim()).slice(-TAIL);
const argvText = (command) => (Array.isArray(command) ? command.map((a) => redact(String(a))).map((a) => (/^[A-Za-z0-9_./:=@%+,-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ") : redact(String(command ?? "")));

// The note for Claude Code. where: the folder the fix most likely lives in (the project or the series).
export function handoffText({ step, code, tail, command, dir, where = null, at = new Date() }) {
  const body = lines(tail);
  const place = where && where !== dir ? `thư mục dự án ${dir} hoặc kho series ${where}` : `thư mục dự án ${dir}`;
  return [
    `# Cần xử lý ngoài: ${step}`,
    "",
    `Bước \`${step}\` của Motion Studio lỗi hai lần liền cùng mã ${code} (lần cuối ${at.toISOString()}). Thử lại trong Studio khó qua; nhờ Claude Code ở terminal xem.`,
    "",
    `- Dự án: ${dir}`,
    `- Mã lỗi: ${code}`,
    `- Lệnh đã chạy: \`${argvText(command) || "(không có)"}\``,
    "",
    `## ${body.length} dòng cuối`,
    "",
    "```text",
    ...(body.length ? body : ["(không có đầu ra)"]),
    "```",
    "",
    "## Dán vào Claude Code ở terminal",
    "",
    "```text",
    `Trong ${place}: bước "${step}" của Motion Studio lỗi hai lần cùng mã ${code}. Lệnh: ${argvText(command) || "(không có)"}. Đọc file ${handoffFile(dir, step)} để xem 30 dòng cuối, tìm nguyên nhân và sửa đúng việc đó, không đổi gì khác. Không in khoá hay token nào. Sửa xong thì thêm vào cuối file đó một dòng "resolved: <ghi chú ngắn>".`,
    "```",
    "",
    "Sửa xong thì thêm một dòng `resolved: <ghi chú>` vào file này.",
    "",
  ].join("\n");
}

// A failed run of step. The same code twice in a row writes the handoff file (once while it is
// open) and a receipt (op handoff). → { count, handoff: boolean, created: boolean, file? }
export async function noteFailure(dir, { step, code, tail = [], command = null, where = null, actor = "studio" }) {
  checkStep(step);
  const all = readFailures(dir);
  const prev = all[step];
  const sameCode = prev && String(prev.code) === String(code);
  const count = sameCode ? prev.count + 1 : 1;
  const at = new Date();
  all[step] = { code, count, last: at.toISOString(), tail: lines(tail).slice(-5) };
  writeAtomic(failuresFile(dir), JSON.stringify(all, null, 2) + "\n");
  if (count < 2) return { count, handoff: false, created: false };
  const file = handoffFile(dir, step);
  const had = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (had != null && !RESOLVED.test(had)) return { count, handoff: true, created: false, file: `.opus/handoff/${step}.md` };
  if (had != null) renameSync(file, join(handoffDir(dir), `${step}.resolved-${stamp(at)}.md`));
  writeAtomic(file, handoffText({ step, code, tail, command, dir, where, at }));
  await writeReceipt(dir, { op: "handoff", actor, tool: { name: "handoff" }, params: { step, code, count }, inputs: { command: argvText(command) }, outputs: [file] });
  return { count, handoff: true, created: true, file: `.opus/handoff/${step}.md` };
}

// A run of step that worked: its count goes (the handoff file stays until it is resolved).
export function noteSuccess(dir, step) {
  checkStep(step);
  const all = readFailures(dir);
  if (!all[step]) return;
  delete all[step];
  writeAtomic(failuresFile(dir), JSON.stringify(all, null, 2) + "\n");
}

// The open cards: every .opus/handoff/<step>.md without a resolved: line, oldest step first.
export function openHandoffs(dir) {
  const d = handoffDir(dir);
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d).sort()) {
    const m = /^([a-z0-9][a-z0-9-]{0,60})\.md$/.exec(f);
    if (!m) continue;
    const text = readFileSync(join(d, f), "utf8");
    if (RESOLVED.test(text)) continue;
    const paste = /## Dán vào Claude Code ở terminal\s*\n+```text\n([\s\S]*?)\n```/.exec(text)?.[1] ?? "";
    out.push({ step: m[1], file: `.opus/handoff/${f}`, text, paste });
  }
  return out;
}

// The user's "Đã xử lý": appends `resolved: <by> <ISO> <note>`. 404 when no open card has that step.
export function resolveHandoff(dir, step, { by = "user@studio", note = "" } = {}) {
  checkStep(step);
  const file = handoffFile(dir, step);
  if (!existsSync(file)) throw err(404, `không có thẻ cần xử lý ngoài cho bước ${step}`);
  const text = readFileSync(file, "utf8");
  if (RESOLVED.test(text)) throw err(409, `thẻ ${step} đã được đánh dấu xử lý`);
  const clean = redact(String(note ?? "").replace(/\s+/g, " ").trim()).slice(0, 300);
  writeAtomic(file, `${text.replace(/\s*$/, "\n")}resolved: ${by} ${new Date().toISOString()}${clean ? ` ${clean}` : ""}\n`);
  return { step, file: `.opus/handoff/${step}.md` };
}

// Runs fn (a step that answers { ok, code?, tail? } or throws) and notes the outcome. An error
// with .status counts as code http-<status>. failed(r) says a result is a failure (default
// ok === false), outcome(r) its { code, tail }. The result gains handoff when a card is open for it.
// A note that cannot be written never hides the step's own result; it is said on stderr.
const warn = (e) => { console.error(`motion-studio: không ghi được lần lỗi của bước: ${e.message}`); return null; };
const isFailure = (r) => r?.ok === false;
const outcomeOf = (r) => ({ code: r.code ?? r.status ?? "error", tail: r.tail ?? [r.error ?? r.message ?? ""] });
export async function tracked(dir, { step, command = null, where = null, actor = "studio" }, fn, { failed = isFailure, outcome = outcomeOf } = {}) {
  let r;
  try { r = await fn(); } catch (e) {
    const h = await noteFailure(dir, { step, code: e.status ? `http-${e.status}` : "error", tail: [e.message], command, where, actor }).catch(warn);
    if (h?.handoff) e.message = `${e.message} (${handoffLine(step, h.file)})`;
    throw e;
  }
  if (r && failed(r)) {
    const h = await noteFailure(dir, { step, ...outcome(r), command, where, actor }).catch(warn);
    return h?.handoff ? { ...r, handoff: { step, file: h.file, message: handoffLine(step, h.file) } } : r;
  }
  else if (r && (r.ok === true || r.waiting_consent)) noteSuccess(dir, step);
  return r;
}
const handoffLine = (step, file) => `bước ${step} lỗi hai lần cùng mã: đã mở thẻ "Cần xử lý ngoài" (${file}); dừng thử lại, chờ người dùng xử lý ngoài Studio`;
