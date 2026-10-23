// routes/timing.mjs — beat and word markers of the timeline (lib/timing-edit.mjs):
//   GET  /api/timing?name=                      → readMarkers + { busy }
//   POST /api/timing/beat  { name, music_id, base_sha, beat0 }
//   POST /api/timing/word  { name, line_id, index, base_sha, start?, end? }   (seconds of the file)
//   POST /api/timing/undo  { name }             → puts back the newest backup
//   POST /api/timing/word-sync { name }         → job "word-sync": the provider's wordSync check
// After a change, the provider's timing command rebuilds TIMING and timing.json as job "timing"
// (`node <P.commands.timing> --project <dir>`); the client reloads the player when it exits and
// says the animatic needs approving again (Studio never writes the approval line). While a
// director or timing job runs for the project, edits answer 409: the director may run timing too.
import { running } from "../jobs.mjs";
import { KIND as DIRECTOR } from "../director.mjs";
import { editBeat, editWord, readMarkers, undoLast } from "../lib/timing-edit.mjs";

export const TIMING_JOB = "timing";
const fail = (status, error) => Object.assign(new Error(error), { status });
const script = (cmd) => (typeof cmd === "string" ? cmd : typeof cmd?.file === "string" ? cmd.file : null);

// { dir, m } of an editable project, or throws.
function project(c, name) {
  const pd = c.withManifest(name);
  if (pd.error) throw fail(pd.status, pd.error);
  const m = c.P.manifest.load(pd.dir);
  if (!m) throw fail(404, `${name} chưa có project.json`);
  return { dir: pd.dir, m };
}

const busy = (name) => (running(name, DIRECTOR) ? "đạo diễn đang chạy" : running(name, TIMING_JOB) ? "đang dựng lại TIMING" : null);

function guard(c, name, m) {
  if (!m.capabilities?.editable) throw fail(423, "dự án chỉ xem, sửa qua đạo diễn");
  const why = busy(name);
  if (why) throw fail(409, `${why}; đợi xong rồi sửa mốc`);
}

// Starts the timing job. Returns its summary, or { error } when it could not start (the file
// change stays: running timing again by hand finishes it).
export function runTiming(c, name, dir, meta = {}) {
  const cmd = script(c.P.commands?.timing);
  if (!cmd) return { error: "provider không có lệnh timing" };
  try {
    return c.startJob({ name, kind: TIMING_JOB, cmd: process.execPath, args: [cmd, "--project", dir], cwd: dir, meta: { step: "timing", ...meta } });
  } catch (e) { return { error: e.message }; }
}

function after(c, name, dir, edit, what) {
  const job = edit.changed === false ? null : runTiming(c, name, dir, { what, file: edit.file });
  return { ...edit, job: job?.error ? null : job, warning: job?.error ?? null };
}

export const ROUTES = [
  {
    method: "GET", path: "/api/timing",
    handler: (c) => {
      const { dir, m } = project(c, c.q("name"));
      return { ...readMarkers(dir, m), busy: busy(c.q("name")) };
    },
  },
  {
    method: "POST", path: "/api/timing/beat",
    handler: (c) => {
      const { dir, m } = project(c, c.body.name);
      guard(c, c.body.name, m);
      return after(c, c.body.name, dir, editBeat(dir, m, c.body), "beat");
    },
  },
  {
    method: "POST", path: "/api/timing/word",
    handler: (c) => {
      const { dir, m } = project(c, c.body.name);
      guard(c, c.body.name, m);
      return after(c, c.body.name, dir, editWord(dir, m, c.body), "word");
    },
  },
  {
    method: "POST", path: "/api/timing/undo",
    handler: (c) => {
      const { dir, m } = project(c, c.body.name);
      guard(c, c.body.name, m);
      return after(c, c.body.name, dir, undoLast(dir), "undo");
    },
  },
  {
    method: "POST", path: "/api/timing/word-sync",
    handler: (c) => {
      const { dir } = project(c, c.body.name);
      const cmd = script(c.P.commands?.wordSync);
      if (!cmd) throw fail(503, "provider không có lệnh kiểm khớp lời");
      try {
        return c.startJob({ name: c.body.name, kind: "word-sync", cmd: process.execPath, args: [cmd, "--project", dir], cwd: dir, meta: { step: "word-sync" } });
      } catch (e) { throw fail(e.code === "BUSY" ? 409 : 500, e.message); }
    },
  },
];
