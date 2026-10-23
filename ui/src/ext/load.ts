// Finds and registers every built-in panel (ui/src/panels/*/index.ts) and every extension
// (ui/src/ext/*/index.ts) at build time: no shared registration file, so parallel work on two
// areas never edits the same file. Panels go first, then extensions; inside each group folders go
// by name. Each index.ts exports register(studio). One that is missing or throws is reported by
// folder name in one toast and skipped; the others still load (as public/ext.js:20-33).
import { say } from "@/api/client.ts";
import type { Studio } from "./registry.ts";

export interface ExtModule { register?: (studio: Studio) => unknown }
export type ModuleMap = Record<string, ExtModule>;

const folderOf = (path: string): string => path.split("/").slice(-2, -1)[0] ?? path;

export async function loadAll(
  studio: Studio,
  mods: { panels: ModuleMap; ext: ModuleMap } = {
    panels: import.meta.glob<ExtModule>("../panels/*/index.ts", { eager: true }),
    ext: import.meta.glob<ExtModule>("./*/index.ts", { eager: true }),
  },
): Promise<{ loaded: string[]; failed: string[] }> {
  const loaded: string[] = [], failed: string[] = [];
  for (const group of [mods.panels, mods.ext]) {
    for (const path of Object.keys(group).sort()) {
      const folder = folderOf(path);
      try {
        const mod = group[path];
        if (typeof mod?.register !== "function") throw new Error("không có export register(studio)");
        await mod.register(studio);
        loaded.push(folder);
      } catch (e) {
        console.error(`extension ${path}`, e);
        failed.push(`${folder}: ${(e as Error).message}`);
      }
    }
  }
  if (failed.length) say(`Extension lỗi, đã bỏ qua: ${failed.join("; ")}`, true);
  return { loaded, failed };
}
