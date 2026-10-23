// lib/nle/xmeml.mjs — xmeml v5 (Final Cut 7 XML) of the NLE model (lib/nle/index.mjs timeline()),
// for Premiere Pro and DaVinci Resolve.
// Structure from ChatOctopus/timeline src/xmeml/writer.ts (https://github.com/ChatOctopus/timeline,
// commit 352d8f8, MIT): sequence > media > video > track > clipitem (with its <file> and pathurl),
// then audio > track, every time in frames on <rate>{ timebase, ntsc }. Here each shot is a
// clipitem of the one video track, each audio stem a track of its own, and the markers are
// sequence markers (<in> the frame, <out> -1 for a point).
import { xml } from "./fcpxml.mjs";
import { ntsc, tc, timebase } from "./time.mjs";

const L = (tag, v) => [tag, {}, String(v)];

export function xmeml(t) {
  const r = t.rate;
  const rate = ["rate", {}, L("timebase", timebase(r)), L("ntsc", ntsc(r) ? "TRUE" : "FALSE")];
  const timecode = ["timecode", {}, rate, L("string", tc(0, r)), L("frame", 0), L("displayformat", "NDF")];
  const picture = ["samplecharacteristics", {}, rate, L("width", t.width), L("height", t.height), L("anamorphic", "FALSE"), L("pixelaspectratio", "square"), L("fielddominance", "none")];
  const sound = ["samplecharacteristics", {}, L("depth", 16), L("samplerate", 48000)];
  let n = 0;
  const item = (x, { start, len, src, fileLen, kind }) => {
    const id = ++n;
    return ["clipitem", { id: `clipitem-${id}` },
      L("name", x.name), L("enabled", "TRUE"), L("duration", fileLen), rate,
      L("start", start), L("end", start + len), L("in", src), L("out", src + len),
      ["file", { id: `file-${id}` },
        L("name", x.file.split("/").pop()), L("pathurl", x.url), rate, L("duration", fileLen), timecode,
        ["media", {}, kind === "video" ? ["video", {}, picture] : ["audio", {}, sound, L("channelcount", 2)]]],
      ["sourcetrack", {}, L("mediatype", kind), L("trackindex", 1)]];
  };
  const doc = ["xmeml", { version: "5" },
    ["sequence", { id: "sequence-1" },
      L("name", t.name), L("duration", t.length), rate, timecode, L("in", 0), L("out", t.length),
      ["media", {},
        ["video", {}, ["format", {}, picture],
          ["track", {}, ...t.video.map((v) => item(v, { start: v.offset, len: v.duration, src: 0, fileLen: v.duration, kind: "video" }))]],
        ["audio", {}, L("numOutputChannels", 2), ["format", {}, sound],
          ...t.audio.map((a) => ["track", {}, item(a, { start: 0, len: a.duration, src: a.start, fileLen: a.length, kind: "audio" })])]],
      ...t.markers.map((m) => ["marker", {}, L("name", m.name), L("comment", m.note), L("in", m.frame), L("out", -1)])]];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n${xml(doc)}\n`;
}
