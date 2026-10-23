// Port of the Xuất bản view of public/panels.js:316-360; behaviour unchanged. The export buttons
// live in the top bar's Xuất bản menu; the dialog keeps the gates, the jobs and the files.
import type { Studio } from "@/ext/registry.ts";
import { Exported } from "./Exported.tsx";
import { GateFails } from "./GateFails.tsx";
import { Jobs } from "./Jobs.tsx";

export function register(studio: Studio): void {
  studio.registerSection("export", { id: "gates", order: 10, component: GateFails });
  studio.registerSection("export", { id: "jobs", order: 20, component: Jobs });
  studio.registerSection("export", { id: "files", order: 30, component: Exported });
}
