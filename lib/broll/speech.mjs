// lib/broll/speech.mjs — does a clip have speech, and what is said. silencedetect (-35 dB, 0.5 s)
// on the first audio stream gives the share of the clip that is not silent; more than 30 % counts
// as speech. Only then is the audio transcribed, by the media-use skill's transcribe.mjs
// (<hfSkills>/media-use/scripts/transcribe.mjs: Parakeet, else whisper.cpp through hyperframes).
// Nothing is installed here: no script or no engine gives transcript: null, not an error.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hfSkills } from "../config.mjs";
import { ffmpeg, run, tail } from "./ffmpeg.mjs";

export const VERSION = 1;
export const SPEECH_RATIO = 0.3;

export const silenceArgs = (file) => ["-loglevel", "info", "-i", file, "-map", "0:a:0", "-vn", "-sn", "-dn", "-af", "silencedetect=n=-35dB:d=0.5", "-f", "null", "-"];

// The share of [0, duration] that is not silent, from silencedetect's log (pure).
export function speechRatio(text, duration) {
  const d = Number(duration);
  if (!(d > 0)) return 0;
  let silent = 0, open = null;
  for (const m of String(text ?? "").matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const t = Math.min(d, Math.max(0, Number(m[2])));
    if (m[1] === "start") open = t;
    else if (open != null) { silent += Math.max(0, t - open); open = null; }
  }
  if (open != null) silent += Math.max(0, d - open);
  return Math.round(Math.max(0, Math.min(1, 1 - silent / d)) * 1000) / 1000;
}

// Words [{ text, start, end }] → lines split at a pause over 0.8 s or every 14 words (pure).
export function segments(words) {
  const out = [];
  let cur = null;
  for (const w of words ?? []) {
    const text = String(w?.text ?? w?.word ?? "").trim();
    const start = Number(w?.start), end = Number(w?.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (!cur || start - cur.end > 0.8 || cur.n >= 14) { cur = { start, end, text, n: 1 }; out.push(cur); }
    else { cur.end = end; cur.text += ` ${text}`; cur.n++; }
  }
  return out.map(({ start, end, text }) => ({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text }));
}

export const transcribeScript = (env = process.env) => join(hfSkills(env), "media-use", "scripts", "transcribe.mjs");

// { transcript: [{ start, end, text }] | null, engine, error? }.
export async function transcribe(file, { env = process.env, signal, timeout = 15 * 60000 } = {}) {
  const script = transcribeScript(env);
  if (!existsSync(script)) return { transcript: null, engine: null, error: "không có media-use/scripts/transcribe.mjs" };
  const dir = mkdtempSync(join(tmpdir(), "ms-broll-asr-"));
  try {
    const wav = join(dir, "audio.wav"), out = join(dir, "audio.json");
    const a = await ffmpeg(["-i", file, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", wav], { timeout: 10 * 60000, signal });
    if (a.code !== 0) return { transcript: null, engine: null, error: `tách tiếng: ${tail(a)}` };
    const r = await run(process.execPath, [script, "--input", wav, "--out", out, "--engine", "auto", "--json"], { timeout, signal, cwd: dir });
    if (r.code !== 0 || !existsSync(out)) return { transcript: null, engine: null, error: `ASR: ${tail(r)}` };
    let engine = null;
    try { engine = JSON.parse(r.stdout.trim().split("\n").at(-1)).engine ?? null; } catch { /* no JSON line */ }
    const j = JSON.parse(readFileSync(out, "utf8"));
    return { transcript: segments(Array.isArray(j) ? j : j.words), engine };
  } catch (e) {
    return { transcript: null, engine: null, error: `ASR: ${e.message}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// { has_speech, ratio, transcript, engine?, error? } for a clip; no audio stream → no speech.
export async function analyzeSpeech(file, probe, { asr = true, env = process.env, signal } = {}) {
  if (!probe?.audio) return { has_speech: false, ratio: 0, transcript: null };
  const r = await ffmpeg(silenceArgs(file), { timeout: 30 * 60000, signal });
  if (r.code !== 0) return { has_speech: false, ratio: 0, transcript: null, error: `silencedetect: ${tail(r)}` };
  const ratio = speechRatio(r.stderr, probe.duration);
  const has_speech = ratio > SPEECH_RATIO;
  if (!has_speech || !asr) return { has_speech, ratio, transcript: null };
  const t = await transcribe(file, { env, signal });
  return { has_speech, ratio, transcript: t.transcript, engine: t.engine, ...(t.error ? { error: t.error } : {}) };
}
