// Port of public/panels.js; behaviour unchanged.
// Registers the "Nhạc & âm thanh" tab (panels.js:17).
import { Music } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { MusicTab } from "./MusicTab.tsx";

export const MUSIC_LEAD = "Nhạc nền và hiệu ứng âm thanh gắn theo shot.";

export function register(studio: Studio): void {
  studio.registerTab({ id: "music", label: "Nhạc & âm thanh", icon: Music, group: "audio", order: 20, lead: MUSIC_LEAD, component: MusicTab });
}
