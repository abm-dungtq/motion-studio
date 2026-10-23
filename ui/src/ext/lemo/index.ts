// Port of public/ext-lemo.js; behaviour unchanged.
// Code-made film styles (lemo-opuscar, github.com/lemomo-ai/lemo-opuscar; code and docs MIT,
// frames and films CC BY 4.0 by LemoLab): the "Phong cách" tab with the gallery and the own
// styles, and a "Phong cách code" section in the shot inspector. Server side: routes/lemo.mjs.
// See docs/lemo-styles.md. The downloaded library is data: nothing of it is ever run.
import { Palette } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { Gallery } from "./Gallery.tsx";
import { MyStyle } from "./MyStyle.tsx";
import { ShotStyle } from "./ShotStyle.tsx";

export const LEAD = "59 phong cách phim dựng bằng code của lemo-opuscar và phong cách riêng của bạn. Áp cho dự án hoặc một shot.";

export function register(studio: Studio): void {
  studio.registerTab({ id: "styles-code", label: "Phong cách", icon: Palette, group: "assets", order: 20, lead: LEAD, component: Gallery });
  studio.registerSection("styles-code", { id: "lemo-mine", order: 10, component: MyStyle });
  studio.registerInspectorSection({ id: "lemo", kinds: ["shot"], order: 50, component: ShotStyle });
}
