// lib/tools/delivery.mjs — handing an episode of a series over (routes/delivery.mjs,
// lib/delivery.mjs). Every file goes into the series' delivery folder, never over another file.
//   deliver_text       title and description from the series draft + chapters, checked, copied
//   deliver_captions   SRT from words.json and CAPTIONS.md, viet-pro gate delivery, copied
//   deliver_export     youtube, facebook, tiktok copies of the newest final render; waits
//   deliver_thumbnail  asks the user (consent card) for three thumbnail backgrounds; draws nothing
//   delivery_status    what the delivery folder holds, each row's state and last error
//   drive_upload       dry_run: checks the upload with gws' --dry-run and waits; else a consent card
// Failures are counted by Studio (lib/handoff.mjs): the same code twice opens a "needs outside
// help" card, and the answer then says so: stop retrying.
import { RESULT_PREFIX } from "../agents/index.mjs";

const WAIT_MS = { export: 90 * 60000, drive: 30 * 60000 };
const POLL_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = { type: "string", description: "Tên thư mục dự án (tập) thuộc series, BRIEF.md có episode:" };
const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "tool");

// Waits for a delivery job and answers the RESULT line its runner printed.
async function waitJob(env, project, job, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await sleep(POLL_MS);
    const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(project)}`)).find((x) => x.id === job.id);
    if (!j || j.status === "running" || j.status === "cancelling") continue;
    const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
    if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
    return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
  }
  return { ok: false, error: `sau ${ms / 60000} phút việc vẫn chạy (job ${job.id}); xem trong Studio` };
}

export const TOOLS = [
  {
    name: "deliver_text",
    title: "Giao tiêu đề và mô tả",
    description: "Tiêu đề và mô tả YouTube của tập vào thư mục giao nộp của series. Lần đầu tạo delivery/tieu-de-mo-ta.md từ bản nháp tap-<N>-tieu-de-mo-ta.md của series (không có thì khung ## title, ## description) và thêm mốc chương m:ss theo cảnh. Sau đó chạy check-platform youtube và lint viet-pro: có ERROR thì trả các dòng lỗi, sửa delivery/tieu-de-mo-ta.md rồi gọi lại; qua thì chép sang thư mục giao nộp (không ghi đè).",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: true, provider: true,
    run(args, env) { return env.studio.post("/api/delivery/text", { name: args.project, actor: actorOf(env) }); },
  },
  {
    name: "deliver_captions",
    title: "Giao phụ đề và caption",
    description: "Phụ đề SRT từ words.json của các câu lồng tiếng, cùng CAPTIONS.md (bạn viết ở gốc dự án, có mục ## Facebook và ## TikTok, theo viet-pro), qua cổng viet-pro --stage delivery, rồi chép cả hai vào thư mục giao nộp của series (không ghi đè). Thiếu CAPTIONS.md thì tool nhắn; viết xong gọi lại.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: true, provider: true,
    run(args, env) { return env.studio.post("/api/delivery/captions", { name: args.project, actor: actorOf(env) }); },
  },
  {
    name: "deliver_export",
    title: "Giao video cho ba nền tảng",
    description: "Xuất bản youtube, facebook, tiktok từ video final (mặc định renders/*-final.mp4 mới nhất), qua cổng final, rồi chép ba file vào thư mục giao nộp của series; chờ xong (có thể lâu). Cổng final chặn thì trả các dòng preflight: sửa đúng việc đó, không lách cổng.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT, input: { type: "string", description: "renders/<tên>.mp4, bỏ trống để dùng bản final mới nhất" } } },
    mutates: true, provider: true,
    async run(args, env) {
      const r = await env.studio.post("/api/delivery/export", { name: args.project, input: args.input, actor: actorOf(env) });
      return { input: r.input, ...(await waitJob(env, args.project, r.job, WAIT_MS.export)) };
    },
  },
  {
    name: "deliver_thumbnail",
    title: "Thumbnail của tập",
    description: "Xin người dùng đồng ý vẽ 3 ảnh nền thumbnail (khuôn thumbnail của series, chừa nửa phải cho chữ). Tool chỉ tạo thẻ đồng ý, chưa tốn lượt nào; kết thúc lượt sau đó. Khi người dùng đồng ý, Studio vẽ, ghép chữ line1/line2 ra delivery/thumb-1..3.jpg; người dùng chọn một ảnh ở bảng Giao nộp.",
    inputSchema: {
      type: "object", required: ["project", "line1", "line2"],
      properties: {
        project: PROJECT,
        line1: { type: "string", description: "Dòng chữ lớn thứ nhất, ngắn (tối đa 60 ký tự)" },
        line2: { type: "string", description: "Dòng chữ lớn thứ hai" },
        accent: { type: "string", enum: ["red", "yellow", "cyan"], description: "Màu nhấn, mặc định yellow" },
        prompt: { type: "string", description: "Mô tả cảnh nền (tùy chọn); bỏ trống thì lấy theo tiêu đề tập" },
      },
    },
    mutates: true, provider: true,
    run(args, env) { return env.studio.post("/api/delivery/thumbnail", { name: args.project, line1: args.line1, line2: args.line2, accent: args.accent, prompt: args.prompt, actor: actorOf(env) }); },
  },
  {
    name: "delivery_status",
    title: "Trạng thái giao nộp",
    description: "Thư mục giao nộp của tập trong series và file đã có; với mỗi dòng (video, thumbnail, text, captions, drive): file đã giao và lỗi gần nhất; bản final mới nhất; thẻ đồng ý đang chờ.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: false, provider: true,
    run(args, env) { return env.studio.get(`/api/delivery?name=${encodeURIComponent(args.project)}`); },
  },
  {
    name: "drive_upload",
    title: "Tải thư mục giao nộp lên Drive",
    description: "Tải mọi file của thư mục giao nộp (mp4, jpg, srt, md) lên thư mục Drive của series bằng gws, kiểm đúng tài khoản trước, so kích thước sau. Mặc định chỉ tạo thẻ đồng ý (người dùng bấm mới tải). dry_run: true kiểm lệnh bằng --dry-run của gws, không ghi gì lên Drive, không cần thẻ, chờ kết quả.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT, dry_run: { type: "boolean", description: "true: chỉ chạy khô" } } },
    mutates: true, provider: true,
    async run(args, env) {
      const r = await env.studio.post("/api/delivery/drive", { name: args.project, dry_run: args.dry_run === true, actor: actorOf(env) });
      if (!r.job) return r;
      return { dry_run: true, ...(await waitJob(env, args.project, r.job, WAIT_MS.drive)) };
    },
  },
];
