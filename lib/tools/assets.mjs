// lib/tools/assets.mjs — image batches of a series episode (routes/assets.mjs, docs/assets.md).
//   asset_batch    checks a batch file and asks the user (consent card); draws nothing itself
//   asset_redo     redraws one image of a batch now, waits, answers its state (≤ 3 per image)
//   asset_status   the state of every image of a batch (or the list of batches)
import { realpathSync } from "node:fs";
import { RESULT_PREFIX } from "../agents/index.mjs";
import { tracked } from "../handoff.mjs";
import { batchStatus, listBatches } from "../assets/batch.mjs";

const WAIT_MS = 20 * 60000;
const POLL_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = { type: "string", description: "Tên thư mục dự án (tập) thuộc series" };
const BATCH = { type: "string", description: "Tên đợt: file assets/gen/batches/<đợt>.json của dự án" };
const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "tool");

export const TOOLS = [
  {
    name: "asset_batch",
    title: "Vẽ ảnh theo đợt",
    description: "Xin người dùng đồng ý vẽ một đợt ảnh của series. Trước đó viết file đợt assets/gen/batches/<đợt>.json: mảng { id, kind: pose|background|prop|ui-card|thumbnail, prompt, character?, refs?: [\"S/refs/...\" hoặc đường trong dự án], background?: green|none, size?, target?: \"S/<thư mục writable>/...png\", import?: { height | width } }. Tool kiểm file và tạo thẻ đồng ý (ước số lượt vẽ, quota từng tài khoản); chưa tốn lượt nào. Sau đó kết thúc lượt: khi người dùng đồng ý, Studio vẽ cả đợt, tự kiểm, tách nền, rồi gửi bạn một yêu cầu mới.",
    inputSchema: { type: "object", required: ["project", "batch"], properties: { project: PROJECT, batch: BATCH } },
    mutates: true, provider: true,
    run(args, env) {
      const dir = realpathSync(env.projectDir(args.project));
      return tracked(dir, { step: "asset-batch", command: ["asset_batch", String(args.batch)], actor: actorOf(env) },
        () => env.studio.post("/api/assets/batch", { name: args.project, batch: args.batch, actor: actorOf(env) }));
    },
  },
  {
    name: "asset_redo",
    title: "Vẽ lại một ảnh của đợt",
    description: "Vẽ lại đúng một ảnh của đợt theo góp ý (không cần thẻ đồng ý), chờ xong rồi trả trạng thái ảnh đó. Ảnh cũ được giữ, ảnh mới thêm -2, -3. Mỗi ảnh tối đa 3 lần vẽ lại do AI yêu cầu trong một đợt; sau đó cần người dùng xem ở tab Tài sản.",
    inputSchema: {
      type: "object", required: ["project", "batch", "id", "reason"],
      properties: { project: PROJECT, batch: BATCH, id: { type: "string", description: "id ảnh trong file đợt" }, reason: { type: "string", description: "Cần sửa gì, một câu" } },
    },
    mutates: true, provider: true,
    async run(args, env) {
      const { job } = await env.studio.post("/api/assets/redo", { name: args.project, batch: args.batch, ids: [args.id], reason: args.reason, actor: actorOf(env) });
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(args.project)}`)).find((x) => x.id === job.id);
        if (!j || j.status === "running" || j.status === "cancelling") continue;
        const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
        const result = line ? JSON.parse(line.slice(RESULT_PREFIX.length)) : null;
        const item = batchStatus(env.projectDir(args.project), args.batch).items.find((x) => x.id === args.id) ?? null;
        return { ok: Boolean(result?.ok), item, ...(result ? {} : { error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` }), ...(result?.message ? { message: result.message } : {}) };
      }
      return { ok: false, error: `sau ${WAIT_MS / 60000} phút ảnh vẫn chưa xong (job ${job.id} còn chạy trong Studio)` };
    },
  },
  {
    name: "asset_status",
    title: "Trạng thái đợt ảnh",
    description: "Trạng thái từng ảnh của một đợt: status (keyed, ready, needs_review, failed, waiting_quota, …), ảnh gốc assets/gen/raw, ảnh đã tách assets/gen/keyed, số lần vẽ, lý do trượt kiểm. Không có batch thì liệt kê các đợt của dự án.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT, batch: BATCH } },
    mutates: false, provider: false,
    run(args, env) {
      const dir = env.projectDir(args.project);
      if (!args.batch) return { batches: listBatches(dir) };
      return batchStatus(dir, args.batch);
    },
  },
];
