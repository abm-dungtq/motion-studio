// lib/tools/agents.mjs — tools over the agent CLI registry (lib/agents/index.mjs).
//   agents_list     the CLIs on this machine: version, login, caps, codex-pool quota
//   image_generate  one image into a project, as the project's "image" job of the running Studio
//                   (POST /api/agents/image), waited for and answered with its RESULT line
//   image_describe  reads project images and answers JSON (runs here: no job, nothing written)
import { describeImages, listAgents, RESULT_PREFIX } from "../agents/index.mjs";
import { insideProject } from "../tools.mjs";

const WAIT_MS = 7 * 60000;
const POLL_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TOOLS = [
  {
    name: "agents_list",
    title: "Agent CLI trên máy",
    description: "Liệt kê các agent CLI trên máy (claude, codex, codex-pool, agy, …): phiên bản, đã đăng nhập chưa, làm được gì (chữ, đọc ảnh, sinh ảnh) và quota của codex-pool.",
    inputSchema: { type: "object", properties: { refresh: { type: "boolean", description: "Quét lại, bỏ cache 60 giây" } } },
    mutates: false, provider: false,
    async run({ refresh = false }) {
      const s = await listAgents({ refresh });
      return { at: s.at, order: s.order, agents: s.agents.filter((a) => a.found).map(({ id, label, version, logged_in, caps, quota, error }) => ({ id, label, version, logged_in, caps, quota, error })) };
    },
  },
  {
    name: "image_generate",
    title: "Sinh ảnh",
    description: "Sinh một ảnh PNG vào dự án bằng agent sinh ảnh (mặc định codex-pool → codex → agy). Có refs thì đính ảnh tham chiếu; edit: true sửa ảnh refs[0] giữ khung. Không ghi đè: tên đã có thì thêm -2, -3. Ghi biên nhận vào .opus/receipts/. Cần Studio đang chạy.",
    inputSchema: {
      type: "object", required: ["project", "prompt", "out"],
      properties: {
        project: { type: "string", description: "Tên thư mục dự án" },
        prompt: { type: "string" },
        out: { type: "string", description: "Đường .png trong dự án, ví dụ assets/chars/hero.png" },
        refs: { type: "array", items: { type: "string" }, description: "Ảnh tham chiếu, đường trong dự án" },
        edit: { type: "boolean" },
        size: { type: "string", description: "Ví dụ 1024x1024" },
        agent: { type: "string", description: "Ép dùng một agent (id trong agents_list)" },
      },
    },
    mutates: true, provider: false,
    async run(args, env) {
      const { job } = await env.studio.post("/api/agents/image", { name: args.project, prompt: args.prompt, out: args.out, refs: args.refs, edit: args.edit, size: args.size, agent: args.agent, actor: "tool" });
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(args.project)}`)).find((x) => x.id === job.id);
        if (!j || j.status === "running" || j.status === "cancelling") continue;
        const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
        if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
        return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
      }
      return { ok: false, error: `sau ${WAIT_MS / 60000} phút ảnh vẫn chưa xong (job ${job.id} còn chạy trong Studio)` };
    },
  },
  {
    name: "image_describe",
    title: "Đọc ảnh",
    description: "Cho agent đọc ảnh (mặc định agy → codex-pool → claude) và trả JSON theo schema nếu có.",
    inputSchema: {
      type: "object", required: ["project", "images", "prompt"],
      properties: {
        project: { type: "string" },
        images: { type: "array", items: { type: "string" }, description: "Đường ảnh trong dự án" },
        prompt: { type: "string" },
        schema: { type: "object", description: "JSON Schema của câu trả lời" },
        agent: { type: "string" },
      },
    },
    mutates: false, provider: false,
    async run(args, env) {
      const dir = env.projectDir(args.project);
      const images = args.images.map((f, i) => insideProject(dir, f, `images[${i}]`, { mustExist: true }));
      return describeImages({ images, prompt: args.prompt, schema: args.schema ?? null, agent: args.agent ?? null });
    },
  },
];
