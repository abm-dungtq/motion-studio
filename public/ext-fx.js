// ext-fx.js — transitions and footage edits (routes/fx.mjs, docs/transitions-and-effects.md):
// - shot inspector: "Thư viện chuyển cảnh" (fx-gallery.js), then "Sửa clip của shot" for the
//   shot's video assets (fx-footage.js);
// - Footage tab: "Sửa clip" for any registered video.
// The inspector's own "Chuyển cảnh vào" select stays as it is; this is an extra section.
import { gallerySection } from "/fx-gallery.js";
import { footageSection, shotClipsSection } from "/fx-footage.js";

export function register(studio) {
  const { ctx, h } = studio;
  studio.addInspectorSection({ kinds: ["shot"], view: (pick, m) => [gallerySection(ctx, h, pick, m), shotClipsSection(ctx, h, pick, m)] });
  studio.addSection("media", { id: "fx-footage", order: 60, view: ({ needManifest }) => (ctx.state.m ? footageSection(ctx, h) : needManifest()) });
}
