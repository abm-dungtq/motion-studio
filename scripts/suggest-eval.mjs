#!/usr/bin/env node
// scripts/suggest-eval.mjs — measure the direction suggestions of lib/suggest.mjs.
//
// Usage:
//   node scripts/suggest-eval.mjs [--root <dir>] [--sample <n>] [--seed <n>] [--out <file>] [--no-jev]
//     Measures on labelled briefs. For reference only: it decides nothing and never changes
//     DEFAULT_SOURCE.
//   node scripts/suggest-eval.mjs --picks [--root <dir>] [--min <n>] [--out <file>]
//     Measures on the choices users really made on the suggestion card
//     (<root>/*/.opus/suggest/picks.jsonl). This mode gives the decision.
//
// Labelled sets and their known bias:
//   gold_cases      the cases each direction lists in its own `cases` field; label = every
//                   direction listing the case.
//   gold_projects   projects under --root whose BRIEF.md has `direction: A1..A8`. They chose from
//                   the three deterministic pitches, so the deterministic side almost surely hits
//                   @3 on them.
//   proxy_category  library cases sampled per `category`; label = directions whose `categories`
//                   hold it. Leans toward the deterministic side, which scores a category match.
//   proxy_genre     library cases sampled per `genre`; label = GENRE_MAP[genre]. The genre was
//                   tagged by Jev itself, so it leans toward Jev.
// With 14 gold items one item is 7.1 points: when the deterministic side hits 13 or 14 of them,
// Jev cannot lead by 10 points (`reachable` says so).
//
// The pick log: one turn is a (project, state hash) pair whose line has a Jev ranking; several
// clicks on one brief keep the latest line only, lines without Jev are left out (no comparison on
// the same brief). A side hits @k when the chosen direction is in its first k directions. With at
// least --min turns (default 30) Jev becomes the default when it leads the deterministic side by
// at least 10 points of hit@3, else the deterministic side does; fewer turns print `wait`. Styles
// are reported but do not decide. Users may lean toward the column they read first: the report
// counts where each chosen direction came from (`from`).
//
// Exit codes: 0 done (including `decision: wait`), 2 bad arguments, 3 Jev unusable in the labelled
// mode without --no-jev (no key, or more than 20% of the Jev calls failed). --picks never calls
// Jev and needs no key.
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readKey } from "../lib/jev.mjs";
import { loadProvider } from "../lib/provider.mjs";
import { detDirections, frontmatterOf, jevDirections, loadCandidates, readPickLog, suggest } from "../lib/suggest.mjs";

export const MIN_PICKS = 30;
export const ASPECT_OF = { vertical: "9:16", horizontal: "16:9", multiple: "both" };
// Genres of the case features mapped to the directions that tell such a video; genres left out
// (generative_art, game_interactive, footage_edit_recap, talking_head_podcast, other) are not used.
export const GENRE_MAP = {
  software_launch_demo: ["A2", "A1", "A4"], app_tutorial_walkthrough: ["A4", "A2"],
  product_promo_ad: ["A1", "A3"], brand_motion_intro: ["A1", "A3"], kinetic_typography: ["A3"], music_video: ["A3"],
  data_infographic: ["A6", "A8"], educational_explainer: ["A6", "A7", "A8"], news_recap: ["A7"], story_animation: ["A7"],
  scene_3d: ["A5"],
};

const DEFAULT_ROOT = "/Volumes/2/Edit-Video";
const THRESHOLD = 10;
const MAX_JEV_FAIL = 0.2;
const POOL = 4;
const USD_PER_M_INPUT = 0.042;

const round1 = (x) => Math.round(x * 10) / 10;
const pct = (hits, n) => (n > 0 ? round1((hits / n) * 100) : null);
const fmtPct = (x) => (x === null || x === undefined ? "n/a" : `${x}%`);
const words = (s, n) => String(s ?? "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

export const hitAt = (ranked, labels, k) => (ranked ?? []).slice(0, k).some((id) => (labels ?? []).includes(id));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Up to perGroup rows of each group, shuffled with one PRNG seeded by `seed`; groups in name order.
export function sampleBy(rows, keyFn, perGroup, seed) {
  const groups = new Map();
  for (const r of rows) {
    const k = String(keyFn(r));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const rand = mulberry32(seed);
  const out = [];
  for (const k of [...groups.keys()].sort()) {
    const g = [...groups.get(k)];
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    out.push(...g.slice(0, perGroup));
  }
  return out;
}

export function gateOf({ n, detHits, jevHits, min = THRESHOLD }) {
  if (!(n > 0)) return { diff_points: null, reachable: false, pass: false };
  const diff_points = round1(((jevHits - detHits) / n) * 100);
  return { diff_points, reachable: ((n - detHits) / n) * 100 >= min, pass: diff_points >= min };
}

const ids = (side, key) => (Array.isArray(side?.[key]) ? side[key] : []);

function sideHits(turns, key, pickOf) {
  const out = {};
  for (const s of ["det", "jev"]) {
    const h1 = turns.filter((t) => hitAt(ids(t[s], key), [pickOf(t)], 1)).length;
    const h3 = turns.filter((t) => hitAt(ids(t[s], key), [pickOf(t)], 3)).length;
    out[s] = { hit1: pct(h1, turns.length), hit3: pct(h3, turns.length), hits3: h3 };
  }
  return out;
}

export function pickStats(entries, { min = MIN_PICKS } = {}) {
  const latest = new Map();
  for (const e of entries ?? []) {
    if (!e || !e.jev) continue;
    const k = `${e.project}\u0000${e.hash}`;
    const seen = latest.get(k);
    if (!seen || String(e.at ?? "") > String(seen.at ?? "")) latest.set(k, e);
  }
  const turns = [...latest.values()];
  const n = turns.length;
  const dir = sideHits(turns, "directions", (t) => t.chosen?.direction);
  const styled = turns.filter((t) => t.chosen?.style);
  const sty = sideHits(styled, "styles", (t) => t.chosen.style);
  const from = { jev: 0, det: 0, both: 0, none: 0 };
  for (const t of turns) from[Object.hasOwn(from, t.direction_from) ? t.direction_from : "none"]++;
  const gate = gateOf({ n, detHits: dir.det.hits3, jevHits: dir.jev.hits3 });
  const strip = ({ hit1, hit3 }) => ({ hit1, hit3 });
  return {
    n, min,
    det: strip(dir.det), jev: strip(dir.jev),
    styles: { n: styled.length, det: strip(sty.det), jev: strip(sty.jev) },
    from, gate,
    decision: n < min ? "wait" : gate.pass ? "jev" : "deterministic",
  };
}

// ---- arguments ---------------------------------------------------------------------------------

const FLAGS = new Set(["--picks", "--no-jev"]);
const VALUES = new Set(["--root", "--sample", "--seed", "--out", "--min"]);

function parseArgs(argv) {
  const a = { root: DEFAULT_ROOT, sample: 15, seed: 1, out: null, min: MIN_PICKS, picks: false, noJev: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (FLAGS.has(f)) { if (f === "--picks") a.picks = true; else a.noJev = true; continue; }
    if (!VALUES.has(f)) throw new Error(`không hiểu đối số ${f}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${f} cần một giá trị`);
    if (f === "--root") a.root = resolve(v);
    else if (f === "--out") a.out = resolve(v);
    else {
      const num = Number(v);
      if (!Number.isInteger(num) || num < (f === "--seed" ? 0 : 1)) throw new Error(`${f} cần một số nguyên${f === "--seed" ? " không âm" : " dương"}`);
      a[f.slice(2)] = num;
    }
  }
  return a;
}

const subdirs = (root) => {
  try {
    return readdirSync(root).filter((e) => !e.startsWith(".")).sort().map((e) => join(root, e))
      .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });
  } catch { return []; }
};

function writeOut(file, data) {
  if (file) writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
}

// ---- --picks -----------------------------------------------------------------------------------

function runPicks(a, log) {
  const entries = subdirs(a.root).flatMap((d) => readPickLog(d));
  const r = pickStats(entries, { min: a.min });
  const line = (s) => `tất định hit@1=${fmtPct(s.det.hit1)} hit@3=${fmtPct(s.det.hit3)} · Jev hit@1=${fmtPct(s.jev.hit1)} hit@3=${fmtPct(s.jev.hit3)}`;
  log(`picks n=${r.n}/${r.min} ${line(r)}`);
  log(`picks style n=${r.styles.n} ${line(r.styles)}`);
  log(`picks from jev=${r.from.jev} det=${r.from.det} both=${r.from.both} none=${r.from.none}`);
  const diff = r.gate.diff_points === null ? "n/a" : r.gate.diff_points;
  log(`decision: ${r.decision} (${r.n}/${r.min} lượt; Jev − tất định = ${diff} điểm hit@3, cần ≥ ${THRESHOLD})`);
  writeOut(a.out, { at: new Date().toISOString(), root: a.root, ...r });
  return 0;
}

// ---- labelled sets -----------------------------------------------------------------------------

const jsonLines = (file) => {
  const out = [];
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return out; }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a broken line is skipped */ }
  }
  return out;
};

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function setStats(rows) {
  const n = rows.length;
  const withJev = rows.filter((r) => r.jev);
  const count = (list, side, k) => list.filter((r) => hitAt(r[side], r.labels, k)).length;
  return {
    n,
    det: { hit1: pct(count(rows, "det", 1), n), hit3: pct(count(rows, "det", 3), n) },
    jev: { n: withJev.length, hit1: pct(count(withJev, "jev", 1), withJev.length), hit3: pct(count(withJev, "jev", 3), withJev.length) },
    hits3: { det: count(rows, "det", 3), jev: count(withJev, "jev", 3) },
  };
}

const BIAS = {
  gold_projects: "lệch về tất định: dự án chọn từ ba pitch tất định",
  proxy_category: "proxy, lệch về tất định: tất định cộng điểm khi khớp category",
  proxy_genre: "proxy, lệch về Jev: genre do Jev gắn",
};

async function runLabelled(a, log) {
  const P = await loadProvider();
  const candidates = loadCandidates(P);
  const cases = jsonLines(P.library?.casesFile);
  const features = new Map(jsonLines(P.library?.caseFeaturesFile).map((f) => [f.id, f]));
  let key = "";
  if (!a.noJev) {
    key = readKey({ keyVar: P.jev?.keyVar, envFile: P.jev?.envFile });
    if (!key) { log("jev: chưa có khoá"); return 3; }
  }

  // Every Jev request goes through this counter (retries included).
  let requests = 0;
  const fetchImpl = (...args) => { requests++; return globalThis.fetch(...args); };

  const labelsOf = new Map();
  for (const d of candidates) for (const id of d.cases ?? []) labelsOf.set(id, [...(labelsOf.get(id) ?? []), d.id]);
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const goldCases = [...labelsOf.keys()].filter((id) => byCase.has(id)).sort().map((id) => ({ c: byCase.get(id), labels: labelsOf.get(id) }));

  const pool0 = cases.filter((c) => c.has_full_prompt && !c.upstream_removed && !labelsOf.has(c.id) && c.prompt);
  const proxyCategory = sampleBy(pool0.filter((c) => c.category), (c) => c.category, a.sample, a.seed)
    .map((c) => ({ c, labels: candidates.filter((d) => (d.categories ?? []).includes(c.category)).map((d) => d.id) }));
  const proxyGenre = sampleBy(pool0.filter((c) => Object.hasOwn(GENRE_MAP, features.get(c.id)?.genre ?? "")), (c) => features.get(c.id).genre, a.sample, a.seed)
    .map((c) => ({ c, labels: GENRE_MAP[features.get(c.id).genre] }));

  const goldProjects = subdirs(a.root).map((dir) => {
    let text = "";
    try { text = readFileSync(join(dir, "BRIEF.md"), "utf8"); } catch { return null; }
    const fm = frontmatterOf(text);
    return /^A[1-8]$/.test(fm.direction ?? "") ? { dir, fm, labels: [fm.direction] } : null;
  }).filter(Boolean);

  let questions = 0, inputTokens = 0, jevFails = 0;
  const account = (usage, q) => {
    questions += q ?? 0;
    if (usage && Number.isFinite(usage.input_tokens)) inputTokens += usage.input_tokens;
  };

  const caseRow = async ({ c, labels }) => {
    const prompt = String(c.prompt ?? "");
    const fm = { category: c.category, aspect: ASPECT_OF[features.get(c.id)?.aspect] ?? "16:9", topic: `${c.title ?? ""} ${words(prompt, 60)}`.trim() };
    const state = { brief: { category: c.category, title: c.title }, script_head: words(prompt, 300) };
    const det = (await detDirections({ fm, topic: fm.topic, P })).map((x) => x.id);
    let jev = null;
    if (!a.noJev) {
      const r = await jevDirections({ state, fm, candidates, key, fetchImpl });
      account(r.usage, r.questions);
      if (r.ok) jev = r.items.map((x) => x.d.id); else jevFails++;
    }
    return { id: c.id, labels, det, jev };
  };

  const styleRows = [];
  const unreachable = [];
  const offered = new Set(candidates.flatMap((d) => d.styles_goi_y ?? []));
  const projectRow = async ({ dir, fm, labels }) => {
    const project = dir.split("/").pop();
    const rec = await suggest({ dir, project, P, source: a.noJev ? "deterministic" : "observe", fetchImpl });
    account(rec.usage, rec.questions);
    const det = rec.det.directions.map((x) => x.id);
    const jev = rec.jev?.directions.map((x) => x.id) ?? null;
    if (!a.noJev && !jev) jevFails++;
    const style = fm.style_profile;
    if (style) {
      if (!offered.has(style)) unreachable.push(style);
      else styleRows.push({ id: project, labels: [style], det: rec.det.styles.map((x) => x.id), jev: rec.jev?.styles.map((x) => x.id) ?? null });
    }
    return { id: project, labels, det, jev };
  };

  const [rowsGoldCases, rowsCategory, rowsGenre, rowsProjects] = [
    await pool(goldCases, POOL, caseRow),
    await pool(proxyCategory, POOL, caseRow),
    await pool(proxyGenre, POOL, caseRow),
    await pool(goldProjects, POOL, projectRow),
  ];
  const gold = [...rowsGoldCases, ...rowsProjects];
  const raw = { gold, gold_cases: rowsGoldCases, gold_projects: rowsProjects, proxy_category: rowsCategory, proxy_genre: rowsGenre };
  const sets = {};
  for (const [name, rows] of Object.entries(raw)) {
    const { hits3, ...s } = setStats(rows);
    sets[name] = { ...s, ...(BIAS[name] ? { bias: BIAS[name] } : {}), items: rows.map(({ id, labels, det, jev }) => ({ id, labels, det: det.slice(0, 3), jev: jev?.slice(0, 3) ?? null })) };
    sets[name]._hits3 = hits3;
  }
  const st = setStats(styleRows);
  const styles = { n: st.n, unreachable: [...new Set(unreachable)].sort(), det: st.det, jev: a.noJev ? { n: 0, hit1: null, hit3: null } : st.jev };

  const g = gateOf({ n: sets.gold.n, detHits: sets.gold._hits3.det, jevHits: sets.gold._hits3.jev });
  const detOnly = gateOf({ n: sets.gold.n, detHits: sets.gold._hits3.det, jevHits: sets.gold._hits3.det });
  const baseline = a.noJev
    ? { set: "gold", n: sets.gold.n, det_hit3: sets.gold.det.hit3, jev_hit3: null, diff_points: null, reachable: detOnly.reachable, pass: null }
    : { set: "gold", n: sets.gold.n, det_hit3: sets.gold.det.hit3, jev_hit3: sets.gold.jev.hit3, diff_points: g.diff_points, reachable: g.reachable, pass: g.pass };
  for (const s of Object.values(sets)) delete s._hits3;

  const total = Object.entries(raw).filter(([k]) => k !== "gold").reduce((n, [, rows]) => n + rows.length, 0);
  const cost = { requests, questions, input_tokens: inputTokens, usd: Math.round((inputTokens / 1e6) * USD_PER_M_INPUT * 1e6) / 1e6, jev_failed: jevFails, items: total };

  for (const [name, s] of Object.entries(sets)) {
    const jevPart = a.noJev ? "Jev không đo" : `Jev hit@1=${fmtPct(s.jev.hit1)} hit@3=${fmtPct(s.jev.hit3)}${s.jev.n < s.n ? ` (Jev trả lời ${s.jev.n}/${s.n})` : ""}`;
    log(`${name} n=${s.n} tất định hit@1=${fmtPct(s.det.hit1)} hit@3=${fmtPct(s.det.hit3)} · ${jevPart}${s.bias ? ` [${s.bias}]` : ""}`);
  }
  log(`styles n=${styles.n} không chạm tới: ${styles.unreachable.length ? styles.unreachable.join(", ") : "(không có)"} · tất định hit@1=${fmtPct(styles.det.hit1)} hit@3=${fmtPct(styles.det.hit3)} · Jev hit@1=${fmtPct(styles.jev.hit1)} hit@3=${fmtPct(styles.jev.hit3)}`);
  log(`cost requests=${cost.requests} questions=${cost.questions} input_tokens=${cost.input_tokens} usd=${cost.usd} jev_failed=${cost.jev_failed}/${cost.items}`);
  if (a.noJev) log("baseline: n/a (không gọi Jev)");
  else log(`baseline: ${baseline.pass ? "pass" : "fail"} (tham khảo, không quyết định: Jev − tất định = ${baseline.diff_points ?? "n/a"} điểm hit@3 trên ${baseline.n} mục vàng; có thể đạt: ${baseline.reachable ? "có" : "không"})`);

  writeOut(a.out, { at: new Date().toISOString(), seed: a.seed, sample: a.sample, jev: !a.noJev, sets, styles, baseline, cost });
  if (!a.noJev && total > 0 && jevFails / total > MAX_JEV_FAIL) {
    log(`jev: ${jevFails}/${total} câu gọi lỗi, quá ${MAX_JEV_FAIL * 100}%`);
    return 3;
  }
  return 0;
}

export async function main(argv = process.argv.slice(2), log = (s) => console.log(s)) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`suggest-eval: ${e.message}`); return 2; }
  return a.picks ? runPicks(a, log) : runLabelled(a, log);
}

const SCRIPT = fileURLToPath(import.meta.url);
const isMain = () => {
  try { return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === realpathSync(SCRIPT); } catch { return false; }
};

if (isMain()) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(`suggest-eval: ${e?.stack ?? e}`); process.exitCode = 1; });
}
