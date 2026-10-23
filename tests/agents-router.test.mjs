import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { complete, describeImages, DEFAULT_ORDER, effectiveCaps, generateImage, pick } from "../lib/agents/index.mjs";
import { fakeAgents, PNG_1PX } from "./fake-cli.mjs";

const row = (id, over = {}) => ({ id, found: true, error: null, logged_in: true, caps: { text: "yes", vision: "yes", image: "yes" }, quota: null, ...over });

test("pick follows the order, skips what cannot run, puts unknown last and drops codex while codex-pool runs", () => {
  const agents = [row("codex-pool"), row("codex"), row("agy", { caps: { text: "yes", vision: "unknown", image: "unknown" } }), row("claude", { caps: { text: "yes", vision: "yes", image: "no" } }), row("gemini", { found: false })];
  assert.deepEqual(pick("image", agents, DEFAULT_ORDER.image).map((a) => a.id), ["codex-pool", "agy"]);
  assert.deepEqual(pick("vision", agents, DEFAULT_ORDER.vision).map((a) => a.id), ["codex-pool", "claude", "agy"]);
  assert.deepEqual(pick("text", agents, DEFAULT_ORDER.text).map((a) => a.id), ["agy", "codex-pool", "claude"]);
  const pool = agents.map((a) => (a.id === "codex-pool" ? { ...a, quota: { accounts: [{ name: "acct1", ok: false }] } } : a));
  assert.deepEqual(pick("image", pool, DEFAULT_ORDER.image).map((a) => a.id), ["codex", "agy"], "a pool with no usable account gives way to plain codex");
  const out = agents.map((a) => (a.id === "codex-pool" ? { ...a, logged_in: false } : a.id === "codex" ? { ...a, error: "exit 1" } : a));
  assert.deepEqual(pick("image", out, DEFAULT_ORDER.image).map((a) => a.id), ["agy"], "logged out and broken agents are skipped");
  assert.deepEqual(pick("image", agents, ["agy", "codex"]).map((a) => a.id), ["codex", "agy"], "the configured order, yes before unknown");
  assert.deepEqual(effectiveCaps({ text: "yes", vision: "unknown", image: "unknown" }, { vision: { ok: true }, image: { ok: false } }), { text: "yes", vision: "yes", image: "no" });
});

test("the order comes from studio.json agents.order", async () => {
  const f = fakeAgents({ vars: { FAKE_IMAGE: "json" } });
  try {
    writeFileSync(f.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { vision: ["claude", "codex-pool"] } } }));
    const img = join(f.dir, "a.png");
    writeFileSync(img, Buffer.from(PNG_1PX, "base64"));
    const r = await describeImages({ env: f.env, images: [img], prompt: "Màu gì?", schema: { type: "object" } });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.agent, "claude");
    assert.deepEqual(r.json, { color: "red" });
    assert.match(f.calls(), /^claude -p --output-format json --allowedTools Read \| stdin=Màu gì\?/m);
  } finally { f.rm(); }
});

test("generateImage moves the PNG to out without overwriting, writes a receipt and sends the prompt on stdin", async () => {
  const f = fakeAgents();
  const proj = mkdtempSync(join(tmpdir(), "ms-img-proj-"));
  try {
    writeFileSync(join(proj, "project.json"), "{}");
    const ref = join(f.dir, "sheet.png");
    writeFileSync(ref, Buffer.from(PNG_1PX, "base64"));
    const out = join(proj, "assets", "chars", "hero.png");
    const a = await generateImage({ env: f.env, prompt: "a hero, flat blue background", refs: [ref], out });
    assert.equal(a.ok, true, a.error);
    assert.equal(a.agent, "codex-pool");
    assert.equal(a.file, out);
    const b = await generateImage({ env: f.env, prompt: "a hero again", out });
    assert.equal(b.file, join(proj, "assets", "chars", "hero-2.png"), "an existing file is never overwritten");
    assert.deepEqual(readFileSync(a.file), Buffer.from(PNG_1PX, "base64"));
    // The prompt went through stdin, and the reference with -i, not as an argument.
    const call = f.calls().split("\n").find((l) => l.startsWith("codex-pool exec") && l.includes("-i ref-1.png"));
    assert.ok(call, f.calls());
    assert.match(call, / -i ref-1\.png -o \S+ - \| stdin=Use your image generation tool to create ONE image\. a hero, flat blue background/);
    // The receipt sits in the project folder, with the hash of the output and the basic checks.
    const days = readdirSync(join(proj, ".opus", "receipts"));
    assert.equal(days.length, 1);
    const files = readdirSync(join(proj, ".opus", "receipts", days[0]));
    assert.equal(files.length, 2);
    assert.ok(files.every((x) => /^image-generate-.+\.json$/.test(x)));
    assert.equal(a.receipt.outputs[0].path, "assets/chars/hero.png");
    assert.equal(a.receipt.tool.agent, "codex-pool");
    assert.ok(a.receipt.checks.some((c) => c.id === "exists-nonempty" && c.pass));
  } finally { f.rm(); rmSync(proj, { recursive: true, force: true }); }
});

test("a quota error moves to the next agent; a refusal stops with the reason", async () => {
  const q = fakeAgents({ vars: { FAKE_IMAGE: "quota" } });
  const dir = mkdtempSync(join(tmpdir(), "ms-img-out-"));
  try {
    const r = await generateImage({ env: q.env, prompt: "x", out: join(dir, "a.png") });
    assert.equal(r.ok, false);
    assert.deepEqual(r.tried.map((t) => [t.id, Boolean(t.quota)]), [["codex-pool", true], ["agy", false]], "codex-pool hit its quota, then agy (no PNG) was tried");
    assert.match(q.calls(), /^agy -p Generate ONE image/m);
  } finally { q.rm(); }
  const no = fakeAgents({ vars: { FAKE_IMAGE: "refuse" } });
  try {
    const r = await generateImage({ env: no.env, prompt: "x", out: join(dir, "b.png") });
    assert.equal(r.ok, false);
    assert.equal(r.refused, true);
    assert.equal(r.agent, "codex-pool");
    assert.match(r.error, /từ chối: I can't generate that image/);
    assert.doesNotMatch(no.calls(), /^agy -p/m, "no other agent is asked after a refusal");
    assert.equal(existsSync(join(dir, "b.png")), false);
  } finally { no.rm(); rmSync(dir, { recursive: true, force: true }); }
});

test("a hung run times out and the next agent answers; a quota answer moves on", async () => {
  const f = fakeAgents({ vars: { FAKE_IMAGE: "hang" } });
  try {
    const r = await complete({ env: f.env, prompt: "hi", agent: null, timeout: 400 });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.agent, "agy", "text goes to agy first");
    assert.equal(r.text, "OK from agy");
    writeFileSync(f.env.MOTION_STUDIO_STATE, JSON.stringify({ agents: { order: { text: ["codex-pool", "claude"] } } }));
    const t = await complete({ env: f.env, prompt: "hi", timeout: 400 });
    assert.deepEqual(t.tried.map((x) => [x.id, x.error]), [["codex-pool", "timeout"]]);
    assert.equal(t.agent, "claude");
  } finally { f.rm(); }
  const q = fakeAgents({ vars: { FAKE_AGY: "quota" } });
  try {
    const r = await complete({ env: q.env, prompt: "hi" });
    assert.equal(r.tried[0].id, "agy");
    assert.equal(r.tried[0].quota, true);
    assert.equal(r.agent, "codex-pool");
  } finally { q.rm(); }
});

test("bad input is refused before any CLI runs", async () => {
  const f = fakeAgents();
  try {
    await assert.rejects(generateImage({ env: f.env, prompt: "", out: "/tmp/x.png" }), /cần prompt/);
    await assert.rejects(generateImage({ env: f.env, prompt: "x", out: "rel.png" }), /out/);
    await assert.rejects(generateImage({ env: f.env, prompt: "x", out: "/tmp/x.png", edit: true }), /edit/);
    await assert.rejects(describeImages({ env: f.env, prompt: "x", images: ["/nope.png"] }), /không có file/);
    assert.equal(f.calls(), "");
  } finally { f.rm(); }
});
