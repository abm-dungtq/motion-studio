// Port of public/ext-agents.js; behaviour unchanged. Its rows come after those of panels/agent,
// since the loader runs panels before extensions, as the old popover did.
import type { Studio } from "@/ext/registry.ts";
import { AGENT_ROWS_WIDTH, AgentTable } from "./AgentTable.tsx";

export function register(studio: Studio): void {
  studio.registerAgentRows({ component: AgentTable, width: AGENT_ROWS_WIDTH });
}
