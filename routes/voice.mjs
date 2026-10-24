// routes/voice.mjs — voicing the lines of a series episode by speaker, and new cast voices
// (lib/series-voice.mjs, docs/series.md). Every step that calls ElevenLabs is the series' own
// tool; Studio reads no key.
//   GET  /api/voice/previews?name=<project>
//        → { roles: [{ role, name, previews: [{ n, file }] }], can_set_speaker }: roles whose three
//          previews wait for the user's pick (file is a project path, served under /p/<name>/),
//          and whether the provider can set a line's speaker
//   POST /api/voice/tts { name, ids, actor? }
//        → one line that a run behind a card has voiced before (Studio's ledger, lib/ledger.mjs),
//          or whose paid voice waits to be mixed again, runs now as the project's "tts" job
//          ({ job }): re-voicing one line needs no card. Any other request (a line never voiced,
//          two or more lines) writes a consent card (kind elevenlabs, action tts-batch) with the
//          characters it costs and the sha256 of the lines' speakers and text:
//          { waiting_consent: true, consent, estimate, message }. A waiting card of the same
//          lines and text answers again; one whose text changed is declined as stale. A line
//          without a speaker is a 400 "Chọn người nói trước".
//   POST /api/voice/design { name, role, actor? }
//        → a consent card (kind elevenlabs, action voice-design) for one Voice Design run of a role
//          of the roles file that has no voice yet, with the sha256 of the role's entry; a waiting
//          card of the same role and entry is answered again. When approved, the "voice-design" job runs `voice-design design --role <id>`,
//          copies the three previews into .opus/voice-design/<id>/ and writes a receipt (op
//          voice-design).
//   POST /api/voice/pick { name, role, pick }
//        → the user's pick (the click is the consent): `voice-design save --role <id> --pick <n>`
//          as the "voice-design" job, a receipt (op voice-pick), then a request for the director
//          to voice that role's lines with series_tts.
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { queueRequest } from "../director.mjs";
import { cancel, startJob } from "../jobs.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { createCard, digestOf, registerAction, waitingCard } from "../lib/consent.mjs";
import { isVoiced, pendingRemix } from "../lib/ledger.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { seriesFor, seriesPath } from "../lib/series.mjs";
import { copyPreviews, designable, designCommand, linesDigest, linesToVoice, pendingPicks, pickCommand, PREVIEWS, roleEntry, ttsEstimate, ttsTitle } from "../lib/series-voice.mjs";

export const TTS_KIND = "tts";
export const DESIGN_KIND = "voice-design";
const RUNNER = fileURLToPath(new URL("../lib/series-voice.mjs", import.meta.url));
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
const bad = (status, msg) => Object.assign(new Error(msg), { status });
const actorOf = (b) => (typeof b.actor === "string" && ACTOR.test(b.actor) ? b.actor : "human");

function projectOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  const series = seriesFor(c.P, pd.dir);
  if (!series) throw bad(404, `${name} không thuộc series nào: lồng tiếng theo vai cần series (BRIEF.md có dòng series:)`);
  return { path: pd.dir, dir: realpathSync(pd.dir), series };
}
const ASK_MESSAGE = "Chờ người dùng bấm Đồng ý (tab Lời & giọng hoặc Tài sản)";
const idsKey = (ids) => [...ids].sort().join(",");

// The waiting card of these lines as they are now, or a new one.
async function askTts(c, name, ids) {
  const p = projectOf(c, name);
  const lines = linesToVoice(c.P.manifest.load(p.dir), ids, p.series);
  const digest = linesDigest(lines);
  const key = idsKey(lines.map((l) => l.id));
  const had = await waitingCard(p.dir, "tts-batch", (a) => Array.isArray(a.ids) && idsKey(a.ids) === key, digest);
  if (had) return { card: had, estimate: had.estimate };
  const est = ttsEstimate(lines);
  return { card: createCard(p.dir, { kind: "elevenlabs", title: ttsTitle(est), count: est.lines, estimate: est, action: { name: "tts-batch", args: { ids: lines.map((l) => l.id) } }, digest }), estimate: est };
}
const designDigest = (p, role) => digestOf({ role, entry: roleEntry(p.series, role) });
async function askDesign(c, name, role) {
  const p = projectOf(c, name);
  const r = designable(p.series, role);
  const digest = designDigest(p, r.id);
  const had = await waitingCard(p.dir, "voice-design", (a) => a.role === r.id, digest);
  if (had) return { card: had, estimate: had.estimate };
  const estimate = { voice_design: 1, previews: PREVIEWS };
  return { card: createCard(p.dir, { kind: "elevenlabs", title: `Tạo ${PREVIEWS} giọng thử cho ${r.name}, 1 lượt Voice Design`, count: 1, estimate, action: { name: "voice-design", args: { role: r.id } }, digest }), estimate };
}
const busy = (e, name, what) => bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${name} đang ${what}, chờ xong đã` : e.message);

function startTts(c, name, { ids, actor }) {
  const p = projectOf(c, name);
  if (!c.P.voice?.canSetAudio) throw bad(400, "provider chưa có op set_line_audio; cập nhật plugin rồi thử lại");
  linesToVoice(c.P.manifest.load(p.dir), ids, p.series);
  const arg = { projectDir: p.dir, root: c.root, series: { dir: p.series.dir, config: p.series.config }, ids, actor };
  try {
    return startJob({ name, kind: TTS_KIND, cmd: process.execPath, args: [RUNNER, "run", JSON.stringify(arg)], cwd: p.dir, meta: { step: TTS_KIND, ids, actor }, onLine: (l) => redact(l) });
  } catch (e) { throw busy(e, name, "lồng tiếng"); }
}

// Runs one voice-design command as the project's "voice-design" job, stopped after the tool's
// timeout_s; done(job) writes its receipt.
function startDesignJob(name, cmd, meta, done) {
  let timer = null;
  let job;
  try {
    job = startJob({
      name, kind: DESIGN_KIND, cmd: cmd.cmd, args: cmd.argv, cwd: cmd.cwd, meta: { step: DESIGN_KIND, ...meta }, onLine: (l) => redact(l),
      onExit: (j) => { clearTimeout(timer); done(j).catch((e) => console.error(`motion-studio: ${meta.what} ${meta.role}: ${e.message}`)); },
    });
  } catch (e) { throw busy(e, name, "tạo giọng"); }
  timer = setTimeout(() => cancel(job.id), cmd.timeoutMs);
  timer.unref?.();
  return job;
}

function startDesign(c, name, { role, actor }) {
  const p = projectOf(c, name);
  designable(p.series, role);
  const cmd = designCommand({ series: p.series, projectDir: p.dir, root: c.root, role });
  const t0 = new Date();
  return startDesignJob(name, cmd, { what: "design", role }, async (j) => {
    const outputs = j.code === 0 ? copyPreviews(p.series, p.dir, role) : [];
    await writeReceipt(p.dir, { op: "voice-design", actor, tool: { name: "voice-design", file: relative(p.series.dir, cmd.file) }, params: { role, previews: PREVIEWS }, inputs: { series: p.series.config.name, exit: j.code, signal: j.signal }, outputs, started: t0, ended: new Date() });
  });
}

registerAction("tts-batch", (ctx, { args, card }) => ({ job: startTts(ctx, ctx.name, { ids: args.ids, actor: card.by ?? "human" }) }), {
  digest: (ctx, { args }) => { const p = projectOf(ctx, ctx.name); return linesDigest(linesToVoice(ctx.P.manifest.load(p.dir), args.ids, p.series)); },
  renew: async (ctx, { args }) => (await askTts(ctx, ctx.name, args.ids)).card,
});
registerAction("voice-design", (ctx, { args, card }) => ({ job: startDesign(ctx, ctx.name, { role: args.role, actor: card.by ?? "human" }) }), {
  digest: (ctx, { args }) => designDigest(projectOf(ctx, ctx.name), args.role),
  renew: async (ctx, { args }) => (await askDesign(ctx, ctx.name, args.role)).card,
});

export const ROUTES = [
  {
    method: "GET", path: "/api/voice/previews",
    handler(c) {
      const p = projectOf(c, c.q("name"));
      return { roles: pendingPicks(p.series, p.dir), can_set_speaker: Boolean(c.P.voice?.canSetSpeaker) };
    },
  },
  {
    method: "POST", path: "/api/voice/tts",
    async handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const lines = linesToVoice(c.P.manifest.load(p.dir), b.ids, p.series);
      const ids = lines.map((l) => l.id);
      if (ids.length === 1 && (isVoiced(p.dir, ids[0]) || pendingRemix(p.dir, ids[0]))) return { job: startTts(c, b.name, { ids, actor: actorOf(b) }) };
      const { card, estimate } = await askTts(c, b.name, ids);
      return { waiting_consent: true, consent: card, estimate, message: ASK_MESSAGE };
    },
  },
  {
    method: "POST", path: "/api/voice/design",
    async handler(c) {
      const b = c.body ?? {};
      const { card, estimate } = await askDesign(c, b.name, b.role);
      return { waiting_consent: true, consent: card, estimate, message: ASK_MESSAGE };
    },
  },
  {
    method: "POST", path: "/api/voice/pick",
    handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const pending = pendingPicks(p.series, p.dir).find((x) => x.role === b.role);
      if (!pending) throw bad(400, `vai ${String(b.role ?? "")} không có giọng thử nào đang chờ chọn`);
      if (!pending.previews.some((x) => x.n === b.pick)) throw bad(400, `pick: chọn một trong ${pending.previews.map((x) => x.n).join(", ")}`);
      const cmd = pickCommand({ series: p.series, projectDir: p.dir, root: c.root, role: pending.role, pick: b.pick });
      const castFile = p.series.config.voices?.cast ? seriesPath(p.series, p.series.config.voices.cast) : null;
      const t0 = new Date();
      const job = startDesignJob(b.name, cmd, { what: "pick", role: pending.role, pick: b.pick }, async (j) => {
        await writeReceipt(p.dir, { op: "voice-pick", actor: "human", tool: { name: "voice-design", file: relative(p.series.dir, cmd.file) }, params: { role: pending.role, pick: b.pick }, inputs: { series: p.series.config.name, exit: j.code, signal: j.signal }, outputs: j.code === 0 && castFile ? [castFile] : [], started: t0, ended: new Date() });
        if (j.code !== 0) return;
        try { queueRequest(c.P, b.name, p.path, { scope: "project", text: `Giọng ${pending.name} đã chọn. Lồng tiếng các câu của ${pending.name} bằng series_tts.` }); }
        catch (e) { console.error(`motion-studio: không xếp được yêu cầu cho đạo diễn sau khi chọn giọng ${pending.role}: ${e.message}`); }
      });
      return { job, role: pending.role, pick: b.pick };
    },
  },
];
