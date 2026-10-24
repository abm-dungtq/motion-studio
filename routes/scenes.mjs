// routes/scenes.mjs — scenes of an episode, rebuilt and approved one group at a time
// (lib/scenes.mjs, docs/series.md).
//   GET  /api/scenes?name=<project>
//        → { scenes: [{ id, label, from, to, shots, built, clip, stills, current, approved,
//          approved_current }], job, can_rebuild }: the manifest's scenes with their last build
//          (.opus/scenes/<cN>.json) and their approval note of DEMO.md; job is the running "scene"
//          job; can_rebuild says the project's series declares scene-preview
//   POST /api/scenes/rebuild { name, scene, actor? }
//        → { job, scene }: the project's "scene" job (one at a time, 409 while one runs) rebuilds the
//          preview page, the draft clip and the stills sheet of one scene; never the whole film
//   POST /api/scenes/approve { name, scenes: [cN], note? }
//        → { notes, demo }: the user's approval, one DEMO.md note per scene above "## Frames"
//          ("cảnh N: approved user@studio <ISO> <label>"), a receipt (op scene-approve) and a
//          request telling the director. Only scenes whose clip was built for their current window
//          are accepted. The director has no tool for this route.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { queueRequest } from "../director.mjs";
import { BY, writeDemoNote } from "../gates.mjs";
import { running, startJob, summary } from "../jobs.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { approvalNote, PREVIEW_TOOL, SCENE_ID, sceneList, sceneWindow } from "../lib/scenes.mjs";
import { seriesFor } from "../lib/series.mjs";

export const SCENE_KIND = "scene";
const RUNNER = fileURLToPath(new URL("../lib/scenes.mjs", import.meta.url));
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
const MAX_APPROVE = 100;
const bad = (status, msg) => Object.assign(new Error(msg), { status });
const actorOf = (b) => (typeof b.actor === "string" && ACTOR.test(b.actor) ? b.actor : "human");

function projectOf(c, name) {
  const pd = c.withManifest(name);
  if (pd.error) throw bad(pd.status, pd.error);
  const m = c.P.manifest.load(pd.dir);
  if (!m) throw bad(404, `${name} chưa có project.json`);
  return { name, path: pd.dir, dir: realpathSync(pd.dir), m };
}

// The series of the project when it declares the scene-preview tool, else null.
function previewSeries(c, dir) {
  const s = seriesFor(c.P, dir);
  return s && Object.hasOwn(s.config.tools ?? {}, PREVIEW_TOOL) ? s : null;
}

export const ROUTES = [
  {
    method: "GET", path: "/api/scenes",
    handler(c) {
      const p = projectOf(c, c.q("name"));
      let can = false;
      try { can = Boolean(previewSeries(c, p.dir)); } catch { /* a broken declaration: no rebuild */ }
      const j = running(p.name, SCENE_KIND);
      return { scenes: sceneList(p.m, p.dir), job: j ? summary(j) : null, can_rebuild: can };
    },
  },
  {
    method: "POST", path: "/api/scenes/rebuild",
    handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const scene = sceneWindow(p.m, b.scene);
      const series = previewSeries(c, p.dir);
      if (!series) throw bad(400, `Dựng lại cảnh cần công cụ ${PREVIEW_TOOL} của series (dự án không thuộc series, hoặc studio-series.json chưa khai báo nó)`);
      const arg = { projectDir: p.dir, root: c.root, series: { dir: series.dir, config: series.config }, scene, actor: actorOf(b) };
      try {
        const job = startJob({ name: p.name, kind: SCENE_KIND, cmd: process.execPath, args: [RUNNER, "run", JSON.stringify(arg)], cwd: p.dir, meta: { step: SCENE_KIND, scene: scene.id }, onLine: (l) => redact(l) });
        return { job, scene };
      } catch (e) {
        throw bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${p.name} đang dựng một cảnh, chờ xong đã` : e.message);
      }
    },
  },
  {
    method: "POST", path: "/api/scenes/approve",
    async handler(c) {
      const b = c.body ?? {};
      const p = projectOf(c, b.name);
      const ids = b.scenes;
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_APPROVE || ids.some((x) => typeof x !== "string" || !SCENE_ID.test(x))) throw bad(400, `scenes: 1 đến ${MAX_APPROVE} id cảnh dạng c3`);
      if (new Set(ids).size !== ids.length) throw bad(400, "scenes: có id lặp lại");
      if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 500)) throw bad(400, "note: chữ, tối đa 500 ký tự");
      const list = sceneList(p.m, p.dir);
      const picked = ids.map((id) => {
        const s = list.find((x) => x.id === id);
        if (!s) throw bad(400, `Dự án không có cảnh ${id}`);
        if (!s.clip) throw bad(409, `cảnh ${id} chưa dựng: bấm Dựng lại cảnh này trước khi duyệt`);
        if (!s.current) throw bad(409, `cảnh ${id} đã đổi mốc sau lần dựng cuối: dựng lại rồi duyệt`);
        return s;
      });
      const at = new Date().toISOString();
      const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim() : "";
      const notes = picked.map((s) => writeDemoNote(p.dir, approvalNote(s, BY, at)));
      const nums = picked.map((s) => Number(s.id.slice(1)));
      await writeReceipt(p.dir, { op: "scene-approve", actor: "human", params: { scenes: ids, ...(note ? { note } : {}) }, inputs: { clips: picked.map((s) => s.clip) }, outputs: [join(p.dir, "DEMO.md")] });
      try { queueRequest(c.P, p.name, p.path, { scope: "project", text: `Người dùng duyệt cảnh ${nums.join(", ")}${note ? `. Ghi chú: ${note}` : ""}.` }); }
      catch (e) { console.error(`motion-studio: không xếp được yêu cầu cho đạo diễn sau khi duyệt cảnh: ${e.message}`); }
      return { notes, demo: "DEMO.md" };
    },
  },
];
