// server.mjs — Motion Studio HTTP server (node:http, Node built-ins only). Started by
// bin/motion-studio.mjs; createServer({ root, token }) is exported for tests (listen on port 0).
// The page: GET / reads ui/dist/index.html (the Vite build of ui/, made by npm run setup or by
// start when the sources are newer; 503 with what to run when it is missing) and injects the
// token; GET /assets/<file> serves the build's files. Static files, not API routes; createServer's
// ui option points at another build (tests).
// Every edit goes through the provider's command gateway (lib/provider.mjs) as actor "human".
// The provider loads lazily: without one the server still starts and serves the page, GET
// /api/status says why ({ ok: false, provider: null, error, hint }), and every route that needs
// it answers 503 with the same reason. Security:
// - bind 127.0.0.1 only (the caller listens); any Host other than 127.0.0.1:<port> or
//   localhost:<port> is 403 (DNS rebinding);
// - a POST with an Origin that is not this origin is 403; a POST without the X-Studio-Token of
//   this run is 403. GET / injects the token into the page, so the token keeps out web pages and
//   other users, not processes of the same user (those can read the page or studio.json anyway:
//   same-user processes are inside the trust boundary);
// - project names match ^[A-Za-z0-9._-]+$ (else 400); /p/<name>/<path> serves only files whose
//   realpath is inside the project, never .env, .git, .opus/lock or other dotfiles outside .opus/;
// - the server never reads the provider's .env or any API key file.
// Jobs (jobs.mjs): POST /api/director queues a request and, with runner cli, starts the
// director (director.mjs); POST /api/export runs the provider's render command, then the
// compress script (lib/config.mjs compressScript: $MOTION_STUDIO_COMPRESS, else
// <root>/scripts/compress-final.sh).
// Their start/log/exit events reach the page as SSE "job"; every job stops with the server.
// Writes wait at most LOCK_WAIT_MS for the project lock and answer 503 "đang bận" when busy, so
// one contended write never stalls SSE or the player.
// Front door: POST /api/projects/new runs <root>/scripts/new-project.sh (create.mjs);
// GET /api/media/browse lists home and /Volumes folders, POST /api/media/register adds a file to
// .opus/media.json (media.mjs); GET /api/agent reports claude/runner/ffmpeg/provider
// (agent.mjs); POST /api/director/answer answers a director card and writes the human gate
// (gates.mjs). POST /api/redo replays the last undo. GET /api/sounds lists project and
// <root>/shared-assets/sfx audio; POST /api/sounds/import copies a shared sound into assets/sfx/
// without overwriting. GET /api/gates runs check-preflight --stage final (one run per project at a
// time; the provider's preflight command). POST /api/bundle runs bundle.mjs (shots, stems, SRT, manifest for an NLE) as an export
// job. GET /api/library pages the Thư viện mẫu (lib/library.mjs); /library/thumb/<id> its cover images. createServer's run and mediaRoots options exist for tests.
// Extension routes: routes/*.mjs through lib/routes.mjs, tried after the built-in ones (BUILTIN);
// createServer's routes option (await loadRoutes(dir)) replaces them in tests.
import { createServer as httpServer } from "node:http";
import { constants as FS, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, createReadStream } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProvider, providerStatus, SETUP_COMMAND } from "./lib/provider.mjs";
import { compressScript, hfRuntime } from "./lib/config.mjs";
import { events as jobEvents, startJob, cancel as cancelJob, listJobs, running, stopAll } from "./jobs.mjs";
import { KIND as DIRECTOR, pump, runnerSetting } from "./director.mjs";
import { createProject, runFile } from "./create.mjs";
import { browse, register, readMedia, BROWSE_ROOTS, AUDIO_EXT } from "./media.mjs";
import { agentStatus } from "./agent.mjs";
import { answerCard } from "./gates.mjs";
import { query as libraryQuery, thumbFile } from "./lib/library.mjs";
import { checkRoutes, findRoute, loadRoutes } from "./lib/routes.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const UI_DIST = join(HERE, "ui", "dist");
const ASSET = /^[A-Za-z0-9._-]+$/;
const BUNDLE = join(HERE, "bundle.mjs");
const RATIO = /^\d+x\d+$/;
export const NAME = /^[A-Za-z0-9._-]+$/;
const LOCK_WAIT_MS = 300;
const BODY_MAX = 1 << 20;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};
const statusOf = (EXIT) => ({ [EXIT.conflict]: 409, [EXIT.viewOnly]: 423, [EXIT.invalid]: 422, [EXIT.nothingToUndo]: 422, [EXIT.nothingToRedo]: 422, [EXIT.busy]: 503, [EXIT.usage]: 400 });
// Routes that work without a provider; every other /api route answers 503 when there is none.
const FREE = new Set(["/api/projects", "/api/status", "/api/agent", "/api/media/browse", "/api/media", "/api/jobs", "/api/settings", "/api/files", "/api/sounds", "/api/library",
  "/api/directions", "/api/cases", "/api/styles", "/api/media/register", "/api/sounds/import", "/api/jobs/cancel"]);

// The transitions a directions file offers, as { id, kind }: seams is a list of { id, kind, … }
// (an older file had an object keyed by id). Ids in seam_classes.banned are left out.
export function transitionItems(d) {
  const banned = new Set(Array.isArray(d?.seam_classes?.banned) ? d.seam_classes.banned : []);
  const all = Array.isArray(d?.seams)
    ? d.seams.filter((s) => s && typeof s.id === "string").map((s) => ({ id: s.id, kind: s.kind ?? null }))
    : Object.entries(d?.seams ?? {}).map(([id, v]) => ({ id, kind: v?.kind ?? null }));
  return all.filter((s) => !banned.has(s.id));
}

// Every path route() answers itself (each `p === "…"` below; a test checks the two agree).
// Extension routes (lib/routes.mjs) may not reuse one.
export const BUILTIN = ["/", "/index.html", "/hf/runtime.js",
  "/api/projects", "/api/status", "/api/project", "/api/log", "/api/requests", "/api/agent", "/api/media/browse", "/api/media", "/api/jobs",
  "/api/settings", "/api/files", "/api/sounds", "/api/gates", "/api/directions", "/api/library", "/api/cases", "/api/styles", "/api/events",
  "/api/import", "/api/patch", "/api/undo", "/api/redo", "/api/director", "/api/projects/new", "/api/media/register", "/api/sounds/import",
  "/api/director/answer", "/api/director/cancel", "/api/jobs/cancel", "/api/export", "/api/bundle"];
// The routes/*.mjs of this checkout; createServer({ routes }) replaces them (tests).
const DEFAULT_ROUTES = await loadRoutes();

// The provider, or null with the reason the API reports (503 body, /api/status).
async function current() {
  try { return { p: await loadProvider() }; } catch (e) {
    return { p: null, why: { error: `Chưa có provider: ${e.message}`, code: e.code ?? "NO_PROVIDER", hint: e.hint ?? null, setup: SETUP_COMMAND, provider: null } };
  }
}

// The HyperFrames runtime (PLAYER.md): $MOTION_STUDIO_HF_RUNTIME, the project's own install, then
// the global npm root and the usual global prefixes.
let npmRoot;
export function findRuntime(projectDir) {
  const nm = "node_" + "modules";
  const rel = join("hyperframes", "dist", "hyperframe.runtime.iife.js");
  if (npmRoot === undefined) {
    try { npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); } catch { npmRoot = null; }
  }
  const cands = [hfRuntime(), projectDir && join(projectDir, nm, rel), npmRoot && join(npmRoot, rel),
    ...["/opt/homebrew/lib", "/usr/local/lib", "/usr/lib"].map((d) => join(d, nm, rel))];
  return cands.find((c) => c && existsSync(c)) ?? null;
}

// Runs a provider command (an absolute .mjs path) with node.
const run = (file, args) => new Promise((res) => {
  execFile(process.execPath, [file, ...args], { encoding: "utf8", timeout: 60000, maxBuffer: 32 << 20 }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout, stderr, killed: Boolean(err?.killed) }));
});

// p null (no provider): projects with project.json are listed, none editable.
function projectsOf(root, p) {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".") || !NAME.test(e.name)) continue;
    const dir = join(root, e.name);
    if (existsSync(join(dir, "project.json"))) {
      let m = null;
      try { m = p?.manifest.load(dir) ?? null; } catch { /* broken manifest: listed, not editable */ }
      out.push({ name: e.name, title: m?.title ?? e.name, has_manifest: true, editable: Boolean(m?.capabilities?.editable), version: m?.version ?? null });
    } else if (existsSync(join(dir, "index.html")) && existsSync(join(dir, "BRIEF.md"))) {
      out.push({ name: e.name, title: e.name, has_manifest: false, editable: false, version: null });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// /p/<name>/<rel>: a file inside the project, or a reason it is refused.
export function projectFile(projectDir, rel) {
  const parts = rel.split("/").filter((p) => p !== "");
  if (!parts.length) parts.push("index.html");
  if (parts.some((p) => p === ".." || p === ".")) return { status: 403 };
  const dot = parts.findIndex((p) => p.startsWith("."));
  if (dot >= 0 && !(dot === 0 && parts[0] === ".opus" && parts.slice(1).every((p) => !p.startsWith(".")) && parts.length > 1 && parts[1] !== "lock")) return { status: 403 };
  if (parts.some((p) => p === ".env" || p === ".git")) return { status: 403 };
  const f = join(projectDir, ...parts);
  if (!existsSync(f)) return { status: 404 };
  let real;
  try { real = realpathSync(f); } catch { return { status: 404 }; }
  const base = realpathSync(projectDir);
  if (real !== base && !real.startsWith(base + sep)) return { status: 403 };
  if (statSync(real).isDirectory()) return { status: 404 };
  return { file: real, parts };
}

export function createServer({ root, token, runtime = undefined, run: runCmd = runFile, mediaRoots = BROWSE_ROOTS, routes = DEFAULT_ROUTES, ui = UI_DIST }) {
  root = realpathSync(resolve(root));
  const ext = checkRoutes(routes, BUILTIN);
  const runtimeFor = (dir) => (runtime === undefined ? findRuntime(dir) : runtime);
  const watchers = new Map(); // name → { clients:Set, close() }
  let port = 0;

  const send = (res, status, body, headers = {}) => {
    const isStr = typeof body === "string" || Buffer.isBuffer(body);
    res.writeHead(status, { "content-type": isStr ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "no-store", ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  };
  const projectDir = (name) => {
    if (typeof name !== "string" || !NAME.test(name) || name === "." || name === "..") return { status: 400, error: "tên dự án không hợp lệ" };
    const dir = join(root, name);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return { status: 404, error: `không có dự án ${name}` };
    return { dir };
  };
  const withManifest = (name) => {
    const p = projectDir(name);
    if (p.error) return p;
    if (!existsSync(join(p.dir, "project.json"))) return { status: 404, error: `${name} chưa có project.json — bấm Nhập dự án` };
    return p;
  };
  const body = (req) => new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > BODY_MAX) { rej(Object.assign(new Error("body quá lớn"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { rej(Object.assign(new Error("JSON không hợp lệ"), { status: 400 })); } });
    req.on("error", rej);
  });
  const gatewayReply = (res, P, r) => (r.code ? send(res, statusOf(P.gateway.EXIT)[r.code] ?? 500, { error: r.error }) : send(res, 200, { version: r.version, receipt: r.receipt, lines: r.lines ?? [], warnings: r.warnings ?? [] }));

  function serveFile(req, res, file, { inject = null } = {}) {
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    if (inject) {
      const html = readFileSync(file, "utf8");
      const out = html.includes("</body>") ? html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${inject}</body>`) : html + inject;
      return send(res, 200, out, { "content-type": type });
    }
    const size = statSync(file).size;
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    const head = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "no-store" };
    if (range && (range[1] || range[2])) {
      let a = range[1] ? Number(range[1]) : size - Number(range[2]);
      let b = range[1] && range[2] ? Number(range[2]) : size - 1;
      a = Math.max(0, a); b = Math.min(size - 1, b);
      if (a > b) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...head, "content-range": `bytes ${a}-${b}/${size}`, "content-length": b - a + 1 });
      return createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...head, "content-length": size });
    createReadStream(file).pipe(res);
  }

  // SSE: one directory watcher pair per project, filtered by file name, debounced 100 ms.
  function subscribe(P, name, dir, res) {
    let w = watchers.get(name);
    if (!w) {
      const clients = new Set();
      const timers = {};
      const emit = (event, data) => { for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const later = (event, fn) => { clearTimeout(timers[event]); timers[event] = setTimeout(() => { try { emit(event, fn()); } catch { /* mid-write; next event follows */ } }, 100); };
      const fsw = [];
      try { fsw.push(watch(dir, (_, f) => { if (f === "project.json") later("manifest", () => P.manifest.load(dir)); })); } catch { /* unwatchable */ }
      const opus = join(dir, ".opus");
      const watchOpus = () => {
        try { fsw.push(watch(opus, { recursive: true }, (_, f) => { const p = String(f ?? "").split(sep).join("/"); if (p.startsWith("requests/") && p.endsWith(".json")) later("request", () => P.requests.list(dir)); })); return true; } catch { return false; }
      };
      if (!(existsSync(opus) && watchOpus())) {
        // .opus appears with the first gateway write or request: start watching it then.
        const t = setInterval(() => { if (existsSync(opus) && watchOpus()) clearInterval(t); }, 1000);
        fsw.push({ close: () => clearInterval(t) });
      }
      const ping = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 25000);
      const onJob = (e) => { if (e.job.name === name) emit("job", e); };
      jobEvents.on("job", onJob);
      w = { clients, close: () => { clearInterval(ping); jobEvents.off("job", onJob); for (const t of Object.values(timers)) clearTimeout(t); fsw.forEach((x) => x.close()); } };
      watchers.set(name, w);
    }
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
    res.write(": ok\n\n");
    w.clients.add(res);
    res.on("close", () => { w.clients.delete(res); if (!w.clients.size) { w.close(); watchers.delete(name); } });
  }

  // Files under <dir>/<sub> (recursive, no dotfiles, at most 500), paths relative to the project.
  const filesUnder = (dir, sub, keep = () => true) => {
    const files = [];
    const walk = (d, rel) => {
      if (files.length >= 500 || !existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (files.length >= 500) return;
        if (e.name.startsWith(".")) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(join(d, e.name), r);
        else if (keep(e.name)) files.push({ path: `${sub}/${r}`, size: statSync(join(d, e.name)).size });
      }
    };
    walk(join(dir, sub), "");
    return files;
  };
  const isAudio = (f) => !f.startsWith(".") && AUDIO_EXT.includes(extname(f).toLowerCase());
  const sharedSfx = () => join(root, "shared-assets", "sfx");

  // Copy <root>/shared-assets/sfx/<file> into <dir>/assets/sfx/, never overwriting: a taken name
  // becomes name-2.ext, name-3.ext, … Returns the project-relative path.
  function importSound(dir, file) {
    const ok = typeof file === "string" && file === basename(file) && !file.includes("..") && !file.includes("\\") && isAudio(file);
    const src = ok ? join(sharedSfx(), file) : null;
    if (!src || !existsSync(src) || !statSync(src).isFile()) throw Object.assign(new Error("file không hợp lệ"), { status: 400 });
    const dest = join(dir, "assets", "sfx");
    mkdirSync(dest, { recursive: true });
    const ext = extname(file), stem = file.slice(0, -ext.length);
    for (let n = 1; n < 10000; n++) {
      const name = n === 1 ? file : `${stem}-${n}${ext}`;
      try { copyFileSync(src, join(dest, name), FS.COPYFILE_EXCL); return { path: `assets/sfx/${name}` }; } catch (e) { if (e.code !== "EEXIST") throw e; }
    }
    throw Object.assign(new Error("quá nhiều file trùng tên"), { status: 409 });
  }

  // check-preflight --stage final for one project; concurrent callers share the running check.
  const gateRuns = new Map(); // name → Promise
  function gateStatus(P, name, dir) {
    let pr = gateRuns.get(name);
    if (!pr) {
      pr = run(P.commands.preflight, ["--project", dir, "--stage", "final", "--json"]).then((r) => {
        if (r.killed) return { pass: false, fails: ["check-preflight quá 60 giây"], animatic: false };
        let j;
        try { j = JSON.parse(r.stdout); } catch { return { pass: false, fails: ["không đọc được check-preflight"], animatic: false }; }
        const fails = Array.isArray(j?.errors) ? j.errors : [];
        return { pass: j?.pass === true, fails, animatic: fails.some((e) => /demo\.md|animatic|approval/i.test(String(e))) };
      }).finally(() => gateRuns.delete(name));
      gateRuns.set(name, pr);
    }
    return pr;
  }

  async function route(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    const q = (k) => url.searchParams.get(k);
    if (req.method === "POST" && req.headers["x-studio-token"] !== token) return send(res, 403, { error: "thiếu X-Studio-Token" });
    const { p: P, why } = await current();
    const er = findRoute(ext, req.method, p);
    if (!P && p.startsWith("/api/") && !FREE.has(p) && !(er && !er.provider)) return send(res, 503, why);
    // An extension route, tried where the built-in branch would answer 404.
    const extension = async (b = {}) => {
      if (!er) return send(res, 404, { error: "không có" });
      const c = { req, res, url, q, body: b, send: (status, data, headers) => send(res, status, data, headers), projectDir, withManifest, root, token, P, why, startJob, runtimeFor };
      const out = await er.handler(c);
      if (!res.headersSent && !res.writableEnded) send(res, 200, out ?? { ok: true });
    };
    if (req.method === "GET") {
      if (p === "/" || p === "/index.html") {
        const page = join(ui, "index.html");
        if (!existsSync(page)) return send(res, 503, "Giao diện chưa được build. Chạy npm run setup trong thư mục Motion Studio rồi tải lại trang.");
        const html = readFileSync(page, "utf8").replace("__STUDIO_TOKEN__", token);
        return send(res, 200, html, { "content-type": TYPES[".html"] });
      }
      // Files of the UI build (flat names; realpath must stay inside <ui>/assets).
      if (p.startsWith("/assets/")) {
        const name = p.slice("/assets/".length);
        if (!ASSET.test(name) || name === "." || name === "..") return send(res, 404, "không có");
        let file;
        try {
          const dir = realpathSync(join(ui, "assets"));
          file = realpathSync(join(dir, name));
          if (!file.startsWith(dir + sep) || !statSync(file).isFile()) file = null;
        } catch { file = null; }
        return file ? serveFile(req, res, file) : send(res, 404, "không có");
      }
      if (p === "/hf/runtime.js") {
        const name = q("name");
        const pd = name ? projectDir(name) : {};
        const rt = runtimeFor(pd.dir ?? null);
        return rt ? serveFile(req, res, rt) : send(res, 404, "không tìm thấy HyperFrames runtime (cài hyperframes)");
      }
      const m = p.match(/^\/p\/([^/]+)\/(.*)$/);
      if (m) {
        let name, rel;
        try { name = decodeURIComponent(m[1]); rel = decodeURIComponent(m[2]); } catch { return send(res, 400, "đường dẫn không hợp lệ"); }
        const pd = projectDir(name);
        if (pd.error) return send(res, pd.status, pd.error);
        const f = projectFile(pd.dir, rel);
        if (!f.file) return send(res, f.status, f.status === 403 ? "không được phép" : "không có file");
        const isRootIndex = f.parts.length === 1 && f.parts[0] === "index.html";
        return serveFile(req, res, f.file, isRootIndex ? { inject: `<script src="/hf/runtime.js?name=${encodeURIComponent(name)}"></script>` } : {});
      }
      if (p === "/api/projects") return send(res, 200, projectsOf(root, P));
      if (p === "/api/status") return send(res, 200, P ? (await providerStatus()) : { ok: false, ...why });
      if (p === "/api/project") { const pd = withManifest(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, P.manifest.load(pd.dir)); }
      if (p === "/api/log") { const pd = withManifest(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, P.gateway.readHistory(pd.dir)); }
      if (p === "/api/requests") {
        const pd = withManifest(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        P.requests.expireWaiting(pd.dir);
        return send(res, 200, P.requests.list(pd.dir));
      }
      if (p === "/api/agent") {
        const name = q("name");
        const pd = name ? projectDir(name) : {};
        if (pd.error) return send(res, pd.status, { error: pd.error });
        return send(res, 200, { ...(await agentStatus({ name })), provider: P ? { id: P.id, label: P.label, version: P.version } : null, provider_error: P ? null : why });
      }
      if (p === "/api/media/browse") {
        try { return send(res, 200, browse(q("path") || undefined, { roots: mediaRoots })); } catch (e) { return send(res, e.status ?? 500, { error: e.message }); }
      }
      if (p === "/api/media") { const pd = projectDir(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, readMedia(pd.dir)); }
      if (p === "/api/jobs") { const pd = projectDir(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, listJobs(q("name"))); }
      if (p === "/api/settings") return send(res, 200, { director: { runner: runnerSetting() } });
      if (p === "/api/files") {
        const pd = projectDir(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const sub = q("dir");
        if (!["assets", "renders"].includes(sub)) return send(res, 400, { error: "dir phải là assets hoặc renders" });
        return send(res, 200, filesUnder(pd.dir, sub));
      }
      if (p === "/api/sounds") {
        const pd = projectDir(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const sfx = sharedSfx();
        const shared = existsSync(sfx) && statSync(sfx).isDirectory()
          ? readdirSync(sfx, { withFileTypes: true }).filter((e) => e.isFile() && isAudio(e.name)).map((e) => ({ file: e.name, size: statSync(join(sfx, e.name)).size })).sort((a, b) => a.file.localeCompare(b.file))
          : [];
        return send(res, 200, { project: filesUnder(pd.dir, "assets", isAudio), shared });
      }
      if (p === "/api/gates") {
        const pd = projectDir(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        return send(res, 200, await gateStatus(P, q("name"), pd.dir));
      }
      if (p === "/api/directions") {
        if (!P) return send(res, 200, { seams: [], directions: [] });
        const d = JSON.parse(readFileSync(P.library.directionsFile, "utf8"));
        const items = transitionItems(d);
        return send(res, 200, { seams: items.map((s) => s.id), seam_items: items, directions: (d.directions ?? []).map((x) => ({ id: x.id, ten_vi: x.ten_vi, mo_ta_vi: x.mo_ta_vi, seams: x.seams })) });
      }
      if (p === "/api/library") {
        try {
          return send(res, 200, libraryQuery({ kind: q("kind") ?? "videos", q: String(q("q") ?? "").slice(0, 200), cat: q("cat") ?? "", featured: q("featured") === "1", offset: q("offset"), limit: q("limit") }, P ? { stylesDir: P.library.stylesDir, directionsFile: P.library.directionsFile, source: { id: P.id, label: P.label } } : {}));
        } catch (e) { return send(res, e.status ?? 500, { error: e.message }); }
      }
      if (p.startsWith("/library/thumb/")) {
        const f = thumbFile(p.slice("/library/thumb/".length));
        return f ? serveFile(req, res, f) : send(res, 404, "không có ảnh");
      }
      if (p === "/api/cases") {
        if (!P) return send(res, 200, []);
        const args = ["--json", "--limit", "12", "--max-chars", "600"];
        for (const k of String(q("q") ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) args.push("--keyword", k);
        const cat = q("category");
        if (cat) { if (!/^[a-z-]+$/.test(cat)) return send(res, 400, { error: "category không hợp lệ" }); args.push("--category", cat); }
        const r = await run(P.commands.cases, args);
        return r.code ? send(res, 200, []) : send(res, 200, JSON.parse(r.stdout || "[]"));
      }
      if (p === "/api/styles") {
        if (!P) return send(res, 200, []);
        const r = await run(P.commands.styles, ["find", String(q("q") ?? "").slice(0, 200) || "minimal", "--json"]);
        try { return send(res, 200, JSON.parse(r.stdout || "[]")); } catch { return send(res, 200, []); }
      }
      if (p === "/api/events") {
        const pd = withManifest(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        return subscribe(P, q("name"), pd.dir, res);
      }
      return extension();
    }
    if (req.method === "POST") {
      const b = await body(req);
      if (p === "/api/import") {
        const pd = projectDir(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const r = await run(P.commands.import, ["--project", pd.dir, "--write"]);
        if (r.code === 6) return send(res, 409, { error: "dự án đã có project.json" });
        if (r.code === 8) return send(res, 503, { error: "đang bận, thử lại sau" });
        return r.code ? send(res, 422, { error: (r.stderr || r.stdout).trim() }) : send(res, 200, { ok: true, output: r.stdout.trim() });
      }
      if (p === "/api/patch") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        if (!Number.isInteger(b.base) || !Array.isArray(b.ops) || !b.ops.length) return send(res, 400, { error: "cần base (số) và ops (mảng)" });
        return gatewayReply(res, P, P.gateway.patch(pd.dir, { actor: "human", base: b.base, ops: b.ops, lockWaitMs: LOCK_WAIT_MS }));
      }
      if (p === "/api/undo") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        if (!Number.isInteger(b.base)) return send(res, 400, { error: "cần base (số)" });
        return gatewayReply(res, P, P.gateway.undo(pd.dir, { base: b.base, lockWaitMs: LOCK_WAIT_MS }));
      }
      if (p === "/api/redo") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        if (!Number.isInteger(b.base)) return send(res, 400, { error: "cần base (số)" });
        return gatewayReply(res, P, P.gateway.redo(pd.dir, { base: b.base, lockWaitMs: LOCK_WAIT_MS }));
      }
      if (p === "/api/director") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        let r;
        try { r = P.requests.enqueue(pd.dir, { scope: b.scope, target: b.target ?? null, t: Number.isFinite(b.t) ? b.t : null, base: P.manifest.load(pd.dir).version, text: b.text }); } catch (e) { return send(res, 400, { error: e.message }); }
        const runner = runnerSetting();
        if (runner === "mcp") return send(res, 200, { request: r, runner, message: "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" });
        const busy = running(b.name, DIRECTOR);
        const job = busy ? null : pump(P, b.name, pd.dir);
        const now = P.requests.list(pd.dir).find((x) => x.id === r.id) ?? r;
        return send(res, 200, { request: now, runner, job, message: busy ? "Đạo diễn đang làm yêu cầu trước; yêu cầu này chờ tới lượt" : null });
      }
      if (p === "/api/projects/new") {
        const r = await createProject(root, b, { run: runCmd });
        if (r.status === 200 && r.body.request) pump(P, r.body.name, r.dir);
        return send(res, r.status, r.body);
      }
      if (p === "/api/media/register") {
        const pd = projectDir(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        try { return send(res, 200, await register(root, pd.dir, b.src, { roots: mediaRoots })); } catch (e) { return send(res, e.status ?? 500, { error: e.message }); }
      }
      if (p === "/api/sounds/import") {
        const pd = projectDir(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        try { return send(res, 200, importSound(pd.dir, b.file)); } catch (e) { return send(res, e.status ?? 500, { error: e.message }); }
      }
      if (p === "/api/director/answer") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const r = await answerCard(pd.dir, { id: b.id, value: b.value }, { run: runCmd });
        // One line per card answer in studio.log, so a click that never arrived is told apart from one that failed.
        console.log(`${new Date().toISOString()} answer ${b.name} ${b.id} ${r.status}${r.status === 200 ? ` next ${r.body.next}` : `: ${r.body.error}`}`);
        if (r.status === 200) pump(P, b.name, pd.dir);
        return send(res, r.status, r.body);
      }
      if (p === "/api/director/cancel") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const job = listJobs(b.name).find((j) => j.kind === DIRECTOR && j.meta?.request === b.id && j.status === "running");
        if (job) return send(res, 200, { job: cancelJob(job.id) });
        try { return send(res, 200, { request: P.requests.cancelRequest(pd.dir, b.id) }); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (p === "/api/jobs/cancel") {
        const job = listJobs(b.name).find((j) => j.id === b.id);
        return job ? send(res, 200, { job: cancelJob(job.id) }) : send(res, 404, { error: "không có job" });
      }
      if (p === "/api/export") {
        const pd = projectDir(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const forward = [];
        if (b.ratio != null && b.ratio !== "16x9") {
          if (!RATIO.test(String(b.ratio))) return send(res, 400, { error: "ratio dạng 9x16" });
          const comp = `compositions/main-${b.ratio}.html`;
          if (!existsSync(join(pd.dir, comp))) return send(res, 400, { error: `không có ${comp} (chạy reframe.mjs trước)` });
          forward.push("-c", comp);
        }
        const d = new Date(), z = (n) => String(n).padStart(2, "0");
        const base = `renders/${b.name}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}${b.ratio && b.ratio !== "16x9" ? `-${b.ratio}` : ""}`;
        const compress = compressScript(root);
        try {
          const job = startJob({
            name: b.name, kind: "export", cmd: process.execPath, args: [P.commands.render, "--project", pd.dir, "--", ...forward, "--output", `${base}.mp4`], cwd: pd.dir, meta: { step: "render", output: `${base}-final.mp4` },
            onExit: (j) => {
              if (j.code === 5) { j.meta.message = `Thiếu cổng: ${(j.tail ?? []).filter((l) => /^FAIL\b/.test(l)).map((l) => l.replace(/^FAIL\s+/, "")).join("; ") || "xem log"}`; return; }
              if (j.code !== 0 || j.status === "cancelled") return;
              // The render is done; compress runs as the next export job (the render job has ended).
              setImmediate(() => {
                try { startJob({ name: b.name, kind: "export", cmd: compress, args: [`${base}.mp4`, `${base}-final.mp4`], cwd: pd.dir, meta: { step: "compress", output: `${base}-final.mp4` } }); } catch { /* another export started */ }
              });
            },
          });
          return send(res, 200, { job });
        } catch (e) { return send(res, e.code === "BUSY" ? 409 : 500, { error: e.message }); }
      }
      if (p === "/api/bundle") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const ratio = b.ratio ?? "16x9";
        if (!RATIO.test(String(ratio))) return send(res, 400, { error: "ratio dạng 9x16" });
        if (ratio !== "16x9" && !existsSync(join(pd.dir, `compositions/main-${ratio}.html`))) return send(res, 400, { error: `không có compositions/main-${ratio}.html (chạy reframe.mjs trước)` });
        const d = new Date(), z = (n) => String(n).padStart(2, "0");
        const out = `renders/${b.name}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}${ratio !== "16x9" ? `-${ratio}` : ""}-bundle`;
        // Same job kind as the export: one heavy render per project at a time.
        try {
          const job = startJob({ name: b.name, kind: "export", cmd: process.execPath, args: [BUNDLE, "--project", pd.dir, "--ratio", ratio, "--out", out], cwd: pd.dir, meta: { step: "bundle", output: out } });
          return send(res, 200, { job });
        } catch (e) { return send(res, e.code === "BUSY" ? 409 : 500, { error: e.message }); }
      }
      return extension(b);
    }
    return send(res, 405, { error: "method không hỗ trợ" });
  }

  const server = httpServer(async (req, res) => {
    port = server.address()?.port ?? port;
    const host = String(req.headers.host ?? "");
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, "Host không hợp lệ");
    if (req.method === "POST" && req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, 403, { error: "Origin không hợp lệ" });
    // URL parsing folds "/a/../b"; refuse any dot segment in the raw path before it does.
    let raw = String(req.url).split("?")[0];
    try { raw = decodeURIComponent(raw); } catch { return send(res, 400, "đường dẫn không hợp lệ"); }
    if (/(^|\/)\.\.?(\/|$)/.test(raw) || raw.includes("\\")) return send(res, 403, "không được phép");
    try { await route(req, res); } catch (e) {
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.message });
      else res.end();
    }
  });
  // Requests queued while Studio was down (or before a restart) start once it listens.
  // Without a provider nothing is pumped; the queue waits for the next request.
  server.on("listening", async () => {
    const { p: P } = await current();
    if (!P) return;
    for (const p of projectsOf(root, P)) {
      if (!p.has_manifest) continue;
      const dir = join(root, p.name);
      try { if (P.requests.list(dir).some((r) => r.status === "queued")) pump(P, p.name, dir); } catch { /* unreadable requests: left for the next request */ }
    }
  });
  server.on("close", () => { for (const w of watchers.values()) w.close(); watchers.clear(); stopAll(); });
  // Look up the HyperFrames runtime once now, not inside the first player request.
  if (runtime === undefined) setImmediate(() => findRuntime(null));
  return server;
}
