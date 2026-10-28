// lib/videogen/gflow.mjs against tests/fake-gflow.mjs: argv, env, events, classification of every
// row of the plan table, catalog match, and that a stopped run leaves no process behind.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { authStatus, classify, createProject, defaultProfile, genArgv, gflowEnv, gflowVersion, listCatalog, matchCatalog, parseEvents, parseResult, scrub, spawnGflow } from "../lib/videogen/gflow.mjs";

const FAKE = fileURLToPath(new URL("./fake-gflow.mjs", import.meta.url));
let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), "ms-gflow-t-")); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const video = { kind: "video", mode: "t2v", model: "veo-lite", prompt: "biển", aspect: "16:9", seconds: 4, resolution: null, refs: [] };
const image = { kind: "image", mode: "t2i", model: "nano2", prompt: "biển", aspect: "1:1", refs: [] };
const opts = { profile: "p1", project: "proj-1", out: "/tmp/x.mp4" };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitDead = async (pid, ms = 3000) => { const t = Date.now(); while (alive(pid) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50)); return !alive(pid); };

// Runs the fake as a generation and classifies the end.
async function run(scenario, { spec = video, version = "0.90.0" } = {}) {
  const dir = mkdtempSync(join(tmp, "s-"));
  const out = join(dir, spec.kind === "image" ? "o.png" : "o.mp4");
  const r = await spawnGflow(FAKE, genArgv(spec, { ...opts, out }), { env: { ...gflowEnv(), FAKE_GFLOW: scenario, FAKE_GFLOW_DIR: dir }, cwd: dir });
  const fileOk = existsSync(out) && statSync(out).size > 0;
  const c = classify({ code: r.code, aborted: r.killed, result: parseResult(r.stdout), ev: parseEvents(r.stderr), fileOk, version, kind: spec.kind });
  return { r, c, dir };
}
// Hanging scenarios: abort as soon as the fake wrote its pids.
async function runHang(scenario, extra = {}) {
  const dir = mkdtempSync(join(tmp, "h-"));
  const out = join(dir, "o.mp4");
  const ac = new AbortController();
  const p = spawnGflow(FAKE, genArgv(video, { ...opts, out }), { env: { ...gflowEnv(), FAKE_GFLOW: scenario, FAKE_GFLOW_DIR: dir }, cwd: dir, signal: ac.signal, ...extra });
  const t = Date.now();
  while (!existsSync(join(dir, "child.pid")) && Date.now() - t < 5000) await new Promise((r) => setTimeout(r, 30));
  await new Promise((r) => setTimeout(r, 100));
  const self = Number(readFileSync(join(dir, "self.pid"), "utf8"));
  const chrome = Number(readFileSync(join(dir, "child.pid"), "utf8"));
  ac.abort();
  const r = await p;
  const c = classify({ code: r.code, aborted: r.killed, result: parseResult(r.stdout), ev: parseEvents(r.stderr), fileOk: false, version: "0.90.0", kind: "video" });
  return { r, c, self, chrome };
}

test("genArgv: video and image, flags, -- before the prompt", () => {
  const v = genArgv({ ...video, prompt: "-x lạ" }, opts);
  assert.deepEqual(v.slice(0, 2), ["video", "t2v"]);
  for (const f of ["--profile", "--project", "--model", "--duration", "--aspect", "--json", "-o"]) assert.ok(v.includes(f), f);
  assert.equal(v[v.indexOf("--count") + 1], "1");
  assert.deepEqual(v.slice(-2), ["--", "-x lạ"]);
  assert.ok(!v.includes("--resolution"));
  const o = genArgv({ ...video, model: "omni-flash", resolution: "360p" }, opts);
  assert.equal(o[o.indexOf("--resolution") + 1], "360p");
  const se = genArgv({ ...video, mode: "start_end" }, { ...opts, refsAbs: ["/a.png", "/b.png"] });
  assert.equal(se[1], "i2v");
  assert.equal(se[se.indexOf("-i") + 1], "/a.png");
  assert.equal(se[se.indexOf("-e") + 1], "/b.png");
  const st = genArgv({ ...video, mode: "start" }, { ...opts, refsAbs: ["/a.png"] });
  assert.ok(!st.includes("-e"));
  const im = genArgv({ ...image, mode: "i2i" }, { ...opts, refsAbs: ["/a.png"] });
  assert.deepEqual(im.slice(0, 2), ["image", "i2i"]);
  assert.equal(im[im.indexOf("-n") + 1], "1");
  assert.equal(im[im.indexOf("--ref") + 1], "/a.png");
  assert.deepEqual(im.slice(-2), ["--", "biển"]);
  assert.throws(() => genArgv({ ...video, prompt: " " }, opts), (e) => e.status === 400);
  assert.throws(() => genArgv(video, { ...opts, project: null }), (e) => e.status === 400);
});

test("gflowEnv sets the log and lease variables and drops project, profile, storage", () => {
  const e = gflowEnv({ PATH: "/bin", GFLOW_CLI_PROJECT: "x", GFLOW_CLI_PROFILE: "y", GFLOW_CLI_STORAGE_URI: "gs://z" });
  assert.equal(e.GFLOW_CLI_LOG_FORMAT, "json");
  assert.equal(e.GFLOW_CLI_LOG_LEVEL, "INFO");
  assert.equal(e.GFLOW_CLI_UPDATE_CHECK, "0");
  assert.equal(e.GFLOW_CLI_LEASE_WAIT_SECONDS, "0");
  for (const k of ["GFLOW_CLI_PROJECT", "GFLOW_CLI_PROFILE", "GFLOW_CLI_STORAGE_URI"]) assert.ok(!(k in e), k);
  assert.equal(e.PATH, "/bin");
});

test("classify through the fake: collected, made, failed, waf, pre-submit, reconcile", async () => {
  const cases = [
    ["ok", {}, "collected", "charged"],
    ["exit:28", {}, "failed", "none"],
    ["exit:28:sent", {}, "reconcile", "indeterminate"],
    ["exit:9:sent", {}, "reconcile", "indeterminate"],
    ["exit:7", {}, "reconcile", "indeterminate"],
    ["exit:11", {}, "failed", "none"],
    ["exit:11:sent", {}, "reconcile", "indeterminate"],
    ["exit:3", {}, "failed", "none"],
    ["exit:37", {}, "failed", "none"],
    ["exit:10:sent", {}, "failed", "none"],
    ["exit6", {}, "made", "charged"],
    ["exit6-net", {}, "failed", "none"],
    ["notsucceeded", {}, "failed", "indeterminate"],
    ["exit:5:sent", {}, "failed", "indeterminate"],
    ["garbage", {}, "reconcile", "indeterminate"],
    ["exit:28", { version: "0.91.0" }, "reconcile", "indeterminate"],
  ];
  for (const [scenario, o, state, charge] of cases) {
    const { c } = await run(scenario, o);
    assert.equal(c.state, state, scenario);
    assert.equal(c.charge, charge, scenario);
    if (state === "reconcile") assert.equal(c.reconcile, true, scenario);
  }
  const ok = (await run("ok")).c;
  assert.match(ok.media_id, /^[0-9a-f-]{36}$/);
  const waf = (await run("exit:10:sent")).c;
  assert.equal(waf.waf, true);
  const made = (await run("exit6")).c;
  assert.match(made.media_id, /^[0-9a-f-]{36}$/);
  assert.equal((await run("notsucceeded")).c.reconcile, false);
  assert.match((await run("exit:37")).c.error, /hết credit/);
  const img = (await run("ok", { spec: image })).c;
  assert.equal(img.state, "collected");
  assert.match(img.media_id, /^[0-9a-f-]{36}$/);
});

test("classify: cancel before armed, after an agent-only composer, and a finished run wins", () => {
  assert.equal(classify({ code: 130, aborted: true, ev: parseEvents("") }).state, "cancelled");
  const agent = classify({ code: 130, aborted: true, ev: parseEvents('{"event":"migrated.agent_only_composer"}') });
  assert.equal(agent.state, "reconcile");
  assert.match(agent.error, /điền prompt/);
  const sent = classify({ code: 130, aborted: true, ev: parseEvents('{"event":"migrated.prompt_typed"}\n{"event":"migrated.submit_clicked"}') });
  assert.match(sent.error, /Ngừng chờ|ngừng chờ/);
  const done = classify({ code: 0, aborted: true, result: { status: "ok", succeeded: true, media_id: "m" }, ev: parseEvents(""), fileOk: true });
  assert.equal(done.state, "collected");
  assert.equal(classify({ code: 0, result: { status: "ok", succeeded: true, media_id: "m" }, fileOk: false }).state, "reconcile");
});

test("matchCatalog: project, exact prompt, time window, known, failed and null prompts", () => {
  const since = "2026-10-26T10:00:00.000Z";
  const row = (o) => ({ media_id: "m1", project_id: "p", prompt: "a", created_at: "2026-10-26T10:00:01+00:00", status: "pending", ...o });
  const q = { project: "p", prompt: "a", since };
  assert.equal(matchCatalog([row()], q).length, 1);
  assert.equal(matchCatalog([], q).length, 0);
  assert.equal(matchCatalog([row(), row({ media_id: "m2" })], q).length, 2);
  assert.equal(matchCatalog([row({ created_at: "2026-10-26T09:59:56+00:00" })], q).length, 1);
  assert.equal(matchCatalog([row({ created_at: "2026-10-26T09:59:54+00:00" })], q).length, 0);
  assert.equal(matchCatalog([row()], { ...q, known: ["m1"] }).length, 0);
  assert.equal(matchCatalog([row({ status: "MEDIA_GENERATION_STATUS_FAILED" })], q).length, 0);
  assert.equal(matchCatalog([row({ prompt: null })], q).length, 0);
  assert.equal(matchCatalog([row({ prompt: "a " })], q).length, 0);
  assert.equal(matchCatalog([row({ project_id: "q" })], q).length, 0);
});

test("parseResult: indented JSON, no signed URL, garbage", () => {
  const r = parseResult(JSON.stringify({ status: "ok", images: [{ media_name: "m", fife_url: "https://x/?Signature=1", local_path: "/x" }] }, null, 2));
  assert.deepEqual(r, { status: "ok", images: [{ media_name: "m" }] });
  assert.equal(parseResult("not json"), null);
  assert.equal(parseResult("log line\n" + JSON.stringify({ status: "fail", error: { class: "X", exit_code: 3, detail: "a@b.co bad" } }, null, 2)).error.detail, "[email] bad");
});

test("scrub drops absolute local paths but keeps URLs and relative paths", () => {
  assert.equal(scrub("profile /Users/x/Library/Application Support/gflow-cli/profiles/p1 is locked (held)"), "profile [đường dẫn] is locked (held)");
  assert.equal(scrub("Chrome reports the profile dir /private/var/f/p1 is already in use"), "Chrome reports the profile dir [đường dẫn] is already in use");
  assert.equal(scrub("đã có assets/gen/video/a.mp4"), "đã có assets/gen/video/a.mp4");
  assert.equal(scrub("https://labs.google/fx/tools/flow/project/abc?x=1"), "https://labs.google/fx/tools/flow/project/abc");
});

test("scrub drops query strings and emails", () => {
  assert.equal(scrub("see https://x.test/a?Signature=abc&b=1 now x@y.z"), "see https://x.test/a now [email]");
});

test("abort: SIGINT ends the fake and its detached browser", async () => {
  const { r, c, self, chrome } = await runHang("hang-after-typed");
  assert.equal(r.killed, true);
  assert.equal(r.code, 130);
  assert.equal(c.state, "reconcile");
  assert.ok(await waitDead(self), "fake alive");
  assert.ok(await waitDead(chrome), "browser alive");
});

test("abort before the prompt is typed is a free cancel", async () => {
  const { c, chrome } = await runHang("hang-before-typed");
  assert.equal(c.state, "cancelled");
  assert.equal(c.charge, "none");
  assert.ok(await waitDead(chrome));
});

test("abort: a run that ignores SIGINT is killed with its whole tree", async () => {
  const { r, self, chrome } = await runHang("ignore-sigint", { killAfterMs: 300 });
  assert.equal(r.killed, true);
  assert.ok(await waitDead(self), "fake alive");
  assert.ok(await waitDead(chrome), "browser alive");
});

test("free calls: version, default profile without email, project, catalog", async () => {
  assert.equal(gflowVersion(FAKE), "0.90.0");
  const p = await defaultProfile(FAKE);
  assert.equal(p, "p1");
  const dir = mkdtempSync(join(tmp, "f-"));
  const env = { ...gflowEnv(), FAKE_GFLOW_DIR: dir };
  const pr = await createProject(FAKE, "p1", "demo-abc123", { env });
  assert.match(pr.id, /^proj-/);
  assert.equal(pr.title, "demo-abc123");
  await spawnGflow(FAKE, genArgv(video, { ...opts, project: pr.id, out: join(dir, "o.mp4") }), { env: { ...env, FAKE_GFLOW: "ok" }, cwd: dir });
  const rows = await listCatalog(FAKE, "video", "p1", { env });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].project_id, pr.id);
  assert.equal(JSON.stringify(rows).includes("@"), false);
});

test("image: the composer counts as sent (flow.google.com logs no submit for images)", async () => {
  const armed = { armed: true, sent: false };
  // exit 11 after the prompt (file could not be written) and a dropped download: maybe paid.
  assert.equal(classify({ code: 11, ev: armed, kind: "image", version: "0.90.0", result: { status: "fail", error: { class: "OutputError" } } }).state, "reconcile");
  assert.equal(classify({ code: 6, ev: armed, kind: "image", version: "0.90.0", result: { status: "fail", error: { class: "NetworkError", retryable: true } } }).state, "reconcile");
  assert.equal(classify({ code: 130, aborted: true, ev: armed, kind: "image", version: "0.90.0" }).state, "reconcile");
  // The same codes before the prompt stay free.
  assert.equal(classify({ code: 11, ev: { armed: false, sent: false }, kind: "image", version: "0.90.0" }).charge, "none");
  const { c, r } = await run("exit:11:armed", { spec: image });
  assert.equal(parseEvents(r.stderr).sent, false);
  assert.equal(c.state, "reconcile");
  assert.equal((await run("ok", { spec: image })).c.state, "collected");
});

test("exit 6: made only for MediaDownloadError after the submit; id from the hint on flow.google.com", async () => {
  const m = await run("exit6-migrated");
  assert.equal(m.c.state, "made");
  assert.match(m.c.media_id, /^[0-9a-f-]{36}$/);
  assert.equal(classify({ code: 6, ev: { armed: true, sent: false }, version: "0.90.0", result: { status: "fail", error: { class: "MediaDownloadError", media_id: "a" } } }).state === "made", false);
  assert.equal(classify({ code: 6, ev: { armed: true, sent: true }, version: "0.90.0", result: { status: "fail", error: { class: "X", retryable: false, media_id: "a" } } }).state === "made", false);
});

test("project-not-found is read from the raw detail; no reason field", async () => {
  const { r, c } = await run("project-missing");
  const e = parseResult(r.stdout).error;
  assert.equal(e.project_missing, true);
  assert.equal("reason" in e, false);
  assert.equal(c.state, "failed");
  assert.equal(c.charge, "none");
  assert.equal(parseResult(JSON.stringify({ status: "fail", error: { class: "FlowAppError", exit_code: 31, detail: "redirected to /about" } })).error.project_missing, false);
});

test("auth status has no --json: exit 0 signed in, 1 not", async () => {
  assert.deepEqual(await authStatus(FAKE, "p1"), { ok: true, code: 0 });
  assert.deepEqual(await authStatus(FAKE, "p1", { env: { ...gflowEnv(), FAKE_GFLOW_AUTH: "1" } }), { ok: false, code: 1 });
});

test("abort: a browser left alive after gflow exits on SIGINT is killed too", async () => {
  const { r, self, chrome } = await runHang("sigint-leave-chrome", { killAfterMs: 300 });
  assert.equal(r.killed, true);
  assert.equal(r.code, 130);
  assert.ok(await waitDead(self), "fake alive");
  assert.ok(await waitDead(chrome, 1500), "browser alive");
});
