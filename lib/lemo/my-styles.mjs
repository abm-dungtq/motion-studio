// lib/lemo/my-styles.mjs — "Giữ phong cách": copies the style the director drafted in
// <project>/lemo-style/ to <myDir>/<slug>/ and adds its row to <myDir>/README.md, in the shape
// lemo-opuscar's MY-STYLES.md §6 describes (github.com/lemomo-ai/lemo-opuscar, MIT), so either
// tool finds the style. Only the user's click calls it.
// Rules: the slug matches SLUG and is neither a library style nor a style or README row already in
// myDir; only the ALLOW files plus demo/ are copied (no symlinks, no dot entries, no
// node_modules, renders, out, caches); at most MAX_BYTES in all. The copy goes to a temp folder
// beside the target and is renamed into place, so an existing folder is never written into and a
// failure leaves nothing behind. Errors carry code: missing | invalid | conflict | too_large.
// The style frame: the director can only take PNG snapshots and cannot rename or convert files,
// so keepStyle picks the draft's frame (pickFrame) and writes it as styleframe.jpg with ffmpeg
// (no shell); without ffmpeg the PNG is kept as styleframe.png.
import { execFileSync } from "node:child_process";
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { clean } from "./catalog.mjs";

export const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const MAX_BYTES = 300 * 1024 * 1024;
export const DRAFT = "lemo-style";
const ALLOW = [/^style\.json$/, /^STYLE\.md$/, /^CHANGES\.md$/, /^DEMO\.md$/, /^styleframe[a-z0-9-]*\.jpg$/, /^test\.mp4$/, /^test\.jpg$/];
const SKIP_DIRS = new Set(["node_modules", "renders", "out", "frames", "cache", "venv", "__pycache__"]);
const FRAME_MAX = 32 << 20;
const PNG_NAME = /^[a-z0-9][a-z0-9._-]*\.png$/i;
const STATUS = { missing: 404, invalid: 422, conflict: 409, too_large: 413 };
const fail = (code, msg) => Object.assign(new Error(msg), { code, status: STATUS[code] ?? 500 });

const README_HEAD = "# My styles\n\nStyles made with lemo-opuscar's MY-STYLES.md. One row per style.\n\n| Name | 名称 | Slug | Based on | What it is | Folder |\n|---|---|---|---|---|---|\n";
const cell = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim();

// The README.md row of a kept style (folder is empty when the style lives in the README's folder).
export const readmeRow = (style, folder = "") => `| ${cell(style.en)} | ${cell(style.cn)} | ${cell(style.slug)} | ${cell(style.based_on ?? "—")} | ${cell(style.line)} | ${cell(folder)} |`;

// Slugs named in the README table (third column).
export function readmeSlugs(text) {
  return String(text ?? "").split("\n").filter((l) => l.startsWith("|")).map((l) => l.split(/(?<!\\)\|/)[3]?.trim()).filter((s) => s && SLUG.test(s));
}

// The files of a draft to copy, as [{ rel, size }]; demo/ walks recursively.
export function planCopy(draft) {
  const out = [];
  for (const e of readdirSync(draft)) {
    const f = join(draft, e), st = lstatSync(f);
    if (st.isSymbolicLink()) continue;
    if (st.isFile() && ALLOW.some((re) => re.test(e))) out.push({ rel: e, size: st.size });
    else if (st.isDirectory() && e === "demo") walk(draft, "demo", out);
  }
  return out;
}
function walk(base, rel, out) {
  for (const e of readdirSync(join(base, rel))) {
    if (e.startsWith(".") || SKIP_DIRS.has(e)) continue;
    const r = `${rel}/${e}`, st = lstatSync(join(base, r));
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(base, r, out);
    else if (st.isFile()) out.push({ rel: r, size: st.size });
  }
}

// The first bytes of a file: "jpg", "png" or null.
export function imageKind(file) {
  const b = Buffer.alloc(4);
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.size > FRAME_MAX) return null;
    const fd = openSync(file, "r");
    try { readSync(fd, b, 0, 4, 0); } finally { closeSync(fd); }
  } catch { return null; }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

// The draft's style frame: styleframe.jpg, styleframe.png, a snapshot frame-00-*.png, else the
// only PNG in lemo-style/ (several: the newest, with a warning). { rel, kind, warning } or null.
export function pickFrame(draft) {
  let names;
  try { names = readdirSync(draft); } catch { return null; }
  const ok = (rel, want) => imageKind(join(draft, rel)) === want;
  if (names.includes("styleframe.jpg") && ok("styleframe.jpg", "jpg")) return { rel: "styleframe.jpg", kind: "jpg" };
  if (names.includes("styleframe.png") && ok("styleframe.png", "png")) return { rel: "styleframe.png", kind: "png" };
  const snap = names.filter((n) => /^frame-00-.*\.png$/i.test(n) && ok(n, "png")).sort()[0];
  if (snap) return { rel: snap, kind: "png" };
  const pngs = names.filter((n) => PNG_NAME.test(n) && ok(n, "png"));
  if (!pngs.length) return null;
  const newest = pngs.map((n) => ({ n, t: lstatSync(join(draft, n)).mtimeMs })).sort((a, b) => b.t - a.t || a.n.localeCompare(b.n))[0].n;
  return { rel: newest, kind: "png", warning: pngs.length > 1 ? `lemo-style/ có ${pngs.length} ảnh PNG; dùng ảnh mới nhất ${newest} làm khung phong cách` : null };
}

// Writes the frame into dir as styleframe.jpg (ffmpeg), or styleframe.png when ffmpeg is missing.
function writeFrame(src, dir, ffmpeg) {
  try {
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src, "-frames:v", "1", "-pix_fmt", "yuvj420p", "-q:v", "3", join(dir, "styleframe.jpg")], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
    return "styleframe.jpg";
  } catch (e) {
    if (e.code !== "ENOENT") throw fail("invalid", `không đổi được khung phong cách sang JPEG: ${String(e.stderr ?? e.message).trim().split("\n").slice(-1)[0]}`);
    cpSync(src, join(dir, "styleframe.png"));
    return "styleframe.png";
  }
}

// Reads <projectDir>/lemo-style/style.json; { draft, style } or throws missing / invalid.
export function readDraft(projectDir) {
  const draft = join(projectDir, DRAFT);
  const file = join(draft, "style.json");
  try { if (!lstatSync(draft).isDirectory() || !lstatSync(file).isFile()) throw new Error(); } catch { throw fail("missing", `chưa có ${DRAFT}/style.json trong dự án`); }
  let raw;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw fail("invalid", `${DRAFT}/style.json hỏng: ${e.message}`); }
  const style = clean(raw);
  if (!SLUG.test(style.slug ?? "")) throw fail("invalid", `slug "${style.slug ?? ""}" phải khớp ${SLUG.source} (chữ thường, số, gạch nối, 2–41 ký tự)`);
  if (!style.en && !style.cn) throw fail("invalid", "style.json cần en hoặc cn (tên phong cách)");
  return { draft, style };
}

export function keepStyle({ projectDir, myDir, librarySlugs = [], ffmpeg = "ffmpeg" }) {
  const { draft, style } = readDraft(projectDir);
  const slug = style.slug;
  const target = join(myDir, slug);
  const readme = join(myDir, "README.md");
  const rows = existsSync(readme) ? readmeSlugs(readFileSync(readme, "utf8")) : [];
  if (librarySlugs.includes(slug)) throw fail("conflict", `"${slug}" trùng một phong cách của thư viện; đổi slug trong ${DRAFT}/style.json`);
  if (existsSync(target) || rows.includes(slug)) throw fail("conflict", `đã có phong cách riêng "${slug}"; đổi slug trong ${DRAFT}/style.json`);
  const files = planCopy(draft);
  const frame = pickFrame(draft);
  for (const need of ["style.json", "STYLE.md"]) if (!files.some((f) => f.rel === need)) throw fail("missing", `${DRAFT}/${need} chưa có`);
  const total = files.reduce((n, f) => n + f.size, 0) + (frame?.kind === "png" ? lstatSync(join(draft, frame.rel)).size : 0);
  if (total > MAX_BYTES) throw fail("too_large", `${DRAFT} nặng ${(total / 1048576).toFixed(0)} MB, quá ${MAX_BYTES / 1048576} MB`);
  mkdirSync(myDir, { recursive: true });
  let savedFrame = null;
  const tmp = join(myDir, `.keep-${slug}-${randomBytes(3).toString("hex")}`);
  try {
    for (const f of files) {
      const to = join(tmp, f.rel);
      mkdirSync(join(to, ".."), { recursive: true });
      cpSync(join(draft, f.rel), to, { dereference: false, errorOnExist: true, force: false });
    }
    mkdirSync(tmp, { recursive: true });
    if (frame?.kind === "png") savedFrame = writeFrame(join(draft, frame.rel), tmp, ffmpeg);
    else if (frame) savedFrame = frame.rel;
    if (existsSync(target)) throw fail("conflict", `đã có phong cách riêng "${slug}"`);
    renameSync(tmp, target);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }
  if (!existsSync(readme)) writeFileSync(readme, README_HEAD);
  const text = readFileSync(readme, "utf8");
  appendFileSync(readme, `${text.endsWith("\n") ? "" : "\n"}${readmeRow(style)}\n`);
  return { slug, dir: target, files: files.length, bytes: total, style, frame: savedFrame, warnings: frame?.warning ? [frame.warning] : [] };
}
