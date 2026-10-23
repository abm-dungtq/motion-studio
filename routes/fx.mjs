// routes/fx.mjs — the transition library and the footage edits (lib/fx/).
//   GET  /api/fx/catalog                → { items, counts, banned } (lib/fx/catalog.mjs)
//   GET  /api/fx/luts?name=             → the colour looks a grade can use (lib/fx/lut.mjs)
//   GET  /api/fx/preview/<id>/[file]    → a file of fx/transitions/<id>/ (preview.html by
//                                         default); id and file names are checked, realpaths
//                                         stay inside the pack (403), unknown packs are 404
//   GET  /api/fx/vendor/<file>          → the vendored scripts the previews load (gsap.min.js)
//   GET  /api/fx/clip?name=&src=         → plays a clip the editor may use (Range requests)
//   POST /api/fx/footage {name, src, op, params}
//                                       → starts the project's "fx" job (one at a time per
//                                         project): node lib/fx/footage.mjs run …, last line
//                                         RESULT <json>; output in <root>/footage/cut/
//   POST /api/fx/apply-transition {name, shot, id, base, duration?}
//                                       → set_shot transition_in = id (actor human), then a
//                                         shot request to the director that names the recipe
//   POST /api/fx/use-clip {name, shot, base, clip, replace?}
//                                       → copies footage/cut/<clip> into the project's
//                                         assets/footage/ (never overwriting), puts it in the
//                                         shot's assets (in place of replace) and asks the
//                                         director to switch the src in the HTML
// Studio never edits a project's HTML itself: the director does, from the request text.
import { constants as FS, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { KIND as DIRECTOR, pump, runnerSetting } from "../director.mjs";
import { running } from "../jobs.mjs";
import { readMedia } from "../media.mjs";
import { FX_DIR, PACK_ID, loadCatalog } from "../lib/fx/catalog.mjs";
import { OPS, cutDir, resolveSource } from "../lib/fx/footage.mjs";
import { listLuts } from "../lib/fx/lut.mjs";
import { sha256File } from "../lib/receipts.mjs";

const FOOTAGE = fileURLToPath(new URL("../lib/fx/footage.mjs", import.meta.url));
const VENDOR_DIR = fileURLToPath(new URL("../fx/vendor/", import.meta.url));
const PACK_FILE = /^[a-z0-9-]+\.(html|js|json|md|css|svg|png)$/;
const VENDOR_FILE = /^[a-z0-9.-]+\.js$/;
const CLIP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.mp4$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const LOCK_WAIT_MS = 300;
const ACTORS = new Set(["human", "director", "tool", "studio"]);

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const insideDir = (f, base) => { try { const r = realpathSync(f), b = realpathSync(base); return r.startsWith(b + sep); } catch { return false; } };

// One file of a folder, or the reason it is refused.
function serve(c, base, name, okName) {
  if (!okName.test(name)) return c.send(403, "không được phép");
  const f = join(base, name);
  if (!existsSync(f)) return c.send(404, "không có file");
  if (!insideDir(f, base) || !statSync(f).isFile()) return c.send(403, "không được phép");
  return c.send(200, readFileSync(f), { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
}

function segments(c, prefix) {
  const rest = c.url.pathname.slice(prefix.length);
  try { return rest.split("/").map(decodeURIComponent); } catch { throw fail(400, "đường dẫn không hợp lệ"); }
}

// Exit code of the provider's gateway → HTTP status (as server.mjs answers /api/patch).
const gatewayStatus = (EXIT, code) => ({ [EXIT.conflict]: 409, [EXIT.viewOnly]: 423, [EXIT.invalid]: 422, [EXIT.busy]: 503, [EXIT.usage]: 400 }[code] ?? 500);

// Queues a shot request and starts the director unless one is running or the runner is mcp.
function askDirector(c, name, dir, { target, t, base, text }) {
  const request = c.P.requests.enqueue(dir, { scope: "shot", target, t, base, text });
  const runner = runnerSetting();
  if (runner === "mcp") return { request, runner, job: null, message: "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" };
  const busy = running(name, DIRECTOR);
  const job = busy ? null : pump(c.P, name, dir);
  const now = c.P.requests.list(dir).find((x) => x.id === request.id) ?? request;
  return { request: now, runner, job, message: busy ? "Đạo diễn đang làm yêu cầu trước; yêu cầu này chờ tới lượt" : null };
}

const secs = (x) => `${Math.round(x * 100) / 100}s`;

// The request text for a transition: where its recipe is and how PLAN.md names it.
export function transitionText(item, shot, prev, duration) {
  const where = `vào đầu shot ${shot.id}${shot.name ? ` "${shot.name}"` : ""} (điểm cắt ${secs(shot.start)}${prev ? `, nối từ shot ${prev.id}` : ""})`;
  const dur = duration ?? item.duration;
  const lines = [];
  // A Studio pack keeps its recipe and snippet even when the provider also names the id.
  if (item.sources?.includes("studio")) {
    lines.push(`Gắn chuyển cảnh "${item.id}" (gói chuyển cảnh của Studio, ${item.kind}) ${where}.`);
    lines.push(`Recipe: ${item.recipe}. Đọc hết rồi làm đúng hướng dẫn. Chép ${join(FX_DIR, item.id, "snippet.js")} vào assets/fx/${item.id}.js của dự án; markup mẫu ở ${join(FX_DIR, item.id, "snippet.html")}.`);
    if (dur) lines.push(`Thời lượng ${secs(dur)}.`);
    lines.push(`Mốc at lấy từ window.TIMING của shot ${shot.id}, không gõ tay số giây.`);
    if (item.sources.includes("provider")) lines.push(`Trong PLAN.md, cột "Nối sang beat sau" của dòng trước shot này ghi \`${item.id}\`.`);
    else lines.push(`Trong PLAN.md, cột "Nối sang beat sau" của dòng trước shot này ghi seam \`${item.pair_seam}\`; tên gói "${item.id}" ghi ở cột "Hình / hiệu ứng" (provider chưa biết id này).`);
  } else if (item.source === "provider") {
    lines.push(`Gắn chuyển cảnh "${item.id}" (seam ${item.kind ?? ""} của provider) ${where}.`);
    lines.push(`Trong PLAN.md, cột "Nối sang beat sau" của dòng trước shot này ghi \`${item.id}\`, chạy recipe pack để lấy recipe của seam, rồi sửa HTML theo đó.${item.doc ? ` Tài liệu thêm: ${item.doc}.` : ""}`);
    if (dur) lines.push(`Thời lượng ${secs(dur)}.`);
  } else {
    lines.push(`Gắn chuyển cảnh "${item.name}" của HyperFrames ${where}.`);
    lines.push(`Tài liệu: ${item.doc}, mục "### ${item.name}". Làm theo các luật cứng ở đầu transitions/catalog.md cùng thư mục.`);
    lines.push(`Trong PLAN.md, cột "Nối sang beat sau" ghi một seam của provider gần nhất với hiệu ứng này; tên "${item.id}" ghi ở cột "Hình / hiệu ứng".`);
    if (dur) lines.push(`Thời lượng ${secs(dur)}.`);
  }
  lines.push("Hiệu ứng phải tất định: không nguồn ngẫu nhiên, không đồng hồ, chỉ tl.set hoặc tween theo thời gian của timeline. Sửa xong thì dựng animatic mới và gọi studio_ask gate animatic để người dùng duyệt.");
  return lines.join("\n");
}

export const ROUTES = [
  { method: "GET", path: "/api/fx/catalog", provider: false, handler: async (c) => loadCatalog({ P: c.P }) },
  {
    method: "GET", path: "/api/fx/luts", provider: false,
    async handler(c) {
      let dir = null;
      if (c.q("name")) { const pd = c.projectDir(c.q("name")); if (pd.error) return c.send(pd.status, { error: pd.error }); dir = pd.dir; }
      return { luts: listLuts({ root: c.root, dir }).map(({ file, ...l }) => l) };
    },
  },
  {
    method: "GET", path: "/api/fx/preview", prefix: true, provider: false,
    async handler(c) {
      const [, id, file, ...more] = segments(c, "/api/fx/preview");
      if (!id) return c.send(404, "không có");
      if (!PACK_ID.test(id) || more.length) return c.send(403, "không được phép");
      const base = join(FX_DIR, id);
      if (!existsSync(join(base, "fx.json")) || !insideDir(base, FX_DIR)) return c.send(404, `không có gói ${id}`);
      if (file === undefined) return c.send(301, "", { location: `/api/fx/preview/${id}/` });
      return serve(c, base, file || "preview.html", PACK_FILE);
    },
  },
  {
    method: "GET", path: "/api/fx/vendor", prefix: true, provider: false,
    async handler(c) {
      const [, file, ...more] = segments(c, "/api/fx/vendor");
      if (!file) return c.send(404, "không có");
      if (more.length) return c.send(403, "không được phép");
      return serve(c, VENDOR_DIR, file, VENDOR_FILE);
    },
  },
  {
    // A clip the editor can play (before/after): any src resolveSource accepts, with Range.
    method: "GET", path: "/api/fx/clip", provider: false,
    async handler(c) {
      const pd = c.projectDir(c.q("name"));
      if (pd.error) return c.send(pd.status, { error: pd.error });
      const file = resolveSource(c.root, pd.dir, c.q("src"), readMedia(pd.dir));
      const size = statSync(file).size;
      const type = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska" }[extname(file).toLowerCase()] ?? "application/octet-stream";
      const head = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "no-store" };
      const range = String(c.req.headers.range ?? "").match(/^bytes=(\d*)-(\d*)$/);
      if (range && (range[1] || range[2])) {
        let a = range[1] ? Number(range[1]) : size - Number(range[2]);
        let z = range[1] && range[2] ? Number(range[2]) : size - 1;
        a = Math.max(0, a); z = Math.min(size - 1, z);
        if (a > z) { c.res.writeHead(416, { "content-range": `bytes */${size}` }); return c.res.end(); }
        c.res.writeHead(206, { ...head, "content-range": `bytes ${a}-${z}/${size}`, "content-length": z - a + 1 });
        return void createReadStream(file, { start: a, end: z }).pipe(c.res);
      }
      c.res.writeHead(200, { ...head, "content-length": size });
      return void createReadStream(file).pipe(c.res);
    },
  },
  {
    method: "POST", path: "/api/fx/footage", provider: false,
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!OPS.includes(b.op)) throw fail(400, `op phải là ${OPS.join(" | ")}`);
      if (b.params != null && (typeof b.params !== "object" || Array.isArray(b.params))) throw fail(400, "params phải là object");
      const src = resolveSource(c.root, pd.dir, b.src, readMedia(pd.dir));
      const arg = { root: c.root, dir: pd.dir, src, op: b.op, params: b.params ?? {}, cut: c.P?.commands?.cut ?? null, actor: ACTORS.has(b.actor) ? b.actor : "human" };
      try {
        const job = c.startJob({ name: b.name, kind: "fx", cmd: process.execPath, args: [FOOTAGE, "run", JSON.stringify(arg)], cwd: pd.dir, meta: { step: "fx", op: b.op, src: b.src } });
        return { job };
      } catch (e) {
        return c.send(e.code === "BUSY" ? 409 : 500, { error: e.code === "BUSY" ? "dự án đang sửa một clip khác, chờ xong đã" : e.message });
      }
    },
  },
  {
    method: "POST", path: "/api/fx/apply-transition",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
      if (b.duration != null && !(Number.isFinite(b.duration) && b.duration > 0 && b.duration <= 3)) throw fail(400, "duration là số giây trong (0, 3]");
      const m = c.P.manifest.load(pd.dir);
      const i = m.shots.findIndex((s) => s.id === b.shot);
      if (i < 0) throw fail(404, `không có shot ${String(b.shot ?? "")}`);
      const item = loadCatalog({ P: c.P }).items.find((x) => x.id === b.id);
      if (!item) throw fail(400, `không có chuyển cảnh "${String(b.id ?? "")}" trong thư viện (hoặc nó bị cấm)`);
      const shot = m.shots[i];
      let version = m.version, receipt = [];
      if (b.base !== m.version) throw fail(409, `dự án đã đổi (phiên bản ${m.version}, bạn gửi ${b.base}); tải lại rồi thử lại`);
      if (shot.transition_in !== item.id) {
        const r = c.P.gateway.patch(pd.dir, { actor: "human", base: b.base, ops: [{ op: "set_shot", id: shot.id, field: "transition_in", value: item.id }], lockWaitMs: LOCK_WAIT_MS });
        if (r.code) return c.send(gatewayStatus(c.P.gateway.EXIT, r.code), { error: r.error });
        version = r.version; receipt = r.receipt ?? [];
      }
      const text = transitionText(item, shot, m.shots[i - 1] ?? null, b.duration ?? null);
      const d = askDirector(c, b.name, pd.dir, { target: shot.id, t: shot.start, base: version, text });
      return { version, receipt, item: { id: item.id, source: item.source, recipe: item.recipe }, ...d };
    },
  },
  {
    method: "POST", path: "/api/fx/use-clip",
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.withManifest(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (!Number.isInteger(b.base)) throw fail(400, "cần base (số phiên bản vừa đọc)");
      const clip = typeof b.clip === "string" && b.clip.startsWith("footage/cut/") ? b.clip.slice("footage/cut/".length) : b.clip;
      if (typeof clip !== "string" || !CLIP.test(clip)) throw fail(400, "clip: tên file .mp4 trong footage/cut/");
      const src = join(cutDir(c.root), clip);
      if (!existsSync(src) || !insideDir(src, cutDir(c.root))) throw fail(404, `không có footage/cut/${clip}`);
      const m = c.P.manifest.load(pd.dir);
      if (b.base !== m.version) throw fail(409, `dự án đã đổi (phiên bản ${m.version}, bạn gửi ${b.base}); tải lại rồi thử lại`);
      const shot = m.shots.find((s) => s.id === b.shot);
      if (!shot) throw fail(404, `không có shot ${String(b.shot ?? "")}`);
      const assets = Array.isArray(shot.assets) ? shot.assets : [];
      if (b.replace != null && !assets.includes(b.replace)) throw fail(400, `shot ${shot.id} không có chất liệu ${String(b.replace)}`);

      // Copy without overwriting; a same-content copy already there is reused.
      const destDir = join(pd.dir, "assets", "footage");
      mkdirSync(destDir, { recursive: true });
      const sha = await sha256File(src);
      const stem = basename(clip, ".mp4");
      let rel = null;
      for (let n = 1; n < 1000 && !rel; n++) {
        const name = n === 1 ? clip : `${stem}-${n}.mp4`;
        const dest = join(destDir, name);
        try { copyFileSync(src, dest, FS.COPYFILE_EXCL); rel = `assets/footage/${name}`; } catch (e) {
          if (e.code !== "EEXIST") throw e;
          if (await sha256File(dest) === sha) rel = `assets/footage/${name}`;
        }
      }
      if (!rel) throw fail(409, "quá nhiều file trùng tên trong assets/footage");

      const next = b.replace != null ? assets.map((a) => (a === b.replace ? rel : a)) : [...assets, rel];
      const unique = [...new Set(next)];
      let version = m.version, receipt = [];
      if (JSON.stringify(unique) !== JSON.stringify(assets)) {
        const r = c.P.gateway.patch(pd.dir, { actor: "human", base: b.base, ops: [{ op: "set_shot", id: shot.id, field: "assets", value: unique }], lockWaitMs: LOCK_WAIT_MS });
        if (r.code) return c.send(gatewayStatus(c.P.gateway.EXIT, r.code), { error: r.error });
        version = r.version; receipt = r.receipt ?? [];
      }
      const text = b.replace != null
        ? `Shot ${shot.id}: thay video ${b.replace} bằng ${rel} trong HTML (giữ nguyên vị trí, cỡ khung và mốc thời gian). Clip mới đã được sửa trước bằng ffmpeg (footage/cut/${clip}); không cắt hay đổi tốc độ thêm trong HTML.`
        : `Shot ${shot.id}: dùng video ${rel} trong HTML của shot này. Clip đã được sửa trước bằng ffmpeg (footage/cut/${clip}); không cắt hay đổi tốc độ thêm trong HTML.`;
      const d = askDirector(c, b.name, pd.dir, { target: shot.id, t: shot.start, base: version, text });
      return { version, receipt, asset: rel, ...d };
    },
  },
];
