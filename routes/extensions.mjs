// routes/extensions.mjs — GET /api/extensions: the UI extensions of public/, for public/ext.js.
// An extension is public/ext-<name>.js (it exports register(studio)) and/or public/ext-<name>.css;
// only names that server.mjs serves as static files are listed. Works without a provider.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PUBLIC_FILE } from "../lib/routes.mjs";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const EXT = /^ext-[a-z-]+\.(js|css)$/;

// { scripts: ["/ext-a.js", …], styles: ["/ext-a.css", …] }, sorted by name.
export function listExtensions(dir = PUBLIC) {
  let files;
  try { files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { files = []; }
  const ok = files.filter((f) => EXT.test(f) && PUBLIC_FILE.test(`/${f}`)).sort();
  return { scripts: ok.filter((f) => f.endsWith(".js")).map((f) => `/${f}`), styles: ok.filter((f) => f.endsWith(".css")).map((f) => `/${f}`) };
}

export const ROUTES = [
  { method: "GET", path: "/api/extensions", provider: false, handler: () => listExtensions() },
];
