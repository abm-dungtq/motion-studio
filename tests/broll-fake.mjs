// Test helpers for the B-roll index: tiny videos made by ffmpeg, and fake vision CLIs (agy,
// claude) written as node scripts. fakeVision() returns { env, calls(), log(), rm() }: env points
// the agent registry at the fake CLIs only (agy is proven for vision, the vision order is agy then
// claude), the B-roll cache and HOME at a temp folder, and the HyperFrames skills at an empty one
// (no ASR). Every -p run appends one JSON line { cli, args, prompt } to the log.
//   FAKE_DESCRIBE=ok|junk   ok answers one valid item per "Ảnh n, ô k" line of the prompt
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FFMPEG = ["/opt/homebrew/bin/ffmpeg", "ffmpeg"].find((b) => { try { execFileSync(b, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } });

// Solid colour segments, concatenated: colors [["red", 2], ["blue", 2]] → a 4 s clip.
export function colorClip(file, colors, { size = "320x180", audio = false } = {}) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const [c, d] of colors) args.push("-f", "lavfi", "-i", `color=${c}:s=${size}:r=30:d=${d}`);
  const n = colors.length;
  let filter = `${colors.map((_, i) => `[${i}:v]`).join("")}concat=n=${n}:v=1:a=0[v]`;
  const maps = ["-map", "[v]"];
  if (audio) { const total = colors.reduce((s, [, d]) => s + d, 0); args.push("-f", "lavfi", "-i", `sine=frequency=440:d=${total}`); maps.push("-map", `${n}:a`); }
  execFileSync(FFMPEG, [...args, "-filter_complex", filter, ...maps, "-pix_fmt", "yuv420p", "-c:v", "libx264", ...(audio ? ["-c:a", "aac"] : []), file]);
  return file;
}

const AGY = `
const fs = require("node:fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("1.4.5"); process.exit(0); }
if (a[0] === "models") { console.log("gemini-fake\\tGemini Fake"); process.exit(0); }
if (a[0] === "-p") {
  const prompt = a[1];
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cli: "agy", args: a.slice(2), prompt }) + "\\n");
  if (process.env.FAKE_DESCRIBE === "junk") { console.log(JSON.stringify({ status: "SUCCESS", response: '{"note":"không rõ"}' })); process.exit(0); }
  const items = [...prompt.matchAll(/Ảnh (\\d+), ô (\\d+)/g)].map((m) => ({
    sheet: Number(m[1]), cell: Number(m[2]), caption_vi: process.env.FAKE_CAPTION || "Sóng biển vỗ vào bờ cát", tags: (process.env.FAKE_TAGS || "biển,sóng").split(","),
    shot_type: "toàn", camera: "tĩnh", subjects: ["sóng"], place: "bãi biển", time_of_day: "ngày", text_on_screen: "", quality: "tốt",
  }));
  console.log(JSON.stringify({ status: "SUCCESS", response: JSON.stringify({ items }) }));
  process.exit(0);
}
process.exit(1);
`;
const CLAUDE = `
const fs = require("node:fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("2.1.304 (Claude Code)"); process.exit(0); }
if (a[0] === "auth") { console.log(JSON.stringify({ loggedIn: true })); process.exit(0); }
if (a[0] === "-p") {
  const prompt = fs.readFileSync(0, "utf8");
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cli: "claude", args: a.slice(1), prompt }) + "\\n");
  console.log(JSON.stringify({ type: "result", is_error: false, result: "Tôi không chắc." }));
  process.exit(0);
}
process.exit(1);
`;

export function fakeVision({ describe = "ok", vars = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ms-broll-fake-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [name, body] of [["agy", AGY], ["claude", CLAUDE]]) {
    const f = join(bin, name);
    writeFileSync(f, `#!${process.execPath}\n${body}`);
    chmodSync(f, 0o755);
  }
  const state = join(dir, "config", "studio.json");
  mkdirSync(join(dir, "config"));
  writeFileSync(state, JSON.stringify({ agents: { order: { vision: ["agy", "claude"] } }, ...(vars.state ?? {}) }));
  writeFileSync(join(dir, "config", "agents.json"), JSON.stringify({ agy: { vision: { ok: true } } }));
  const hf = join(dir, "skills");
  mkdirSync(hf);
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const { state: _s, ...rest } = vars;
  const env = {
    PATH: "/usr/bin:/bin", HOME: dir, MOTION_STUDIO_AGENT_PATH: `${bin}:/usr/bin:/bin`, MOTION_STUDIO_STATE: state,
    MOTION_STUDIO_BROLL_CACHE: join(dir, "cache"), MOTION_STUDIO_HF_SKILLS: hf, FAKE_LOG: log, FAKE_DESCRIBE: describe, ...rest,
  };
  const lines = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { dir, env, log: () => readFileSync(log, "utf8"), calls: () => lines().length, lines, rm: () => rmSync(dir, { recursive: true, force: true }) };
}
