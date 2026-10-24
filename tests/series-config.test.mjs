// lib/series.mjs: the series of a project, its declaration paths and the series of a root.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterFor } from "../lib/provider.mjs";
import { describeSeries, listSeries, maskAccount, seriesFor, seriesPath } from "../lib/series.mjs";
import { fakePlugin } from "./fake-plugin.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/series", import.meta.url));
const A = await adapterFor({});
let tmp, plugin, P, series, root;

before(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-series-cfg-")));
  plugin = fakePlugin({ schema: A.NEED.schema, api: 4, series: true });
  P = await A.create({ OPUS_VIDEO_HOME: plugin });
  series = join(tmp, "series", "thu");
  cpSync(FIXTURE, series, { recursive: true });
  root = join(tmp, "root");
  mkdirSync(join(root, "ep-01"), { recursive: true });
  writeFileSync(join(root, "ep-01", "BRIEF.md"), `---\ntitle: Tập 1\nseries: ${series}\n---\n`);
  mkdirSync(join(root, "ep-old"), { recursive: true });
  writeFileSync(join(root, "ep-old", "BRIEF.md"), `---\ntitle: Tập cũ\n---\n\n## series_bible\n- Thư mục series: ${series}\n`);
  mkdirSync(join(root, "lone"), { recursive: true });
  writeFileSync(join(root, "lone", "BRIEF.md"), "---\ntitle: Lẻ\n---\n");
});
after(() => { rmSync(tmp, { recursive: true, force: true }); rmSync(plugin, { recursive: true, force: true }); });

test("the provider exposes the plugin's series functions, or null without them", async () => {
  assert.equal(P.series.file, "studio-series.json");
  assert.equal(typeof P.series.dirOf, "function");
  const old = fakePlugin({ schema: A.NEED.schema, api: 4 });
  try { assert.equal((await A.create({ OPUS_VIDEO_HOME: old })).series, null); } finally { rmSync(old, { recursive: true, force: true }); }
});

test("seriesFor finds the series from both BRIEF forms and none for a lone project", () => {
  const a = seriesFor(P, join(root, "ep-01"));
  assert.equal(a.dir, series);
  assert.equal(a.config.name, "Series Thử");
  assert.equal(seriesFor(P, join(root, "ep-old")).dir, series);
  assert.equal(seriesFor(P, join(root, "lone")), null);
  assert.equal(seriesFor(null, join(root, "ep-01")), null);
});

test("a declaration with errors is a 400 naming them, and is read again when it changes", () => {
  const file = join(series, "studio-series.json");
  const good = readFileSync(file, "utf8");
  try {
    writeFileSync(file, JSON.stringify({ ...JSON.parse(good), name: "" }));
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    assert.throws(() => seriesFor(P, join(root, "ep-01")), (e) => e.status === 400 && /thiếu name/.test(e.message));
    writeFileSync(file, "{");
    utimesSync(file, new Date(), new Date(Date.now() + 10000));
    assert.throws(() => seriesFor(P, join(root, "ep-01")), (e) => e.status === 400 && /JSON hỏng/.test(e.message));
  } finally {
    writeFileSync(file, good);
    utimesSync(file, new Date(), new Date(Date.now() + 15000));
  }
  assert.equal(seriesFor(P, join(root, "ep-01")).config.name, "Series Thử");
});

test("seriesPath fills placeholders and refuses '..' and bad values", () => {
  const s = seriesFor(P, join(root, "ep-01"));
  assert.equal(seriesPath(s, "characters/{char}", { char: "hero" }), join(series, "characters", "hero"));
  assert.equal(seriesPath(s, "{project}/assets/gen", { project: join(root, "ep-01") }), join(root, "ep-01", "assets", "gen"));
  assert.equal(seriesPath(s, "delivery/tap-{N}", { N: 2 }), join(series, "delivery", "tap-2"));
  assert.equal(seriesPath(s, "ep-{NN}", { N: 2 }), join(series, "ep-02"));
  assert.throws(() => seriesPath(s, "../x"), /không hợp lệ/);
  assert.throws(() => seriesPath(s, "characters/{char}", { char: "../etc" }), /id nhân vật/);
  assert.throws(() => seriesPath(s, "characters/{char}"), /id nhân vật/);
  assert.throws(() => seriesPath(s, "{home}/x"), /không biết chỗ thay/);
  assert.throws(() => seriesPath(s, "{project}/x", { project: "rel" }), /thiếu thư mục/);
});

test("listSeries groups the root's projects by series", () => {
  assert.deepEqual(listSeries(P, root), [{ name: "Series Thử", dir: series, projects: ["ep-01", "ep-old"] }]);
});

test("describeSeries lists characters, roles and tools and masks the drive account", () => {
  const d = describeSeries(seriesFor(P, join(root, "ep-01")));
  assert.deepEqual(d.characters, ["hero", "villain"]);
  assert.deepEqual(d.roles, ["hero", "narrator"]);
  assert.ok(d.tools.some((t) => t.name === "echo-args" && t.flags["--out"] === "path:write"));
  assert.deepEqual(d.image_styles, ["pose", "background"]);
  assert.deepEqual(d.writable, ["refs", "rig_src", "props"]);
  assert.deepEqual(d.drive, { account: "som…@example.com", folder: "thu" });
  assert.ok(!JSON.stringify(d).includes("someone@"));
  assert.equal(maskAccount("x"), null);
});
