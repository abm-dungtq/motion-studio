// routes/director-agent.mjs — which agent CLI runs the director (lib/director-agents.mjs).
//   GET  /api/director/agents        → { agent, agents: [{ id, label, guard, guard_label, found,
//                                       version, logged_in, chosen, selectable, reason }] };
//                                       ?refresh=1 rescans the CLIs
//   POST /api/director/agent {id}    → saves studio.json director.agent (kept across restarts) when
//                                       that agent is selectable now; 409 with the reason when not.
//                                       Applies from the next request the director starts.
import { dropCache, listAgents, scanAgent } from "../lib/agents/index.mjs";
import { directorAgentSetting, writeSetting } from "../lib/config.mjs";
import { DIRECTORS, directorAgents, selectable } from "../lib/director-agents.mjs";

const list = async (P, refresh = false) => {
  if (refresh) dropCache();
  const chosen = directorAgentSetting();
  return { agent: chosen, agents: directorAgents(await listAgents({ refresh }), P, chosen) };
};

export const ROUTES = [
  { method: "GET", path: "/api/director/agents", provider: false, handler: async (c) => list(c.P, c.q("refresh") === "1") },
  {
    method: "POST", path: "/api/director/agent", provider: false,
    async handler(c) {
      const id = c.body?.id;
      if (typeof id !== "string" || !DIRECTORS[id]) return c.send(400, { error: `không có agent "${String(id ?? "")}"` });
      const ok = selectable(id, await scanAgent(id), c.P);
      if (!ok.selectable) return c.send(409, { error: ok.reason });
      writeSetting("director", { agent: id });
      return list(c.P);
    },
  },
];
