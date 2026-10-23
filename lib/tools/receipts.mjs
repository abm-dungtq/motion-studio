// lib/tools/receipts.mjs — receipts of a project (lib/receipts.mjs) as tools, and a quality check
// on demand. Shared by the MCP server and routes/receipts.mjs.
//   receipts_list  newest receipts: op, actor, time, verdict, output files
//   receipt_get    one receipt in full, each check with its level
//   media_check    runs the quality checks (lib/quality/*.mjs) on project files and writes a
//                  "media-check" receipt (the checked files are its outputs)
// verdict: "fail" when a check of level "fail" did not pass, else "warn" when a check of level
// "warn" did not pass, else "pass". A check's level is declared next to it in lib/quality/*.mjs
// (default "fail"); a check no longer installed counts as "fail". Receipts store pass per check,
// so the verdict is worked out when a receipt is read, and old receipts get one too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listReceipts, receiptsDir, writeReceipt } from "../receipts.mjs";
import { loadChecks } from "../quality.mjs";
import { insideProject } from "../tools.mjs";
import { withExpected } from "../quality/video.mjs";

const ID = /^[a-z0-9]{4,16}-[0-9a-f]{6}$/;
const DAY = /^\d{8}$/;
const PROJECT = { type: "string", description: "Tên thư mục dự án" };

// id → level of the installed checks.
export async function checkLevels() {
  return new Map((await loadChecks()).map((c) => [c.id, c.level === "warn" ? "warn" : "fail"]));
}

export function verdictOf(receipt, levels) {
  let warn = false;
  for (const c of receipt?.checks ?? []) {
    if (c.pass) continue;
    if ((levels.get(c.id) ?? "fail") === "fail") return "fail";
    warn = true;
  }
  return warn ? "warn" : "pass";
}

export const withVerdict = (r, levels) => ({ ...r, verdict: verdictOf(r, levels), checks: (r.checks ?? []).map((c) => ({ ...c, level: levels.get(c.id) ?? "fail" })) });

export const row = (r, levels) => ({ id: r.id, op: r.op, actor: r.actor, written: r.written, verdict: verdictOf(r, levels), outputs: (r.outputs ?? []).map((o) => o.path), failed: (r.checks ?? []).filter((c) => !c.pass).map((c) => c.id), file: r.file });

export async function listRows(dir, { op = null, limit = 20 } = {}) {
  const levels = await checkLevels();
  return listReceipts(dir, { op, limit }).map((r) => row(r, levels));
}

// The receipt with this id, with its verdict and check levels, or null.
export async function getReceipt(dir, id) {
  if (!ID.test(String(id))) throw Object.assign(new Error("id biên nhận không hợp lệ"), { status: 400 });
  const base = receiptsDir(dir);
  if (!existsSync(base)) return null;
  for (const day of readdirSync(base).filter((d) => DAY.test(d)).sort().reverse()) {
    const f = readdirSync(join(base, day)).find((x) => x.endsWith(`-${id}.json`));
    if (!f) continue;
    const r = JSON.parse(readFileSync(join(base, day, f), "utf8"));
    if (r.id !== id) continue;
    return withVerdict({ ...r, file: `.opus/receipts/${day}/${f}` }, await checkLevels());
  }
  return null;
}

const EXPECT_KEYS = ["duration", "width", "height", "fps"];
const ALLOW_KEYS = ["black", "freeze", "silence"];
const pickNums = (o) => Object.fromEntries(EXPECT_KEYS.filter((k) => Number.isFinite(o?.[k]) && o[k] > 0).map((k) => [k, o[k]]));
const pickAllow = (o) => Object.fromEntries(ALLOW_KEYS.filter((k) => o?.[k] === true).map((k) => [`allow_${k}`, true]));

// Checks files (relative to dir) and writes a media-check receipt. Returns it with its verdict.
export async function checkMedia(dir, { files, expected = {}, allow = {}, actor = "studio" }) {
  if (!Array.isArray(files) || !files.length || files.length > 20) throw Object.assign(new Error("files: 1 đến 20 file trong dự án"), { status: 400 });
  const abs = files.map((f, i) => insideProject(dir, f, `files[${i}]`, { mustExist: true }));
  const exp = { ...pickNums(expected), ...pickAllow(allow) };
  const started = new Date();
  const r = await withExpected(abs, exp, () => writeReceipt(dir, { op: "media-check", actor, tool: { name: "media_check" }, inputs: { files }, params: exp, outputs: abs, started }));
  return withVerdict(r, await checkLevels());
}

const actorOf = (env) => (env.request ? `${env.actor ?? "director"}:${env.request}` : env.actor ?? "studio");

export const TOOLS = [
  {
    name: "receipts_list",
    title: "Biên nhận gần đây",
    description: "Biên nhận mới nhất của dự án (mỗi thao tác media một biên nhận): id, op, ai làm, giờ, verdict pass/warn/fail, file ra và kiểm nào trượt.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT, op: { type: "string", description: "Lọc theo op, ví dụ image-generate" }, limit: { type: "integer", description: "1–100, mặc định 20" } } },
    mutates: false, provider: false,
    run({ project, op, limit = 20 }, env) {
      return listRows(env.projectDir(project), { op: op ?? null, limit: Math.max(1, Math.min(100, limit)) });
    },
  },
  {
    name: "receipt_get",
    title: "Chi tiết biên nhận",
    description: "Một biên nhận đầy đủ: lệnh, thông số, input, file ra kèm sha256 và cỡ, từng kiểm chất lượng với mức fail/warn và chi tiết.",
    inputSchema: { type: "object", required: ["project", "id"], properties: { project: PROJECT, id: { type: "string", description: "id trong receipts_list" } } },
    mutates: false, provider: false,
    async run({ project, id }, env) {
      const r = await getReceipt(env.projectDir(project), id);
      if (!r) throw Object.assign(new Error(`không có biên nhận ${id}`), { status: 404 });
      return r;
    },
  },
  {
    name: "media_check",
    title: "Kiểm chất lượng media",
    description: "Chạy các kiểm chất lượng (đen, đứng hình, im lặng, độ to, clipping, kích thước, alpha) trên file trong dự án và ghi một biên nhận media-check. expected đặt thời lượng, rộng, cao, fps mong đợi; allow cho phép đoạn đen, đứng hình hoặc im lặng có chủ đích.",
    inputSchema: {
      type: "object", required: ["project", "files"],
      properties: {
        project: PROJECT,
        files: { type: "array", items: { type: "string" }, description: "Đường file trong dự án, ví dụ renders/final.mp4" },
        expected: { type: "object", description: "{ duration, width, height, fps }" },
        allow: { type: "object", description: "{ black, freeze, silence }: true là được phép" },
      },
    },
    mutates: true, provider: false,
    run(args, env) {
      return checkMedia(env.projectDir(args.project), { files: args.files, expected: args.expected, allow: args.allow, actor: actorOf(env) });
    },
  },
];
