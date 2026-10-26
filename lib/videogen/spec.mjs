// lib/videogen/spec.mjs — one AI image or clip request for a shot, made through gflow-cli
// (lib/videogen/gflow.mjs). Video modes: t2v, start (i2v first frame), start_end (i2v first and
// last frame). Image modes: t2i, i2i (one reference image). Reference images must be inside the
// project. `--resolution` exists for omni-flash only: gflow stops before sending (exit 11) for any
// other model, so the spec carries it for omni-flash and null otherwise.
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { insideProject } from "../tools.mjs";
import { sha256File } from "../receipts.mjs";

export const KINDS = ["video", "image"];
export const SECONDS = [4, 6, 8, 10];
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, IMAGE_ASPECTS, IMAGE_MODELS, RESOLUTIONS, VIDEO_ASPECTS, VIDEO_MODELS } from "./models.mjs";

export { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, IMAGE_ASPECTS, IMAGE_MODELS, RESOLUTIONS, VIDEO_ASPECTS, VIDEO_MODELS };
const REF_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const ROLES = { t2v: [], start: ["start"], start_end: ["start", "end"], t2i: [], i2i: ["ref"] };
const MODES = { video: ["t2v", "start", "start_end"], image: ["t2i", "i2i"] };

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sha = (s) => createHash("sha256").update(s).digest("hex");
const oneOf = (v, list, name) => { if (!list.includes(v)) throw bad(`${name}: chỉ nhận ${list.join(", ")}`); return v; };

// The shortest clip length that covers d seconds (10 s at most).
export const pickSeconds = (d) => SECONDS.find((s) => s >= Number(d) - 0.01) ?? 10;

export function normalizeSpec(dir, { kind = "video", shot, prompt, mode, model, aspect, seconds, resolution, refs } = {}, defaults = {}) {
  oneOf(kind, KINDS, "kind");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 2000) throw bad("prompt: cần 1–2000 ký tự");
  if (prompt.includes("\0")) throw bad("prompt: có ký tự không hợp lệ");
  const list = refs == null ? [] : refs;
  if (!Array.isArray(list)) throw bad("refs: cần một mảng đường dẫn");
  const video = kind === "video";
  const m = mode ?? (video ? (list.length === 2 ? "start_end" : list.length === 1 ? "start" : "t2v") : (list.length ? "i2i" : "t2i"));
  oneOf(m, MODES[kind], "mode");
  if (list.length !== ROLES[m].length) throw bad(`refs: kiểu ${m} cần đúng ${ROLES[m].length} ảnh`);
  list.forEach((rel, i) => {
    insideProject(dir, rel, `refs[${i}]`, { mustExist: true });
    if (!REF_EXT.includes(extname(rel).toLowerCase())) throw bad(`refs[${i}]: chỉ nhận ảnh ${REF_EXT.join(", ")}`);
  });
  const out = { v: 2, backend: "gflow", kind, mode: m, prompt: prompt.trim(), refs: list.map((rel, i) => ({ role: ROLES[m][i], path: rel })), shot };
  if (!video) {
    out.model = oneOf(model ?? defaults.image_model ?? DEFAULT_IMAGE_MODEL, IMAGE_MODELS, "model");
    out.aspect = oneOf(aspect ?? "16:9", IMAGE_ASPECTS, "aspect");
    return out;
  }
  out.model = oneOf(model ?? defaults.model ?? DEFAULT_VIDEO_MODEL, VIDEO_MODELS, "model");
  out.aspect = oneOf(aspect ?? "16:9", VIDEO_ASPECTS, "aspect");
  const sec = Number(seconds);
  if (!SECONDS.includes(sec)) throw bad(`seconds: chỉ nhận ${SECONDS.join(", ")}`);
  if (sec === 10 && out.model !== "omni-flash") throw bad("10 s chỉ có với omni-flash");
  out.seconds = sec;
  if (out.model === "omni-flash") out.resolution = oneOf(resolution ?? "720p", RESOLUTIONS, "resolution");
  else if (resolution != null) throw bad("resolution: chỉ omni-flash chọn được chất lượng");
  else out.resolution = null;
  return out;
}

// The same request with the same reference files gives the same digest.
export async function specDigest(dir, spec) {
  let s = sha(JSON.stringify(spec));
  for (const r of spec.refs ?? []) s += await sha256File(join(dir, r.path));
  return sha(s);
}
