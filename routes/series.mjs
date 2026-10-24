// routes/series.mjs — series folders over HTTP (lib/series.mjs, lib/series-run.mjs, docs/series.md).
//   GET  /api/series?name=<project>   → the project's series (describeSeries); no name: { series }
//                                       with every series the root's projects belong to
//   POST /api/series/run { name, tool, flags?, positional?, char?, actor? }
//        → starts the project's "series" job (one at a time per project): `node <tool file> …` in
//          the series folder, stopped after the tool's timeout_s. When it ends a receipt
//          (op series-tool) is written into the project with the path:write outputs that exist.
//   GET  /api/series/job?id=<job>     → { job, receipt, error }: receipt is null until written
//   POST /api/series/put { name, from, to, char?, replace?, actor? }
//        → copies one file of the project into a writable folder of the series: to is
//          "<writable key>/<path>". An existing file is refused (409) unless replace is true; then
//          the old one is kept as <file>.bak-<yyyymmddHHMM> first. Receipt op series-put.
//   POST /api/series/episode { from, episode, title, actor? }
//        → runs the series' episode tool with --root = the real folder holding project `from`
//          (episodes of a series sit side by side, also when `from` is a symlink in the root).
//          When that folder is not Studio's root, a symlink <root>/<episode name> to the new
//          episode is made once the tool succeeded. A name already in the root is 409. Receipt op
//          series-episode, in the new episode (in `from` when the tool failed).
import { copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, statSync, symlinkSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { cancel, getJob, startJob } from "../jobs.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { writeReceipt } from "../lib/receipts.mjs";
import { describeSeries, listSeries, seriesFor, seriesPath } from "../lib/series.mjs";
import { buildArgv } from "../lib/series-run.mjs";
import { insideProject } from "../lib/tools.mjs";

export const KIND = "series";
const ACTOR = /^(human|director|tool|studio)(:[A-Za-z0-9._-]{1,80})?$/;
const KEEP_RECEIPTS = 200;
const bad = (status, msg) => Object.assign(new Error(msg), { status });
const actorOf = (b) => (typeof b.actor === "string" && ACTOR.test(b.actor) ? b.actor : "human");
const inside = (p, dir) => p === dir || p.startsWith(dir + sep);
const stamp = (d = new Date()) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("");

const done = new Map(); // job id → { receipt, error, written: Promise }
function remember(id, entry) {
  done.set(id, entry);
  while (done.size > KEEP_RECEIPTS) done.delete(done.keys().next().value);
}

function seriesOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  const series = seriesFor(c.P, pd.dir);
  if (!series) throw bad(404, `${name} không thuộc series nào (BRIEF.md cần dòng series: <thư mục có studio-series.json>)`);
  // The real folder: outputs are resolved through links, so receipts list them relative to it.
  return { dir: realpathSync(pd.dir), series };
}

const existingFiles = (files) => files.filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

// Starts the job of a built command; after(job) runs before the receipt and answers
// { dir, outputs } to override where the receipt goes and what it lists.
function startSeriesJob({ name, cmd, tool, receipt, after = null }) {
  let timer = null;
  const entry = { receipt: null, error: null, written: null };
  let job;
  try {
    job = startJob({
      name, kind: KIND, cmd: cmd.cmd, args: cmd.argv, cwd: cmd.cwd, meta: { step: "series", tool },
      onLine: (l) => redact(l),
      onExit: (j) => {
        clearTimeout(timer);
        entry.written = (async () => {
          try {
            const extra = after ? await after(j) : null;
            const outputs = existingFiles(extra?.outputs ?? cmd.outputs);
            entry.receipt = await writeReceipt(extra?.dir ?? receipt.dir, { ...receipt.fields, inputs: { ...receipt.fields.inputs, exit: j.code, signal: j.signal }, outputs, started: j.started, ended: j.ended });
          } catch (e) { entry.error = e.message; }
        })();
      },
    });
  } catch (e) {
    throw bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${name} đang chạy một công cụ series khác, chờ xong đã` : e.message);
  }
  remember(job.id, entry);
  timer = setTimeout(() => cancel(job.id), cmd.timeoutMs);
  timer.unref?.();
  return job;
}

export const ROUTES = [
  {
    method: "GET", path: "/api/series",
    handler(c) {
      const name = c.q("name");
      if (!name) return { series: listSeries(c.P, c.root) };
      return describeSeries(seriesOf(c, name).series);
    },
  },
  {
    method: "POST", path: "/api/series/run",
    handler(c) {
      const b = c.body ?? {};
      const { dir, series } = seriesOf(c, b.name);
      const cmd = buildArgv({ series, projectDir: dir, root: c.root, tool: b.tool, flags: b.flags ?? {}, positional: b.positional ?? [], char: b.char ?? null });
      const job = startSeriesJob({
        name: b.name, cmd, tool: b.tool,
        receipt: { dir, fields: { op: "series-tool", actor: actorOf(b), tool: { name: b.tool, file: relative(series.dir, cmd.file) }, params: { flags: b.flags ?? {}, positional: b.positional ?? [], char: cmd.char }, inputs: { series: series.config.name } } },
      });
      return { job, timeout_s: cmd.timeoutMs / 1000 };
    },
  },
  {
    method: "GET", path: "/api/series/job",
    async handler(c) {
      const id = c.q("id");
      const job = id ? getJob(id) : null;
      if (!job || !done.has(id)) throw bad(404, `không có việc series ${String(id ?? "")}`);
      const entry = done.get(id);
      if (job.status !== "exited" && job.status !== "cancelled") return { job, receipt: null, error: null };
      await entry.written;
      return { job, receipt: entry.receipt ? { id: entry.receipt.id, file: entry.receipt.file, outputs: entry.receipt.outputs.map((o) => o.path) } : null, error: entry.error };
    },
  },
  {
    method: "POST", path: "/api/series/put",
    async handler(c) {
      const b = c.body ?? {};
      const { dir, series } = seriesOf(c, b.name);
      const from = insideProject(dir, b.from, "from", { mustExist: true });
      if (!statSync(from).isFile()) throw bad(400, "from: cần một file");
      const to = typeof b.to === "string" ? b.to : "";
      const [key, ...rest] = to.split("/");
      const writable = series.config.writable ?? {};
      if (!Object.hasOwn(writable, key)) throw bad(400, `to: bắt đầu bằng một khóa ghi được (${Object.keys(writable).join(", ") || "không có"}), ví dụ ${Object.keys(writable)[0] ?? "refs"}/ten-file.png`);
      if (!rest.length || rest.some((s) => s === "" || s === "." || s === ".." || s.startsWith(".")) || to.includes("\\")) throw bad(400, `to: đường "${to}" không hợp lệ`);
      const base = seriesPath(series, writable[key], { char: b.char });
      const dest = join(base, ...rest);
      // Checked on the deepest existing folder before anything is created, then again after.
      const escapes = () => {
        let probe = dirname(dest);
        while (!existsSync(probe)) probe = dirname(probe);
        const real = realpathSync(probe), realBase = existsSync(base) ? realpathSync(base) : base;
        return !(inside(real, realBase) || inside(realBase, real)) || inside(real, join(series.dir, "build")) || !inside(realBase, series.dir);
      };
      if (escapes()) throw bad(400, `to: "${to}" nằm ngoài thư mục ${key}`);
      mkdirSync(dirname(dest), { recursive: true });
      const realParent = realpathSync(dirname(dest));
      if (!inside(realParent, realpathSync(base)) || inside(realParent, join(series.dir, "build"))) throw bad(400, `to: "${to}" nằm ngoài thư mục ${key}`);
      const target = join(realParent, basename(dest));
      let backup = null;
      if (existsSync(target)) {
        if (b.replace !== true) throw bad(409, `${relative(series.dir, target)} đã có; gửi replace: true để thay (file cũ được giữ thành .bak-…)`);
        backup = `${target}.bak-${stamp()}`;
        for (let i = 2; existsSync(backup); i++) backup = `${target}.bak-${stamp()}-${i}`;
        copyFileSync(target, backup);
      }
      copyFileSync(from, target);
      const receipt = await writeReceipt(dir, { op: "series-put", actor: actorOf(b), tool: { name: "series_file_put" }, params: { to, char: b.char ?? null, replace: b.replace === true }, inputs: { series: series.config.name, from: b.from, backup: backup ? relative(series.dir, backup) : null }, outputs: [target] });
      return { ok: true, to: relative(series.dir, target), backup: backup ? relative(series.dir, backup) : null, receipt: { id: receipt.id, file: receipt.file } };
    },
  },
  {
    method: "POST", path: "/api/series/episode",
    handler(c) {
      const b = c.body ?? {};
      const { dir, series } = seriesOf(c, b.from);
      const ep = series.config.episode;
      if (!ep) throw bad(400, `series ${series.config.name} chưa khai báo episode`);
      if (!Number.isInteger(b.episode) || b.episode < 1 || b.episode > 999) throw bad(400, "episode: cần số tập nguyên dương");
      if (typeof b.title !== "string" || !b.title.trim()) throw bad(400, "title: cần tên tập");
      const name = ep.name.replace(/\{NN\}/g, String(b.episode).padStart(2, "0")).replace(/\{N\}/g, String(b.episode));
      const home = dirname(realpathSync(dir));
      const linked = home !== c.root;
      const taken = (p) => { try { lstatSync(p); return true; } catch { return false; } };
      if (taken(join(c.root, name))) throw bad(409, `${name} đã có trong thư mục gốc của Studio`);
      if (taken(join(home, name))) throw bad(409, `${join(home, name)} đã có`);
      const declared = series.config.tools[ep.tool]?.flags ?? {};
      const flags = { "--root": home, "--episode": b.episode, "--title": b.title, ...(Object.hasOwn(declared, "--name") ? { "--name": name } : {}) };
      const cmd = buildArgv({ series, projectDir: dir, root: c.root, tool: ep.tool, flags });
      const fresh = join(home, name);
      const job = startSeriesJob({
        name: b.from, cmd, tool: ep.tool,
        receipt: { dir, fields: { op: "series-episode", actor: actorOf(b), tool: { name: ep.tool, file: relative(series.dir, cmd.file) }, params: { episode: b.episode, title: b.title, name, linked }, inputs: { series: series.config.name, from: b.from } } },
        after(j) {
          if (j.code !== 0 || !existsSync(fresh)) return null;
          if (linked && !taken(join(c.root, name))) symlinkSync(fresh, join(c.root, name));
          return { dir: fresh, outputs: ["BRIEF.md", "index.html", "PLAN.md"].map((f) => join(fresh, f)) };
        },
      });
      return { job, name, dir: fresh, linked, timeout_s: cmd.timeoutMs / 1000 };
    },
  },
];
