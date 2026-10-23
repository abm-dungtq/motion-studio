import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { BASE_BANNED, FX_DIR, PACK_FILES, REQUIRED, buildCatalog, hyperframesTransitions, loadCatalog, providerSeams, studioPacks, validatePack } from "../lib/fx/catalog.mjs";
import { ROUTES, transitionText } from "../routes/fx.mjs";

const PACKS = ["impact-frame", "ink-wipe", "smear-cut", "speed-lines"];

const get = (port, path) => new Promise((res, rej) => {
  const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, headers: r.headers, text: s, json: (() => { try { return JSON.parse(s); } catch { return null; } })() }));
  });
  req.on("error", rej); req.end();
});

// A directions file and a HyperFrames transitions folder shaped like the real ones.
function fixtures() {
  const d = mkdtempSync(join(tmpdir(), "ms-fx-cat-"));
  const directions = join(d, "directions.json");
  writeFileSync(directions, JSON.stringify({
    seams: [{ id: "zoom-through", kind: "cut-catalog", heading: "Zoom-Through" }, { id: "whip-pan", kind: "shader" }, { id: "focus-pull", kind: "css" }, { id: "beat-cut", kind: "native", mo_ta: "Cắt đúng phách" }, { id: "impact-frame", kind: "native" }],
    seam_classes: { banned: ["fade", "crossfade", "cut", "mờ dần"], soft: ["focus-pull"] },
  }));
  const tdir = join(d, "skills", "hyperframes-animation", "transitions");
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, "css-dissolve.md"), "## Dissolve\n\n### Crossfade\n\ntext\n\n### Focus Pull\n");
  writeFileSync(join(tdir, "css-distortion.md"), "## Distortion\n\n### Glitch\n\n### VHS Tape\n");
  writeFileSync(join(tdir, "css-scale.md"), "## Scale\n\n### Zoom Through\n");
  writeFileSync(join(tdir, "catalog.md"), "### Not A Css File\n");
  return { d, directions, skills: join(d, "skills") };
}

test("the merged catalog drops banned ids, has unique ids and lets the provider win a shared id", () => {
  const f = fixtures();
  try {
    const cat = buildCatalog({ provider: providerSeams(f.directions), packs: studioPacks(), hf: hyperframesTransitions(f.skills) });
    const ids = cat.items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    for (const b of [...BASE_BANNED, "fade", "crossfade", "cut"]) assert.ok(!ids.includes(b), `banned ${b} offered`);
    assert.ok(ids.includes("glitch") && ids.includes("vhs-tape"), "HyperFrames-only transitions are listed");
    assert.ok(!ids.includes("not-a-css-file"), "only css-*.md files are read");
    const zoom = cat.items.find((i) => i.id === "zoom-through");
    assert.equal(zoom.source, "provider");
    assert.deepEqual(zoom.sources, ["provider", "hyperframes"]);
    assert.equal(zoom.kind, "cut-catalog");
    assert.match(zoom.doc, /css-scale\.md$/);
    assert.equal(cat.items.find((i) => i.id === "focus-pull").soft, true);
    // A provider seam that is also a Studio pack: one entry, provider kind, the pack's recipe and preview.
    const impact = cat.items.find((i) => i.id === "impact-frame");
    assert.deepEqual(impact.sources, ["provider", "studio"]);
    assert.equal(impact.kind, "native");
    assert.match(impact.recipe, /impact-frame\/recipe\.md$/);
    assert.equal(impact.preview, "/api/fx/preview/impact-frame/");
    assert.deepEqual(Object.keys(cat.counts), ["provider", "studio", "hyperframes"]);
  } finally { rmSync(f.d, { recursive: true, force: true }); }
});

test("without a provider the base banned list still holds", () => {
  const f = fixtures();
  try {
    const cat = buildCatalog({ packs: studioPacks(), hf: hyperframesTransitions(f.skills) });
    assert.ok(!cat.items.some((i) => i.id === "crossfade"));
    assert.equal(cat.counts.provider, 0);
    assert.equal(cat.counts.studio, PACKS.length);
  } finally { rmSync(f.d, { recursive: true, force: true }); }
});

test("the four Studio packs are complete and every fx.json has the required fields", () => {
  const packs = studioPacks();
  assert.deepEqual(packs.map((p) => p.id), PACKS);
  for (const p of packs) {
    for (const f of PACK_FILES) assert.ok(existsSync(join(FX_DIR, p.id, f)), `${p.id}/${f}`);
    const j = JSON.parse(readFileSync(join(FX_DIR, p.id, "fx.json"), "utf8"));
    for (const k of REQUIRED) assert.ok(j[k] !== undefined && j[k] !== "", `${p.id}: ${k}`);
    assert.deepEqual(validatePack(j, p.id), []);
    assert.match(readFileSync(join(FX_DIR, p.id, "preview.html"), "utf8"), /src="\.\.\/\.\.\/vendor\/gsap\.min\.js"/, `${p.id} preview loads the vendored GSAP`);
    assert.doesNotMatch(readFileSync(join(FX_DIR, p.id, "preview.html"), "utf8"), /https?:\/\/(?!www\.w3\.org)/, `${p.id} preview needs no network`);
  }
});

test("validatePack names what is wrong", () => {
  assert.deepEqual(validatePack(null, "x"), ["fx.json phải là object"]);
  const errs = validatePack({ id: "Bad", kind: "webgl", duration: 9, energy: ["fast"], params: { a: { type: "number" } } }, "bad");
  for (const want of [/thiếu name_vi/, /id "Bad"/, /kind/, /duration/, /energy/, /params\.a/]) assert.ok(errs.some((e) => want.test(e)), `${want} in ${errs.join(" | ")}`);
});

test("the installed provider and HyperFrames give at least 30 entries and none banned", { skip: !existsSync(join(process.env.HOME ?? "", ".claude", "skills", "hyperframes-animation")) && "no HyperFrames skills on this machine" }, async () => {
  const { loadProvider } = await import("../lib/provider.mjs");
  let P = null;
  try { P = await loadProvider(); } catch { /* no provider: Studio and HyperFrames only */ }
  const cat = loadCatalog({ P });
  assert.ok(cat.items.length >= 30, `${cat.items.length} entries`);
  const banned = new Set(cat.banned);
  assert.ok(!cat.items.some((i) => banned.has(i.id)));
});

test("the request text names the recipe and the PLAN.md seam", () => {
  const cat = buildCatalog({ packs: studioPacks() });
  const impact = cat.items.find((i) => i.id === "impact-frame");
  const t = transitionText(impact, { id: "s3", name: "Đòn", start: 4.2 }, { id: "s2" }, null);
  assert.match(t, /impact-frame\/recipe\.md/);
  assert.match(t, /snippet\.js vào assets\/fx\/impact-frame\.js/);
  assert.match(t, /ghi seam `beat-cut`/);
  assert.match(t, /studio_ask gate animatic/);
  // Once the provider knows the id, the pack's recipe still goes along and PLAN.md names the id.
  const shared = buildCatalog({ provider: { seams: [{ id: "impact-frame", kind: "native" }], banned: [], soft: [] }, packs: studioPacks() }).items.find((i) => i.id === "impact-frame");
  assert.equal(shared.source, "provider");
  const t2 = transitionText(shared, { id: "s3", start: 4.2 }, null, null);
  assert.match(t2, /impact-frame\/recipe\.md/);
  assert.match(t2, /ghi `impact-frame`/);
  assert.doesNotMatch(t2, /chưa biết id này/);
});

test("preview files: pack files only, 403 for traversal or odd names, 404 for unknown packs", async () => {
  const saved = process.env.OPUS_VIDEO_HOME;
  process.env.OPUS_VIDEO_HOME = "/nonexistent";
  const root = mkdtempSync(join(tmpdir(), "ms-fx-root-"));
  const server = createServer({ root, token: "f".repeat(64), runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    assert.equal((await get(port, "/api/fx/preview/../x")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/..%2Fx")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/impact-frame/..%2F..%2F..%2Fpackage.json")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/Impact_Frame/")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/impact-frame/notes.txt")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/impact-frame/a/b.js")).status, 403);
    assert.equal((await get(port, "/api/fx/preview/no-such-pack/")).status, 404);
    assert.equal((await get(port, "/api/fx/preview/impact-frame/missing.js")).status, 404);
    const moved = await get(port, "/api/fx/preview/impact-frame");
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.location, "/api/fx/preview/impact-frame/");
    const page = await get(port, "/api/fx/preview/impact-frame/");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.match(page.text, /snippet\.js/);
    const js = await get(port, "/api/fx/preview/ink-wipe/snippet.js");
    assert.equal(js.status, 200);
    assert.match(js.headers["content-type"], /javascript/);
    const gsap = await get(port, "/api/fx/vendor/gsap.min.js");
    assert.equal(gsap.status, 200);
    assert.match(gsap.text, /GSAP 3\.14\.2/);
    assert.equal((await get(port, "/api/fx/vendor/other.css")).status, 403);
    const cat = await get(port, "/api/fx/catalog");
    assert.equal(cat.status, 200, "the catalog answers without a provider");
    assert.equal(cat.json.counts.studio, PACKS.length);
  } finally {
    server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true });
    if (saved === undefined) delete process.env.OPUS_VIDEO_HOME; else process.env.OPUS_VIDEO_HOME = saved;
  }
});

// apply-transition against a stub provider: one set_shot patch, then a queued shot request that
// names the recipe; the runner is mcp so no director process starts.
test("apply-transition sets transition_in and queues a director request with the recipe", async () => {
  const d = mkdtempSync(join(tmpdir(), "ms-fx-apply-"));
  const savedState = process.env.MOTION_STUDIO_STATE;
  process.env.MOTION_STUDIO_STATE = join(d, "studio.json");
  writeFileSync(process.env.MOTION_STUDIO_STATE, JSON.stringify({ director: { runner: "mcp" } }));
  const m = { version: 4, shots: [{ id: "s1", name: "Mở", start: 0, end: 2, transition_in: "" }, { id: "s2", name: "Đòn", start: 2, end: 4, transition_in: "" }] };
  const patches = [], requests = [];
  const P = {
    manifest: { load: () => m },
    gateway: { EXIT: { conflict: 3, viewOnly: 4, invalid: 5, busy: 8, usage: 2 }, patch: (dir, arg) => { patches.push(arg); return { code: 0, version: 5, receipt: ["ok"] }; } },
    requests: { enqueue: (dir, r) => { const x = { id: "r1", status: "queued", ...r }; requests.push(x); return x; }, list: () => requests },
    library: { directionsFile: null },
  };
  const route = ROUTES.find((r) => r.path === "/api/fx/apply-transition");
  const sent = [];
  const c = (body) => ({ body, P, withManifest: () => ({ dir: d }), send: (status, data) => { sent.push({ status, data }); return data; } });
  try {
    const out = await route.handler(c({ name: "p", shot: "s2", id: "impact-frame", base: 4 }));
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0].ops, [{ op: "set_shot", id: "s2", field: "transition_in", value: "impact-frame" }]);
    assert.equal(patches[0].actor, "human");
    assert.equal(out.version, 5);
    assert.equal(out.runner, "mcp");
    assert.equal(requests[0].scope, "shot");
    assert.equal(requests[0].target, "s2");
    assert.equal(requests[0].base, 5);
    assert.match(requests[0].text, /impact-frame\/recipe\.md/);
    await assert.rejects(route.handler(c({ name: "p", shot: "s2", id: "crossfade", base: 4 })), /không có chuyển cảnh/);
    await assert.rejects(route.handler(c({ name: "p", shot: "s9", id: "impact-frame", base: 4 })), (e) => e.status === 404);
    await assert.rejects(route.handler(c({ name: "p", shot: "s2", id: "impact-frame", base: 3 })), (e) => e.status === 409);
    await assert.rejects(route.handler(c({ name: "p", shot: "s2", id: "impact-frame" })), (e) => e.status === 400);
  } finally {
    rmSync(d, { recursive: true, force: true });
    if (savedState === undefined) delete process.env.MOTION_STUDIO_STATE; else process.env.MOTION_STUDIO_STATE = savedState;
  }
});
