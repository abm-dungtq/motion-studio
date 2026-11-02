import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { ExportMenu } from "./ExportMenu.tsx";
import { renderUi } from "./test-utils.tsx";

describe("ExportMenu", () => {
  it("is off without a project", () => {
    useStudio.setState({ name: null });
    renderUi(<ExportMenu />);
    expect(screen.getByRole("button", { name: "Xuất" })).toBeDisabled();
  });

  it("has the three items with a project", async () => {
    queryClient.setQueryData(keys.project("demo"), { version: 3, capabilities: { editable: true } });
    useStudio.setState({ name: "demo", dialog: null });
    renderUi(<ExportMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Xuất video", "Xuất bộ lớp dựng", "Cổng & file đã xuất…"]);
    expect(items[0]).not.toHaveAttribute("data-disabled");
    expect(items[1]).toHaveAttribute("title", expect.stringContaining("CapCut"));
    expect(screen.getByRole("separator")).toBeInTheDocument();
    await userEvent.click(items[2]);
    expect(useStudio.getState().dialog).toBe("export");
  });
});
