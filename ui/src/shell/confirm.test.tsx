import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeConfirm } from "./confirm.tsx";
import { renderUi } from "./test-utils.tsx";

describe("in-page confirm", () => {
  it("names its buttons after the action and resolves true on it", async () => {
    const { ask, ConfirmHost } = makeConfirm();
    renderUi(<ConfirmHost />);
    let p!: Promise<boolean>;
    act(() => { p = ask("Tạo clip 8s?", { ok: "Tạo clip" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Tạo clip" }));
    await expect(p).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps Đồng ý / Huỷ by default; Huỷ resolves false", async () => {
    const { ask, ConfirmHost } = makeConfirm();
    renderUi(<ConfirmHost />);
    let p!: Promise<boolean>;
    act(() => { p = ask("Tiếp tục?"); });
    expect(await screen.findByRole("button", { name: "Đồng ý" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    await expect(p).resolves.toBe(false);
  });

  it("paints a danger action red and can rename the cancel button", async () => {
    const { ask, ConfirmHost } = makeConfirm();
    renderUi(<ConfirmHost />);
    act(() => { void ask("Xoá stack a?", { ok: "Xoá", cancel: "Giữ lại", danger: true }); });
    expect(await screen.findByRole("button", { name: "Xoá" })).toHaveClass("bg-danger-fill");
    expect(screen.getByRole("button", { name: "Giữ lại" })).toBeInTheDocument();
  });
});
