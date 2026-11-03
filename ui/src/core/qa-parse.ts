// QA.md of a project, read back into checks. Four kinds of section are known; every other heading
// ("## Ghi chú", "## media_check", hand notes) and what sits under it is skipped:
//   ## qc-mp4 <file> <YYYY-MM-DD HH:mm>   lines "- PASS FREEZE …", "- WARN SILENCE lặng 28.52–30.02s (1.5s)"
//   ## BALANCE (<iso>)                    "FAIL BALANCE nhạc dưới giọng 13.2 dB …"
//   ## WORD (<iso>)                       "PASS  WORD   0.9s "cụm" lời 0.88s lệch +20 ms"
//   ## SYNC (<iso>)                       "PASS  SYNC   0.883s Con dấu … lệch +0 ms"
// A check gets a time span from "a–bs" in its text. A WORD or SYNC check starts with its time
// ("0.883s …") and gets that time alone; a qc-mp4 check never does, since "15.02s so với BRIEF"
// or "≥ 2s" are lengths, not times. Summary lines ("- qc-mp4: WARN (1 WARN, 0 FAIL)") are skipped.

export type QaGate = "qc-mp4" | "BALANCE" | "WORD" | "SYNC";
export type QaLevel = "PASS" | "WARN" | "FAIL";
export interface QaItem { level: QaLevel; code: string; text: string; t?: number; until?: number }
export interface QaSection { gate: QaGate; file?: string; at: string; items: QaItem[] }

const QC_HEAD = /^##\s+qc-mp4\s+(.+?)\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\s*$/;
const ISO_HEAD = /^##\s+(BALANCE|WORD|SYNC)\s+\(([^)]*)\)\s*$/;
const ITEM = /^(?:-\s+)?(PASS|WARN|FAIL)\s+([A-Z][A-Z0-9_]*)\s+(.*?)\s*$/;
const RANGE = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s\b/;
const LEAD_T = /^(\d+(?:\.\d+)?)s\b/;

function item(gate: QaGate, level: QaLevel, code: string, text: string): QaItem {
  const out: QaItem = { level, code, text };
  const r = RANGE.exec(text);
  if (r && Number(r[2]) > Number(r[1])) { out.t = Number(r[1]); out.until = Number(r[2]); return out; }
  const one = gate === "WORD" || gate === "SYNC" ? LEAD_T.exec(text) : null;
  if (one) out.t = Number(one[1]);
  return out;
}

export function parseQa(md: string | null | undefined): { sections: QaSection[] } {
  const sections: QaSection[] = [];
  let cur: QaSection | null = null;
  for (const raw of String(md ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      const qc = QC_HEAD.exec(line), iso = qc ? null : ISO_HEAD.exec(line);
      cur = qc ? { gate: "qc-mp4", file: qc[1], at: qc[2], items: [] } : iso ? { gate: iso[1] as QaGate, at: iso[2], items: [] } : null;
      if (cur) sections.push(cur);
      continue;
    }
    if (line.startsWith("#")) { cur = null; continue; }
    const m = cur ? ITEM.exec(line) : null;
    if (m && cur) cur.items.push(item(cur.gate, m[1] as QaLevel, m[2], m[3]));
  }
  return { sections };
}

// The newest section of each gate, and of each rendered file for qc-mp4. Newer is a later time;
// at the same time, the one further down the file (QA.md is only appended to).
export function latest(sections: readonly QaSection[]): QaSection[] {
  const by = new Map<string, QaSection>();
  for (const s of sections) {
    const key = s.gate === "qc-mp4" ? `qc-mp4:${s.file ?? ""}` : s.gate;
    const was = by.get(key);
    if (!was || stamp(s.at) >= stamp(was.at)) by.set(key, s);
  }
  return [...by.values()];
}

// The qc-mp4 section of the render that counts: a file named "final" first, then the newest.
export function currentRender(sections: readonly QaSection[]): QaSection | null {
  const qc = latest(sections).filter((s) => s.gate === "qc-mp4");
  const pool = qc.some((s) => /final/i.test(s.file ?? "")) ? qc.filter((s) => /final/i.test(s.file ?? "")) : qc;
  return pool.reduce<QaSection | null>((a, s) => (!a || stamp(s.at) >= stamp(a.at) ? s : a), null);
}

// What the project's QA says now: the current render's qc-mp4 and the newest BALANCE, WORD, SYNC.
export function currentQa(md: string | null | undefined): QaSection[] {
  const all = parseQa(md).sections;
  const qc = currentRender(all);
  return [...(qc ? [qc] : []), ...latest(all).filter((s) => s.gate !== "qc-mp4")];
}

// qc-mp4 writes local "YYYY-MM-DD HH:mm", the others ISO; within one gate the form is the same,
// so a plain comparison of the digits orders them.
const stamp = (at: string): string => at.replace(/\D/g, "").padEnd(17, "0");
