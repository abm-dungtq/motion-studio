// lib/mcp/protocol.mjs — the MCP stdio frame, Node built-ins only (Studio has no npm dependency,
// so no @modelcontextprotocol/sdk). Newline-delimited JSON-RPC 2.0 on stdin/stdout: one message
// per line, no embedded newlines; stdout carries protocol messages only, logs go to stderr.
// Methods: initialize, notifications/initialized, notifications/cancelled, ping, tools/list,
// tools/call. Targets MCP protocol revision 2025-06-18 and answers the older 2025-03-26 and
// 2024-11-05 when a client asks for them (the server echoes a supported version, else its latest).
// Spec: https://modelcontextprotocol.io/specification/2025-06-18 (repository
// https://github.com/modelcontextprotocol/modelcontextprotocol, MIT). The frame follows the
// default provider plugin's own MCP server (same author, MIT), made async for tools that wait on jobs.
import { createInterface } from "node:readline";

export const LATEST = "2025-06-18";
export const VERSIONS = [LATEST, "2025-03-26", "2024-11-05"];
export const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// A tool result as MCP content: the value as JSON text; isError marks a failed call (the model sees
// the message and can correct itself, unlike a JSON-RPC error).
export const toolText = (value, isError = false) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError });

// handler({ serverInfo, instructions?, listTools() → [{ name, title, description, inputSchema }],
// callTool(name, args) → MCP tool result, hasTool(name) }) → async (msg) → reply | null.
export function createHandler({ serverInfo, instructions = null, listTools, callTool, hasTool }) {
  return async function handle(msg) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return rpcError(msg && typeof msg === "object" && !Array.isArray(msg) ? msg.id : null, ERR.invalidRequest, "Invalid Request");
    }
    const isNote = msg.id === undefined;
    const reply = (result) => (isNote ? null : { jsonrpc: "2.0", id: msg.id, result });
    switch (msg.method) {
      case "initialize": {
        const asked = msg.params?.protocolVersion;
        return reply({
          protocolVersion: VERSIONS.includes(asked) ? asked : LATEST,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          ...(instructions ? { instructions } : {}),
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: await listTools() });
      case "tools/call": {
        const name = msg.params?.name;
        if (typeof name !== "string" || !(await hasTool(name))) return isNote ? null : rpcError(msg.id, ERR.invalidParams, `Unknown tool: ${name}`);
        const args = msg.params.arguments ?? {};
        return reply(await callTool(name, args));
      }
      default:
        return isNote ? null : rpcError(msg.id, ERR.methodNotFound, `Method not found: ${msg.method}`);
    }
  };
}

// Reads lines from input until it ends, answers each through handle. A line that is not JSON gets
// a -32700 reply and the server keeps going. Resolves when input closed and every reply is written,
// so a client that dies (stdin closed) never leaves the process behind.
export function serve(handle, { input = process.stdin, write = (s) => process.stdout.write(s), log = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  const send = (o) => { if (o) write(JSON.stringify(o) + "\n"); };
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { send(rpcError(null, ERR.parse, "Parse error")); return; }
    const p = (async () => {
      try { send(await handle(msg)); } catch (e) {
        log(`mcp: ${msg?.method ?? "?"}: ${e.stack ?? e.message}`);
        if (msg && msg.id !== undefined) send(rpcError(msg.id, ERR.internal, e.message));
      }
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
  });
  return new Promise((res) => rl.on("close", () => Promise.allSettled([...pending]).then(() => res())));
}
