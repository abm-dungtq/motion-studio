// lib/series-voice.mjs — voices of a series episode: every line spoken in the locked voice of its
// speaker (the series tool cast-tts), and new cast voices (the series tool voice-design). Studio
// never calls ElevenLabs itself and never reads a key: both tools are the series' own, run through
// buildArgv (lib/series-run.mjs) with the declaration's path rules. See docs/series.md.
//
// A line is joined to its number NN (the digits ending its file name, else its id: vo-07 → 07):
//   cast-tts --role <speaker> --text-file script/NN.txt --out assets/voice/NN.mp3
//            --mix-out assets/mix/voice-NN.mp3 --visemes-out assets/voice/NN.visemes.json
// then the mix is measured (ffprobe), the gateway op set_line_audio points the line at it (its gate
// is read again from the stamp cast-tts wrote) and the provider's timing command runs once.
// Exit 4 of cast-tts is the viet-pro gate refusing the text: that line is "blocked" and is never
// tried again in the run; any other failure stops the run, so a spent credit is not spent twice.
// A run that wrote the paid voice (assets/voice/NN.mp3) and then failed (the mix chain, the
// measure, set_line_audio) leaves the line pending in Studio's ledger (lib/ledger.mjs): the next
// run of that line, while its speaker and text are unchanged and the voice file is the same,
// calls `cast-tts --out … --remix --mix-out … --visemes-out …` (no API call). A series that does
// not declare --remix for cast-tts gets the line stopped instead, never a second paid call.
// A line voiced in a run is recorded in the ledger: re-voicing one such line needs no card.
//
//   node lib/series-voice.mjs run <json>   runs runTts(json) and prints RESULT <json> last
// Voice design: `voice-design design --role <id>` writes three previews into the series'
// voices.previews folder; copyPreviews puts them in .opus/voice-design/<id>/ of the project so the
// page can play them. `voice-design save --role <id> --pick <n>` (the user's pick) locks the voice
// in the cast file.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "../media.mjs";
import { RESULT_PREFIX } from "./agents/index.mjs";
import { redact } from "./agents/redact.mjs";
import { loadProvider } from "./provider.mjs";
import { writeReceipt } from "./receipts.mjs";
import { ID, seriesPath } from "./series.mjs";
import { buildArgv } from "./series-run.mjs";
import { digestOf } from "./consent.mjs";
import { pendingRemix, recordVoiced, setPendingRemix } from "./ledger.mjs";

const SELF = fileURLToPath(import.meta.url);
export const TTS_TOOL = "cast-tts";
export const DESIGN_TOOL = "voice-design";
export const PREVIEWS = 3;
export const MAX_LINES = 200;
const TAIL = 12;
const err = (status, msg) => Object.assign(new Error(msg), { status });
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const norm = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

// "assets/mix/voice-07.mp3" → "07"; a line without a numbered file goes by its id (vo-07 → 07).
export function lineNumber(line) {
  const f = String(line?.file ?? "");
  return basename(f, extname(f)).match(/(\d+)$/)?.[1] ?? String(line?.id ?? "").match(/(\d+)$/)?.[1] ?? null;
}

// The series' roles file as [{ id, name }] (an array of roles or an { id: role } object).
export function rolesOf(series) {
  const rel = series.config.voices?.roles;
  const r = rel ? readJson(seriesPath(series, rel)) : null;
  const list = Array.isArray(r) ? r : r && typeof r === "object" ? Object.entries(r).map(([id, v]) => ({ id, ...(v ?? {}) })) : [];
  return list.filter((x) => typeof x?.id === "string" && ID.test(x.id)).map((x) => ({ id: x.id, name: typeof x.name === "string" && x.name ? x.name : x.id }));
}

// The cast file: { <role id>: { voice_id, … } }, {} when the series has none yet.
export function castOf(series) {
  const rel = series.config.voices?.cast;
  const c = rel ? readJson(seriesPath(series, rel)) : null;
  return c && typeof c === "object" && !Array.isArray(c) ? c : {};
}

// ids → the lines to voice, [{ id, nn, speaker, text }], or a 400 naming the first problem.
export function linesToVoice(m, ids, series) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_LINES) throw err(400, `ids: 1 đến ${MAX_LINES} id câu`);
  const cast = castOf(series);
  const seen = new Set();
  return ids.map((id) => {
    if (seen.has(id)) throw err(400, `câu ${id} lặp lại trong ids`);
    seen.add(id);
    const l = (m?.lines ?? []).find((x) => x.id === id);
    if (!l) throw err(400, `không có câu ${String(id)}`);
    if (!l.speaker) throw err(400, `Chọn người nói trước: câu ${id} chưa có người nói`);
    if (!cast[l.speaker]) throw err(400, `câu ${id}: giọng ${l.speaker} chưa có trong cast của series; tạo giọng trước (voice_design)`);
    const nn = lineNumber(l);
    if (!nn) throw err(400, `câu ${id}: không biết số câu (tên file hay id cần kết thúc bằng số)`);
    if (!norm(l.text)) throw err(400, `câu ${id} chưa có lời`);
    return { id, nn, speaker: l.speaker, text: l.text };
  });
}

// What a card for these lines approves: each line's id, speaker and text (ids sorted).
export const linesDigest = (lines) => digestOf([...lines].sort((a, b) => a.id.localeCompare(b.id)).map((l) => ({ id: l.id, speaker: l.speaker, text: norm(l.text) })));
const lineDigest = (line) => digestOf({ speaker: line.speaker, text: norm(line.text) });

// What a consent card for a run shows.
export const ttsEstimate = (lines) => ({ lines: lines.length, chars: lines.reduce((n, l) => n + [...norm(l.text)].length, 0) });
export const ttsTitle = (est) => `Lồng tiếng ${est.lines} câu bằng giọng cast của series, ước ${est.chars} ký tự ElevenLabs`;

export const ttsPaths = (nn) => ({ text: `script/${nn}.txt`, voice: `assets/voice/${nn}.mp3`, mix: `assets/mix/voice-${nn}.mp3`, visemes: `assets/voice/${nn}.visemes.json` });

export function ttsCommand({ series, projectDir, root, nn, speaker }) {
  const p = ttsPaths(nn);
  return buildArgv({ series, projectDir, root, tool: TTS_TOOL, flags: { "--role": speaker, "--text-file": p.text, "--out": p.voice, "--mix-out": p.mix, "--visemes-out": p.visemes } });
}
// The mix and visemes made again from the voice already there (no API call).
export function remixCommand({ series, projectDir, root, nn }) {
  const p = ttsPaths(nn);
  return buildArgv({ series, projectDir, root, tool: TTS_TOOL, flags: { "--out": p.voice, "--remix": true, "--mix-out": p.mix, "--visemes-out": p.visemes } });
}
export const canRemix = (series) => series.config.tools?.[TTS_TOOL]?.flags?.["--remix"] === "bool";
const fileSha = (f) => digestOf(readFileSync(f));

// Runs a command without a shell; resolves { code, signal, tail } (the last lines, redacted).
export function runCommand(cmd, { env = process.env, log = () => {} } = {}) {
  return new Promise((resolve) => {
    const lines = [];
    let child;
    try { child = spawn(cmd.cmd, cmd.argv, { cwd: cmd.cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { resolve({ code: 127, signal: null, tail: [redact(e.message)] }); return; }
    const timer = setTimeout(() => child.kill("SIGTERM"), cmd.timeoutMs);
    for (const s of [child.stdout, child.stderr]) {
      let buf = "";
      s.setEncoding("utf8");
      s.on("data", (c) => {
        buf += c;
        const parts = buf.split("\n");
        buf = parts.pop();
        for (const l of parts) if (l.trim()) { const t = redact(l); lines.push(t); log(t); }
      });
      s.on("end", () => { if (buf.trim()) { const t = redact(buf); lines.push(t); log(t); } });
    }
    child.on("error", (e) => lines.push(redact(e.message)));
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code: code ?? 1, signal, tail: lines.slice(-TAIL) }); });
  });
}

// Writes script/NN.txt from the manifest text when it differs, so the gate and the voice read
// the text the user sees. Returns true when it wrote.
function syncText(dir, nn, text) {
  const f = join(dir, ttsPaths(nn).text);
  if (existsSync(f) && norm(readFileSync(f, "utf8")) === norm(text)) return false;
  mkdirSync(join(dir, "script"), { recursive: true });
  writeFileSync(f, `${String(text).trim()}\n`);
  return true;
}

// One line: cast-tts, the mix measured, set_line_audio, a receipt (op series-tts).
// → { id, nn, ok, code, gate?, duration?, version?, warnings?, tail }
export async function ttsLine({ P, dir, root, series, line, actor, env = process.env, run = runCommand, measure = probe, log = () => {} }) {
  const t0 = new Date();
  const p = ttsPaths(line.nn);
  const voice = join(dir, p.voice);
  const digest = lineDigest(line);
  const pending = pendingRemix(dir, line.id, env);
  const remix = Boolean(pending && pending.digest === digest && existsSync(voice) && fileSha(voice) === pending.sha);
  if (pending && !remix) setPendingRemix(dir, line.id, null, env);
  if (remix && !canRemix(series)) {
    const error = `${p.voice} đã được tạo (đã trả lượt ElevenLabs) nhưng bước nén lỗi; series chưa khai báo cờ "--remix": "bool" cho ${TTS_TOOL} nên Studio không gọi lại API. Thêm cờ đó vào studio-series.json rồi lồng lại câu này`;
    return { id: line.id, nn: line.nn, role: line.speaker, ok: false, code: "no-remix", error, tail: [error] };
  }
  const wrote = remix ? false : syncText(dir, line.nn, line.text);
  const cmd = remix ? remixCommand({ series, projectDir: dir, root, nn: line.nn }) : ttsCommand({ series, projectDir: dir, root, nn: line.nn, speaker: line.speaker });
  if (remix) log(`${line.id}: giọng đã có từ lần trước, chỉ nén lại (--remix, không gọi API)`);
  const had = existsSync(voice) ? fileSha(voice) : null;
  const r = await run(cmd, { env: { ...env, OV: P.home }, log });
  const out = { id: line.id, nn: line.nn, role: line.speaker, ok: false, code: r.code, tail: r.tail, ...(remix ? { remix: true } : {}) };
  if (r.code === 4) out.gate = "blocked";
  else if (r.code === 0) {
    const mix = join(dir, p.mix);
    const info = existsSync(mix) ? await measure(mix) : null;
    if (!(info?.duration > 0)) out.error = `không đo được độ dài ${p.mix}`;
    else {
      out.duration = Math.round(info.duration * 1000) / 1000;
      const m = P.manifest.load(dir);
      const res = P.gateway.patch(dir, { actor: /^director\b/.test(actor) ? "director" : "human", base: m?.version, ops: [{ op: "set_line_audio", id: line.id, file: p.mix, duration: out.duration }], note: `series-tts ${line.id}` });
      if (res?.code) out.error = `set_line_audio: ${res.error ?? `exit ${res.code}`}`;
      else { out.ok = true; out.version = res?.version ?? null; out.gate = P.manifest.load(dir)?.lines?.find((l) => l.id === line.id)?.gate ?? null; if (res?.receipt?.length) out.warnings = res.receipt.filter((x) => /^CẢNH BÁO/.test(x)); }
    }
  } else out.error = `cast-tts lỗi (exit ${r.code}${r.signal ? `, ${r.signal}` : ""})`;
  if (out.ok) recordVoiced(dir, line.id, env);
  else if (!remix && out.gate !== "blocked" && existsSync(voice) && fileSha(voice) !== had) {
    // The voice was paid for in this run: the next run only mixes it again.
    setPendingRemix(dir, line.id, { digest, voice: p.voice, sha: fileSha(voice) }, env);
    out.pending_remix = true;
  }
  const outputs = Object.values(p).map((f) => join(dir, f)).filter((f) => existsSync(f) && (f !== join(dir, p.text) || wrote));
  await writeReceipt(dir, {
    op: "series-tts", actor, tool: { name: TTS_TOOL, file: relative(series.dir, cmd.file) },
    params: { role: line.speaker, line: line.id, nn: line.nn, remix },
    inputs: { series: series.config.name, exit: r.code, signal: r.signal ?? null, duration: out.duration ?? null, gate: out.gate ?? null, text_written: wrote },
    outputs, started: t0, ended: new Date(),
  });
  return out;
}

// A whole run (the "tts" job): lines in order, then the provider's timing command once.
export async function runTts({ projectDir, root, series, ids, actor = "human", env = process.env, run = runCommand, measure = probe, log = () => {} }) {
  const P = await loadProvider(env);
  if (!P.voice?.canSetAudio) throw err(400, `provider ${P.label ?? P.id} chưa có op set_line_audio; cập nhật plugin`);
  const dir = realpathSync(projectDir);
  const lines = linesToVoice(P.manifest.load(dir), ids, series);
  const done = [];
  let stopped = null;
  for (const line of lines) {
    log(`lồng tiếng ${line.id} (${line.speaker})`);
    const r = await ttsLine({ P, dir, root, series, line, actor, env, run, measure, log });
    done.push(r);
    if (!r.ok && r.gate !== "blocked") { stopped = `${line.id}: ${r.error ?? "lỗi"}; dừng, các câu sau chưa lồng`; break; }
  }
  let timing = null;
  if (done.some((r) => r.ok)) {
    const t = await run({ cmd: process.execPath, argv: [P.commands.timing, "--project", dir], cwd: dir, timeoutMs: 120000 }, { env, log });
    timing = { code: t.code, tail: t.tail.slice(-3) };
  }
  const blocked = done.filter((r) => r.gate === "blocked").map((r) => r.id);
  return { ok: !stopped && !blocked.length, lines: done, voiced: done.filter((r) => r.ok).map((r) => r.id), blocked, stopped, timing,
    ...(blocked.length ? { gate: "blocked", message: `Cổng viet-pro chặn ${blocked.join(", ")}: sửa lời rồi lồng tiếng lại` } : {}) };
}

// ---- voice design ------------------------------------------------------------------------------
export const designDir = (dir, role) => join(dir, ".opus", "voice-design", role);
const previewsHome = (series) => seriesPath(series, series.config.voices?.previews ?? "voices/previews");

// The raw entry of a role in the roles file (what a Voice Design card approves), or null.
export function roleEntry(series, role) {
  const rel = series.config.voices?.roles;
  const r = rel ? readJson(seriesPath(series, rel)) : null;
  if (Array.isArray(r)) return r.find((x) => x?.id === role) ?? null;
  return r && typeof r === "object" ? (r[role] ?? null) : null;
}

// A role that may get a new voice: in the roles file, not yet in the cast.
export function designable(series, role) {
  if (typeof role !== "string" || !ID.test(role)) throw err(400, "role: cần id vai");
  const r = rolesOf(series).find((x) => x.id === role);
  if (!r) throw err(400, `vai ${role} chưa có trong file roles của series; thêm vai (description_en, sample_vi) trước`);
  if (castOf(series)[role]) throw err(409, `vai ${role} đã có giọng trong cast của series`);
  return r;
}

export const designCommand = ({ series, projectDir, root, role }) => buildArgv({ series, projectDir, root, tool: DESIGN_TOOL, flags: { "--role": role }, positional: ["design"] });
export const pickCommand = ({ series, projectDir, root, role, pick }) => buildArgv({ series, projectDir, root, tool: DESIGN_TOOL, flags: { "--role": role, "--pick": pick }, positional: ["save"] });

// Copies <role>-1..3.mp3 of the series' previews folder into the project; returns the copies.
export function copyPreviews(series, dir, role) {
  const from = join(previewsHome(series), role);
  const to = designDir(dir, role);
  mkdirSync(to, { recursive: true });
  const out = [];
  for (let n = 1; n <= PREVIEWS; n++) {
    const f = join(from, `${role}-${n}.mp3`);
    if (!existsSync(f)) continue;
    copyFileSync(f, join(to, `${role}-${n}.mp3`));
    out.push(join(to, `${role}-${n}.mp3`));
  }
  return out;
}

// Roles waiting for the user's pick: previews in the project, no voice in the cast yet.
export function pendingPicks(series, dir) {
  const base = join(dir, ".opus", "voice-design");
  if (!existsSync(base)) return [];
  const cast = castOf(series);
  const names = new Map(rolesOf(series).map((r) => [r.id, r.name]));
  const out = [];
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || !ID.test(e.name) || cast[e.name] || !names.has(e.name)) continue;
    const previews = [];
    for (let n = 1; n <= PREVIEWS; n++) {
      const rel = `.opus/voice-design/${e.name}/${e.name}-${n}.mp3`;
      if (existsSync(join(dir, rel))) previews.push({ n, file: rel });
    }
    if (previews.length) out.push({ role: e.name, name: names.get(e.name), previews });
  }
  return out.sort((a, b) => a.role.localeCompare(b.role));
}

if (process.argv[1] && realpathSync(process.argv[1]) === SELF && process.argv[2] === "run") {
  try {
    const arg = JSON.parse(process.argv[3] ?? "{}");
    const r = await runTts({ ...arg, log: (l) => console.log(l) });
    console.log(`${RESULT_PREFIX}${JSON.stringify(r)}`);
    process.exit(r.stopped ? 1 : r.blocked.length ? 4 : 0);
  } catch (e) {
    console.log(`${RESULT_PREFIX}${JSON.stringify({ ok: false, error: redact(e.message) })}`);
    process.exit(e.status === 400 ? 2 : 1);
  }
}
