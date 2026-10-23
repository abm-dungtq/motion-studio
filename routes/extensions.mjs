// routes/extensions.mjs — GET /api/extensions. The UI extensions now live in ui/src/ext/<name>/ and
// are built into ui/dist with the rest of the page, so on a normal install this route always answers
// { scripts: [], styles: [] } (the old static folder is gone). It stays so the API does not change.
// Works without a provider.
import { readdirSync } from "node:fs";
import { PUBLIC_FILE } from "../lib/routes.mjs";

const EXT = /^ext-[a-z-]+\.(js|css)$/;

// { scripts: ["/ext-a.js", …], styles: ["/ext-a.css", …] } of the folder dir, sorted by name;
// empty without a folder, which is what the route asks for.
export function listExtensions(dir) {
  if (!dir) return { scripts: [], styles: [] };
  let files;
  try { files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { files = []; }
  const ok = files.filter((f) => EXT.test(f) && PUBLIC_FILE.test(`/${f}`)).sort();
  return { scripts: ok.filter((f) => f.endsWith(".js")).map((f) => `/${f}`), styles: ok.filter((f) => f.endsWith(".css")).map((f) => `/${f}`) };
}

export const ROUTES = [
  { method: "GET", path: "/api/extensions", provider: false, handler: () => listExtensions() },
];
