import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCompat, findPlugin, loadPlugin } from "../lib/plugin.mjs";
import * as director from "../director.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const OK = { STUDIO_API: 2, SCHEMA: "opus-video/project@1", PLUGIN_VERSION: "2.1.0" };

test("loadPlugin finds the installed plugin and the director uses its tool lists", async () => {
  const api = await loadPlugin();
  assert.equal(api.OV, findPlugin());
  assert.ok(api.STUDIO_API >= 2);
  assert.deepEqual(director.DENIED_TOOLS, api.DENIED_TOOLS);
  assert.deepEqual(director.ALLOWED_TOOLS, api.ALLOWED_TOOLS);
  assert.deepEqual(director.MCP_TOOLS, api.MCP_TOOLS);
});

test("checkCompat accepts plugin 2.x and names what is needed and what is installed", () => {
  assert.equal(checkCompat(OK), null);
  assert.equal(checkCompat({ ...OK, STUDIO_API: 3, PLUGIN_VERSION: "2.9.1" }), null);
  assert.throws(() => checkCompat({ ...OK, STUDIO_API: 1 }), /STUDIO_API cần >= 2, đang có 1/);
  assert.throws(() => checkCompat({ ...OK, PLUGIN_VERSION: "3.0.0" }), /cần bản 2\.x, đang có 3\.0\.0/);
  assert.throws(() => checkCompat({ ...OK, SCHEMA: "x" }), /SCHEMA cần opus-video\/project@1, đang có x/);
});

test("findPlugin takes OPUS_VIDEO_HOME first and skips a folder without studio-api.mjs", () => {
  const plugin = findPlugin();
  assert.equal(findPlugin({ OPUS_VIDEO_HOME: plugin }), plugin);
  const empty = mkdtempSync(join(tmpdir(), "ms-empty-"));
  try { assert.equal(findPlugin({ OPUS_VIDEO_HOME: empty }), findPlugin({})); } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("Studio reaches the plugin only through lib/plugin.mjs", () => {
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.doesNotMatch(src, /\.\.\/scripts\/|skills\/opus-video/, f);
  }
});
