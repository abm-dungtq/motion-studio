// AI images and clips per shot through gflow-cli and Google Flow (routes/videogen.mjs, docs/videogen.md).
import type { Studio } from "@/ext/registry.ts";
import { lazyNamed } from "@/ext/lazy.ts";

const GflowRow = lazyNamed(() => import("./GflowRow.tsx"), "GflowRow");
const ShotVideogen = lazyNamed(() => import("./ShotVideogen.tsx"), "ShotVideogen");

export function register(studio: Studio): void {
  studio.registerInspectorSection({ id: "videogen", kinds: ["shot"], order: 45, component: ShotVideogen });
  studio.registerAgentRows({ component: GflowRow });
}
