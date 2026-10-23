// ui/scripts/shoot.mjs --base <url> --views <file.json> --out <dir> [--widths 1440,2560]
// Screenshots of Studio views with the installed Chrome (playwright-core, channel "chrome"; no
// browser download). A view is { id, path, ready, steps? }: open base + path, wait for the ready
// selector (15 s at most), run the steps ({ click: selector } or { press: key }), wait 800 ms,
// save <out>/<width>/<id>.png. No "networkidle": the SSE feed /api/events never goes idle.
// Prints "shot <path>" per image and "ok <count>" at the end; any failed view prints
// "fail <id>: <error>" and the exit code is 1.
// MS_PLAYWRIGHT points at a playwright-core entry outside ui/ while ui/package.json lacks it.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const HEIGHT = { 1440: 900, 2560: 1440 };
const READY_MS = 15000;
const SETTLE_MS = 800;

function usage(msg) {
  if (msg) console.error(msg);
  console.error("usage: shoot.mjs --base <url> --views <file.json> --out <dir> [--widths 1440,2560]");
  process.exit(2);
}

let args;
try {
  ({ values: args } = parseArgs({ options: { base: { type: "string" }, views: { type: "string" }, out: { type: "string" }, widths: { type: "string", default: "1440,2560" } } }));
} catch (e) { usage(e.message); }
if (!args.base || !args.views || !args.out) usage();
if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(args.base)) usage("--base phải là http://127.0.0.1:<cổng>");
if (/:4317\/?$/.test(args.base)) usage("cổng 4317 là Studio thật, không chụp ở đó");
const base = args.base.replace(/\/$/, "");
const widths = args.widths.split(",").map((w) => Number(w.trim()));
if (!widths.length || widths.some((w) => !HEIGHT[w])) usage(`--widths chỉ nhận ${Object.keys(HEIGHT).join(", ")}`);

let views;
try {
  views = JSON.parse(readFileSync(args.views, "utf8"));
  if (!Array.isArray(views) || !views.length) throw new Error("cần một mảng view không rỗng");
  for (const v of views) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(v?.id)) || typeof v.path !== "string" || !v.path.startsWith("/") || typeof v.ready !== "string") throw new Error(`view không hợp lệ: ${JSON.stringify(v)}`);
    for (const s of v.steps ?? []) if (typeof s?.click !== "string" && typeof s?.press !== "string") throw new Error(`bước không hợp lệ trong ${v.id}: ${JSON.stringify(s)}`);
  }
} catch (e) { usage(`không đọc được ${args.views}: ${e.message}`); }

const { chromium } = await import(process.env.MS_PLAYWRIGHT ?? "playwright-core");
const browser = await chromium.launch({ channel: "chrome" });
let count = 0, failed = 0;
try {
  for (const width of widths) {
    const dir = join(args.out, String(width));
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] }, deviceScaleFactor: 1 });
    try {
      for (const v of views) {
        const page = await context.newPage();
        try {
          await page.goto(base + v.path, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(v.ready, { timeout: READY_MS });
          for (const s of v.steps ?? []) {
            if (s.click) await page.click(s.click, { timeout: READY_MS });
            else await page.keyboard.press(s.press);
          }
          await page.waitForTimeout(SETTLE_MS);
          const file = join(dir, `${v.id}.png`);
          await page.screenshot({ path: file });
          count++;
          console.log(`shot ${file}`);
        } catch (e) {
          failed++;
          console.log(`fail ${v.id}: ${String(e.message).split("\n")[0]}`);
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
console.log(`ok ${count}`);
