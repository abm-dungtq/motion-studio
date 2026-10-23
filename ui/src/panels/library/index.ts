// Port of the library tab of public/panels.js:18 and :230-315; behaviour unchanged.
import { Library } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { LibraryTab } from "./LibraryTab.tsx";

export const LIBRARY_LEAD = "Video, cảnh, phong cách và prompt mẫu làm bằng Claude Opus 5.5, có giải thích tiếng Việt, để AI làm theo.";

export function register(studio: Studio): void {
  studio.registerTab({ id: "library", label: "Thư viện mẫu", icon: Library, group: "library", order: 10, lead: LIBRARY_LEAD, component: LibraryTab });
}
