// Registers the Tài sản tab (images of a series episode) in the assets group of the rail, and in
// the Lời & giọng tab and the director column the cards a series asks the user: the waiting consent
// cards and the voices to pick. The scenes of the episode (rebuild one, approve a group) sit in the
// director column and the Tài sản tab; the "hear it again" card and the delivery panel in the export
// dialog; the "needs outside help" cards at the top of the director column.
import { Images } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { AssetsTab, LEAD } from "./AssetsTab.tsx";
import { AudioReview } from "./AudioReview.tsx";
import { OpenConsentCards } from "./ConsentCards.tsx";
import { DeliveryPanel } from "./DeliveryPanel.tsx";
import { HandoffCard } from "./HandoffCard.tsx";
import { ScenesCard } from "./ScenesCard.tsx";
import { VoicePick } from "./VoicePick.tsx";

export function register(studio: Studio): void {
  studio.registerTab({ id: "series-assets", label: "Tài sản", icon: Images, group: "assets", order: 40, lead: LEAD, component: AssetsTab });
  studio.registerSection("voice", { id: "series-consent", order: 10, component: OpenConsentCards });
  studio.registerSection("voice", { id: "series-voice-pick", order: 20, component: VoicePick });
  studio.registerSection("director", { id: "series-handoff", order: 3, component: HandoffCard });
  studio.registerSection("director", { id: "series-voice-pick", order: 20, component: VoicePick });
  studio.registerSection("director", { id: "series-scenes", order: 30, component: ScenesCard });
  studio.registerSection("series-assets", { id: "series-scenes", order: 10, component: ScenesCard });
  studio.registerSection("export", { id: "series-audio-review", order: 15, component: AudioReview });
  studio.registerSection("export", { id: "series-delivery", order: 35, component: DeliveryPanel });
}
