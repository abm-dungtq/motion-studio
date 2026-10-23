#!/usr/bin/env node
// mcp/studio-mcp.mjs — Motion Studio's MCP server (stdio). It serves the tool registry of
// lib/tools/*.mjs (lib/tools.mjs), the same tools the director gets, to any MCP client: Claude
// Code, Codex, agy, opencode. Idea of one tool set for the in-app agent and outside clients, and of
// reading back before writing, from OpenChatCut (https://github.com/0xsline/OpenChatCut, AGPL-3.0)
// and AdobePremiereProMCP (https://github.com/ayushozha/AdobePremiereProMCP, MIT); no code copied.
//
//   node mcp/studio-mcp.mjs [--root <dir>] [--profile external|director] [--request <id>]
//
// --root     the projects folder (default: rootDefault() of lib/config.mjs)
// --profile  external (default): every tool. director: drops the tools whose name the provider's
//            own MCP server already serves (P.director.mcpTools without the prefix), so the
//            director never sees two project_patch.
// --request  the Studio request the director works on; kept in history notes and receipts.
// Edits of project.json go through the provider's gateway with actor "director" (the gateway has
// no "agent" actor; an outside client gets "agent" once the provider lists it in ACTORS).
// Exits when stdin ends.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler, serve, toolText } from "../lib/mcp/protocol.mjs";
import { callTool, loadTools, toolEnv } from "../lib/tools.mjs";
import { rootDefault } from "../lib/config.mjs";
import { loadProvider } from "../lib/provider.mjs";

export const SERVER_NAME = "motion-studio";
export const SCRIPT = fileURLToPath(import.meta.url);
export const PROFILES = ["external", "director"];
const VERSION = "1.1.0";

// The tools a profile shows. P may be null (no provider): nothing is dropped then.
export function toolsForProfile(profile, tools, P) {
  if (profile !== "director") return tools;
  const prefix = P?.director?.toolPrefix ?? "";
  const theirs = new Set((P?.director?.mcpTools ?? []).map((t) => (prefix && t.startsWith(prefix) ? t.slice(prefix.length) : t)));
  return tools.filter((t) => !theirs.has(t.name));
}

// What the gateway records as the actor of an edit made through this server.
export const actorFor = (profile, P) => (profile === "external" && P?.gateway?.ACTORS?.includes("agent") ? "agent" : "director");

// The argv a client runs: [script, --profile, …]. Used by the director's config and /api/mcp/config.
export const serverArgs = ({ profile = "external", root = null, request = null } = {}) =>
  [SCRIPT, "--profile", profile, ...(root ? ["--root", root] : []), ...(request ? ["--request", request] : [])];

export function parseArgs(argv) {
  const o = { root: null, profile: "external", request: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--root" || k === "--profile" || k === "--request") {
      if (v == null || v.startsWith("--")) throw new Error(`${k} cần một giá trị`);
      o[k.slice(2)] = v; i++;
    } else throw new Error(`không hiểu tham số ${k}`);
  }
  if (!PROFILES.includes(o.profile)) throw new Error(`--profile là ${PROFILES.join(" | ")}`);
  if (o.request != null && !/^[A-Za-z0-9._-]{1,80}$/.test(o.request)) throw new Error("--request không hợp lệ");
  return o;
}

// The JSON-RPC handler for one server process. dir: the tools folder (tests pass their own).
export async function studioHandler({ root, profile = "external", request = null, P, dir, studio } = {}) {
  if (P === undefined) { try { P = await loadProvider(); } catch (e) { process.stderr.write(`motion-studio mcp: chưa có provider (${e.message}); tool cần provider sẽ báo lỗi\n`); P = null; } }
  const all = await loadTools(...(dir ? [dir] : []));
  const tools = toolsForProfile(profile, all, P);
  const names = new Set(tools.map((t) => t.name));
  const env = { ...toolEnv({ root, P, ...(studio ? { studio } : {}) }), profile, request, actor: actorFor(profile, P) };
  return createHandler({
    serverInfo: { name: SERVER_NAME, title: "Motion Studio", version: VERSION },
    instructions: "Tool của Motion Studio cho các dự án video trong thư mục gốc. Đọc trước khi sửa: project_summary hoặc project_get lấy version, rồi project_patch với base là version đó. Thao tác media ghi biên nhận trong .opus/receipts/ của dự án.",
    // Annotations (MCP 2025-03-26+) tell a client which tools only read; some auto-approve those.
    // An edit of project.json is undoable (project_undo), so no tool is marked destructive.
    listTools: () => tools.map(({ name, title, description, inputSchema, mutates }) => ({
      name, title, description, inputSchema,
      annotations: { title, readOnlyHint: !mutates, destructiveHint: false, openWorldHint: false },
    })),
    hasTool: (name) => names.has(name),
    async callTool(name, args) {
      const r = await callTool(name, args, env, dir ? { dir } : {});
      if (!r.ok) return toolText(r.error, true);
      return toolText(r.result ?? null, r.result?.ok === false);
    },
  });
}

const isMain = () => {
  try { return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === realpathSync(SCRIPT); } catch { return false; }
};

if (isMain()) {
  // stdout is the protocol channel: anything a module logs goes to stderr.
  console.log = (...a) => console.error(...a);
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { process.stderr.write(`motion-studio mcp: ${e.message}\n`); process.exit(2); }
  const handle = await studioHandler({ root: resolve(o.root ?? rootDefault()), profile: o.profile, request: o.request });
  await serve(handle);
  process.exit(0);
}
