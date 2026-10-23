// lib/nle/index.mjs — the timelines of a bundle (bundle.mjs) for an editor:
//   timeline.fcpxml  FCPXML 1.10 (or 1.8), for Final Cut Pro and DaVinci Resolve
//   timeline.xml     xmeml v5 (Final Cut 7 XML), for Premiere Pro and Resolve
//   timeline.otio    OpenTimelineIO JSON
// writeNle(manifest, outDir, formats, { now, fcpxmlVersion }) writes them next to the layers and
// answers the manifest's `nle` field ({ fcpxml, xmeml, otio, absolute_paths }, a format not
// written null, absolute_paths true when an XML file is there; null when formats is empty).
// render(manifest, outDir, format, opts) is the text of one file, pure, for tests.
// The model all three share (timeline()): V1 is the shots end to end from frame 0; each audio stem
// (voice, music, sfx; mix alone when there is no stem) is a track of its own, full length; markers
// are the voice lines (the first 40 characters of the text) and the SFX events (their label), each
// one frame long at round(t × fps). The timeline is source frames [first shot's frame_in, frames),
// so a project whose first shot does not start at 0 stays in sync: the stems are trimmed by the
// same number of frames and the markers shift with them.
// FCPXML and xmeml need absolute media paths (file:// URLs of outDir); OTIO uses paths relative to
// the bundle, so only it survives moving the folder.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { rational } from "./time.mjs";
import { fcpxml, FCPXML_VERSIONS } from "./fcpxml.mjs";
import { xmeml } from "./xmeml.mjs";
import { otio } from "./otio.mjs";

export const FILES = { fcpxml: "timeline.fcpxml", xmeml: "timeline.xml", otio: "timeline.otio" };
export const FORMATS = Object.keys(FILES);
export { FCPXML_VERSIONS };
export const MARKER_NAME_MAX = 40;
const STEMS = ["voice", "music", "sfx"];
const ROLE = { voice: "dialogue", music: "music", sfx: "effects", mix: "dialogue" };
const WRITERS = { fcpxml, xmeml, otio };

// "fcpxml,xmeml" → ["fcpxml", "xmeml"]; "none" → []; throws on an unknown or repeated name.
export function parseFormats(s) {
  const v = String(s ?? "").trim();
  if (v === "none") return [];
  const list = v.split(",").map((x) => x.trim()).filter(Boolean);
  if (!list.length) throw new Error(`--nle cần ${FORMATS.join(",")} hoặc none`);
  for (const f of list) if (!FORMATS.includes(f)) throw new Error(`--nle: không biết định dạng ${f} (có ${FORMATS.join(", ")}, none)`);
  if (new Set(list).size !== list.length) throw new Error("--nle: định dạng lặp lại");
  return FORMATS.filter((f) => list.includes(f));
}

const wholeFrames = (v, what) => {
  if (!Number.isInteger(v) || v < 0) throw new Error(`manifest: ${what} phải là số khung nguyên ≥ 0 (đang là ${v})`);
  return v;
};
const relFile = (f, what) => {
  if (typeof f !== "string" || !f || f.startsWith("/") || f.includes("\\") || f.split("/").some((x) => x === ".." || x === "." || x === "")) throw new Error(`manifest: ${what} cần đường tương đối trong bundle (đang là ${JSON.stringify(f)})`);
  return f;
};
const clip = (s, max) => Array.from(String(s ?? "")).slice(0, max).join("").trim();
const baseName = (f) => f.split("/").pop().replace(/\.[^.]+$/, "");

// The shared model of a bundle manifest (motion-studio/bundle@1) whose files sit in outDir.
export function timeline(manifest, outDir) {
  const m = manifest ?? {};
  const dir = resolve(String(outDir));
  const rate = rational(m.fps);
  const fps = rate.num / rate.den;
  for (const k of ["width", "height"]) if (!(Number.isInteger(m[k]) && m[k] > 0)) throw new Error(`manifest: ${k} phải là số nguyên dương`);
  const total = wholeFrames(m.frames, "frames");
  if (!Array.isArray(m.shots) || !m.shots.length) throw new Error("manifest: chưa có shot");
  const first = wholeFrames(m.shots[0].frame_in, "shots[0].frame_in");
  const url = (f) => pathToFileURL(join(dir, f)).href;
  let at = 0;
  const video = m.shots.map((s, i) => {
    const a = wholeFrames(s.frame_in, `shots[${i}].frame_in`), b = wholeFrames(s.frame_out, `shots[${i}].frame_out`);
    if (!(b > a)) throw new Error(`manifest: shot ${s.id} không có khung nào`);
    if (i && a !== m.shots[i - 1].frame_out) throw new Error(`manifest: shot ${s.id} không nối liền shot trước (khung ${m.shots[i - 1].frame_out} → ${a})`);
    const file = relFile(s.file, `shots[${i}].file`);
    const v = { id: String(s.id), name: String(s.name || s.id), file, url: url(file), asset: baseName(file), offset: at, duration: b - a };
    at += b - a;
    return v;
  });
  if (m.shots.at(-1).frame_out !== total) throw new Error(`manifest: shot cuối hết ở khung ${m.shots.at(-1).frame_out}, video có ${total} khung`);
  const length = total - first;

  const files = Array.isArray(m.audio) ? m.audio : [];
  const pickKinds = files.some((a) => STEMS.includes(a?.kind)) ? STEMS : ["mix"];
  const audio = pickKinds.flatMap((kind) => files.filter((a) => a?.kind === kind).slice(0, 1)).map((a) => {
    const file = relFile(a.file, `audio ${a.kind}`);
    return { kind: a.kind, role: ROLE[a.kind], name: a.kind, file, url: url(file), asset: baseName(file), start: first, duration: length, length: total };
  });

  const at0 = (t) => Math.min(length - 1, Math.max(0, Math.round(Number(t) * fps) - first));
  const markers = [
    ...(Array.isArray(m.lines) ? m.lines : []).filter((l) => Number.isFinite(Number(l?.start)) && String(l?.text ?? "").trim())
      .map((l) => ({ kind: "line", frame: at0(l.start), name: clip(l.text, MARKER_NAME_MAX), note: String(l.text).trim() })),
    ...(Array.isArray(m.events) ? m.events : []).filter((e) => Number.isFinite(Number(e?.start)))
      .map((e) => {
        const label = String(e.label || "").trim() || (e.sound ? baseName(String(e.sound)) : String(e.id ?? "SFX"));
        return { kind: "sfx", frame: at0(e.start), name: clip(label, MARKER_NAME_MAX), note: label };
      }),
  ].sort((x, y) => x.frame - y.frame);

  return { name: String(m.title || m.project || "Motion Studio"), rate, width: m.width, height: m.height, length, video, audio, markers };
}

export function render(manifest, outDir, format, { now = new Date(), fcpxmlVersion } = {}) {
  const w = WRITERS[format];
  if (!w) throw new Error(`không biết định dạng ${format}`);
  return w(timeline(manifest, outDir), { now, version: fcpxmlVersion });
}

export function writeNle(manifest, outDir, formats = FORMATS, opts = {}) {
  if (!formats.length) return null;
  const texts = formats.map((f) => [f, render(manifest, outDir, f, opts)]); // all built before any is written
  for (const [f, text] of texts) writeFileSync(join(outDir, FILES[f]), text);
  return { ...Object.fromEntries(FORMATS.map((f) => [f, formats.includes(f) ? FILES[f] : null])), absolute_paths: formats.some((f) => f !== "otio") };
}
