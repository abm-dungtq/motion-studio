// icons.js — the rail icons: one stroke family (24 grid, 1.75 stroke, round caps), drawn in
// currentColor so the active and hover colors come from the CSS tokens. icon(name, shapes)
// registers an extension's icon first: shapes is a list of [tag, attrs] like SHAPES below, or one
// path "d" string. A name nobody registered draws the default puzzle-piece icon.
const NS = "http://www.w3.org/2000/svg";

const SHAPES = {
  // Speech bubble with two text lines: talking to the AI director.
  ai: [["path", { d: "M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" }], ["path", { d: "M8 9h8M8 12.5h5" }]],
  // Film strip: footage and source media.
  media: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "M7.5 3v18M16.5 3v18M3 12h18M3 7.5h4.5M3 16.5h4.5M16.5 7.5H21M16.5 16.5H21" }]],
  // Microphone: script lines and voice-over.
  voice: [["rect", { x: 9, y: 3, width: 6, height: 11, rx: 3 }], ["path", { d: "M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21M9 21h6" }]],
  // Two beamed notes: music and sound effects.
  music: [["path", { d: "M9 18V5.5l11-2V16" }], ["circle", { cx: 6.5, cy: 18, r: 2.5 }], ["circle", { cx: 17.5, cy: 16, r: 2.5 }]],
  // Stacked cards: the reference library.
  library: [["rect", { x: 3, y: 8, width: 13, height: 13, rx: 2 }], ["path", { d: "M7 4.5h12a2 2 0 0 1 2 2v10" }]],
  // Arrow out of a tray: export and delivered files.
  output: [["path", { d: "M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M12 15V4M7.5 8.5 12 4l4.5 4.5" }]],
};

// A puzzle piece: an extension tab without its own icon.
const FALLBACK = [["path", { d: "M10 4h4v2.5a1.5 1.5 0 0 0 3 0V4h3v6h-2.5a1.5 1.5 0 0 0 0 3H20v7h-7v-2.5a1.5 1.5 0 0 0-3 0V20H4v-6h2.5a1.5 1.5 0 0 0 0-3H4V4z" }]];

export function icon(name, shapes) {
  if (typeof shapes === "string") shapes = [["path", { d: shapes }]];
  if (Array.isArray(shapes) && shapes.length && !Object.hasOwn(SHAPES, name)) SHAPES[name] = shapes;
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", "stroke-width": 1.75, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false", class: "icon" })) svg.setAttribute(k, String(v));
  for (const [tag, attrs] of (Object.hasOwn(SHAPES, name) ? SHAPES[name] : FALLBACK)) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}
