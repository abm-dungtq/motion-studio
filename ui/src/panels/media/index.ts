// Port of public/panels.js; behaviour unchanged.
// The "Chất liệu" tab (panels.js:15 and the media() view, :131-192): registered footage, the file
// browser and the files under assets/. B-roll search adds its section from ext/broll.
import { LayoutGrid } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { MediaTab } from "./MediaTab.tsx";

export const MEDIA_LEAD = "Thêm video quay sẵn, B-roll, ảnh. File nằm ngoài workspace sẽ được chép vào footage/raw.";

export function register(studio: Studio): void {
  studio.registerTab({ id: "media", label: "Chất liệu", icon: LayoutGrid, group: "assets", order: 10, lead: MEDIA_LEAD, component: MediaTab });
}
