// lib/tools/voice.mjs — voices of a series episode (routes/voice.mjs, lib/series-voice.mjs,
// docs/series.md).
//   series_tts     voices lines in the cast voice of their speaker: one line runs now and is
//                  waited for; two or more ask the user first (consent card)
//   voice_design   asks the user for one Voice Design run of a role that has no voice yet
import { realpathSync } from "node:fs";
import { RESULT_PREFIX } from "../agents/index.mjs";
import { tracked } from "../handoff.mjs";

const WAIT_MS = 10 * 60000;
const POLL_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = { type: "string", description: "Tên thư mục dự án (tập) thuộc series" };
const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "tool");

// Waits for a job of the running Studio and answers its RESULT line.
async function waitResult(env, project, job) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    await sleep(POLL_MS);
    const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(project)}`)).find((x) => x.id === job.id);
    if (!j || j.status === "running" || j.status === "cancelling") continue;
    const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
    if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
    return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
  }
  return { ok: false, error: `sau ${WAIT_MS / 60000} phút câu vẫn chưa lồng xong (job ${job.id} còn chạy trong Studio)` };
}

export const TOOLS = [
  {
    name: "series_tts",
    title: "Lồng tiếng theo vai",
    description: "Lồng tiếng các câu của tập series bằng giọng cast của người nói (speaker của câu), qua công cụ series cast-tts: cổng viet-pro, giọng, bản mix, khẩu hình, rồi trỏ câu tới file mới và cập nhật mốc. Một câu thì chạy ngay và chờ kết quả. Từ hai câu trở lên thì tạo thẻ đồng ý (ước số ký tự) và chưa tốn lượt nào; kết thúc lượt và chờ người dùng bấm Đồng ý. Câu chưa có người nói bị từ chối. gate \"blocked\" là cổng viet-pro chặn lời: sửa lời, đừng thử lại nguyên câu. Không tự chạy lệnh tạo giọng nào khác.",
    inputSchema: {
      type: "object", required: ["project", "ids"],
      properties: { project: PROJECT, ids: { type: "array", items: { type: "string" }, description: "id các câu (vo-01, …)" } },
    },
    mutates: true, provider: true,
    async run(args, env) {
      const dir = realpathSync(env.projectDir(args.project));
      return tracked(dir, { step: "tts", command: ["series_tts", ...args.ids.map(String)], actor: actorOf(env) }, async () => {
        const r = await env.studio.post("/api/voice/tts", { name: args.project, ids: args.ids, actor: actorOf(env) });
        if (!r.job) return r;
        const result = await waitResult(env, args.project, r.job);
        const line = result.lines?.[0];
        return line && !line.ok && line.gate === "blocked" ? { ok: false, gate: "blocked", tail: line.tail, id: line.id } : result;
      }, {
        // A line the viet-pro gate refuses is a text to fix, not a broken step; a run that stopped is.
        failed: (r) => r?.ok === false && r.gate !== "blocked" && !(r.blocked?.length && !r.stopped),
        outcome: (r) => { const bad = r.lines?.find((l) => !l.ok && l.gate !== "blocked"); return { code: bad?.code ?? r.code ?? "error", tail: bad?.tail ?? [r.stopped ?? r.error ?? ""] }; },
      });
    },
  },
  {
    name: "voice_design",
    title: "Tạo giọng mới cho vai",
    description: "Xin người dùng đồng ý một lượt Voice Design (ElevenLabs) cho một vai có trong file roles của series mà chưa có giọng trong cast: 3 giọng thử. Tool chỉ tạo thẻ đồng ý, chưa tốn lượt; khi người dùng đồng ý Studio chạy, rồi người dùng nghe và chọn giọng (thẻ Chọn giọng). Không tự chọn giọng thay người dùng.",
    inputSchema: { type: "object", required: ["project", "role"], properties: { project: PROJECT, role: { type: "string", description: "id vai trong roles của series_list" } } },
    mutates: true, provider: true,
    run(args, env) {
      return env.studio.post("/api/voice/design", { name: args.project, role: args.role, actor: actorOf(env) });
    },
  },
];
