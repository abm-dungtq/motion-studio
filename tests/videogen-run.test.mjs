// lib/videogen/run.mjs with tests/fake-gflow.mjs: a run per outcome, recover, reconcile, and a stop
// (SIGTERM of the runner) at every phase, with no process left behind.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegBin } from "../lib/anime/keying.mjs";
import { flowProjectOf, getVideogen, ledgerDir, videogenCount, videogenWafUntil, today } from "../lib/ledger.mjs";
import { normalizeSpec } from "../lib/videogen/spec.mjs";
import { runVideogen } from "../lib/videogen/run.mjs";

const RUN = fileURLToPath(new URL("../lib/videogen/run.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-gflow.mjs", import.meta.url));
let tmp, proj, fdir, flog;
const saved = {};
const ff = (args) => { const r = spawnSync(ffmpegBin(), ["-v", "error", "-y", ...args]); assert.equal(r.status, 0, String(r.stderr)); };
before(() => {
  tmp = mkdtempSync(join(tmpdir(), "ms-vg-run-"));
  proj = join(tmp, "proj");
  fdir = join(tmp, "fake");
  flog = join(tmp, "fake.log");
  mkdirSync(join(proj, "assets"), { recursive: true });
  mkdirSync(fdir);
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "4", "-pix_fmt", "yuv420p", join(tmp, "clip.mp4")]);
  for (const n of ["key.png", "end.png"]) ff(["-f", "lavfi", "-i", "color=c=red:s=64x36", "-frames:v", "1", join(proj, "assets", n)]);
  for (const k of ["MOTION_STUDIO_STATE", "FAKE_GFLOW", "FAKE_GFLOW_DIR", "FAKE_GFLOW_LOG", "FAKE_GFLOW_MP4"]) saved[k] = process.env[k];
  Object.assign(process.env, { MOTION_STUDIO_STATE: join(tmp, "state", "studio.json"), FAKE_GFLOW_DIR: fdir, FAKE_GFLOW_LOG: flog, FAKE_GFLOW_MP4: join(tmp, "clip.mp4") });
});
after(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true });
});

const quiet = () => {};
const calls = () => (existsSync(flog) ? readFileSync(flog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const arg = (prompt, specIn = {}, extra = {}) => {
  const spec = normalizeSpec(proj, { shot: "s1", prompt, seconds: 4, ...specIn });
  return { action: "new", dir: proj, spec, digest: `d-${prompt}`, bin: FAKE, profile: "p1", cap: 50, image_cap: 50, ...extra };
};
const go = (scenario, a) => { process.env.FAKE_GFLOW = scenario; return runVideogen(a, { log: quiet }); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitDead = async (pid, ms = 6000) => { const t = Date.now(); while (alive(pid) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50)); return !alive(pid); };
const parts = () => readdirSync(join(proj, "assets", "gen", "video")).filter((f) => f.startsWith(".part-"));

// The runner as a job process, stopped with SIGTERM once the fake hangs. Returns its output.
async function stopped(scenario, a) {
  rmSync(join(fdir, "child.pid"), { force: true });
  const child = spawn(process.execPath, [RUN, "run", JSON.stringify(a)], { env: { ...process.env, FAKE_GFLOW: scenario }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const t = Date.now();
  while (!existsSync(join(fdir, "child.pid")) && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 30));
  await new Promise((r) => setTimeout(r, 300));
  const self = Number(readFileSync(join(fdir, "self.pid"), "utf8"));
  const chrome = Number(readFileSync(join(fdir, "child.pid"), "utf8"));
  child.kill("SIGTERM");
  const code = await new Promise((r) => child.on("close", r));
  const line = out.split("\n").reverse().find((l) => l.startsWith("RESULT "));
  return { code, out, self, chrome, result: line ? JSON.parse(line.slice(7)) : null };
}

test("ok video: collected, file, receipt by gflow, argv and cwd, one Flow project", async () => {
  const r = await go("ok", arg("ca 1: biển"));
  assert.equal(r.ok, true, r.error);
  assert.match(r.rel, /^assets\/gen\/video\/s1-vg-\d{8}-[0-9a-f]{6}\.mp4$/);
  assert.ok(existsSync(join(proj, r.rel)));
  const it = getVideogen(r.id);
  assert.equal(it.state, "collected");
  assert.equal(it.phase, "sent");
  assert.match(it.media_id, /^[0-9a-f-]{36}$/);
  assert.equal(it.prompt, "ca 1: biển");
  const days = readdirSync(join(proj, ".opus", "receipts"));
  const recs = days.flatMap((d) => readdirSync(join(proj, ".opus", "receipts", d)).map((f) => join(proj, ".opus", "receipts", d, f)));
  const rec = recs.map((f) => JSON.parse(readFileSync(f, "utf8"))).find((x) => x.op === "videogen");
  assert.equal(rec.tool.name, "gflow");
  const gen = calls().filter((c) => c.argv[0] === "video");
  const last = gen.at(-1);
  assert.equal(last.argv[last.argv.indexOf("--project") + 1], flowProjectOf("p1", proj).id);
  assert.notEqual(last.cwd, proj);
  assert.ok(!last.cwd.startsWith(proj));
  assert.equal(last.env.GFLOW_CLI_LOG_FORMAT, "json");
  await go("ok", arg("ca 1b: biển chiều"));
  assert.equal(calls().filter((c) => c.argv[0] === "project").length, 1);
  assert.equal(parts().length, 0);
});

test("ok image: png in assets/gen/image, counted apart from clips", async () => {
  const v = videogenCount(today()), i = videogenCount(today(), { kind: "image" });
  const r = await go("ok", arg("ca 2: ảnh núi", { kind: "image", aspect: "1:1" }));
  assert.equal(r.ok, true, r.error);
  assert.match(r.rel, /^assets\/gen\/image\/s1-.*\.png$/);
  assert.equal(getVideogen(r.id).kind, "image");
  assert.equal(videogenCount(today()), v);
  assert.equal(videogenCount(today(), { kind: "image" }), i + 1);
  const im = calls().filter((c) => c.argv[0] === "image").at(-1);
  assert.equal(im.argv[im.argv.indexOf("-n") + 1], "1");
});

test("exit 6: made with the id from the error, no part file; recover downloads it", async () => {
  const r = await go("exit6", arg("ca 3: sông"));
  const it = getVideogen(r.id);
  assert.equal(it.state, "made");
  assert.equal(it.charge, "charged");
  assert.match(it.media_id, /^[0-9a-f-]{36}$/);
  assert.equal(parts().length, 0);
  process.env.FAKE_GFLOW = "download-fail";
  const bad = await runVideogen({ action: "recover", id: r.id, dir: proj, bin: FAKE, profile: "p1" }, { log: quiet });
  assert.equal(bad.ok, false);
  assert.equal(getVideogen(r.id).state, "made");
  assert.equal(getVideogen(r.id).recover_failed, 1);
  process.env.FAKE_GFLOW = "ok";
  const ok = await runVideogen({ action: "recover", id: r.id, dir: proj, bin: FAKE, profile: "p1" }, { log: quiet });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.rel, `assets/gen/video/s1-${r.id}.mp4`);
  assert.ok(existsSync(join(proj, ok.rel)));
  assert.equal(getVideogen(r.id).state, "collected");
});

test("exit 9 after the submit: matched in the catalog or left unknown", async () => {
  const m = await go("exit:9:sent:row", arg("ca 4a: rừng già"));
  assert.deepEqual([getVideogen(m.id).state, getVideogen(m.id).charge], ["made", "charged"]);
  assert.match(getVideogen(m.id).media_id, /^[0-9a-f-]{36}$/);
  const r = await go("exit:9:sent", arg("ca 4: rừng"));
  assert.equal(getVideogen(r.id).state, "indeterminate");
  assert.equal(getVideogen(r.id).reconcile, false);
  const before = calls().length;
  const n = await go("notsucceeded", arg("ca 5: mưa"));
  const it = getVideogen(n.id);
  assert.deepEqual([it.state, it.charge], ["failed", "indeterminate"]);
  assert.equal(calls().slice(before).filter((c) => c.argv[0] === "data").length, 0);
});

test("pre-submit failures are free; WAF blocks; exit 11 after the submit is matched", async () => {
  const a = await go("exit:28", arg("ca 6: đồi"));
  assert.deepEqual([getVideogen(a.id).state, getVideogen(a.id).charge], ["failed", "none"]);
  assert.equal(videogenWafUntil(), null);
  const w = await go("exit:10:sent", arg("ca 7: phố"));
  assert.deepEqual([getVideogen(w.id).state, getVideogen(w.id).charge], ["failed", "none"]);
  assert.ok(videogenWafUntil());
  rmSync(join(ledgerDir(), "videogen-waf.json"));
  const before = calls().length;
  const e = await go("exit:11:sent", arg("ca 8: cầu"));
  assert.equal(getVideogen(e.id).charge, "indeterminate");
  assert.ok(calls().slice(before).some((c) => c.argv[0] === "data" && c.argv[1] === "list"));
});

test("stop before the prompt is typed: free cancel, nothing left alive", async () => {
  const s = await stopped("hang-before-typed", arg("ca 9: gió"));
  assert.equal(s.result?.cancelled, true, s.out);
  assert.deepEqual([getVideogen(s.result.id).state, getVideogen(s.result.id).charge], ["cancelled", "none"]);
  assert.ok(await waitDead(s.self));
  assert.ok(await waitDead(s.chrome));
});

test("stop after the prompt is typed: unknown, to reconcile", async () => {
  const s = await stopped("hang-after-typed", arg("ca 10: mây"));
  const it = getVideogen(s.result.id);
  assert.deepEqual([it.state, it.reconcile, it.phase], ["indeterminate", true, "typed"]);
  assert.equal(s.result.reconcile, true);
  assert.ok(await waitDead(s.self));
  assert.ok(await waitDead(s.chrome));
});

test("stop after the submit: reconcile finds the clip, or not", async () => {
  const s = await stopped("hang-after-sent", arg("ca 11: sao"));
  assert.equal(getVideogen(s.result.id).phase, "sent");
  assert.match(getVideogen(s.result.id).error, /ngừng chờ/);
  assert.ok(await waitDead(s.chrome));
  const r = await runVideogen({ action: "reconcile", id: s.result.id, dir: proj, bin: FAKE, profile: "p1" }, { log: quiet });
  assert.equal(r.state, "made");
  assert.match(getVideogen(s.result.id).media_id, /^[0-9a-f-]{36}$/);
  const n = await stopped("hang-after-sent-norow", arg("ca 12: trăng"));
  await runVideogen({ action: "reconcile", id: n.result.id, dir: proj, bin: FAKE, profile: "p1" }, { log: quiet });
  assert.equal(getVideogen(n.result.id).state, "indeterminate");
  assert.equal(getVideogen(n.result.id).reconcile, false);
  const img = await stopped("hang-after-sent", arg("ca 13: ảnh", { kind: "image" }));
  assert.equal(getVideogen(img.result.id).reconcile, false);
  assert.equal(getVideogen(img.result.id).state, "indeterminate");
});

test("a gflow that ignores SIGINT is killed with its browser; the runner still settles", async () => {
  const s = await stopped("ignore-sigint", arg("ca 14: sấm", {}, { kill_after_ms: 300 }));
  assert.ok(s.result, s.out);
  assert.equal(getVideogen(s.result.id).state, "indeterminate");
  assert.ok(await waitDead(s.self));
  assert.ok(await waitDead(s.chrome));
});

test("a browser gflow leaves alive after SIGINT is killed before the runner exits", async () => {
  const s = await stopped("sigint-leave-chrome", arg("ca 16: mưa"));
  assert.ok(s.result, s.out);
  assert.ok(await waitDead(s.self));
  assert.ok(await waitDead(s.chrome, 1500), "browser alive after the runner exited");
});

test("an untested gflow: a stop before the prompt is seen typed is still unknown", async () => {
  process.env.FAKE_GFLOW_VERSION = "0.91.0";
  try {
    const s = await stopped("hang-before-typed", arg("ca 17: gió"));
    assert.ok(s.result, s.out);
    const it = getVideogen(s.result.id);
    assert.equal(it.state, "indeterminate");
    assert.equal(it.charge, "indeterminate");
  } finally { delete process.env.FAKE_GFLOW_VERSION; }
});

test("no email, signed URL or profile path in ledger, receipts or job output", async () => {
  const locked = await go("exit:11", arg("ca 18: khoá"));
  assert.equal(getVideogen(locked.id).charge, "none");
  assert.ok(!getVideogen(locked.id).error.includes("/Users/"), getVideogen(locked.id).error);
  const s = await stopped("hang-after-sent", arg("ca 15: sóng"));
  const texts = [s.out, ...readdirSync(ledgerDir()).filter((f) => f.endsWith(".json")).map((f) => readFileSync(join(ledgerDir(), f), "utf8"))];
  const rdir = join(proj, ".opus", "receipts");
  for (const d of readdirSync(rdir)) for (const f of readdirSync(join(rdir, d))) texts.push(readFileSync(join(rdir, d, f), "utf8"));
  for (const t of texts) for (const bad of ["Signature=", "fife_url", "x@y.z", "profile_dir", "gflow-cli/profiles"]) assert.ok(!t.includes(bad), bad);
});
