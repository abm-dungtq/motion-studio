/*
  Template from the zoro-vs-mihawk project (its assets/anim/anim.js, the user's own code). Only the
  global changed: window.StudioAnim, with window.ZvmAnim kept as an alias.

  Character animation by swapping aligned image variants (anime limited animation), plus cutout
  motion on the plate. Data comes from assets/anim/anim-data.js (build.mjs from manifest.json).

  StudioAnim.apply(tl, data) turns each listed element into a pose stack:
    .char  > .anim-stack (breathing, tweens, steps) > .anim-shake (tremor, smears) > .pose x N
    .shot  > .anim-stack.plate-bg > .anim-shake > .pose x N   (full-frame plates such as s3, s5)
  The original plate (+ .tint) becomes the "base" pose. Ghost trails are clones of the stack
  that replay the same data a few frames late. Everything is tl.set()/fromTo() at fixed times;
  nothing reads a clock or a random source. Call it before other code queries .plate-bg.
*/
(function () {
  "use strict";
  const POSE_SMEAR = { filter: "blur(6px)", scaleX: 1.12, ghost: 0.35 };
  const ORIGIN = { right: "0% 50%", left: "100% 50%" }; // stretch toward the motion
  const IMPACT_FILTER = "invert(1) grayscale(1) contrast(4)";

  function checkFresh(data) {
    const T = window.TIMING;
    if (!T || !T.scenes) throw new Error("StudioAnim: window.TIMING missing");
    for (const [sid, w] of Object.entries(data.scenes)) {
      const s = T.scenes[sid];
      if (!s || s.start !== w[0] || s.end !== w[1]) {
        throw new Error("StudioAnim: anim-data.js is stale for " + sid + ": run node assets/anim/build.mjs");
      }
    }
  }

  function div(cls) {
    const d = document.createElement("div");
    d.className = cls;
    return d;
  }

  function makePose(name, src, plateClass, withTint) {
    const pose = div("pose");
    pose.dataset.pose = name;
    const img = document.createElement("img");
    img.className = plateClass;
    img.src = src;
    img.alt = "";
    pose.appendChild(img);
    if (withTint) {
      const tint = div("tint");
      tint.style.webkitMaskImage = "url(" + src + ")";
      tint.style.maskImage = "url(" + src + ")";
      pose.appendChild(tint);
    }
    return pose;
  }

  // Wrap the existing plate into the stack and add one pose per variant.
  function buildStack(st) {
    const el = document.getElementById(st.id);
    if (!el) throw new Error("StudioAnim: no element #" + st.id);
    const full = el.classList.contains("shot");
    const plateClass = full ? "plate-bg" : "plate-char";
    const plate = el.querySelector(":scope > ." + plateClass);
    if (!plate) throw new Error("StudioAnim: #" + st.id + " has no ." + plateClass);
    const tint = full ? null : el.querySelector(":scope > .tint");
    // a full-frame stack takes over the .plate-bg role, so the camera push moves every pose
    const stack = div(full ? "anim-stack plate-bg" : "anim-stack");
    const shake = div("anim-shake");
    const base = div("pose");
    base.dataset.pose = "base";
    el.insertBefore(stack, plate);
    stack.appendChild(shake);
    shake.appendChild(base);
    base.appendChild(plate);
    if (tint) base.appendChild(tint);
    for (const [name, src] of Object.entries(st.variants)) shake.appendChild(makePose(name, src, plateClass, !!tint));
    if (st.origin) stack.style.transformOrigin = st.origin;
    // static framing correction of a pose plate; applied to the pose's children so the
    // timeline's per-event scaleX/opacity on the .pose itself never overrides it
    Object.entries(st.offsets || {}).forEach(([name, o]) => {
      const pose = shake.querySelector('.pose[data-pose="' + name + '"]');
      if (pose) gsap.set(pose.children, o);
    });
    return stack;
  }

  function parts(stack) {
    const poses = {};
    stack.querySelectorAll(".pose").forEach((p) => { poses[p.dataset.pose] = p; });
    return { stack, shake: stack.querySelector(".anim-shake"), poses };
  }

  // Replay one stack's data on a set of elements, `dt` seconds late (0 for the stack itself).
  function drive(tl, st, p, fps, dt) {
    const at = (f) => Math.max(0, (f - 0.5) / fps + dt); // cuts land half a frame early
    const names = Object.keys(p.poses);
    st.events.forEach(([f, n, smear, ghost]) => {
      if (!p.poses[n]) throw new Error("StudioAnim: " + st.id + " has no pose " + n);
      names.forEach((name) => {
        const on = name === n;
        tl.set(p.poses[name], {
          autoAlpha: on ? 1 : name === ghost ? POSE_SMEAR.ghost : 0,
          filter: on && smear ? POSE_SMEAR.filter : "none",
          scaleX: on && smear ? POSE_SMEAR.scaleX : 1,
          transformOrigin: on && smear ? ORIGIN[smear] : "50% 50%",
        }, at(f));
      });
    });
    const t0 = st.f0 / fps + dt, t1 = st.f1 / fps + dt;
    if (st.breathe) {
      const half = st.breathe.period / 2;
      const repeat = Math.max(0, Math.floor((t1 - t0) / half) - 1);
      tl.fromTo(p.stack, { scale: 1 }, { scale: 1 + st.breathe.amp, duration: half, ease: "sine.inOut", yoyo: true, repeat, immediateRender: false }, t0);
    }
    st.tweens.forEach((tw) => {
      tl.fromTo(p[tw.target], tw.from, Object.assign({}, tw.to, { duration: tw.dur, ease: tw.ease, yoyo: tw.yoyo, repeat: tw.repeat, immediateRender: false }), tw.t + dt);
    });
    st.steps.forEach(([f, target, props]) => tl.set(p[target], props, at(f)));
    st.smears.forEach(([f, n, dir, blur, sx]) => {
      tl.set(p.shake, { filter: "blur(" + blur + "px)", scaleX: sx, transformOrigin: ORIGIN[dir] }, at(f));
      tl.set(p.shake, { filter: "none", scaleX: 1 }, at(f + n));
    });
  }

  function addStreaks(tl, st, stack, fps) {
    st.streaks.forEach((s) => {
      const el = div("anim-streaks " + s.side);
      stack.insertBefore(el, stack.firstChild);
      const a = (s.f0 - 0.5) / fps, b = (s.f1 - 0.5) / fps;
      const fade = Math.min(0.1, (b - a) / 3);
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: s.opacity, duration: 2 / fps, ease: "none", immediateRender: false }, a);
      tl.fromTo(el, { autoAlpha: s.opacity }, { autoAlpha: 0, duration: fade, ease: "none", immediateRender: false }, b - fade);
    });
  }

  function apply(tl, data) {
    if (!data || !Array.isArray(data.stacks)) throw new Error("StudioAnim: window.StudioAnimData missing: run node assets/anim/build.mjs");
    checkFresh(data);
    const fps = data.fps;

    data.stacks.forEach((st) => {
      const stack = buildStack(st);
      // ghosts are cloned before streaks are added, and without the tint masks (cheaper, and
      // a faint trail does not need the moonlight tint)
      st.ghosts.forEach((g) => {
        g.lags.forEach((lag, i) => {
          const c = stack.cloneNode(true);
          c.classList.add("anim-ghost");
          c.querySelectorAll(".tint").forEach((t) => t.remove());
          stack.parentNode.insertBefore(c, stack);
          const dt = lag / fps;
          drive(tl, st, parts(c), fps, dt);
          tl.set(c, { autoAlpha: g.opacity[i] }, (g.f0 - 0.5) / fps + dt);
          tl.set(c, { autoAlpha: 0 }, (g.f1 - 0.5) / fps);
        });
      });
      drive(tl, st, parts(stack), fps, 0);
      addStreaks(tl, st, stack, fps);
    });

    // impact frames (2 frames each by default)
    data.impacts.forEach(([f, n, mode, stackId]) => {
      const a = (f - 0.5) / fps, b = (f + n - 0.5) / fps;
      if (mode !== "silhouette") {
        tl.set("#stage", { filter: IMPACT_FILTER }, a);
        tl.set("#stage", { filter: "none" }, b);
        return;
      }
      // black cut-out of the pose shown at that instant, on a white card above the background
      const char = document.getElementById(stackId);
      const shot = char && char.closest(".shot");
      const shake = char && char.querySelector(":scope > .anim-stack > .anim-shake");
      if (!shot || !shake) throw new Error("StudioAnim: silhouette impact needs a built stack #" + stackId);
      const card = div("anim-impact-card");
      shot.insertBefore(card, char);
      tl.set(card, { autoAlpha: 1 }, a);
      tl.set(card, { autoAlpha: 0 }, b);
      tl.set(shake, { filter: "brightness(0)" }, a);
      tl.set(shake, { filter: "none" }, b);
    });
  }

  window.StudioAnim = { apply };
  // The name the first project using this system (zoro-vs-mihawk) calls it by.
  window.ZvmAnim = window.StudioAnim;
})();
