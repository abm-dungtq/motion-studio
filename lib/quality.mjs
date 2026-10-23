// lib/quality.mjs — output checks run on every receipt (lib/receipts.mjs). Every lib/quality/*.mjs
// (sorted by name) exports
//
//   export const CHECKS = [{ id, applies(file, kind) → boolean, run(file, kind) → { pass, detail } }];
//
// kind is "image" | "video" | "audio" | "other", from the file extension. run may be async; a
// check that throws counts as a fail with the error as detail. Ids must be unique.
import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT } from "../media.mjs";

export const DEFAULT_DIR = fileURLToPath(new URL("./quality/", import.meta.url));
const loaded = new Map(); // dir → Promise<check[]>

export const kindOf = (file) => {
  const e = extname(String(file)).toLowerCase();
  return IMAGE_EXT.includes(e) ? "image" : VIDEO_EXT.includes(e) ? "video" : AUDIO_EXT.includes(e) ? "audio" : "other";
};

export function loadChecks(dir = DEFAULT_DIR) {
  if (!loaded.has(dir)) {
    loaded.set(dir, (async () => {
      if (!existsSync(dir)) return [];
      const out = [], ids = new Set();
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs")).sort()) {
        const mod = await import(pathToFileURL(join(dir, f)).href);
        for (const c of mod.CHECKS ?? []) {
          if (typeof c?.id !== "string" || typeof c.applies !== "function" || typeof c.run !== "function") throw new Error(`lib/quality/${f}: mỗi kiểm cần id, applies() và run()`);
          if (ids.has(c.id)) throw new Error(`lib/quality/${f}: kiểm ${c.id} trùng id`);
          ids.add(c.id);
          out.push({ ...c, file: f });
        }
      }
      return out;
    })());
    loaded.get(dir).catch(() => loaded.delete(dir)); // a broken module is retried on the next call
  }
  return loaded.get(dir);
}

// [{ id, file, pass, detail }] for every (output, check that applies). outputs: absolute paths.
export async function runChecks(outputs, { dir = DEFAULT_DIR } = {}) {
  const checks = await loadChecks(dir);
  const results = [];
  for (const file of outputs) {
    const kind = kindOf(file);
    for (const c of checks) {
      let applies = false;
      try { applies = Boolean(c.applies(file, kind)); } catch { applies = false; }
      if (!applies) continue;
      try {
        const r = await c.run(file, kind);
        results.push({ id: c.id, file, pass: r?.pass === true, detail: r?.detail == null ? null : String(r.detail).slice(0, 500) });
      } catch (e) { results.push({ id: c.id, file, pass: false, detail: `lỗi khi kiểm: ${e.message}` }); }
    }
  }
  return results;
}
