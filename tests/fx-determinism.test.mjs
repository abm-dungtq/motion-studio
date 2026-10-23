// Studio transition packs must render the same frame for the same time on every run: their
// state comes from frame(t, options) only, never from a clock or an unseeded random source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { FX_DIR, studioPacks } from "../lib/fx/catalog.mjs";

const FORBIDDEN = [/Math\.random/, /\bDate\b/, /performance\.now/, /requestAnimationFrame/, /setTimeout/, /setInterval/, /crypto\./];
const packs = studioPacks();

// The way a page bundler or a CommonJS caller loads the file: module.exports, real globals.
function asModule(code) {
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports;
}

// A sandbox whose clock and random sources throw, so any hidden use fails loudly.
function sandboxed(code) {
  const boom = (name) => () => { throw new Error(`${name} được gọi trong snippet`); };
  const math = Object.create(Math);
  math.random = boom("Math.random");
  const ctx = { Math: math, Date: boom("Date"), performance: { now: boom("performance.now") }, requestAnimationFrame: boom("requestAnimationFrame"), setTimeout: boom("setTimeout"), setInterval: boom("setInterval") };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { timeout: 2000 });
  return ctx.MotionFx;
}

const times = (d) => Array.from({ length: 30 }, (_, i) => (i / 29) * d * 1.2 - d * 0.1);
const plain = (x) => JSON.parse(JSON.stringify(x));

for (const p of packs) {
  const file = join(FX_DIR, p.id, "snippet.js");
  const code = readFileSync(file, "utf8");

  test(`${p.id}: the snippet uses no clock or random source`, () => {
    for (const re of FORBIDDEN) assert.doesNotMatch(code, re, `${p.id} dùng ${re}`);
  });

  test(`${p.id}: frame(t) is the same at 30 times across two runs and two loads`, () => {
    const a = sandboxed(code)[p.id], b = sandboxed(code)[p.id];
    const m = asModule(code);
    assert.equal(typeof a.frame, "function");
    for (const opts of [{}, { seed: 7 }, { duration: p.duration * 1.5 }]) {
      const first = times(p.duration).map((t) => plain(a.frame(t, opts)));
      assert.deepEqual(times(p.duration).map((t) => plain(a.frame(t, opts))), first, "same load, second run");
      assert.deepEqual(times(p.duration).map((t) => plain(b.frame(t, opts))), first, "fresh sandbox");
      assert.deepEqual(times(p.duration).map((t) => plain(m.frame(t, opts))), first, "loaded as a module");
      assert.ok(first.some((f, i) => i && JSON.stringify(f) !== JSON.stringify(first[0])), `${p.id} frame changes over time`);
    }
  });
}

test("seeded packs change with the seed and the seed alone", () => {
  const ink = asModule(readFileSync(join(FX_DIR, "ink-wipe", "snippet.js"), "utf8"));
  const t = 0.3;
  assert.notDeepEqual(plain(ink.frame(t, { seed: 1 })), plain(ink.frame(t, { seed: 2 })));
  assert.deepEqual(plain(ink.frame(t, { seed: 3 })), plain(ink.frame(t, { seed: 3 })));
});
