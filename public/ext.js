// ext.js — loads the UI extensions GET /api/extensions lists: a <link> per ext-*.css, then
// import() of each ext-*.js and its register(studio). One extension that fails to load or
// register is reported by file name in a toast; the others still load. app.js builds studio:
// { ctx, h, toast, addTab, addSection, addInspectorSection, addAgentRows, addTimelineDecorator, icon }.
// See docs/extensions.md.
import { toast } from "/dom.js";

export async function loadExtensions(studio) {
  let list;
  try { list = await studio.ctx.api("/api/extensions"); } catch (e) {
    toast(`Không đọc được danh sách extension: ${e.message}`, true);
    return { loaded: [], failed: [] };
  }
  for (const href of list?.styles ?? []) {
    if (document.querySelector(`link[data-ext="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = href; link.dataset.ext = href;
    document.head.append(link);
  }
  const loaded = [], failed = [];
  for (const src of list?.scripts ?? []) {
    try {
      const mod = await import(src);
      if (typeof mod.register !== "function") throw new Error("không có export register(studio)");
      await mod.register(studio);
      loaded.push(src);
    } catch (e) {
      console.error(`extension ${src}`, e);
      failed.push(`${src.slice(1)}: ${e.message}`);
    }
  }
  if (failed.length) toast(`Extension lỗi, đã bỏ qua: ${failed.join("; ")}`, true);
  return { loaded, failed };
}
