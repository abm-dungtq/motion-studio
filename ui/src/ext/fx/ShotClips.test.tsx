import { renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { ShotClips } from "./ShotClips.tsx";

const M = {
  version: 4, capabilities: { editable: true }, lines: [],
  shots: [{ id: "s1", start: 0, duration: 2, assets: ["assets/a.png"] }, { id: "s3", start: 2, duration: 2, assets: ["footage/raw/3.mp4", "assets/b.png"] }],
} as unknown as Manifest;

describe("shot inspector fx section", () => {
  it("opens the fx tab from the button", () => {
    useStudio.setState({ name: "thuy-mau-demo", leftTab: "media", leftCollapsed: true });
    renderUi(<ShotClips pick={{ kind: "shot", id: "s1" }} m={M} />);
    expect(screen.queryByText("Sửa clip của shot")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mở thư viện chuyển cảnh" }));
    expect(useStudio.getState().leftTab).toBe("fx");
    expect(useStudio.getState().leftCollapsed).toBe(false);
  });

  it("edits the shot's own videos", () => {
    useStudio.setState({ name: "thuy-mau-demo" });
    renderUi(<ShotClips pick={{ kind: "shot", id: "s3" }} m={M} />);
    expect(screen.getByText("Sửa clip của shot")).toBeInTheDocument();
    const clip = screen.getByRole("combobox", { name: "Clip" });
    expect([...(clip as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["3.mp4"]);
  });
});
