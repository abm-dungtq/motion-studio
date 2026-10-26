// lib/broll/apply.mjs — puts a B-roll part into a shot. A shot's assets only take paths inside the
// project (the provider's manifest check), so the part [start, end] is cut into
// <project>/assets/broll/<stem>-<start>-<end>.mp4 (libx264 crf 14, re-encoded so the cut is frame
// exact; an existing file is reused), a receipt is written, and set_shot assets goes through the
// provider's gateway as actor "human": a new version that Undo takes back. Studio does not edit the
// HTML; placing the clip in the scene is a request to the director (the UI sends it).
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { attachAsset } from "../attach.mjs";
import { writeReceipt } from "../receipts.mjs";
import { ffmpeg, tail } from "./ffmpeg.mjs";
import { readClip } from "./index.mjs";

const bad = (status, msg) => Object.assign(new Error(msg), { status });
const t2 = (x) => x.toFixed(2).replace(".", "_");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip";

export const cutArgs = (src, start, end, out) => ["-ss", String(start), "-to", String(end), "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];

// Cuts the part into the project. Returns { rel, file, reused, source }.
export async function cutInto(dir, { sha256, start, end, env = process.env }) {
  const c = readClip(sha256, env);
  if (!c?.meta?.probe) throw bad(404, "clip này chưa có trong chỉ mục");
  const src = (c.meta.seen_paths ?? []).find((p) => existsSync(p));
  if (!src) throw bad(404, "không còn file gốc của clip này trên máy");
  const dur = c.meta.probe.duration;
  const s = Number(start), e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || e > dur + 0.05) throw bad(400, `start/end phải trong 0–${dur.toFixed(2)} và start < end`);
  const rel = `assets/broll/${slug(basename(src, extname(src)))}-${t2(s)}-${t2(e)}.mp4`;
  const file = join(dir, rel);
  if (existsSync(file)) return { rel, file, reused: true, source: src };
  mkdirSync(join(dir, "assets", "broll"), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp.mp4`;
  const r = await ffmpeg(cutArgs(src, s, Math.min(e, dur), tmp), { timeout: 10 * 60000 });
  if (r.code !== 0) { rmSync(tmp, { force: true }); throw bad(500, `cắt đoạn: ${tail(r)}`); }
  renameSync(tmp, file);
  return { rel, file, reused: false, source: src };
}

// The whole "Đặt vào shot": cut, receipt, set_shot assets. gateway is P.gateway.
export async function applyBroll(dir, gateway, { shot, base, sha256, start, end, manifest, env = process.env, lockWaitMs = 300 }) {
  if (!(manifest?.shots ?? []).some((x) => x.id === shot)) throw bad(404, `không có shot ${shot}`);
  const started = new Date();
  const cut = await cutInto(dir, { sha256, start, end, env });
  let receipt = null;
  if (!cut.reused) receipt = (await writeReceipt(dir, { op: "broll-cut", actor: "human", tool: { name: "ffmpeg" }, params: { sha256, start: Number(start), end: Number(end), shot }, inputs: { source: basename(cut.source) }, outputs: [cut.file], started, ended: new Date() })).file;
  const a = attachAsset(dir, gateway, { shot, base, rel: cut.rel, manifest, lockWaitMs });
  return a.unchanged ? { ...a, receipt } : { rel: cut.rel, receipt, gateway: a.gateway };
}
