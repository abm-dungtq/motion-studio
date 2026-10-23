import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../server.mjs";
import { dropCache, RESULT_PREFIX } from "../lib/agents/index.mjs";
import { ffmpegBin, ffprobeBin } from "../lib/anime/keying.mjs";
import { freeStem, planVariant } from "../lib/anime/variant.mjs";
import { listReceipts, sha256File } from "../lib/receipts.mjs";
import { fakeAgents } from "./fake-cli.mjs";

const TOKEN = "v".repeat(64);
let f, root, pj, server, port, saved;

// A 320×180 blue-screen PNG (#004CFE) with a red disc: what the fake codex-pool "generates".
function bluePng(file, w = 320, h = 180) {
  const inside = `lt(hypot(X-${w / 2},Y-${h / 2}),${Math.round(h / 4)})`;
  const r = spawnSync(ffmpegBin(), ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=${w}x${h},format=rgb24`,
    "-vf", `geq=r='if(${inside},230,0)':g='if(${inside},20,76)':b='if(${inside},20,254)'`, "-frames:v", "1", file]);
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
const probe = (file) => spawnSync(ffprobeBin(), ["-v", "error", "-show_entries", "stream=pix_fmt,width", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();

function call(method, path, body, token = TOKEN) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}
async function waitJob(id) {
  for (let i = 0; i < 300; i++) {
    const j = (await call("GET", "/api/jobs?name=pj")).json.find((x) => x.id === id);
    if (j && j.status !== "running" && j.status !== "cancelling") return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} did not end`);
}
const resultOf = (j) => JSON.parse([...j.tail].reverse().find((l) => l.startsWith(RESULT_PREFIX)).slice(RESULT_PREFIX.length));

before(async () => {
  const scratch = mkdtempSync(join(tmpdir(), "ms-anime-png-"));
  const png = readFileSync(bluePng(join(scratch, "gen.png"))).toString("base64");
  rmSync(scratch, { recursive: true, force: true });
  f = fakeAgents({ vars: { FAKE_PNG: png } });
  saved = { ...process.env };
  Object.assign(process.env, f.env, { OPUS_VIDEO_HOME: "/nonexistent" });
  dropCache();
  root = mkdtempSync(join(tmpdir(), "ms-anime-var-"));
  pj = join(realpathSync(root), "pj");
  mkdirSync(join(pj, "assets", "plates", "anim"), { recursive: true });
  mkdirSync(join(pj, "assets", "chars"), { recursive: true });
  bluePng(join(pj, "assets", "plates", "anim", "s1-base.png"), 640, 360);
  bluePng(join(pj, "assets", "chars", "hero-sheet.png"), 320, 180);
  writeFileSync(join(pj, "assets", "chars", "chars.json"), JSON.stringify({ chars: [{ id: "hero", name: "Hero", sheet: "assets/chars/hero-sheet.png", key_color: "#004CFE", notes: "red jacket", palette: [] }] }));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  dropCache();
  rmSync(root, { recursive: true, force: true }); f.rm();
});

const VARIANT = { name: "pj", shot: "s1", base: "assets/plates/anim/s1-base.png", chars: ["hero"], change: "mouth half open", out_name: "s1-m-half" };

test("POST /api/anime/variant makes a keyed RGBA pose as wide as the shot's plate, with a receipt", async () => {
  const r = await call("POST", "/api/anime/variant", VARIANT);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.job.kind, "anime");
  const j = await waitJob(r.json.job.id);
  assert.equal(j.code, 0, j.tail.join("\n"));
  const out = resultOf(j);
  assert.equal(out.ok, true, JSON.stringify(out));
  const png = join(pj, "assets", "plates", "anim", "s1-m-half.png"), raw = join(pj, "assets", "plates", "anim", "raw", "s1-m-half.png");
  assert.equal(out.file, png);
  assert.equal(probe(png), "640,rgba", "keyed and scaled to the base plate's width");
  assert.ok(existsSync(raw));
  assert.equal(out.agent, "codex-pool");
  assert.equal(out.color, "0x004CFE");
  assert.equal(out.upscale, "lanczos");
  const rec = listReceipts(pj, { op: "anime-variant" });
  assert.equal(rec.length, 1);
  const byPath = Object.fromEntries(rec[0].outputs.map((o) => [o.path, o.sha256]));
  assert.equal(byPath["assets/plates/anim/raw/s1-m-half.png"], await sha256File(raw));
  assert.equal(byPath["assets/plates/anim/s1-m-half.png"], await sha256File(png));
  assert.equal(rec[0].params.spill, "blue");
  assert.match(rec[0].tool.ffmpeg, /chromakey=0x004CFE/);
  assert.deepEqual(rec[0].inputs.sheets, ["assets/chars/hero-sheet.png"]);
  // codex-pool got the base and the sheet as images and the edit prompt on stdin.
  const exec = f.calls().split("\n").find((l) => l.startsWith("codex-pool exec"));
  assert.match(exec, /-i ref-1\.png -i ref-2\.png/);
  assert.match(exec, /stdin=Use your image generation tool in EDIT mode.*Keep EXACTLY the same character.*Change ONLY: mouth half open/);
});

test("the same out_name again gets -2 and leaves the first variant as it was", async () => {
  const first = join(pj, "assets", "plates", "anim", "s1-m-half.png");
  const before = await sha256File(first);
  const r = await call("POST", "/api/anime/variant", { ...VARIANT, edge: true });
  assert.equal(r.status, 200, r.text);
  const j = await waitJob(r.json.job.id);
  const out = resultOf(j);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.file, join(pj, "assets", "plates", "anim", "s1-m-half-2.png"));
  assert.ok(existsSync(join(pj, "assets", "plates", "anim", "raw", "s1-m-half-2.png")));
  assert.equal(await sha256File(first), before);
  assert.equal(freeStem(join(pj, "assets", "plates", "anim"), "s1-m-half"), "s1-m-half-3");
});

test("a quota error on every agent ends the job with the reason, and writes no pose", async () => {
  process.env.FAKE_IMAGE = "quota";
  try {
    const r = await call("POST", "/api/anime/variant", { ...VARIANT, out_name: "s1-quota" });
    const j = await waitJob(r.json.job.id);
    assert.equal(j.code, 1);
    const out = resultOf(j);
    assert.equal(out.ok, false);
    assert.match(out.error, /hết quota/);
    assert.equal(existsSync(join(pj, "assets", "plates", "anim", "s1-quota.png")), false);
  } finally { process.env.FAKE_IMAGE = "write"; }
});

test("bad variant arguments answer 400 before any job starts", async () => {
  for (const body of [{ ...VARIANT, out_name: "../x" }, { ...VARIANT, base: "../../etc/passwd" }, { ...VARIANT, base: "assets/plates/anim/none.png" }, { ...VARIANT, chars: ["ghost"] }, { ...VARIANT, change: "" }, { ...VARIANT, kind: "video" }, { ...VARIANT, sim: 5 }]) {
    const r = await call("POST", "/api/anime/variant", body);
    assert.ok(r.status === 400 || r.status === 404, `${JSON.stringify(body)} → ${r.status} ${r.text}`);
  }
  assert.throws(() => planVariant(pj, { ...VARIANT, shot: "s 1" }), /shot/);
});

test("Sinh sheet makes a sheet next to the old one and points the library at it", async () => {
  const r = await call("POST", "/api/anime/chars", { name: "pj", generate: { id: "hero", description: "young swordsman, red jacket" } });
  assert.equal(r.status, 200, r.text);
  const j = await waitJob(r.json.job.id);
  const out = resultOf(j);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.sheet, "assets/chars/hero-sheet-2.png");
  const lib = JSON.parse(readFileSync(join(pj, "assets", "chars", "chars.json"), "utf8"));
  assert.equal(lib.chars[0].sheet, "assets/chars/hero-sheet-2.png");
  assert.equal(lib.chars[0].key_color, "#004CFE");
  assert.ok(readdirSync(join(pj, "assets", "chars")).includes("hero-sheet.png"), "the old sheet stays");
  const last = f.calls().split("codex-pool exec").at(-1);
  assert.match(last, /four-view reference sheet[\s\S]*blue \(#004CFE\)/);
  assert.equal((await call("POST", "/api/anime/chars", { name: "pj", generate: { id: "nobody" } })).status, 404);
});
