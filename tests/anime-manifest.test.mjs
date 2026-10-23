import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { enable, formatManifest, keepOrder, listBackups, readManifest, rebuild, TEMPLATE_DIR, validate, writeManifest } from "../lib/anime/manifest.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/anime/zoro-manifest.json", import.meta.url));
const ZORO = "/Volumes/2/Edit-Video/zoro-vs-mihawk";
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), "ms-anime-man-")); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const project = (name) => { const d = join(tmp, name); mkdirSync(join(d, "assets", "anim"), { recursive: true }); return d; };
const withZoro = (name) => { const d = project(name); copyFileSync(FIXTURE, join(d, "assets", "anim", "manifest.json")); return d; };

// A small composition the example manifest builds against: two scenes, the two stacks and the
// voice its lipsync track reads.
function exampleProject(name) {
  const d = project(name);
  writeFileSync(join(d, "index.html"), `<!doctype html><html><body>
<div id="s1-hero" class="char"></div><div id="s2-hero" class="char"></div>
<audio id="voice-01" data-start="0.2" src="assets/voice/01.mp3"></audio>
<script>
/* TIMING:BEGIN */
window.TIMING = {"fps":30,"scenes":{"s1":{"start":0,"end":2},"s2":{"start":2,"end":3}}};
/* TIMING:END */
</script></body></html>\n`);
  mkdirSync(join(d, "assets", "voice"), { recursive: true });
  writeFileSync(join(d, "assets", "voice", "01.mp3.words.json"), JSON.stringify([{ word: "xin", start: 0.1, end: 0.4 }, { word: "chào", start: 0.5, end: 0.9 }]));
  mkdirSync(join(d, "assets", "plates", "anim"), { recursive: true });
  for (const p of ["s1-hero-w1", "s1-hero-w2", "s1-hero-m-open", "s1-hero-m-closed", "s1-hero-blink", "s2-k1", "s2-k2"]) writeFileSync(join(d, "assets", "plates", "anim", `${p}.png`), "");
  assert.deepEqual(enable(d).copied.sort(), ["assets/anim/anim.js", "assets/anim/build.mjs", "assets/anim/manifest.example.json", "assets/anim/manifest.json"]);
  copyFileSync(join(d, "assets", "anim", "manifest.example.json"), join(d, "assets", "anim", "manifest.json"));
  return d;
}
const build = (d) => spawnSync(process.execPath, [join(d, "assets", "anim", "build.mjs")], { cwd: d, encoding: "utf8" });

test("the Zoro manifest reads and writes back byte for byte", () => {
  const d = withZoro("roundtrip");
  const before = readFileSync(join(d, "assets", "anim", "manifest.json"), "utf8");
  const m = readManifest(d);
  assert.deepEqual(validate(m.manifest), []);
  const w = writeManifest(d, structuredClone(m.manifest), { baseSha: m.sha });
  const after = readFileSync(join(d, "assets", "anim", "manifest.json"), "utf8");
  assert.equal(after, before);
  assert.equal(JSON.stringify(JSON.parse(after)), JSON.stringify(JSON.parse(before)));
  assert.equal(w.sha, m.sha);
  assert.match(w.backup, /^\.opus\/anim-backups\/.+\.json$/);
  assert.equal(readFileSync(join(d, w.backup), "utf8"), before, "the backup is the old text");
  assert.deepEqual(listBackups(d), [w.backup]);
});

test("keys come back in the order the file had them, unknown keys untouched", () => {
  const d = withZoro("order");
  const m = readManifest(d);
  const st = m.manifest.stacks["s13-zoro"];
  // The editor rebuilds an object with its own key order and changes one value.
  const edited = { impacts: m.manifest.impacts, stacks: { ...m.manifest.stacks, "s13-zoro": { tracks: st.tracks, ...st } }, dir: m.manifest.dir, fps: m.manifest.fps };
  edited.impacts = [...edited.impacts, { at: 18, frames: 2 }];
  writeManifest(d, edited, { baseSha: m.sha });
  const out = readManifest(d);
  assert.deepEqual(Object.keys(out.manifest), ["fps", "dir", "stacks", "impacts"]);
  assert.deepEqual(Object.keys(out.manifest.stacks["s13-zoro"]), Object.keys(st));
  assert.deepEqual(out.manifest.stacks["s13-zoro"].tweens, st.tweens);
  assert.equal(out.manifest.impacts.length, 5);
  assert.deepEqual(keepOrder({ b: 1, a: [{ y: 1, x: 2 }] }, { a: [{ x: 0, y: 0 }], b: 0 }), { a: [{ x: 2, y: 1 }], b: 1 });
});

test("validate refuses what build.mjs refuses", () => {
  const m = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const one = (fn) => { const x = structuredClone(m); fn(x); return validate(x); };
  assert.match(one((x) => { x.stacks["s1-zoro"].tracks[0].type = "foo"; }).join(), /type "foo"/);
  assert.match(one((x) => { x.impacts[0].mode = "x"; }).join(), /mode "x"/);
  assert.match(one((x) => { delete x.impacts[2].stack; }).join(), /silhouette cần stack/);
  assert.match(one((x) => { x.impacts[2].stack = "nope"; }).join(), /silhouette cần stack/);
  assert.match(one((x) => { x.stacks["s1-zoro"].offsets = { "s1-zoro-w1": { x: "1" } }; }).join(), /chỉ nhận số x, y, scale/);
  assert.match(one((x) => { x.stacks["s1-zoro"].offsets = { "s1-zoro-w1": { rotate: 2 } }; }).join(), /sai ở rotate/);
  assert.match(one((x) => { x.stacks["s2-zoro"].tracks[0].keys = []; }).join(), /keys cần/);
  assert.match(one((x) => { delete x.stacks["s1-zoro"].shot; }).join(), /cần shot/);
  assert.deepEqual(one((x) => { x.stacks["s1-zoro"].offsets = { "s1-zoro-w1": { x: 1, y: -2.5, scale: 1.02 } }; }), []);
  assert.deepEqual(validate("[]"), ["manifest phải là object JSON"]);
});

test("a write with an old base_sha is 409 and an invalid one is 400; neither touches the file", () => {
  const d = withZoro("stale");
  const m = readManifest(d);
  assert.throws(() => writeManifest(d, m.manifest, { baseSha: "0".repeat(64) }), (e) => e.status === 409 && e.sha === m.sha);
  const broken = structuredClone(m.manifest);
  broken.impacts[0].mode = "x";
  assert.throws(() => writeManifest(d, broken, { baseSha: m.sha }), (e) => e.status === 400 && e.errors.length === 1);
  assert.equal(readManifest(d).sha, m.sha);
  assert.deepEqual(listBackups(d), []);
});

test("the template builds the example deterministically and the build reports missing poses as WARN", async () => {
  const d = exampleProject("example");
  const a = build(d);
  assert.equal(a.status, 0, a.stderr);
  const out = join(d, "assets", "anim", "anim-data.js");
  const first = sha(out);
  const text = readFileSync(out, "utf8");
  assert.match(text, /^window\.StudioAnimData = \{/m);
  assert.match(text, /^window\.ZvmAnimData = window\.StudioAnimData;$/m);
  assert.equal(build(d).status, 0);
  assert.equal(sha(out), first, "two builds give the same file");
  const r = await rebuild(d);
  assert.equal(r.code, 0, r.error);
  assert.ok(r.warnings.some((w) => /missing assets\/plates\/anim\/s1-hero-m-half\.png/.test(w)), r.warnings.join("\n"));
  assert.ok(r.warnings.some((w) => /s2-k3/.test(w)));
});

test("enable never writes over a project's own files", () => {
  const d = project("enable");
  writeFileSync(join(d, "assets", "anim", "build.mjs"), "// mine\n");
  const r = enable(d);
  assert.deepEqual(r.kept, ["assets/anim/build.mjs"]);
  assert.equal(readFileSync(join(d, "assets", "anim", "build.mjs"), "utf8"), "// mine\n");
  assert.deepEqual(JSON.parse(readFileSync(join(d, "assets", "anim", "manifest.json"), "utf8")).stacks, {});
  assert.equal(readFileSync(join(d, "assets", "anim", "anim.js"), "utf8"), readFileSync(join(TEMPLATE_DIR, "anim.js"), "utf8"));
  assert.deepEqual(enable(d).copied, []);
  assert.equal(formatManifest({ a: 1 }), '{\n  "a": 1\n}\n');
});

// The template must behave exactly like the builder it was copied from: both run on the same copy
// of the Zoro project (read only; every file is copied into tmp, PNGs as empty placeholders).
test("the template builds the Zoro project like its own build.mjs, apart from the global name", { skip: !existsSync(join(ZORO, "assets", "anim", "build.mjs")) && "zoro-vs-mihawk is not on this machine" }, () => {
  const runs = {};
  for (const which of ["zoro", "template"]) {
    const d = join(tmp, `zoro-${which}`);
    mkdirSync(join(d, "assets", "anim"), { recursive: true });
    copyFileSync(join(ZORO, "index.html"), join(d, "index.html"));
    copyFileSync(join(ZORO, "assets", "anim", "manifest.json"), join(d, "assets", "anim", "manifest.json"));
    copyFileSync(which === "zoro" ? join(ZORO, "assets", "anim", "build.mjs") : join(TEMPLATE_DIR, "build.mjs"), join(d, "assets", "anim", "build.mjs"));
    cpSync(join(ZORO, "assets", "voice"), join(d, "assets", "voice"), { recursive: true, filter: (f) => !/\.mp3$/.test(f) });
    for (const sub of ["plates", join("plates", "anim")]) {
      mkdirSync(join(d, "assets", sub), { recursive: true });
      for (const f of readdirSync(join(ZORO, "assets", sub)).filter((x) => x.endsWith(".png"))) writeFileSync(join(d, "assets", sub, f), "");
    }
    const r = build(d);
    assert.equal(r.status, 0, r.stderr);
    runs[which] = { out: readFileSync(join(d, "assets", "anim", "anim-data.js"), "utf8"), stderr: r.stderr };
  }
  const asZoro = runs.template.out.replace("window.StudioAnimData = ", "window.ZvmAnimData = ").replace("window.ZvmAnimData = window.StudioAnimData;\n", "");
  assert.equal(asZoro, runs.zoro.out);
  assert.equal(runs.template.stderr, runs.zoro.stderr);
});
