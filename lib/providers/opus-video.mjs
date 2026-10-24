// lib/providers/opus-video.mjs — the default provider: the opus-video Claude Code plugin
// (https://github.com/abm-dungtq/opus-video). This is the only file of Motion Studio that names
// the plugin, its paths, its environment names and its scripts.
// The plugin is $OPUS_VIDEO_HOME when set (only that folder: a wrong path is reported, not
// replaced by another install), else ~/.claude/skills/opus-video. Studio imports one file of
// it, scripts/studio-api.mjs, and checks compatibility first: STUDIO_API 3 or 4, SCHEMA
// "opus-video/project@1" and plugin major version 2. create() returns the provider contract of
// lib/provider.mjs; importing this module touches nothing of the plugin.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ID = "opus-video";
export const LABEL = "Plugin opus-video";
export const DEFAULT = true;
// Studio lived inside this plugin before 1.0 and kept its state here; lib/config.mjs copies it.
export const LEGACY_STATE = join(homedir(), ".config", "opus-video", "studio.json");
export const NEED = { studioApi: 3, maxStudioApi: 4, schema: "opus-video/project@1", major: 2 };
export const HINT = "Chạy npm run setup trong thư mục Motion Studio để cài plugin opus-video bản mới nhất, rồi tải lại trang. Plugin ở chỗ khác thì đặt OPUS_VIDEO_HOME là thư mục plugin và khởi động lại Studio.";

// The provider loaded for one OPUS_VIDEO_HOME is reused only for the same value.
export const key = (env = process.env) => env.OPUS_VIDEO_HOME ?? "";

const DEFAULT_HOME = join(homedir(), ".claude", "skills", "opus-video");
const hasApi = (d) => existsSync(join(d, "scripts", "studio-api.mjs"));

export function findHome(env = process.env) {
  if (env.OPUS_VIDEO_HOME) {
    const d = resolve(env.OPUS_VIDEO_HOME);
    if (!hasApi(d)) throw Object.assign(new Error(`OPUS_VIDEO_HOME=${d} không chứa scripts/studio-api.mjs của plugin opus-video`), { code: "NO_PROVIDER" });
    return d;
  }
  if (!hasApi(DEFAULT_HOME)) throw Object.assign(new Error("Không tìm thấy plugin opus-video ở ~/.claude/skills/opus-video"), { code: "NO_PROVIDER" });
  return DEFAULT_HOME;
}

// Throws naming the version Studio needs and the one installed; returns null when compatible.
export function checkCompat(api) {
  const major = Number(String(api.PLUGIN_VERSION ?? "").split(".")[0]);
  const problems = [];
  if (!(api.STUDIO_API >= NEED.studioApi)) problems.push(`STUDIO_API cần >= ${NEED.studioApi}, đang có ${api.STUDIO_API ?? "không có"}`);
  else if (api.STUDIO_API > NEED.maxStudioApi) problems.push(`STUDIO_API cần <= ${NEED.maxStudioApi}, đang có ${api.STUDIO_API}`);
  if (api.SCHEMA !== NEED.schema) problems.push(`SCHEMA cần ${NEED.schema}, đang có ${api.SCHEMA ?? "không có"}`);
  if (major !== NEED.major) problems.push(`opus-video cần bản ${NEED.major}.x, đang có ${api.PLUGIN_VERSION ?? "không rõ"}`);
  if (problems.length) throw Object.assign(new Error(`Plugin opus-video không tương thích với Motion Studio: ${problems.join("; ")}`), { code: "INCOMPATIBLE" });
  return null;
}

// The director prompt lines that are knowledge of this plugin (skills, scripts, the key file).
// STUDIO_API 4 may list the skills itself (SKILLS); the fixed line below is the API 3 list.
function promptFragments(home, skills) {
  return {
    role: "đạo diễn AI của opus-video",
    skills: Array.isArray(skills) && skills.length ? `Dùng các skill của plugin opus-video: ${skills.join(", ")}.` : "Dùng các skill của plugin opus-video (ov-studio cho timeline, ov-build cho HTML, ov-script cho lời, ov-audio cho giọng, ov-deliver cho bản giao).",
    voiceGate: "Câu thoại nào đổi lời phải qua cổng viet-pro (ov-script) đạt PASS trước khi lồng tiếng lại (ov-audio). Không lách cổng bằng --lang en.",
    secrets: "Không đọc, không in ~/.config/opus-video/.env hay bất kỳ khoá API nào.",
    retime: `Đổi thời gian hoặc chuyển động thì chạy lại node ${home}/scripts/recipe-pack.mjs --project . và node ${home}/scripts/make-demo.mjs --animatic, rồi ghi trong biên nhận rằng animatic cần người dùng duyệt lại. Không tự ghi dòng approval.`,
    pitch: "chạy make-pitch.mjs để có các pitch; mỗi option có id là số pick của make-pitch và label là tên hướng; styleframe trong artifacts",
  };
}

// The plugin's four ways of working (skills/opus-video/SKILL.md): desc is the Choice criterion
// Jev reads, steps are command names of this provider in order, pitch says the three-styleframe pitch is part of it.
const MODES = Object.freeze({
  "dao-dien": { label: "Đạo diễn đầy đủ", pitch: true, steps: ["pitch", "choose", "recipe", "timing", "beatGrid", "demo", "wordSync", "preflight", "render"],
    desc: "Full direction (default): brief, three styleframe pitches to choose a creative direction, script, voice, build and render. For a new video made from a topic or a brief." },
  nhanh: { label: "Nhanh theo mẫu", pitch: false, steps: ["cases", "recipe", "timing", "demo", "preflight", "render"],
    desc: "Fast, from a template: one reference case replaces the three-styleframe pitch, then script, voice, build and render. For 'make it quickly' or 'make it like this video'." },
  "tu-nhac": { label: "Từ nhạc hoặc footage", pitch: true, steps: ["beatGrid", "cut", "pitch", "choose", "timing", "demo", "preflight", "render"],
    desc: "From music or existing footage: measure the beat grid of the song or cut the footage first, then choose a direction, write the script and build. For music-driven videos or videos built on shot footage." },
  timeline: { label: "Sửa dự án đã có", pitch: false, steps: ["import", "timing", "wordSync", "preflight", "render"],
    desc: "Edit an existing project: import it into the timeline, change shots and lines through the gateway, re-voice only the changed lines and render. For a video that already exists." },
});

// pitch/PICK.json of a project (make-pitch init): [{ n, id, style_profile, dir }] or null.
function readPicks(dir) {
  try {
    const j = JSON.parse(readFileSync(join(dir, "pitch", "PICK.json"), "utf8"));
    return Array.isArray(j?.picks) ? j.picks.map((r) => ({ n: r.n, id: r.id, style_profile: r.style_profile ?? null, dir: r.dir ?? null })) : null;
  } catch { return null; }
}

export async function create(env = process.env) {
  const home = findHome(env);
  const api = await import(pathToFileURL(join(home, "scripts", "studio-api.mjs")).href);
  checkCompat(api);
  const s = (f) => join(api.SCRIPTS, f);
  return {
    id: ID, label: LABEL, version: api.PLUGIN_VERSION, api: api.STUDIO_API, home,
    manifest: { load: api.load, validate: api.validate, schema: api.SCHEMA, file: api.FILE },
    gateway: { patch: api.patch, undo: api.undo, redo: api.redo, redoTarget: api.redoTarget, readHistory: api.readHistory, derive: api.derive, EXIT: api.EXIT, ACTORS: api.ACTORS },
    requests: {
      enqueue: api.enqueue, list: api.list, next: api.next, finish: api.finish, cancelRequest: api.cancelRequest, ask: api.ask, answer: api.answer,
      expireWaiting: api.expireWaiting, STATUSES: api.STATUSES, ASK_KINDS: api.ASK_KINDS, ASK_GATES: api.ASK_GATES, module: s("requests.mjs"),
    },
    director: {
      toolPrefix: api.PREFIX, mcpTools: api.MCP_TOOLS, allowedTools: api.ALLOWED_TOOLS, deniedTools: api.DENIED_TOOLS,
      // Denied as well for an episode of a series (director.mjs voiceDenied); [] for an older plugin.
      voiceDeniedTools: api.VOICE_DENIED_TOOLS ?? [],
      toolsLabel: "tool opus-video",
      promptFragments: () => promptFragments(home, api.SKILLS),
      // The plugin's MCP server reads these two names (studio_request_done closes the request).
      childEnv: (req, base = process.env) => ({ ...base, OPUS_STUDIO_RUNNER: "cli", OPUS_STUDIO_REQUEST: req.id }),
    },
    // STUDIO_API 4 may name its scripts itself (COMMANDS, absolute paths; COMMANDS.choose is
    // { file, args } with {project} and {pick}, see gates.mjs); 3 has them at fixed file names.
    commands: {
      render: s("render-final.mjs"), mix: s("audio-mix.mjs"), pitch: s("make-pitch.mjs"), import: s("manifest-import.mjs"),
      demo: s("make-demo.mjs"), recipe: s("recipe-pack.mjs"), preflight: s("check-preflight.mjs"), cases: s("find-cases.mjs"), styles: s("styles.mjs"),
      // Timing and sync tools, cutting, reframing and MP4 QC: in the plugin since 2.x, not (yet)
      // in COMMANDS, so these file names are their source until COMMANDS names them.
      timing: s("timing.mjs"), beatGrid: s("beat-grid.mjs"), wordSync: s("word-sync.mjs"), sfxSync: s("sfx-sync.mjs"),
      cut: s("cut.mjs"), reframe: s("reframe.mjs"), qc: s("qc-mp4.mjs"),
      // lemo-opuscar canvas layer (fetch | list --json | add | remove), since plugin 2.4.0.
      lemo: s("lemo.mjs"),
      // directions pick | show (--json); not in COMMANDS yet
      directions: s("directions.mjs"),
      ...(api.COMMANDS ?? {}),
    },
    library: {
      directionsFile: api.DIRECTIONS_FILE, stylesDir: join(home, "data", "styles"),
      casesFile: join(home, "data", "cases.jsonl"), caseFeaturesFile: join(home, "data", "case-features.jsonl"),
    },
    // Where the TypeSafe key is read; Studio never stores it.
    jev: { keyVar: "TYPESAFE_API_KEY", envFile: join(homedir(), ".config", "opus-video", ".env") },
    // style_suggest (lib/suggest.mjs, routes/suggest.mjs). styleArgs follow commands.choose's
    // argv; scriptDir holds script/*.txt. Two features are detected, not assumed: pitchInit is
    // the plugin's COMMANDS.pitchInit (a pitch from chosen directions, placeholders {project},
    // {topic}, {aspect}, {category}, {energy}, {directions}) or null; workflow_mode can be written
    // only once the gateway lists set_workflow_mode in OPS.
    suggest: {
      modes: MODES, styleArgs: ["--style-profile", "{style}"], scriptDir: "script", readPicks,
      pitchInit: api.COMMANDS?.pitchInit ?? null,
      canSetWorkflowMode: Array.isArray(api.OPS) && api.OPS.includes("set_workflow_mode"),
      workflowModeOp: (mode) => ({ op: "set_workflow_mode", mode }),
    },
    // Voices by speaker (lib/series-voice.mjs): the gateway ops that set a line's speaker and
    // point it at a new take, detected in OPS like set_workflow_mode.
    voice: {
      canSetSpeaker: Array.isArray(api.OPS) && api.OPS.includes("set_line_speaker"),
      canSetAudio: Array.isArray(api.OPS) && api.OPS.includes("set_line_audio"),
    },
    // Series folders (lib/series.mjs): the declaration file name, the series of a project and
    // the declaration's validator; null for a plugin without them (added under STUDIO_API 4).
    series: api.seriesDirOf ? { file: api.SERIES_FILE, dirOf: api.seriesDirOf, validate: api.validateSeries } : null,
    // new-project.sh of the workspace finds the plugin through OV.
    projectEnv: { OV: home, PROVIDER_HOME: home },
  };
}

// ---- setup: install or update the plugin (bin/motion-studio.mjs setup, lib/setup.mjs) ----------
// "Latest" is the tip of <ref> (default main) of the official repository: its commit from
// `git ls-remote` and its version from .claude-plugin/plugin.json on raw.githubusercontent.com.
// A git checkout is current when HEAD is that commit or already contains it; a copy is current
// when its plugin.json version is not lower. Updating: a git checkout is pulled (--ff-only,
// refused when dirty or on another branch); anything else runs the official install.sh, which
// backs an old copy up to ~/.opus-video-backups/ and never overwrites a git checkout.
export const REPO = "https://github.com/abm-dungtq/opus-video.git";
const RAW = "https://raw.githubusercontent.com/abm-dungtq/opus-video";
const HOSTS = { claude: "--claude", codex: "--codex", all: "--all" };

const semver = (v) => String(v ?? "").split(/[.+-]/).slice(0, 3).map((x) => Number(x) || 0);
export function olderThan(a, b) {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

// The sha that <ref> names in `git ls-remote` output: a peeled tag first, then the tag, then the branch.
export function refCommit(lsRemote, ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  const rows = String(lsRemote).trim().split("\n").filter(Boolean).map((l) => l.split(/\s+/));
  const by = new Map(rows.map(([sha, name]) => [name, sha]));
  return by.get(`refs/tags/${ref}^{}`) ?? by.get(`refs/tags/${ref}`) ?? by.get(`refs/heads/${ref}`) ?? null;
}

const versionAt = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")).version ?? null; } catch { return null; } };

async function installedAt(home, io) {
  if (!existsSync(join(home, ".claude-plugin", "plugin.json"))) return null;
  const out = { version: versionAt(home), kind: "copy", commit: null, branch: null, dirty: false };
  if (!existsSync(join(home, ".git"))) return out;
  const git = (...a) => io.exec("git", ["-C", home, ...a]);
  const head = await git("rev-parse", "HEAD");
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
  const status = await git("status", "--porcelain");
  return { ...out, kind: "git", commit: head.code ? null : head.stdout.trim(), branch: branch.code ? null : branch.stdout.trim(), dirty: status.code !== 0 || status.stdout.trim() !== "" };
}

async function latestOf(ref, io) {
  const ls = await io.exec("git", ["ls-remote", REPO, ref]);
  if (ls.code) throw new Error(`git ls-remote ${REPO} ${ref} lỗi (exit ${ls.code}): ${String(ls.stderr).trim().split("\n").at(-1) ?? ""}`);
  const commit = refCommit(ls.stdout, ref);
  if (!commit) throw new Error(`không có ref ${ref} trên ${REPO}`);
  const manifest = JSON.parse(await io.fetchText(`${RAW}/${commit}/.claude-plugin/plugin.json`));
  return { commit, version: manifest.version ?? null };
}

// { state: missing | outdated | current | unknown, home, installed, latest, error? }
async function check({ env = process.env, ref = "main" } = {}, io) {
  const home = env.OPUS_VIDEO_HOME ? resolve(env.OPUS_VIDEO_HOME) : DEFAULT_HOME;
  const installed = await installedAt(home, io);
  let latest;
  try { latest = await latestOf(ref, io); } catch (e) {
    return { state: installed ? "unknown" : "missing", home, installed, latest: null, ref, error: e.message };
  }
  if (!installed) return { state: "missing", home, installed, latest, ref };
  let current;
  if (installed.kind === "git" && installed.commit) {
    current = installed.commit === latest.commit || (await io.exec("git", ["-C", home, "merge-base", "--is-ancestor", latest.commit, "HEAD"])).code === 0;
  } else current = !olderThan(installed.version, latest.version);
  return { state: current ? "current" : "outdated", home, installed, latest, ref };
}

// { ok, how: "git pull" | "install.sh", error? }. Output of git and the installer goes to the terminal.
async function install(st, { host = "all", ref = "main" } = {}, io) {
  if (st.installed?.kind === "git") {
    if (st.installed.dirty) return { ok: false, error: `${st.home} là git checkout có thay đổi chưa commit; không cập nhật. Commit hoặc stash rồi chạy lại.` };
    if (st.installed.branch !== ref) return { ok: false, error: `${st.home} đang ở ${st.installed.branch ?? "HEAD rời"}, không phải ${ref}; tự chuyển nhánh rồi chạy lại.` };
    const code = await io.run("git", ["-C", st.home, "pull", "--ff-only"]);
    return code === 0 ? { ok: true, how: "git pull" } : { ok: false, how: "git pull", error: `git pull --ff-only lỗi (exit ${code})` };
  }
  if (!HOSTS[host]) return { ok: false, error: `--host là ${Object.keys(HOSTS).join(" | ")}` };
  let script;
  try { script = await io.fetchText(`${RAW}/${ref}/install.sh`); } catch (e) { return { ok: false, error: `không tải được install.sh: ${e.message}` }; }
  const dir = mkdtempSync(join(tmpdir(), "ms-setup-"));
  try {
    const file = join(dir, "install.sh");
    writeFileSync(file, script, { mode: 0o700 });
    const code = await io.run("bash", [file, "--ref", ref, HOSTS[host]]);
    return code === 0 ? { ok: true, how: "install.sh" } : { ok: false, how: "install.sh", error: `install.sh lỗi (exit ${code})` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export const setup = { check, install, hosts: Object.keys(HOSTS) };
