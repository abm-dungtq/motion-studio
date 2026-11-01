// routes/snapshots.mjs — keep or undo one AI turn (lib/snapshots.mjs).
//   GET  /api/snapshots?name=              → { snapshots: [...newest first], can_restore }
//                                            (closes the snapshots of ask chains that ended first)
//   GET  /api/snapshots/diff?name=&id=     → { files: [{ path, kind, before, after }], overwritten, created }
//   POST /api/snapshots/keep { name, id }  → the snapshot, state "kept"
//   POST /api/snapshots/restore { name, id, force? }
//        → { version, files, overwritten, created, lines }; 409 while a request of the project is
//          queued, running or waiting, and 409 { code: "NEWER" } when project.json changed after
//          the turn and force is not true.
import { KIND as DIRECTOR, settleSnapshots } from "../director.mjs";
import { running } from "../jobs.mjs";
import * as snapshots from "../lib/snapshots.mjs";

const ACTIVE = new Set(["queued", "running", "waiting_user"]);

const project = (c, name) => {
  const pd = c.withManifest(name);
  if (pd.error) throw Object.assign(new Error(pd.error), { status: pd.status });
  return pd;
};

export const ROUTES = [
  {
    method: "GET", path: "/api/snapshots",
    async handler(c) {
      const name = c.q("name");
      const pd = project(c, name);
      settleSnapshots(c.P, pd.dir);
      return { snapshots: snapshots.list(pd.dir), can_restore: typeof c.P.gateway?.restore === "function" };
    },
  },
  {
    method: "GET", path: "/api/snapshots/diff",
    async handler(c) {
      return snapshots.changes(project(c, c.q("name")).dir, c.q("id"));
    },
  },
  {
    method: "POST", path: "/api/snapshots/keep",
    async handler(c) {
      const b = c.body ?? {};
      return snapshots.keep(project(c, b.name).dir, b.id);
    },
  },
  {
    method: "POST", path: "/api/snapshots/restore",
    async handler(c) {
      const b = c.body ?? {};
      const pd = project(c, b.name);
      if (running(b.name, DIRECTOR) || c.P.requests.list(pd.dir).some((r) => ACTIVE.has(r.status))) {
        return c.send(409, { error: "Đạo diễn còn việc đang chạy hoặc đang chờ trong dự án này; đợi xong hoặc huỷ rồi hoàn tác." });
      }
      try {
        return snapshots.restore(pd.dir, b.id, { load: c.P.manifest.load, gw: c.P.gateway, force: b.force === true });
      } catch (e) {
        if (e.code === "NEWER") return c.send(409, { error: e.message, code: "NEWER" });
        throw e;
      }
    },
  },
];
