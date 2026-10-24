// Registers the Tài sản tab (images of a series episode) in the assets group of the rail.
import { Images } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { AssetsTab, LEAD } from "./AssetsTab.tsx";

export function register(studio: Studio): void {
  studio.registerTab({ id: "series-assets", label: "Tài sản", icon: Images, group: "assets", order: 40, lead: LEAD, component: AssetsTab });
}
