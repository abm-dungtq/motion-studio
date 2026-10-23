// lib/tools/project.mjs — project tools over the provider's manifest and command gateway, for the
// director and outside MCP clients alike. Read before you write: project_summary / project_get
// answer the version, and project_patch / project_undo take it as base (a stale base is a
// CONFLICT, as in the Studio UI). The gateway stays the one writer of project.json, with its lock
// and validation, so a project is still editable by hand after an agent ran.
//   project_list     the projects under the root folder that have a manifest
//   project_summary  version, size, shots, lines and music in short, the last history lines
//   project_get      the whole manifest
//   project_log      the newest lines of the edit history
//   project_patch    gateway ops as one new version (actor from the server profile, default director)
//   project_undo     undoes the newest change as one new version
// Projects are named by folder (as in the Studio URL), not by path.
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

const NAME = /^[A-Za-z0-9._-]+$/;
const PROJECT = { type: "string", description: "Tên thư mục dự án (project_list)" };
const BASE = { type: "integer", description: "version vừa đọc bằng project_summary hoặc project_get" };
const clip = (s, n = 80) => (typeof s === "string" && s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The project folder (real path: the gateway lock and history are keyed by it) with a manifest.
function manifestDir(env, name) {
  const dir = realpathSync(env.projectDir(name));
  if (!existsSync(join(dir, env.P.manifest.file))) throw Object.assign(new Error(`dự án ${name} chưa có ${env.P.manifest.file}`), { status: 404 });
  return dir;
}

function load(env, dir) {
  const m = env.P.manifest.load(dir);
  if (!m) throw new Error(`không đọc được ${env.P.manifest.file}`);
  return m;
}

// The gateway answers { code, error } or { code: 0, version, receipt, lines, warnings }.
function gatewayResult(r) {
  if (r?.code) throw Object.assign(new Error(r.error ?? `gateway lỗi (code ${r.code})`), { code: r.code });
  return { version: r.version, receipt: r.receipt ?? [], lines: r.lines ?? [], warnings: r.warnings ?? [] };
}

const noteOf = (args, env) => [args.note, env.request ? `yêu cầu Studio ${env.request}` : null].filter(Boolean).join(" · ") || undefined;

export function summarize(m, history = []) {
  return {
    title: m.title ?? null, version: m.version, updated: m.updated ?? null,
    editable: Boolean(m.capabilities?.editable),
    size: { width: m.width ?? null, height: m.height ?? null, fps: m.fps ?? null }, duration: m.duration ?? null,
    shots: (m.shots ?? []).map((s) => ({ id: s.id, name: s.name, start: s.start, end: s.end, transition_in: s.transition_in || null, assets: (s.assets ?? []).length })),
    lines: (m.lines ?? []).map((l) => ({ id: l.id, shot: l.shot, start: l.start, duration: l.duration, gate: l.gate, text: clip(l.text) })),
    music: (m.music ?? []).map((x) => ({ id: x.id, file: x.file, start: x.start, duration: x.duration })),
    events: (m.events ?? []).length,
    history: history.slice(-5).map((h) => ({ v: h.v, at: h.at, actor: h.actor, receipt: (h.receipt ?? []).slice(0, 3) })),
  };
}

export const TOOLS = [
  {
    name: "project_list",
    title: "Danh sách dự án",
    description: "Liệt kê các dự án có manifest trong thư mục gốc của Studio: tên, tiêu đề, version, độ dài, số shot, sửa được hay không.",
    inputSchema: { type: "object", properties: {} },
    mutates: false, provider: true,
    run(_args, env) {
      const out = [];
      for (const e of readdirSync(env.root, { withFileTypes: true })) {
        if (!e.isDirectory() || !NAME.test(e.name) || e.name.startsWith(".")) continue;
        const dir = join(env.root, e.name);
        if (!existsSync(join(dir, env.P.manifest.file))) continue;
        let m = null;
        try { m = env.P.manifest.load(dir); } catch { /* listed as unreadable */ }
        out.push(m ? { name: e.name, title: m.title ?? null, version: m.version, duration: m.duration ?? null, shots: (m.shots ?? []).length, editable: Boolean(m.capabilities?.editable) } : { name: e.name, error: "manifest không đọc được" });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  },
  {
    name: "project_summary",
    title: "Tóm tắt dự án",
    description: "Tóm tắt một dự án: version (dùng làm base khi sửa), kích thước, độ dài, shot, câu thoại (chữ rút gọn), nhạc, 5 dòng lịch sử mới nhất. Gọn hơn project_get.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: false, provider: true,
    run({ project }, env) {
      const dir = manifestDir(env, project);
      return { project, ...summarize(load(env, dir), env.P.gateway.readHistory(dir)) };
    },
  },
  {
    name: "project_get",
    title: "Đọc manifest",
    description: "Đọc nguyên manifest project.json của dự án (shot, câu thoại, nhạc, sự kiện, version). Gọi trước khi sửa.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT } },
    mutates: false, provider: true,
    run({ project }, env) { return load(env, manifestDir(env, project)); },
  },
  {
    name: "project_log",
    title: "Lịch sử sửa",
    description: "Các dòng mới nhất của lịch sử sửa dự án: version, người sửa (actor), op, biên nhận.",
    inputSchema: { type: "object", required: ["project"], properties: { project: PROJECT, limit: { type: "integer", description: "Số dòng, 1–200, mặc định 20" } } },
    mutates: false, provider: true,
    run({ project, limit = 20 }, env) {
      const n = Math.max(1, Math.min(200, limit));
      return env.P.gateway.readHistory(manifestDir(env, project)).slice(-n);
    },
  },
  {
    name: "project_patch",
    title: "Sửa timeline",
    description: "Áp một danh sách op của cổng lệnh (resize_shot, move_line, set_shot, set_line_text, set_music, update_music, move_event, add_event, remove_event, add_shot, remove_shot) thành một version mới. base phải là version vừa đọc; sai base trả CONFLICT, op sai trả INVALID.",
    inputSchema: {
      type: "object", required: ["project", "base", "ops"],
      properties: {
        project: PROJECT, base: BASE,
        ops: { type: "array", items: { type: "object" }, description: "Op của gateway, ví dụ { op: \"set_shot\", id: \"s1\", field: \"name\", value: \"Mở\" }" },
        note: { type: "string", description: "Lý do, lưu cùng dòng lịch sử" },
      },
    },
    mutates: true, provider: true,
    run(args, env) {
      if (!args.ops.length) throw new Error("ops không được rỗng");
      const dir = manifestDir(env, args.project);
      return gatewayResult(env.P.gateway.patch(dir, { actor: env.actor ?? "director", base: args.base, ops: args.ops, note: noteOf(args, env) }));
    },
  },
  {
    name: "project_undo",
    title: "Hoàn tác",
    description: "Hoàn tác thay đổi mới nhất chưa hoàn tác, thành một version mới. base phải là version vừa đọc.",
    inputSchema: { type: "object", required: ["project", "base"], properties: { project: PROJECT, base: BASE } },
    mutates: true, provider: true,
    run(args, env) { return gatewayResult(env.P.gateway.undo(manifestDir(env, args.project), { base: args.base })); },
  },
];
