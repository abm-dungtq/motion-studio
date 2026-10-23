/* Motion Studio fx pack "speed-lines": an anime speed-lines burst (集中線) drawn on a canvas.
   Thin wedges radiate from a focus point; their set changes every `hold` frames ("on twos"),
   then they retreat to the edges and vanish. Use it at a cut or over a hit.
   Determinism: frame(t, opts) is a pure function of its arguments; each held frame's lines come
   from a seeded PRNG (mulberry32, public domain, https://github.com/bryc/code/blob/master/jshash/PRNGs.md).
   apply() redraws the whole canvas from that state, so nothing carries over between frames. */
(function (root) {
  "use strict";
  var ID = "speed-lines";
  var DEFAULTS = { duration: 0.6, fps: 30, hold: 2, count: 90, cx: 0.5, cy: 0.5, inner: 0.28, color: "#ffffff", seed: 3, width: 1920, height: 1080 };

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

  // State at t seconds after the burst starts: { on, k, color, lines: [[x0, y0, x1, y1, x2, y2]] }.
  function frame(t, options) {
    var o = opt(options);
    var n = Math.floor(t * o.fps + 1e-6);
    var total = Math.max(1, Math.round(o.duration * o.fps));
    if (!(n >= 0 && n < total)) return { on: false, k: -1, color: o.color, lines: [] };
    var k = Math.floor(n / Math.max(1, o.hold));
    var p = n / total;
    var rnd = prng(o.seed * 7919 + k * 104729 + 3);
    var W = o.width, H = o.height, cx = o.cx * W, cy = o.cy * H;
    var far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.05;
    var base = o.inner * Math.min(W, H);
    var retreat = p > 0.65 ? (p - 0.65) / 0.35 : 0;
    var lines = [];
    for (var i = 0; i < o.count; i++) {
      var a = rnd() * Math.PI * 2;
      var w = 0.002 + rnd() * 0.006;
      var rin = base * (0.8 + rnd() * 0.9) + (far - base) * retreat * retreat;
      if (rin >= far) continue;
      lines.push([
        r1(cx + Math.cos(a) * rin), r1(cy + Math.sin(a) * rin),
        r1(cx + Math.cos(a - w) * far), r1(cy + Math.sin(a - w) * far),
        r1(cx + Math.cos(a + w) * far), r1(cy + Math.sin(a + w) * far),
      ]);
    }
    return { on: true, k: k, color: o.color, lines: lines };
  }

  // els: { canvas } (a 2D canvas of width × height pixels).
  function apply(els, s) {
    var c = els.canvas;
    if (!c) return;
    var g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    c.style.visibility = s.on ? "visible" : "hidden";
    if (!s.on) return;
    g.fillStyle = s.color;
    g.beginPath();
    for (var i = 0; i < s.lines.length; i++) {
      var l = s.lines[i];
      g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.lineTo(l[4], l[5]); g.closePath();
    }
    g.fill();
  }

  // Adds the burst at opts.at: a tween of a plain { t } proxy whose onUpdate redraws frame(t),
  // plus tl.set of the canvas visibility at the start and the end.
  function attach(tl, els, options) {
    var o = opt(options);
    if (!(o.at >= 0)) throw new Error("speed-lines: cần at (giây bắt đầu)");
    apply(els, frame(-1, o));
    var proxy = { t: 0 };
    tl.fromTo(proxy, { t: 0 }, { t: o.duration, duration: o.duration, ease: "none", immediateRender: false, onUpdate: function () { apply(els, frame(proxy.t, o)); } }, o.at);
    if (els.canvas) { tl.set(els.canvas, { visibility: "visible" }, o.at); tl.set(els.canvas, { visibility: "hidden" }, o.at + o.duration); }
    return tl;
  }

  var fx = { id: ID, defaults: DEFAULTS, frame: frame, apply: apply, attach: attach };
  (root.MotionFx = root.MotionFx || {})[ID] = fx;
  if (typeof module === "object" && module && module.exports) module.exports = fx;
})(typeof globalThis !== "undefined" ? globalThis : this);
