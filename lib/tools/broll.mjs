// lib/tools/broll.mjs — tools over the B-roll index (lib/broll/). All read the cache only; none
// starts an analysis (that spends vision quota and is the user's click, POST /api/broll/index).
//   broll_search         footage shots by words (accents optional): caption, tags, time range
//   broll_describe_clip  everything known about one clip: shots, captions, speech
//   broll_suggest        the top B-roll for a shot of a project
import { existsSync } from "node:fs";
import { hashFile, peekHash, SHA_RE } from "../broll/hash.mjs";
import { readClip } from "../broll/index.mjs";
import { loadIndex, search } from "../broll/search.mjs";
import { suggest } from "../broll/suggest.mjs";

const bad = (status, msg) => Object.assign(new Error(msg), { status });
const brief = ({ sha256, shot, start, end, duration, path, caption_vi, tags, shot_type, said, score, need_stretch, use }) =>
  ({ sha256, shot, start, end, duration, path, caption_vi, tags, shot_type, said, score, ...(use ? { need_stretch, use } : {}) });

export const TOOLS = [
  {
    name: "broll_search",
    title: "Tìm B-roll",
    description: "Tìm đoạn footage đã phân tích theo từ khoá tiếng Việt (có dấu hay không đều được): chú thích, tag, lời nói, tên file. Trả sha256, shot, start/end (giây), đường file và chú thích.",
    inputSchema: {
      type: "object", required: ["q"],
      properties: {
        q: { type: "string", description: "Từ khoá, tối đa 200 ký tự" },
        kind: { type: "string", description: "Cỡ cảnh: toàn, trung, cận, đặc tả, flycam, khác" },
        min_dur: { type: "number", description: "Độ dài tối thiểu của shot (giây)" },
        limit: { type: "integer", description: "Số kết quả, mặc định 10" },
      },
    },
    mutates: false, provider: false,
    async run({ q, kind = null, min_dur = null, limit = 10 }) {
      if (q.length > 200) throw bad(400, "q dài quá 200 ký tự");
      return { items: search(loadIndex(), q, { kind, min_dur, limit }).map(brief) };
    },
  },
  {
    name: "broll_describe_clip",
    title: "Xem một clip B-roll",
    description: "Mọi điều chỉ mục biết về một clip: thông số, các shot (start/end), chú thích và tag từng shot, có lời nói không và lời nói. Cho sha256 hoặc đường dẫn tuyệt đối của file.",
    inputSchema: { type: "object", properties: { sha256: { type: "string" }, path: { type: "string", description: "Đường dẫn tuyệt đối của file video" } } },
    mutates: false, provider: false,
    async run({ sha256 = null, path = null }) {
      let sha = sha256;
      if (!sha && path) {
        if (!path.startsWith("/") || !existsSync(path)) throw bad(404, "không có file này");
        sha = peekHash(path) ?? (await hashFile(path)).sha256;
      }
      if (!SHA_RE.test(String(sha ?? ""))) throw bad(400, "cần sha256 hoặc path");
      const c = readClip(sha);
      if (!c) throw bad(404, "clip này chưa được phân tích");
      const desc = new Map(c.describe.map((d) => [d.shot, d]));
      return {
        sha256: sha, probe: c.meta.probe, paths: (c.meta.seen_paths ?? []).filter((p) => existsSync(p)), indexed_at: c.meta.indexed_at,
        speech: c.speech ? { has_speech: c.speech.has_speech, ratio: c.speech.ratio, transcript: c.speech.transcript } : null,
        shots: c.scenes.map((s) => ({ ...s, ...(desc.get(s.i) ?? {}), shot: undefined })),
      };
    },
  },
  {
    name: "broll_suggest",
    title: "Gợi ý B-roll cho shot",
    description: "Gợi ý 5 đoạn footage hợp với một shot của dự án (theo tên shot, motion_note và lời thoại trong shot). Đoạn ngắn hơn shot có need_stretch: true. use là đoạn nên cắt.",
    inputSchema: { type: "object", required: ["project", "shot"], properties: { project: { type: "string" }, shot: { type: "string", description: "Id shot, ví dụ s2" } } },
    mutates: false, provider: true,
    async run({ project, shot }, env) {
      const dir = env.projectDir(project);
      const r = suggest(loadIndex(), env.P.manifest.load(dir), shot);
      return { query: r.query, duration: r.duration, items: r.items.map(brief) };
    },
  },
];
