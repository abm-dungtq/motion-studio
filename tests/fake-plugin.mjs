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

export function fakePlugin({ schema, version = "2.4.0", api = 3, extra = "", git = false, series = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  mkdirSync(join(dir, ".claude-plugin"));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "fake", version }));
  mkdirSync(join(dir, "scripts"));
  if (git) mkdirSync(join(dir, ".git"));
  const fns = ["load", "validate", "patch", "undo", "redo", "redoTarget", "readHistory", "derive", "enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"];
  writeFileSync(join(dir, "scripts", "studio-api.mjs"), [
    ...fns.map((f) => `export const ${f} = () => null;`),
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
    extra,
  ].join("\n"));
  return dir;
}
