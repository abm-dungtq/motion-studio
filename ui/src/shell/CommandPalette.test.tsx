import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { CommandPalette } from "./CommandPalette.tsx";

const manifest = {
  version: 3, fps: 30, lines: [], capabilities: { editable: false },
  shots: [{ id: "mo", start: 0, end: 4 }, { id: "giua", start: 4, end: 9 }, { id: "ket", start: 9, end: 12 }],
};

beforeEach(() => {
  queryClient.clear();
  useStudio.setState({ name: "demo", dialog: null });
  mockFetch({ "/api/projects": [{ name: "demo", title: "demo", has_manifest: true, editable: true, version: 3 }], "/api/notes": { notes: [] } });
  queryClient.setQueryData(Q.keys.project("demo"), manifest);
});
afterEach(() => vi.restoreAllMocks());

const cmdK = (target: Window | Element = window) => fireEvent.keyDown(target, { key: "k", code: "KeyK", metaKey: true });

describe("CommandPalette", () => {
  it("Cmd+K opens it; typing a shot and Enter selects that shot at its start", async () => {
    const select = vi.spyOn(actions, "select").mockImplementation(() => {});
    const seek = vi.spyOn(actions, "seek").mockImplementation(() => {});
    renderUi(<CommandPalette />);
    cmdK();
    const input = await screen.findByRole("combobox", { name: "Tìm lệnh" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "shot 2" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Tới shot 2 · giua"]);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByTestId("command-palette")).toBeNull());
    await waitFor(() => expect(select).toHaveBeenCalledWith("giua"));
    expect(seek).toHaveBeenCalledWith(4);
    cmdK();
    expect(await screen.findByRole("combobox", { name: "Tìm lệnh" })).toHaveValue("");
  });

  it("Escape closes it and gives the focus back", async () => {
    renderUi(<button type="button">trước</button>);
    renderUi(<CommandPalette />);
    const before = screen.getByRole("button", { name: "trước" });
    before.focus();
    cmdK(before);
    const input = await screen.findByRole("combobox", { name: "Tìm lệnh" });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("command-palette")).toBeNull());
    await waitFor(() => expect(before).toHaveFocus());
  });

  it("opens from inside a text field too", async () => {
    renderUi(<textarea aria-label="ghi" />);
    renderUi(<CommandPalette />);
    const area = screen.getByRole("textbox", { name: "ghi" });
    area.focus();
    cmdK(area);
    expect(await screen.findByRole("combobox", { name: "Tìm lệnh" })).toBeInTheDocument();
  });

  it("a command that cannot run is marked and Enter does nothing; no match says so", async () => {
    const undo = vi.spyOn(actions, "undo").mockResolvedValue();
    renderUi(<CommandPalette />);
    cmdK();
    const input = await screen.findByRole("combobox", { name: "Tìm lệnh" });
    fireEvent.change(input, { target: { value: "hoàn tác" } });
    expect(screen.getByRole("option", { name: /Hoàn tác/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "khong co gi" } });
    expect(screen.getByText("Không có lệnh nào khớp.")).toBeInTheDocument();
  });
});
