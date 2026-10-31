// lib/cases-suggest.mjs — the case suggestion of the Director tab: reference cases from the
// provider's library, ranked for the brief. The provider's command (P.suggest.cases, declared by the
// plugin as COMMANDS.suggestCases) ranks with Jev, writes <project>/CASES.md and exits 0 even when Jev is
// off (the file then starts with a "⚠ Jev không chạy (…)" line). Studio only runs the command and
// reads the file; it never ranks cases itself.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runFile } from "../create.mjs";

const TIMEOUT_MS = 90000;
const DEFAULT_OUTPUT = "CASES.md";

const outputOf = (P) => P.suggest?.cases?.output || DEFAULT_OUTPUT;

// CASES.md → { warning, notes, items: [{ n, id, author, category, summary, why, demo, url }], case_search, text }.
// demo is the case's demo video in the provider's library ("Video demo:" line), "" when the block has none.
// The block format is the provider's (rerank-cases.mjs suggestBlock); lines it does not know are kept
// in text only, so a newer format still shows as plain text.
export function parseCases(text) {
  const out = { warning: null, notes: [], items: [], case_search: null, text: String(text ?? "") };
  let cur = null;
  for (const raw of out.text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^>\s*⚠\s*(.+)$/))) out.warning = m[1].trim();
    else if ((m = line.match(/^>\s*(.+)$/))) out.notes.push(m[1].trim());
    else if ((m = line.match(/^(\d+)\.\s+\*\*([^*]+)\*\*\s+·\s+@(\S+)\s+·\s+([^:]+):\s*(.*)$/))) {
      cur = { n: Number(m[1]), id: m[2].trim(), author: m[3], category: m[4].trim(), summary: m[5].trim(), why: "", demo: "", url: "" };
      out.items.push(cur);
    } else if (cur && (m = line.match(/^\s+Vì sao:\s*(.+)$/))) cur.why = m[1].trim();
    else if (cur && (m = line.match(/^\s+Video demo:\s*(https?:\/\/\S+)/))) cur.demo = m[1];
    else if (cur && (m = line.match(/^\s+(https?:\/\/\S+)$/))) cur.url = m[1];
    else if ((m = line.match(/^case_search:\s*(.+)$/))) out.case_search = m[1].trim();
  }
  return out;
}

export function readCases(dir, P) {
  const f = join(dir, outputOf(P));
  if (!existsSync(f)) return null;
  try { return parseCases(readFileSync(f, "utf8")); } catch { return null; }
}

// Runs the provider's command for the project. { ok, code, stderr }; never throws.
export async function runCases(dir, P, run = runFile) {
  const c = P.suggest?.cases;
  if (!c || typeof c.file !== "string" || !Array.isArray(c.args)) return { ok: false, code: null, stderr: "Provider chưa có lệnh gợi ý case." };
  const args = c.args.map((a) => String(a).replaceAll("{project}", dir));
  const r = await run(process.execPath, [c.file, ...args], { cwd: dir, timeout: TIMEOUT_MS });
  const stderr = String(r?.stderr || "").trimEnd().split("\n").slice(-10).join("\n");
  return { ok: r?.code === 0 && existsSync(join(dir, outputOf(P))), code: r?.code ?? null, stderr };
}
