import { answerConfirm, mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

import { queryClient, say } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { Job } from "@/api/types.ts";
import type { VgItem, VgStatus } from "@/ext/videogen/api.ts";
import { useStudio } from "@/store/studio.ts";
import { JobTray } from "./JobTray.tsx";

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const STATUS: VgStatus = { bin: "/x/gflow", found: true, version: "1", tested: true, profile: "p", today: 3, cap: 20, images_today: 1, image_cap: 30, waf_until: null, job: null };
const EXPORT: Job = { id: "e1", name: "demo", kind: "export", meta: { step: "render" }, status: "running", code: null, started: ago(75) };
const FLOW: VgItem = { id: "v1", shot: "s2", state: "running", phase: "sent", charge: null, error: null, files: [], prompt_head: "", created: ago(30), updated: ago(1), version: null };

function routes(o: { jobs?: Job[]; items?: VgItem[]; status?: Partial<VgStatus> } = {}) {
  return mockFetch({
    "/api/projects": [{ name: "demo", title: "Demo", has_manifest: true, editable: true, version: 1 }],
    "/api/jobs": o.jobs ?? [],
    "/api/videogen/status": { ...STATUS, ...o.status },
    "/api/videogen/items": { items: o.items ?? [] },
    "/api/jobs/cancel": { ok: true },
    "/api/videogen/cancel": { ok: true },
  });
}
const chip = () => screen.getByTestId("tray-chip");
const openTray = async () => { fireEvent.click(chip()); return screen.findByRole("dialog", { name: "Việc của dự án" }); };

beforeEach(() => {
  queryClient.clear();
  vi.mocked(say).mockClear();
  useStudio.setState({ name: "demo", trayOpen: false, dialog: null });
});

describe("JobTray", () => {
  it("is hidden without a project", () => {
    routes();
    useStudio.setState({ name: null });
    renderUi(<JobTray />);
    expect(screen.queryByTestId("tray-chip")).toBeNull();
  });

  it("counts a running export and a Flow run, says the Flow phase and warns near the cap", async () => {
    routes({ jobs: [EXPORT], items: [FLOW], status: { today: 19, cap: 20, job: { id: "j", name: "demo" } } });
    renderUi(<JobTray />);
    await waitFor(() => expect(chip()).toHaveTextContent("Đang chạy 2"));
    expect(chip()).toHaveAttribute("aria-haspopup", "dialog");
    const tray = await openTray();
    expect(useStudio.getState().trayOpen).toBe(true);
    expect(within(tray).getByText("Xuất video · đang render")).toBeInTheDocument();
    expect(within(tray).getByText(/Đã gửi, đã tính lượt · 0:\d\d · đang chạy/)).toBeInTheDocument();
    expect(within(tray).getByTestId("tray-cost")).toHaveTextContent("Flow hôm nay: 19/20 clip · 1/30 ảnh · sắp hết lượt");
    expect(within(tray).getByTestId("tray-cost")).toHaveClass("text-warn");
  });

  it("reads Việc when nothing runs, with no warning and the WAF block time", async () => {
    routes({ status: { waf_until: new Date(Date.now() + 3600_000).toISOString() } });
    renderUi(<JobTray />);
    await waitFor(() => expect(chip()).toHaveTextContent("Việc"));
    const tray = await openTray();
    const cost = await within(tray).findByTestId("tray-cost");
    expect(cost).not.toHaveTextContent("sắp hết lượt");
    expect(cost).toHaveTextContent(/Flow tạm chặn tới \d\d:\d\d/);
    expect(within(tray).getByText("Không có việc nào đang chạy hay vừa xong.")).toBeInTheDocument();
  });

  it("cancels a job straight away", async () => {
    const fetch = routes({ jobs: [{ ...EXPORT, kind: "timing", meta: null }] });
    renderUi(<JobTray />);
    const tray = await openTray();
    fireEvent.click(await within(tray).findByRole("button", { name: "Huỷ Ghi mốc thời gian" }));
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/jobs/cancel"))).toBe(true));
    const call = fetch.mock.calls.find(([u]) => String(u).includes("/api/jobs/cancel"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ name: "demo", id: "e1" });
  });

  it("asks before stopping a Flow run and says it was charged", async () => {
    const fetch = routes({ items: [FLOW], status: { job: { id: "j", name: "demo" } } });
    renderUi(<JobTray />);
    const tray = await openTray();
    fireEvent.click(await within(tray).findByRole("button", { name: "Huỷ Tạo clip bằng Flow · Shot s2" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Việc của dự án" })).toBeNull());
    expect(await answerConfirm(true)).toContain("vẫn tính credit");
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/videogen/cancel"))).toBe(true));
  });

  it("opens the export dialog from a finished export", async () => {
    routes({ jobs: [{ ...EXPORT, meta: { step: "compress" }, status: "done", code: 0, ended: ago(5) }] });
    renderUi(<JobTray />);
    const tray = await openTray();
    fireEvent.click(await within(tray).findByRole("button", { name: "Mở hộp Xuất" }));
    expect(useStudio.getState().dialog).toBe("export");
    expect(useStudio.getState().trayOpen).toBe(false);
  });

  it("says when a job ends, but leaves exports to the job events", async () => {
    const timing: Job = { ...EXPORT, id: "t1", kind: "timing", meta: null };
    routes({ jobs: [timing, EXPORT] });
    renderUi(<JobTray />);
    await waitFor(() => expect(chip()).toHaveTextContent("Đang chạy 2"));
    act(() => {
      queryClient.setQueryData(keys.jobs("demo"), [
        { ...timing, status: "done", code: 0, ended: ago(0) },
        { ...EXPORT, status: "failed", code: 1, ended: ago(0) },
      ]);
    });
    await waitFor(() => expect(chip()).toHaveTextContent("Việc"));
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith("Ghi mốc thời gian: xong", false);
  });
});
