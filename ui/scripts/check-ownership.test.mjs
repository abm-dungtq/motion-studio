// node --test ui/scripts/check-ownership.test.mjs — the glob matcher and the "no two areas own
// the same file" rule of ui/ownership.json. No git needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { globsOf, loadMap, matches, overlaps, strays } from "./check-ownership.mjs";

const SCRIPT = fileURLToPath(new URL("./check-ownership.mjs", import.meta.url));

test("** matches across folders, only under the named folder", () => {
  assert.equal(matches("ui/src/ext/fx/**", "ui/src/ext/fx/a/b.tsx"), true);
  assert.equal(matches("ui/src/ext/fx/**", "ui/src/ext/fxx/a.ts"), false);
  assert.equal(matches("ui/src/ext/fx/**", "ui/src/ext/fx.ts"), false);
});

test("* stays inside one path segment; dots are literal", () => {
  assert.equal(matches("ui/src/*.ts", "ui/src/a.ts"), true);
  assert.equal(matches("ui/src/*.ts", "ui/src/x/a.ts"), false);
  assert.equal(matches("ui/src/core/library.ts", "ui/src/core/libraryXts"), false);
});

test("the real map gives every file to at most one area", () => {
  assert.deepEqual(overlaps(loadMap()), []);
});

test("overlaps finds two areas that share a folder", () => {
  const map = { areas: { a: ["ui/src/ext/fx/**"], b: ["ui/src/ext/fx/sub/**"] }, every_area: [] };
  assert.equal(overlaps(map).length > 0, true);
});

test("every_area globs count for the area, with its name filled in", () => {
  const map = loadMap();
  assert.ok(globsOf(map, "fx").includes("plans/261023-1018-react-ui-rewrite/reports/parity-fx.md"));
  const files = ["ui/src/ext/fx/index.ts", "plans/261023-1018-react-ui-rewrite/reports/parity-fx.md", "plans/261023-1018-react-ui-rewrite/reports/parity-lemo.md", "ui/src/App.tsx"];
  assert.deepEqual(strays(map, "fx", files), ["plans/261023-1018-react-ui-rewrite/reports/parity-lemo.md", "ui/src/App.tsx"]);
});

test("an unknown area exits 2 with 'vùng lạ'", () => {
  let code = 0, out = "";
  try { execFileSync(process.execPath, [SCRIPT, "nope"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 2);
  assert.match(out, /vùng lạ: nope/);
});
