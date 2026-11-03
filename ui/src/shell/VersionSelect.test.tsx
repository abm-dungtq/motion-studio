import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { VersionSelect, versionLine, versionTime } from "./VersionSelect.tsx";
import { mockFetch, renderUi } from "./test-utils.tsx";

const AT = "2026-11-02T07:05:00.000Z";
const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(AT));

describe("VersionSelect", () => {
  it("is off without a project", () => {
    useStudio.setState({ name: null });
    renderUi(<VersionSelect />);
    expect(screen.getByRole("button", { name: "Lịch sử phiên bản" })).toBeDisabled();
  });

  it("opens a read-only history, newest first, with the time and how to go back", async () => {
    queryClient.setQueryData(keys.project("demo"), { version: 3, capabilities: { editable: true } });
    queryClient.setQueryData(keys.log("demo"), [{ v: 1, actor: "import" }, { v: 2, actor: "user", at: AT }, { v: 3, actor: "director", at: AT }]);
    useStudio.setState({ name: "demo" });
    renderUi(<VersionSelect />);
    const button = screen.getByRole("button", { name: "Lịch sử phiên bản" });
    expect(button).toHaveTextContent("v3");
    await userEvent.click(button);
    const list = await screen.findByRole("list", { name: "Các phiên bản" });
    expect(within(list).getAllByRole("listitem").map((o) => o.querySelector("[data-role=version-line]")?.textContent)).toEqual([
      `v3 · đạo diễn · ${time} · hiện tại`, `v2 · bạn sửa · ${time}`, "v1 · nhập từ dự án cũ",
    ]);
    expect(screen.getByText("Quay lại bản trước bằng nút Hoàn tác")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((x) => x.getAttribute("aria-label"))).toEqual(["So v2 với hiện tại", "So v1 với hiện tại"]);
  });

  it("compares an older version with the current one, read from .opus/versions", async () => {
    const now = { version: 12, shots: [{ id: "s1", start: 0, end: 2 }, { id: "s2", start: 2, end: 3 }], lines: [{ id: "vo-01", shot: "s1", start: 0, text: "mới" }] };
    const v10 = { version: 10, shots: [{ id: "s1", start: 0, end: 2 }], lines: [{ id: "vo-01", shot: "s1", start: 0, text: "cũ" }] };
    const fetch = mockFetch({ "/p/demo/.opus/versions/v10.json": v10 });
    queryClient.setQueryData(keys.projects(), [{ name: "demo", has_manifest: true, editable: true }]);
    queryClient.setQueryData(keys.project("demo"), now);
    queryClient.setQueryData(keys.log("demo"), [{ v: 10 }, { v: 11 }, { v: 12 }]);
    useStudio.setState({ name: "demo" });
    renderUi(<VersionSelect />);
    await userEvent.click(screen.getByRole("button", { name: "Lịch sử phiên bản" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "So v10 với hiện tại" }));
    const d = await screen.findByRole("dialog", { name: "So v10 với hiện tại" });
    expect(await within(d).findByText("Thêm shot 2")).toBeInTheDocument();
    expect(within(d).getByText("Câu vo-01: “cũ” → “mới”")).toBeInTheDocument();
    expect(fetch.mock.calls.map(([u]) => String(u))).toContain("/p/demo/.opus/versions/v10.json");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Lịch sử phiên bản" })).toHaveFocus();
  });

  it("says the version is gone when its file was cleaned up", async () => {
    mockFetch({});
    queryClient.setQueryData(keys.projects(), [{ name: "demo", has_manifest: true, editable: true }]);
    queryClient.setQueryData(keys.project("demo"), { version: 12, shots: [], lines: [] });
    queryClient.setQueryData(keys.log("demo"), [{ v: 10 }, { v: 12 }]);
    useStudio.setState({ name: "demo" });
    renderUi(<VersionSelect />);
    await userEvent.click(screen.getByRole("button", { name: "Lịch sử phiên bản" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "So v10 với hiện tại" }));
    expect(await screen.findByText("Không còn bản v10 để so.")).toBeInTheDocument();
  });

  it("writes the time as hour:minute day/month, and nothing without a time", () => {
    expect(versionTime(AT)).toMatch(/^\d\d:\d\d \d\d[-/]\d\d$/);
    expect(versionTime(undefined)).toBe("");
    expect(versionTime("not a date")).toBe("");
    expect(versionLine({ v: 12, actor: "director", at: AT }, false)).toBe(`v12 · đạo diễn · ${time}`);
  });
});
