import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepStyle, MAX_BYTES, readmeRow, readmeSlugs } from "../lib/lemo/my-styles.mjs";

const made = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// A project with a drafted style in lemo-style/.
function project(style = {}) {
  const dir = tmp("lemo-proj-");
  const d = join(dir, "lemo-style");
  mkdirSync(join(d, "demo", "node_modules", "x"), { recursive: true });
  mkdirSync(join(d, "demo", "out"), { recursive: true });
  writeFileSync(join(d, "style.json"), JSON.stringify({ slug: "my-rain", en: "My Rain", cn: "我的雨", based_on: "watercolor", borrows: [], line: "Rain | mine", ...style }));
  writeFileSync(join(d, "STYLE.md"), "# My Rain\n");
  writeFileSync(join(d, "CHANGES.md"), "| section | base | now | why |\n");
  writeFileSync(join(d, "styleframe.jpg"), "jpg");
  writeFileSync(join(d, "notes.txt"), "not on the list");
  writeFileSync(join(d, "demo", "build.sh"), "echo build\n");
  writeFileSync(join(d, "demo", "node_modules", "x", "i.js"), "x");
  writeFileSync(join(d, "demo", "out", "f.png"), "x");
  symlinkSync("/etc/hosts", join(d, "demo", "link"));
  symlinkSync("/etc/hosts", join(d, "test.jpg"));
  return dir;
}
const leftovers = (my) => readdirSync(my).filter((f) => f.startsWith(".keep-"));
const code = (c) => (e) => e.code === c;

test("keep copies the allowed files only and adds one README row", () => {
  const my = tmp("lemo-my-");
  const r = keepStyle({ projectDir: project(), myDir: my, librarySlugs: ["watercolor"] });
  const out = join(my, "my-rain");
  assert.equal(r.dir, out);
  assert.deepEqual(readdirSync(out).sort(), ["CHANGES.md", "STYLE.md", "demo", "style.json", "styleframe.jpg"]);
  assert.deepEqual(readdirSync(join(out, "demo")), ["build.sh"], "no node_modules, out or symlink");
  const rows = readFileSync(join(my, "README.md"), "utf8").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Name"));
  assert.deepEqual(rows, [readmeRow({ en: "My Rain", cn: "我的雨", slug: "my-rain", based_on: "watercolor", line: "Rain | mine" })]);
  assert.deepEqual(leftovers(my), []);
});

test("a second style adds a second row and keeps the first", () => {
  const my = tmp("lemo-my-");
  keepStyle({ projectDir: project(), myDir: my });
  const before = readFileSync(join(my, "README.md"), "utf8");
  keepStyle({ projectDir: project({ slug: "my-snow", en: "My Snow" }), myDir: my });
  const after2 = readFileSync(join(my, "README.md"), "utf8");
  assert.ok(after2.startsWith(before));
  assert.deepEqual(readmeSlugs(after2), ["my-rain", "my-snow"]);
});

test("conflicts and bad slugs are refused and leave nothing", () => {
  const my = tmp("lemo-my-");
  assert.throws(() => keepStyle({ projectDir: project({ slug: "watercolor" }), myDir: my, librarySlugs: ["watercolor"] }), code("conflict"));
  keepStyle({ projectDir: project(), myDir: my });
  assert.throws(() => keepStyle({ projectDir: project(), myDir: my }), code("conflict"));
  assert.throws(() => keepStyle({ projectDir: project({ slug: "Bad Slug" }), myDir: my }), code("invalid"));
  assert.throws(() => keepStyle({ projectDir: project({ slug: "../up" }), myDir: my }), code("invalid"));
  assert.throws(() => keepStyle({ projectDir: tmp("lemo-proj-"), myDir: my }), code("missing"));
  assert.deepEqual(readdirSync(my).sort(), ["README.md", "my-rain"]);
});

test("a draft over the size limit is too_large and nothing is written", () => {
  const my = join(tmp("lemo-my-"), "styles");
  const dir = project();
  const big = join(dir, "lemo-style", "test.mp4");
  writeFileSync(big, "");
  truncateSync(big, MAX_BYTES + 1);
  assert.throws(() => keepStyle({ projectDir: dir, myDir: my }), code("too_large"));
  assert.equal(existsSync(my), false);
});
