// lib/tools/nle.mjs — the NLE export as a tool.
//   nle_export  the project's "bộ lớp dựng" (bundle.mjs): shots, audio stems, captions and the
//               timeline.fcpxml / timeline.xml / timeline.otio an editor opens. It runs as the
//               project's export job of the running Studio (POST /api/bundle, the same as the
//               button in Xuất bản), is waited for, and answers the bundle folder, its timeline
//               files and their absolute paths, read from the bundle's manifest.json.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { insideProject } from "../tools.mjs";

const WAIT_MS = 30 * 60000; // a full HyperFrames render of a long project
const POLL_MS = 2000;
const RATIO = /^\d+x\d+$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TOOLS = [
  {
    name: "nle_export",
    title: "Xuất timeline cho phần mềm dựng",
    description: "Xuất bộ lớp dựng của dự án (hình từng shot, tiếng tách vai, phụ đề) kèm timeline.fcpxml (Final Cut Pro, DaVinci Resolve), timeline.xml (Premiere, Resolve) và timeline.otio (OpenTimelineIO). Chạy thành job xuất của Studio, chờ xong rồi trả thư mục bundle và đường các file timeline. Cần Studio đang chạy.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: {
        project: { type: "string", description: "Tên thư mục dự án" },
        ratio: { type: "string", description: "Tỉ lệ, mặc định 16x9; tỉ lệ khác cần compositions/main-<ratio>.html" },
      },
    },
    mutates: true, provider: false,
    async run(args, env, { waitMs = WAIT_MS, pollMs = POLL_MS } = {}) {
      const ratio = args.ratio ?? "16x9";
      if (!RATIO.test(ratio)) throw Object.assign(new Error("ratio dạng 9x16"), { status: 400 });
      const dir = env.projectDir(args.project);
      const { job } = await env.studio.post("/api/bundle", { name: args.project, ratio });
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        await sleep(pollMs);
        const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(args.project)}`)).find((x) => x.id === job.id);
        if (!j || j.status === "running" || j.status === "cancelling") continue;
        if (j.status !== "exited" || j.code !== 0) return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
        const out = j.meta?.output ?? job.meta?.output;
        const bundle = insideProject(dir, out, "bundle", { mustExist: true });
        const mf = join(bundle, "manifest.json");
        if (!existsSync(mf)) return { ok: false, error: `${out} không có manifest.json` };
        const m = JSON.parse(readFileSync(mf, "utf8"));
        const files = Object.fromEntries(["fcpxml", "xmeml", "otio"].filter((k) => m.nle?.[k]).map((k) => [k, join(bundle, m.nle[k])]));
        return { ok: true, bundle: out, dir: bundle, nle: m.nle ?? null, files, shots: m.shots?.length ?? 0, frames: m.frames, fps: m.fps };
      }
      return { ok: false, error: `sau ${Math.round(waitMs / 60000)} phút bộ lớp dựng vẫn chưa xong (job ${job.id} còn chạy trong Studio)` };
    },
  },
];
