// lib/config.mjs — Motion Studio's own settings: environment names, the state file and the
// workspace defaults. Studio core reads configuration only through this file.
// env(key) reads MOTION_STUDIO_<key> first, then the name Studio used before 1.2 (OLD below);
// an old name prints one deprecation line on stderr per process and name. Old names go in 2.0.
// The state file is ~/.config/motion-studio/studio.json (chmod 600), or $MOTION_STUDIO_STATE.
// migrateState() copies the provider's legacy state file there the first time (never moves or
// deletes it). It holds the running server (pid, port, root, url, token, started) and the
// settings that survive stop and start (SETTINGS).
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const OLD = { ROOT: "OPUS_STUDIO_ROOT", STATE: "OPUS_STUDIO_STATE", COMPRESS: "OPUS_COMPRESS_FINAL", HF_RUNTIME: "OPUS_HF_RUNTIME" };
// The workspace Studio served before the root became a setting; the last fallback until 2.0.
export const LEGACY_ROOT = "/Volumes/2/Edit-Video";
// Keys of studio.json kept when the server stops: the director runner, the last root and the
// agent CLI settings ({ order: { image, vision, text } }, lib/agents/index.mjs).
export const SETTINGS = ["director", "root", "agents"];

const warned = new Set();
export function env(key, source = process.env) {
  const now = source[`MOTION_STUDIO_${key}`];
  if (now) return now;
  const old = OLD[key] ? source[OLD[key]] : undefined;
  if (!old) return undefined;
  if (!warned.has(key)) {
    warned.add(key);
    console.error(`motion-studio: ${OLD[key]} đã cũ, sẽ bỏ ở 2.0; đổi sang MOTION_STUDIO_${key}`);
  }
  return old;
}

export const DEFAULT_STATE = join(homedir(), ".config", "motion-studio", "studio.json");
export const stateFile = (source = process.env) => env("STATE", source) || DEFAULT_STATE;
export const logFile = (source = process.env) => join(dirname(stateFile(source)), "studio.log");

export function readState(file = stateFile()) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
export const settingsOf = (s) => {
  const keep = Object.fromEntries(SETTINGS.filter((k) => s?.[k] !== undefined).map((k) => [k, s[k]]));
  return Object.keys(keep).length ? keep : null;
};
export const runnerSetting = (file = stateFile()) => (readState(file)?.director?.runner === "mcp" ? "mcp" : "cli");

// Copies the first existing legacy file to the default state file when that one is missing and
// no env var overrides the path. Returns the copied path or null. Never touches the legacy file.
export function migrateState(legacy = [], { source = process.env, log = console.error } = {}) {
  if (env("STATE", source) || existsSync(DEFAULT_STATE)) return null;
  const from = legacy.find((f) => f && existsSync(f));
  if (!from) return null;
  mkdirSync(dirname(DEFAULT_STATE), { recursive: true });
  copyFileSync(from, DEFAULT_STATE);
  chmodSync(DEFAULT_STATE, 0o600);
  log(`motion-studio: đã chép trạng thái ${from} sang ${DEFAULT_STATE} (file cũ giữ nguyên)`);
  return from;
}

// The projects folder: --root, $MOTION_STUDIO_ROOT, the root of the last run, LEGACY_ROOT.
export const rootDefault = (source = process.env) => env("ROOT", source) || readState(stateFile(source))?.root || LEGACY_ROOT;
// Render → delivery compression: $MOTION_STUDIO_COMPRESS, else the workspace's own script.
export const compressScript = (root, source = process.env) => env("COMPRESS", source) || join(root, "scripts", "compress-final.sh");
export const hfRuntime = (source = process.env) => env("HF_RUNTIME", source) || null;
// Where the HyperFrames skills are (transition catalog, media scripts): $MOTION_STUDIO_HF_SKILLS,
// else ~/.claude/skills.
export const hfSkills = (source = process.env) => env("HF_SKILLS", source) || join(homedir(), ".claude", "skills");
// The agent registry's probe results ("Thử khả năng"), beside the state file (chmod 600).
export const agentsFile = (source = process.env) => join(dirname(stateFile(source)), "agents.json");
// $MOTION_STUDIO_AGENT_PATH, when set, is the whole search path for agent CLIs (no extra folders).
export const agentPath = (source = process.env) => env("AGENT_PATH", source) || null;
