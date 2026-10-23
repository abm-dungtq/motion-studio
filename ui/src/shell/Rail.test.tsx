import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrowLeftRight, LayoutGrid, Library, Mic, Music, Palette, Sparkles } from "lucide-react";
import { registerTab, type TabGroup } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { Rail } from "./Rail.tsx";
import { renderUi } from "./test-utils.tsx";

const C = () => null;
// The fixed rail of the plan: id, label, icon, group, order (registered shuffled on purpose).
const TABS: [string, string, typeof Mic, TabGroup, number][] = [
  ["library", "Thư viện mẫu", Library, "library", 10],
  ["music", "Nhạc & âm thanh", Music, "audio", 20],
  ["fx", "Chuyển cảnh & hiệu ứng", ArrowLeftRight, "assets", 40],
  ["voice", "Lời & giọng", Mic, "audio", 10],
  ["anime", "Anime", Sparkles, "assets", 30],
  ["media", "Chất liệu", LayoutGrid, "assets", 10],
  ["styles-code", "Phong cách", Palette, "assets", 20],
];
const ORDER = ["Chất liệu", "Phong cách", "Anime", "Chuyển cảnh & hiệu ứng", "Lời & giọng", "Nhạc & âm thanh", "Thư viện mẫu"];

function setup() {
  for (const [id, label, icon, group, order] of TABS) registerTab({ id, label, icon, group, order, component: C });
  useStudio.setState({ leftTab: "media" });
  return renderUi(<Rail />);
}

describe("Rail", () => {
  it("shows the seven tabs in the fixed order with a line between the three groups", () => {
    const { container } = setup();
    expect(screen.getAllByRole("tab").map((b) => b.getAttribute("aria-label"))).toEqual(ORDER);
    expect(container.querySelectorAll("[data-rail-sep]")).toHaveLength(2);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  });

  it("has a tooltip with the Alt shortcut", async () => {
    setup();
    fireEvent.focus(screen.getByRole("tab", { name: "Chất liệu" }));
    expect((await screen.findAllByText("Chất liệu (Alt+1)")).length).toBeGreaterThan(0);
  });

  it("Alt+Digit2 picks the second tab, not with Ctrl or in a field", () => {
    setup();
    fireEvent.keyDown(window, { code: "Digit2", key: "™", altKey: true });
    expect(useStudio.getState().leftTab).toBe("styles-code");
    fireEvent.keyDown(window, { code: "Digit3", altKey: true, ctrlKey: true });
    expect(useStudio.getState().leftTab).toBe("styles-code");
  });

  it("arrows, Home and End move along the rail; a click on the open tab reopens the panel", () => {
    setup();
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowDown" });
    expect(useStudio.getState().leftTab).toBe("styles-code");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(useStudio.getState().leftTab).toBe("library");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(useStudio.getState().leftTab).toBe("media");
    useStudio.getState().toggleLeft(false);
    fireEvent.click(screen.getByRole("tab", { name: "Chất liệu" }));
    expect(useStudio.getState().leftCollapsed).toBe(false);
  });

  it("puts a badge count in the label", () => {
    registerTab({ id: "media", label: "Chất liệu", icon: LayoutGrid, group: "assets", component: C, badge: () => 3 });
    renderUi(<Rail />);
    expect(screen.getByRole("tab", { name: "Chất liệu, 3 việc chờ bạn" })).toHaveTextContent("3");
  });
});
