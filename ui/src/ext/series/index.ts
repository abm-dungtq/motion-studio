// Registers the Tài sản tab (images of a series episode) in the assets group of the rail, and in
// the Lời & giọng tab and the director column the cards a series asks the user: the waiting consent
// cards and the voices to pick.
import { Images } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { AssetsTab, LEAD } from "./AssetsTab.tsx";
import { OpenConsentCards } from "./ConsentCards.tsx";
import { VoicePick } from "./VoicePick.tsx";

export function register(studio: Studio): void {
  studio.registerTab({ id: "series-assets", label: "Tài sản", icon: Images, group: "assets", order: 40, lead: LEAD, component: AssetsTab });
  studio.registerSection("voice", { id: "series-consent", order: 10, component: OpenConsentCards });
  studio.registerSection("voice", { id: "series-voice-pick", order: 20, component: VoicePick });
  studio.registerSection("director", { id: "series-voice-pick", order: 20, component: VoicePick });
}
