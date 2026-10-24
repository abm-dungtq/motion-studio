// lib/provider.mjs — what Motion Studio needs from the tool that owns project.json, and where it
// gets it. Studio core imports only this file; adapters live in lib/providers/ (one module per
// provider, shipped with Studio: no folder outside the repo is ever loaded).
// Adapter module: ID, LABEL, DEFAULT (true for the default one), HINT (how to install it),
// LEGACY_STATE (optional old Studio state file), key(env) (optional: the env that picks the
// install, so a cached provider is reused only for the same one) and create(env) → the contract below, after its
// own compatibility check. The adapter is $MOTION_STUDIO_PROVIDER when set, else the DEFAULT one.
//
// provider = {
//   id, label, version, api, home,
//   manifest: { load, validate, schema, file },
//   gateway:  { patch, undo, redo, redoTarget, readHistory, derive, EXIT, ACTORS },
//   requests: { enqueue, list, next, finish, cancelRequest, ask, answer, expireWaiting,
//               STATUSES, ASK_KINDS, ASK_GATES,
//               module },                              // path of the queue module, for child processes
//   director: { toolPrefix, mcpTools, allowedTools, deniedTools, toolsLabel,
//               voiceDeniedTools,                      // also denied for a series episode, [] when none
//               promptFragments() → { role, skills, voiceGate, secrets, retime, pitch },
//               childEnv(req, base) },
//   commands: { render, mix, pitch, import, demo, recipe, preflight, cases, styles,
//               timing, beatGrid, wordSync, sfxSync, cut, reframe, qc, directions,
//               choose? },   // each an absolute .mjs path run as `node <path> …`, or (STUDIO_API 4)
//                            // { file, args } with {project}/{pick} placeholders (gates.mjs)
//   library:  { directionsFile, stylesDir, casesFile, caseFeaturesFile },
//   jev:      { keyVar, envFile },                  // where the TypeSafe key is read (never stored by Studio)
//   suggest:  { modes, styleArgs, scriptDir, readPicks(dir), pitchInit, canSetWorkflowMode, workflowModeOp(mode) },
//   voice:    { canSetSpeaker, canSetAudio },             // gateway ops set_line_speaker / set_line_audio
//   projectEnv,                                            // extra env for new-project.sh
// }
//
// loadProvider() is lazy and keeps a provider once it loaded; a failure is not kept, so
// installing the plugin works without restarting Studio. It throws an Error with code
// NO_PROVIDER or INCOMPATIBLE and a hint; providerStatus() turns that into data for the API.
import { readdirSync } from "node:fs";

const DIR = new URL("./providers/", import.meta.url);
// What a user runs to install or update the provider (lib/setup.mjs).
export const SETUP_COMMAND = "npm run setup";
const NAME = /^[a-z0-9][a-z0-9-]*$/;
let adapters = null; // Promise<module[]>
let loaded = null;   // { key, provider }

function allAdapters() {
  adapters ??= Promise.all(readdirSync(DIR).filter((f) => f.endsWith(".mjs")).sort().map((f) => import(new URL(f, DIR).href)));
  return adapters;
}

export async function adapterFor(env = process.env) {
  const all = await allAdapters();
  const want = env.MOTION_STUDIO_PROVIDER;
  if (want) {
    const a = NAME.test(want) ? all.find((m) => m.ID === want) : null;
    if (!a) throw Object.assign(new Error(`MOTION_STUDIO_PROVIDER=${want}: không có provider này (có: ${all.map((m) => m.ID).join(", ") || "không có"})`), { code: "NO_PROVIDER" });
    return a;
  }
  const a = all.find((m) => m.DEFAULT) ?? all[0];
  if (!a) throw Object.assign(new Error("Motion Studio không có provider nào trong lib/providers/"), { code: "NO_PROVIDER" });
  return a;
}

export async function loadProvider(env = process.env) {
  const a = await adapterFor(env);
  const key = `${a.ID}\0${a.key?.(env) ?? ""}`;
  if (loaded?.key === key) return loaded.provider;
  let provider;
  try { provider = await a.create(env); } catch (e) {
    throw Object.assign(e, { code: e.code ?? "NO_PROVIDER", provider: a.ID, hint: a.HINT ?? null });
  }
  loaded = { key, provider };
  return provider;
}

// { ok: true, provider: { id, label, version, api } } or { ok: false, provider: null, error, code, hint, setup }.
export async function providerStatus(env = process.env) {
  try {
    const p = await loadProvider(env);
    return { ok: true, provider: { id: p.id, label: p.label, version: p.version, api: p.api } };
  } catch (e) {
    return { ok: false, provider: null, error: e.message, code: e.code ?? "NO_PROVIDER", hint: e.hint ?? null, setup: SETUP_COMMAND };
  }
}

// State files Studio used before it had its own (lib/config.mjs migrateState copies the first).
export async function legacyStateFiles() {
  return (await allAdapters()).map((m) => m.LEGACY_STATE).filter(Boolean);
}
