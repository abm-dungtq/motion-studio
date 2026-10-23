import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { say } from "@/api/client.ts";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { VersionSelect } from "./VersionSelect.tsx";
import { renderUi } from "./test-utils.tsx";

vi.mock("@/api/client.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client.ts")>()), say: vi.fn() }));

describe("VersionSelect", () => {
  it("is off without a project", () => {
    renderUi(<VersionSelect />);
    expect(screen.getByRole("combobox", { name: "Phiên bản" })).toBeDisabled();
  });

  it("lists versions newest first and only says how to go back", async () => {
    queryClient.setQueryData(keys.project("demo"), { version: 3, capabilities: { editable: true } });
    queryClient.setQueryData(keys.log("demo"), [{ v: 1, actor: "import" }, { v: 2, actor: "user" }, { v: 3, actor: "director" }]);
    useStudio.setState({ name: "demo" });
    renderUi(<VersionSelect />);
    const box = screen.getByRole("combobox", { name: "Phiên bản" });
    expect(box).toHaveTextContent("v3 · hiện tại");
    await userEvent.click(box);
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["v3 · hiện tại", "v2 · user", "v1 · import"]);
    await userEvent.click(options[1]);
    expect(say).toHaveBeenCalledWith("Danh sách chỉ để xem; quay lại bản trước bằng Hoàn tác");
    expect(screen.getByRole("combobox", { name: "Phiên bản" })).toHaveTextContent("v3 · hiện tại");
  });
});
