import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { frames, rational, tc } from "../lib/nle/time.mjs";
import { FILES, FORMATS, parseFormats, render, timeline, writeNle } from "../lib/nle/index.mjs";
import { esc } from "../lib/nle/fcpxml.mjs";
import { TOOLS } from "../lib/tools/nle.mjs";
import { loadTools } from "../lib/tools.mjs";
import { main as bundleMain } from "../bundle.mjs";

const FIX = fileURLToPath(new URL("./fixtures/nle/", import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(FIX, "manifest.json"), "utf8"));
const DIR = "/bundles/nle demo/out"; // the golden files were written for this bundle folder
const NOW = new Date("2026-10-23T02:00:00Z");
const copy = () => structuredClone(MANIFEST);
const hasXmllint = spawnSync("xmllint", ["--version"]).status === 0;
const PY = join(homedir(), ".claude/skills/.venv/bin/python3");
const hasOtio = existsSync(PY) && spawnSync(PY, ["-I", "-c", "import opentimelineio"]).status === 0;

const count = (s, re) => (s.match(re) ?? []).length;
const spineClips = (x) => count(x.slice(x.indexOf("<spine>"), x.indexOf("</spine>")), /<asset-clip (?![^>]*\blane=)/g);
const otioVideo = (o) => o.tracks.children.find((t) => t.kind === "Video").children;
const xmllint = (text, name) => {
  const d = mkdtempSync(join(tmpdir(), "nle-lint-"));
  try {
    writeFileSync(join(d, name), text);
    return spawnSync("xmllint", ["--noout", join(d, name)], { encoding: "utf8" });
  } finally { rmSync(d, { recursive: true, force: true }); }
};

test("rational reads integer and NTSC frame rates", () => {
  assert.deepEqual(rational(30), { num: 30, den: 1 });
  assert.deepEqual(rational(29.97), { num: 30000, den: 1001 });
  assert.deepEqual(rational(30000 / 1001), { num: 30000, den: 1001 });
  assert.deepEqual(rational(23.976), { num: 24000, den: 1001 });
  assert.deepEqual(rational(59.94), { num: 60000, den: 1001 });
  assert.deepEqual(rational(12.5), { num: 25, den: 2 });
  assert.deepEqual(rational({ num: 60, den: 2 }), { num: 30, den: 1 });
  for (const bad of [0, -1, NaN, "x", { num: 1.5, den: 1 }]) assert.throws(() => rational(bad), /fps/);
});

test("frames writes reduced FCPXML times and tc writes non-drop timecode", () => {
  assert.equal(frames(45, 30), "3/2s");
  assert.equal(frames(0, 30), "0s");
  assert.equal(frames(60, 30), "2s");
  assert.equal(frames(1, 29.97), "1001/30000s");
  assert.equal(frames(30, 29.97), "1001/1000s");
  assert.throws(() => frames(1.5, 30), /khung/);
  assert.equal(tc(0, 30), "00:00:00:00");
  assert.equal(tc(30 * 3661 + 7, 30), "01:01:01:07");
  assert.equal(tc(31, 29.97), "00:00:01:01");
});

test("parseFormats accepts a list or none and refuses unknown names", () => {
  assert.deepEqual(parseFormats("fcpxml,xmeml,otio"), FORMATS);
  assert.deepEqual(parseFormats("otio, fcpxml"), ["fcpxml", "otio"]);
  assert.deepEqual(parseFormats("none"), []);
  assert.throws(() => parseFormats("edl"), /edl/);
  assert.throws(() => parseFormats(""), /--nle/);
  assert.throws(() => parseFormats("otio,otio"), /lặp/);
});

test("the V1 clips add up to the manifest's frames, also at 29.97", () => {
  for (const fps of [30, 29.97, 23.976]) {
    const m = copy();
    m.fps = fps;
    const t = timeline(m, DIR);
    assert.equal(t.video.reduce((s, v) => s + v.duration, 0), m.frames, `${fps}`);
    t.video.forEach((v, i) => assert.equal(v.offset, i ? t.video[i - 1].offset + t.video[i - 1].duration : 0));
    const o = JSON.parse(render(m, DIR, "otio"));
    assert.equal(otioVideo(o).reduce((s, c) => s + c.source_range.duration.value, 0), m.frames);
    const x = render(m, DIR, "xmeml");
    const ends = [...x.matchAll(/<clipitem id="clipitem-\d+">[\s\S]*?<end>(\d+)<\/end>/g)].slice(0, 3).map((r) => Number(r[1]));
    assert.equal(ends.at(-1), m.frames);
    // the FCPXML spine ends exactly on the last frame: offset + duration of the last shot
    const f = render(m, DIR, "fcpxml");
    const r = rational(fps), last = t.video.at(-1);
    assert.ok(f.includes(`offset="${frames(last.offset, r)}" name="${last.name}" start="0s" duration="${frames(last.duration, r)}"`));
    assert.ok(f.includes(`<sequence format="r1" duration="${frames(m.frames, r)}"`));
  }
});

test("FCPXML has one spine clip per shot, one marker per line and SFX, and keeps Vietnamese", () => {
  const x = render(MANIFEST, DIR, "fcpxml", { now: NOW });
  assert.equal(spineClips(x), MANIFEST.shots.length);
  assert.equal(count(x, /<marker /g), MANIFEST.lines.length + MANIFEST.events.length);
  assert.equal(count(x, /lane="-\d"/g), 3);
  assert.ok(x.includes("Công ty bạn"));
  assert.ok(x.includes('src="file:///bundles/nle%20demo/out/shots/01-s1.mp4"'));
  if (hasXmllint) assert.equal(xmllint(x, "t.fcpxml").status, 0);
});

test("FCPXML 1.8 names the file in the asset's src", () => {
  const x = render(MANIFEST, DIR, "fcpxml", { now: NOW, fcpxmlVersion: "1.8" });
  assert.match(x, /<fcpxml version="1.8">/);
  assert.equal(count(x, /<media-rep /g), 0);
  assert.match(x, /<asset id="r2" name="01-s1" start="0s" duration="5\/2s" hasVideo="1" format="r1" src="file:\/\/\/bundles\/nle%20demo\/out\/shots\/01-s1.mp4"\/>/);
  assert.throws(() => render(MANIFEST, DIR, "fcpxml", { fcpxmlVersion: "1.7" }), /1\.7/);
});

test("xmeml has one clipitem per shot on the video track, the stems on audio tracks, and every marker", () => {
  const x = render(MANIFEST, DIR, "xmeml");
  const video = x.slice(x.indexOf("<video>"), x.indexOf("</video>\n      <audio>"));
  assert.equal(count(video, /<clipitem /g), MANIFEST.shots.length);
  assert.equal(count(x, /<clipitem /g), MANIFEST.shots.length + 3);
  assert.equal(count(x, /<marker>/g), MANIFEST.lines.length + MANIFEST.events.length);
  assert.match(x, /<timebase>30<\/timebase>\s*<ntsc>FALSE<\/ntsc>/);
  assert.ok(x.includes("Công ty bạn"));
  const m = copy();
  m.fps = 29.97;
  assert.match(render(m, DIR, "xmeml"), /<timebase>30<\/timebase>\s*<ntsc>TRUE<\/ntsc>/);
  if (hasXmllint) assert.equal(xmllint(x, "t.xml").status, 0);
});

test("xmllint is there to check the XML files", { skip: !hasXmllint && "xmllint không có trên máy, bỏ kiểm cú pháp XML" }, () => {
  assert.equal(xmllint(render(MANIFEST, DIR, "fcpxml", { now: NOW }), "a.fcpxml").status, 0);
  assert.equal(xmllint(render(MANIFEST, DIR, "xmeml"), "a.xml").status, 0);
  assert.notEqual(xmllint("<a><b></a>", "bad.xml").status, 0);
});

test("OTIO is a Timeline.1 with the shots on the video track, stems relative to the bundle", () => {
  const o = JSON.parse(render(MANIFEST, DIR, "otio"));
  assert.equal(o.OTIO_SCHEMA, "Timeline.1");
  assert.deepEqual(o.global_start_time, { OTIO_SCHEMA: "RationalTime.1", rate: 30, value: 0 });
  assert.equal(o.tracks.OTIO_SCHEMA, "Stack.1");
  const v = otioVideo(o);
  assert.equal(v.length, MANIFEST.shots.length);
  assert.ok(v.every((c) => c.OTIO_SCHEMA === "Clip.2" && c.media_references.DEFAULT_MEDIA.OTIO_SCHEMA === "ExternalReference.1"));
  assert.equal(v.reduce((s, c) => s + c.source_range.duration.value, 0), MANIFEST.frames);
  assert.deepEqual(v.map((c) => c.media_references.DEFAULT_MEDIA.target_url), MANIFEST.shots.map((s) => s.file));
  assert.deepEqual(o.tracks.children.filter((t) => t.kind === "Audio").map((t) => t.children[0].media_references.DEFAULT_MEDIA.target_url), ["audio/voice.wav", "audio/music.wav", "audio/sfx.wav"]);
  assert.equal(o.tracks.markers.length, MANIFEST.lines.length + MANIFEST.events.length);
  assert.ok(o.tracks.markers.every((m) => m.OTIO_SCHEMA === "Marker.2"));
  assert.equal(o.tracks.markers[0].comment, MANIFEST.lines[0].text);
});

test("OpenTimelineIO itself reads timeline.otio", { skip: !hasOtio && `opentimelineio chưa có trong ${PY}, bỏ đọc bằng OTIO thật` }, () => {
  const d = mkdtempSync(join(tmpdir(), "nle-otio-"));
  try {
    writeFileSync(join(d, "t.otio"), render(MANIFEST, DIR, "otio"));
    const r = spawnSync(PY, ["-I", "-c", "import sys, opentimelineio as o; t = o.adapters.read_from_file(sys.argv[1]); v = [x for x in t.tracks if x.kind == 'Video'][0]; print(len(v), int(t.duration().value), len(t.tracks.markers))", join(d, "t.otio")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `${MANIFEST.shots.length} ${MANIFEST.frames} ${MANIFEST.lines.length + MANIFEST.events.length}`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the three files match the golden files byte for byte", () => {
  for (const f of FORMATS) assert.equal(render(MANIFEST, DIR, f, { now: NOW }), readFileSync(join(FIX, FILES[f]), "utf8"), f);
  assert.equal(render(MANIFEST, DIR, "fcpxml", { now: NOW, fcpxmlVersion: "1.8" }), readFileSync(join(FIX, "timeline-1.8.fcpxml"), "utf8"));
});

test("a title with & < > \" ' is escaped in both XML files and kept as is in OTIO", () => {
  assert.equal(esc(`a & <b> "c" 'd'`), "a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos;");
  const f = render(MANIFEST, DIR, "fcpxml", { now: NOW });
  assert.ok(f.includes('<event name="Demo &amp; &lt;Thử&gt; &apos;NLE&apos;">'));
  assert.ok(!f.includes("<Thử>"));
  const x = render(MANIFEST, DIR, "xmeml");
  assert.ok(x.includes("<name>Demo &amp; &lt;Thử&gt; &apos;NLE&apos;</name>"));
  assert.ok(x.includes("không ai đọc hết &lt;được&gt;."));
  assert.equal(JSON.parse(render(MANIFEST, DIR, "otio")).name, MANIFEST.title);
});

test("markers are named by the first 40 characters and land on round(t × fps)", () => {
  const t = timeline(MANIFEST, DIR);
  assert.deepEqual(t.markers.map((m) => [m.kind, m.frame]), [["line", 12], ["line", 78], ["sfx", 81], ["sfx", 183]]);
  assert.equal(Array.from(t.markers[0].name).length <= 40, true);
  assert.ok(MANIFEST.lines[0].text.startsWith(t.markers[0].name));
  assert.equal(t.markers[3].name, "whoosh"); // an SFX without a label is named by its sound
});

test("without stems the mix is the one audio track; a later first shot trims the stems to match", () => {
  const m = copy();
  m.audio = [{ kind: "mix", file: "audio/mix.wav" }];
  assert.deepEqual(timeline(m, DIR).audio.map((a) => a.file), ["audio/mix.wav"]);
  m.audio = [];
  assert.equal(count(render(m, DIR, "fcpxml"), /lane=/g), 0);
  const late = copy();
  late.shots[0].frame_in = 6;
  const t = timeline(late, DIR);
  assert.equal(t.length, 234);
  assert.equal(t.video.reduce((s, v) => s + v.duration, 0), 234);
  assert.deepEqual([t.audio[0].start, t.audio[0].duration, t.audio[0].length], [6, 234, 240]);
  assert.equal(t.markers[0].frame, 6);
});

test("timeline refuses a manifest the editors could not follow", () => {
  const bad = (edit, re) => { const m = copy(); edit(m); assert.throws(() => timeline(m, DIR), re); };
  bad((m) => { m.shots = []; }, /shot/);
  bad((m) => { m.shots[1].frame_in = 80; }, /nối liền/);
  bad((m) => { m.frames = 250; }, /shot cuối/);
  bad((m) => { m.shots[0].file = "../x.mp4"; }, /tương đối/);
  bad((m) => { m.audio[1].file = "/abs/voice.wav"; }, /tương đối/);
  bad((m) => { m.width = 0; }, /width/);
  bad((m) => { m.fps = 0; }, /fps/);
});

test("writeNle writes the chosen files and answers the manifest's nle field", () => {
  const d = mkdtempSync(join(tmpdir(), "nle-write-"));
  try {
    assert.deepEqual(writeNle(MANIFEST, d, FORMATS, { now: NOW }), { fcpxml: "timeline.fcpxml", xmeml: "timeline.xml", otio: "timeline.otio", absolute_paths: true });
    for (const f of Object.values(FILES)) assert.ok(existsSync(join(d, f)), f);
    assert.ok(readFileSync(join(d, "timeline.fcpxml"), "utf8").includes(`src="file://${d.split("/").map(encodeURIComponent).join("/")}/shots/01-s1.mp4"`));
    const d2 = join(d, "only");
    mkdirSync(d2);
    assert.deepEqual(writeNle(MANIFEST, d2, ["otio"]), { fcpxml: null, xmeml: null, otio: "timeline.otio", absolute_paths: false });
    assert.equal(existsSync(join(d2, "timeline.fcpxml")), false);
    assert.equal(writeNle(MANIFEST, d2, []), null);
    const broken = copy();
    broken.shots[1].frame_in = 1;
    const d3 = join(d, "broken");
    mkdirSync(d3);
    assert.throws(() => writeNle(broken, d3, FORMATS), /nối liền/);
    assert.equal(existsSync(join(d3, "timeline.fcpxml")), false); // nothing written when one fails
  } finally { rmSync(d, { recursive: true, force: true }); }
});

const fakeStudio = (jobs, posted) => ({
  post: async (path, body) => { posted.push([path, body]); return { job: { id: "j-1", meta: { output: "renders/p-bundle" } } }; },
  get: async () => jobs.shift() ?? [],
});

test("nle_export runs the bundle job of the running Studio and answers the timeline files", async () => {
  const root = mkdtempSync(join(tmpdir(), "nle-tool-"));
  try {
    const out = join(root, "p", "renders", "p-bundle");
    mkdirSync(out, { recursive: true });
    const m = { ...copy(), nle: { fcpxml: "timeline.fcpxml", xmeml: "timeline.xml", otio: "timeline.otio", absolute_paths: true } };
    writeFileSync(join(out, "manifest.json"), JSON.stringify(m));
    const posted = [];
    const studio = fakeStudio([[{ id: "j-1", status: "running" }], [{ id: "j-1", status: "exited", code: 0, meta: { output: "renders/p-bundle" } }]], posted);
    const env = { projectDir: (n) => join(root, n), studio };
    const r = await TOOLS[0].run({ project: "p" }, env, { pollMs: 1 });
    assert.deepEqual(posted, [["/api/bundle", { name: "p", ratio: "16x9" }]]);
    assert.equal(r.ok, true);
    assert.equal(r.bundle, "renders/p-bundle");
    assert.deepEqual(r.files, { fcpxml: join(out, "timeline.fcpxml"), xmeml: join(out, "timeline.xml"), otio: join(out, "timeline.otio") });
    assert.equal(r.shots, 3);

    const failed = await TOOLS[0].run({ project: "p" }, { ...env, studio: fakeStudio([[{ id: "j-1", status: "exited", code: 1, tail: ["bundle: lỗi"] }]], []) }, { pollMs: 1 });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /exit 1.*bundle: lỗi/);
    const late = await TOOLS[0].run({ project: "p" }, { ...env, studio: fakeStudio([], []) }, { pollMs: 1, waitMs: 5 });
    assert.match(late.error, /chưa xong/);
    await assert.rejects(TOOLS[0].run({ project: "p", ratio: "tall" }, env), /ratio/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bundle.mjs refuses a bad --nle or --fcpxml-version with exit 2", async () => {
  const project = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
  const err = [];
  const opts = { log: () => {}, err: (m) => err.push(m) };
  assert.equal(await bundleMain(["--project", project, "--nle", "edl"], opts), 2);
  assert.match(err.at(-1), /edl/);
  assert.equal(await bundleMain(["--project", project, "--fcpxml-version", "1.7"], opts), 2);
  assert.match(err.at(-1), /1\.10/);
  assert.equal(await bundleMain(["--project", project, "--nle"], opts), 2);
});

test("nle_export is in the tool registry", async () => {
  const t = (await loadTools()).find((x) => x.name === "nle_export");
  assert.ok(t);
  assert.equal(t.mutates, true);
  assert.deepEqual(t.inputSchema.required, ["project"]);
});
