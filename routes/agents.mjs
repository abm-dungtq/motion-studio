// routes/agents.mjs — the agent CLI registry over HTTP (lib/agents/index.mjs). None needs a provider.
//   GET  /api/agents               → { agents, order, at, probe }; ?refresh=1 rescans
//   POST /api/agents/refresh       → drops the 60 s cache and rescans
//   POST /api/agents/probe {id,cap}→ starts the "agent-probe" job: one real run of cap (text,
//                                    vision or image) on that agent, which spends its quota. Only
//                                    the user's click starts it. probe in GET is that job.
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { getJob, startJob } from "../jobs.mjs";
import { CAPS, dropCache, listAgents, loadAdapters } from "../lib/agents/index.mjs";
import { redact } from "../lib/agents/redact.mjs";

const INDEX = fileURLToPath(new URL("../lib/agents/index.mjs", import.meta.url));
// Not a valid project name, so it never meets a project's jobs.
export const PROBE_OWNER = "(agents)";
let lastProbe = null; // job id

const withProbe = async (scan) => ({ ...scan, probe: lastProbe ? getJob(lastProbe) : null });

export const ROUTES = [
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
