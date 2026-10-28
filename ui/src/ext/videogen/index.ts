// AI images and clips per shot through gflow-cli and Google Flow (routes/videogen.mjs, docs/videogen.md).
import type { Studio } from "@/ext/registry.ts";
import { GflowRow } from "./GflowRow.tsx";
import { ShotVideogen } from "./ShotVideogen.tsx";

export function register(studio: Studio): void {
  studio.registerInspectorSection({ id: "videogen", kinds: ["shot"], order: 45, component: ShotVideogen });
  studio.registerAgentRows({ component: GflowRow });
}
