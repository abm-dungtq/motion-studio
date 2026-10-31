// routes/suggest.mjs — the suggestion card of the Director tab (lib/suggest.mjs does the ranking).
//   GET  /api/suggest?name=                 the stored record, the pitch rows, the source in use,
//        the provider's modes and whether it can save a mode or build a pitch
//   POST /api/suggest { name, refresh? }    ranks (or reuses the cached record), 409 without BRIEF.md;
//        with the provider's case command, also suggests reference cases (CASES.md) when the project
//        has none yet or refresh is set: `cases` in the answer, `cases_error` when the command failed
//   The case suggestion runs too before the pitch is built from a click (the provider's pitch
//   command refuses a new brief whose user has not seen the cases).
//   POST /api/suggest/choose { name, direction, style?, mode? }   the user's click, one of three outcomes:
//        chosen        the direction is a row of pitch/PICK.json: the provider's choose command runs
//                      with --pick and the style arguments; a waiting direction card is answered
//                      instead when there is one, so choose runs once and the request closes
//        not_in_pitch  the pitch has no such direction: its rows come back for the card
//        queued        no pitch yet: a director request carries the user's preference (or, when the
//                      provider declares pitchInit, the pitch is built from it and the outcome is chosen)
// BRIEF.md is only written by the provider's choose command, never here. The operating mode is
// written through the gateway with actor "human" when the provider has the op; otherwise it goes in
// the request text and mode.saved is false. The mode is written only once the outcome is known
// (chosen or queued), never for not_in_pitch or a failed command. Every 200 of choose, whatever the
// outcome, appends a line to the pick log (<project>/.opus/suggest/picks.jsonl) with the direction
// the user clicked and the card's column order, when a suggestion was stored for the project.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendPick, columnsOf, effectiveSource, frontmatterOf, pickEntry, readRecord, suggestCached } from "../lib/suggest.mjs";
import { runFile } from "../create.mjs";
import { suggestSetting } from "../lib/config.mjs";
import { answerCard, writeDirection } from "../gates.mjs";
import { queueRequest, startIdle } from "../director.mjs";
import { readCases, runCases } from "../lib/cases-suggest.mjs";

const DIRECTION = /^[A-Z][0-9]{1,2}$/;
const STYLE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const PITCH_INIT_TIMEOUT_MS = 120000;

const err = (status, msg) => Object.assign(new Error(msg), { status });
const tail = (r) => String(r.stderr || r.stdout || "").trimEnd().split("\n").slice(-20).join("\n");

function dirOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw err(pd.status, pd.error);
  return pd.dir;
}

function view(P, dir) {
  const setting = suggestSetting();
  const record = readRecord(dir);
  return {
    record,
    columns: columnsOf(record),
    picks: P.suggest?.readPicks?.(dir) ?? null,
    source: effectiveSource(setting),
    source_setting: setting,
    modes: Object.entries(P.suggest?.modes ?? {}).map(([id, m]) => ({ id, label: m.label })),
    can_save_mode: Boolean(P.suggest?.canSetWorkflowMode),
    can_init_pitch: Boolean(P.suggest?.pitchInit),
    cases: readCases(dir, P),
    can_suggest_cases: Boolean(P.suggest?.cases),
  };
}

// Runs the case suggestion when the provider has it and the project has none (or refresh).
// Returns an error text for the card, or null.
async function ensureCases(P, dir, refresh = false) {
  if (!P.suggest?.cases || (!refresh && readCases(dir, P))) return null;
  const r = await runCases(dir, P);
  console.log(`${new Date().toISOString()} suggest-cases ${dir} ${r.ok ? "ok" : `exit ${r.code}`}`);
  return r.ok ? null : `Chưa gợi ý được case mẫu (exit ${r.code ?? "?"}): ${r.stderr || "không có thông báo lỗi"}`;
}

const NOT_SAVED = { saved: false, reason: null };

function saveMode(P, dir, mode) {
  if (!mode) return NOT_SAVED;
  if (!P.suggest?.canSetWorkflowMode) return { saved: false, reason: "Chế độ vận hành chưa lưu vào project.json vì provider chưa có lệnh ghi trường này. Đạo diễn vẫn nhận chế độ trong lời yêu cầu." };
  if (!existsSync(join(dir, "project.json"))) return { saved: false, reason: "Dự án chưa có project.json nên chưa lưu được chế độ vận hành." };
  try {
    const r = P.gateway.patch(dir, { actor: "human", base: P.manifest.load(dir).version, ops: [P.suggest.workflowModeOp(mode)], lockWaitMs: 300 });
    return r?.code ? { saved: false, reason: r.error } : { saved: true, reason: null };
  } catch (e) {
    return { saved: false, reason: e.message };
  }
}

// The pitchInit argv with the BRIEF fields filled in, or null when the declaration is malformed.
function pitchInitArgv(init, vars) {
  if (!init || typeof init.file !== "string" || !Array.isArray(init.args)) return null;
  return [init.file, ...init.args.map((a) => String(a).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)))];
}

// Appends the user's choice to the pick log; a failure there never changes the answer.
function logPick(dir, project, b, outcome) {
  try {
    const record = readRecord(dir);
    if (!record) return;
    appendPick(dir, pickEntry({ record, project, chosen: { direction: b.direction, style: b.style ?? null, mode: b.mode ?? null }, outcome }));
  } catch (e) {
    console.error(`motion-studio: không ghi được log lựa chọn của ${project}: ${e.message}`);
  }
}

async function choose(c) {
  const b = c.body ?? {};
  const P = c.P;
  if (typeof b.direction !== "string" || !DIRECTION.test(b.direction)) throw err(400, "Hướng không hợp lệ.");
  if (b.style !== undefined && b.style !== null && (typeof b.style !== "string" || !STYLE.test(b.style))) throw err(400, "Style không hợp lệ.");
  if (b.mode !== undefined && b.mode !== null && (typeof b.mode !== "string" || !Object.hasOwn(P.suggest?.modes ?? {}, b.mode))) throw err(400, "Chế độ vận hành không hợp lệ.");
  if (b.style === null) delete b.style;
  if (b.mode === null) delete b.mode;

  let initialized = false;
  const dir = dirOf(c, b.name);
  let picks = P.suggest.readPicks(dir);
  // Called once the outcome is known: the mode is saved only for a direction that was chosen or
  // handed to the director, and every outcome is logged. Where the director runs next (a queued
  // request, an answered card), the mode is saved before it starts, so it reads the saved mode.
  const done = (outcome, body, mode = outcome === "not_in_pitch" ? NOT_SAVED : saveMode(P, dir, b.mode)) => {
    logPick(dir, b.name, b, outcome);
    console.log(`${new Date().toISOString()} suggest-choose ${b.name} ${b.direction} ${outcome}`);
    return { outcome, ...body, mode };
  };

  if (picks === null && P.suggest.pitchInit) {
    await ensureCases(P, dir);
    let fm = {};
    try { fm = frontmatterOf(readFileSync(join(dir, "BRIEF.md"), "utf8")); } catch { /* no brief: no topic */ }
    const rec = readRecord(dir);
    const side = rec ? (rec.shown === "jev" ? rec.jev : rec.det) : null;
    const ids = [b.direction, ...(side?.directions ?? []).map((x) => x.id).filter((id) => id !== b.direction)].slice(0, 3);
    const argv = fm.topic ? pitchInitArgv(P.suggest.pitchInit, {
      project: dir, topic: fm.topic, aspect: fm.aspect || "16:9", category: fm.category || "", energy: fm.energy || "", directions: ids.join(","),
    }) : null;
    if (argv) {
      const r = await runFile(process.execPath, argv, { cwd: dir, timeout: PITCH_INIT_TIMEOUT_MS });
      if (r.code !== 0) return c.send(422, { error: `Lệnh tạo pitch lỗi (exit ${r.code})`, stderr: tail(r) });
      picks = P.suggest.readPicks(dir);
      if (picks === null) return c.send(422, { error: "Lệnh tạo pitch chạy xong nhưng không ghi pitch/PICK.json.", stderr: tail(r) });
      initialized = true;
    }
  }

  if (picks === null) {
    if (!existsSync(join(dir, "project.json"))) throw err(409, "Dự án chưa có project.json nên chưa giao việc cho đạo diễn được. Nhập dự án vào Studio trước.");
    const text = `Tạo pitch cho dự án này, rồi hỏi thẻ chọn hướng như thường lệ. Người dùng nghiêng về hướng ${b.direction}${b.style ? ` với style ${b.style}` : ""}${b.mode ? `, chế độ vận hành ${b.mode}` : ""}, chọn từ thẻ gợi ý. Không tự chọn thay người dùng.`;
    const mode = saveMode(P, dir, b.mode);
    return done("queued", queueRequest(P, b.name, dir, { scope: "project", text }), mode);
  }

  const row = picks.find((r) => r.id === b.direction);
  if (!row) return done("not_in_pitch", { picks });

  const extra = b.style ? P.suggest.styleArgs.map((a) => a.replaceAll("{style}", b.style)) : [];
  const waiting = (P.requests.list(dir) ?? []).find((r) => r.status === "waiting_user" && r.ask?.gate === "direction" && r.ask?.kind === "choice"
    && (r.ask.options ?? []).some((o) => o.id === String(row.n)));
  const requested = b.style ?? row.style_profile;
  // The plugin's choose has the last word on style_profile: a --style-profile argument wins over the
  // brief's lemo_style, which keeps its own style only when no style is sent. So report what BRIEF.md
  // says after the write, and the requested style when it differs.
  const result = (rest, mode) => {
    let written = null;
    try { written = frontmatterOf(readFileSync(join(dir, "BRIEF.md"), "utf8")).style_profile || null; } catch { /* no brief */ }
    const style = written ?? requested;
    return done("chosen", { direction: b.direction, pick: row.n, style, ...(requested && style !== requested ? { requested_style: requested } : {}), ...rest }, mode);
  };

  if (waiting) {
    const r = await answerCard(dir, { id: waiting.id, value: String(row.n) }, { extra });
    if (r.status !== 200) return c.send(r.status, r.body);
    const mode = saveMode(P, dir, b.mode);
    startIdle(P, b.name, dir);
    return result({ answered: waiting.id, next: r.body.next, initialized }, mode);
  }
  const r = await writeDirection(dir, row.n, { extra });
  if (r.code !== 0) return c.send(422, { error: `Lệnh chọn hướng lỗi (exit ${r.code})`, stderr: tail(r) });
  return result({ answered: null, next: null, initialized });
}

export const ROUTES = [
  {
    method: "GET", path: "/api/suggest",
    handler: (c) => view(c.P, dirOf(c, c.q("name"))),
  },
  {
    method: "POST", path: "/api/suggest",
    async handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      if (!existsSync(join(dir, "BRIEF.md"))) throw err(409, "Dự án chưa có BRIEF.md nên chưa gợi ý được.");
      const [rec, casesError] = await Promise.all([
        suggestCached({ dir, project: b.name, P: c.P, refresh: b.refresh === true, source: effectiveSource(suggestSetting()) }),
        ensureCases(c.P, dir, b.refresh === true),
      ]);
      console.log(`${new Date().toISOString()} suggest ${b.name} ${rec.source} ${rec.shown} ${rec.error?.code ?? "ok"} ${rec.ms}ms ${rec.questions}q`);
      return { ...view(c.P, dir), ...(casesError ? { cases_error: casesError } : {}) };
    },
  },
  {
    method: "POST", path: "/api/suggest/choose",
    handler: choose,
  },
];
