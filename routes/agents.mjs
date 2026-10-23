// routes/agents.mjs — the agent CLI registry over HTTP (lib/agents/index.mjs). None needs a provider.
//   GET  /api/agents               → { agents, order, at, probe }; ?refresh=1 rescans
//   POST /api/agents/refresh       → drops the 60 s cache and rescans
//   POST /api/agents/probe {id,cap}→ starts the "agent-probe" job: one real run of cap (text,
//                                    vision or image) on that agent, which spends its quota. Only
//                                    the user's click starts it. probe in GET is that job.
//   POST /api/agents/image {name, prompt, out, refs?, edit?, size?, agent?, actor?}
//                                  → starts the project's "image" job (one at a time per
//                                    project): generateImage with out and refs relative to the
//                                    project; the job's last line is RESULT <json>.
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { getJob, startJob } from "../jobs.mjs";
import { CAPS, dropCache, listAgents, loadAdapters } from "../lib/agents/index.mjs";
import { redact } from "../lib/agents/redact.mjs";
import { insideProject } from "../lib/tools.mjs";

const INDEX = fileURLToPath(new URL("../lib/agents/index.mjs", import.meta.url));
// Not a valid project name, so it never meets a project's jobs.
export const PROBE_OWNER = "(agents)";
let lastProbe = null; // job id

const ACTORS = new Set(["human", "director", "tool", "studio"]);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

const withProbe = async (scan) => ({ ...scan, probe: lastProbe ? getJob(lastProbe) : null });

export const ROUTES = [
  {
    method: "POST", path: "/api/agents/image", provider: false,
    async handler(c) {
      const b = c.body ?? {};
      const pd = c.projectDir(b.name);
      if (pd.error) return c.send(pd.status, { error: pd.error });
      if (typeof b.prompt !== "string" || !b.prompt.trim()) throw bad("cần prompt");
      if (!/\.png$/i.test(String(b.out ?? ""))) throw bad("out: đường dẫn .png trong dự án, ví dụ assets/chars/hero.png");
      const out = insideProject(pd.dir, b.out, "out");
      const refs = (Array.isArray(b.refs) ? b.refs : []).map((r, i) => insideProject(pd.dir, r, `refs[${i}]`, { mustExist: true }));
      const arg = { prompt: b.prompt, out, refs, edit: b.edit === true, size: b.size ?? null, project: pd.dir, agent: typeof b.agent === "string" ? b.agent : null, actor: ACTORS.has(b.actor) ? b.actor : "human" };
      try {
        const job = startJob({ name: b.name, kind: "image", cmd: process.execPath, args: [INDEX, "generate", JSON.stringify(arg)], cwd: pd.dir, meta: { step: "image", output: b.out }, onLine: (l) => redact(l) });
        return { job };
      } catch (e) { return c.send(e.code === "BUSY" ? 409 : 500, { error: e.code === "BUSY" ? "dự án đang sinh một ảnh khác, chờ xong đã" : e.message }); }
    },
  },
  { method: "GET", path: "/api/agents", provider: false, handler: async (c) => withProbe(await listAgents({ refresh: c.q("refresh") === "1" })) },
  { method: "POST", path: "/api/agents/refresh", provider: false, handler: async () => { dropCache(); return withProbe(await listAgents({ refresh: true })); } },
  {
    method: "POST", path: "/api/agents/probe", provider: false,
    async handler(c) {
      const { id, cap } = c.body ?? {};
      const known = (await loadAdapters()).find((a) => a.id === id);
      if (!known) return c.send(400, { error: `không có agent "${String(id ?? "")}"` });
      if (!CAPS.includes(cap)) return c.send(400, { error: `cap là ${CAPS.join(" | ")}` });
      if (known.detectOnly || !known.run?.[cap]) return c.send(400, { error: `${known.label} chưa có cách chạy "${cap}" trong Studio` });
      try {
        const job = startJob({
          name: PROBE_OWNER, kind: "agent-probe", cmd: process.execPath, args: [INDEX, "probe", id, cap], cwd: tmpdir(),
          meta: { agent: id, cap }, onLine: (l) => redact(l), onExit: () => dropCache(),
        });
        lastProbe = job.id;
        return { job };
      } catch (e) { return c.send(e.code === "BUSY" ? 409 : 500, { error: e.code === "BUSY" ? "đang thử một agent khác, chờ xong đã" : e.message }); }
    },
  },
];
