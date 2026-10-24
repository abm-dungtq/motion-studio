// Every built-in panel and extension through the real loader (import.meta.glob of panels/*/index.ts
// and ext/*/index.ts, nothing mocked but fetch): the rail, the left-panel sections, the export and
// director sections, the shot inspector, the agent rows and every layout slot, as App boots on
// thuy-mau-demo.
import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

import { say } from "@/api/client.ts";
import type { ProjectEntry } from "@/api/types.ts";
import { useAgentRows, useInspectorSections, useSections } from "@/ext/registry.ts";
import { AgentTable } from "@/ext/agents/AgentTable.tsx";
import { AgentStatus } from "@/panels/agent/AgentStatus.tsx";
import { manifest, NAME } from "@/panels/director/fixtures.ts";
import { SLOTS } from "./slots.ts";
import App, { boot, resetBoot } from "./App.tsx";
import { useStudio } from "./store/studio.ts";

const m = manifest();
const PROJECTS: ProjectEntry[] = [
  { name: NAME, title: "Giới thiệu lớp thuỷ màu", has_manifest: true, editable: true, version: m.version },
  { name: "abm-intro", title: "ABM", has_manifest: true, editable: false, version: 2 },
];
const AGENT = { claude: { found: true, version: "2.1.0", logged_in: true }, provider: { id: "hyperframes", label: "HyperFrames" }, agents: [] };

// What the opened project's queries ask for; anything else answers 404, which a panel shows as its
// own error state.
const routes = {
  "/api/status": { ok: true },
  "/api/projects": PROJECTS,
  "/api/project": m,
  "/api/log": [],
  "/api/requests": [],
  "/api/jobs": [],
  "/api/gates": { pass: true, fails: [] },
  "/api/timeline/media": {},
  "/api/agent": AGENT,
  "/api/agents": { agents: [] },
  "/api/media": [],
  "/api/files": [],
  "/api/sounds": { sfx: [], bgm: [] },
  "/api/directions": { seams: ["whip-pan"] },
  "/api/receipts": [],
  "/api/fx/catalog": { transitions: [], footage: [] },
  "/api/fx/luts": [],
  "/api/lemo/styles": { fetched: false, styles: [] },
  "/api/broll/suggest": { hits: [] },
};

async function bootApp() {
  window.history.replaceState(null, "", `/?name=${NAME}`);
  mockFetch(routes);
  const r = renderUi(<App />);
  await act(() => boot());
  await waitFor(() => expect(useStudio.getState().name).toBe(NAME));
  return r;
}

const slot = (name: string) => document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
const filled = (el: HTMLElement | null) => Boolean(el && (el.textContent?.trim() || el.querySelector("button, canvas, video, img, input, section")));

beforeEach(() => vi.mocked(say).mockClear());
afterEach(() => resetBoot());

describe("integration: every panel and extension through the real loader", () => {
  it("loads every module without a failure toast", async () => {
    await bootApp();
    const failures = vi.mocked(say).mock.calls.filter(([text]) => String(text).startsWith("Extension lỗi"));
    expect(failures).toEqual([]);
  });

  it("puts 8 tabs on the rail in group order, with 2 group lines", async () => {
    await bootApp();
    const rail = slot("rail")!;
    const ids = Array.from(rail.querySelectorAll("[role=tab]"), (b) => b.getAttribute("data-tab"));
    expect(ids).toEqual(["media", "styles-code", "anime", "fx", "series-assets", "voice", "music", "library"]);
    expect(rail.querySelectorAll("[data-rail-sep]")).toHaveLength(2);
    // The lines fall between the groups: after series-assets and after music.
    const order = Array.from(rail.children, (e) => e.getAttribute("data-tab") ?? (e.hasAttribute("data-rail-sep") ? "|" : "?"));
    expect(order).toEqual(["media", "styles-code", "anime", "fx", "series-assets", "|", "voice", "music", "|", "library"]);
  });

  it("registers the sections of the media tab, the export dialog and the director tab", async () => {
    await bootApp();
    const ids = (host: string) => renderHook(() => useSections(host)).result.current.map((s) => s.id);
    expect(ids("media")).toContain("broll-search");
    expect(ids("export")).toEqual(["gates", "series-audio-review", "jobs", "files", "receipts"]);
    expect(ids("director")).toContain("chat");
  });

  it("orders the shot inspector: core, B-roll, fx, lemo, receipts", async () => {
    await bootApp();
    expect(renderHook(() => useInspectorSections("shot")).result.current.map((s) => [s.id, s.order])).toEqual([
      ["shot", 0], ["broll-suggest", 30], ["fx", 40], ["lemo", 50], ["receipts", 60],
    ]);
    // A click on a shot block of the timeline picks it, opens the Shot tab and shows them in order.
    const block = await waitFor(() => {
      const b = slot("timeline")?.querySelector<HTMLElement>('[data-kind="shot"]');
      expect(b).toBeTruthy();
      return b!;
    });
    act(() => useStudio.setState({ rightTab: "director" }));
    fireEvent.click(block);
    await waitFor(() => expect(useStudio.getState()).toMatchObject({ rightTab: "shot", pick: { kind: "shot", id: "s1" } }));
    const shown = Array.from(slot("right.shot")!.querySelectorAll("[data-section]"), (e) => e.getAttribute("data-section"));
    expect(shown).toEqual(["inspector/shot", "inspector/broll-suggest", "inspector/fx", "inspector/lemo", "inspector/receipts"]);
  });

  it("has two agent rows, the built-in status before the agents table", async () => {
    await bootApp();
    const rows = renderHook(() => useAgentRows()).result.current;
    expect(rows.map((r) => r.component)).toEqual([AgentStatus, AgentTable]);
  });

  it("fills every slot when its place is open", async () => {
    await bootApp();
    const seen = new Map<string, boolean>();
    const look = () => { for (const s of SLOTS) if (!seen.get(s)) seen.set(s, filled(slot(s))); };

    await waitFor(() => expect(filled(slot("left"))).toBe(true));
    await waitFor(() => expect(filled(slot("timeline"))).toBe(true));
    act(() => useStudio.setState({ rightTab: "director", rightCollapsed: false }));
    await waitFor(() => expect(filled(slot("right.director"))).toBe(true));
    act(() => useStudio.getState().setPick("shot", "s1", m));
    act(() => useStudio.setState({ rightTab: "shot" }));
    await waitFor(() => expect(filled(slot("right.shot"))).toBe(true));
    look();

    act(() => useStudio.getState().openDialog("export"));
    await screen.findByRole("dialog", { name: "Xuất bản" });
    await waitFor(() => expect(filled(slot("export"))).toBe(true));
    look();
    act(() => useStudio.getState().openDialog(null));

    act(() => useStudio.getState().openDialog("agent"));
    await screen.findByRole("dialog", { name: "Agent trên máy" });
    await waitFor(() => expect(filled(slot("agent"))).toBe(true));
    look();

    for (const s of SLOTS) expect(seen.get(s), s).toBe(true);
  });
});
