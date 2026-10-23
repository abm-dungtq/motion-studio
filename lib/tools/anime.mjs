// lib/tools/anime.mjs — tools of the anime motion-comic pipeline (lib/anime/*).
//   anime_generate_variant  one pose variant of a shot as the project's "anime" job of the running
//                           Studio (POST /api/anime/variant), waited for, answered with its RESULT
//   anime_manifest_get      assets/anim/manifest.json with its sha (for base_sha)
//   anime_manifest_set      validate, back up and write the manifest, then run the project's
//                           build.mjs here; answers the WARN lines
import { RESULT_PREFIX } from "../agents/index.mjs";
import { finalRenders, isEnabled, readManifest, rebuild, writeManifest } from "../anime/manifest.mjs";

const WAIT_MS = 8 * 60000;
const POLL_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TOOLS = [
  {
    name: "anime_generate_variant",
    title: "Sinh biến thể tư thế",
    description: "Sinh một biến thể tư thế cho một shot anime: sửa ảnh base (giữ khung) bằng agent sinh ảnh, kèm sheet nhân vật, rồi tách nền chroma-key và phóng tới rộng plate của shot. Ảnh gốc vào <dir hoạt hình>/raw/<out_name>.png, ảnh đã tách nền vào <dir hoạt hình>/<out_name>.png (mặc định assets/plates/anim). Tên trùng thì thêm -2. Ghi biên nhận. Cần Studio đang chạy. Lệch khung thì sửa bằng offsets trong manifest, đừng sinh lại.",
    inputSchema: {
      type: "object", required: ["project", "shot", "base", "change", "out_name"],
      properties: {
        project: { type: "string", description: "Tên thư mục dự án" },
        shot: { type: "string", description: "Id cảnh, ví dụ s13" },
        base: { type: "string", description: "Ảnh gốc của shot, đường trong dự án, ví dụ assets/plates/anim/s13-base.png" },
        chars: { type: "array", items: { type: "string" }, description: "Id nhân vật trong thư viện (sheet đính kèm)" },
        change: { type: "string", description: "Thay đổi duy nhất (kind edit) hoặc tư thế mới (kind pose)" },
        out_name: { type: "string", description: "Tên file không đuôi, ví dụ s13-k4" },
        kind: { type: "string", enum: ["edit", "pose"] },
        sim: { type: "number" }, blend: { type: "number" }, width: { type: "number" },
        edge: { type: "boolean", description: "Despill chỉ ở viền, giữ màu bên trong nhân vật" },
        agent: { type: "string" },
      },
    },
    mutates: true, provider: false,
    async run(args, env) {
      const { project, ...rest } = args;
      const { job } = await env.studio.post("/api/anime/variant", { name: project, ...rest, actor: "tool" });
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        const j = (await env.studio.get(`/api/jobs?name=${encodeURIComponent(project)}`)).find((x) => x.id === job.id);
        if (!j || j.status === "running" || j.status === "cancelling") continue;
        const line = [...(j.tail ?? [])].reverse().find((l) => l.startsWith(RESULT_PREFIX));
        if (line) return JSON.parse(line.slice(RESULT_PREFIX.length));
        return { ok: false, error: `job ${j.status}${j.code != null ? ` (exit ${j.code})` : ""}: ${(j.tail ?? []).slice(-3).join(" | ")}` };
      }
      return { ok: false, error: `sau ${WAIT_MS / 60000} phút biến thể vẫn chưa xong (job ${job.id} còn chạy trong Studio)` };
    },
  },
  {
    name: "anime_manifest_get",
    title: "Đọc manifest hoạt hình",
    description: "Đọc assets/anim/manifest.json (stack, track lipsync/blink/wind/keys, impacts, offsets) kèm sha để gửi lại làm base_sha.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
    mutates: false, provider: false,
    async run({ project }, env) {
      const dir = env.projectDir(project);
      const m = readManifest(dir);
      return { exists: Boolean(m), enabled: isEnabled(dir), sha: m?.sha ?? null, manifest: m?.manifest ?? null, final: finalRenders(dir) };
    },
  },
  {
    name: "anime_manifest_set",
    title: "Ghi manifest hoạt hình",
    description: "Ghi assets/anim/manifest.json: kiểm theo luật của build.mjs, sao lưu bản cũ vào .opus/anim-backups/, ghi nguyên tử rồi chạy node assets/anim/build.mjs của dự án. base_sha lấy từ anime_manifest_get; khác sha hiện tại thì lỗi 409. Dự án đã có video final thì cần confirm: true.",
    inputSchema: {
      type: "object", required: ["project", "manifest", "base_sha"],
      properties: {
        project: { type: "string" },
        manifest: { type: "object" },
        base_sha: { type: "string" },
        confirm: { type: "boolean" },
        rebuild: { type: "boolean", description: "Mặc định true" },
      },
    },
    mutates: true, provider: false,
    async run({ project, manifest, base_sha, confirm = false, rebuild: build = true }, env) {
      const dir = env.projectDir(project);
      const final = finalRenders(dir);
      if (final.length && confirm !== true) throw Object.assign(new Error(`dự án đã có bản final (${final.join(", ")}): gửi confirm: true nếu người dùng đã đồng ý`), { status: 428 });
      const w = writeManifest(dir, manifest, { baseSha: base_sha });
      if (!build || !isEnabled(dir)) return { ...w, build: null };
      const b = await rebuild(dir);
      return { ...w, build: { ok: b.code === 0, warnings: b.warnings, error: b.error } };
    },
  },
];
