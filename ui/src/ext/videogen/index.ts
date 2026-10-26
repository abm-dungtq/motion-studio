// AI clips per shot through the G-Labs Studio webhook (routes/videogen.mjs, docs/videogen.md).
import type { Studio } from "@/ext/registry.ts";
import { GlabsRow } from "./GlabsRow.tsx";
import { ShotVideogen } from "./ShotVideogen.tsx";

export function register(studio: Studio): void {
  studio.registerInspectorSection({ id: "videogen", kinds: ["shot"], order: 45, component: ShotVideogen });
  studio.registerAgentRows({ component: GlabsRow });
}
