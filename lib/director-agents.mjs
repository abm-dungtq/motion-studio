// lib/director-agents.mjs — the agent CLIs the director can run on, and how each is started.
// The choice is studio.json director.agent (lib/config.mjs), "claude" when unset; the UI sets it
// with POST /api/director/agent (routes/director-agent.mjs).
//
// Two layers keep the director safe whatever agent runs it:
// 1. Studio's own, the same for every agent: the approval gates (BRIEF.md, the user lines of
//    DEMO.md) are guarded while the job runs (lib/gate-guard.mjs); the provider's scripts refuse
//    the director's marker env themselves; gflow sees an empty home (director.mjs childEnv); every
//    change of the timeline and the end of the request go through MCP tools.
// 2. The agent's own rules, as strong as that agent allows. guard says which:
//    full     Claude Code: allow and deny lists per tool and per Bash pattern, writes only in the cwd
//             (director.mjs claudeArgs, unchanged).
//    rules    OpenCode: a project config with shell "*" denied but the provider's commands, the
//             provider's denied edits, no web, no folder outside the project.
//    sandbox  Codex CLI (also through codex-pool, which picks the account with quota left):
//             workspace-write sandbox (writes only in the project and temp, no network), no
//             approvals, no web search, the user's config.toml not loaded (so only Studio's MCP servers,
//             no user hooks; the login is kept), and
//             execpolicy rules forbidding the denied commands whose prefix is plain words (cp, mv,
//             …). Other commands run, inside the sandbox.
// An agent is selectable when Studio has a runner for it, its CLI is found and not logged out, and
// (any agent but Claude Code, which loads the provider as a plugin) the provider names its MCP
// server. agy has no per-run MCP config (only its user-wide one, which Studio does not edit), so
// it is listed and not selectable; Gemini CLI and cursor-agent have no runner yet.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const ORDER = ["claude", "codex-pool", "codex", "opencode", "agy", "gemini", "cursor-agent"];
export const GUARD_LABEL = { full: "Đầy đủ", rules: "Luật lệnh + Studio", sandbox: "Sandbox + Studio" };

const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
};

// The provider's Claude Code rules (`Bash(x)`, `Edit(p)`, `WebFetch`) in plain form for the other
// agents: { shellAllow, shellDeny, editDeny, web }. `:*` (prefix) becomes `*`; `//abs` (Claude's
// absolute path) becomes `/abs`; MCP tool names and Read/Glob/Grep need no rule elsewhere.
export function plainRules(allowed = [], denied = []) {
  const shell = (r) => /^Bash\((.*)\)$/.exec(r)?.[1].replace(/:\*$/, "*") ?? null;
  const edit = (r) => /^(?:Edit|Write)\((.*)\)$/.exec(r)?.[1].replace(/^\/\//, "/") ?? null;
  return {
    shellAllow: allowed.map(shell).filter(Boolean),
    shellDeny: [...new Set(denied.map(shell).filter(Boolean))],
    editDeny: [...new Set(denied.map(edit).filter(Boolean))],
    web: !denied.some((r) => r === "WebFetch" || r === "WebSearch"),
  };
}

// The plain words before the first wildcard of a shell pattern, or null when it starts with one:
// "cp *" → ["cp"], "node /x/make-pitch.mjs choose*" → ["node", "/x/make-pitch.mjs", "choose"].
// A word cut by the wildcard counts whole only when it is a plain word ("choose*"); a cut path
// ("/x/scripts/*") is dropped, and with it the rule when nothing else is left after "node".
export function prefixWords(pattern) {
  const head = String(pattern).split("*")[0];
  if (!head.trim()) return null;
  const words = head.trim().split(/\s+/);
  if (!/\s$/.test(head) && !/^[A-Za-z][A-Za-z-]*$/.test(words.at(-1))) words.pop();
  return words.length > 1 || (words.length === 1 && words[0] !== "node") ? words : null;
}

// Codex execpolicy rules forbidding the denied commands that have a plain-word prefix.
export function codexRules(shellDeny) {
  const rows = shellDeny.map(prefixWords).filter(Boolean).map((w) => `prefix_rule(pattern = ${JSON.stringify(w)}, decision = "forbidden", justification = "Motion Studio: lệnh này không dành cho đạo diễn")`);
  return rows.length ? `# Written by Motion Studio for its director; rewritten on every run.\n${rows.join("\n")}\n` : "";
}

// A TOML value for codex -c (JSON strings and arrays of strings are valid TOML).
const toml = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(String(x))).join(", ")}]`
  : v && typeof v === "object" ? `{ ${Object.entries(v).map(([k, x]) => `${/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k)} = ${toml(x)}`).join(", ")} }`
  : typeof v === "boolean" ? String(v) : JSON.stringify(String(v)));
// Codex splits -c keys on dots and reads bare TOML keys: server names keep letters, digits and _.
export const codexName = (n) => String(n).replace(/[^A-Za-z0-9_]/g, "_");

// cmd: "codex", or "codex-pool", which passes `exec …` on to the codex of the account it picks.
const codexPlan = (cmd) => ({ bin, dir, prompt, sid, model, servers, rules }) => {
  const c = (k, v) => ["-c", `${k}=${toml(v)}`];
  const mcp = Object.entries(servers).flatMap(([name, s]) => {
    const k = `mcp_servers.${codexName(name)}`;
    return [...c(`${k}.command`, s.command), ...c(`${k}.args`, s.args ?? []), ...(s.env && Object.keys(s.env).length ? c(`${k}.env`, s.env) : [])];
  });
  const policy = codexRules(rules.shellDeny);
  const files = policy ? [[join(dir, ".codex", "rules", "motion-studio.rules"), policy]] : [];
  return {
    cmd: bin ?? cmd,
    args: ["exec", ...(sid ? ["resume", sid] : []), "--json", "--skip-git-repo-check", "--ignore-user-config",
      ...c("sandbox_mode", "workspace-write"), ...c("approval_policy", "never"),
      ...c("sandbox_workspace_write.network_access", false), ...c("web_search", "disabled"),
      ...c("shell_environment_policy.inherit", "all"),
      ...(model ? ["-m", model] : []), ...mcp, prompt],
    files,
  };
};

// codex exec --json: thread.started, item.started / item.completed (agent_message, mcp_tool_call,
// command_execution, file_change, error), turn.completed, turn.failed, error.
function codexRead(e, state) {
  if (e.type === "thread.started") { state.session = e.thread_id ?? state.session; return `Phiên ${e.thread_id ?? "?"}`; }
  const it = e.item ?? {};
  if (e.type === "item.started" && it.type === "mcp_tool_call") return `→ ${it.tool ?? "?"}`;
  if (e.type === "item.started" && it.type === "command_execution") return `$ ${String(it.command ?? "").slice(0, 300)}`;
  if (e.type === "item.completed" && it.type === "agent_message") { state.result = it.text ?? ""; return it.text || null; }
  if (e.type === "item.completed" && it.type === "file_change") return `sửa ${(it.changes ?? []).map((x) => x.path).join(", ")}`;
  if (e.type === "item.completed" && it.type === "error") return `lỗi: ${it.message ?? ""}`;
  if (e.type === "turn.failed" || e.type === "error") { state.isError = true; return `lỗi: ${e.error?.message ?? e.message ?? "không rõ"}`; }
  if (e.type === "turn.completed") return "Kết quả: xong";
  return null;
}

// The MCP servers of the user's own OpenCode config (opencode.json or .jsonc, comments allowed):
// the project config turns them off so the director only has Studio's (an entry without type and
// command is skipped as malformed, so the full shape).
export function opencodeUserServers(env = process.env) {
  const dir = join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "opencode");
  const names = new Set();
  for (const f of ["opencode.json", "opencode.jsonc", "config.json"]) {
    let text;
    try { text = readFileSync(join(dir, f), "utf8"); } catch { continue; }
    try {
      const c = JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1"));
      const m = c?.mcp?.servers ?? c?.mcp ?? {};
      for (const n of Object.keys(m)) if (n !== "servers") names.add(n);
    } catch { /* unreadable: nothing to turn off */ }
  }
  return [...names];
}

// OpenCode reads <cwd>/.opencode/opencode.json (checked against opencode 2.0.32 with `opencode
// debug config`); Studio rewrites that file on every run. Rules: the last matching one wins.
export function opencodeConfig({ servers, rules, userServers = [] }) {
  const bash = { "*": "deny" };
  for (const p of rules.shellAllow) bash[p] = "allow";
  for (const p of rules.shellDeny) bash[p] = "deny";
  const edit = { "*": "allow", ".opencode/**": "deny", ".codex/**": "deny" };
  for (const p of rules.editDeny) edit[p] = "deny";
  return {
    $schema: "https://opencode.ai/config.json",
    mcp: { servers: Object.fromEntries([...userServers.filter((n) => !servers[n]).map((n) => [n, { type: "local", command: ["false"], disabled: true }]), ...Object.entries(servers).map(([n, s]) => [n, { type: "local", command: [s.command, ...(s.args ?? [])], ...(s.env && Object.keys(s.env).length ? { environment: s.env } : {}), disabled: false }])]) },
    permission: { edit, bash, webfetch: rules.web ? "allow" : "deny", websearch: rules.web ? "allow" : "deny", external_directory: "deny" },
  };
}

// --standalone: a private server for the run, so it reads this project's config afresh rather than
// sharing the background service.
function opencodePlan({ bin, dir, prompt, sid, model, servers, rules, env }) {
  return {
    cmd: bin ?? "opencode",
    args: ["run", "--standalone", "--format", "json", "--auto", ...(model ? ["--model", model] : []), ...(sid ? ["--session", sid] : []), prompt],
    files: [[join(dir, ".opencode", "opencode.json"), JSON.stringify(opencodeConfig({ servers, rules, userServers: opencodeUserServers(env) }), null, 2) + "\n"]],
  };
}

// opencode run --format json: one event per line with a sessionID; text and tool parts, errors.
function opencodeRead(e, state) {
  const sid = e.sessionID ?? e.part?.sessionID ?? e.properties?.sessionID;
  if (sid && !state.session) state.session = sid;
  const part = e.part ?? {};
  if (e.type === "text" || part.type === "text") {
    const t = part.text ?? e.text ?? "";
    if (t) { state.result = t; return t; }
    return null;
  }
  if (e.type === "tool_use" || part.type === "tool") return `→ ${part.tool ?? e.tool ?? "?"}`;
  if (e.type === "error") { state.isError = true; return `lỗi: ${e.error?.data?.message ?? e.error?.message ?? e.message ?? "không rõ"}`; }
  return null;
}

const CODEX_RESUME = /no (?:session|conversation|thread|rollout)[^\n]*(?:found|with)|session .*not found|could not (?:find|resume)/i;

// id → runner. claude is run by director.mjs itself (claudeArgs/reader); blocked: why not.
export const DIRECTORS = {
  claude: { id: "claude", label: "Claude Code", guard: "full" },
  "codex-pool": { id: "codex-pool", label: "Codex (codex-pool)", guard: "sandbox", plan: codexPlan("codex-pool"), read: codexRead, resumeFailed: CODEX_RESUME },
  codex: { id: "codex", label: "Codex CLI", guard: "sandbox", plan: codexPlan("codex"), read: codexRead, resumeFailed: CODEX_RESUME },
  opencode: { id: "opencode", label: "OpenCode", guard: "rules", plan: opencodePlan, read: opencodeRead, resumeFailed: /session.*(?:not found|does not exist)/i },
  agy: { id: "agy", label: "Antigravity (agy)", guard: null, blocked: "agy chỉ nạp MCP từ cấu hình chung của máy, không nhận cấu hình riêng cho từng lượt chạy; Studio không sửa cấu hình đó." },
  gemini: { id: "gemini", label: "Gemini CLI", guard: null, blocked: "Studio chưa có cách chạy đạo diễn bằng Gemini CLI." },
  "cursor-agent": { id: "cursor-agent", label: "Cursor Agent", guard: null, blocked: "Studio chưa có cách chạy đạo diễn bằng Cursor Agent." },
};

// The plan of one run: { cmd, args, files } after writing files. ctx: { id, bin, dir, prompt, sid,
// model, servers: { name: { command, args, env } }, allowed, denied }.
export function planRun(ctx) {
  const d = DIRECTORS[ctx.id];
  if (!d?.plan) throw new Error(`${d?.label ?? ctx.id} không chạy được đạo diễn: ${d?.blocked ?? "không có cách chạy"}`);
  const plan = d.plan({ ...ctx, rules: plainRules(ctx.allowed, ctx.denied) });
  for (const [f, text] of plan.files) write(f, text);
  return plan;
}

// One output line → the text kept in the job log (null drops it); fills state { session, result, isError }.
export function readerFor(id, state) {
  const d = DIRECTORS[id];
  return (line, stream) => {
    if (stream === "stderr" || !line.startsWith("{")) return line;
    let e;
    try { e = JSON.parse(line); } catch { return line; }
    return d.read(e, state);
  };
}

// Whether id can run the director now: { selectable, reason }. row: the agent registry's scan row
// of that CLI (found, error, logged_in), or null when unknown; P: the provider.
export function selectable(id, row, P) {
  const d = DIRECTORS[id];
  if (!d) return { selectable: false, reason: "Studio không biết agent này." };
  if (d.blocked) return { selectable: false, reason: d.blocked };
  if (row && !row.found) return { selectable: false, reason: `Chưa cài ${d.label} trên máy.` };
  if (row?.error) return { selectable: false, reason: `${d.label} lỗi khi dò.` };
  if (row?.logged_in === false) return { selectable: false, reason: `${d.label} chưa đăng nhập.` };
  if (row?.quota && Array.isArray(row.quota.accounts) && !row.quota.next) return { selectable: false, reason: `${d.label}: không tài khoản nào còn quota.` };
  if (id !== "claude" && !P?.director?.mcpServer) return { selectable: false, reason: "Provider không khai báo MCP server cho agent khác Claude Code." };
  return { selectable: true, reason: null };
}

// The director agents for the UI: [{ id, label, guard, guard_label, found, version, logged_in, selectable, reason }].
export function directorAgents(scan, P, chosen) {
  const rows = new Map((scan?.agents ?? []).map((a) => [a.id, a]));
  return ORDER.map((id) => {
    const d = DIRECTORS[id];
    const row = rows.get(id) ?? null;
    return {
      id, label: d.label, guard: d.guard, guard_label: d.guard ? GUARD_LABEL[d.guard] : null,
      found: row ? Boolean(row.found) : null, version: row?.version ?? null, logged_in: row?.logged_in ?? null,
      chosen: id === chosen, ...selectable(id, row, P),
    };
  });
}
