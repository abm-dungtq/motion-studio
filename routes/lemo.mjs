// routes/lemo.mjs — code-made film styles (lemo-opuscar, github.com/lemomo-ai/lemo-opuscar; code
// MIT, frames and films CC BY 4.0 by LemoLab): the gallery, applying a style, own styles.
//   GET  /api/lemo/styles?q=&group=&name=   library + own styles (lib/lemo/catalog.mjs), works
//        without a provider (then no style is a canvas layer); { fetched: false } until the
//        library is downloaded
//   GET  /api/lemo/frame/<slug>.jpg, /api/lemo/frame/mine/<slug>.jpg   a style's frame: the slug
//        matches SLUG, the realpath stays in the library cache or the own-styles folder, the file
//        starts like a JPEG (else 403 / 404 / 415)
//   GET  /api/lemo/guide?slug=&source=      STYLE.md as plain text
//   GET  /api/lemo/project?name=            the style applied to the project (.opus/lemo.json),
//        canvas-layer files, scene file, vertical frame, and the draft in lemo-style/
//   POST /api/lemo/fetch                    job "lemo-fetch" (owner LEMO_OWNER): lib/lemo/fetch.mjs
//   POST /api/lemo/apply { name, slug, mode: layer | grammar | markers, shot?, source?, replace? }
//        layer: only a style the provider's lemo command lists as verified; runs `lemo add` as the
//        project's "lemo" job (exit 4 → `lemo fetch`, then add once more; 5 → 409 code exists,
//        unless replace: remove first; 3 → 422 code markers), then sets lemo_style: in BRIEF.md
//        and queues a request for the director. grammar: BRIEF.md is not touched; the request
//        points the director at the style's STYLE.md. markers: queues the request that inserts the
//        four empty markers. One apply per project at a time (409 code busy).
//   POST /api/lemo/draft { name, base?, source?, title?, description? }   queues "make my own style"
//   POST /api/lemo/keep { name }            copies lemo-style/ to the own-styles folder (only the
//        user's click; lib/lemo/my-styles.mjs)
// The downloaded library is data: Studio never runs or imports a file of it.
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, running, startJob } from "../jobs.mjs";
import { KIND as DIRECTOR, pump, runnerSetting } from "../director.mjs";
import { setFrontmatter } from "../create.mjs";
import { PIN, cacheHome, readyDir } from "../lib/lemo/fetch.mjs";
import { findStyle, groupsOf, layerSlugs, libraryStyles, merge, myStyles, myStylesDir, search, SLUG } from "../lib/lemo/catalog.mjs";
import { DRAFT, keepStyle } from "../lib/lemo/my-styles.mjs";
import { draftStyle, grammarProject, grammarShot, insertMarkers, layerScene } from "../lib/lemo/requests.mjs";

const FETCH = fileURLToPath(new URL("../lib/lemo/fetch.mjs", import.meta.url));
// Not a valid project name, so the library download never meets a project's jobs.
export const LEMO_OWNER = "(lemo)";
export const CREDIT = { text: "Ảnh và phim mẫu: LemoLab, CC BY 4.0", url: PIN.web, license: "CC BY 4.0", code_license: "MIT" };
const SHOT = /^[A-Za-z0-9_-]{1,40}$/;
const MODES = ["layer", "grammar", "markers"];
const FRAME_MAX = 8 << 20;
const GUIDE_MAX = 200 << 10;
const busy = new Set(); // project names with an apply or keep in flight
let lastFetch = null; // job id

const err = (status, error, extra = {}) => Object.assign(new Error(error), { status, ...extra });
const answer = (c, e) => c.send(e.status ?? 500, { error: e.message, ...(e.code && typeof e.code === "string" ? { code: e.code } : {}) });

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

const lemoFile = (dir) => join(dir, ".opus", "lemo.json");
export function readLemo(dir) {
  try { const j = JSON.parse(readFileSync(lemoFile(dir), "utf8")); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}
function saveLemo(dir, j) {
  mkdirSync(join(dir, ".opus"), { recursive: true });
  writeAtomic(lemoFile(dir), JSON.stringify(j, null, 2) + "\n");
}

// Own styles first, then the library, with the provider's canvas-layer styles marked.
async function catalog(P) {
  const lib = libraryStyles();
  const mine = myStyles();
  const layers = P ? await layerSlugs(P) : { available: false, styles: {} };
  return { lib, mine, layers, rows: merge(mine.rows, lib.rows, layers) };
}

// Width and height of the composition root in index.html, or null.
function frameSize(dir) {
  let html;
  try { html = readFileSync(join(dir, "index.html"), "utf8"); } catch { return null; }
  const tag = html.match(/<div[^>]*\bid="root"[^>]*>/)?.[0] ?? "";
  const w = Number(tag.match(/data-width="(\d+)"/)?.[1]), hgt = Number(tag.match(/data-height="(\d+)"/)?.[1]);
  return w && hgt ? { width: w, height: hgt } : null;
}

const smallText = (f, max) => { try { const st = lstatSync(f); return st.isFile() && st.size <= max ? readFileSync(f, "utf8") : null; } catch { return null; } };

export function projectState(dir) {
  const size = frameSize(dir);
  const lemoDir = join(dir, "assets", "lemo");
  const draftDir = join(dir, DRAFT);
  let draft = null;
  const sj = smallText(join(draftDir, "style.json"), 64 << 10);
  if (sj != null) {
    let style = null;
    try { const raw = JSON.parse(sj); style = { slug: String(raw.slug ?? ""), en: String(raw.en ?? ""), cn: String(raw.cn ?? ""), based_on: raw.based_on ? String(raw.based_on) : null, line: String(raw.line ?? "").slice(0, 400) }; } catch { style = null; }
    const frame = ["styleframe.jpg", "styleframe-vs-base.jpg", "test.jpg"].find((f) => existsSync(join(draftDir, f)));
    draft = { style, valid: Boolean(style), frame: frame ? `${DRAFT}/${frame}` : null, changes: smallText(join(draftDir, "CHANGES.md"), 32 << 10), has_guide: existsSync(join(draftDir, "STYLE.md")) };
  }
  return {
    ...readLemo(dir),
    layer_files: existsSync(join(lemoDir, "CREDITS")),
    scene: ["scene.js", "scene3d.js"].find((f) => existsSync(join(lemoDir, f))) ?? null,
    size, vertical: size ? size.width < size.height : false,
    draft,
  };
}

// Queues a director request and starts the director when the runner is cli and it is idle.
function direct(c, name, dir, { scope, target = null, text }) {
  let request;
  try { request = c.P.requests.enqueue(dir, { scope, target, t: null, base: c.P.manifest.load(dir)?.version, text }); } catch (e) { throw err(400, e.message); }
  const runner = runnerSetting();
  if (runner === "mcp") return { request, runner, job: null };
  const job = running(name, DIRECTOR) ? null : pump(c.P, name, dir);
  return { request, runner, job };
}

// One child of the project's "lemo" job kind, awaited: { code, lines }.
const lemoJob = (name, cwd, args, meta) => new Promise((resolve, reject) => {
  const lines = [];
  try {
    startJob({ name, kind: "lemo", cmd: process.execPath, args, cwd, meta, onLine: (l) => { lines.push(l); return l; }, onExit: (j) => resolve({ code: j.code ?? (j.signal ? 1 : 0), lines }) });
  } catch (e) { reject(e.code === "BUSY" ? err(409, "dự án đang có việc phong cách khác chạy, chờ xong đã", { code: "busy" }) : e); }
});

function shotOf(c, dir, shot) {
  if (shot == null || shot === "") return null;
  if (typeof shot !== "string" || !SHOT.test(shot)) throw err(400, "shot không hợp lệ");
  const m = c.P?.manifest.load(dir);
  if (Array.isArray(m?.shots) && !m.shots.some((s) => s.id === shot)) throw err(400, `không có shot ${shot}`);
  return shot;
}

async function applyLayer(c, name, dir, { slug, shot, replace }) {
  const layers = await layerSlugs(c.P);
  if (!layers.available) throw err(422, "provider chưa có lệnh thêm lớp canvas; dùng cách áp theo ngữ pháp", { code: "no_layer" });
  const l = layers.styles[slug];
  if (!l) throw err(422, `${slug} chưa có lớp canvas đã kiểm; dùng cách áp theo ngữ pháp`, { code: "not_layer" });
  const cmd = c.P.commands.lemo;
  const add = () => lemoJob(name, dir, [cmd, "add", "--project", dir, "--style", slug], { step: "lemo-add", style: slug });
  if (replace) {
    const rm = await lemoJob(name, dir, [cmd, "remove", "--project", dir], { step: "lemo-remove" });
    if (rm.code) throw err(422, `gỡ lớp cũ lỗi (exit ${rm.code}): ${rm.lines.slice(-2).join(" ")}`, { code: "failed" });
  }
  let r = await add();
  if (r.code === 4) {
    const f = await lemoJob(name, dir, [cmd, "fetch"], { step: "lemo-fetch" });
    if (f.code) throw err(502, `tải engine lỗi (exit ${f.code}): ${f.lines.slice(-2).join(" ")}`, { code: "fetch_failed" });
    r = await add();
  }
  if (r.code === 5) throw err(409, "dự án đã có một lớp canvas; thay lớp cũ?", { code: "exists" });
  if (r.code === 3) throw err(422, "index.html thiếu dấu của lớp canvas; nhờ đạo diễn chèn dấu rồi áp lại", { code: "markers" });
  if (r.code) throw err(422, `thêm lớp lỗi (exit ${r.code}): ${r.lines.slice(-3).join(" ")}`, { code: "failed" });
  const brief = join(dir, "BRIEF.md");
  writeAtomic(brief, setFrontmatter(existsSync(brief) ? readFileSync(brief, "utf8") : "", { lemo_style: slug }));
  const next = r.lines.find((x) => /^next:/.test(x.trim()))?.trim() ?? null;
  return { kind: l.kind, next };
}

async function apply(c) {
  const b = c.body ?? {};
  const pd = c.withManifest(b.name);
  if (pd.error) return c.send(pd.status, { error: pd.error });
  const { dir } = pd, name = b.name;
  try {
    if (!MODES.includes(b.mode)) throw err(400, `mode là ${MODES.join(" | ")}`);
    if (typeof b.slug !== "string" || !SLUG.test(b.slug)) throw err(400, "slug không hợp lệ");
    const shot = shotOf(c, dir, b.shot);
    if (busy.has(name) || running(name, "lemo")) throw err(409, "dự án đang áp một phong cách, chờ xong đã", { code: "busy" });
    busy.add(name);
    try {
      const { rows } = await catalog(c.P);
      const source = b.source === "mine" || b.source === "library" ? b.source : null;
      const style = findStyle(rows, b.slug, source) ?? { slug: b.slug, ten: b.slug, source: "library" };
      const at = new Date().toISOString();
      const state = readLemo(dir);
      const record = (entry) => {
        if (shot) state.shots = { ...(state.shots ?? {}), [shot]: entry };
        else state.project = entry;
        saveLemo(dir, state);
      };
      if (b.mode === "markers") {
        return { ok: true, ...direct(c, name, dir, { scope: "project", text: insertMarkers({ slug: b.slug }) }) };
      }
      if (b.mode === "grammar") {
        const found = findStyle(rows, b.slug, source);
        if (!found) throw err(404, `không có phong cách ${b.slug}${rows.length ? "" : "; tải thư viện trước"}`);
        if (!found.guide) throw err(422, `${b.slug} không có STYLE.md`);
        record({ slug: found.slug, source: found.source, mode: "grammar", at });
        const text = shot ? grammarShot({ slug: found.slug, ten: found.ten, guide: found.guide, shot }) : grammarProject({ slug: found.slug, ten: found.ten, guide: found.guide });
        return { ok: true, lemo: readLemo(dir), ...direct(c, name, dir, { scope: shot ? "shot" : "project", target: shot, text }) };
      }
      const { kind, next } = await applyLayer(c, name, dir, { slug: b.slug, shot, replace: b.replace === true });
      state.layer = { slug: b.slug, kind, at };
      record({ slug: b.slug, source: "library", mode: "layer", at });
      const text = layerScene({ slug: b.slug, ten: style.ten, next, shot });
      return { ok: true, next, lemo: readLemo(dir), ...direct(c, name, dir, { scope: shot ? "shot" : "project", target: shot, text }) };
    } finally { busy.delete(name); }
  } catch (e) { return answer(c, e); }
}

function frame(c) {
  let rest = c.url.pathname.slice("/api/lemo/frame/".length);
  const mine = rest.startsWith("mine/");
  if (mine) rest = rest.slice("mine/".length);
  let file;
  try { file = decodeURIComponent(rest); } catch { return c.send(403, "không được phép"); }
  const slug = file.match(/^([a-z0-9][a-z0-9-]{0,60})\.jpg$/)?.[1];
  if (!slug) return c.send(403, "không được phép");
  let base, cands;
  if (mine) { base = myStylesDir(); cands = ["styleframe.jpg", "test.jpg"].map((f) => join(base, slug, f)); } else {
    const lib = readyDir(cacheHome(), PIN);
    if (!lib) return c.send(404, "chưa tải thư viện");
    base = join(lib, "docs", "frames"); cands = [join(base, `${slug}.jpg`)];
  }
  const f = cands.find((x) => existsSync(x));
  if (!f) return c.send(404, "không có ảnh");
  let real, root;
  try { real = realpathSync(f); root = realpathSync(base); } catch { return c.send(404, "không có ảnh"); }
  if (!real.startsWith(root + sep)) return c.send(403, "không được phép");
  const st = lstatSync(real);
  if (!st.isFile() || st.size > FRAME_MAX) return c.send(415, "không phải ảnh JPEG");
  const head = Buffer.alloc(3);
  const fd = openSync(real, "r");
  try { readSync(fd, head, 0, 3, 0); } finally { closeSync(fd); }
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return c.send(415, "không phải ảnh JPEG");
  return c.send(200, readFileSync(real), { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" });
}

export const ROUTES = [
  {
    method: "GET", path: "/api/lemo/styles", provider: false,
    async handler(c) {
      const { lib, mine, layers, rows } = await catalog(c.P);
      const q = String(c.q("q") ?? "").slice(0, 200), group = String(c.q("group") ?? "").slice(0, 80);
      const name = c.q("name");
      let project = null;
      if (name) { const pd = c.projectDir(name); if (!pd.error) project = projectState(pd.dir); }
      return {
        fetched: lib.fetched, sha: PIN.sha, total: rows.length, groups: groupsOf(rows), rows: search(rows, q, group),
        warnings: [...lib.warnings, ...mine.warnings], layer_available: layers.available, my_dir: mine.dir,
        fetch_job: lastFetch ? getJob(lastFetch) : null, project, credit: CREDIT,
      };
    },
  },
  { method: "GET", path: "/api/lemo/frame", prefix: true, provider: false, handler: frame },
  {
    method: "GET", path: "/api/lemo/guide", provider: false,
    async handler(c) {
      const slug = c.q("slug");
      if (typeof slug !== "string" || !SLUG.test(slug)) return c.send(400, { error: "slug không hợp lệ" });
      const { rows } = await catalog(null);
      const s = findStyle(rows, slug, ["mine", "library"].includes(c.q("source")) ? c.q("source") : null);
      if (!s?.guide) return c.send(404, { error: `không có STYLE.md của ${slug}` });
      const text = smallText(s.guide, GUIDE_MAX);
      if (text == null) return c.send(413, { error: "STYLE.md quá lớn" });
      return { slug, source: s.source, path: s.guide, text };
    },
  },
  {
    method: "GET", path: "/api/lemo/project", provider: false,
    handler(c) {
      const pd = c.projectDir(c.q("name"));
      if (pd.error) return c.send(pd.status, { error: pd.error });
      return projectState(pd.dir);
    },
  },
  {
    method: "POST", path: "/api/lemo/fetch", provider: false,
    handler(c) {
      if (readyDir(cacheHome(), PIN)) return { ok: true, fetched: true };
      try {
        const job = startJob({ name: LEMO_OWNER, kind: "lemo-fetch", cmd: process.execPath, args: [FETCH], cwd: process.cwd(), meta: { step: "lemo-fetch", sha: PIN.sha } });
        lastFetch = job.id;
        return { ok: true, fetched: false, job };
      } catch (e) { return c.send(e.code === "BUSY" ? 409 : 500, { error: e.code === "BUSY" ? "đang tải thư viện" : e.message }); }
    },
  },
  { method: "POST", path: "/api/lemo/apply", handler: apply },
  {
    method: "POST", path: "/api/lemo/draft",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      try {
        const lib = readyDir(cacheHome(), PIN);
        const myGuide = lib && join(lib, "MY-STYLES.md");
        if (!myGuide || !existsSync(myGuide)) throw err(409, "tải thư viện phong cách trước", { code: "not_fetched" });
        let base = null;
        if (b.base != null && b.base !== "") {
          if (typeof b.base !== "string" || !SLUG.test(b.base)) throw err(400, "base không hợp lệ");
          const { rows } = await catalog(null);
          base = findStyle(rows, b.base, ["mine", "library"].includes(b.source) ? b.source : null);
          if (!base?.guide) throw err(404, `không có phong cách ${b.base}`);
        }
        const text = draftStyle({ base, myGuide, title: typeof b.title === "string" ? b.title : "", description: typeof b.description === "string" ? b.description : "" });
        return { ok: true, ...direct(c, b.name, pd.dir, { scope: "project", text }) };
      } catch (e) { return answer(c, e); }
    },
  },
  {
    method: "POST", path: "/api/lemo/keep", provider: false,
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (busy.has(b.name)) return c.send(409, { error: "dự án đang áp một phong cách, chờ xong đã", code: "busy" });
      busy.add(b.name);
      try {
        const lib = libraryStyles();
        const librarySlugs = [...new Set([...PIN.slugs, ...lib.rows.map((r) => r.slug)])];
        const r = keepStyle({ projectDir: pd.dir, myDir: myStylesDir(), librarySlugs });
        return { ok: true, slug: r.slug, dir: r.dir, files: r.files, bytes: r.bytes };
      } catch (e) { return answer(c, e); } finally { busy.delete(b.name); }
    },
  },
];
