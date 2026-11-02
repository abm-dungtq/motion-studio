// ui/scripts/ui-layout-check.mjs [--url http://127.0.0.1:4318] [--project a-02]
// Opens a running test Studio at 1280×800 with the installed Chrome (playwright-core, channel
// "chrome", as shoot.mjs), visits every left tab of the rail and the Đạo diễn and Shot tabs of the
// right column, and looks for visible elements whose right edge passes their panel by more than
// 1 px. Elements inside a horizontal scroll area (timeline, scrolling tab rows) and .sr-only text
// are left out. Prints "OK" and exits 0 when nothing overflows; otherwise prints one line per
// element (tab, tag, class, first 40 characters of text) and exits 1. Not part of npm test: it
// needs a Studio running.
// MS_PLAYWRIGHT points at a playwright-core entry outside ui/ while ui/package.json lacks it.
import { parseArgs } from "node:util";

const READY_MS = 15000;
const SETTLE_MS = 800;

function usage(msg) {
  if (msg) console.error(msg);
  console.error("usage: ui-layout-check.mjs [--url http://127.0.0.1:<cổng>] [--project <tên dự án>]");
  process.exit(2);
}

let args;
try {
  ({ values: args } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:4318" }, project: { type: "string", default: "a-02" } } }));
} catch (e) { usage(e.message); }
if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(args.url)) usage("--url phải là http://127.0.0.1:<cổng>");
if (/:4317\/?$/.test(args.url)) usage("cổng 4317 là Studio thật, không kiểm ở đó");
const base = args.url.replace(/\/$/, "");

// Runs in the page: the overflowing elements of one panel.
function overflowIn(panelSelector) {
  const panel = document.querySelector(panelSelector);
  if (!panel) return [`không thấy ${panelSelector}`];
  const edge = panel.getBoundingClientRect().right;
  const scrollsX = (el) => {
    for (let a = el.parentElement; a && a !== panel; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  };
  const out = [];
  for (const el of panel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= edge + 1) continue;
    if (el.closest(".sr-only") || scrollsX(el)) continue;
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
    out.push(`<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> +${Math.round(r.right - edge)}px "${(el.textContent ?? "").trim().slice(0, 40)}"`);
  }
  return out;
}

const { chromium } = await import(process.env.MS_PLAYWRIGHT ?? "playwright-core");
const browser = await chromium.launch({ channel: "chrome" });
const problems = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).split("\n")[0]}`));
  await page.goto(`${base}/?name=${encodeURIComponent(args.project)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="rail"] [role="tab"]', { timeout: READY_MS });
  await page.waitForTimeout(SETTLE_MS);

  const rail = page.locator('[data-slot="rail"] [role="tab"]');
  const count = await rail.count();
  for (let i = 0; i < count; i++) {
    const tab = rail.nth(i);
    const label = (await tab.getAttribute("aria-label")) ?? `tab ${i + 1}`;
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await page.waitForTimeout(SETTLE_MS);
    for (const p of await page.evaluate(overflowIn, '[data-slot="left"]')) problems.push(`trái · ${label}: ${p}`);
  }

  // The right column is the resizable panel around the Đạo diễn and Shot tabs.
  const right = page.locator('[role="tablist"]').filter({ has: page.getByRole("tab", { name: "Shot", exact: true }) });
  await right.evaluate((el) => {
    const panel = el.closest("[data-panel]") ?? el.parentElement;
    panel.setAttribute("data-layout-check", "right");
  });
  for (const name of ["Đạo diễn", "Shot"]) {
    await right.getByRole("tab", { name, exact: false }).first().click();
    await page.waitForTimeout(SETTLE_MS);
    for (const p of await page.evaluate(overflowIn, '[data-layout-check="right"]')) problems.push(`phải · ${name}: ${p}`);
  }
  await context.close();
} finally {
  await browser.close();
}

if (problems.length) {
  for (const p of problems) console.log(p);
  process.exit(1);
}
console.log("OK");
