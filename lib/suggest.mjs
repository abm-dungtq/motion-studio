// lib/suggest.mjs — suggestions for one project: creative directions, style profiles and a way
// of working (workflow), shared by the style_suggest tool, the /api/suggest routes and the
// measuring script. Order: filter in code first (aspect, the directions' own style lists, energy),
// then Jev scores the candidate directions, then scores the styles of the top three and picks one
// mode with a Choice, in two requests and at most MAX_QUESTIONS questions. The deterministic side
// always runs and comes from the provider's own commands (`directions pick`, `styles suggest`):
// Studio does not copy the provider's scoring. Jev failing (no key, network, timeout, HTTP error,
// bad reply) never throws: the record keeps the deterministic side and says why.
// The latest record lives in <project>/.opus/suggest/latest.json; every choice the user makes on
// the card appends a line to <project>/.opus/suggest/picks.jsonl, so the default source can be
// decided from real choices (scripts/suggest-eval.mjs --picks).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runFile } from "../create.mjs";
import { ask, readKey } from "./jev.mjs";

export const SOURCES = ["deterministic", "observe", "jev"];
// Switched to "jev" or "deterministic" once the pick log has 30 choices (scripts/suggest-eval.mjs --picks).
export const DEFAULT_SOURCE = "observe";
export const MAX_QUESTIONS = 24;

export const effectiveSource = (setting) => (SOURCES.includes(setting) ? setting : DEFAULT_SOURCE);

// ---- state -------------------------------------------------------------------------------------

export function frontmatterOf(text) {
  const m = String(text ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

// Fields that record a choice already made: left out of the state Jev reads.
const STRIP = ["direction", "direction_swaps", "style_profile", "styleframe", "creative_selection", "creative_override", "word_budget", "music_only_s", "brand", "voice_id", "tts_model", "palette", "case_search"];
const SCRIPT_WORDS = 300;

const readText = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const filesIn = (d) => { try { return readdirSync(d).filter((f) => !f.startsWith(".")).sort(); } catch { return []; } };

export function buildState(dir, P) {
  const fm = frontmatterOf(readText(join(dir, "BRIEF.md")));
  const brief = Object.fromEntries(Object.entries(fm).filter(([k]) => !STRIP.includes(k)));
  const sdir = join(dir, P?.suggest?.scriptDir ?? "script");
  const words = filesIn(sdir).filter((f) => /\.(txt|md)$/i.test(f)).map((f) => readText(join(sdir, f))).join("\n")
    .split(/\s+/).filter(Boolean).slice(0, SCRIPT_WORDS);
  const state = { brief, script_head: words.join(" ") };
  const hash = createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 12);
  return { fm, state, hash };
}

// ---- deterministic side ------------------------------------------------------------------------

export function loadCandidates(P) {
  try { return JSON.parse(readFileSync(P.library.directionsFile, "utf8")).directions ?? []; } catch { return []; }
}

async function runJson(run, file, args) {
  try {
    const r = await run(process.execPath, [file, ...args], { timeout: 15000 });
    if (r?.code !== 0) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

const aspectOf = (fm) => (["16:9", "9:16", "both"].includes(fm.aspect) ? fm.aspect : "16:9");
const energyOf = (fm) => (["em", "vua", "don-dap"].includes(fm.energy) ? fm.energy : "");
const tick = (s) => `\`${s}\``;

export async function detDirections({ fm, topic, P, run = runFile }) {
  const file = P.commands?.directions;
  if (file) {
    const args = ["pick", "--aspect", aspectOf(fm)];
    if (fm.category) args.push("--category", fm.category);
    if (energyOf(fm)) args.push("--energy", energyOf(fm));
    if (topic) args.push("--topic", topic);
    args.push("--json");
    const out = await runJson(run, file, args);
    if (Array.isArray(out) && out.length) return out.map((p) => ({ id: p.id, tier: p.tier, why: Array.isArray(p.why) ? p.why : [], ten_vi: p.ten_vi, mo_ta_vi: p.mo_ta_vi }));
  }
  return loadCandidates(P).slice(0, 3).map((d) => ({ id: d.id, tier: d.tier, why: [], ten_vi: d.ten_vi, mo_ta_vi: d.mo_ta_vi }));
}

// BRIEF fields that a direction matches, written `key: value`.
function fieldsOf(fm, d = {}, why = []) {
  const out = [];
  if (fm.category && (d.categories ?? []).includes(fm.category)) out.push(tick(`category: ${fm.category}`));
  if (fm.energy && (d.energy ?? []).includes(fm.energy)) out.push(tick(`energy: ${fm.energy}`));
  if (fm.topic && why.some((w) => String(w).startsWith("chủ đề có"))) out.push(tick(`topic: ${fm.topic}`));
  return out;
}

// The styles the given directions suggest (filtered by energy through the provider), merged by id.
async function detStyles({ fm, directionIds, P, run = runFile }) {
  const file = P.commands?.styles;
  const e = energyOf(fm);
  const byId = new Map();
  if (!file) return [];
  for (const id of directionIds) {
    let energyFit = Boolean(e);
    let list = await runJson(run, file, ["suggest", "--direction", id, ...(e ? ["--energy", e] : []), "--json"]);
    if (e && (!Array.isArray(list) || !list.length)) {
      list = await runJson(run, file, ["suggest", "--direction", id, "--json"]);
      energyFit = false;
    }
    for (const s of Array.isArray(list) ? list : []) {
      const seen = byId.get(s.id);
      if (seen) { if (!seen.directions.includes(id)) seen.directions.push(id); seen.energyFit ||= energyFit; continue; }
      byId.set(s.id, { id: s.id, ten_vi: s.ten_vi, energy: s.energy, mo_ta_vi: s.mo_ta_vi, directions: [id], energyFit });
    }
  }
  return [...byId.values()];
}

const MODE_OF_CREATE = { "tu-dau": "dao-dien", "video-co-san": "tu-nhac", "theo-nhac": "tu-nhac", "mau-nhanh": "nhanh" };

function detMode(fm, dir) {
  if (existsSync(join(dir, "project.json")) && fm.direction) return { mode: "timeline", reason: "BRIEF đã có `direction` và dự án đã có project.json." };
  if (MODE_OF_CREATE[fm.mode]) return { mode: MODE_OF_CREATE[fm.mode], reason: `Trường \`mode: ${fm.mode}\` của BRIEF.` };
  if (/nhanh/i.test(fm.creative_override ?? "")) return { mode: "nhanh", reason: "Trường `creative_override` ghi cách làm nhanh." };
  return { mode: "dao-dien", reason: "BRIEF không có `mode` hay `creative_override` chỉ cách làm khác, nên dùng cách mặc định." };
}

const hasFiles = (d, re = /./) => filesIn(d).some((f) => re.test(f));

function workflowFor(mode, fm, dir, P, source, reason) {
  const modes = P.suggest?.modes ?? {};
  const m = modes[mode] ?? { label: mode, pitch: false, steps: [] };
  let steps = [...m.steps];
  const skip = [];
  const drop = (step, why) => { if (steps.includes(step)) { steps = steps.filter((s) => s !== step); skip.push({ step, reason: why }); } };
  if (fm.direction) for (const s of ["pitch", "choose"]) drop(s, `BRIEF đã có \`direction: ${fm.direction}\`.`);
  if (steps.includes("cut") && !hasFiles(join(dir, "footage", "raw")) && !hasFiles(join(dir, "assets", "footage"))) drop("cut", "Dự án chưa có footage trong footage/raw hay assets/footage.");
  if (steps.includes("beatGrid") && !hasFiles(join(dir, "assets", "bgm"), /\.(mp3|wav|m4a)$/i)) drop("beatGrid", "Chưa có nhạc trong assets/bgm.");
  if (fm.aspect === "both" && P.commands?.reframe) {
    const at = steps.indexOf("render");
    if (at < 0) steps.push("reframe"); else steps.splice(at, 0, "reframe");
  } else {
    skip.push({ step: "reframe", reason: fm.aspect ? `\`aspect: ${fm.aspect}\` chỉ cần một khung.` : "BRIEF chưa có `aspect`, nên coi là một khung." });
  }
  return { mode, label: m.label, pitch: Boolean(m.pitch) && steps.includes("pitch"), steps, skip, reason, source };
}

// ---- Jev side ----------------------------------------------------------------------------------

const DIRECTION_FIT = [
  "The direction clashes with the brief: its look and storytelling fight the video's purpose, audience or tone.",
  "Weak fit: only a generic technique is shared; purpose, content and tone point elsewhere.",
  "Possible fit: it could carry the brief, but another kind of visual storytelling would suit the content better.",
  "Good fit: the visual storytelling suits the brief's purpose and content; a director would shortlist it.",
  "Excellent fit: the obvious way to tell this brief in pictures; content, purpose, energy and tone all point to it.",
];
const STYLE_FIT = [
  "The look clashes with the brief's subject, audience or energy.",
  "Weak: only loosely related to what the brief needs.",
  "Usable, but a different look would suit the brief better.",
  "Good: the palette, type and motion suit the brief's subject and energy.",
  "Excellent: the look a designer would pick first for this brief.",
];
const STATE_NOTE = "The state is the brief of a short video we must produce: its frontmatter fields and the start of its script (mostly Vietnamese).";

const ERRORS = {
  "no-key": () => "Chưa có khoá TypeSafe, nên đang dùng gợi ý tất định.",
  timeout: () => "Jev không trả lời kịp trong 8 giây, nên đang dùng gợi ý tất định.",
  network: () => "Không kết nối được tới Jev, nên đang dùng gợi ý tất định.",
  http: (status) => `Jev báo lỗi HTTP ${status}, nên đang dùng gợi ý tất định.`,
  malformed: () => "Jev trả về dữ liệu không đọc được, nên đang dùng gợi ý tất định.",
};
const errorOf = (r) => ({ code: r.error, message: (ERRORS[r.error] ?? ERRORS.malformed)(r.status) });

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const confOf = (a) => (isNum(a?.confidence) ? a.confidence : null);
// Highest score first, then highest confidence, then the candidates' own order.
const byScore = (a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0) || a.i - b.i;

export async function jevDirections({ state, fm, candidates, key, fetchImpl, timeoutMs }) {
  const aspect = aspectOf(fm);
  const list = candidates.filter((d) => !Array.isArray(d.aspects) || d.aspects.includes(aspect));
  const questions = Object.fromEntries(list.map((d, i) => [`d${i}`, {
    type: "score",
    instructions: {
      candidate_direction: { name: d.ten_vi, description: d.mo_ta_vi, hook: d.hook_vi, categories: d.categories, energy: d.energy, tags: d.tags },
      question: `${STATE_NOTE} \`candidate_direction\` is one creative direction: how the story is told in pictures. How well does it fit this brief?`,
    },
    criteria: DIRECTION_FIT,
  }]));
  const r = await ask({ state, questions }, { key, fetchImpl, timeoutMs });
  const sent = r.error === "no-key" ? 0 : list.length;
  if (!r.ok) return { ...r, questions: sent };
  const answers = r.data.answers;
  if (!list.every((_, i) => isNum(answers[`d${i}`]?.score))) return { ok: false, error: "malformed", ms: r.ms, questions: sent };
  const items = list.map((d, i) => ({ d, i, score: answers[`d${i}`].score, confidence: confOf(answers[`d${i}`]) }))
    .sort(byScore).map(({ d, score, confidence }) => ({ d, score, confidence }));
  return { ok: true, items, usage: r.data.usage ?? null, ms: r.ms, questions: sent };
}

async function jevStylesAndMode({ state, styles, modes, key, fetchImpl, timeoutMs }) {
  const list = styles.slice(0, MAX_QUESTIONS - 8 - 1);
  const questions = Object.fromEntries(list.map((s, i) => [`s${i}`, {
    type: "score",
    instructions: {
      candidate_style: { name: s.ten_vi, description: s.mo_ta_vi, energy_1_to_5: s.energy },
      question: `${STATE_NOTE} \`candidate_style\` is a visual style (palette, type, material, motion). How well does this look fit the brief?`,
    },
    criteria: STYLE_FIT,
  }]));
  questions.mode = {
    type: "choice",
    instructions: `${STATE_NOTE} Which way of working fits this project best?`,
    criteria: Object.fromEntries(Object.entries(modes).map(([k, v]) => [k, v.desc])),
  };
  const r = await ask({ state, questions }, { key, fetchImpl, timeoutMs });
  const sent = r.error === "no-key" ? 0 : list.length + 1;
  if (!r.ok) return { ...r, questions: sent };
  const answers = r.data.answers;
  const choice = answers.mode?.choice;
  if (!list.every((_, i) => isNum(answers[`s${i}`]?.score)) || !Object.hasOwn(modes, choice ?? "")) return { ok: false, error: "malformed", ms: r.ms, questions: sent };
  const scored = list.map((s, i) => ({ s, i, score: answers[`s${i}`].score, confidence: confOf(answers[`s${i}`]) }))
    .sort(byScore).map(({ s, score, confidence }) => ({ s, score, confidence }));
  const p = answers.mode.probabilities?.[choice];
  return { ok: true, styles: scored, mode: { id: choice, p: isNum(p) ? p : null, confidence: confOf(answers.mode) }, usage: r.data.usage ?? null, ms: r.ms, questions: sent };
}

const round2 = (x) => Math.round(x * 100) / 100;
const unsure = (c) => (isNum(c) && c < 0.5 ? ` Jev chưa chắc (độ tin ${c.toFixed(2)}).` : "");
const jevReason = (score, fields, fm) => (fields.length
  ? `Jev chấm ${score}/4. Khớp ${fields.join(", ")}.`
  : `Jev chấm ${score}/4 khi đọc ${fm.topic ? "`topic`" : "đầu kịch bản (BRIEF chưa có `topic`)"}.`);
// The BRIEF field behind a deterministic style: the energy it fits, or why energy did not filter it.
const styleEnergyNote = (fm, energyFit) => (!fm.energy
  ? "; BRIEF chưa có `energy` nên chưa lọc theo năng lượng"
  : energyFit ? `, hợp \`energy: ${fm.energy}\`` : `; không style nào của hướng này lọc được theo \`energy: ${fm.energy}\``);
const styleFields = (fm, energyFit) => (energyFit && fm.energy ? [tick(`energy: ${fm.energy}`)] : []);
const PRESENT = ["mode", "topic", "category", "aspect", "duration_s", "voice_source"];

function addUsage(...rs) {
  const us = rs.map((r) => r?.usage).filter((u) => u && typeof u === "object");
  if (!us.length) return null;
  const sum = (k) => us.reduce((n, u) => n + (isNum(u[k]) ? u[k] : 0), 0);
  return { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens") };
}

// ---- the record --------------------------------------------------------------------------------

export async function suggest({ dir, project, P, source = DEFAULT_SOURCE, fetchImpl = globalThis.fetch, run = runFile, env = process.env, now = new Date() }) {
  const t0 = Date.now();
  const { fm, state, hash } = buildState(dir, P);
  const topic = fm.topic || state.script_head.split(" ").slice(0, 60).join(" ");
  const candidates = loadCandidates(P);
  const byId = new Map(candidates.map((d) => [d.id, d]));

  const picks = await detDirections({ fm, topic, P, run });
  const detStyleList = await detStyles({ fm, directionIds: picks.map((p) => p.id), P, run });
  const mode = detMode(fm, dir);
  const det = {
    directions: picks.map((p) => {
      const fields = fieldsOf(fm, byId.get(p.id), p.why);
      const reason = fields.length
        ? `${p.why.length ? p.why.join("; ") : "Hướng tất định"} (trường ${fields.join(", ")}).`
        : `Hướng tất định cho tầng ${p.tier}; BRIEF chưa có \`category\`, \`energy\` hay \`topic\` nào khớp hướng này.`;
      return { id: p.id, label: p.ten_vi, score: null, confidence: null, fields, reason, source: "det" };
    }),
    styles: detStyleList.map((s) => ({
      id: s.id, label: s.ten_vi, score: null, confidence: null, fields: styleFields(fm, s.energyFit),
      reason: `Hướng ${s.directions.join(", ")} gợi ý style này${styleEnergyNote(fm, s.energyFit)}.`,
      source: "det", directions: s.directions,
    })),
    workflow: workflowFor(mode.mode, fm, dir, P, "det", mode.reason),
  };

  let jev = null, error = null, usage = null, questions = 0;
  if (source !== "deterministic") {
    const key = readKey({ env, keyVar: P.jev?.keyVar, envFile: P.jev?.envFile });
    const r1 = await jevDirections({ state, fm, candidates, key, fetchImpl });
    questions += r1.questions ?? 0;
    if (!r1.ok) { error = errorOf(r1); usage = addUsage(r1); } else {
      const top = r1.items.slice(0, 3);
      const styles = await detStyles({ fm, directionIds: top.map((x) => x.d.id), P, run });
      const r2 = await jevStylesAndMode({ state, styles, modes: P.suggest?.modes ?? {}, key, fetchImpl });
      questions += r2.questions ?? 0;
      usage = addUsage(r1, r2);
      if (!r2.ok) error = errorOf(r2); else {
        const present = PRESENT.filter((k) => fm[k]).map(tick);
        const p = r2.mode.p;
        const modeReason = `Jev chọn ${r2.mode.id}${p !== null ? ` (xác suất ${p.toFixed(2)})` : ""} từ các trường ${present.length ? present.join(", ") : "(không có)"} của BRIEF.`;
        jev = {
          directions: r1.items.map(({ d, score, confidence }) => {
            const s = round2(score), fields = fieldsOf(fm, d);
            return { id: d.id, label: d.ten_vi, score: s, confidence, fields, reason: jevReason(s, fields, fm) + unsure(confidence), source: "jev" };
          }),
          styles: r2.styles.map(({ s, score, confidence }) => {
            const sc = round2(score), fields = styleFields(fm, s.energyFit);
            return { id: s.id, label: s.ten_vi, score: sc, confidence, fields, reason: jevReason(sc, fields, fm) + unsure(confidence), source: "jev", directions: s.directions };
          }),
          workflow: { ...workflowFor(r2.mode.id, fm, dir, P, "jev", modeReason), p },
        };
      }
    }
  }
  const shown = jev && source !== "deterministic" ? "jev" : "det";
  return { v: 1, at: now.toISOString(), project, hash, source, shown, error, det, jev, usage, ms: Date.now() - t0, questions };
}

export const recordPath = (dir) => join(dir, ".opus", "suggest", "latest.json");

export function readRecord(dir) {
  try {
    const r = JSON.parse(readFileSync(recordPath(dir), "utf8"));
    return r && typeof r === "object" ? r : null;
  } catch { return null; }
}

export function saveRecord(dir, record) {
  const f = recordPath(dir);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(record, null, 1) + "\n");
  renameSync(tmp, f);
}

// The saved record when the brief (hash) and the source are unchanged, else a new one, saved.
export async function suggestCached(args) {
  const source = args.source ?? DEFAULT_SOURCE;
  const old = readRecord(args.dir);
  if (!args.refresh && old?.hash === buildState(args.dir, args.P).hash && old.source === source) return old;
  const rec = await suggest({ ...args, source });
  saveRecord(args.dir, rec);
  return rec;
}

// ---- the card's columns ------------------------------------------------------------------------

// The direction columns of the suggestion card, left to right, as the user sees them. While
// observing with both sources, the last hex digit of the brief hash picks the order: one brief
// always shows the same order, and over many briefs each source stands on the left about half the
// time, so a lean towards the column read first does not favour one source. Otherwise the card has
// the one column it shows.
export function columnsOf(record) {
  if (!record) return null;
  if (record.source === "observe" && record.jev) return parseInt(String(record.hash).slice(-1), 16) % 2 === 1 ? ["det", "jev"] : ["jev", "det"];
  return [record.shown === "jev" && record.jev ? "jev" : "det"];
}

// ---- the pick log ------------------------------------------------------------------------------

export const picksLogPath = (dir) => join(dir, ".opus", "suggest", "picks.jsonl");

const ranked = (side) => ({
  directions: (side.directions ?? []).slice(0, 3).map((x) => x.id),
  styles: (side.styles ?? []).slice(0, 3).map((x) => x.id),
  mode: side.workflow?.mode ?? null,
});

function fromOf(id, det, jev, key) {
  if (!id) return null;
  const d = det[key].includes(id), j = Boolean(jev?.[key].includes(id));
  return d && j ? "both" : d ? "det" : j ? "jev" : "none";
}

export function pickEntry({ record, project, chosen, outcome, now = new Date() }) {
  const det = ranked(record.det);
  const jev = record.jev ? ranked(record.jev) : null;
  const c = { direction: chosen?.direction ?? null, style: chosen?.style || null, mode: chosen?.mode || null };
  return {
    v: 1, at: now.toISOString(), project, hash: record.hash, record_at: record.at, record_source: record.source,
    jev, det, columns: columnsOf(record), chosen: c,
    direction_from: fromOf(c.direction, det, jev, "directions") ?? "none",
    style_from: fromOf(c.style, det, jev, "styles"),
    outcome,
  };
}

export function appendPick(dir, entry) {
  mkdirSync(dirname(picksLogPath(dir)), { recursive: true });
  appendFileSync(picksLogPath(dir), JSON.stringify(entry) + "\n");
}

export function readPickLog(dir) {
  let text;
  try { text = readFileSync(picksLogPath(dir), "utf8"); } catch { return []; }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e?.v === 1) out.push(e); } catch { /* a broken line is skipped */ }
  }
  return out;
}
