import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStudio } from "@/ext/registry.ts";
import { loadAll } from "@/ext/load.ts";
import * as agentsExt from "@/ext/agents/index.ts";
import { probeInterval } from "@/ext/agents/AgentTable.tsx";
import { AgentDialog } from "@/shell/AgentDialog.tsx";
import { useStudio } from "@/store/studio.ts";
import * as agentPanel from "./index.ts";

// GET /api/agent and GET /api/agents (server.mjs, routes/agents.mjs), trimmed, with fields the
// server never sends (email, token) to prove the rows do not read them.
const AGENT = {
  claude: { found: true, version: "2.1.304 (Claude Code)", logged_in: true, email: "someone@example.com", token: "sk-secret-123" },
  runner: "mcp", last_job: null, ffprobe: true, ffmpeg: false,
  provider: { id: "demo-provider", label: "Plugin demo", version: "2.5.0" },
  email: "someone@example.com", token: "sk-secret-123",
};
const SCAN = {
  at: "2026-10-23T04:50:30Z",
  order: { text: ["agy", "codex-pool"], image: ["codex-pool"] },
  probe: { status: "done", code: 1, tail: ["FAIL không sinh được ảnh"], meta: { agent: "codex", cap: "image" } },
  agents: [
    { id: "claude", label: "Claude Code", found: true, version: "2.1.304", logged_in: true, caps: { text: "yes", vision: "yes", image: "no" }, email: "someone@example.com", token: "sk-secret-123", auth: "oauth" },
    { id: "codex-pool", label: "Codex (codex-pool)", found: true, version: "codex-cli 0.163.0", logged_in: true, caps: { text: "yes", vision: "yes", image: "yes" }, verified: { image: { ok: false } },
      quota: { accounts: [{ name: "acct1", ok: true, h5: 38, week: 12 }, { name: "acct2", ok: false }], next: "acct1" } },
    { id: "goose", label: "Goose", found: true, detect_only: true, version: "goose 1.45.0" },
    { id: "gemini", label: "Gemini CLI", found: false },
  ],
};

async function openDialog(routes: Record<string, unknown>) {
  const fetch = mockFetch(routes);
  const studio = createStudio();
  await loadAll(studio, { panels: { "../panels/agent/index.ts": agentPanel }, ext: { "./agents/index.ts": agentsExt } });
  useStudio.setState({ dialog: "agent", name: "thuy-mau-demo" });
  renderUi(<AgentDialog />);
  return fetch;
}

describe("agent rows", () => {
  it("status rows come before the CLI table, and no email or token reaches the DOM", async () => {
    await openDialog({ "/api/agent": AGENT, "/api/agents": SCAN });
    await screen.findByText("Codex (codex-pool)");
    await screen.findByText("Plugin demo 2.5.0");
    const body = document.querySelector('[data-slot="agent"]') as HTMLElement;
    const status = body.querySelector('[data-agent-rows="status"]') as Element;
    const cli = body.querySelector('[data-agent-rows="cli"]') as Element;
    expect(status.compareDocumentPosition(cli) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const html = document.body.innerHTML;
    expect(html).not.toContain("someone@example.com");
    expect(html).not.toContain("sk-secret-123");
    expect(html).not.toContain("oauth");
    expect(body.textContent).not.toContain("@");
  });

  it("the CLI table: quota, detect-only, missing, order, verified mark and the last probe", async () => {
    await openDialog({ "/api/agent": AGENT, "/api/agents": SCAN });
    expect(await screen.findByText("Quota: acct1 5h 38% · tuần 12% · acct2 · hết lượt · kế tiếp: acct1")).toBeInTheDocument();
    expect(screen.getByText(/^Chỉ dò thấy:/)).toHaveTextContent("Chỉ dò thấy: Goose 1.45.0");
    expect(screen.getByText("Không thấy: Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Chữ: agy → codex-pool")).toBeInTheDocument();
    expect(screen.getByTitle("Đã thử: không được")).toHaveTextContent("có ✓");
    expect(screen.getByText("Lần thử gần nhất (codex · Sinh ảnh): không được, không sinh được ảnh")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử khả năng" })).toHaveAttribute("title", "Chạy thật một lần, có tốn quota của agent này");
    expect(screen.getByText("ffmpeg").nextSibling).toHaveTextContent("không tìm thấy");
  });

  it("Thử khả năng posts the probe once (mocked, no quota spent), then reads the scan again", async () => {
    let probes = 0;
    const fetch = await openDialog({
      "/api/agent": AGENT,
      "/api/agents": SCAN,
      "/api/agents/probe": () => { probes++; return { error: "lỗi thử probe" }; },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Thử khả năng" }));
    await waitFor(() => expect(probes).toBe(1));
    const probe = fetch.mock.calls.find(([u]) => String(u) === "/api/agents/probe");
    expect(JSON.parse(String(probe?.[1]?.body))).toEqual({ id: "claude", cap: "image" });
    await waitFor(() => expect(fetch.mock.calls.filter(([u]) => String(u) === "/api/agents").length).toBeGreaterThanOrEqual(2));
  });

  it("a failed scan shows its error and no controls", async () => {
    await openDialog({ "/api/agent": AGENT });
    expect(await screen.findByText("Không đọc được danh sách agent: not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Làm mới" })).toBeNull();
  });

  it("a failed /api/agent shows the status error; polling only while a probe runs", async () => {
    await openDialog({ "/api/agents": SCAN });
    expect(await screen.findByText("Không đọc được trạng thái: not found")).toBeInTheDocument();
    const now = Date.parse("2026-10-23T05:00:00Z");
    expect(probeInterval({ agents: [], probe: { status: "running", started: "2026-10-23T04:59:00Z" } }, now)).toBe(1500);
    expect(probeInterval({ agents: [], probe: { status: "running", started: "2026-10-23T04:50:00Z" } }, now)).toBe(false);
    expect(probeInterval({ agents: [], probe: { status: "done" } }, now)).toBe(false);
  });
});
