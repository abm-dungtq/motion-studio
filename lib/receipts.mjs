// lib/receipts.mjs — a receipt per generated output: what made it (op, actor, tool, params,
// inputs), the sha256 and size of every output, and the quality checks (lib/quality.mjs) it
// passed. Receipts live in <dir>/.opus/receipts/<yyyymmdd>/<op>-<id>.json (dir is the project
// folder; .opus/ is gitignored and served read-only under /p/<name>/.opus/). Writes are atomic
// (temp file, then rename). Strings of params and inputs go through redact().
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { redactDeep } from "./agents/redact.mjs";
import { runChecks } from "./quality.mjs";

const OP = /^[a-z][a-z0-9-]{1,40}$/;
const DAY = /^\d{8}$/;
export const receiptsDir = (dir) => join(dir, ".opus", "receipts");

export function sha256File(file) {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(file).on("error", rej).on("data", (c) => h.update(c)).on("end", () => res(h.digest("hex")));
  });
}

const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const relTo = (dir, f) => { const r = relative(dir, f); return r && !r.startsWith("..") && !isAbsolute(r) ? r.split(sep).join("/") : f; };
const iso = (t) => (t == null ? null : new Date(t).toISOString());

// Writes and returns the receipt. outputs: absolute paths of the files the op produced.
export async function writeReceipt(dir, { op, actor = "studio", inputs = {}, outputs = [], params = {}, tool = null, started = null, ended = null, checksDir } = {}) {
  if (!OP.test(String(op))) throw new Error(`writeReceipt: op "${op}" không hợp lệ (chữ thường, số, -)`);
  if (!Array.isArray(outputs) || outputs.some((f) => typeof f !== "string" || !isAbsolute(f))) throw new Error("writeReceipt: outputs là mảng đường dẫn tuyệt đối");
  const now = new Date();
  const files = [];
  for (const f of outputs) {
    const st = statSync(f, { throwIfNoEntry: false });
    files.push({ path: relTo(dir, f), size: st?.isFile() ? st.size : null, sha256: st?.isFile() ? await sha256File(f) : null });
  }
  const checks = (await runChecks(outputs, checksDir ? { dir: checksDir } : {})).map((c) => ({ ...c, file: relTo(dir, c.file) }));
  const id = `${now.getTime().toString(36)}-${randomBytes(3).toString("hex")}`;
  const receipt = {
    id, op, actor: String(actor), tool: tool == null ? null : redactDeep(tool),
    params: redactDeep(params ?? {}), inputs: redactDeep(inputs ?? {}),
    outputs: files, checks, pass: checks.every((c) => c.pass),
    started: iso(started), ended: iso(ended ?? now), written: now.toISOString(),
  };
  const day = join(receiptsDir(dir), stamp(now));
  mkdirSync(day, { recursive: true });
  const file = join(day, `${op}-${id}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, file);
  return { ...receipt, file: relTo(dir, file) };
}

// Newest first; op filters by operation. Unreadable files are skipped.
export function listReceipts(dir, { op = null, limit = 50 } = {}) {
  const base = receiptsDir(dir);
  if (!existsSync(base)) return [];
  const n = Math.max(1, Math.min(500, Number(limit) || 50));
  const out = [];
  for (const day of readdirSync(base).filter((d) => DAY.test(d)).sort().reverse()) {
    const files = readdirSync(join(base, day)).filter((f) => f.endsWith(".json") && (!op || f.startsWith(`${op}-`)));
    const rows = [];
    for (const f of files) {
      try { const r = JSON.parse(readFileSync(join(base, day, f), "utf8")); if (!op || r.op === op) rows.push({ ...r, file: relTo(dir, join(base, day, f)) }); } catch { /* half-written or foreign file */ }
    }
    rows.sort((a, b) => String(b.written).localeCompare(String(a.written)));
    for (const r of rows) { out.push(r); if (out.length >= n) return out; }
  }
  return out;
}
