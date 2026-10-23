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
