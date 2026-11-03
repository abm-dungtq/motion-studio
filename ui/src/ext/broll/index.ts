// Port of public/ext-broll.js; behaviour unchanged.
// The B-roll index in the UI: footage search and "Phân tích footage" at the end of the media tab,
// and "Gợi ý B-roll" in the inspector of a shot.
import type { Studio } from "@/ext/registry.ts";
import { lazyNamed } from "@/ext/lazy.ts";

const Search = lazyNamed(() => import("./Search.tsx"), "Search");
const Suggest = lazyNamed(() => import("./Suggest.tsx"), "Suggest");

export function register(studio: Studio): void {
  studio.registerSection("media", { id: "broll-search", order: 40, component: Search });
  studio.registerInspectorSection({ id: "broll-suggest", kinds: ["shot"], order: 30, component: Suggest });
}
