// lib/providers/opus-video.mjs — the default provider: the opus-video Claude Code plugin
// (https://github.com/abm-dungtq/opus-video). This is the only file of Motion Studio that names
// the plugin, its paths, its environment names and its scripts.
// The plugin is $OPUS_VIDEO_HOME when set (only that folder: a wrong path is reported, not
// replaced by another install), else ~/.claude/skills/opus-video. Studio imports one file of
// it, scripts/studio-api.mjs, and checks compatibility first: STUDIO_API 3 or 4, SCHEMA
// "opus-video/project@1" and plugin major version 2. create() returns the provider contract of
// lib/provider.mjs; importing this module touches nothing of the plugin.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
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
      ...(api.COMMANDS ?? {}),
    },
    library: { directionsFile: api.DIRECTIONS_FILE, stylesDir: join(home, "data", "styles") },
    // new-project.sh of the workspace finds the plugin through OV.
    projectEnv: { OV: home, PROVIDER_HOME: home },
  };
}

