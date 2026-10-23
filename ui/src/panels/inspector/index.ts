// The Shot tab of the right column (slot right.shot): one inspector view per kind of picked block
// (public/inspector.js). order 0 puts them before the sections of extensions (default 100).
import type { Studio } from "@/ext/registry.ts";
import { BeatView } from "./BeatView.tsx";
import { EventView } from "./EventView.tsx";
import { LineView } from "./LineView.tsx";
import { MusicView } from "./MusicView.tsx";
import { ShotView } from "./ShotView.tsx";
import { WordView } from "./WordView.tsx";

export function register(studio: Studio): void {
  studio.registerInspectorSection({ id: "shot", kinds: ["shot"], order: 0, component: ShotView });
  studio.registerInspectorSection({ id: "line", kinds: ["line"], order: 0, component: LineView });
  studio.registerInspectorSection({ id: "music", kinds: ["music"], order: 0, component: MusicView });
  studio.registerInspectorSection({ id: "event", kinds: ["event"], order: 0, component: EventView });
  studio.registerInspectorSection({ id: "beat", kinds: ["beat"], order: 0, component: BeatView });
  studio.registerInspectorSection({ id: "word", kinds: ["word"], order: 0, component: WordView });
}
