#!/usr/bin/env node
// Fills the "Mới" column (and "Chỗ trong UI mới" when a report has one) of parity-checklist.md from
// the per-area parity reports, so the checklist is never copied by hand.
//
//   node ui/scripts/fill-parity.mjs <plan dir>
//
// Reads reports/parity-3.md and reports/parity-{timeline,media,voice-music,director,export,anime,
// lemo,fx}.md. A report row is "| <ID> | có / không | [<chỗ> |] <ghi chú> |": three columns
// (ID, result, note) or four (ID, result, place, note). Prints "THIẾU <ID>" for a checklist ID no
// report has and "TRÙNG <ID>" for an ID in two reports (or twice in one), and exits 1 if either
// shows up; the checklist is then left as it was.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AREAS = ["3", "timeline", "media", "voice-music", "director", "export", "anime", "lemo", "fx"];
const ROW = /^\| [A-Z]+-\S* \|/;
// Column indexes of a checklist row, after splitting "| a | b |" into ["", "a", "b", ""].
const COL_NEW = 7, COL_PLACE = 8;

// Splits a markdown table row on "|" that is not escaped as "\|"; cells keep their escapes.
const cells = (line) => line.split(/(?<!\\)\|/).map((c) => c.trim());

function readReports(dir) {
  const found = new Map(); // id -> { result, place, file }
  const dupes = [];
  for (const area of AREAS) {
    const file = join(dir, "reports", `parity-${area}.md`);
    let text;
    try { text = readFileSync(file, "utf8"); } catch (e) { throw new Error(`không đọc được ${file}: ${e.message}`); }
    for (const line of text.split("\n")) {
      if (!ROW.test(line)) continue;
      const c = cells(line).slice(1, -1);
      if (c.length < 3) throw new Error(`${file}: dòng thiếu cột: ${line.slice(0, 80)}`);
      const [id, result] = c;
      if (!/^(có|không)(?![\p{L}])/u.test(result)) throw new Error(`${file}: ${id} có kết quả lạ "${result}"`);
      const place = c.length >= 4 ? c[2] : "";
      if (found.has(id)) dupes.push(id);
      else found.set(id, { result: result.startsWith("có") ? "có" : "không", place, file });
    }
  }
  return { found, dupes };
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error("cách dùng: node ui/scripts/fill-parity.mjs <thư mục plan>"); process.exit(2); }
  const listFile = join(dir, "parity-checklist.md");
  const { found, dupes } = readReports(dir);
  const lines = readFileSync(listFile, "utf8").split("\n");
  const missing = [];
  const counts = { có: 0, không: 0 };
  const out = lines.map((line) => {
    if (!ROW.test(line)) return line;
    const c = cells(line);
    if (c.length !== 11) throw new Error(`${listFile}: dòng không đủ 9 cột: ${line.slice(0, 80)}`);
    const id = c[1];
    const r = found.get(id);
    if (!r) { missing.push(id); return line; }
    found.delete(id);
    counts[r.result]++;
    c[COL_NEW] = r.result;
    if (r.place) c[COL_PLACE] = r.place;
    return `| ${c.slice(1, -1).join(" | ")} |`;
  });
  for (const id of missing) console.log(`THIẾU ${id}`);
  for (const id of dupes) console.log(`TRÙNG ${id}`);
  // An ID in a report but not in the checklist is a typo in the report: worth a line, not a fail.
  for (const [id, r] of found) console.log(`LẠ ${id} (${r.file})`);
  if (missing.length || dupes.length) process.exit(1);
  writeFileSync(listFile, out.join("\n"));
  const total = counts.có + counts.không;
  console.log(`có ${counts.có}/${total}, không ${counts.không}`);
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }
