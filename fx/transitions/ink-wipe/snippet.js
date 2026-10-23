/* Motion Studio fx pack "ink-wipe": ink blots spread from a point until they cover the frame,
   the scenes swap under full cover, then holes open in the ink and grow to reveal the incoming
   scene. The blots are SVG circles roughened by feTurbulence + feDisplacementMap (fixed seed);
   the holes are the same circles inside an SVG mask over a full-frame ink rect.
   Determinism: frame(t, opts) is a pure function of its arguments; blot positions, sizes and
   delays come from a seeded PRNG (mulberry32, public domain,
   https://github.com/bryc/code/blob/master/jshash/PRNGs.md). The noise edge follows the idea of
   gl-transitions luminance_melt.glsl and burn.glsl (MIT, https://github.com/gl-transitions/gl-transitions),
   re-done with SVG filters because the pinned shader-transitions package takes no custom GLSL. */
(function (root) {
  "use strict";
  var ID = "ink-wipe";
  var DEFAULTS = { duration: 0.9, blobs: 7, ox: 0.5, oy: 0.5, rough: 80, seed: 11, width: 1920, height: 1080 };

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
  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var ease = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  // Blot layout: the first starts at (ox, oy) and alone covers the frame; the rest are seeded
  // satellites that start a little later. [{ cx, cy, max, delay }]
  function layout(o) {
    var rnd = prng(o.seed), W = o.width, H = o.height;
    var ox = o.ox * W, oy = o.oy * H;
    var far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    var out = [{ cx: r1(ox), cy: r1(oy), max: r1(far * 1.08 + o.rough), delay: 0 }];
    var diag = Math.hypot(W, H);
    for (var i = 1; i < o.blobs; i++) {
      out.push({ cx: r1(rnd() * W), cy: r1(rnd() * H), max: r1(diag * (0.18 + rnd() * 0.3)), delay: Math.round((0.1 + rnd() * 0.3) * 1000) / 1000 });
    }
    return out;
  }
  function grow(list, q) {
    return list.map(function (b) { return { cx: b.cx, cy: b.cy, r: r1(b.max * ease(clamp((q - b.delay) / (1 - b.delay)))) }; });
  }

  // State at t seconds after the wipe starts. phase "cover" (blots grow), then "reveal" (holes
  // grow in a full ink cover); swap is true once the incoming scene should show.
  function frame(t, options) {
    var o = opt(options);
    var p = clamp(t / o.duration), L = layout(o);
    var zero = grow(L, 0);
    if (p <= 0 || p >= 1) return { on: false, phase: null, swap: p >= 1, blobs: zero, holes: zero, cover: false };
    if (p < 0.5) return { on: true, phase: "cover", swap: false, blobs: grow(L, p / 0.5), holes: zero, cover: false };
    return { on: true, phase: "reveal", swap: true, blobs: zero, holes: grow(L, (p - 0.5) / 0.5), cover: true };
  }

  // els: { overlay (svg), blobs [circle], holes [circle], cover (rect), noise (feTurbulence), disp (feDisplacementMap) }.
  function apply(els, s) {
    if (els.overlay) els.overlay.style.visibility = s.on ? "visible" : "hidden";
    if (els.cover) els.cover.style.visibility = s.cover ? "visible" : "hidden";
    var set = function (nodes, list) {
      for (var i = 0; nodes && i < nodes.length; i++) {
        var b = list[i] || { cx: 0, cy: 0, r: 0 };
        nodes[i].setAttribute("cx", b.cx); nodes[i].setAttribute("cy", b.cy); nodes[i].setAttribute("r", b.r);
      }
    };
    set(els.blobs, s.blobs);
    set(els.holes, s.holes);
  }

  // Adds the wipe at opts.at: a tween of a plain { t } proxy whose onUpdate draws frame(t), and
  // tl.set for the scene swap at the middle (els.from / els.to) and for the overlay's visibility.
  function attach(tl, els, options) {
    var o = opt(options);
    if (!(o.at >= 0)) throw new Error("ink-wipe: cần at (giây bắt đầu chuyển cảnh)");
    if (els.noise) els.noise.setAttribute("seed", String(o.seed));
    if (els.disp) els.disp.setAttribute("scale", String(o.rough));
    apply(els, frame(0, o));
    var proxy = { t: 0 };
    tl.fromTo(proxy, { t: 0 }, { t: o.duration, duration: o.duration, ease: "none", immediateRender: false, onUpdate: function () { apply(els, frame(proxy.t, o)); } }, o.at);
    var mid = o.at + o.duration / 2;
    if (els.from) tl.set(els.from, { autoAlpha: 0 }, mid);
    if (els.to) tl.set(els.to, { autoAlpha: 1 }, mid);
    if (els.overlay) { tl.set(els.overlay, { visibility: "visible" }, o.at); tl.set(els.overlay, { visibility: "hidden" }, o.at + o.duration); }
    return tl;
  }

  var fx = { id: ID, defaults: DEFAULTS, frame: frame, apply: apply, attach: attach, layout: layout };
  (root.MotionFx = root.MotionFx || {})[ID] = fx;
  if (typeof module === "object" && module && module.exports) module.exports = fx;
})(typeof globalThis !== "undefined" ? globalThis : this);
