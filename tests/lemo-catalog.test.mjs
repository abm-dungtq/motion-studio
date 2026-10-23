import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupsOf, layerSlugs, libraryStyles, MAX_TEXT, merge, myStyles, parseList, search, VI } from "../lib/lemo/catalog.mjs";
import { PIN } from "../lib/lemo/fetch.mjs";
import { FAKE_LEMO, makeLibrary, REPO } from "./fixtures/lemo/make.mjs";

const made = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const SHA = "a".repeat(40);
const pin = { ...PIN, sha: SHA };
// A downloaded library: the fixture in <home>/<sha> with its completion mark.
function home() {
  const h = tmp("lemo-home-");
  makeLibrary(join(h, SHA));
  writeFileSync(join(h, SHA, ".pin.json"), JSON.stringify({ sha: SHA }));
  return h;
}

test("three styles from the fixture, the broken style.json is one warning", () => {
  const r = libraryStyles(home(), { pin });
  assert.equal(r.fetched, true);
  assert.deepEqual(r.rows.map((x) => x.slug), ["ink-wash", "ukiyoe", "watercolor"]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /broken/);
});

test("unknown fields are dropped, long strings cut, uses capped", () => {
  const { rows } = libraryStyles(home(), { pin });
  const w = rows.find((x) => x.slug === "watercolor");
  assert.ok(!JSON.stringify(rows).includes("must not leak"));
  assert.equal(w.uses.length, 6);
  const u = rows.find((x) => x.slug === "ukiyoe");
  assert.ok(u.line.length <= MAX_TEXT);
  assert.equal(w.ten, "Thuỷ màu tự vẽ");
  assert.equal(w.nhom, "Vẽ tay và hội hoạ");
  assert.equal(w.frame, "/api/lemo/frame/watercolor.jpg");
  assert.equal(w.film_url, `${PIN.films}watercolor.mp4`);
  assert.ok(w.guide.endsWith(join("styles", "watercolor", "STYLE.md")));
});

test("no download yet: fetched false and no rows", () => {
  const r = libraryStyles(tmp("lemo-empty-"), { pin });
  assert.deepEqual(r, { fetched: false, dir: null, rows: [], warnings: [] });
});

test("vi.json names exactly the 59 pinned styles and every group of the fixture", () => {
  assert.equal(PIN.slugs.length, 59);
  assert.deepEqual(Object.keys(VI.styles).sort(), [...PIN.slugs].sort());
  assert.equal(Object.keys(VI.groups).length, 11);
  for (const s of readdirSync(join(REPO, "styles")).filter((x) => x !== "broken")) {
    const cat = JSON.parse(readFileSync(join(REPO, "styles", s, "style.json"), "utf8")).category_en;
    assert.ok(VI.groups[cat], `${cat} has a Vietnamese name`);
  }
});

test("search finds watercolor with or without accents, and by group", () => {
  const { rows } = libraryStyles(home(), { pin });
  assert.deepEqual(search(rows, "thuy mau").map((r) => r.slug), ["watercolor"]);
  assert.deepEqual(search(rows, "Thuỷ màu").map((r) => r.slug), ["watercolor"]);
  assert.deepEqual(search(rows, "", "East Asian Traditions").map((r) => r.slug), ["ukiyoe"]);
  assert.equal(search(rows, "").length, 3);
});

test("own styles come first; layer follows the verified list", async () => {
  const my = tmp("lemo-mine-");
  mkdirSync(join(my, "my-rain"));
  writeFileSync(join(my, "my-rain", "style.json"), JSON.stringify({ slug: "my-rain", en: "My Rain", cn: "我的雨", based_on: "watercolor", line: "Rain, mine" }));
  writeFileSync(join(my, "my-rain", "STYLE.md"), "# My Rain\n");
  mkdirSync(join(my, "bad"));
  writeFileSync(join(my, "bad", "style.json"), "{");
  const mine = myStyles(my);
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.warnings.length, 1);
  const lib = libraryStyles(home(), { pin });
  const P = { commands: { lemo: FAKE_LEMO } };
  const layers = await layerSlugs(P, { run: async () => JSON.stringify([{ slug: "watercolor", kind: "2d", status: "verified" }, { slug: "ukiyoe", kind: "2d", status: "draft" }]) });
  const rows = merge(mine.rows, lib.rows, layers);
  assert.equal(rows[0].slug, "my-rain");
  assert.equal(rows[0].source, "mine");
  assert.equal(rows[0].base_ten, "Thuỷ màu tự vẽ");
  assert.deepEqual(rows.filter((r) => r.layer).map((r) => r.slug), ["watercolor"]);
  assert.equal(groupsOf(rows)[0].id, "mine");
  assert.deepEqual(search(rows, "", "mine").map((r) => r.slug), ["my-rain"]);
});

test("the verified list is read defensively", async () => {
  assert.deepEqual(parseList("not json"), {});
  assert.deepEqual(parseList(JSON.stringify({ slug: "x" })), {});
  assert.deepEqual(parseList(JSON.stringify([{ slug: "watercolor" }, { slug: "../x", status: "verified" }, { slug: "glass-product", kind: "3d", status: "verified" }])), { "glass-product": { kind: "3d" } });
  assert.deepEqual(await layerSlugs(null), { available: false, styles: {} });
  assert.deepEqual(await layerSlugs({ commands: { lemo: "/nonexistent/lemo.mjs" } }), { available: false, styles: {} });
});
