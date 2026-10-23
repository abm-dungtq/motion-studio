import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { registerAgentRows } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { AgentDialog } from "./AgentDialog.tsx";
import { mockFetch, renderUi } from "./test-utils.tsx";

// The shape of GET /api/agent (server.mjs), trimmed.
const AGENT = { claude: { found: true, version: "2.1.0", logged_in: true }, provider: { id: "hyperframes", label: "HyperFrames" }, agents: [] };

describe("AgentDialog", () => {
  it("shows Loading until a row is registered", () => {
    mockFetch({ "/api/agent": AGENT });
    useStudio.setState({ dialog: "agent" });
    renderUi(<AgentDialog />);
    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
  });

  it("shows the rows in registration order, and a broken row only breaks itself", () => {
    mockFetch({ "/api/agent": AGENT });
    registerAgentRows({ component: () => <p>hàng một</p> });
    registerAgentRows({ component: () => { throw new Error("hỏng"); } });
    registerAgentRows({ component: ({ reload }) => <p>{typeof reload === "function" ? "hàng ba" : ""}</p> });
    useStudio.setState({ dialog: "agent" });
    renderUi(<AgentDialog />);
    const body = document.querySelector('[data-slot="agent"]');
    expect(body?.textContent).toBe("hàng mộtMục mở rộng lỗi: hỏnghàng ba");
    act(() => useStudio.getState().openDialog(null));
    expect(document.querySelector('[data-slot="agent"]')).toBeNull();
  });

  it("gives focus back to the agent chip when it closes", async () => {
    mockFetch({ "/api/agent": AGENT });
    registerAgentRows({ component: () => <p>hàng</p> });
    const chip = document.createElement("button");
    chip.setAttribute("data-agent-chip", "");
    document.body.append(chip);
    useStudio.setState({ dialog: "agent" });
    renderUi(<AgentDialog />);
    act(() => useStudio.getState().openDialog(null));
    // Radix moves focus on unmount in a timeout.
    await waitFor(() => expect(document.activeElement).toBe(chip));
    chip.remove();
  });
});
