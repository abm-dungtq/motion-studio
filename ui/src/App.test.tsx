import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SLOTS } from "./slots.ts";
import App, { boot, resetBoot } from "./App.tsx";
import { useStudio } from "./store/studio.ts";
import { mockFetch, renderUi } from "./shell/test-utils.tsx";

// The shape of GET /api/agent (server.mjs), trimmed.
const AGENT = { claude: { found: true, version: "2.1.0", logged_in: true }, provider: { id: "hyperframes", label: "HyperFrames" }, agents: [] };

const routes = { "/api/status": { ok: true }, "/api/projects": [], "/api/agent": AGENT };

afterEach(() => resetBoot());

describe("App", () => {
  it("has an element for every slot", async () => {
    mockFetch(routes);
    renderUi(<App />);
    await act(() => boot());
    act(() => useStudio.getState().openDialog("export"));
    expect(await screen.findByRole("dialog", { name: "Xuất bản" })).toBeInTheDocument();
    const seen = new Set(Array.from(document.querySelectorAll("[data-slot]"), (e) => e.getAttribute("data-slot")));
    act(() => useStudio.getState().openDialog("agent"));
    await screen.findByRole("dialog", { name: "Agent trên máy" });
    for (const e of document.querySelectorAll("[data-slot]")) seen.add(e.getAttribute("data-slot"));
    for (const slot of SLOTS) expect(seen, slot).toContain(slot);
    expect(screen.getByTestId("timeline-area")).toBeInTheDocument();
  });

  it("?tab=ai opens the director tab of the right column", async () => {
    window.history.replaceState(null, "", "/?tab=ai");
    useStudio.setState({ rightTab: "shot", rightCollapsed: true });
    mockFetch(routes);
    renderUi(<App />);
    await act(() => boot());
    await waitFor(() => expect(useStudio.getState()).toMatchObject({ rightTab: "director", rightCollapsed: false }));
  });

  it("?tab=output opens the export dialog", async () => {
    window.history.replaceState(null, "", "/?tab=output");
    mockFetch(routes);
    renderUi(<App />);
    await act(() => boot());
    expect(useStudio.getState().dialog).toBe("export");
  });

  it("puts a failing provider into the store for the banner", async () => {
    mockFetch({ ...routes, "/api/status": { ok: false, error: "Thiếu provider.", setup: "npm run setup" } });
    renderUi(<App />);
    await act(() => boot());
    expect(useStudio.getState().providerStatus).toMatchObject({ ok: false, setup: "npm run setup" });
    expect(await screen.findByText("Thiếu provider.")).toBeInTheDocument();
  });
});
