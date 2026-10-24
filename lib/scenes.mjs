// lib/scenes.mjs — one scene of an episode rebuilt and approved on its own, without rendering the
// whole film (routes/scenes.mjs, lib/tools/scenes.mjs, docs/series.md).
//
// A scene is a group of shots of the manifest (`scenes: [{ id: "c3", label, shots: [shot id] }]`,
// written by the provider). Its window runs from the start of its first shot to the end of its
// last. Rebuilding it (the project's "scene" job, `node lib/scenes.mjs run <json>`):
//   1. the series tool scene-preview writes demo/scenes/preview-<cN>.html, the episode page playing
//      only that window, after checking the cues of its shots (exit 3 names the bad cue);
//   2. `npx hyperframes render -c demo/scenes/preview-<cN>.html --quality draft` → demo/scenes/<cN>.mp4
//      (rendered under a temporary name, so a failed render leaves the last good clip);
//   3. ffmpeg cuts six evenly spaced frames of that clip into one sheet, demo/scenes/<cN>-stills.png;
//   4. .opus/scenes/<cN>.json records { scene, label, from, to, html, clip, stills, built } and a
//      receipt (op scene-rebuild) lists the files.
// Studio computes no picture hash: the provider's final gate does that. An approval is a note in
// DEMO.md, "- cảnh N: approved user@studio <ISO> <label>", above "## Frames"; the final gate still
// needs the animatic approval: line.
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { RESULT_PREFIX } from "./agents/index.mjs";
import { redact } from "./agents/redact.mjs";
import { FFMPEG } from "./broll/ffmpeg.mjs";
import { writeReceipt } from "./receipts.mjs";
import { buildArgv } from "./series-run.mjs";
import { runCommand } from "./series-voice.mjs";

const SELF = fileURLToPath(import.meta.url);
export const PREVIEW_TOOL = "scene-preview";
export const SCENE_ID = /^c\d{1,4}$/;
export const STILLS = 6;
const RENDER_TIMEOUT_MS = 30 * 60000;
const STILLS_TIMEOUT_MS = 120000;
const err = (status, msg) => Object.assign(new Error(msg), { status });
const r3 = (v) => Math.round(Number(v) * 1000) / 1000;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

// "c3" → 3, the number DEMO.md notes use.
export const sceneNumber = (id) => Number(String(id).slice(1));

export const scenePaths = (id) => ({
  html: `demo/scenes/preview-${id}.html`,
  clip: `demo/scenes/${id}.mp4`,
  part: `demo/scenes/${id}.part.mp4`,
  stills: `demo/scenes/${id}-stills.png`,
  record: `.opus/scenes/${id}.json`,
});

// { id, label, from, to, shots } of one scene of the manifest; 400 when the manifest has no
// scenes, 400 for a scene it does not have.
export function sceneWindow(m, sceneId) {
  const scenes = Array.isArray(m?.scenes) ? m.scenes : [];
  if (!scenes.length) throw err(400, "Dự án chưa có nhóm cảnh");
  if (typeof sceneId !== "string" || !SCENE_ID.test(sceneId)) throw err(400, `scene: cần id cảnh dạng c3, nhận ${JSON.stringify(sceneId ?? null)}`);
  const s = scenes.find((x) => x?.id === sceneId);
  if (!s) throw err(400, `Dự án không có cảnh ${sceneId} (có: ${scenes.map((x) => x.id).join(", ")})`);
  const shots = (s.shots ?? []).map((id) => (m.shots ?? []).find((x) => x.id === id)).filter(Boolean);
  if (!shots.length) throw err(400, `cảnh ${sceneId} không có shot nào trong project.json`);
  const from = r3(Math.min(...shots.map((x) => Number(x.start))));
  const to = r3(Math.max(...shots.map((x) => Number(x.end))));
  if (!(to > from)) throw err(400, `cảnh ${sceneId} dài 0 giây`);
  return { id: s.id, label: typeof s.label === "string" && s.label ? s.label : `Cảnh ${sceneNumber(s.id)}`, from, to, shots: shots.map((x) => x.id) };
}

// Approval notes of DEMO.md by scene number, the last one of each scene:
// { 3: { by, at, label, line } }.
export function sceneApprovals(dir) {
  const f = join(dir, "DEMO.md");
  const out = {};
  if (!existsSync(f)) return out;
  for (const m of readFileSync(f, "utf8").matchAll(/^- cảnh (\d+): approved (\S+) (\S+)(?: (.*))?$/gm)) {
    out[Number(m[1])] = { by: m[2], at: m[3], label: m[4] ?? "", line: m[0].slice(2) };
  }
  return out;
}

// The last build of a scene, or null.
export const sceneRecord = (dir, id) => readJson(join(dir, scenePaths(id).record));

// Every scene of the manifest with its window, its last build and its approval:
// [{ id, label, from, to, shots, built, clip, stills, current, approved, approved_current }].
// current: the build's window is the scene's window now (a moved line moves it); approved_current:
// approved after the last build.
export function sceneList(m, dir) {
  const approvals = sceneApprovals(dir);
  return (Array.isArray(m?.scenes) ? m.scenes : []).map((s) => {
    let w;
    try { w = sceneWindow(m, s.id); } catch { w = { id: s.id, label: s.label ?? s.id, from: null, to: null, shots: s.shots ?? [] }; }
    const rec = sceneRecord(dir, s.id);
    const clip = rec?.clip && existsSync(join(dir, rec.clip)) ? rec.clip : null;
    const stills = rec?.stills && existsSync(join(dir, rec.stills)) ? rec.stills : null;
    const current = Boolean(rec && clip && rec.from === w.from && rec.to === w.to);
    const approved = approvals[sceneNumber(s.id)] ?? null;
    return { ...w, built: rec?.built ?? null, clip, stills, current, approved, approved_current: Boolean(approved && rec?.built && approved.at >= rec.built) };
  });
}

// The DEMO.md note of an approved scene.
export const approvalNote = (s, by, at) => `cảnh ${sceneNumber(s.id)}: approved ${by} ${at} ${String(s.label).replace(/[\r\n]+/g, " ").trim()}`;

export function previewCommand({ series, projectDir, root, scene }) {
  return buildArgv({ series, projectDir, root, tool: PREVIEW_TOOL, flags: { "--project": projectDir, "--scene": scene.id, "--from": scene.from, "--to": scene.to, "--out": scenePaths(scene.id).html } });
}

// The run of one "scene" job. → { ok, scene, step?, error?, tail?, from, to, clip, stills, built, receipt }
export async function rebuildScene({ projectDir, root, series, scene, actor = "human", env = process.env, run = runCommand, log = () => {} }) {
  const dir = realpathSync(projectDir);
  const p = scenePaths(scene.id);
  const t0 = new Date();
  const fail = (step, r, error) => ({ ok: false, scene: scene.id, step, code: r?.code ?? null, error, tail: r?.tail?.slice(-8) ?? [] });
  let out;
  const preview = previewCommand({ series, projectDir: dir, root, scene });
  log(`cảnh ${scene.id}: trang xem trước ${scene.from}–${scene.to} s`);
  const a = await run(preview, { env: { ...env }, log });
  if (a.code !== 0) out = fail("scene-preview", a, a.code === 3 ? "cue sai trong cảnh (xem ERROR)" : `scene-preview lỗi (exit ${a.code})`);
  if (!out) {
    log(`cảnh ${scene.id}: render nháp`);
    rmSync(join(dir, p.part), { force: true });
    const b = await run({ cmd: "npx", argv: ["hyperframes", "render", "-c", p.html, "--quality", "draft", "-o", p.part], cwd: dir, timeoutMs: RENDER_TIMEOUT_MS }, { env, log });
    if (b.code !== 0 || !existsSync(join(dir, p.part))) out = fail("render", b, `hyperframes render lỗi (exit ${b.code})`);
    else renameSync(join(dir, p.part), join(dir, p.clip));
  }
  if (!out) {
    const len = r3(scene.to - scene.from);
    const c = await run({ cmd: FFMPEG, argv: ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", join(dir, p.clip), "-vf", `fps=${STILLS}/${len},scale=640:-2,tile=3x2`, "-frames:v", "1", join(dir, p.stills)], cwd: dir, timeoutMs: STILLS_TIMEOUT_MS }, { env, log });
    if (c.code !== 0 || !existsSync(join(dir, p.stills))) out = fail("stills", c, `ffmpeg không cắt được ảnh ghép (exit ${c.code})`);
  }
  const built = new Date().toISOString();
  if (!out) {
    mkdirSync(join(dir, ".opus", "scenes"), { recursive: true });
    const rec = { scene: scene.id, label: scene.label, from: scene.from, to: scene.to, html: p.html, clip: p.clip, stills: p.stills, built };
    writeFileSync(join(dir, p.record), JSON.stringify(rec, null, 2) + "\n");
    out = { ok: true, ...rec };
  }
  const outputs = out.ok ? [p.html, p.clip, p.stills, p.record].map((f) => join(dir, f)) : [];
  const receipt = await writeReceipt(dir, {
    op: "scene-rebuild", actor, tool: { name: PREVIEW_TOOL, file: relative(series.dir, preview.file), render: "hyperframes render --quality draft" },
    params: { scene: scene.id, from: scene.from, to: scene.to, shots: scene.shots ?? [] },
    inputs: { series: series.config.name, ok: out.ok, step: out.step ?? null, exit: out.code ?? 0 },
    outputs, started: t0, ended: new Date(),
  });
  return { ...out, receipt: receipt.file };
}

if (process.argv[1] && realpathSync(process.argv[1]) === SELF && process.argv[2] === "run") {
  try {
    const arg = JSON.parse(process.argv[3] ?? "{}");
    const r = await rebuildScene({ ...arg, log: (l) => console.log(l) });
    console.log(`${RESULT_PREFIX}${JSON.stringify(r)}`);
    process.exit(r.ok ? 0 : r.step === "scene-preview" && r.code === 3 ? 3 : 1);
  } catch (e) {
    console.log(`${RESULT_PREFIX}${JSON.stringify({ ok: false, error: redact(e.message) })}`);
    process.exit(e.status === 400 ? 2 : 1);
  }
}
