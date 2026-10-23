import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { hashFile } from "../lib/broll/hash.mjs";
import { runIndex } from "../lib/broll/index.mjs";
import { loadIndex, prepare, search, tokens } from "../lib/broll/search.mjs";
import { shotQuery, suggest } from "../lib/broll/suggest.mjs";
import { colorClip, fakeVision } from "./broll-fake.mjs";

const doc = (sha, shot, words, extra = {}) => ({ sha256: sha.padEnd(64, "0"), shot, start: 0, end: 4, duration: 4, paths: [`/x/${sha}.mp4`], caption_vi: words, tags: [], shot_type: "toàn", thumb: "s1-2.jpg", text: tokens(words), ...extra });

test("search ignores accents and ranks stably", () => {
  const idx = prepare([doc("a", 1, "Sóng biển vỗ bờ cát trắng"), doc("b", 1, "Phố đêm đông người"), doc("c", 1, "Bãi biển lúc hoàng hôn, biển lặng"), doc("d", 2, "Biển")]);
  const accent = search(idx, "biển"), plain = search(idx, "bien");
  assert.deepEqual(plain.map((h) => h.sha256[0]), accent.map((h) => h.sha256[0]));
  assert.equal(plain.length, 3);
  assert.ok(!plain.some((h) => h.sha256.startsWith("b")));
  assert.equal(plain[0].sha256[0], "d", "the shortest, densest caption first");
  assert.deepEqual(search(idx, "bien").map((h) => h.sha256), plain.map((h) => h.sha256), "same order every time");
  const same = prepare([doc("e", 1, "rừng"), doc("f", 1, "rừng")]);
  assert.deepEqual(search(same, "rung").map((h) => h.sha256[0]), ["e", "f"], "a tie goes by clip then shot");
  assert.equal(search(idx, "bien", { min_dur: 5 }).length, 0);
  assert.equal(search(idx, "", { limit: 2 }).length, 2, "an empty query lists shots");
  assert.match(plain[0].thumb, /^\/api\/broll\/thumb\?sha=d0+&f=s1-2\.jpg$/);
  assert.equal(plain[0].text, undefined);
});

test("suggest puts the clip tagged kiếm first for a shot whose line says thanh kiếm", () => {
  const idx = prepare([
    doc("a", 1, "Thành phố về đêm", { tags: ["phố"] }),
    doc("b", 1, "Samurai rút thanh kiếm dưới trăng đỏ kiếm kiem", { duration: 2, end: 2 }),
    doc("c", 3, "Lưỡi kiếm sáng loáng kiếm", { start: 10, end: 16, duration: 6 }),
  ]);
  const m = { version: 3, shots: [{ id: "s1", name: "Mở màn", start: 0, end: 4, motion_note: "chậm" }, { id: "s2", name: "Đối đầu", start: 4, end: 8, motion_note: "" }], lines: [{ id: "vo-1", shot: "s2", text: "Hắn rút thanh kiếm của mình." }] };
  assert.equal(shotQuery(m, "s2").query, "doi dau han rut thanh kiem");
  const r = suggest(idx, m, "s2");
  assert.equal(r.items[0].sha256[0], "c", "long enough and about a sword");
  assert.deepEqual(r.items[0].use, { start: 10, end: 14 });
  const short = r.items.find((h) => h.sha256[0] === "b");
  assert.equal(short.need_stretch, true);
  assert.throws(() => suggest(idx, m, "s9"), /không có shot/);
});

test("the index built from a run finds a shot by its caption with or without accents", async () => {
  const f = fakeVision({ vars: { FAKE_CAPTION: "Thanh kiếm cắm trên bãi biển", FAKE_TAGS: "kiếm,biển" } });
  try {
    const root = join(f.dir, "ws");
    mkdirSync(join(root, "footage"), { recursive: true });
    const a = colorClip(join(root, "footage", "a.mp4"), [["red", 2]]);
    await runIndex({ root, env: f.env, log: () => {} });
    const idx = loadIndex({ env: f.env });
    const hits = search(idx, "kiem bien");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].sha256, (await hashFile(a, { env: f.env })).sha256);
    assert.deepEqual(search(idx, "kiếm biển").map((h) => h.sha256), hits.map((h) => h.sha256));
    assert.equal(hits[0].path, realpathSync(a));
  } finally { f.rm(); }
});
