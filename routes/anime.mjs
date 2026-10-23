// routes/anime.mjs — the anime motion-comic tab (lib/anime/*). Only the project folder is needed:
// none of these needs project.json or a provider.
//   GET  /api/anime/board?name=                  shot board (lib/anime/board.mjs)
//   GET  /api/anime/chars?name=                  character library
//   GET  /api/anime/manifest?name=               { exists, enabled, manifest, sha, final, backups }
//   GET  /api/anime/job?name=&id=                one anime / anime-build job with its whole log
//   POST /api/anime/chars {name, char}           add or replace a character
//                         {name, remove: id}     drop one (its sheet PNG stays)
//                         {name, generate: {id, description?, refs?, agent?}}
//                                                "anime" job: a four-view sheet through the registry
//   POST /api/anime/variant {name, shot, base, chars?, change, out_name, kind?, sim?, blend?, width?, spill?, edge?, agent?}
//                                                "anime" job: pose variant, keyed, with receipt
//   POST /api/anime/manifest {name, base_sha, manifest, confirm?, rebuild?}
//                                                validate, back up, write; then the "anime-build"
//                                                job unless rebuild is false. 409 on a stale
//                                                base_sha, 428 without confirm when renders/ has a
//                                                final video
//   POST /api/anime/enable {name}                copy the flip-book templates into assets/anim/
//   POST /api/anime/rebuild {name, confirm?}     "anime-build" job: node assets/anim/build.mjs
// One job of each kind per project at a time (409 while one runs).
import { fileURLToPath } from "node:url";
import { getJob, jobLog } from "../jobs.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { board } from "../lib/anime/board.mjs";
import { listChars, normalizeChar, removeChar, saveChar } from "../lib/anime/chars.mjs";
import { buildArgs, enable, finalRenders, isEnabled, listBackups, readManifest, warningsOf, writeManifest } from "../lib/anime/manifest.mjs";
import { planSheet, planVariant } from "../lib/anime/variant.mjs";

const VARIANT = fileURLToPath(new URL("../lib/anime/variant.mjs", import.meta.url));
const ACTORS = new Set(["human", "director", "tool", "studio"]);
const KINDS = new Set(["anime", "anime-build"]);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const dirOf = (c, name) => {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.error, pd.status);
  return pd.dir;
};

const busy = (e) => (e.code === "BUSY" ? bad(e.message.includes("anime-build") ? "đang build hoạt hình, chờ xong đã" : "dự án đang sinh một ảnh anime khác, chờ xong đã", 409) : e);

function needConfirm(dir, confirm) {
  const final = finalRenders(dir);
  if (final.length && confirm !== true) throw Object.assign(bad(`dự án đã có bản final (${final.join(", ")}): xác nhận trước khi sửa hoạt hình`, 428), { final });
}

function startBuild(c, name, dir) {
  if (!isEnabled(dir)) throw bad("dự án chưa có assets/anim/build.mjs: bấm Bật hệ lật ảnh trước", 404);
  try {
    return c.startJob({ name, kind: "anime-build", cmd: process.execPath, args: buildArgs(dir), cwd: dir, meta: { step: "anime-build" }, onLine: (l) => redact(l) });
  } catch (e) { throw busy(e); }
}

function startAnime(c, name, dir, cmd, arg, meta) {
  try {
    return c.startJob({ name, kind: "anime", cmd: process.execPath, args: [VARIANT, cmd, JSON.stringify({ dir, ...arg })], cwd: dir, meta, onLine: (l) => redact(l) });
  } catch (e) { throw busy(e); }
}

const actorOf = (b) => (ACTORS.has(b.actor) ? b.actor : "human");

export const ROUTES = [
  { method: "GET", path: "/api/anime/board", provider: false, handler: (c) => board(dirOf(c, c.q("name"))) },
  { method: "GET", path: "/api/anime/chars", provider: false, handler: (c) => ({ chars: listChars(dirOf(c, c.q("name"))) }) },
  {
    method: "GET", path: "/api/anime/manifest", provider: false,
    handler(c) {
      const dir = dirOf(c, c.q("name"));
      const m = readManifest(dir);
      return { exists: Boolean(m), enabled: isEnabled(dir), manifest: m?.manifest ?? null, sha: m?.sha ?? null, final: finalRenders(dir), backups: listBackups(dir) };
    },
  },
  {
    method: "GET", path: "/api/anime/job", provider: false,
    handler(c) {
      const name = c.q("name");
      dirOf(c, name);
      const job = getJob(String(c.q("id") ?? ""));
      if (!job || job.name !== name || !KINDS.has(job.kind)) throw bad("không có job này", 404);
      const log = jobLog(job.id) ?? [];
      return { job, log, warnings: job.kind === "anime-build" ? warningsOf(log) : [] };
    },
  },
  {
    method: "POST", path: "/api/anime/chars", provider: false,
    handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      if (b.generate) {
        const g = b.generate;
        const arg = { id: String(g.id ?? ""), description: typeof g.description === "string" ? g.description : "", refs: Array.isArray(g.refs) ? g.refs : [], agent: typeof g.agent === "string" ? g.agent : null, actor: actorOf(b) };
        planSheet(dir, arg);
        return { job: startAnime(c, b.name, dir, "sheet", arg, { step: "anime-sheet", char: arg.id }) };
      }
      if (typeof b.remove === "string") return { removed: removeChar(dir, b.remove), chars: listChars(dir) };
      normalizeChar(b.char);
      return { char: saveChar(dir, b.char), chars: listChars(dir) };
    },
  },
  {
    method: "POST", path: "/api/anime/variant", provider: false,
    handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      const { name, ...rest } = b;
      const arg = { ...rest, agent: typeof b.agent === "string" ? b.agent : null, actor: actorOf(b) };
      const plan = planVariant(dir, arg);
      return { job: startAnime(c, name, dir, "variant", arg, { step: "anime-variant", shot: plan.shot, output: plan.outName }) };
    },
  },
  {
    method: "POST", path: "/api/anime/manifest", provider: false,
    handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      needConfirm(dir, b.confirm);
      try {
        const w = writeManifest(dir, b.manifest, { baseSha: typeof b.base_sha === "string" ? b.base_sha : null });
        const job = b.rebuild === false || !isEnabled(dir) ? null : startBuild(c, b.name, dir);
        return { ...w, job };
      } catch (e) {
        if (e.status === 409 || e.status === 400) return c.send(e.status, { error: e.message, sha: e.sha, errors: e.errors });
        throw e;
      }
    },
  },
  {
    method: "POST", path: "/api/anime/enable", provider: false,
    handler(c) { return enable(dirOf(c, c.body?.name)); },
  },
  {
    method: "POST", path: "/api/anime/rebuild", provider: false,
    handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      needConfirm(dir, b.confirm);
      return { job: startBuild(c, b.name, dir) };
    },
  },
];
