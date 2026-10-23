// Port of the popover body of public/agent.js; behaviour unchanged. The chip reloads
// GET /api/agent when it opens the dialog (shell/AgentChip.tsx), so the rows do not fetch again.
import type { Studio } from "@/ext/registry.ts";
import { AgentStatus } from "./AgentStatus.tsx";

export function register(studio: Studio): void {
  studio.registerAgentRows({ component: AgentStatus });
}
