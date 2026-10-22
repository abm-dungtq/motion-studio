import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, merge, postId, score } from "../scripts/build-library.mjs";
import { fold, matches, query, thumbFile } from "../lib/library.mjs";
import { fetchImage, main as fetchThumbs } from "../scripts/library-thumbs.mjs";

test("postId reads the id of an X post", () => {
  assert.equal(postId("https://x.com/a/status/2102853258582880547?s=20"), "2102853258582880547");
  assert.equal(postId("https://twitter.com/i/web/statuses/123"), "123");
  assert.equal(postId("https://youtu.be/x"), null);
});

test("merge keeps the first category and title, the longest full prompt and every source", () => {
  const [v] = merge([
    { source: "lievan", id: "1", url: "u", author: "a", category: "launch", titles: { en: "Launch film" }, metrics: { bookmarks: 10 }, prompt: "short full", thumbs: ["https://pbs.twimg.com/1.jpg"] },
    { source: "chus", id: "1", category: "动效与片头", titles: { zh: "片头" }, prompt: "原帖未公开完整提示词。" },
    { source: "yihui", id: "1", category: "motion", prompt: "a much longer prompt that is only partial", partial: true, thumbs: ["https://media.skillry.dev/1.webp"] },
    { source: "hiapi", id: "1", category: "productui", style: "productui", likes: 50, prompt: "a longer full prompt than the first", thumbs: [] },
  ]);
  assert.equal(v.category, "launch");
  assert.deepEqual(v.titles, { en: "Launch film", zh: "片头" });
  assert.equal(v.prompt, "a longer full prompt than the first");
  assert.equal(v.prompt_partial, false);
  assert.equal(v.prompt_from, "hiapi");
  assert.deepEqual(v.sources, ["lievan", "chus", "yihui", "hiapi"]);
  assert.deepEqual(v.thumbs, ["https://pbs.twimg.com/1.jpg", "https://media.skillry.dev/1.webp"]);
  assert.deepEqual(v.metrics, { bookmarks: 10, likes: 50 });
  assert.equal(v.style, "productui");
  assert.ok(score(v) > score({ ...v, sources: ["x"], metrics: {} }));
});

test("build marks the videos with Vietnamese text as featured, first", () => {
  const records = [
    { source: "lievan", id: "1", category: "launch", titles: { en: "A" }, prompt: "p1", thumbs: [] },
    { source: "lievan", id: "2", category: "explainer", titles: { en: "B" }, prompt: "p2", tags: ["kinetic-type"], thumbs: [], metrics: { bookmarks: 9999 } },
  ];
  const vi = {
    titles: { 2: "Video B" },
    videos: { 1: { title: "Video A", what: "w", why: "y", how: "h" } },
    styles: { pixel: { name: "Pixel" } },
    techniques: { "chu-dong": { name: "Chữ động", tags: ["kinetic-type"] } },
    prompts: { 1: { title: "Prompt A" }, 9: { title: "gone" }, "khung-prompt": { title: "Khung", template: "<inputs>" } },
    toolkit: { workflow: [] },
  };
  const lib = build({ records, hiStyles: [{ id: "pixel", en: "Pixel art", recipe: "r" }] }, vi);
  assert.deepEqual(lib.videos.map((v) => [v.id, v.featured, v.title_vi]), [["1", true, "Video A"], ["2", false, "Video B"]]);
  assert.deepEqual(lib.videos[0].vi, { what: "w", why: "y", how: "h" });
  assert.equal(lib.styles[0].vi.name, "Pixel");
  assert.deepEqual(lib.techniques[0].examples, ["2"]);
  assert.deepEqual(lib.prompts.map((p) => p.id), ["khung-prompt", "1"]);
});

test("fold and matches find Vietnamese words without accents", () => {
  assert.equal(fold("Cảnh Đẹp"), "canh dep");
  assert.ok(matches(fold("Biểu đồ ra mắt sản phẩm"), "bieu do"));
  assert.ok(matches(fold("Biểu đồ ra mắt"), "Biểu   đồ"));
  assert.ok(!matches(fold("Biểu đồ"), "logo"));
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "library-"));
  const thumbs = join(dir, "thumbs");
  mkdirSync(thumbs);
  writeFileSync(join(thumbs, "1.webp"), "x");
  writeFileSync(join(thumbs, "notes.txt"), "x");
  const lib = {
    categories: [{ id: "launch", vi: "Ra mắt sản phẩm" }],
    sources: [{ repo: "o/r", url: "https://github.com/o/r", license: "MIT" }],
    videos: [
      { id: "1", title_vi: "Phim ra mắt ứng dụng", titles: { en: "App launch" }, category: "launch", featured: true, tags: [], thumbs: ["u"], prompt: "Make a launch film", vi: { what: "w", why: "y", how: "h" } },
      { id: "2", title_vi: "Bài giảng đạo hàm", titles: { en: "Derivatives" }, category: "explainer", featured: false, tags: ["kinetic-type"], thumbs: [], prompt: "Manim lesson" },
    ],
    styles: [{ id: "pixel", en: "Pixel art", recipe: "Style: pixel art.", vi: { name: "Pixel", what: "Điểm ảnh to" }, examples: ["2"] }],
    techniques: [{ id: "chu-dong", name: "Chữ động", what: "Chữ chạy theo nhịp", tags: ["kinetic-type"], examples: ["2"] }],
    prompts: [{ id: "1", title: "Prompt ra mắt", structure: "s" }, { id: "khung-prompt", title: "Khung prompt", template: "<inputs>[...]</inputs>" }],
    toolkit: { workflow: [{ title: "Chọn mẫu", text: "t" }] },
  };
  writeFileSync(join(dir, "library.json"), JSON.stringify(lib));
  const styles = join(dir, "styles");
  mkdirSync(styles);
  writeFileSync(join(styles, "neon.json"), JSON.stringify({ id: "neon-cyberpunk", ten_vi: "Đêm neon", mo_ta_vi: "Neon hồng", best_for: ["game"], aliases: ["cyberpunk"] }));
  writeFileSync(join(dir, "directions.json"), JSON.stringify({ directions: [{ id: "A1", ten_vi: "Một khối biến hình", mo_ta_vi: "Khối đổi dáng", seams: ["zoom"] }] }));
  return { dir, opts: { file: join(dir, "library.json"), thumbsDir: thumbs, stylesDir: styles, directionsFile: join(dir, "directions.json"), source: { id: "demo-provider", label: "Provider thử" } } };
}

test("query pages videos with filters, accent-free search and thumbnails on disk", () => {
  const { dir, opts } = fixture();
  try {
    const all = query({ kind: "videos" }, opts);
    assert.equal(all.total, 2);
    assert.deepEqual(all.items.map((v) => [v.id, v.has_thumb]), [["1", true], ["2", false]]);
    assert.equal("_text" in all.items[0] || "thumbs" in all.items[0], false);
    assert.equal(all.categories[0].vi, "Ra mắt sản phẩm");
    assert.deepEqual(query({ kind: "videos", q: "dao ham" }, opts).items.map((v) => v.id), ["2"]);
    assert.deepEqual(query({ kind: "videos", q: "2" }, opts).items.map((v) => v.id), ["2"]);
    assert.deepEqual(query({ kind: "videos", cat: "launch" }, opts).items.map((v) => v.id), ["1"]);
    assert.deepEqual(query({ kind: "videos", featured: true }, opts).items.map((v) => v.id), ["1"]);
    const p2 = query({ kind: "videos", offset: 1, limit: 1 }, opts);
    assert.deepEqual([p2.offset, p2.items.map((v) => v.id)], [1, ["2"]]);
    assert.throws(() => query({ kind: "cases" }, opts), /kind/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("query merges the provider's scene directions and style profiles into scenes and styles", () => {
  const { dir, opts } = fixture();
  try {
    const scenes = query({ kind: "scenes" }, opts);
    assert.deepEqual(scenes.items.map((s) => [s.id, s.source]), [["chu-dong", "library"], ["A1", "demo-provider"]]);
    assert.equal(scenes.items[1].source_label, "Provider thử");
    assert.deepEqual(query({ kind: "scenes" }, { ...opts, source: null }).items.map((s) => s.id), ["chu-dong"], "no provider: only the library's own items");
    assert.deepEqual(scenes.items[0].examples, [{ id: "2", title: "Bài giảng đạo hàm", has_thumb: false }]);
    assert.deepEqual(query({ kind: "scenes", q: "bien hinh" }, opts).items.map((s) => s.id), ["A1"]);
    const styles = query({ kind: "styles" }, opts);
    assert.deepEqual(styles.items.map((s) => [s.id, s.name]), [["pixel", "Pixel"], ["neon-cyberpunk", "Đêm neon"]]);
    assert.deepEqual(query({ kind: "styles", q: "cyberpunk" }, opts).items.map((s) => s.id), ["neon-cyberpunk"]);
    const prompts = query({ kind: "prompts" }, opts);
    assert.deepEqual(prompts.items.map((p) => [p.id, p.prompt]), [["1", "Make a launch film"], ["khung-prompt", "<inputs>[...]</inputs>"]]);
    assert.equal(prompts.toolkit.workflow[0].title, "Chọn mẫu");
    assert.equal(query({ kind: "prompts", offset: 1 }, opts).toolkit, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("thumbFile serves only numeric ids that exist", () => {
  const { dir, opts } = fixture();
  try {
    assert.equal(thumbFile("1", opts.thumbsDir), join(opts.thumbsDir, "1.webp"));
    assert.equal(thumbFile("2", opts.thumbsDir), null);
    assert.equal(thumbFile("../library", opts.thumbsDir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const reply = (type, body = "img", status = 200) => async () => new Response(body, { status, headers: { "content-type": type } });

test("fetchImage keeps images from known hosts only", async () => {
  assert.deepEqual(await fetchImage("https://pbs.twimg.com/a.jpg", { fetchFn: reply("image/jpeg") }), { buf: Buffer.from("img"), ext: "jpg" });
  assert.equal(await fetchImage("https://pbs.twimg.com/a.jpg", { fetchFn: reply("text/html") }), null);
  assert.equal(await fetchImage("https://pbs.twimg.com/a.jpg", { fetchFn: reply("image/png", "x", 404) }), null);
  assert.equal(await fetchImage("https://evil.example/a.jpg", { fetchFn: reply("image/png") }), null);
});

test("library-thumbs downloads missing covers once, trying the next URL when one fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "thumbs-"));
  try {
    const file = join(dir, "library.json");
    writeFileSync(file, JSON.stringify({ videos: [
      { id: "1", thumbs: ["https://media.skillry.dev/bad.webp", "https://pbs.twimg.com/good.jpg"] },
      { id: "2", thumbs: [] },
      { id: "3", thumbs: ["https://pbs.twimg.com/missing.jpg"] },
    ] }));
    const out = join(dir, "thumbs");
    const calls = [];
    const fetchFn = async (url) => { calls.push(url); return /good/.test(url) ? new Response("jpg", { headers: { "content-type": "image/jpeg" } }) : new Response("no", { status: 404 }); };
    assert.equal(await fetchThumbs([], { log: () => {}, fetchFn, file, dir: out }), 0);
    assert.deepEqual(readdirSync(out).sort(), ["1.jpg"]);
    assert.equal(calls.length, 3);
    await fetchThumbs([], { log: () => {}, fetchFn, file, dir: out });
    assert.equal(calls.length, 4); // only video 3 is tried again
    assert.equal(await fetchThumbs([], { log: () => {}, fetchFn, file: join(dir, "none.json"), dir: out }), 1);
    assert.equal(existsSync(join(out, ".1.part")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
