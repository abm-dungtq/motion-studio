// The QA layer: the WARN and FAIL checks of QA.md with a time as bands on the shot lane (Lớp QA on
// the timeline bar turns them off), and the QA chip in the top bar.
import type { Studio } from "@/ext/registry.ts";
import { QaChip } from "./QaChip.tsx";
import { qaBands } from "./qa-data.ts";

export function register(studio: Studio): void {
  studio.registerTimelineDecorator(qaBands);
  studio.registerSection("topbar", { id: "qa", order: 10, component: QaChip });
}
