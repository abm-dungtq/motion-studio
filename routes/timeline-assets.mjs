// routes/timeline-assets.mjs — what the timeline's lanes and caches need from the project folder:
//   GET  /api/timeline/media?name=  → { render, files }
//        render: the newest renders/*.mp4 or demo/*.mp4 by mtime ({ path, mtime, size, stale }:
//        stale when older than project.json's last change) or null; files: { <rel>: { size,
//        mtime } } for every file project.json points at (voice, music, SFX, shot assets), the
//        keys of the browser's peak and thumbnail caches.
//   POST /api/timeline/asset { name, shot, base, path } → set_shot assets of the old list plus
//        the file. A file inside the project is used in place; one under the workspace's
//        footage/ or shared-assets/ is copied to assets/footage/ first (a taken name gets -2, -3…,
//        never overwritten), because project.json only takes paths inside the project. path is
//        checked by realpath, like media.mjs does, so a symlink cannot lead elsewhere.
import { constants as FS, copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { MEDIA_EXT } from "../media.mjs";

const RENDER_DIRS = ["renders", "demo"];
const LOCK_WAIT_MS = 300;
const fail = (status, error) => Object.assign(new Error(error), { status });
const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const inside = (p, base) => Boolean(base) && (p === base || p.startsWith(base + sep));
const posix = (p) => p.split(sep).join("/");

// The newest *.mp4 of renders/ and demo/ (top level), or null.
export function latestRender(dir) {
  let best = null;
  for (const sub of RENDER_DIRS) {
    const d = join(dir, sub);
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith(".") || extname(e.name).toLowerCase() !== ".mp4") continue;
      const st = statSync(join(d, e.name));
      if (st.size > 0 && (!best || st.mtimeMs > best.mtime)) best = { path: `${sub}/${e.name}`, mtime: Math.round(st.mtimeMs), size: st.size };
    }
  }
  return best;
}

// { size, mtime } of each file m points at that exists inside dir.
export function mediaStamps(dir, m) {
  const rels = new Set();
  for (const l of m?.lines ?? []) if (l.file) rels.add(l.file);
  for (const b of m?.music ?? []) if (b.file) rels.add(b.file);
  for (const e of m?.events ?? []) if (e.sound) rels.add(e.sound);
  for (const s of m?.shots ?? []) for (const a of s.assets ?? []) rels.add(a);
  const base = real(dir), out = {};
  for (const rel of rels) {
    if (typeof rel !== "string" || rel.startsWith("/") || rel.split("/").includes("..")) continue;
    const f = real(join(dir, rel));
    if (!f || !inside(f, base)) continue;
    const st = statSync(f);
    if (st.isFile()) out[rel] = { size: st.size, mtime: Math.round(st.mtimeMs) };
  }
  return out;
}

// Copies src into <dir>/assets/footage/ under a free name. Returns the project-relative path.
function copyFree(src, dir) {
  const dest = join(dir, "assets", "footage");
  mkdirSync(dest, { recursive: true });
  const file = basename(src), ext = extname(file), stem = file.slice(0, file.length - ext.length);
  for (let n = 1; n < 10000; n++) {
    const name = n === 1 ? file : `${stem}-${n}${ext}`;
    try { copyFileSync(src, join(dest, name), FS.COPYFILE_EXCL); return `assets/footage/${name}`; } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  throw fail(409, "quá nhiều file trùng tên trong assets/footage");
}

// The project-relative path for path: in place inside the project, else a copy from the
// workspace's footage/ or shared-assets/. Throws 400/403/404 like media.mjs.
export function assetPath(root, dir, path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0")) throw fail(400, "cần đường dẫn tuyệt đối của file");
  if (!existsSync(path)) throw fail(404, "không có file này");
  const f = real(path);
  if (!f || !statSync(f).isFile()) throw fail(400, "chỉ thêm được file thường");
  if (!MEDIA_EXT.includes(extname(f).toLowerCase())) throw fail(400, `đuôi file không hỗ trợ; dùng ${MEDIA_EXT.join(" ")}`);
  const project = real(dir);
  if (inside(f, project)) return { rel: posix(relative(project, f)), copied: false };
  const rootReal = real(root);
  const allowed = ["footage", "shared-assets"].map((s) => real(join(rootReal, s))).filter(Boolean);
  if (!allowed.some((b) => inside(f, b))) throw fail(403, "chỉ thêm được file trong dự án, footage/ hoặc shared-assets/ của workspace");
  return { rel: copyFree(f, dir), copied: true };
}

const statusOf = (EXIT) => ({ [EXIT.conflict]: 409, [EXIT.viewOnly]: 423, [EXIT.invalid]: 422, [EXIT.usage]: 400, [EXIT.busy]: 503 });

export const ROUTES = [
  {
    method: "GET", path: "/api/timeline/media",
    handler: (c) => {
      const pd = c.withManifest(c.q("name"));
      if (pd.error) throw fail(pd.status, pd.error);
      const m = c.P.manifest.load(pd.dir);
      const render = latestRender(pd.dir);
      const updated = Date.parse(m?.updated ?? "") || statSync(join(pd.dir, "project.json")).mtimeMs;
      return { render: render ? { ...render, stale: render.mtime < updated } : null, files: mediaStamps(pd.dir, m) };
    },
  },
  {
    method: "POST", path: "/api/timeline/asset",
    handler: (c) => {
      const b = c.body;
      const pd = c.withManifest(b.name);
      if (pd.error) throw fail(pd.status, pd.error);
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (phiên bản đang xem)");
      const m = c.P.manifest.load(pd.dir);
      const shot = m?.shots?.find((s) => s.id === b.shot);
      if (!shot) throw fail(404, `không có shot ${b.shot}`);
      if (m.version !== b.base) throw fail(409, "đã có thay đổi mới, tải lại rồi thả lại");
      const { rel, copied } = assetPath(c.root, pd.dir, b.path);
      const old = Array.isArray(shot.assets) ? shot.assets : [];
      if (old.includes(rel)) return { version: m.version, path: rel, copied, unchanged: true };
      const r = c.P.gateway.patch(pd.dir, { actor: "human", base: b.base, ops: [{ op: "set_shot", id: shot.id, field: "assets", value: [...old, rel] }], lockWaitMs: LOCK_WAIT_MS });
      if (r.code) throw fail(statusOf(c.P.gateway.EXIT)[r.code] ?? 500, r.error);
      return { version: r.version, path: rel, copied, receipt: r.receipt };
    },
  },
];
