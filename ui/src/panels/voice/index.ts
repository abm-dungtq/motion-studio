// Port of public/panels.js; behaviour unchanged.
// Registers the "Lời & giọng" tab (panels.js:16) with the stale-line badge (panels.js:521).
import { Mic } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { useStaleCount, VoiceTab } from "./VoiceTab.tsx";

export const VOICE_LEAD = "Sửa lời từng câu. Câu đã sửa cần qua cổng viet-pro và lồng tiếng lại.";

export function register(studio: Studio): void {
  studio.registerTab({ id: "voice", label: "Lời & giọng", icon: Mic, group: "audio", order: 10, lead: VOICE_LEAD, component: VoiceTab, badge: useStaleCount });
}
