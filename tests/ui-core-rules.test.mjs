// ui/src/core holds the UI logic that Node runs directly (type stripping) for these tests and for
// lib/timing-edit.mjs: no "@/" alias, no React, relative imports spelled with their .ts suffix,
// and every file must import under Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE = fileURLToPath(new URL("../ui/src/core/", import.meta.url));
const files = readdirSync(CORE).filter((f) => f.endsWith(".ts") && !f.includes(".test."));
const SPEC = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

test("ui/src/core has files to check", () => {
  assert.ok(files.length > 0);
});

test("ui/src/core imports neither the @/ alias nor React, and relative imports end in .ts", () => {
  const bad = [];
  for (const f of files) {
    readFileSync(join(CORE, f), "utf8").split("\n").forEach((line, i) => {
      for (const [, spec] of line.matchAll(SPEC)) {
        const why = spec.startsWith("@/") ? "@/ alias" : /^react(-dom)?(\/|$)/.test(spec) ? "React" : spec.startsWith(".") && !spec.endsWith(".ts") ? "relative import without .ts" : null;
        if (why) bad.push(`${f}:${i + 1}: ${why}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("every ui/src/core file imports under Node", async () => {
  const bad = [];
  for (const f of files) {
    try { await import(pathToFileURL(join(CORE, f)).href); } catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  assert.deepEqual(bad, []);
});
