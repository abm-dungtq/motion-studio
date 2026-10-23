import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterFor, loadProvider, providerStatus } from "../lib/provider.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
// The default adapter module; its ID is the one name Studio core must never spell out.
const A = await adapterFor({});
const OK = { STUDIO_API: 3, SCHEMA: A.NEED.schema, PLUGIN_VERSION: "2.1.0" };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

test("loadProvider returns the contract Studio uses and caches it", async () => {
  const p = await loadProvider();
  assert.equal(p, await loadProvider());
  assert.equal(p.id, A.ID);
  assert.equal(p.home, A.findHome());
  assert.ok(p.api >= 3 && p.api <= 4);
  for (const k of ["load", "validate"]) assert.equal(typeof p.manifest[k], "function", k);
  for (const k of ["patch", "undo", "redo", "readHistory"]) assert.equal(typeof p.gateway[k], "function", k);
  for (const k of ["enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"]) assert.equal(typeof p.requests[k], "function", k);
  assert.equal(p.director.mcpTools.length, 7);
  assert.ok(p.director.mcpTools.every((t) => t.startsWith(p.director.toolPrefix)));
  for (const k of ["timing", "beatGrid", "wordSync", "sfxSync", "cut", "reframe", "qc"]) assert.ok(existsSync(p.commands[k]), `${k}: ${p.commands[k]}`);
  // A command is a script path, or (STUDIO_API 4) a { file, args } object that runs one.
  for (const [k, c] of Object.entries(p.commands)) {
    if (typeof c === "string") { assert.match(c, /^\/.+\.mjs$/, k); continue; }
    assert.match(c?.file, /^\/.+\.mjs$/, k);
    assert.ok(Array.isArray(c.args) && c.args.every((a) => typeof a === "string"), `${k}: args is a list of strings`);
  }
  const env = p.director.childEnv({ id: "r-1" }, { KEEP: "1" });
  assert.equal(env.KEEP, "1");
  assert.ok(Object.values(env).includes("r-1") && Object.values(env).includes("cli"), "the MCP server learns the request and the runner");
  assert.deepEqual(await providerStatus(), { ok: true, provider: { id: p.id, label: p.label, version: p.version, api: p.api } });
});

test("checkCompat accepts STUDIO_API 3 and 4 with plugin 2.x and names what is needed and what is installed", () => {
  assert.equal(A.checkCompat(OK), null);
  assert.equal(A.checkCompat({ ...OK, STUDIO_API: 4, PLUGIN_VERSION: "2.9.1" }), null);
  assert.throws(() => A.checkCompat({ ...OK, STUDIO_API: 2 }), /STUDIO_API cần >= 3, đang có 2/);
  assert.throws(() => A.checkCompat({ ...OK, STUDIO_API: 5 }), /STUDIO_API cần <= 4, đang có 5/);
  assert.throws(() => A.checkCompat({ ...OK, PLUGIN_VERSION: "3.0.0" }), /cần bản 2\.x, đang có 3\.0\.0/);
  assert.throws(() => A.checkCompat({ ...OK, SCHEMA: "x" }), new RegExp(`SCHEMA cần ${esc(A.NEED.schema)}, đang có x`));
});

test("an explicit plugin folder is the only one used: a wrong one is reported, not replaced", async () => {
  const home = A.findHome({});
  assert.equal(A.findHome({ OPUS_VIDEO_HOME: home }), home);
  const empty = mkdtempSync(join(tmpdir(), "ms-empty-"));
  try {
    assert.throws(() => A.findHome({ OPUS_VIDEO_HOME: empty }), (e) => e.code === "NO_PROVIDER" && e.message.includes(empty));
    const st = await providerStatus({ OPUS_VIDEO_HOME: empty });
    assert.equal(st.ok, false);
    assert.equal(st.provider, null);
    assert.equal(st.code, "NO_PROVIDER");
    assert.ok(st.hint);
  } finally { rmSync(empty, { recursive: true, force: true }); }
  await assert.rejects(adapterFor({ MOTION_STUDIO_PROVIDER: "nope" }), /không có provider này/);
});

test("Studio core reaches the provider only through lib/provider.mjs", () => {
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.doesNotMatch(src, /\.\.\/scripts\/|skills\/|providers\//, f);
  }
});

// Allowed: the adapter itself, test fixtures (a real project.json names its schema), the
// changelog and plans (history), and README where it names the default provider.
test("the default provider's name appears nowhere outside its adapter", () => {
  const allowed = new Set([`lib/providers/${A.ID}.mjs`, "CHANGELOG.md", "README.md"]);
  const skipDirs = new Set([".git", ".claude", "node_modules", "plans", "tests/fixtures"]);
  const text = new Set([".mjs", ".js", ".ts", ".tsx", ".json", ".html", ".css", ".md", ".sh", ".txt", ""]);
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e), rel = relative(ROOT, f);
      if (skipDirs.has(rel) || e === "node_modules" || rel === "ui/dist" || e === ".DS_Store") continue;
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (allowed.has(rel) || !text.has(extname(e))) continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (l.toLowerCase().includes(A.ID)) hits.push(`${rel}:${i + 1}`); });
    }
  };
  walk(ROOT);
  assert.deepEqual(hits, []);
});

test("STUDIO_API 4: declared COMMANDS and SKILLS are used; API 3 keeps the fixed script names", async () => {
  const extra = `export const COMMANDS = { pitch: "/x/pitch.mjs", choose: { file: "/x/pitch.mjs", args: ["choose", "--project", "{project}", "--pick", "{pick}"] } };\nexport const SKILLS = ["s-one", "s-two"];`;
  const v4 = fakePlugin({ schema: A.NEED.schema, api: 4, extra });
  const v3 = fakePlugin({ schema: A.NEED.schema, api: 3 });
  try {
    const p4 = await A.create({ OPUS_VIDEO_HOME: v4 });
    assert.equal(p4.api, 4);
    assert.equal(p4.commands.pitch, "/x/pitch.mjs");
    assert.deepEqual(p4.commands.choose.args.slice(0, 2), ["choose", "--project"]);
    assert.equal(p4.commands.render, join(v4, "scripts", "render-final.mjs"), "a command COMMANDS leaves out keeps its file name");
    for (const [k, f] of Object.entries({ timing: "timing.mjs", beatGrid: "beat-grid.mjs", wordSync: "word-sync.mjs", sfxSync: "sfx-sync.mjs", cut: "cut.mjs", reframe: "reframe.mjs", qc: "qc-mp4.mjs" })) {
      assert.equal(p4.commands[k], join(v4, "scripts", f), k);
    }
    assert.match(p4.director.promptFragments().skills, /: s-one, s-two\.$/);
    const p3 = await A.create({ OPUS_VIDEO_HOME: v3 });
    assert.equal(p3.commands.pitch, join(v3, "scripts", "make-pitch.mjs"));
    assert.equal(p3.commands.choose, undefined);
    assert.equal(p3.commands.qc, join(v3, "scripts", "qc-mp4.mjs"), "API 3 has the new commands at their file names too");
    assert.doesNotMatch(p3.director.promptFragments().skills, /s-one/);
  } finally { for (const d of [v4, v3]) rmSync(d, { recursive: true, force: true }); }
});

test("suggest and jev declarations: every mode step is a command, style args carry {style}", async () => {
  const dir = fakePlugin({ schema: A.NEED.schema, api: 4 });
  const extra = `export const OPS = ["set_workflow_mode"];\nexport const COMMANDS = { pitchInit: { file: "/x/make-pitch.mjs", args: ["init", "--project", "{project}", "--directions", "{directions}"] } };`;
  const next = fakePlugin({ schema: A.NEED.schema, api: 4, extra });
  try {
    const p = await A.create({ OPUS_VIDEO_HOME: dir });
    const names = new Set(Object.keys(p.commands));
    for (const [id, m] of Object.entries(p.suggest.modes)) {
      for (const step of m.steps) assert.ok(names.has(step) || step === "choose", `${id}: ${step} is a command`);
    }
    assert.ok(p.suggest.styleArgs.some((a) => a.includes("{style}")));
    assert.equal(typeof p.jev.keyVar, "string");
    assert.ok(p.jev.keyVar.length > 0);
    assert.ok(isAbsolute(p.jev.envFile), p.jev.envFile);
    assert.equal(p.suggest.canSetWorkflowMode, false);
    assert.equal(p.suggest.pitchInit, null);
    assert.equal(p.suggest.readPicks(dir), null, "no pitch/ folder, no picks");
    const q = await A.create({ OPUS_VIDEO_HOME: next });
    assert.equal(q.suggest.canSetWorkflowMode, true);
    assert.ok(q.suggest.pitchInit.args.includes("{directions}"));
    assert.deepEqual(q.suggest.workflowModeOp("nhanh"), { op: "set_workflow_mode", mode: "nhanh" });
  } finally { for (const d of [dir, next]) rmSync(d, { recursive: true, force: true }); }
});
