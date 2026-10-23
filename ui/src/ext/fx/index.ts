// Port of public/ext-fx.js; behaviour unchanged.
// Transitions and footage edits (routes/fx.mjs, docs/transitions-and-effects.md):
// - the fx tab: "Thư viện chuyển cảnh" for the selected shot, then "Sửa clip" for any registered
//   video;
// - the shot inspector: "Sửa clip của shot" for the shot's video assets and a button to the fx tab.
// The inspector's own "Chuyển cảnh vào" select stays as it is; this is an extra section.
import { ArrowLeftRight } from "lucide-react";
import type { Studio } from "@/ext/registry.ts";
import { FxTab } from "./FxTab.tsx";
import { ShotClips } from "./ShotClips.tsx";

export function register(studio: Studio): void {
  studio.registerTab({
    id: "fx",
    label: "Chuyển cảnh & hiệu ứng",
    icon: ArrowLeftRight,
    group: "assets",
    order: 40,
    lead: "Chuyển cảnh giữa các shot và sửa clip footage: cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung.",
    component: FxTab,
  });
  studio.registerInspectorSection({ id: "fx", kinds: ["shot"], order: 40, component: ShotClips });
}
