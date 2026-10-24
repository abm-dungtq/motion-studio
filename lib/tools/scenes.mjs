// lib/tools/scenes.mjs — scenes of an episode for the director (routes/scenes.mjs, lib/scenes.mjs,
// docs/series.md).
//   scene_list     the manifest's scenes: window, last build, approval
//   scene_rebuild  rebuilds one scene (preview page, draft clip, stills) after scenes/*.mjs changed,
//                  waits, answers the result. Approving is the user's click, not a tool.
import { RESULT_PREFIX } from "../agents/index.mjs";

const WAIT_MS = 35 * 60000;
const POLL_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = { type: "string", description: "Tên thư mục dự án (tập)" };
const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "tool");

// Waits for the "scene" job and answers its RESULT line.
async function waitScene(env, project, job) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    await sleep(POLL_MS);
    const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(project)}`)).find((x) => x.id === job.id);
    if (!j || j.status === "running" || j.status === "cancelling") continue;
    const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
    if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
    return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
  }
  return { ok: false, error: `sau ${WAIT_MS / 60000} phút cảnh vẫn chưa dựng xong (job ${job.id} còn chạy trong Studio)` };
}

export const TOOLS = [
  {
    name: "scene_list",
    title: "Danh sách nhóm cảnh",
    description: "Các nhóm cảnh của tập (scenes trong project.json): id cN, nhãn, khoảng giây, shot, lần dựng cuối (clip nháp, ảnh ghép) và dòng duyệt của người dùng trong DEMO.md. current=false nghĩa là mốc cảnh đã đổi sau lần dựng cuối.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: false, provider: true,
    run(args, env) {
      return env.studio.get(`/api/scenes?name=${encodeURIComponent(args.project)}`);
    },
  },
  {
    name: "scene_rebuild",
    title: "Dựng lại một cảnh",
    description: "Dựng lại một nhóm cảnh sau khi sửa scenes/*.mjs: kiểm cue các shot trong cảnh, trang xem trước chỉ chạy khoảng của cảnh, clip nháp demo/scenes/<cN>.mp4 (không tiếng) và ảnh ghép 6 khung demo/scenes/<cN>-stills.png. Không render cả tập. Chờ xong rồi trả kết quả; step \"scene-preview\" với code 3 là cue sai (đọc dòng ERROR trong tail). Người dùng tự duyệt cảnh trong Studio; không tự ghi dòng duyệt.",
    inputSchema: { type: "object", required: ["project", "scene"], properties: { project: PROJECT, scene: { type: "string", description: "id cảnh dạng c3 (scene_list)" } } },
    mutates: true, provider: true,
    async run(args, env) {
      const r = await env.studio.post("/api/scenes/rebuild", { name: args.project, scene: args.scene, actor: actorOf(env) });
      if (!r.job) return r;
      return waitScene(env, args.project, r.job);
    },
  },
];
