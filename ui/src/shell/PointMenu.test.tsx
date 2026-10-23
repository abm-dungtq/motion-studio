import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { openPointMenu, PointMenuHost } from "./PointMenu.tsx";
import { renderUi } from "./test-utils.tsx";

describe("PointMenu", () => {
  it("opens at the point, runs the item once and closes", async () => {
    const run = vi.fn();
    const other = vi.fn();
    renderUi(<PointMenuHost />);
    act(() => openPointMenu(120, 80, [{ label: "Cắt tại đây", run }, null, { label: "Khác", run: other, disabled: true }]));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Cắt tại đây", "Khác"]);
    await userEvent.click(items[0]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("focuses the first item, runs it on Enter, wraps ↑ and closes on Tab", async () => {
    const first = vi.fn();
    renderUi(<PointMenuHost />);
    act(() => openPointMenu(10, 10, [{ label: "Chọn câu", run: first }, { label: "Xoá" }]));
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(first).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    act(() => openPointMenu(10, 10, [{ label: "Chọn câu", run: first }]));
    await screen.findByRole("menuitem");
    await userEvent.keyboard("{Tab}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(first).toHaveBeenCalledTimes(1);
  });
});
