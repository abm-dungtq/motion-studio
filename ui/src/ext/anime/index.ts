// Port of public/ext-anime.js; behaviour unchanged.
// Registers the Anime tab (motion comic) in the assets group of the rail.
import { Sparkles } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { AnimeTab, LEAD } from "./AnimeTab.tsx";

export function register(studio: Studio): void {
  studio.registerTab({ id: "anime", label: "Anime", icon: Sparkles, group: "assets", order: 30, lead: LEAD, component: AnimeTab });
}
