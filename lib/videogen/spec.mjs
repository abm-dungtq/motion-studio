// lib/videogen/spec.mjs — one AI clip request, backend-neutral. Slice 1 has one backend (the
// G-Labs Studio webhook) and one model (omni_flash). Modes map to G-Labs as MODES says.
// Reference images go as base64 data URLs: the BigFo runs kept identity better that way than
// with file paths. G-Labs takes at most 50 MB per request body.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { insideProject } from "../tools.mjs";
import { sha256File } from "../receipts.mjs";

export const MODES = { t2v: "text_to_video", start: "start_image", start_end: "start_end_image" };
export const SECONDS = [4, 6, 8, 10];
export const RESOLUTIONS = { "720p": ["720p"], "720p+1080p": ["720p", "1080p"], "360p": ["360p"] };
export const MAX_BODY = 50 * 1024 * 1024 - 64 * 1024;
const ASPECTS = ["16:9", "9:16"];
const REF_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const ROLES = { t2v: [], start: ["start"], start_end: ["start", "end"] };

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sha = (s) => createHash("sha256").update(s).digest("hex");

// The shortest clip length that covers d seconds (10 s at most).
export const pickSeconds = (d) => SECONDS.find((s) => s >= Number(d) - 0.01) ?? 10;

export function normalizeSpec(dir, { shot, prompt, mode, aspect, seconds, resolution, refs } = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 2000) throw bad("prompt: cần 1–2000 ký tự");
  const list = refs == null ? [] : refs;
  if (!Array.isArray(list)) throw bad("refs: cần một mảng đường dẫn");
  const m = mode ?? (list.length === 2 ? "start_end" : list.length === 1 ? "start" : "t2v");
  if (!Object.hasOwn(MODES, m)) throw bad(`mode: chỉ nhận ${Object.keys(MODES).join(", ")}`);
  const a = aspect ?? "16:9";
  if (!ASPECTS.includes(a)) throw bad(`aspect: chỉ nhận ${ASPECTS.join(", ")}`);
  const sec = Number(seconds);
  if (!SECONDS.includes(sec)) throw bad(`seconds: chỉ nhận ${SECONDS.join(", ")}`);
  const res = resolution ?? "720p";
  if (!Object.hasOwn(RESOLUTIONS, res)) throw bad(`resolution: chỉ nhận ${Object.keys(RESOLUTIONS).join(", ")}`);
  if (res === "360p" && m !== "t2v") throw bad("360p chỉ dùng được với kiểu Chỉ chữ (t2v)");
  if (list.length !== ROLES[m].length) throw bad(`refs: kiểu ${m} cần đúng ${ROLES[m].length} ảnh`);
  list.forEach((rel, i) => {
    insideProject(dir, rel, `refs[${i}]`, { mustExist: true });
    if (!REF_EXT[extname(rel).toLowerCase()]) throw bad(`refs[${i}]: chỉ nhận ảnh ${Object.keys(REF_EXT).join(", ")}`);
  });
  return { v: 1, backend: "glabs", model: "omni_flash", mode: m, prompt: prompt.trim(), aspect: a, seconds: sec, resolution: RESOLUTIONS[res], resolution_key: res,
    refs: list.map((rel, i) => ({ role: ROLES[m][i], path: rel })), audio: "mute", shot };
}

// The same request with the same reference files gives the same digest.
export async function specDigest(dir, spec) {
  let s = sha(JSON.stringify(spec));
  for (const r of spec.refs ?? []) s += await sha256File(join(dir, r.path));
  return sha(s);
}

export function toGlabsBody(dir, spec) {
  const reference_images = (spec.refs ?? []).map((r) => `data:${REF_EXT[extname(r.path).toLowerCase()]};base64,${readFileSync(join(dir, r.path)).toString("base64")}`);
  const body = { prompt: spec.prompt, model: "omni_flash", mode: MODES[spec.mode], aspect_ratio: spec.aspect, video_length: spec.seconds, resolution: spec.resolution, reference_images, remove_logo: true };
  if (JSON.stringify(body).length > MAX_BODY) throw bad("ảnh tham chiếu quá lớn (tối đa 50 MB cả yêu cầu)", 413);
  return body;
}
