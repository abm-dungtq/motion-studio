// ui/scripts/perf-playhead.mjs --base <url> --name <project> [--runs 3] [--min 50]
// Frame rate while the playhead knob is dragged across the whole ruler, in the installed Chrome
// (playwright-core, channel "chrome"; no browser download), viewport 1440×900 at scale 1. Each run
// opens <base>/?name=<project>, waits for the knob, counts requestAnimationFrame callbacks in the
// page and drags the knob from the ruler's left end to its right end in 180 moves over about 3 s.
// fps = frames / drag time; the median of the runs decides.
// Prints "fps=<median, 1 decimal> runs=<a,b,c>", then "ok" (median ≥ min, exit 0) or "fail" (exit 1).
// No "networkidle": the SSE feed /api/events never goes idle.
// MS_PLAYWRIGHT points at a playwright-core entry outside ui/ while ui/package.json lacks it.
import { parseArgs } from "node:util";

const USAGE = "usage: perf-playhead.mjs --base <url> --name <project> [--runs 3] [--min 50]";
const READY_MS = 20000;
const STEPS = 180;
const STEP_MS = 16;

function usage(msg, code = 2) {
  if (msg) console.error(msg);
  (code === 0 ? console.log : console.error)(USAGE);
  process.exit(code);
}

let args;
try {
  ({ values: args } = parseArgs({ options: {
    base: { type: "string" }, name: { type: "string" }, runs: { type: "string", default: "3" }, min: { type: "string", default: "50" }, help: { type: "boolean", short: "h" },
  } }));
} catch (e) { usage(e.message); }
if (args.help) usage(null, 0);
if (!args.base || !args.name) usage();
if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(args.base)) usage("--base phải là http://127.0.0.1:<cổng>");
if (/:4317\/?$/.test(args.base)) usage("cổng 4317 là Studio thật, không đo ở đó");
const runs = Number(args.runs), min = Number(args.min);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) usage("--runs phải là số nguyên 1–20");
if (!Number.isFinite(min) || min <= 0) usage("--min phải là số dương");
const url = `${args.base.replace(/\/$/, "")}/?name=${encodeURIComponent(args.name)}`;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

async function once(context) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const knob = await page.waitForSelector("[data-testid=playhead-knob]", { timeout: READY_MS });
    const ruler = await page.waitForSelector("[data-testid=timeline-ruler]", { timeout: READY_MS });
    await page.waitForTimeout(1500); // let the player, thumbnails and waveforms settle
    const kb = await knob.boundingBox();
    const rb = await ruler.boundingBox();
    if (!kb || !rb) throw new Error("không thấy núm playhead hay thước");
    // The ruler may be wider than the window: drag across the part on screen.
    const view = page.viewportSize();
    const x0 = Math.max(rb.x + 1, 0), x1 = Math.min(rb.x + rb.width - 1, (view?.width ?? 1440) - 2);
    const y = kb.y + kb.height / 2;
    await page.evaluate(() => {
      const w = window;
      w.__frames = 0;
      w.__counting = true;
      const tick = () => { if (!w.__counting) return; w.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(kb.x + kb.width / 2, y);
    await page.mouse.down();
    const t0 = await page.evaluate(() => { window.__frames = 0; return performance.now(); });
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / STEPS, y);
      await page.waitForTimeout(STEP_MS);
    }
    const { frames, t1 } = await page.evaluate(() => ({ frames: window.__frames, t1: performance.now() }));
    await page.mouse.up();
    await page.evaluate(() => { window.__counting = false; });
    return frames / ((t1 - t0) / 1000);
  } finally {
    await page.close();
  }
}

const { chromium } = await import(process.env.MS_PLAYWRIGHT ?? "playwright-core");
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    for (let i = 0; i < runs; i++) results.push(await once(context));
  } finally {
    await context.close();
  }
} catch (e) {
  console.error(`lỗi đo: ${String(e.message).split("\n")[0]}`);
  await browser.close();
  process.exit(1);
}
await browser.close();
const fps = median(results);
console.log(`fps=${fps.toFixed(1)} runs=${results.map((x) => x.toFixed(1)).join(",")}`);
console.log(fps >= min ? "ok" : "fail");
process.exit(fps >= min ? 0 : 1);
