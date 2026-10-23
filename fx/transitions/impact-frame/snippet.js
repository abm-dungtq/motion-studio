/* Motion Studio fx pack "impact-frame": 2–3 anime impact frames at a cut. Each frame is a
   negative (invert) or a black silhouette on a white card, with radial speed lines that change
   every frame. Everything is placed with tl.set at half-frame offsets (no opacity tween, no
   callback), so seeking any frame in any order shows the same picture.
   Determinism: frame(t, opts) is a pure function of its arguments; the lines come from a
   seeded PRNG (mulberry32, public domain, https://github.com/bryc/code/blob/master/jshash/PRNGs.md).
   The invert filter and the silhouette card follow the impacts of the zoro-vs-mihawk project. */
(function (root) {
  "use strict";
  var ID = "impact-frame";
  var DEFAULTS = { fps: 30, frames: 2, mode: "invert", lines: true, count: 44, cx: 0.5, cy: 0.5, inner: 0.22, seed: 7, width: 1920, height: 1080 };
  var INVERT = "invert(1) grayscale(1) contrast(4)";

  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function opt(o) { var out = {}, k; for (k in DEFAULTS) out[k] = DEFAULTS[k]; if (o) for (k in o) if (o[k] !== undefined) out[k] = o[k]; return out; }
  var r1 = function (x) { return Math.round(x * 10) / 10; };

  // Wedges radiating from (cx, cy) past the frame edge: SVG polygon point strings.
  function lines(o, k) {
    var rnd = prng(o.seed * 7919 + k * 104729 + 1), out = [];
    var cx = o.cx * o.width, cy = o.cy * o.height, far = Math.sqrt(o.width * o.width + o.height * o.height);
    var r0 = o.inner * Math.min(o.width, o.height);
    for (var i = 0; i < o.count; i++) {
      var a = (i + rnd() * 0.8) / o.count * Math.PI * 2;
      var w = 0.004 + rnd() * 0.012;
      var rin = r0 * (0.75 + rnd() * 0.6);
      out.push([
        r1(cx + Math.cos(a) * rin) + "," + r1(cy + Math.sin(a) * rin),
        r1(cx + Math.cos(a - w) * far) + "," + r1(cy + Math.sin(a - w) * far),
        r1(cx + Math.cos(a + w) * far) + "," + r1(cy + Math.sin(a + w) * far),
      ].join(" "));
    }
    return out;
  }

  // State at t seconds after the cut: impact frame k = 0 … frames-1, then nothing.
  function frame(t, options) {
    var o = opt(options);
    var k = Math.floor(t * o.fps + 0.5);
    if (!(k >= 0 && k < o.frames)) return { on: false, k: -1, filter: "none", card: false, lines: [] };
    return { on: true, k: k, filter: o.mode === "silhouette" ? "brightness(0)" : INVERT, card: o.mode === "silhouette", lines: o.lines ? lines(o, k) : [] };
  }

  // els: { target (stage or pose), card (white card, silhouette mode), overlay (svg), polys }.
  function apply(els, s) {
    if (els.target) els.target.style.filter = s.filter;
    if (els.card) els.card.style.visibility = s.card ? "visible" : "hidden";
    if (els.overlay) els.overlay.style.visibility = s.on && s.lines.length ? "visible" : "hidden";
    if (els.polys) for (var i = 0; i < els.polys.length; i++) els.polys[i].setAttribute("points", s.lines[i] || "0,0 0,0 0,0");
  }

  // Adds the impact to a GSAP timeline: tl.set at at + (k − 0.5)/fps for each frame k, and the
  // restore half a frame after the last one. els as in apply; opts as DEFAULTS plus at (the cut, s).
  function attach(tl, els, options) {
    var o = opt(options);
    if (!(o.at >= 0)) throw new Error("impact-frame: cần at (giây của điểm cắt)");
    var half = 0.5 / o.fps;
    for (var k = 0; k < o.frames; k++) {
      var s = frame(k / o.fps, o), at = Math.max(0, o.at + k / o.fps - half);
      if (els.target) tl.set(els.target, { filter: s.filter }, at);
      if (els.card) tl.set(els.card, { visibility: s.card ? "visible" : "hidden" }, at);
      if (els.overlay) tl.set(els.overlay, { visibility: s.lines.length ? "visible" : "hidden" }, at);
      if (els.polys) for (var i = 0; i < els.polys.length; i++) tl.set(els.polys[i], { attr: { points: s.lines[i] || "0,0 0,0 0,0" } }, at);
    }
    var end = o.at + o.frames / o.fps - half;
    if (els.target) tl.set(els.target, { filter: "none" }, end);
    if (els.card) tl.set(els.card, { visibility: "hidden" }, end);
    if (els.overlay) tl.set(els.overlay, { visibility: "hidden" }, end);
    return tl;
  }

  var fx = { id: ID, defaults: DEFAULTS, frame: frame, apply: apply, attach: attach };
  (root.MotionFx = root.MotionFx || {})[ID] = fx;
  if (typeof module === "object" && module && module.exports) module.exports = fx;
})(typeof globalThis !== "undefined" ? globalThis : this);
