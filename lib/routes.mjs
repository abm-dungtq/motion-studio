// lib/routes.mjs — extension routes: every routes/*.mjs (sorted by file name, like the adapters
// of lib/provider.mjs) exports
//
//   export const ROUTES = [{ method: "GET" | "POST", path: "/api/…", prefix?: false,
//                            provider?: true, handler: async (c) => … }];
//
// path starts with /api/. prefix: true matches path and everything under it. provider: false
// lets the route answer when no provider is installed (no 503). server.mjs tries these routes
// only after its own, right before its 404, so a built-in route is never shadowed; a path that
// repeats a built-in one, or another extension's, makes createServer throw.
// The handler gets c = { req, res, url, q(k), body, send(status, body, headers?), projectDir(name),
// withManifest(name), root, token, P, why, startJob, runtimeFor }; body is the parsed JSON of a
// POST ({} for GET). It either answers with c.send or returns a value, which is sent as 200 JSON.
// A thrown error with .status answers that status with { error: message }.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const DEFAULT_DIR = fileURLToPath(new URL("../routes/", import.meta.url));
const METHODS = new Set(["GET", "POST"]);
const PATH = /^\/api\/[a-z0-9/_-]+$/;

// Loads and checks every route module of dir; an empty or missing folder gives [].
export async function loadRoutes(dir = DEFAULT_DIR) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    if (!Array.isArray(mod.ROUTES)) throw new Error(`routes/${f}: thiếu export const ROUTES = [...]`);
    for (const r of mod.ROUTES) {
      const where = `routes/${f} ${r?.method} ${r?.path}`;
      if (!METHODS.has(r?.method)) throw new Error(`${where}: method phải là GET hoặc POST`);
      if (typeof r.path !== "string" || !PATH.test(r.path)) throw new Error(`${where}: path phải bắt đầu bằng /api/ (chữ thường, số, -, _, /)`);
      if (typeof r.handler !== "function") throw new Error(`${where}: thiếu handler`);
      out.push({ method: r.method, path: r.path, prefix: r.prefix === true, provider: r.provider !== false, handler: r.handler, file: f });
    }
  }
  return out;
}

const covers = (r, p) => p === r.path || (r.prefix && p.startsWith(r.path.endsWith("/") ? r.path : `${r.path}/`));

// Throws when an extension route repeats a built-in path (any method), or another extension
// route with the same method, or when a prefix route would take in a built-in path.
export function checkRoutes(routes, builtin) {
  const seen = new Map();
  for (const r of routes) {
    const hit = builtin.find((b) => b === r.path || covers(r, b));
    if (hit) throw new Error(`routes/${r.file}: ${r.method} ${r.path} trùng route có sẵn ${hit}`);
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) throw new Error(`routes/${r.file}: ${k} trùng routes/${seen.get(k)}`);
    seen.set(k, r.file);
  }
  for (const a of routes) for (const b of routes) {
    if (a !== b && a.method === b.method && a.prefix && b.path !== a.path && covers(a, b.path)) throw new Error(`routes/${a.file}: ${a.method} ${a.path} (prefix) che ${b.path} của routes/${b.file}`);
  }
  return routes;
}

// The extension route for a method and path, or null.
export const findRoute = (routes, method, p) => routes.find((r) => r.method === method && covers(r, p)) ?? null;
