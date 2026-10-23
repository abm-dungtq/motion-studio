// lib/tools/fx.mjs — the transition library and the footage edits as tools.
//   fx_catalog       reads the merged catalog (lib/fx/catalog.mjs), optionally filtered
//   fx_footage_edit  trim, speed, freeze, grade or reframe one clip: runs as the project's "fx"
//                    job in the running Studio (POST /api/fx/footage), waited for and answered
//                    with its RESULT line (output path, durations, receipt)
import { loadCatalog } from "../fx/catalog.mjs";
import { OPS, RESULT_PREFIX } from "../fx/footage.mjs";

const POLL_MS = 1000;
const WAIT_MS = 30 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TOOLS = [
  {
    name: "fx_catalog",
    title: "Thư viện chuyển cảnh",
    description: "Mọi chuyển cảnh Studio gợi ý được (seam của provider, gói Studio, HyperFrames), không có seam bị cấm. Mỗi mục có nguồn, kind, recipe hoặc tài liệu, và seam ghi vào PLAN.md.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["provider", "studio", "hyperframes"], description: "Chỉ lấy một nguồn" },
        query: { type: "string", description: "Lọc theo id, tên hoặc mô tả" },
      },
    },
    mutates: false, provider: false,
    async run(args, env) {
      const cat = loadCatalog({ P: env.P ?? null });
      const q = String(args.query ?? "").toLowerCase().trim();
      const items = cat.items.filter((i) => (!args.source || i.sources.includes(args.source)) && (!q || [i.id, i.name, i.description].some((s) => String(s ?? "").toLowerCase().includes(q))));
      return { items, counts: cat.counts, banned: cat.banned };
    },
  },
  {
    name: "fx_footage_edit",
    title: "Sửa clip footage",
    description: "Cắt (trim), đổi tốc độ theo điểm neo (speed), đứng hình (freeze), chỉnh màu bằng LUT hoặc preset (grade), cắt khung dọc/vuông theo điểm neo (reframe). Render trước bằng ffmpeg vào footage/cut/, tất định, có biên nhận. Cần Studio đang chạy.",
    inputSchema: {
      type: "object", required: ["project", "src", "op", "params"],
      properties: {
        project: { type: "string", description: "Tên thư mục dự án" },
        src: { type: "string", description: "id hoặc rel của clip đã đăng ký, hoặc đường dưới footage/, shared-assets/ hay trong dự án" },
        op: { type: "string", enum: OPS },
        params: { type: "object", description: "trim {in,out} · speed {anchors:[{t,rate}],audio} · freeze {at,duration} · grade {lut|preset,intensity} · reframe {aspect,anchors:[{t,x,y}]}" },
      },
    },
    mutates: true, provider: false,
    async run(args, env) {
      const { job } = await env.studio.post("/api/fx/footage", { name: args.project, src: args.src, op: args.op, params: args.params, actor: "tool" });
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(args.project)}`)).find((x) => x.id === job.id);
        if (!j || j.status === "running" || j.status === "cancelling") continue;
        const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
        if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
        return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
      }
      return { ok: false, error: `sau ${WAIT_MS / 60000} phút clip vẫn chưa xong (job ${job.id} còn chạy trong Studio)` };
    },
  },
];
