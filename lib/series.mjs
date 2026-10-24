// lib/series.mjs — series folders: a folder of shared cast, voices, backgrounds and tools that
// many episode projects use. The provider says which series a project belongs to and checks the
// folder's declaration file (P.series = { file, dirOf(projectDir), validate(obj) → [error] },
// null when the provider has no series); Studio only reads the declaration through here.
// See docs/series.md for the declaration and the path rules.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

// A character, role or tool id as the declaration's {char} and flag type `id` accept it.
export const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const NAME = /^[A-Za-z0-9._-]+$/;
const bad = (status, msg) => Object.assign(new Error(msg), { status });

const cache = new Map(); // declaration file → { mtimeMs, size, config }

// The series of a project: { dir (realpath), file, config }, or null when the project has none
// (or the provider knows no series). A declaration with errors, or a series folder inside the
// project, is a 400. The file is
// read again when its mtime or size changes.
export function seriesFor(P, projectDir) {
  if (!P?.series) return null;
  const found = P.series.dirOf(projectDir);
  if (!found) return null;
  const dir = realpathSync(found);
  // A series is shared by many episodes and sits beside them; one inside the project itself would
  // let whoever edits the project choose which tools Studio runs as "the series".
  const project = realpathSync(projectDir);
  if (dir === project || dir.startsWith(project + sep)) throw bad(400, `thư mục series ${found} nằm trong chính dự án; series phải ở ngoài dự án`);
  const file = join(dir, P.series.file);
  const st = statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return { dir, file, config: hit.config };
  let config;
  try { config = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw bad(400, `${file}: JSON hỏng (${e.message})`); }
  const errs = P.series.validate(config);
  if (errs.length) throw bad(400, `${file} có lỗi: ${errs.join("; ")}`);
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, config });
  return { dir, file, config };
}

const segmentsOk = (p) => p.split("/").every((s) => s !== "" && s !== "." && s !== "..");

// A declaration path (relative to the series folder) with {project}, {root}, {char}, {N} and {NN}
// filled from vars, as an absolute path. {project} and {root} are absolute folders and lead the
// path; {char} must be an id and {N} a positive integer ({NN} is it on two digits). '..' refused.
export function seriesPath(series, rel, vars = {}) {
  if (typeof rel !== "string" || !rel || rel.includes("\\") || !segmentsOk(rel)) throw bad(400, `đường "${rel}" không hợp lệ`);
  const n = vars.N ?? null;
  const value = (k) => {
    if (k === "project" || k === "root") {
      if (typeof vars[k] !== "string" || !isAbsolute(vars[k])) throw bad(400, `thiếu thư mục cho {${k}}`);
      return vars[k];
    }
    if (k === "char") {
      if (!ID.test(String(vars.char ?? ""))) throw bad(400, `cần id nhân vật (khớp ${ID}) cho {char}`);
      return vars.char;
    }
    if (k === "N" || k === "NN") {
      if (!Number.isInteger(n) || n < 1) throw bad(400, `cần số tập cho {${k}}`);
      return k === "NN" ? String(n).padStart(2, "0") : String(n);
    }
    throw bad(400, `không biết chỗ thay {${k}} trong "${rel}"`);
  };
  const out = rel.replace(/\{([A-Za-z]+)\}/g, (_, k) => value(k));
  return isAbsolute(out) ? resolve(out) : join(series.dir, out);
}

// Folder children of root, links to folders included (episodes kept beside their series).
function children(root) {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith(".") || !NAME.test(e.name)) continue;
    const d = join(root, e.name);
    try { if (statSync(d).isDirectory()) out.push({ name: e.name, dir: d }); } catch { /* broken link */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Every distinct series the projects under root belong to: [{ name, dir, projects }], or
// [{ dir, error, projects }] for a declaration with errors.
export function listSeries(P, root) {
  if (!P?.series) return [];
  const by = new Map();
  for (const { name, dir } of children(resolve(root))) {
    let s = null, error = null, key = null;
    try { s = seriesFor(P, dir); key = s?.dir ?? null; } catch (e) { error = e.message; key = P.series.dirOf(dir); }
    if (!key) continue;
    if (!by.has(key)) by.set(key, error ? { dir: key, error, projects: [] } : { name: s.config.name, dir: key, projects: [] });
    by.get(key).projects.push(name);
  }
  return [...by.values()];
}

// "ten@example.com" → "ten…@example.com": the page names the account without spelling it out.
export const maskAccount = (a) => {
  const [user, domain] = String(a ?? "").split("@");
  return domain ? `${user.slice(0, 3)}…@${domain}` : null;
};

const listIds = (dir) => {
  try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && ID.test(e.name)).map((e) => e.name).sort(); } catch { return []; }
};
const roleIds = (file) => {
  try {
    const r = JSON.parse(readFileSync(file, "utf8"));
    const ids = Array.isArray(r) ? r.map((x) => x?.id) : Object.keys(r ?? {});
    return ids.filter((x) => typeof x === "string");
  } catch { return []; }
};

// What the page and the director see of a series (no drive account in clear).
export function describeSeries(series) {
  const c = series.config;
  const at = (rel) => (rel ? seriesPath(series, rel) : null);
  return {
    name: c.name, dir: series.dir,
    characters: c.characters ? listIds(at(c.characters)) : [],
    roles: c.voices?.roles && existsSync(at(c.voices.roles)) ? roleIds(at(c.voices.roles)) : [],
    tools: Object.entries(c.tools).map(([name, t]) => ({ name, flags: t.flags ?? {}, positional: t.positional ?? null, timeout_s: t.timeout_s ?? null })),
    writable: Object.keys(c.writable ?? {}),
    image_styles: Object.keys(c.image_styles ?? {}),
    episode: c.episode ? { name: c.episode.name } : null,
    delivery_dir: c.delivery_dir ?? null,
    drive: c.drive ? { account: maskAccount(c.drive.account), folder: c.drive.folder } : null,
  };
}
