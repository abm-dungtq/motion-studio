// studio/agent.mjs — "Agent trên máy": is `claude` installed and logged in, which agent CLI and
// runner the director uses (director: the chosen agent, found, logged in, its guard level), the
// project's last director job, and whether ffprobe/ffmpeg run. Tool checks are cached
// 30 s per PATH. `claude auth status` prints JSON that also holds the account email and
// organisation: only Boolean(loggedIn) leaves this module, nothing of it is logged.
// agents is the short form of the last agent CLI scan (lib/agents/index.mjs), or null before the
// first one: this call never starts a scan (GET /api/agents does).
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { listJobs } from "./jobs.mjs";
import { KIND as DIRECTOR, runnerSetting } from "./director.mjs";
import { peekAgents, scanAgent, summarize } from "./lib/agents/index.mjs";
import { directorAgentSetting } from "./lib/config.mjs";
import { DIRECTORS, GUARD_LABEL } from "./lib/director-agents.mjs";

const CACHE_MS = 30000;
let cache = null; // { at, path, tools }
const others = new Map(); // agent id → { at, path, row }

const exec = (cmd, args, timeout) => new Promise((res) => {
  execFile(cmd, args, { encoding: "utf8", timeout, maxBuffer: 1 << 20, shell: false }, (err, stdout) => res({ err, stdout: stdout ?? "" }));
});
// ffprobe/ffmpeg live in /opt/homebrew/bin, which a Studio started from launchd may not have on PATH.
const bin = (name) => (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name);

async function claudeStatus() {
  const v = await exec("claude", ["--version"], 5000);
  if (v.err) return v.err.code === "ENOENT" ? { found: false, version: null, logged_in: null } : { found: true, version: null, logged_in: null };
  const version = v.stdout.split("\n")[0].trim() || null;
  const a = await exec("claude", ["auth", "status"], 8000);
  let logged_in = null;
  if (!a.err) { try { logged_in = Boolean(JSON.parse(a.stdout).loggedIn); } catch { /* not JSON: unknown */ } }
  return { found: true, version, logged_in };
}

async function tools() {
  const path = process.env.PATH ?? "";
  if (cache && cache.path === path && Date.now() - cache.at < CACHE_MS) return cache.tools;
  const [claude, fp, fm] = await Promise.all([claudeStatus(), exec(bin("ffprobe"), ["-version"], 5000), exec(bin("ffmpeg"), ["-version"], 5000)]);
  const t = { claude, ffprobe: !fp.err, ffmpeg: !fm.err };
  cache = { at: Date.now(), path, tools: t };
  return t;
}

// The chosen director agent: { id, label, guard, guard_label, found, version, logged_in }. Claude Code
// comes from the checks above; another agent from one registry scan of that CLI, cached 30 s.
async function directorStatus(claude) {
  const id = directorAgentSetting();
  const d = DIRECTORS[id] ?? { label: id, guard: null };
  const head = { id, label: d.label, guard: d.guard ?? null, guard_label: d.guard ? GUARD_LABEL[d.guard] : null };
  if (id === "claude") return { ...head, found: claude.found, version: claude.version, logged_in: claude.logged_in };
  const path = process.env.PATH ?? "";
  let c = others.get(id);
  if (!c || c.path !== path || Date.now() - c.at >= CACHE_MS) {
    const row = await scanAgent(id).catch(() => null);
    c = { at: Date.now(), path, row };
    others.set(id, c);
  }
  const r = c.row;
  return { ...head, found: Boolean(r?.found && !r.error), version: r?.version ?? null, logged_in: r?.logged_in ?? null };
}

// { claude: { found, version, logged_in }, director, runner, last_job: { status, code, started } | null, ffprobe, ffmpeg, agents }
export async function agentStatus({ name = null } = {}) {
  const t = await tools();
  const jobs = name ? listJobs(name).filter((j) => j.kind === DIRECTOR).sort((a, b) => String(a.started).localeCompare(String(b.started))) : [];
  const j = jobs.at(-1);
  return { claude: t.claude, director: await directorStatus(t.claude), runner: runnerSetting(), last_job: j ? { status: j.status, code: j.code, started: j.started } : null, ffprobe: t.ffprobe, ffmpeg: t.ffmpeg, agents: summarize(peekAgents()) ?? undefined };
}
