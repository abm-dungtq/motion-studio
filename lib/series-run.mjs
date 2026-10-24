// lib/series-run.mjs — turns a request to run a series tool into the argv Studio spawns, or a 400
// saying what is refused. Only tools of the declaration run, only with their declared flags, and
// every value is checked against the flag's type (lib/series.mjs, docs/series.md):
//   bool                 true adds the flag alone, false leaves it out
//   int, number          an integer / a finite number (or its digits as a string)
//   id, word, range, slot, text   matched against the patterns below; text is one line, ≤ 200 chars
//   path:read, path:write   "S/<rel>" is in the series folder, anything else is relative to the
//                        project. No absolute path, '\', '..', '.' or dot segment; the realpath of
//                        the deepest existing part must stay inside. A read path (a flag or a
//                        positional alike) is in the project or a folder of `read`; a write path
//                        in the project or a folder of the tool's `writes`. Nothing under S/build
//                        (the tools write there, never an argument). A `read` or `writes` folder
//                        with {char} counts only when the run names a character.
//   project              the project the tool runs for: its name, or its folder
//   root                 Studio's root, or the real folder holding the project (where a symlinked
//                        episode lives); any other folder is refused
// A trailing * lets the flag (or the positional list) take an array. Values go out as
// --flag=value, one argv element each, so a value can never be read as another flag; the tool
// runs as `node <file> …` with cwd the series folder, without a shell.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { ID, seriesPath } from "./series.mjs";

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const PATTERNS = {
  id: ID,
  word: /^[A-Za-z0-9._-]{1,40}$/,
  range: /^\d+:\d+$/,
  slot: /^[a-z]+:\d+,\d+$/,
};
export const DEFAULT_TIMEOUT_S = 120;

const inside = (p, dir) => p === dir || p.startsWith(dir + sep);
// The realpath of the deepest existing part of p, with the rest appended.
function realish(p) {
  let probe = p;
  const rest = [];
  while (!existsSync(probe)) { rest.unshift(basename(probe)); const up = dirname(probe); if (up === probe) break; probe = up; }
  return join(realpathSync(probe), ...rest);
}

// A path argument → its absolute path (see the header for the rules).
function pathArg(v, what, { series, project }) {
  if (typeof v !== "string" || !v) throw bad(`${what}: cần một đường dẫn`);
  if (v.startsWith("/") || /^[A-Za-z]:/.test(v) || v.includes("\\")) throw bad(`${what}: không nhận đường tuyệt đối hay dấu \\; dùng S/<đường> cho thư mục series, còn lại là đường trong dự án`);
  const inS = v.startsWith("S/");
  const parts = (inS ? v.slice(2) : v).split("/");
  if (parts.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) throw bad(`${what}: đường "${v}" có đoạn rỗng, '.', '..' hay đoạn bắt đầu bằng dấu chấm`);
  const base = inS ? series.dir : project;
  const real = realish(join(base, ...parts));
  if (!inside(real, base)) throw bad(`${what}: "${v}" nằm ngoài ${inS ? "thư mục series" : "dự án"}`);
  if (inside(real, join(series.dir, "build"))) throw bad(`${what}: không nhận đường dưới S/build`);
  return real;
}

function value(type, v, what, ctx) {
  switch (type) {
    case "int":
      if (Number.isInteger(v) || (typeof v === "string" && /^-?\d{1,12}$/.test(v))) return String(Number(v));
      throw bad(`${what}: cần số nguyên`);
    case "number":
      if ((typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^-?\d{1,12}(\.\d{1,12})?$/.test(v))) return String(Number(v));
      throw bad(`${what}: cần một số`);
    case "text":
      if (typeof v === "string" && v.trim() && v.length <= 200 && !/\p{Cc}/u.test(v)) return v;
      throw bad(`${what}: cần chữ một dòng, tối đa 200 ký tự`);
    case "path:read": {
      const p = pathArg(v, what, ctx);
      if (!inside(p, ctx.project) && !ctx.reads.some((d) => inside(p, d))) throw bad(`${what}: "${v}" không nằm trong dự án hay một thư mục read của series`);
      return p;
    }
    case "path:write": return pathArg(v, what, ctx);
    case "project":
      if (v === ctx.projectName || (typeof v === "string" && existsSync(v) && realpathSync(v) === ctx.project)) return ctx.project;
      throw bad(`${what}: chỉ nhận dự án đang chạy (${ctx.projectName})`);
    case "root": {
      const real = typeof v === "string" && v.startsWith("/") && existsSync(v) ? realpathSync(v) : null;
      if (real && ctx.roots.includes(real)) { ctx.root = real; return real; }
      throw bad(`${what}: chỉ nhận thư mục gốc của Studio hoặc thư mục thật chứa dự án`);
    }
    default:
      if (PATTERNS[type] && typeof v === "string" && PATTERNS[type].test(v)) return v;
      throw bad(`${what}: "${String(v).slice(0, 60)}" không đúng kiểu ${type}`);
  }
}

// → { cmd, argv, cwd, timeoutMs, writes, outputs, file, char }. outputs: the path:write values.
// root: Studio's root. char: the {char} of the tool's file and writes (else the --char flag).
export function buildArgv({ series, projectDir, root, tool, flags = {}, positional = [], char = null }) {
  const t = series.config.tools[tool];
  if (typeof tool !== "string" || !Object.hasOwn(series.config.tools, tool) || !t) throw bad(`series ${series.config.name} không có công cụ "${String(tool)}" (có: ${Object.keys(series.config.tools).join(", ")})`);
  if (flags == null || typeof flags !== "object" || Array.isArray(flags)) throw bad("flags phải là object { \"--cờ\": giá trị }");
  if (!Array.isArray(positional)) throw bad("positional phải là mảng");
  const project = realpathSync(projectDir);
  const c = char ?? (typeof flags["--char"] === "string" ? flags["--char"] : null);
  const vars = { char: c, project, root: realpathSync(root) };
  // Declaration folders filled from vars; one that needs {char} is left out when no character is named.
  const folders = (list) => (list ?? []).filter((rel) => c != null || !rel.includes("{char}")).map((rel) => seriesPath(series, rel, vars));
  const ctx = { series, project, projectName: basename(projectDir), roots: [vars.root, dirname(project)], root: vars.root,
    // Filled on first use, so a bad --char is refused as a bad flag value first.
    get reads() { return (this._reads ??= folders(series.config.read).map(realish)); } };
  const declared = t.flags ?? {};
  const argv = [];
  const outputs = [];
  for (const [flag, v] of Object.entries(flags)) {
    if (!Object.hasOwn(declared, flag)) throw bad(`công cụ ${tool} không có cờ ${flag} (được: ${Object.keys(declared).join(", ") || "không cờ nào"})`);
    const repeat = declared[flag].endsWith("*");
    const type = declared[flag].replace(/\*$/, "");
    if (Array.isArray(v) && !repeat) throw bad(`${flag}: chỉ nhận một giá trị`);
    for (const one of Array.isArray(v) ? v : [v]) {
      if (type === "bool") {
        if (typeof one !== "boolean") throw bad(`${flag}: cần true hoặc false`);
        if (one) argv.push(flag);
        continue;
      }
      const out = value(type, one, flag, ctx);
      argv.push(`${flag}=${out}`);
      if (type === "path:write") outputs.push(out);
    }
  }
  if (positional.length) {
    if (!t.positional) throw bad(`công cụ ${tool} không nhận đối số vị trí`);
    if (positional.length > 1 && !t.positional.endsWith("*")) throw bad(`công cụ ${tool} chỉ nhận một đối số vị trí`);
    const type = t.positional.replace(/\*$/, "");
    if (type === "bool") throw bad(`công cụ ${tool}: đối số vị trí không thể là bool`);
    positional.forEach((v, i) => {
      const out = value(type, v, `positional[${i}]`, ctx);
      if (out.startsWith("-")) throw bad(`positional[${i}]: không được bắt đầu bằng '-'`);
      argv.push(out);
      if (type === "path:write") outputs.push(out);
    });
  }
  vars.root = ctx.root; // a --root flag names which root the tool works in
  const file = seriesPath(series, t.file, vars);
  if (!existsSync(file) || !inside(realpathSync(file), series.dir)) throw bad(`công cụ ${tool}: không có file ${t.file}${c ? ` cho ${c}` : ""}`);
  const writes = folders(t.writes);
  for (const w of outputs) {
    if (inside(w, project)) continue;
    if (!writes.some((d) => inside(w, realish(d)))) throw bad(`đường ghi ${w} không nằm trong dự án hay một thư mục writes của ${tool}`);
  }
  return { cmd: process.execPath, argv: [file, ...argv], cwd: series.dir, timeoutMs: (t.timeout_s ?? DEFAULT_TIMEOUT_S) * 1000, writes, outputs, file, char: c };
}
