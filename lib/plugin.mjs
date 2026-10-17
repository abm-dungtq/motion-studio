// plugin.mjs — find the opus-video plugin and load its Studio surface (scripts/studio-api.mjs).
// Search order: $OPUS_VIDEO_HOME, then ~/.claude/skills/opus-video; the first folder holding
// scripts/studio-api.mjs wins. loadPlugin() checks compatibility before Studio uses anything:
// STUDIO_API >= 2, SCHEMA "opus-video/project@1" and plugin major version 2. This is the only
// file in Motion Studio that names a plugin path.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const NEED = { studioApi: 2, schema: "opus-video/project@1", major: 2 };

export function findPlugin(env = process.env) {
  const candidates = [env.OPUS_VIDEO_HOME, join(homedir(), ".claude", "skills", "opus-video")].filter(Boolean).map((d) => resolve(d));
  const dir = candidates.find((d) => existsSync(join(d, "scripts", "studio-api.mjs")));
  if (!dir) throw new Error("Không tìm thấy plugin opus-video. Đặt OPUS_VIDEO_HOME hoặc cài plugin vào ~/.claude/skills/opus-video");
  return dir;
}

// Throws naming the version Studio needs and the one installed; returns null when compatible.
export function checkCompat(api) {
  const major = Number(String(api.PLUGIN_VERSION ?? "").split(".")[0]);
  const problems = [];
  if (!(api.STUDIO_API >= NEED.studioApi)) problems.push(`STUDIO_API cần >= ${NEED.studioApi}, đang có ${api.STUDIO_API ?? "không có"}`);
  if (api.SCHEMA !== NEED.schema) problems.push(`SCHEMA cần ${NEED.schema}, đang có ${api.SCHEMA ?? "không có"}`);
  if (major !== NEED.major) problems.push(`opus-video cần bản ${NEED.major}.x, đang có ${api.PLUGIN_VERSION ?? "không rõ"}`);
  if (problems.length) throw new Error(`Plugin opus-video không tương thích với Motion Studio: ${problems.join("; ")}`);
  return null;
}

export async function loadPlugin(env = process.env) {
  const api = await import(pathToFileURL(join(findPlugin(env), "scripts", "studio-api.mjs")).href);
  checkCompat(api);
  return api;
}
