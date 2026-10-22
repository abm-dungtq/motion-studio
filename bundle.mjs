#!/usr/bin/env node
// studio/bundle.mjs — "bộ lớp dựng": the project as layers for an NLE (Concat, CapCut, DaVinci,
// Premiere), so the user can fine-tune the cut there.
//   node bundle.mjs --project <dir> [--ratio 9x16] [--source <mp4>] [--out <dir>]
// Writes <out> (default renders/<name>-<yyyymmdd-hhmmss>[-<ratio>]-bundle/ in the project):
//   shots/NN-<shot id>.mp4  picture only, H.264 CRF 12, cut at the shot bounds of project.json
//                           rounded to frames (frame = round(t × fps), from the start of the
//                           video, so rounding never adds up); the last shot runs to the end
//   audio/mix.wav           the whole sound, as audio-mix.mjs of the plugin rebuilds it
//   audio/voice.wav, audio/music.wav (music after ducking), audio/sfx.wav: the same mix split by
//                           role (audio-mix's voice and bed rules; everything else is sfx); each
//                           only when such tracks exist; 48 kHz stereo, full length, start at 0
//   captions.srt            the voice lines; a line longer than CUE_MAX characters is split at
//                           word times (assets/voice/<file>.words.json), else by character share
//   manifest.json           schema motion-studio/bundle@1: shots with frames and seconds, audio
//                           files, lines, SFX events
// The picture is one HyperFrames render of the whole composition (`npx hyperframes render
// --quality delivery`, -c compositions/main-<ratio>.html for another ratio), or --source <mp4>
// already rendered from it. HyperFrames renders no time range and scenes share one GSAP timeline,
// so shots are cut from that render; a transition stays in the picture of the shots it spans.
// Work files go to <out>/.work and are removed at the end; a failed or stopped run removes <out>. Exit 0 ok · 1 a step failed · 2 bad usage · 130 stopped.
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlugin } from "./lib/plugin.mjs";

export const SCHEMA = "motion-studio/bundle@1";
export const CUE_MAX = 84; // two subtitle rows of about 42 characters
const RATIO = /^\d+x\d+$/;

// Frame bounds of every shot: in = round(start × fps); out = the next shot's in, the last one
// ends at total (the source's frame count). Throws when a shot would be empty or the source is
// shorter than the shots.
export function shotFrames(shots, fps, total) {
  const ins = shots.map((s) => Math.round(s.start * fps));
  return shots.map((s, i) => {
    const a = ins[i], b = i === shots.length - 1 ? total : ins[i + 1];
    if (!(b > a)) throw new Error(`shot ${s.id} không còn khung nào (khung ${a} tới ${b})`);
    return { id: s.id, name: s.name ?? "", frame_in: a, frame_out: b, start: a / fps, end: b / fps, start_set: s.start, end_set: s.end };
  });
}

// Subtitle cues of the voice lines. words(line) → [{ start, end }] relative to the line, or null;
// used only when it has one entry per word of the text.
export function cues(lines, words = () => null, max = CUE_MAX) {
  const out = [];
  for (const l of lines) {
    const text = String(l.text ?? "").trim();
    const dur = Number(l.duration);
    if (!text || !Number.isFinite(l.start) || !(dur > 0)) continue;
    const ws = text.split(/\s+/);
    const timed = words(l);
    let times;
    if (Array.isArray(timed) && timed.length === ws.length) times = timed.map((w) => ({ start: l.start + Number(w.start), end: l.start + Number(w.end) }));
    else {
      let at = 0;
      times = ws.map((w) => { const t = { start: l.start + (dur * at) / text.length }; at += w.length + 1; t.end = l.start + (dur * Math.min(at - 1, text.length)) / text.length; return t; });
    }
    let from = 0;
    for (let i = 0; i < ws.length; i++) {
      const chunk = ws.slice(from, i + 1).join(" ");
      const next = i + 1 < ws.length ? `${chunk} ${ws[i + 1]}` : null;
      if (next === null || next.length > max || /[.!?;:…]$/.test(ws[i])) {
        out.push({ start: times[from].start, end: times[i].end, text: chunk });
        from = i + 1;
      }
    }
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length; i++) {
    if (i + 1 < out.length) out[i].end = Math.min(out[i].end, out[i + 1].start);
    if (!(out[i].end > out[i].start)) out[i].end = out[i].start + 0.1;
  }
  return out;
}

const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
export const srt = (list) => list.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");

// The <audio>/<video> tags of html that audio-mix plays, split by role with audio-mix's own rules.
export async function audioRoles(html, baseDir, scripts) {
  const mix = await import(pathToFileURL(join(scripts, "audio-mix.mjs")).href);
  const flat = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\r?\n/g, " ");
  const pairs = [];
  for (const [tag] of flat.matchAll(/<(audio|video)\b[^>]*>/gi)) {
    const [t] = mix.parseTracks(tag, baseDir, baseDir);
    if (t) pairs.push({ tag, t });
  }
  const tracks = pairs.map((p) => p.t);
  const voice = new Set(mix.voiceIndices(tracks));
  const roles = { voice: [], music: [], sfx: [] };
  pairs.forEach((p, i) => roles[voice.has(i) ? "voice" : mix.isBed(p.t) ? "music" : "sfx"].push(p.tag));
  return roles;
}

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,r_frame_rate,width,height", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe không đọc được ${file}: ${String(r.stderr).trim()}`);
  const s = JSON.parse(r.stdout).streams?.[0];
  if (!s) throw new Error(`${file} không có hình`);
  const [n, d] = String(s.r_frame_rate).split("/").map(Number);
  return { frames: Number(s.nb_read_frames), fps: d ? n / d : n, width: s.width, height: s.height };
}

// Set by SIGTERM/SIGINT (Dừng in Studio signals the whole process group): the running child dies
// with the same signal, run() throws, and main removes the half-written bundle.
let stopped = null;

function run(cmd, args, opts = {}) {
  if (stopped) throw new Error(`đã dừng (${stopped})`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) throw new Error(`không chạy được ${cmd}: ${r.error.message}`);
  if (r.signal === "SIGTERM" || r.signal === "SIGINT") stopped ??= r.signal; // our own handler runs only after spawnSync
  if (r.signal || stopped) throw new Error(`${cmd} bị dừng (${r.signal ?? stopped})`);
  if (r.status !== 0) throw new Error(`${cmd} ${args[0] ?? ""} lỗi (exit ${r.status})`);
}

const usage = "dùng: node bundle.mjs --project <dir> [--ratio 9x16] [--source <mp4>] [--out <dir>]";

export async function main(argv = process.argv.slice(2), { log = console.log, err = console.error, now = new Date() } = {}) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!["--project", "--ratio", "--source", "--out"].includes(a) || argv[i + 1] === undefined) { err(usage); return 2; }
    o[a.slice(2)] = argv[++i];
  }
  if (!o.project) { err(usage); return 2; }
  const dir = resolve(o.project);
  if (!existsSync(join(dir, "project.json"))) { err(`không có project.json trong ${dir}`); return 2; }
  const ratio = o.ratio ?? "16x9";
  if (!RATIO.test(ratio)) { err("--ratio dạng 9x16"); return 2; }
  const { load, SCRIPTS } = await loadPlugin();
  const m = load(dir);
  const fps = Number(m.fps) || 30;
  const comp = ratio === "16x9" ? (m.html || "index.html") : `compositions/main-${ratio}.html`;
  const compPath = join(dir, comp);
  if (!existsSync(compPath)) { err(`không có ${comp}${ratio === "16x9" ? "" : " (chạy reframe.mjs trước)"}`); return 2; }
  if (!m.shots?.length) { err("project.json chưa có shot"); return 2; }
  const name = basename(dir);
  const z = (n) => String(n).padStart(2, "0");
  const out = resolve(dir, o.out ?? `renders/${name}-${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}-${z(now.getHours())}${z(now.getMinutes())}${z(now.getSeconds())}${ratio === "16x9" ? "" : `-${ratio}`}-bundle`);
  if (existsSync(out)) { err(`${out} đã có, chọn --out khác`); return 2; }
  const work = join(out, ".work");
  mkdirSync(join(out, "shots"), { recursive: true });
  mkdirSync(work, { recursive: true });
  try {
    // 1. Picture.
    let source = o.source ? resolve(o.source) : null;
    if (source) {
      if (!existsSync(source)) throw new Error(`không có ${source}`);
      log(`Hình: dùng ${source}`);
    } else {
      source = join(work, "full.mp4");
      log(`Hình: render ${comp} (hyperframes, delivery)`);
      run("npx", ["hyperframes", "render", "--quality", "delivery", ...(comp === "index.html" ? [] : ["-c", comp]), "-o", source], { cwd: dir });
    }
    const src = probe(source);
    if (Math.abs(src.fps - fps) > 0.01) throw new Error(`nguồn ${src.fps} fps, project.json là ${fps} fps`);
    const want = Math.round(Number(m.duration) * fps);
    if (Number.isFinite(want) && want > 0 && Math.abs(src.frames - want) > 1) throw new Error(`nguồn có ${src.frames} khung, project.json dài ${m.duration} s (${want} khung)`);

    // 2. Shots.
    const shots = shotFrames(m.shots, fps, src.frames);
    for (const [i, s] of shots.entries()) {
      s.file = `shots/${z(i + 1)}-${s.id}.mp4`;
      log(`Shot ${s.id}: khung ${s.frame_in} tới ${s.frame_out}`);
      run("ffmpeg", ["-y", "-v", "error", "-i", source, "-vf", `trim=start_frame=${s.frame_in}:end_frame=${s.frame_out},setpts=PTS-STARTPTS`, "-an",
        "-c:v", "libx264", "-crf", "12", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", join(out, s.file)]);
      const got = probe(join(out, s.file)).frames;
      if (got !== s.frame_out - s.frame_in) throw new Error(`shot ${s.id} ra ${got} khung, cần ${s.frame_out - s.frame_in}`);
    }

    // 3. Sound.
    const seconds = String(src.frames / fps);
    const html = readFileSync(compPath, "utf8");
    const roles = await audioRoles(html, dirname(compPath), SCRIPTS);
    const audio = [];
    if (roles.voice.length + roles.music.length + roles.sfx.length) {
      mkdirSync(join(out, "audio"), { recursive: true });
      log("Tiếng: mix, voice, music (audio-mix)");
      run(process.execPath, [join(SCRIPTS, "audio-mix.mjs"), "--html", compPath, "--duration", seconds, "--out", join(out, "audio", "mix.wav"), "--base", dir, "--stems", join(out, "audio")]);
      audio.push({ kind: "mix", file: "audio/mix.wav" });
      for (const kind of ["voice", "music"]) if (roles[kind].length && existsSync(join(out, "audio", `${kind}.wav`))) audio.push({ kind, file: `audio/${kind}.wav` });
      if (roles.sfx.length) {
        log(`Tiếng: sfx (${roles.sfx.length} track)`);
        const sfxHtml = join(work, "sfx.html");
        writeFileSync(sfxHtml, `<!doctype html>\n${roles.sfx.join("\n")}\n`);
        run(process.execPath, [join(SCRIPTS, "audio-mix.mjs"), "--html", sfxHtml, "--duration", seconds, "--out", join(out, "audio", "sfx.wav"), "--base", dirname(compPath)]);
        audio.push({ kind: "sfx", file: "audio/sfx.wav" });
      }
    } else log("Tiếng: composition không có <audio>, bỏ qua");

    // 4. Captions.
    const words = (l) => {
      const f = l.file && join(dir, `${l.file}.words.json`);
      try { return f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; }
    };
    const list = cues(m.lines ?? [], words);
    if (list.length) writeFileSync(join(out, "captions.srt"), srt(list));

    // 5. Manifest.
    const manifest = {
      schema: SCHEMA, project: name, title: m.title ?? "", version: m.version, ratio, composition: comp,
      fps, width: src.width, height: src.height, frames: src.frames, duration: src.frames / fps, created: now.toISOString(),
      source: o.source ? { kind: "file", path: relative(dir, source).startsWith("..") ? source : relative(dir, source) } : { kind: "render" },
      shots: shots.map(({ id, name: n, file, frame_in, frame_out, start, end, start_set, end_set }) => ({ id, name: n, file, frame_in, frame_out, start, end, start_set, end_set })),
      audio,
      captions: list.length ? "captions.srt" : null,
      lines: (m.lines ?? []).map((l) => ({ id: l.id, shot: l.shot, start: l.start, end: l.start + (Number(l.duration) || 0), text: l.text })),
      events: (m.events ?? []).map((e) => ({ id: e.id, shot: e.shot, start: (m.shots.find((s) => s.id === e.shot)?.start ?? 0) + (Number(e.offset) || 0), sound: e.sound, label: e.label ?? "" })),
      note: "Chuyển cảnh nằm sẵn trong hình của các shot nó vắt qua: giữ thứ tự và độ dài shot thì liền mạch. Tiếng đặt từ giây 0 của timeline.",
    };
    writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    log(`Xong: ${relative(dir, out)} (${shots.length} shot, ${audio.length} file tiếng${list.length ? `, ${list.length} phụ đề` : ""})`);
    return 0;
  } catch (e) {
    err(`bundle: ${e.message}`);
    rmSync(out, { recursive: true, force: true }); // no half-written bundle
    return 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { stopped = sig; });
  const code = await main();
  process.exit(stopped ? 130 : code);
}
