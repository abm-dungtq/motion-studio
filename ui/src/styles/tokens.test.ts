// @vitest-environment node
// Components take colours from the tokens in tokens.css only: no raw colour
// literals and no built-in Tailwind palette classes in ui/src.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
const PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|to|via|outline|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\d{2,3})?\b/;
const EXEMPT = /token-exempt: \S/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

test("components use colour tokens, not raw colours or palette classes", () => {
  const bad: string[] = [];
  for (const file of sources(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (EXEMPT.test(line)) return;
        if (RAW.test(line) || PALETTE.test(line)) bad.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
  }
  expect(bad, `raw colours found (use a token from styles/tokens.css):\n${bad.join("\n")}`).toEqual([]);
});

// Filled surfaces carry --ms-accent-text (white): WCAG 2.x contrast of at least 4.5:1.
const TOKENS = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
function token(name: string): string {
  const m = TOKENS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m || !/^#[0-9a-fA-F]{6}$/.test(m[1].trim())) throw new Error(`--${name} is not a 6-digit hex colour`);
  return m[1].trim();
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("contrast() matches known WCAG values", () => {
  expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
  expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
});

test.each(["ms-accent-fill", "ms-danger-fill"])("white text on --%s is at least 4.5:1", (fill) => {
  expect(contrast(token(fill), token("ms-accent-text"))).toBeGreaterThanOrEqual(4.5);
});
