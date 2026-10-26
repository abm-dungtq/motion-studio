#!/usr/bin/env node
// tests/fake-gflow.mjs — stands in for the gflow-cli binary (lib/videogen/gflow.mjs) in tests.
// It mimics gflow 0.90 where Studio depends on it: stdout is ONE JSON object indented over many
// lines (json_output.emit), stderr is structlog JSON lines keyed "event", exit codes follow
// USAGE.md § Exit codes, and a hanging run owns a "Chrome" in its own process group (Playwright
// spawns the browser detached) that only dies on SIGINT or when Studio kills the process tree.
// Env:
//   FAKE_GFLOW           scenario of a generation command (see below), "download-fail" for download
//   FAKE_GFLOW_DIR       state dir: catalog.jsonl, projects.jsonl, self.pid, child.pid
//   FAKE_GFLOW_LOG       JSONL file: one line per call with argv, cwd and the GFLOW_CLI_* env
//   FAKE_GFLOW_VERSION   version printed by --version (0.90.0)
//   FAKE_GFLOW_AUTH      exit code of `auth status` (0)
//   FAKE_GFLOW_MP4       a real mp4 to copy as the generated or downloaded clip (else a few bytes)
// Scenarios: ok | exit:N[:armed|:sent[:row]] (row: the catalog has the run) | exit6 | exit6-net | notsucceeded | garbage |
//   hang-before-typed | hang-after-typed | hang-after-sent | hang-after-sent-norow | ignore-sigint
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const env = process.env;
const dir = env.FAKE_GFLOW_DIR ?? null;
const scenario = env.FAKE_GFLOW ?? "ok";

if (env.FAKE_GFLOW_LOG) {
  const vars = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("GFLOW_CLI_")));
  appendFileSync(env.FAKE_GFLOW_LOG, JSON.stringify({ argv, cwd: process.cwd(), env: vars }) + "\n");
}

const out = (x) => process.stdout.write(JSON.stringify(x, null, 2) + "\n");
const event = (name, extra = {}) => process.stderr.write(JSON.stringify({ event: name, level: "info", timestamp: new Date().toISOString(), ...extra }) + "\n");
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 && i < argv.length - 1 ? argv[i + 1] : null; };
const promptOf = () => { const i = argv.indexOf("--"); return i >= 0 ? argv.slice(i + 1).join(" ") : null; };
const file = (n) => (dir ? join(dir, n) : null);
const lines = (n) => { try { return readFileSync(file(n), "utf8").split("\n").filter(Boolean); } catch { return []; } };
const exit = (code) => process.stdout.write("", () => process.exit(code));

// Noise every real run has: a non-JSON line and a signed URL.
process.stderr.write("Chromium starting…\n");
process.stderr.write(JSON.stringify({ event: "http.get", url: "https://x.test/?Signature=abc", level: "debug" }) + "\n");

const [a, b] = argv;
if (a === "--version") {
  process.stdout.write(`gflow, version ${env.FAKE_GFLOW_VERSION ?? "0.90.0"}\n`);
  exit(0);
} else if (a === "auth" && b === "list") {
  out([{ name: "p1", google_account: "x@y.z", is_default: true, cookies_present: true, last_used_at: null, profile_dir: "/x/profiles/p1" }]);
  exit(0);
} else if (a === "auth" && b === "status") {
  const code = Number(env.FAKE_GFLOW_AUTH ?? 0);
  if (code) out({ status: "fail", error: { class: "AuthError", exit_code: code, retryable: false, detail: "session expired for x@y.z" } });
  else out({ status: "ok", profile: opt("--profile"), account: "x@y.z" });
  exit(code);
} else if (a === "project" && b === "create") {
  const rec = { status: "ok", project_id: `proj-${randomBytes(3).toString("hex")}`, title: opt("--name"), profile: opt("--profile") };
  if (dir) appendFileSync(file("projects.jsonl"), JSON.stringify(rec) + "\n");
  out(rec);
  exit(0);
} else if (a === "data" && b === "list") {
  for (const l of lines("catalog.jsonl")) process.stdout.write(l + "\n");
  exit(0);
} else if (a === "data" && b === "download") {
  const id = argv[2];
  if (scenario === "download-fail") {
    out({ status: "fail", error: { class: "MediaDownloadError", exit_code: 6, retryable: false, detail: `video download returned HTTP 403 for '${id}'` } });
    exit(6);
  } else {
    const d = opt("--out");
    mkdirSync(d, { recursive: true });
    const p = join(d, `${id}.mp4`);
    if (env.FAKE_GFLOW_MP4) copyFileSync(env.FAKE_GFLOW_MP4, p); else writeFileSync(p, Buffer.from("fake mp4 bytes"));
    out({ media_id: id, workflow_id: "wf", profile: opt("--profile"), project_id: "proj", path: p, bytes: 14 });
    exit(0);
  }
} else if ((a === "video" && ["t2v", "i2v"].includes(b)) || (a === "image" && ["t2i", "i2i"].includes(b))) {
  generate(a);
} else {
  process.stderr.write(`fake-gflow: unknown command ${argv.join(" ")}\n`);
  exit(2);
}

function catalogRow(kind, mediaId, status) {
  if (!dir) return;
  const row = { media_id: mediaId, profile: opt("--profile"), project_id: opt("--project"), prompt: promptOf(), aspect: opt("--aspect"), model: opt("--model"), created_at: new Date().toISOString(), local_path: null, copy_count: 1 };
  if (kind === "video") Object.assign(row, { duration: Number(opt("--duration")), status });
  appendFileSync(file("catalog.jsonl"), JSON.stringify(row) + "\n");
}

function writeOutput(kind) {
  const o = opt("-o");
  mkdirSync(dirname(o), { recursive: true });
  if (kind === "video" && env.FAKE_GFLOW_MP4) copyFileSync(env.FAKE_GFLOW_MP4, o);
  else writeFileSync(o, Buffer.from(kind === "video" ? "fake mp4 bytes" : "fake png bytes"));
  return o;
}

function hang({ ignoreSigint = false } = {}) {
  const chrome = spawn(process.execPath, ["-e", "setInterval(()=>{},1e3)"], { detached: true, stdio: "ignore" });
  chrome.unref();
  if (dir) {
    writeFileSync(file("self.pid"), String(process.pid));
    writeFileSync(file("child.pid"), String(chrome.pid));
  }
  process.on("SIGINT", () => {
    if (ignoreSigint) return;
    try { process.kill(chrome.pid, "SIGKILL"); } catch { /* gone */ }
    event("cli.interrupted");
    setTimeout(() => process.exit(130), 100);
  });
  setInterval(() => {}, 1000);
}

function generate(kind) {
  const mediaId = randomUUID();
  const armed = () => event("migrated.prompt_typed");
  const sent = () => event("migrated.submit_clicked");
  const fail = (code, error) => { out({ status: "fail", error: { exit_code: code, class: "X", retryable: false, detail: "x", ...error } }); exit(code); };
  const m = /^exit:(\d+)(?::(armed|sent))?(:row)?$/.exec(scenario);
  if (m) {
    if (m[2]) armed();
    if (m[2] === "sent") sent();
    if (m[3]) catalogRow(kind, mediaId, "pending");
    return fail(Number(m[1]));
  }
  switch (scenario) {
    case "ok": {
      armed(); sent();
      catalogRow(kind, mediaId, "MEDIA_GENERATION_STATUS_SUCCESSFUL");
      const p = writeOutput(kind);
      if (kind === "video") out({ status: "ok", command: "video", media_id: mediaId, generation_status: "MEDIA_GENERATION_STATUS_SUCCESSFUL", succeeded: true, local_path: p, failure_reasons: [], error_message: null });
      else out({ status: "ok", command: "image", project_id: opt("--project"), model: opt("--model"), images: [{ media_name: mediaId, workflow_id: "wf", seed: 1, dimensions: [1024, 576], fife_url: "https://x.test/i?Signature=abc", local_path: p }] });
      return exit(0);
    }
    case "exit6":
      armed(); sent();
      catalogRow(kind, mediaId, "MEDIA_GENERATION_STATUS_SUCCESSFUL");
      return fail(6, { class: "MediaDownloadError", retryable: false, detail: `video download returned HTTP 403 for '${mediaId}' via media.getMediaUrlRedirect`, remediation_hint: `Retry later: gflow data download ${mediaId}` });
    case "exit6-net":
      return fail(6, { class: "NetworkError", retryable: true, detail: "connection reset" });
    case "notsucceeded":
      armed(); sent();
      catalogRow(kind, mediaId, "MEDIA_GENERATION_STATUS_FAILED");
      out({ status: "fail", command: "video", media_id: mediaId, succeeded: false, failure_reasons: ["PUBLIC_ERROR_UNSAFE_GENERATION"], local_path: null });
      return exit(1);
    case "garbage":
      process.stdout.write("not json at all\n");
      return exit(0);
    case "hang-before-typed":
      return hang();
    case "hang-after-typed":
      armed();
      return hang();
    case "ignore-sigint":
      armed();
      return hang({ ignoreSigint: true });
    case "hang-after-sent":
      armed(); sent();
      catalogRow(kind, mediaId, "pending");
      return hang();
    case "hang-after-sent-norow":
      armed(); sent();
      return hang();
    default:
      process.stderr.write(`fake-gflow: unknown scenario ${scenario}\n`);
      return exit(2);
  }
}
