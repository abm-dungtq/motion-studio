#!/usr/bin/env node
// Stands in for the provider's lemo command in tests. Every call appends its argv as one JSON
// line to $FAKE_LEMO_LOG. `list --json` prints two verified styles and one draft.
// `add` exits with the next code of $FAKE_LEMO_ADD (comma list, one per add call, default 0),
// waits $FAKE_LEMO_SLEEP ms first, and on 0 writes assets/lemo/CREDITS and a next: line.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const log = process.env.FAKE_LEMO_LOG;
if (log) appendFileSync(log, JSON.stringify(argv) + "\n");
const [cmd] = argv;
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);

if (cmd === "list") {
  console.log(JSON.stringify([
    { slug: "watercolor", ten_vi: "Thuỷ màu tự vẽ", kind: "2d", status: "verified" },
    { slug: "glass-product", ten_vi: "Sản phẩm thuỷ tinh 3D", kind: "3d", status: "verified" },
    { slug: "ukiyoe", kind: "2d", status: "draft" },
  ]));
  process.exit(0);
}
if (cmd === "fetch" || cmd === "remove") { console.log(`lemo: ${cmd} ok`); process.exit(0); }
if (cmd === "add") {
  const adds = log && existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter((l) => JSON.parse(l)[0] === "add").length : 1;
  const plan = String(process.env.FAKE_LEMO_ADD ?? "0").split(",");
  const code = Number(plan[Math.min(adds, plan.length) - 1] ?? 0);
  const done = () => {
    if (code === 3) { console.error("lemo: index.html has no LEMO-LAYER markers"); process.exit(3); }
    if (code === 4) { console.error("lemo: cache missing; run node lemo.mjs fetch"); process.exit(4); }
    if (code === 5) { console.error("lemo: index.html already has a lemo layer"); process.exit(5); }
    if (code !== 0) process.exit(code);
    const dir = opt("--project"), style = opt("--style");
    mkdirSync(join(dir, "assets", "lemo"), { recursive: true });
    writeFileSync(join(dir, "assets", "lemo", "CREDITS"), `lemo-opuscar ${style}\n`);
    console.log(`lemo: ${style} (2d) added to ${dir}`);
    console.log(`next: read styles/${style}/STYLE.md (in /cache/lemo/abc), write assets/lemo/scene.js for the brief, then npx hyperframes lint`);
    process.exit(0);
  };
  setTimeout(done, Number(process.env.FAKE_LEMO_SLEEP ?? 0));
} else if (cmd !== "list") { console.error(`unknown ${cmd}`); process.exit(2); }
