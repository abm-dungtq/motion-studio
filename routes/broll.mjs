// routes/broll.mjs — the B-roll index over HTTP (lib/broll/). Only suggest and apply need a provider.
//   GET  /api/broll/search?q=&kind=&min_dur=&limit=  → { items: [hit] } (q ≤ 200 characters)
//   GET  /api/broll/clip?sha=                        → one clip: meta, shots, captions, speech
//   GET  /api/broll/thumb?sha=&f=s<i>-<k>.jpg        → a keyframe JPEG
//   GET  /api/broll/plan?name=&scope=                → before a run: files, new files, shots
//                                                     without caption and the vision calls they cost
//   POST /api/broll/index { name?, scope, vision?, max_calls? } → starts the "broll" job (one on
//                                                     this machine at a time), owned by the project
//                                                     or "_workspace"; its last line is RESULT <json>
//   GET  /api/broll/job                              → the last broll job
//   GET  /api/broll/suggest?name=&shot=              → B-roll for a shot (top 5)
//   POST /api/broll/apply { name, shot, base, sha256, start, end } → cut into assets/broll/ and
//                                                     set_shot assets through the gateway
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, startJob } from "../jobs.mjs";
import { applyBroll } from "../lib/broll/apply.mjs";
import { clipDir, peekHash, SHA_RE } from "../lib/broll/hash.mjs";
import { packPending, readClip, settings, sources } from "../lib/broll/index.mjs";
import { loadIndex, search } from "../lib/broll/search.mjs";
import { suggest } from "../lib/broll/suggest.mjs";

const INDEX = fileURLToPath(new URL("../lib/broll/index.mjs", import.meta.url));
export const WORKSPACE_OWNER = "_workspace";
const THUMB = /^s\d+-\d\.jpg$/;
const SCOPES = new Set(["project", "workspace"]);
let lastJob = null;

const bad = (status, msg) => Object.assign(new Error(msg), { status });
const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

// The project folder of an optional name: null when no name, else { dir } or throws.
function optionalProject(c, name) {
  if (name == null || name === "") return null;
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  return pd.dir;
}

export function planOf({ root, dir, scope, env = process.env }) {
  const list = sources({ root, dir, scope });
  const shas = [], fresh = [];
  for (const p of list) {
    const sha = peekHash(p, { env });
    if (sha && readClip(sha, env)?.scenes?.length) { if (!shas.includes(sha)) shas.push(sha); } else fresh.push(p);
  }
  const pend = packPending(shas, { env });
  return { files: list.length, clips: shas.length, new_files: fresh.length, shots_pending: pend.shots, sheets: pend.sheets.length, calls: pend.calls, settings: settings(env) };
}

export const ROUTES = [
  {
    method: "GET", path: "/api/broll/search", provider: false,
    handler(c) {
      const q = String(c.q("q") ?? "");
      if (q.length > 200) throw bad(400, "q dài quá 200 ký tự");
      const min = num(c.q("min_dur"));
      if (Number.isNaN(min)) throw bad(400, "min_dur là số giây");
      const kind = c.q("kind") || null;
      return { items: search(loadIndex(), q, { kind, min_dur: min, limit: num(c.q("limit")) ?? 30 }) };
    },
  },
  {
    method: "GET", path: "/api/broll/clip", provider: false,
    handler(c) {
      const sha = String(c.q("sha") ?? "");
      if (!SHA_RE.test(sha)) throw bad(400, "sha phải là sha256 (64 ký tự hex)");
      const clip = readClip(sha);
      if (!clip) throw bad(404, "clip này chưa có trong chỉ mục");
      const { dir, ...rest } = clip;
      return { sha256: sha, ...rest, paths: (clip.meta.seen_paths ?? []).filter((p) => existsSync(p)) };
    },
  },
  {
    method: "GET", path: "/api/broll/thumb", provider: false,
    handler(c) {
      const sha = String(c.q("sha") ?? ""), f = String(c.q("f") ?? "");
      if (!SHA_RE.test(sha) || !THUMB.test(f)) throw bad(400, "sha hoặc f không hợp lệ");
      const file = join(clipDir(sha), "frames", f);
      if (!existsSync(file)) throw bad(404, "không có ảnh này");
      return c.send(200, readFileSync(file), { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" });
    },
  },
  {
    method: "GET", path: "/api/broll/plan", provider: false,
    handler(c) {
      const dir = optionalProject(c, c.q("name"));
      const scope = SCOPES.has(c.q("scope")) ? c.q("scope") : dir ? "project" : "workspace";
      if (scope === "project" && !dir) throw bad(400, "scope project cần name");
      return planOf({ root: c.root, dir, scope });
    },
  },
  {
    method: "POST", path: "/api/broll/index", provider: false,
    handler(c) {
      const b = c.body ?? {};
      const dir = optionalProject(c, b.name);
      const scope = SCOPES.has(b.scope) ? b.scope : dir ? "project" : "workspace";
      if (scope === "project" && !dir) throw bad(400, "scope project cần name");
      if (b.max_calls != null && !(Number.isInteger(b.max_calls) && b.max_calls >= 0)) throw bad(400, "max_calls là số nguyên ≥ 0");
      const prev = lastJob ? getJob(lastJob) : null;
      if (prev && (prev.status === "running" || prev.status === "cancelling")) return c.send(409, { error: "đang có một lượt phân tích B-roll chạy, chờ xong đã", job: prev });
      const arg = { root: c.root, dir: scope === "project" ? dir : null, scope, vision: b.vision !== false, ...(b.max_calls != null ? { max_calls: b.max_calls } : {}) };
      try {
        const job = startJob({ name: b.name ?? WORKSPACE_OWNER, kind: "broll", cmd: process.execPath, args: [INDEX, "run", JSON.stringify(arg)], cwd: dir ?? c.root, meta: { step: "broll", scope, vision: arg.vision } });
        lastJob = job.id;
        return { job };
      } catch (e) { return c.send(e.code === "BUSY" ? 409 : 500, { error: e.code === "BUSY" ? "đang có một lượt phân tích B-roll chạy" : e.message }); }
    },
  },
  { method: "GET", path: "/api/broll/job", provider: false, handler: () => ({ job: lastJob ? getJob(lastJob) : null }) },
  {
    method: "GET", path: "/api/broll/suggest",
    handler(c) {
      const pd = c.withManifest(c.q("name"));
      if (pd.error) return c.send(pd.status, { error: pd.error });
      const shot = String(c.q("shot") ?? "");
      if (!shot) throw bad(400, "cần shot");
      return suggest(loadIndex(), c.P.manifest.load(pd.dir), shot);
    },
  },
  {
    method: "POST", path: "/api/broll/apply",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw bad(400, "cần base (số)");
      if (typeof b.shot !== "string" || !b.shot) throw bad(400, "cần shot");
      if (!SHA_RE.test(String(b.sha256 ?? ""))) throw bad(400, "sha256 không hợp lệ");
      const m = c.P.manifest.load(pd.dir);
      if (!m?.capabilities?.editable) throw bad(423, "dự án chỉ xem, sửa qua đạo diễn");
      if (m.version !== b.base) throw bad(409, "đã có thay đổi mới, tải lại rồi thử lại");
      const r = await applyBroll(pd.dir, c.P.gateway, { shot: b.shot, base: b.base, sha256: b.sha256, start: b.start, end: b.end, manifest: m });
      if (r.unchanged) return { rel: r.rel, version: r.version, unchanged: true, receipt: r.receipt };
      const g = r.gateway;
      if (g.code) {
        const E = c.P.gateway.EXIT ?? {};
        const status = { [E.conflict]: 409, [E.viewOnly]: 423, [E.invalid]: 422, [E.busy]: 503, [E.usage]: 400 }[g.code] ?? 500;
        return c.send(status, { error: g.error, rel: r.rel });
      }
      return { rel: r.rel, version: g.version, receipt: r.receipt, gateway_receipt: g.receipt ?? null, warnings: g.warnings ?? [] };
    },
  },
];
