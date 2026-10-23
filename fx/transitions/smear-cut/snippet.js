/* Motion Studio fx pack "smear-cut": smear frames across a cut, as in hand-drawn animation. The
   last frame(s) of the outgoing scene and the first of the incoming one are stretched along the
   motion and blurred along that axis only (an SVG feGaussianBlur with a one-axis stdDeviation),
   with the strongest smear right at the cut. Placed with tl.set at half-frame offsets.
   Determinism: frame(t, opts) is a pure function; no random source at all.
   Smeared-edge idea from gl-transitions directionalwarp.glsl (pschroen, MIT,
   https://github.com/gl-transitions/gl-transitions); re-done in CSS/SVG, no GLSL copied. */
(function (root) {
  "use strict";
  var ID = "smear-cut";
  var DEFAULTS = { fps: 30, frames: 2, dir: "right", stretch: 1.35, blur: 18, shift: 60 };
  var AXIS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
  // Stretch toward where the motion goes: the origin is on the opposite edge.
  var ORIGIN = { right: "0% 50%", left: "100% 50%", down: "50% 0%", up: "50% 100%" };

  function opt(o) { var out = {}, k; for (k in DEFAULTS) out[k] = DEFAULTS[k]; if (o) for (k in o) if (o[k] !== undefined) out[k] = o[k]; return out; }
  var r3 = function (x) { return Math.round(x * 1000) / 1000; };

  // Smear frames: pre = ceil(frames/2) on the outgoing side (k = −pre … −1), the rest on the
  // incoming side (k = 0 …). Strength falls off linearly from the cut.
  function frame(t, options) {
    var o = opt(options);
    var ax = AXIS[o.dir] || AXIS.right;
    var pre = Math.ceil(o.frames / 2), post = o.frames - pre;
    var k = Math.floor(t * o.fps + 0.5);
    var none = { on: false, k: k, side: null, scaleX: 1, scaleY: 1, x: 0, y: 0, std: "0 0", origin: ORIGIN[o.dir] || ORIGIN.right };
    if (k < -pre || k >= post) return none;
    var side = k < 0 ? "out" : "in";
    var w = side === "out" ? (pre + k + 1) / pre : (post - k) / Math.max(1, post);
    var s = 1 + (o.stretch - 1) * w, b = o.blur * w, d = o.shift * w * (side === "out" ? 1 : -1);
    return {
      on: true, k: k, side: side,
      scaleX: r3(ax[0] ? s : 1), scaleY: r3(ax[1] ? s : 1),
      x: r3(ax[0] * d), y: r3(ax[1] * d),
      std: r3(ax[0] ? b : 0) + " " + r3(ax[1] ? b : 0),
      origin: ORIGIN[o.dir] || ORIGIN.right,
    };
  }

  // els: { from (outgoing scene), to (incoming scene), blur (the feGaussianBlur), filterUrl }.
  function apply(els, s) {
    var on = s.on ? els[s.side === "out" ? "from" : "to"] : null;
    [els.from, els.to].forEach(function (el) {
      if (!el) return;
      var me = el === on;
      el.style.transformOrigin = s.origin;
      el.style.transform = me ? "translate(" + s.x + "px," + s.y + "px) scale(" + s.scaleX + "," + s.scaleY + ")" : "none";
      el.style.filter = me ? els.filterUrl : "none";
    });
    if (els.blur) els.blur.setAttribute("stdDeviation", s.std);
  }

  // Adds the smear to a GSAP timeline around opts.at (the cut, s).
  function attach(tl, els, options) {
    var o = opt(options);
    if (!(o.at >= 0)) throw new Error("smear-cut: cần at (giây của điểm cắt)");
    var half = 0.5 / o.fps, pre = Math.ceil(o.frames / 2), post = o.frames - pre;
    for (var k = -pre; k < post; k++) {
      var s = frame(k / o.fps, o), at = Math.max(0, o.at + k / o.fps - half);
      var el = s.side === "out" ? els.from : els.to, other = s.side === "out" ? els.to : els.from;
      tl.set(el, { transformOrigin: s.origin, x: s.x, y: s.y, scaleX: s.scaleX, scaleY: s.scaleY, filter: els.filterUrl }, at);
      if (other) tl.set(other, { x: 0, y: 0, scaleX: 1, scaleY: 1, filter: "none" }, at);
      if (els.blur) tl.set(els.blur, { attr: { stdDeviation: s.std } }, at);
    }
    var end = o.at + post / o.fps - half;
    [els.from, els.to].forEach(function (e) { if (e) tl.set(e, { x: 0, y: 0, scaleX: 1, scaleY: 1, filter: "none" }, end); });
    if (els.blur) tl.set(els.blur, { attr: { stdDeviation: "0 0" } }, end);
    return tl;
  }

  var fx = { id: ID, defaults: DEFAULTS, frame: frame, apply: apply, attach: attach };
  (root.MotionFx = root.MotionFx || {})[ID] = fx;
  if (typeof module === "object" && module && module.exports) module.exports = fx;
})(typeof globalThis !== "undefined" ? globalThis : this);
