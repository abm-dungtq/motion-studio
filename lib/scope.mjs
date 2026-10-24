// lib/scope.mjs — a director works on the project of its request, and only that one. Two checks:
//   Studio's side (requestScope): a POST whose actor is director:<request id> may only name the
//   project the director job of that request runs in (Studio started that job, so the pairing is
//   its own, not the caller's); an id Studio holds no director job for is refused too.
//   The MCP side (toolScope): the director's MCP server is started with --project <name>; a tool
//   that changes something refuses any other project there. Reading other projects stays allowed
//   (a director may look at an earlier episode).
import { listJobs } from "../jobs.mjs";

const DIRECTOR = /^director:([A-Za-z0-9._-]{1,80})$/;
const forbid = (msg) => Object.assign(new Error(msg), { status: 403 });
const only = (id, name) => `Đạo diễn của yêu cầu ${id} chỉ được làm trên ${name}; dự án khác (kể cả tập trước) chỉ đọc được, không ghi.`;

// The project of the director job of request id (the newest such job), or null.
export function requestProject(id) {
  const jobs = listJobs().filter((j) => j.kind === "director" && j.meta?.request === id);
  return jobs.sort((a, b) => String(b.started).localeCompare(String(a.started)))[0]?.name ?? null;
}

// Throws 403 when actor is a director's and name is not the project of its request.
export function requestScope(actor, name) {
  const m = typeof actor === "string" ? actor.match(DIRECTOR) : null;
  if (!m) return;
  const own = requestProject(m[1]);
  if (!own) throw forbid(`Studio không có yêu cầu ${m[1]} nào đang có đạo diễn; tool của đạo diễn chỉ chạy trong yêu cầu đó.`);
  if (name !== own) throw forbid(only(m[1], own));
}

// The refusal of a changing tool on another project than env.project, or null.
export function toolScope(tool, args, env) {
  if (!env?.project || !tool.mutates || args?.project === undefined || args.project === env.project) return null;
  return only(env.request ?? "này", env.project);
}
