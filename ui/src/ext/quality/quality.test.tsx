import { renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, idleTransport } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import { applyJobEvent } from "@/api/events.ts";
import * as Q from "@/api/queries.ts";
import type { Job, Manifest } from "@/api/types.ts";
import { SectionHost } from "@/shell/SectionHost.tsx";
import { createStudio, resetRegistry } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { register } from "./index.ts";
import { chipText } from "./QaChip.tsx";
import { qaBands } from "./qa-data.ts";

const QA = `# QA

## qc-mp4 demo-final.mp4 2026-10-30 10:00

- PASS ASPECT 1920×1080 khớp aspect 16:9
- WARN FREEZE đứng hình 87.77–89.8s (2.0s)
- WARN FREEZE đứng hình 91.6–93.97s (2.4s)
- qc-mp4: WARN (2 WARN, 0 FAIL)

## SYNC (2026-10-30T02:05:13.299Z)

PASS  SYNC   0.883s Con dấu đập xuống ← assets/sfx/stamp.mp3 lệch +0 ms (đầu file im 0 ms)
`;

const m = { version: 1, fps: 30, shots: [], lines: [] } as unknown as Manifest;

// /p/demo/QA.md answers text (or 404 when qa is null); every other path 404.
function serve(qa: string | null) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://studio.test").pathname;
    return path === "/p/demo/QA.md" && qa !== null ? new Response(qa, { status: 200 }) : new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  queryClient.clear();
  resetRegistry();
  register(createStudio());
  useStudio.setState({ name: "demo", qaLayer: true });
  actions.transport = idleTransport;
});

describe("QA bands", () => {
  it("draws two FREEZE warnings as two warn bands on the shot lane, and none with the layer off", async () => {
    serve(QA);
    await queryClient.fetchQuery(Q.projectTextQuery("demo", "QA.md"));
    expect(qaBands(m, { name: "demo" })).toEqual([
      { t: 87.77, until: 89.8, lane: "shot", label: "FREEZE", title: "WARN FREEZE đứng hình 87.77–89.8s (2.0s)", kind: "warn" },
      { t: 91.6, until: 93.97, lane: "shot", label: "FREEZE", title: "WARN FREEZE đứng hình 91.6–93.97s (2.4s)", kind: "warn" },
    ]);
    useStudio.setState({ qaLayer: false });
    expect(qaBands(m, { name: "demo" })).toEqual([]);
  });

  it("marks a failed SYNC check at its time and a FAIL in the bad colour", () => {
    queryClient.setQueryData(Q.keys.projectText("demo", "QA.md"), "## SYNC (2026-10-30T00:00:00Z)\n\nFAIL  SYNC   2.5s Trống ← a.mp3 lệch +180 ms\n");
    expect(qaBands(m, { name: "demo" })).toEqual([{ t: 2.5, until: null, lane: "shot", label: "SYNC", title: "FAIL SYNC 2.5s Trống ← a.mp3 lệch +180 ms", kind: "bad" }]);
  });
});

describe("QA chip", () => {
  it("counts the current checks, lists them and seeks with Tới", async () => {
    serve(QA);
    const seek = vi.fn();
    actions.transport = { ...idleTransport, seek };
    renderUi(<SectionHost hostId="topbar" />);
    const chip = await screen.findByTestId("qa-chip");
    expect(chip).toHaveTextContent("QA: 2 cảnh báo");
    fireEvent.click(chip);
    const panel = await screen.findByRole("dialog", { name: "Kết quả QA" });
    expect(panel).toHaveTextContent("qc-mp4 · demo-final.mp4");
    expect(panel).toHaveTextContent("SYNC");
    fireEvent.click(screen.getByRole("button", { name: "Tới 1:27.8 (FREEZE)" }));
    expect(seek).toHaveBeenCalledWith(87.77);
  });

  it("is hidden without QA.md and comes back when a job ends", async () => {
    let qa: string | null = null;
    const fetch = vi.fn(async () => (qa !== null ? new Response(qa, { status: 200 }) : new Response("", { status: 404 })));
    vi.stubGlobal("fetch", fetch);
    renderUi(<SectionHost hostId="topbar" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("qa-chip")).toBeNull();
    qa = "## qc-mp4 demo.mp4 2026-10-30 10:00\n\n- PASS FREEZE không có đoạn đứng hình ≥ 2s\n";
    const job = { id: "j1", kind: "qc", status: "done", code: 0, started: "2026-10-30T10:00:00Z" } as unknown as Job;
    applyJobEvent("demo", { type: "exit", job });
    expect(await screen.findByTestId("qa-chip")).toHaveTextContent("QA đạt");
  });

  it("words the counts", () => {
    expect(chipText({ fail: 2, warn: 31 })).toBe("QA: 2 lỗi, 31 cảnh báo");
    expect(chipText({ fail: 1, warn: 0 })).toBe("QA: 1 lỗi");
    expect(chipText({ fail: 0, warn: 0 })).toBe("QA đạt");
  });
});
