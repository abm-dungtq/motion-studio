#!/usr/bin/env node
// Template from the zoro-vs-mihawk project (/Volumes/2/Edit-Video/zoro-vs-mihawk/assets/anim/build.mjs,
// the user's own code). Only the global changed: window.StudioAnimData, with window.ZvmAnimData kept
// as an alias so a page written for the first project still runs. Motion Studio copies this file
// into a project's assets/anim/ ("Bật hệ lật ảnh") and never edits the project's copy.
// Resolve assets/anim/manifest.json into assets/anim/anim-data.js (window.StudioAnimData).
//
// The manifest declares rules (lipsync, blink, wind, keys) and cutout motion (tweens, steps,
// smears, ghost trails, speed streaks, tremor). This script expands them on the composition's
// frame grid into fixed lists, so the page never fetches JSON and anim.js only replays them.
//
// Missing variant files are not an error. A track that names a missing file either:
//   - has a "fallback" block: the track is replaced by fallback.tracks and fallback motion, or
//   - has none: each missing pose shows "base" (the shot's existing plate).
// Both cases are reported on stderr, so lint/check keep passing while variants are generated,
// and dropping the real PNG in later switches the shot over with no code change.
//
// Re-run after editing manifest.json, adding variant PNGs, or re-running timing.mjs:
//   node assets/anim/build.mjs            (from the project directory)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, "..", "..");
const MANIFEST = join(HERE, "manifest.json");
const OUT = join(HERE, "anim-data.js");
const INDEX = join(PROJECT, "index.html");

const fail = (msg) => {
  console.error(`anim build: ${msg}`);
  process.exit(1);
};
const warn = (msg) => console.error(`anim build: WARN ${msg}`);
const readJson = (path, what) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return fail(`cannot read ${what} ${path}: ${e.message}`);
  }
};

// ---------- composition facts: TIMING block, audio start times, element ids ----------
const html = readFileSync(INDEX, "utf8");
const tm = html.match(/\/\* TIMING:BEGIN \*\/\s*window\.TIMING\s*=\s*(\{[\s\S]*?\});\s*\/\* TIMING:END \*\//);
if (!tm) fail("index.html has no TIMING:BEGIN/END block");
const TIMING = JSON.parse(tm[1]);
const AUDIO = {};
for (const m of html.matchAll(/<audio\b[^>]*>/g)) {
  const id = m[0].match(/\bid="([^"]+)"/)?.[1];
  const start = m[0].match(/\bdata-start="([^"]+)"/)?.[1];
  const src = m[0].match(/\bsrc="([^"]+)"/)?.[1];
  if (id && start !== undefined) AUDIO[id] = { start: Number(start), src };
}
const hasId = (id) => new RegExp(`\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html);

const M = readJson(MANIFEST, "manifest");
const FPS = Number(M.fps || TIMING.fps || 30);
if (!(FPS > 0)) fail(`bad fps ${M.fps}`);
const DIR = M.dir || "assets/plates/anim";
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const EPS = 1e-6;
const frameAt = (t) => Math.ceil(t * FPS - EPS); // first frame whose time is >= t

const scene = (sid, ctx) => {
  const s = TIMING.scenes?.[sid];
  if (!s) fail(`${ctx}: TIMING has no scene "${sid}"`);
  return s;
};

// Time spec: a number (absolute seconds) or "<ref>[+|-<seconds>]" where ref is a scene id
// (its start), "<scene>.end", or an <audio> id (its data-start), e.g. "s13+0.1", "sfx-sheathe".
const timeOf = (spec, ctx) => {
  if (typeof spec === "number" && Number.isFinite(spec)) return spec;
  if (typeof spec !== "string") fail(`${ctx}: bad time ${JSON.stringify(spec)}`);
  const m = spec.trim().match(/^([A-Za-z0-9_.-]+?)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/);
  if (!m) fail(`${ctx}: bad time "${spec}"`);
  const [, ref, sign, off] = m;
  let base;
  if (/^s\d+\.end$/.test(ref)) base = scene(ref.slice(0, -4), ctx).end;
  else if (TIMING.scenes?.[ref]) base = TIMING.scenes[ref].start;
  else if (AUDIO[ref]) base = AUDIO[ref].start;
  else fail(`${ctx}: unknown time reference "${ref}" (scene id, <scene>.end or <audio> id)`);
  return base + (off ? (sign === "-" ? -1 : 1) * Number(off) : 0);
};

// ---------- variant resolution ----------
// pose(name, miss) returns the pose to show; a missing file is pushed onto `miss` and becomes base.
const fileOf = (name, ctx) => {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/i.test(name)) fail(`${ctx}: bad pose name ${JSON.stringify(name)}`);
  return `${DIR}/${name}.png`;
};
const makeResolver = (ctx) => {
  const used = {};
  const pose = (name, miss) => {
    if (name === null || name === undefined || name === "base") return "base";
    const rel = fileOf(name, ctx);
    if (!existsSync(join(PROJECT, rel))) {
      miss.push(rel);
      return "base";
    }
    used[name] = rel;
    return name;
  };
  return { pose, used };
};

// ---------- track rules: each returns (frame) => {n, smear?, ghost?} | null ----------
const LIP_CYCLE = ["open", "half", "open2", "closed"];
const SMEAR_DIRS = new Set(["left", "right"]);

function lipsyncTrack(tr, ctx, pose) {
  const a = AUDIO[tr.voice];
  if (!a) fail(`${ctx}: no <audio id="${tr.voice}"> in index.html`);
  const words = readJson(join(PROJECT, `${a.src}.words.json`), "words");
  if (!Array.isArray(words)) fail(`${ctx}: ${a.src}.words.json is not an array`);
  const spans = words.map((w, i) => {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) fail(`${ctx}: word ${i} has no start/end`);
    return [a.start + w.start, a.start + w.end];
  });
  const open = pose(tr.open);
  const P = { open, half: pose(tr.half ?? tr.open), open2: pose(tr.open2 ?? tr.open), closed: pose(tr.closed) };
  const idle = tr.idle === null ? null : P[tr.idle || "closed"];
  if (idle === undefined) fail(`${ctx}: idle must be open, half, closed or null`);
  return (f) => {
    const t = f / FPS;
    const w = spans.find(([w0, w1]) => t >= w0 - EPS && t < w1 - EPS);
    if (!w) return idle ? { n: idle } : null;
    // 10 mouth changes per second on the absolute clock; each word starts on "open"
    const step = Math.floor(t * 10 + EPS) - Math.floor(w[0] * 10 + EPS);
    return { n: P[LIP_CYCLE[step % 4]] };
  };
}

function blinkTrack(tr, ctx, pose) {
  const n = pose(tr.pose);
  const len = tr.frames ?? 3;
  const starts = (tr.at || []).map((s, i) => frameAt(timeOf(s, `${ctx} at[${i}]`)));
  return (f) => (starts.some((s) => f >= s && f < s + len) ? { n } : null);
}

function windTrack(tr, ctx, pose) {
  const cycle = (tr.frames || ["base", "w1", "w2", "w1"]).map((n) => pose(n));
  const hold = Math.max(1, Math.round(FPS / (tr.fps || 6))); // 6 fps = on fives at 30 fps
  const phase = tr.phase || 0;
  return (f) => ({ n: cycle[Math.floor((f + phase) / hold) % cycle.length] });
}

function keysTrack(tr, ctx, pose, f0) {
  if (!Array.isArray(tr.keys) || !tr.keys.length) fail(`${ctx}: keys track needs keys[]`);
  const start = tr.at === undefined ? f0 : frameAt(timeOf(tr.at, `${ctx} at`));
  const seq = []; // [frameStart, value]
  let f = start;
  let prev = pose(tr.prev ?? "base"); // pose the first smear ghosts from
  tr.keys.forEach((k, i) => {
    const kctx = `${ctx} keys[${i}]`;
    const n = pose(k.pose);
    if (k.smear) {
      if (!SMEAR_DIRS.has(k.smear)) fail(`${kctx}: smear must be "left" or "right"`);
      seq.push([f, { n, smear: k.smear, ghost: prev }]);
      f += 1;
    }
    const len = k.frames ?? (k.sec !== undefined ? Math.max(1, Math.round(k.sec * FPS)) : null);
    if (!(len >= 1) && i < tr.keys.length - 1) fail(`${kctx}: needs frames or sec`);
    seq.push([f, { n }]);
    f += len || 0;
    prev = n;
  });
  const lastHolds = tr.hold !== false; // last pose holds to the end of the track range
  return (fr) => {
    if (fr < start) return null;
    if (!lastHolds && fr >= f) return null;
    let v = null;
    for (const [s, val] of seq) if (fr >= s) v = val;
    return v;
  };
}

const TRACKS = { lipsync: lipsyncTrack, blink: blinkTrack, wind: windTrack, keys: keysTrack };

// deterministic integer hash -> [-1, 1)
const hash = (i, seed) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
};

// ---------- cutout motion: pure data, replayed by anim.js ----------
const TARGETS = new Set(["stack", "shake"]);
const target = (v, ctx) => {
  const t = v ?? "stack";
  if (!TARGETS.has(t)) fail(`${ctx}: target must be "stack" or "shake"`);
  return t;
};

function addMotion(out, mo, shot, ctx) {
  if (!mo) return;
  (mo.tweens || []).forEach((tw, i) => {
    const c = `${ctx} tweens[${i}]`;
    const t = timeOf(tw.at ?? shot, `${c} at`);
    const dur = tw.until !== undefined ? timeOf(tw.until, `${c} until`) - t : tw.dur;
    if (!tw.from || !tw.to || !(dur > 0)) fail(`${c}: needs from{}, to{} and dur > 0 (or until after at)`);
    out.tweens.push({ t: r4(t), dur: r4(dur), from: tw.from, to: tw.to, ease: tw.ease || "power2.out", yoyo: !!tw.yoyo, repeat: tw.repeat || 0, target: target(tw.target, c) });
  });
  (mo.steps || []).forEach((st, i) => {
    const c = `${ctx} steps[${i}]`;
    if (!Array.isArray(st.values) || !st.values.length) fail(`${c}: needs values[]`);
    const a = frameAt(timeOf(st.from ?? shot, `${c} from`));
    const b = frameAt(timeOf(st.to ?? `${shot}.end`, `${c} to`));
    const every = st.every || 2;
    const tg = target(st.target, c);
    for (let f = a, k = 0; f < b; f += every, k++) out.steps.push([f, tg, st.values[k % st.values.length]]);
    if (st.end) out.steps.push([b, tg, st.end]);
  });
  (mo.smears || []).forEach((sm, i) => {
    const c = `${ctx} smears[${i}]`;
    if (!SMEAR_DIRS.has(sm.dir)) fail(`${c}: dir must be "left" or "right"`);
    out.smears.push([frameAt(timeOf(sm.at, `${c} at`)), sm.frames || 2, sm.dir, sm.blur ?? 6, sm.scaleX ?? 1.15]);
  });
  (mo.ghosts || []).forEach((g, i) => {
    const c = `${ctx} ghosts[${i}]`;
    const lags = g.lags || [2, 4, 6];
    const opacity = g.opacity || [0.35, 0.2, 0.1];
    if (lags.length !== opacity.length) fail(`${c}: lags and opacity must have the same length`);
    out.ghosts.push({ lags, opacity, f0: frameAt(timeOf(g.from ?? shot, `${c} from`)), f1: frameAt(timeOf(g.to ?? `${shot}.end`, `${c} to`)) });
  });
  (mo.streaks || []).forEach((s, i) => {
    const c = `${ctx} streaks[${i}]`;
    out.streaks.push({ f0: frameAt(timeOf(s.from ?? shot, `${c} from`)), f1: frameAt(timeOf(s.to ?? `${shot}.end`, `${c} to`)), opacity: s.opacity ?? 0.8, side: s.side === "right" ? "right" : "left" });
  });
  (mo.tremor || []).forEach((tr, i) => {
    const c = `${ctx} tremor[${i}]`;
    const a = frameAt(timeOf(tr.from ?? shot, `${c} from`));
    const b = frameAt(timeOf(tr.to ?? `${shot}.end`, `${c} to`));
    const every = tr.every || 2;
    const amp0 = tr.amp0 ?? tr.amp ?? 4;
    const amp1 = tr.amp1 ?? amp0;
    const seed = out.tremorSeed++;
    for (let f = a; f < b; f += every) {
      const k = b - a > 1 ? (f - a) / (b - a - 1) : 0;
      const amp = amp0 + (amp1 - amp0) * k;
      out.steps.push([f, "shake", { x: r4(hash(f, 2 * seed) * amp), y: r4(hash(f, 2 * seed + 1) * amp) }]);
    }
    out.steps.push([b, "shake", { x: 0, y: 0 }]);
  });
}

// ---------- resolve stacks ----------
const stacks = [];
const notes = [];
for (const [id, st] of Object.entries(M.stacks || {})) {
  const ctx = `stack ${id}`;
  if (!hasId(id)) fail(`${ctx}: no element id="${id}" in index.html`);
  const sc = scene(st.shot, ctx);
  const f0 = frameAt(sc.start);
  const f1 = frameAt(sc.end); // exclusive
  const { pose, used } = makeResolver(id);
  const out = { tweens: [], steps: [], smears: [], ghosts: [], streaks: [], tremorSeed: 0 };
  addMotion(out, st, st.shot, ctx);

  const rules = [];
  const addTrack = (tr, tctx) => {
    const make = TRACKS[tr.type];
    if (!make) fail(`${tctx}: unknown type (use ${Object.keys(TRACKS).join(", ")})`);
    const miss = [];
    const fn = make(tr, tctx, (n) => pose(n, miss), f0);
    if (miss.length && tr.fallback) {
      notes.push(`${tctx}: missing ${[...new Set(miss)].join(", ")} -> fallback motion`);
      (tr.fallback.tracks || []).forEach((ft, j) => addTrack(ft, `${tctx} fallback.tracks[${j}] (${ft.type})`));
      addMotion(out, tr.fallback, st.shot, `${tctx} fallback`);
      return;
    }
    if (miss.length) notes.push(`${tctx}: missing ${[...new Set(miss)].join(", ")} -> base`);
    addMotion(out, tr.motion, st.shot, `${tctx} motion`);
    const a = tr.from === undefined || tr.type === "keys" ? f0 : frameAt(timeOf(tr.from, `${tctx} from`));
    const b = tr.to === undefined ? f1 : frameAt(timeOf(tr.to, `${tctx} to`));
    rules.push((f) => (f >= a && f < b ? fn(f) : null));
  };
  (st.tracks || []).forEach((tr, i) => addTrack(tr, `${ctx} tracks[${i}] (${tr.type})`));

  // later tracks draw over earlier ones; frames no track claims show base
  const events = [];
  let last = "";
  for (let f = f0; f < f1; f++) {
    let v = { n: "base" };
    for (const rule of rules) {
      const r = rule(f);
      if (r) v = r;
    }
    const ghost = v.ghost && v.ghost !== v.n ? v.ghost : 0;
    const smear = v.smear || 0;
    const sig = `${v.n}|${smear}|${ghost}`;
    if (sig !== last) events.push([f, v.n, smear, ghost]);
    last = sig;
  }

  // per-pose framing correction (frame px inside the .char), for pose plates drawn off-register
  const offsets = {};
  for (const [name, o] of Object.entries(st.offsets || {})) {
    if (!used[name]) continue; // missing file: nothing to correct
    const bad = Object.entries(o).find(([k, v]) => !["x", "y", "scale"].includes(k) || !Number.isFinite(v));
    if (bad) fail(`${ctx} offsets.${name}: only numeric x, y, scale are allowed`);
    offsets[name] = o;
  }

  const breathe = st.breathe ? { amp: 0.008, period: 2.4, ...(st.breathe === true ? {} : st.breathe) } : null;
  out.steps.sort((p, q) => p[0] - q[0]);
  delete out.tremorSeed;
  stacks.push({ id, shot: st.shot, f0, f1, origin: st.origin || null, variants: used, offsets, events, breathe, ...out });
}

// impact frames: "invert" flips the whole stage to a high-contrast negative; "silhouette" shows
// the named stack's current pose as a black cut-out on a white shot
const impacts = (M.impacts || []).map((im, i) => {
  const mode = im.mode || "invert";
  if (mode !== "invert" && mode !== "silhouette") fail(`impacts[${i}]: mode must be "invert" or "silhouette"`);
  if (mode === "silhouette" && !stacks.some((s) => s.id === im.stack)) fail(`impacts[${i}]: silhouette needs "stack" naming a stack in the manifest`);
  return [frameAt(timeOf(im.at, `impacts[${i}] at`)), im.frames || 2, mode, mode === "silhouette" ? im.stack : 0];
});

for (const n of notes) warn(n);

const data = {
  fps: FPS,
  // anim.js compares these windows with window.TIMING and refuses stale data
  scenes: Object.fromEntries(Object.entries(TIMING.scenes).map(([k, s]) => [k, [s.start, s.end]])),
  stacks,
  impacts,
};
const body = `// GENERATED by assets/anim/build.mjs from manifest.json. Do not edit; re-run the build.\nwindow.StudioAnimData = ${JSON.stringify(data)};\nwindow.ZvmAnimData = window.StudioAnimData;\n`;
writeFileSync(OUT, body);
const nEv = stacks.reduce((a, s) => a + s.events.length, 0);
const nFb = notes.filter((n) => n.endsWith("fallback motion")).length;
console.log(`anim build: ${stacks.length} stack(s), ${nEv} pose events, ${impacts.length} impact(s), ${nFb} track(s) on fallback motion -> ${OUT}`);
