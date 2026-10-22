import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { adapterFor } from "../lib/provider.mjs";
import { chooseArgv } from "../gates.mjs";

// Runs against a local clone of the plugin with STUDIO_API 4 (the upstream branch that adds
// COMMANDS and SKILLS). Skipped when that clone is not on this machine, so CI never needs it.
const A = await adapterFor({});
const CLONE = process.env.MOTION_STUDIO_API4_CLONE || `/Volumes/2/${A.ID}-upstream-work`;
const skip = existsSync(join(CLONE, "scripts", "studio-api.mjs")) ? false : `no API 4 clone at ${CLONE}`;

test("a real STUDIO_API 4 plugin: COMMANDS, COMMANDS.choose and SKILLS reach Studio", { skip }, async () => {
  const p = await A.create({ OPUS_VIDEO_HOME: CLONE });
  assert.equal(p.api, 4);
  assert.equal(p.home, CLONE);
  for (const [k, f] of Object.entries(p.commands)) if (k !== "choose") assert.ok(existsSync(f), `${k}: ${f}`);
  assert.equal(typeof p.commands.choose.file, "string");
  const argv = chooseArgv(p.commands, "/w/demo", 2);
  assert.ok(existsSync(argv[0]));
  assert.deepEqual(argv.slice(1, 5), ["choose", "--project", "/w/demo", "--pick"]);
  assert.equal(argv[5], "2");
  assert.match(p.director.promptFragments().skills, /ov-studio, ov-build, ov-script, ov-audio, ov-deliver/);
  assert.equal(p.director.mcpTools.length, 7);
});
