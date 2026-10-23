import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useStudio } from "@/store/studio.ts";
import { ExportMenu } from "./ExportMenu.tsx";
import { renderUi } from "./test-utils.tsx";

describe("ExportMenu", () => {
  it("has the three items; the two exports are off without a project", async () => {
    renderUi(<ExportMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất bản" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Xuất video", "Xuất bộ lớp dựng", "Cổng & tệp đã xuất…"]);
    expect(items[0]).toHaveAttribute("data-disabled");
    expect(items[1]).toHaveAttribute("title", expect.stringContaining("CapCut"));
    expect(screen.getByRole("separator")).toBeInTheDocument();
    await userEvent.click(items[2]);
    expect(useStudio.getState().dialog).toBe("export");
  });
});
