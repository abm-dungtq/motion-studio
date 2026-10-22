import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUE_MAX, SCHEMA, cues, main, shotFrames, srt } from "../bundle.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

test("shotFrames rounds each start to a frame from the top and ends the last shot at the source", () => {
  const f = shotFrames([{ id: "a", start: 0, end: 4.24 }, { id: "b", start: 4.24, end: 6.51 }, { id: "c", start: 6.51, end: 9 }], 30, 271);
  assert.deepEqual(f.map((s) => [s.frame_in, s.frame_out]), [[0, 127], [127, 195], [195, 271]]);
  assert.equal(f[1].start, 127 / 30);
  assert.equal(f[1].start_set, 4.24);
  assert.equal(f[1].end_set, 6.51);
});

test("shotFrames refuses a shot with no frame left", () => {
  assert.throws(() => shotFrames([{ id: "a", start: 0 }, { id: "b", start: 1.001 }, { id: "c", start: 1.01 }], 30, 90), /shot b/);
  assert.throws(() => shotFrames([{ id: "a", start: 0 }, { id: "b", start: 3 }], 30, 90), /shot b/);
});

test("cues use word times when there is one per word and break after sentence punctuation", () => {
  const line = { start: 2, duration: 3, text: "Một hai. Ba bốn" };
  const words = () => [{ start: 0.1, end: 0.3 }, { start: 0.4, end: 0.8 }, { start: 1, end: 1.2 }, { start: 1.3, end: 1.9 }];
  assert.deepEqual(cues([line], words), [
    { start: 2.1, end: 2.8, text: "Một hai." },
    { start: 3, end: 3.9, text: "Ba bốn" },
  ]);
});

test("cues fall back to character share when word times do not match the text", () => {
  const line = { start: 0, duration: 2, text: "abc def" };
  const [c] = cues([line], () => [{ start: 0, end: 1 }]);
  assert.equal(c.text, "abc def");
  assert.equal(c.start, 0);
  assert.ok(Math.abs(c.end - 2) < 1e-9);
});

test("cues split a long line at CUE_MAX characters and never overlap", () => {
  const text = Array.from({ length: 30 }, (_, i) => `từ${i}`).join(" ");
  const list = cues([{ start: 0, duration: 10, text }, { start: 5, duration: 2, text: "chen ngang" }]);
  assert.ok(list.length >= 3);
  for (const c of list) assert.ok(c.text.length <= CUE_MAX, c.text);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].end <= list[i].start + 1e-9);
  assert.equal(list.filter((c) => c.text !== "chen ngang").map((c) => c.text).join(" "), text);
});

test("cues skip lines without text or timing", () => {
  assert.deepEqual(cues([{ start: 0, duration: 1, text: " " }, { start: null, duration: 1, text: "a" }, { start: 0, duration: 0, text: "a" }]), []);
});

test("srt numbers cues and writes hh:mm:ss,mmm", () => {
  assert.equal(srt([{ start: 0.1, end: 2.5, text: "A" }, { start: 3661.0004, end: 3662, text: "B" }]),
    "1\n00:00:00,100 --> 00:00:02,500\nA\n\n2\n01:01:01,000 --> 01:01:02,000\nB\n");
});

test("main rejects bad usage with exit 2", async () => {
  const err = [];
  const opts = { log: () => {}, err: (m) => err.push(m) };
  assert.equal(await main([], opts), 2);
  assert.equal(await main(["--project"], opts), 2);
  assert.equal(await main(["--bogus", "x"], opts), 2);
  assert.equal(await main(["--project", tmpdir()], opts), 2);
  assert.equal(await main(["--project", FIXTURE, "--ratio", "tall"], opts), 2);
  assert.equal(await main(["--project", FIXTURE, "--ratio", "9x16"], opts), 2);
  assert.match(err.at(-1), /compositions\/main-9x16\.html/);
});

const ff = (...args) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};
const frames = (file) => Number(spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim());
const audioInfo = (file) => spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", file], { encoding: "utf8" }).stdout;

test("main writes shots, stems, captions and manifest from a source render", { skip: !hasFfmpeg && "needs ffmpeg" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    ff("-f", "lavfi", "-i", "sine=frequency=300:duration=3", "-ar", "44100", join(dir, "assets/voice/01.mp3"));
    mkdirSync(join(dir, "assets/sfx"), { recursive: true });
    mkdirSync(join(dir, "assets/bgm"), { recursive: true });
    ff("-f", "lavfi", "-i", "sine=frequency=900:duration=0.4", join(dir, "assets/sfx/pop.wav"));
    ff("-f", "lavfi", "-i", "sine=frequency=120:duration=8", join(dir, "assets/bgm/bed.wav"));
    const html = readFileSync(join(dir, "index.html"), "utf8").replace("</div>",
      `  <audio id="sfx-pop" src="assets/sfx/pop.wav" data-start="2.7" data-duration="0.4" data-track-index="20" data-volume="0.8"></audio>
      <audio id="bgm" src="assets/bgm/bed.wav" data-start="0" data-duration="8" data-track-index="30" data-volume="0.4"></audio>
    </div>`);
    writeFileSync(join(dir, "index.html"), html);
    const pj = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
    pj.events = [{ id: "ev-1", shot: "s2", offset: 0.2, sound: "assets/sfx/pop.wav", label: "pop" }];
    writeFileSync(join(dir, "project.json"), JSON.stringify(pj, null, 2));
    const source = join(dir, "full.mp4");
    ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=8", "-pix_fmt", "yuv420p", source);

    const log = [], err = [];
    const code = await main(["--project", dir, "--source", source, "--out", "out"], { log: (m) => log.push(m), err: (m) => err.push(m), now: new Date("2026-10-22T08:00:00Z") });
    assert.equal(code, 0, err.join("\n"));
    const out = join(dir, "out");
    assert.equal(existsSync(join(out, ".work")), false);
    assert.deepEqual(readdirSync(join(out, "shots")).sort(), ["01-s1.mp4", "02-s2.mp4", "03-s3.mp4"]);
    assert.deepEqual(["01-s1", "02-s2", "03-s3"].map((f) => frames(join(out, "shots", `${f}.mp4`))), [75, 99, 66]);
    for (const f of ["mix", "voice", "music", "sfx"]) {
      const info = JSON.parse(audioInfo(join(out, "audio", `${f}.wav`)));
      assert.equal(Number(info.streams[0].sample_rate), 48000, f);
      assert.ok(Math.abs(Number(info.format.duration) - 8) < 0.05, `${f} ${info.format.duration}`);
    }

    const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.equal(m.schema, SCHEMA);
    assert.equal(m.fps, 30);
    assert.equal(m.frames, 240);
    assert.equal(m.width, 320);
    assert.deepEqual(m.source, { kind: "file", path: "full.mp4" });
    assert.deepEqual(m.shots.map((s) => [s.id, s.file, s.frame_in, s.frame_out]), [["s1", "shots/01-s1.mp4", 0, 75], ["s2", "shots/02-s2.mp4", 75, 174], ["s3", "shots/03-s3.mp4", 174, 240]]);
    assert.deepEqual(m.audio.map((a) => a.kind), ["mix", "voice", "music", "sfx"]);
    assert.equal(m.captions, "captions.srt");
    assert.deepEqual(m.lines, [{ id: "vo-01", shot: "s2", start: 2.5, end: 5.5, text: "Bạn đưa cả mã nguồn, ảnh chụp." }]);
    assert.equal(m.events[0].start, 2.7);
    assert.equal(m.created, "2026-10-22T08:00:00.000Z");

    // Word times from the fixture's words.json: the comma does not break, the full stop ends it.
    assert.equal(readFileSync(join(out, "captions.srt"), "utf8"), "1\n00:00:02,600 --> 00:00:04,580\nBạn đưa cả mã nguồn, ảnh chụp.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main removes the bundle when the source does not match the project", { skip: !hasFfmpeg && "needs ffmpeg" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const source = join(dir, "short.mp4");
    ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=5", "-pix_fmt", "yuv420p", source);
    const err = [];
    assert.equal(await main(["--project", dir, "--source", source, "--out", "out"], { log: () => {}, err: (m) => err.push(m) }), 1);
    assert.match(err.join("\n"), /150 khung/);
    assert.equal(existsSync(join(dir, "out")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stopping the job (SIGTERM to its group) removes the half-written bundle", { skip: process.platform === "win32" && "process groups" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  try {
    cpSync(FIXTURE, join(dir, "p"), { recursive: true });
    mkdirSync(join(dir, "bin"));
    // A render that never ends, standing in for `npx hyperframes render`.
    writeFileSync(join(dir, "bin", "npx"), "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
    const bundle = fileURLToPath(new URL("../bundle.mjs", import.meta.url));
    const child = spawn(process.execPath, [bundle, "--project", join(dir, "p"), "--out", "out"], { detached: true, stdio: "ignore", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}` } });
    const exited = new Promise((r) => child.on("exit", (code, signal) => r({ code, signal })));
    const out = join(dir, "p", "out");
    for (let i = 0; i < 100 && !existsSync(join(out, ".work")); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(existsSync(join(out, ".work")), "bundle started");
    await new Promise((r) => setTimeout(r, 200));
    process.kill(-child.pid, "SIGTERM");
    assert.deepEqual(await exited, { code: 130, signal: null });
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
