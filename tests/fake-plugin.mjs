// A plugin folder that the default adapter accepts (or rejects, by STUDIO_API), for tests that
// must not depend on the installed plugin: .claude-plugin/plugin.json plus a scripts/studio-api.mjs
// with stub functions. extra is appended to studio-api.mjs (e.g. COMMANDS, SKILLS exports).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// series: true adds SERIES_FILE, validateSeries (schema, name and tools only) and seriesDirOf
// (`series:` of the BRIEF frontmatter, else "- Thư mục series:" under ## series_bible).
const SERIES = `
import { existsSync as _se, readFileSync as _sr } from "node:fs";
import { join as _sj, resolve as _sv } from "node:path";
export const SERIES_FILE = "studio-series.json";
export const validateSeries = (s) => [
  ...(/\\/series@1$/.test(String(s?.schema)) ? [] : ["schema phải là <provider>/series@1"]),
  ...(typeof s?.name === "string" && s.name ? [] : ["thiếu name"]),
  ...(s?.tools && typeof s.tools === "object" ? [] : ["thiếu tools"]),
];
export function seriesDirOf(dir) {
  let t; try { t = _sr(_sj(dir, "BRIEF.md"), "utf8"); } catch { return null; }
  const p = t.match(/^series:\\s*(.+?)\\s*$/m)?.[1] ?? t.match(/^- Thư mục series:\\s*(.+?)\\s*$/m)?.[1];
  if (!p) return null;
  const d = _sv(dir, p);
  return _se(_sj(d, SERIES_FILE)) ? d : null;
}`;

// gateway: true makes load read <dir>/project.json and patch apply set_line_speaker and
// set_line_audio to it (gate "pass" for a new take) as the next version, logging each call to
// <dir>/.patches.jsonl; scripts/timing.mjs appends its argv to <project>/.timing-runs.
const GATEWAY = `
import { appendFileSync as _ga, existsSync as _ge, readFileSync as _gr, writeFileSync as _gw } from "node:fs";
import { join as _gj } from "node:path";
export const load = (dir) => (_ge(_gj(dir, "project.json")) ? JSON.parse(_gr(_gj(dir, "project.json"), "utf8")) : null);
export function patch(dir, { actor, base, ops, note }) {
  _ga(_gj(dir, ".patches.jsonl"), JSON.stringify({ actor, base, ops, note }) + "\\n");
  const m = load(dir);
  if (!m || m.version !== base) return { code: 3, error: "CONFLICT" };
  for (const op of ops) {
    const l = m.lines.find((x) => x.id === op.id);
    if (!l) return { code: 5, error: "INVALID: không có câu " + op.id };
    if (op.op === "set_line_speaker") Object.assign(l, { speaker: op.speaker, gate: "stale" });
    else if (op.op === "set_line_audio") Object.assign(l, { file: op.file, duration: op.duration, gate: "pass" });
  }
  m.version += 1;
  _gw(_gj(dir, "project.json"), JSON.stringify(m));
  return { code: 0, version: m.version, receipt: [] };
}`;
const TIMING = `import { appendFileSync } from "node:fs";
import { join } from "node:path";
const i = process.argv.indexOf("--project");
appendFileSync(join(process.argv[i + 1], ".timing-runs"), process.argv.slice(2).join(" ") + "\\n");
`;

export function fakePlugin({ schema, version = "2.4.0", api = 3, extra = "", git = false, series = false, ops = null, gateway = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  mkdirSync(join(dir, ".claude-plugin"));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "fake", version }));
  mkdirSync(join(dir, "scripts"));
  if (git) mkdirSync(join(dir, ".git"));
  const fns = ["load", "validate", "patch", "undo", "redo", "redoTarget", "readHistory", "derive", "enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"];
  writeFileSync(join(dir, "scripts", "studio-api.mjs"), [
    ...fns.filter((f) => !(gateway && (f === "load" || f === "patch"))).map((f) => `export const ${f} = () => null;`),
    `export const SCHEMA = ${JSON.stringify(schema)};`,
    `export const FILE = "project.json";`,
    `export const EXIT = { conflict: 3 }; export const ACTORS = ["human"]; export const STATUSES = []; export const ASK_KINDS = []; export const ASK_GATES = [];`,
    `export const OV = ${JSON.stringify(dir)};`,
    `export const PLUGIN_VERSION = ${JSON.stringify(version)};`,
    `export const STUDIO_API = ${api};`,
    `export const SCRIPTS = ${JSON.stringify(join(dir, "scripts"))};`,
    `export const DIRECTIONS_FILE = ${JSON.stringify(join(dir, "data", "directions.json"))};`,
    `export const PREFIX = "mcp__fake__";`,
    `export const MCP_TOOLS = ["project_get"].map((t) => PREFIX + t);`,
    `export const ALLOWED_TOOLS = ["Read", ...MCP_TOOLS]; export const DENIED_TOOLS = ["WebFetch"];`,
    series ? SERIES : "",
    gateway ? GATEWAY : "",
    ops ? `export const OPS = ${JSON.stringify(ops)};` : "",
    extra,
  ].join("\n"));
  if (gateway) writeFileSync(join(dir, "scripts", "timing.mjs"), TIMING);
  return dir;
}
