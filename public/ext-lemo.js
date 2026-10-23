// ext-lemo.js — code-made film styles (lemo-opuscar): the "Phong cách code" tab with the gallery
// (lemo-gallery.js) and own styles (lemo-mystyle.js), and a "Phong cách code" section in the shot
// inspector. Server side: routes/lemo.mjs. See docs/lemo-styles.md.
import { createStore, galleryView, shotSection } from "/lemo-gallery.js";
import { myStyleView } from "/lemo-mystyle.js";

export function register(studio) {
  const { ctx } = studio;
  const store = createStore(ctx);
  let redraw = null;
  store.on(() => redraw?.());
  // A brush over a frame.
  studio.icon("lemo", [["rect", { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ["path", { d: "M7 15c2-4 4-6 10-7M7 15l2 1" }]]);
  studio.addTab({
    id: "styles-code", label: "Phong cách code", icon: "lemo",
    lead: "59 phong cách phim dựng bằng code của lemo-opuscar và phong cách riêng của bạn. Áp cho dự án hoặc một shot.",
    view: (helpers) => { redraw = helpers.render; return galleryView(ctx, store, helpers); },
  });
  studio.addSection("styles-code", { id: "lemo-mine", order: 10, view: () => myStyleView(ctx, store) });
  studio.addInspectorSection({ kinds: ["shot"], view: (pick) => shotSection(ctx, store, pick) });
}
