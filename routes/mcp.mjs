// routes/mcp.mjs — GET /api/mcp/config: how to connect an outside MCP client (Claude Code, Codex,
// agy, opencode) to Motion Studio's MCP server (mcp/studio-mcp.mjs, profile external). Studio only
// answers the snippets; it never writes another CLI's config. Works without a provider.
import { SERVER_NAME, serverArgs } from "../mcp/studio-mcp.mjs";

// POSIX shell quoting for the copy-paste commands.
export const sh = (s) => (/^[A-Za-z0-9_./:=@%+-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
const toml = (s) => JSON.stringify(String(s));

export function mcpConfig({ root, node = process.execPath }) {
  const args = serverArgs({ profile: "external", root });
  const line = [node, ...args].map(sh).join(" ");
  return {
    server: SERVER_NAME, command: node, args, root,
    json: { mcpServers: { [SERVER_NAME]: { command: node, args } } },
    claude: `claude mcp add ${SERVER_NAME} -- ${line}`,
    codex: `codex mcp add ${SERVER_NAME} -- ${line}`,
    codex_toml: `[mcp_servers.${SERVER_NAME}]\ncommand = ${toml(node)}\nargs = [${args.map(toml).join(", ")}]\n`,
    agy: `agy mcp add ${SERVER_NAME} -- ${line}`,
    opencode: { mcp: { [SERVER_NAME]: { type: "local", command: [node, ...args], enabled: true } } },
  };
}

export const ROUTES = [
  { method: "GET", path: "/api/mcp/config", provider: false, handler: (c) => mcpConfig({ root: c.root }) },
];
