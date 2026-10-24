// lib/tools.mjs — the tool registry shared by the director and outside MCP clients. Every
// lib/tools/*.mjs (sorted by name) exports
//
//   export const TOOLS = [{ name, title, description, inputSchema, mutates, provider, run(args, env) }];
//
// name matches ^[a-z][a-z0-9_]{2,40}$ and is unique; inputSchema is a JSON Schema of type
// "object"; mutates says the tool writes something; provider: true means it needs one.
// env = { root, P, projectDir(name), studio, project? }: project (the director's server) is the
// one project a changing tool may name (lib/scope.mjs); studio talks to the running Studio
// (studioClient below), which is how a tool starts a long job (an image, a render) so the job
// shows in the UI and keeps the one-job-per-kind-per-project rule of jobs.mjs, whether the tool
// runs inside the server or in an MCP process.
// callTool checks required properties and the basic types (string, number, integer, boolean,
// array, object) of the arguments, then runs the tool: { ok: true, result } | { ok: false, error }.
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readState } from "./config.mjs";
import { toolScope } from "./scope.mjs";

export const DEFAULT_DIR = fileURLToPath(new URL("./tools/", import.meta.url));
export const TOOL_NAME = /^[a-z][a-z0-9_]{2,40}$/;
const NAME = /^[A-Za-z0-9._-]+$/;

const loaded = new Map(); // dir → Promise<tool[]>
export function loadTools(dir = DEFAULT_DIR) {
  if (!loaded.has(dir)) {
    const p = (async () => {
      if (!existsSync(dir)) return [];
      const out = [];
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs")).sort()) {
        const mod = await import(pathToFileURL(join(dir, f)).href);
        if (!Array.isArray(mod.TOOLS)) throw new Error(`lib/tools/${f}: thiếu export const TOOLS = [...]`);
        for (const t of mod.TOOLS) {
          const where = `lib/tools/${f} ${t?.name}`;
          if (!TOOL_NAME.test(String(t?.name))) throw new Error(`${where}: tên tool phải khớp ${TOOL_NAME}`);
          if (out.some((x) => x.name === t.name)) throw new Error(`${where}: trùng tên với lib/tools/${out.find((x) => x.name === t.name).file}`);
          if (t.inputSchema?.type !== "object") throw new Error(`${where}: inputSchema phải là JSON Schema type "object"`);
          if (typeof t.run !== "function") throw new Error(`${where}: thiếu run(args, env)`);
          out.push({ title: t.name, description: "", mutates: false, provider: false, ...t, file: f });
        }
      }
      return out;
    })();
    loaded.set(dir, p);
    p.catch(() => loaded.delete(dir));
  }
  return loaded.get(dir);
}

const typeOk = (type, v) => ({
  string: typeof v === "string", number: typeof v === "number" && Number.isFinite(v), integer: Number.isInteger(v),
  boolean: typeof v === "boolean", array: Array.isArray(v), object: v != null && typeof v === "object" && !Array.isArray(v), null: v === null,
}[type] ?? true);

// The first problem with args against schema (required and types, one level deep plus array items), or null.
export function checkArgs(schema, args) {
  if (!typeOk("object", args)) return "đối số phải là một object";
  for (const k of schema.required ?? []) if (args[k] === undefined) return `thiếu ${k}`;
  for (const [k, s] of Object.entries(schema.properties ?? {})) {
    const v = args[k];
    if (v === undefined || !s?.type) continue;
    const types = [s.type].flat();
    if (!types.some((t) => typeOk(t, v))) return `${k} phải là ${types.join(" | ")}`;
    if (Array.isArray(v) && s.items?.type) {
      const i = v.findIndex((x) => ![s.items.type].flat().some((t) => typeOk(t, x)));
      if (i >= 0) return `${k}[${i}] phải là ${[s.items.type].flat().join(" | ")}`;
    }
    if (s.enum && !s.enum.includes(v)) return `${k} phải là một trong ${s.enum.join(", ")}`;
  }
  return null;
}

export async function callTool(name, args = {}, env = {}, { dir = DEFAULT_DIR } = {}) {
  const t = (await loadTools(dir)).find((x) => x.name === name);
  if (!t) return { ok: false, error: `không có tool ${name}` };
  const why = checkArgs(t.inputSchema, args);
  if (why) return { ok: false, error: `${name}: ${why}` };
  if (t.provider && !env.P) return { ok: false, error: `${name} cần provider (chạy npm run setup)` };
  const scope = toolScope(t, args, env);
  if (scope) return { ok: false, error: `${name}: ${scope}` };
  try { return { ok: true, result: await t.run(args, env) }; } catch (e) { return { ok: false, error: e.message }; }
}

// A client of the running Studio, from the state file (url, token): get(path) and post(path, body)
// answer the parsed JSON, or throw with .status and the server's error. No state, no running
// server: "Studio chưa chạy".
export function studioClient({ state = readState(), fetchFn = globalThis.fetch } = {}) {
  const need = () => {
    if (!state?.url || !state?.token) throw Object.assign(new Error("Studio chưa chạy (node bin/motion-studio.mjs start)"), { status: 503 });
    return state;
  };
  const call = async (method, path, body) => {
    const s = need();
    let r;
    try {
      r = await fetchFn(new URL(path, s.url), { method, headers: { "content-type": "application/json", ...(method === "POST" ? { "x-studio-token": s.token } : {}) }, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    } catch (e) { throw Object.assign(new Error(`Studio chưa chạy hoặc không trả lời (${e.cause?.code ?? e.message})`), { status: 503 }); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(j?.error ?? `Studio trả ${r.status}`), { status: r.status });
    return j;
  };
  return { get: (path) => call("GET", path), post: (path, body) => call("POST", path, body) };
}

const bad400 = (msg) => Object.assign(new Error(msg), { status: 400 });
// A project-relative path as an absolute one inside dir; dot segments and dotfiles refused.
export function insideProject(dir, rel, what, { mustExist = false } = {}) {
  if (typeof rel !== "string" || !rel || isAbsolute(rel) || rel.includes("\\")) throw bad400(`${what}: cần đường dẫn tương đối trong dự án`);
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length || parts.some((x) => x === ".." || x === "." || x.startsWith("."))) throw bad400(`${what}: đường dẫn không hợp lệ`);
  const f = join(dir, ...parts);
  const base = realpathSync(dir);
  let probe = f;
  while (!existsSync(probe)) probe = dirname(probe);
  const real = realpathSync(probe);
  if (real !== base && !real.startsWith(base + sep)) throw bad400(`${what}: nằm ngoài dự án`);
  if (mustExist && !existsSync(f)) throw bad400(`${what}: không có ${rel}`);
  return f;
}

// The env a tool gets for the projects under root.
export function toolEnv({ root, P = null, studio = studioClient() }) {
  const base = resolve(root);
  const projectDir = (name) => {
    if (typeof name !== "string" || !NAME.test(name) || name === "." || name === "..") throw Object.assign(new Error("tên dự án không hợp lệ"), { status: 400 });
    const d = join(base, name);
    if (!existsSync(d) || !statSync(d).isDirectory()) throw Object.assign(new Error(`không có dự án ${name}`), { status: 404 });
    return d;
  };
  return { root: base, P, projectDir, studio };
}
