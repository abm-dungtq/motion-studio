// lib/nle/fcpxml.mjs — FCPXML of the NLE model (lib/nle/index.mjs timeline()), for Final Cut Pro
// and DaVinci Resolve 18+ (which read 1.8 to 1.10).
// Structure from ChatOctopus/timeline src/fcpxml/writer.ts (https://github.com/ChatOctopus/timeline,
// commit 352d8f8, MIT): resources (one format, one asset per file) then library > event > project >
// sequence > spine; shots are asset-clips on the spine; the audio stems are connected asset-clips
// (lane -1, -2, …) of the first shot; markers sit in the shot clip they fall in. Element order and
// attributes follow Apple's FCPXMLv1_8.dtd and FCPXMLv1_10.dtd: 1.10 names the file in a
// <media-rep> child of <asset>, 1.8 in its src attribute (and has no videoSources).
// esc() and xml() are shared with xmeml.mjs.
import { frames } from "./time.mjs";

export const FCPXML_VERSIONS = ["1.10", "1.8"];

// Text for an XML attribute or element: & < > " ' as entities; everything else (Vietnamese
// included) stays as UTF-8.
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// [tag, attrs, ...children] (a child is another node or a string) as indented XML; attributes with
// an undefined or null value are left out; a node without children closes itself.
export function xml(node, depth = 0) {
  const [tag, attrs = {}, ...kids] = node;
  const pad = "  ".repeat(depth);
  const a = Object.entries(attrs).filter(([, v]) => v != null).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  const list = kids.filter((k) => k != null);
  if (!list.length) return `${pad}<${tag}${a}/>`;
  if (list.length === 1 && typeof list[0] === "string") return `${pad}<${tag}${a}>${esc(list[0])}</${tag}>`;
  return `${pad}<${tag}${a}>\n${list.map((k) => (typeof k === "string" ? `${pad}  ${esc(k)}` : xml(k, depth + 1))).join("\n")}\n${pad}</${tag}>`;
}

const modDate = (d) => `${d.toISOString().slice(0, 19).replace("T", " ")} +0000`;

export function fcpxml(t, { now = new Date(), version = FCPXML_VERSIONS[0] } = {}) {
  if (!FCPXML_VERSIONS.includes(version)) throw new Error(`FCPXML ${version}: chỉ có ${FCPXML_VERSIONS.join(", ")}`);
  const r = t.rate, f = (n) => frames(n, r);
  const media = version === "1.8" ? (url) => ({ src: url, kids: [] }) : (url) => ({ src: null, kids: [["media-rep", { kind: "original-media", src: url }]] });
  let n = 1;
  const vid = t.video.map((v) => ({ ...v, ref: `r${++n}` }));
  const aud = t.audio.map((a) => ({ ...a, ref: `r${++n}` }));
  const asset = (x, attrs) => { const m = media(x.url); return ["asset", { id: x.ref, name: x.asset, start: "0s", ...attrs, src: m.src }, ...m.kids]; };
  const resources = ["resources", {},
    ["format", { id: "r1", frameDuration: f(1), width: t.width, height: t.height }],
    ...vid.map((v) => asset(v, { duration: f(v.duration), hasVideo: "1", format: "r1", videoSources: version === "1.8" ? null : "1" })),
    ...aud.map((a) => asset(a, { duration: f(a.length), hasAudio: "1", audioSources: "1", audioChannels: "2", audioRate: "48000" })),
  ];
  const lanes = aud.map((a, i) => ["asset-clip", { ref: a.ref, lane: String(-(i + 1)), offset: "0s", name: a.name, start: f(a.start), duration: f(a.duration), audioRole: a.role }]);
  const spine = vid.map((v, i) => ["asset-clip", { ref: v.ref, offset: f(v.offset), name: v.name, start: "0s", duration: f(v.duration), tcFormat: "NDF" },
    ...(i === 0 ? lanes : []),
    ...t.markers.filter((m) => m.frame >= v.offset && m.frame < v.offset + v.duration)
      .map((m) => ["marker", { start: f(m.frame - v.offset), duration: f(1), value: m.name, note: m.note !== m.name ? m.note : null }]),
  ]);
  const doc = ["fcpxml", { version }, resources,
    ["library", {}, ["event", { name: t.name },
      ["project", { name: t.name, modDate: modDate(now) },
        ["sequence", { format: "r1", duration: f(t.length), tcStart: "0s", tcFormat: "NDF", audioLayout: "stereo", audioRate: "48k" },
          ["spine", {}, ...spine]]]]]];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n\n${xml(doc)}\n`;
}
