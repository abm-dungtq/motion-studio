import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Exported, exportRows } from "./Exported.tsx";
import { GateFails } from "./GateFails.tsx";
import { Jobs } from "./Jobs.tsx";

const cancelJob = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/api/actions.ts", async (orig) => {
  const mod = await orig<typeof import("@/api/actions.ts")>();
  return { ...mod, actions: { ...mod.actions, cancelJob } };
});

const NAME = "thuy-mau-demo";
const M = { version: 3, shots: [], lines: [], capabilities: { editable: true } };

function open(routes: Record<string, unknown> = {}) {
  mockFetch({ "/api/files": [], "/api/jobs": [], "/api/gates": { pass: true, fails: [] }, ...routes });
  queryClient.setQueryData(keys.projects(), [{ name: NAME, title: NAME, has_manifest: true, editable: true, version: 3 }]);
  queryClient.setQueryData(keys.project(NAME), M);
  useStudio.setState({ name: NAME });
}

describe("GateFails", () => {
  it("an animatic gate asks to review the animatic, with each FAIL line", () => {
    open();
    queryClient.setQueryData(keys.gates(NAME), { pass: false, fails: ["animatic demo/animatic.mp4 is older than PLAN.md", "SYNC 0.2s lệch"], animatic: true });
    renderUi(<GateFails />);
    expect(screen.getByRole("heading", { name: "Cần duyệt lại animatic" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["animatic demo/animatic.mp4 is older than PLAN.md", "SYNC 0.2s lệch"]);
  });

  it("another gate says the export gates are not met", () => {
    open();
    queryClient.setQueryData(keys.gates(NAME), { pass: false, fails: ["thiếu giọng"], animatic: false });
    renderUi(<GateFails />);
    expect(screen.getByRole("heading", { name: "Chưa đủ cổng xuất" })).toBeInTheDocument();
    expect(screen.getByText("thiếu giọng")).toBeInTheDocument();
  });

  it("without a project says what to do first", () => {
    mockFetch({});
    renderUi(<GateFails />);
    expect(screen.getByText("Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu.")).toBeInTheDocument();
  });
});

describe("Jobs", () => {
  it("Dừng cancels the running job by id; the log shows its lines", () => {
    open();
    queryClient.setQueryData(keys.jobs(NAME), [
      { id: "j1", name: NAME, kind: "export", status: "done", code: 0, started: "2026-10-23T04:00:00Z", meta: { step: "compress" } },
      { id: "j2", name: NAME, kind: "export", status: "running", code: null, started: "2026-10-23T04:01:00Z", meta: { step: "bundle" } },
    ]);
    queryClient.setQueryData(keys.jobLogs(NAME), { j2: ["render 1/3", "render 2/3"] });
    renderUi(<Jobs />);
    expect(screen.getByText("Xuất video · bộ lớp dựng")).toBeInTheDocument();
    expect(screen.getByText("exit 0")).toBeInTheDocument();
    expect(document.querySelector('[data-job="j2"] pre')?.textContent).toBe("render 1/3\nrender 2/3");
    const stops = screen.getAllByRole("button", { name: "Dừng" });
    expect(stops).toHaveLength(1);
    fireEvent.click(stops[0]);
    expect(cancelJob).toHaveBeenCalledWith("j2");
  });

  it("no job: the empty text", () => {
    open();
    queryClient.setQueryData(keys.jobs(NAME), []);
    renderUi(<Jobs />);
    expect(screen.getByText("Không có việc nào đang chạy. Bấm Xuất video để render bản giao.")).toBeInTheDocument();
  });
});

describe("Exported", () => {
  const files = [
    { path: "renders/a-bundle/shots/s1.mp4", size: 1048576 },
    { path: "renders/a-bundle/shots/s2.mp4", size: 1048576 },
    { path: "renders/a-bundle/manifest.json", size: 0 },
    { path: "renders/demo-final.mp4", size: 3145728 },
  ];

  it("two MP4s in one bundle folder make one row", () => {
    const rows = exportRows(NAME, files);
    expect(rows.map((r) => r.label)).toEqual(["a-bundle/", "demo-final.mp4"]);
    expect(rows[0]).toMatchObject({ href: `/p/${NAME}/renders/a-bundle/manifest.json`, size: 2097152 });
  });

  it("lists the rows with their size, or the empty text", async () => {
    open({ "/api/files": files });
    const { unmount } = renderUi(<Exported />);
    expect(await screen.findByRole("link", { name: "a-bundle/" })).toHaveAttribute("title", "manifest.json của bộ lớp dựng");
    expect(screen.getByRole("link", { name: "demo-final.mp4" })).toHaveAttribute("href", `/p/${NAME}/renders/demo-final.mp4`);
    expect(screen.getByText("3.0 MB")).toBeInTheDocument();
    unmount();
    queryClient.clear();
    open({ "/api/files": [] });
    renderUi(<Exported />);
    expect(await screen.findByText("Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong.")).toBeInTheDocument();
  });
});
