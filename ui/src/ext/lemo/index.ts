// Port of public/ext-lemo.js; behaviour unchanged.
// The "Phong cách" tab: the provider's style profiles, code-made film styles (lemo-opuscar,
// github.com/lemomo-ai/lemo-opuscar; code and docs MIT, frames and films CC BY 4.0 by LemoLab) and
// the own styles, and a "Phong cách" section in the shot inspector. Server side: routes/lemo.mjs.
// See docs/lemo-styles.md. The downloaded library is data: nothing of it is ever run.
import { Palette } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { lazyNamed } from "@/ext/lazy.ts";

export const LEAD = "Phong cách dựng sẵn, 59 phong cách tham khảo của lemo-opuscar và phong cách riêng của bạn. Áp cho dự án hoặc một shot.";

const Gallery = lazyNamed(() => import("./Gallery.tsx"), "Gallery");
const ShotStyle = lazyNamed(() => import("./ShotStyle.tsx"), "ShotStyle");

export function register(studio: Studio): void {
  studio.registerTab({ id: "styles-code", label: "Phong cách", icon: Palette, group: "assets", order: 20, lead: LEAD, component: Gallery });
  studio.registerInspectorSection({ id: "lemo", kinds: ["shot"], order: 50, component: ShotStyle });
}
