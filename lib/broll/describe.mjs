// lib/broll/describe.mjs — captions and tags for shots, read from contact sheets by the vision
// agent of the registry (lib/agents describeImages). One call carries at most 4 sheets (≤ 12
// shots of 3 frames, more when shots are short). The prompt names cells only by sheet and cell
// number; the table that maps a cell back to (clip, shot) stays here, and describeImages copies
// the sheets into a fresh temp folder, so the CLI never sees a real path.
// A wrong answer (no items, or none valid) is asked once more of the next vision agent in
// agents.order.vision; still wrong, the shots of that call get describe_error. Shots missing from
// an otherwise good answer get describe_error too. Every CLI run counts as one call.
// How to describe a clip for an agent learnt from KyaniteLabs/kinocut
// (https://github.com/KyaniteLabs/kinocut, Apache-2.0; ideas only, no code copied).
import { readFileSync } from "node:fs";
import { describeImages, listAgents, orderOf, pick } from "../agents/index.mjs";

export const VERSION = 1;
export const SHEETS_PER_CALL = 4;
export const SCHEMA = JSON.parse(readFileSync(new URL("./describe-schema.json", import.meta.url), "utf8"));
const ITEM = SCHEMA.properties.items.items;
const ENUMS = Object.fromEntries(Object.entries(ITEM.properties).filter(([, v]) => v.enum).map(([k, v]) => [k, v.enum]));

const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v, n = 12) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 60)).filter(Boolean))].slice(0, n) : []);

// A cleaned item, or null when it misses the required fields (pure).
export function cleanItem(x) {
  if (!x || typeof x !== "object") return null;
  const sheet = Number(x.sheet), cell = Number(x.cell);
  if (!Number.isInteger(sheet) || !Number.isInteger(cell) || cell < 1 || cell > 9) return null;
  const caption_vi = str(x.caption_vi);
  if (!caption_vi || !Array.isArray(x.tags)) return null;
  const out = { sheet, cell, caption_vi, tags: strs(x.tags), subjects: strs(x.subjects), place: str(x.place, 120), text_on_screen: str(x.text_on_screen, 200) };
  for (const [k, list] of Object.entries(ENUMS)) out[k] = list.includes(x[k]) ? x[k] : null;
  return out;
}

// The prompt for a batch of sheets (pure). sheets: [{ groups: [{ id, first, last }] }].
export function buildPrompt(sheets) {
  const lines = [];
  sheets.forEach((s, n) => {
    for (const g of s.groups) {
      const cells = g.first === g.last ? `ô ${g.first}` : `ô ${g.first}–${g.last}`;
      lines.push(`- Ảnh ${n + 1}, ${cells}: một cảnh${g.first === g.last ? " (1 khung)" : ` (${g.last - g.first + 1} khung của cùng một cảnh)`}`);
    }
  });
  return [
    `Bạn xem ${sheets.length} ảnh contact sheet của footage. Mỗi ảnh là lưới 3×3, ô đánh số 1–9 ở góc trên trái (hàng trên 1–3, giữa 4–6, dưới 7–9). Ô đen là ô trống.`,
    "Các cảnh trong lưới:",
    ...lines,
    "Các cảnh khác nhau không liên quan với nhau; đừng suy ra trình tự hay câu chuyện giữa chúng.",
    "Với MỖI cảnh trả đúng một mục: sheet = số thứ tự ảnh, cell = số ô ĐẦU TIÊN của cảnh.",
    "caption_vi: một câu tiếng Việt có dấu, tả cái thấy được (chủ thể, hành động, bối cảnh). tags: 3–8 từ khoá tiếng Việt viết thường.",
    "shot_type, camera, time_of_day, quality chọn trong danh sách của schema; subjects là các chủ thể chính; place là nơi chốn; text_on_screen là chữ thấy trên hình (rỗng nếu không có).",
  ].join("\n");
}

// Maps an answer back to group ids (pure). Returns { found: Map(id → item), valid }.
export function mapAnswer(json, sheets) {
  const found = new Map();
  const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : null;
  if (!items) return { found, valid: 0 };
  let valid = 0;
  for (const raw of items) {
    const it = cleanItem(raw);
    if (!it) continue;
    const s = sheets[it.sheet - 1];
    const g = s?.groups.find((x) => it.cell >= x.first && it.cell <= x.last);
    if (!g) continue;
    valid++;
    if (!found.has(g.id)) { const { sheet, cell, ...rest } = it; found.set(g.id, rest); }
  }
  return { found, valid };
}

// Runs of a describeImages result (each tried agent that ran, plus the one that answered).
export const runsOf = (r) => (r.tried ?? []).filter((t) => !/không có lệnh/.test(t.error ?? "")).length + (r.ok ? 1 : 0);

// Describes one batch: files are the sheet JPEGs, sheets their groups. budget: calls still
// allowed (≥ 1). Returns { calls, agent, found: Map, errors: [id], quota, error }.
export async function describeBatch(files, sheets, { budget = Infinity, env = process.env, describeFn = describeImages, agentsFn = listAgents } = {}) {
  const prompt = buildPrompt(sheets);
  const ids = sheets.flatMap((s) => s.groups.map((g) => g.id));
  let calls = 0;
  const first = await describeFn({ images: files, prompt, schema: SCHEMA, env });
  calls += runsOf(first);
  const quota = !first.ok && (first.tried ?? []).some((t) => t.quota);
  if (!first.ok) return { calls, agent: first.agent ?? null, found: new Map(), errors: ids, quota, error: first.error };
  let ans = mapAnswer(first.json, sheets), agent = first.agent;
  if (!ans.valid && calls < budget) {
    const scan = await agentsFn({ env });
    const order = pick("vision", scan.agents, orderOf(env).vision).map((a) => a.id);
    const next = order[order.indexOf(first.agent) + 1] ?? null;
    if (next) {
      const again = await describeFn({ images: files, prompt, schema: SCHEMA, env, agent: next });
      calls += runsOf(again);
      if (again.ok) { const b = mapAnswer(again.json, sheets); if (b.valid) { ans = b; agent = again.agent; } }
    }
  }
  if (!ans.valid) return { calls, agent, found: new Map(), errors: ids, quota: false, error: "câu trả lời sai schema" };
  return { calls, agent, found: ans.found, errors: ids.filter((id) => !ans.found.has(id)), quota: false, error: null };
}
