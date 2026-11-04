// lib/gate-guard.mjs — the approval gates a director job may not touch, kept by Studio whatever agent
// runs the director. BRIEF.md is the user's (direction: and the rest of the brief): any change is
// put back. DEMO.md is rewritten by the provider's demo script, so only its user lines are kept:
// approval: may go back to "pending" (a new animatic) but not to anything else, and audio_review:
// may be dropped but not written. Studio watches the project folder while the job runs (fs.watch,
// plus a check every second because macOS can drop watch events) and checks once more when it
// ends; a change is undone and reported to onViolation.
// Studio's own writes to these files call rebase(dir) after a direct write, or go through
// studioWrite(dir, fn) when a provider command writes them, so they are not taken for the
// director's. While such a command runs the guard of that project does not check.
import { readFileSync, realpathSync, renameSync, rmSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BRIEF = "BRIEF.md";
export const DEMO = "DEMO.md";
// DEMO.md lines that only the user's answer writes; null: the line may be dropped, a string: the
// one value the director may set.
const USER_LINES = { approval: "pending", audio_review: null };
const lineRe = (k) => new RegExp(`^[ \\t]*[-*]?[ \\t]*${k}:[^\\n]*$`, "m");
const valueOf = (line, k) => (line ? line.replace(new RegExp(`^[ \\t]*[-*]?[ \\t]*${k}:`), "").trim() : null);
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return null; } };
const put = (f, text) => { const tmp = `${f}.guard.tmp`; writeFileSync(tmp, text); renameSync(tmp, f); };

const POLL_MS = 1000;
const live = new Map(); // realpath of the project → guard
const keyOf = (dir) => { try { return realpathSync(dir); } catch { return dir; } };

// The DEMO.md user lines of text: { approval: "<line>" | null, … }.
export function demoLines(text) {
  return Object.fromEntries(Object.keys(USER_LINES).map((k) => [k, text == null ? null : (lineRe(k).exec(text)?.[0] ?? null)]));
}

// DEMO.md text with the user lines of base put back where the director changed them, and the names
// of the lines it changed. Allowed: no change, approval back to pending, audio_review dropped.
export function fixDemo(text, base) {
  const now = demoLines(text);
  const bad = [];
  let out = text;
  for (const [k, ok] of Object.entries(USER_LINES)) {
    const was = base[k];
    const is = now[k];
    if (is === was) continue;
    const v = valueOf(is, k);
    if (is === null && ok === null) continue;
    if (is !== null && ok !== null && v === ok) continue;
    bad.push(`${k}:`);
    if (is !== null && was !== null) out = out.replace(lineRe(k), () => was);
    else if (is !== null) out = out.replace(lineRe(k), () => (ok === null ? "" : `${k}: ${ok}`)).replace(/\n{3,}/g, "\n\n");
    else out = `${out.replace(/\s*$/, "")}\n${was}\n`;
  }
  return { text: out, bad };
}

// Starts guarding dir. Returns { check, close, violations }: check() undoes what changed since the
// baseline and returns the names it undid; close() checks a last time, stops watching and returns
// every violation of the run.
export function guardGates(dir, { onViolation = () => {} } = {}) {
  const fb = join(dir, BRIEF);
  const fd = join(dir, DEMO);
  const g = { brief: read(fb), demo: demoLines(read(fd)), violations: [], watcher: null, timer: null, poll: null, paused: 0 };
  g.rebase = () => { g.brief = read(fb); g.demo = demoLines(read(fd)); };
  g.check = () => {
    const undone = [];
    if (g.paused) return undone;
    const brief = read(fb);
    if (brief !== g.brief) {
      if (g.brief === null) rmSync(fb, { force: true }); else put(fb, g.brief);
      undone.push(BRIEF);
    }
    const demo = read(fd);
    if (demo !== null) {
      const { text, bad } = fixDemo(demo, g.demo);
      if (bad.length) { put(fd, text); undone.push(...bad.map((b) => `${DEMO} ${b}`)); }
    } else if (Object.values(g.demo).some(Boolean)) {
      undone.push(DEMO);
    }
    if (undone.length) { g.violations.push(...undone); onViolation(undone); }
    return undone;
  };
  try {
    g.watcher = watch(dir, { persistent: false }, (_e, f) => {
      if (f && f !== BRIEF && f !== DEMO) return;
      clearTimeout(g.timer);
      g.timer = setTimeout(() => { try { g.check(); } catch { /* the file moved meanwhile: the next event or close() checks */ } }, 30);
    });
    g.watcher.on("error", () => {});
  } catch { g.watcher = null; /* no watcher: the poll and close() still check */ }
  g.poll = setInterval(() => { try { g.check(); } catch { /* checked again next second */ } }, POLL_MS);
  g.poll.unref?.();
  const key = keyOf(dir);
  live.set(key, g);
  g.close = () => {
    clearTimeout(g.timer);
    clearInterval(g.poll);
    try { g.watcher?.close(); } catch { /* closed */ }
    try { g.check(); } catch { /* reported below by what is left */ }
    if (live.get(key) === g) live.delete(key);
    return [...new Set(g.violations)];
  };
  return g;
}

// Studio wrote BRIEF.md or DEMO.md itself: the running guard of dir takes it as the new baseline.
export function rebase(dir) { live.get(keyOf(dir))?.rebase(); }
export const guarding = (dir) => live.has(keyOf(dir));

// Runs fn (a provider command that writes BRIEF.md or DEMO.md for Studio) with the guard of dir
// paused, then takes the result as the new baseline.
export async function studioWrite(dir, fn) {
  const g = live.get(keyOf(dir));
  if (g) g.paused++;
  try { return await fn(); } finally {
    if (g) g.paused--;
    rebase(dir);
  }
}
