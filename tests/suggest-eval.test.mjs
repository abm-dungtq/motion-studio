import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateOf, hitAt, MIN_PICKS, pickStats, sampleBy } from "../scripts/suggest-eval.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts", "suggest-eval.mjs");

test("hitAt looks only at the first k directions", () => {
  assert.equal(hitAt(["A1", "A2", "A3"], ["A3"], 3), true);
  assert.equal(hitAt(["A1", "A2", "A3"], ["A3"], 1), false);
  assert.equal(hitAt(["A4"], ["A2", "A4"], 1), true);
  assert.equal(hitAt(null, ["A1"], 3), false);
});

test("sampleBy is deterministic for a seed and keeps at most perGroup rows per group", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ i, g: ["x", "y", "z"][i % 3] }));
  const a = sampleBy(rows, (r) => r.g, 5, 7);
  const b = sampleBy(rows, (r) => r.g, 5, 7);
  assert.deepEqual(a, b);
  assert.equal(a.length, 15);
  for (const g of ["x", "y", "z"]) assert.ok(a.filter((r) => r.g === g).length <= 5);
  assert.deepEqual([...new Set(a.map((r) => r.g))], ["x", "y", "z"], "groups come in name order");
  assert.notDeepEqual(sampleBy(rows, (r) => r.g, 5, 8), a, "another seed gives another sample");
});

test("gateOf needs a lead of 10 points of hit@3 and says when that cannot happen", () => {
  const unreachable = gateOf({ n: 14, detHits: 13, jevHits: 14 });
  assert.equal(unreachable.reachable, false);
  assert.equal(unreachable.pass, false);
  const pass = gateOf({ n: 14, detHits: 10, jevHits: 12 });
  assert.equal(pass.diff_points, 14.3);
  assert.equal(pass.pass, true);
  assert.equal(gateOf({ n: 14, detHits: 10, jevHits: 11 }).pass, false);
  assert.equal(gateOf({ n: 0, detHits: 0, jevHits: 0 }).pass, false);
});

test("importing the script does not run it", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(SCRIPT)});`], { encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
});

// n turns; the first detHits choose a direction in the deterministic top 3, the first jevHits one
// in Jev's top 3 (det top 3 = A1..A3, Jev top 3 = A4..A6, A7 is in neither).
function turns(n, detHits, jevHits) {
  return Array.from({ length: n }, (_, i) => {
    const d = i < detHits, j = i < jevHits;
    const direction = d && j ? "A1" : d ? "A2" : j ? "A4" : "A7";
    return {
      v: 1, at: `2026-10-23T10:00:${String(i).padStart(2, "0")}.000Z`, project: "p", hash: `h${i}`,
      det: { directions: ["A1", "A2", "A3"], styles: ["s1"], mode: "dao-dien" },
      jev: { directions: d && j ? ["A1", "A5", "A6"] : ["A4", "A5", "A6"], styles: ["s2"], mode: "nhanh" },
      chosen: { direction, style: i % 2 ? "s1" : null, mode: "dao-dien" },
      direction_from: d && j ? "both" : d ? "det" : j ? "jev" : "none",
      outcome: "chosen",
    };
  });
}

test("pickStats: 30 turns with Jev 20 points ahead decide jev", () => {
  const r = pickStats(turns(30, 20, 26));
  assert.equal(MIN_PICKS, 30);
  assert.equal(r.n, 30);
  assert.equal(r.det.hit3, 66.7);
  assert.equal(r.jev.hit3, 86.7);
  assert.equal(r.gate.diff_points, 20);
  assert.equal(r.decision, "jev");
  assert.equal(r.styles.n, 15);
  assert.equal(r.styles.det.hit1, 100);
  assert.equal(r.from.both + r.from.det + r.from.jev + r.from.none, 30);
});

test("pickStats: a lead under 10 points decides deterministic", () => {
  assert.equal(pickStats(turns(30, 24, 25)).decision, "deterministic");
});

test("pickStats: under 30 turns waits", () => {
  const r = pickStats(turns(29, 0, 29));
  assert.equal(r.n, 29);
  assert.equal(r.decision, "wait");
});

test("pickStats: one turn per project and brief, the latest click wins; lines without Jev are left out", () => {
  const [a] = turns(1, 0, 0);
  const later = { ...a, at: "2026-10-23T11:00:00.000Z", chosen: { direction: "A4" }, direction_from: "jev" };
  const noJev = { ...a, hash: "other", jev: null };
  const r = pickStats([later, a, noJev], { min: 1 });
  assert.equal(r.n, 1);
  assert.equal(r.jev.hit1, 100);
  assert.equal(r.det.hit3, 0);
  assert.deepEqual(r.from, { jev: 1, det: 0, both: 0, none: 0 });
});

test("--picks reads every project's pick log and waits under 30 turns", () => {
  const tmp = mkdtempSync(join(tmpdir(), "suggest-eval-"));
  try {
    const [t0, t1, t2] = turns(3, 2, 1);
    const write = (project, rows) => {
      const d = join(tmp, project, ".opus", "suggest");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "picks.jsonl"), rows.map((x) => JSON.stringify({ ...x, project })).join("\n") + "\n");
    };
    write("one", [t0, t1]);
    write("two", [t2]);
    mkdirSync(join(tmp, "empty"));
    const out = join(tmp, "picks.json");
    const r = spawnSync(process.execPath, [SCRIPT, "--picks", "--root", tmp, "--out", out], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^decision: wait \(3\/30 /m);
    assert.match(r.stdout, /^picks n=3\/30 /m);
    assert.equal(r.stdout.split("\n").filter((l) => l.startsWith("decision:")).length, 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("bad arguments exit 2", () => {
  for (const args of [["--bogus"], ["--picks", "--min", "0"], ["--sample"]]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2, args.join(" "));
  }
});
