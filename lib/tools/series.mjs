// lib/tools/series.mjs — tools over a project's series folder (routes/series.mjs, docs/series.md).
//   series_list         the project's series (characters, roles, tools and their flags), or every
//                       series of the root's projects
//   series_tool         runs one declared tool as the project's "series" job, waits, answers
//                       { ok, code, tail, receipt }
//   series_file_put     copies a file of the project into a writable folder of the series
//   series_episode_new  makes the next episode from the series' template, beside project
import { realpathSync } from "node:fs";
import { tracked } from "../handoff.mjs";
import { describeSeries, listSeries, seriesFor } from "../series.mjs";

const POLL_MS = 1000;
const SLACK_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = { type: "string", description: "Tên thư mục dự án (tập) thuộc series" };
const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "tool");
// The series folder of a project for a handoff note, null when it has none or it cannot be read.
const seriesDirOf = (env, dir) => { try { return seriesFor(env.P, dir)?.dir ?? null; } catch { return null; } };

// Waits for a series job of the running Studio and its receipt.
async function waitJob(env, started) {
  const until = Date.now() + (started.timeout_s ?? 120) * 1000 + SLACK_MS;
  while (Date.now() < until) {
    await sleep(POLL_MS);
    const r = await env.studio.get(`/api/series/job?id=${encodeURIComponent(started.job.id)}`);
    if (r.job.status === "running" || r.job.status === "cancelling") continue;
    const ok = r.job.status === "exited" && r.job.code === 0;
    return { ok, code: r.job.code, status: r.job.status, tail: r.job.tail ?? [], receipt: r.receipt, ...(r.error ? { error: r.error } : {}) };
  }
  return { ok: false, error: `việc ${started.job.id} vẫn chạy sau thời hạn; xem trong Studio` };
}

export const TOOLS = [
  {
    name: "series_list",
    title: "Series của dự án",
    description: "Cho biết dự án thuộc series nào: nhân vật, vai giọng, các công cụ series chạy được kèm cờ và kiểu cờ, khóa ghi được (cho series_file_put), loại khuôn ảnh. Chỉ dùng cờ có trong danh sách này cho series_tool. Không có project thì liệt kê mọi series trong thư mục gốc.",
    inputSchema: { type: "object", properties: { project: PROJECT } },
    mutates: false, provider: true,
    run({ project }, env) {
      if (!project) return { series: listSeries(env.P, env.root) };
      const s = seriesFor(env.P, env.projectDir(project));
      if (!s) throw Object.assign(new Error(`${project} không thuộc series nào`), { status: 404 });
      return describeSeries(s);
    },
  },
  {
    name: "series_tool",
    title: "Chạy công cụ series",
    description: "Chạy một công cụ của series (tên và cờ lấy từ series_list) cho dự án, như việc \"series\" của Studio, có biên nhận. flags là object { \"--cờ\": giá trị } (bool: true; cờ lặp: mảng). Đường dẫn: S/<đường> là trong thư mục series, còn lại là trong dự án; không nhận đường tuyệt đối, '..' hay S/build. Cờ kiểu project nhận tên dự án. Cần Studio đang chạy.",
    inputSchema: {
      type: "object", required: ["project", "tool"],
      properties: {
        project: PROJECT,
        tool: { type: "string", description: "Tên công cụ trong series_list" },
        flags: { type: "object", description: "{ \"--cờ\": giá trị }" },
        positional: { type: "array", items: { type: "string" }, description: "Đối số vị trí (ví dụ tên tư thế)" },
        char: { type: "string", description: "Id nhân vật cho công cụ có {char} (mặc định lấy --char)" },
      },
    },
    mutates: true, provider: true,
    async run(args, env) {
      const dir = realpathSync(env.projectDir(args.project));
      const step = /^[a-z0-9][a-z0-9-]{0,60}$/.test(String(args.tool)) ? args.tool : "series-tool";
      const meta = { step, command: ["series_tool", String(args.tool), JSON.stringify(args.flags ?? {}), ...(args.positional ?? []).map(String)], where: seriesDirOf(env, dir), actor: actorOf(env) };
      return tracked(dir, meta, async () => {
        const started = await env.studio.post("/api/series/run", { name: args.project, tool: args.tool, flags: args.flags ?? {}, positional: args.positional ?? [], char: args.char, actor: actorOf(env) });
        return waitJob(env, started);
      });
    },
  },
  {
    name: "series_file_put",
    title: "Chép file vào series",
    description: "Chép một file đã viết trong dự án vào thư mục ghi được của series. to là \"<khóa>/<đường>\" với khóa trong writable của series_list, ví dụ rig_src/src/hd-poses.mjs (cần char) hay refs/<nhân vật>/thiet-ke.png. File đích đã có thì từ chối, trừ khi replace: true (file cũ được giữ thành .bak-…). Có biên nhận.",
    inputSchema: {
      type: "object", required: ["project", "from", "to"],
      properties: {
        project: PROJECT,
        from: { type: "string", description: "Đường file trong dự án" },
        to: { type: "string", description: "<khóa writable>/<đường>" },
        char: { type: "string", description: "Id nhân vật khi khóa có {char}" },
        replace: { type: "boolean" },
      },
    },
    mutates: true, provider: true,
    run(args, env) {
      return env.studio.post("/api/series/put", { name: args.project, from: args.from, to: args.to, char: args.char, replace: args.replace === true, actor: actorOf(env) });
    },
  },
  {
    name: "series_episode_new",
    title: "Tạo tập mới của series",
    description: "Tạo tập mới từ mẫu tập của series, đặt cạnh thư mục thật của project (tập nguồn) và tự nối vào thư mục gốc của Studio khi cần. Tên tập theo khuôn của series (ví dụ a-02). Có biên nhận. Cần Studio đang chạy.",
    inputSchema: {
      type: "object", required: ["project", "episode", "title"],
      properties: { project: PROJECT, episode: { type: "integer", description: "Số tập" }, title: { type: "string", description: "Tên tập, một dòng" } },
    },
    mutates: true, provider: true,
    async run(args, env) {
      const started = await env.studio.post("/api/series/episode", { from: args.project, episode: args.episode, title: args.title, actor: actorOf(env) });
      return { name: started.name, linked: started.linked, ...(await waitJob(env, started)) };
    },
  },
];
