import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { VersionSelect, versionLine, versionTime } from "./VersionSelect.tsx";
import { renderUi } from "./test-utils.tsx";

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
    expect(within(list).getAllByRole("listitem").map((o) => o.textContent)).toEqual([
      `v3 · đạo diễn · ${time} · hiện tại`, `v2 · bạn sửa · ${time}`, "v1 · nhập từ dự án cũ",
    ]);
    expect(screen.getByText("Quay lại bản trước bằng nút Hoàn tác")).toBeInTheDocument();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("writes the time as hour:minute day/month, and nothing without a time", () => {
    expect(versionTime(AT)).toMatch(/^\d\d:\d\d \d\d[-/]\d\d$/);
    expect(versionTime(undefined)).toBe("");
    expect(versionTime("not a date")).toBe("");
    expect(versionLine({ v: 12, actor: "director", at: AT }, false)).toBe(`v12 · đạo diễn · ${time}`);
  });
});
