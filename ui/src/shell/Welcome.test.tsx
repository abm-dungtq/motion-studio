import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import { RECENT_STORE } from "@/core/recent.ts";
import { useStudio } from "@/store/studio.ts";
import { ProjectSelect } from "./ProjectSelect.tsx";
import { PROJECT_SELECT_ID } from "./states.tsx";
import { Welcome } from "./Welcome.tsx";

const projects = [
  { name: "a-02", title: "Video A hai", has_manifest: true, editable: true, version: 12 },
  { name: "cu", title: "cu", has_manifest: false, editable: false, version: null },
];

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  useStudio.setState({ name: null, dialog: null });
  mockFetch({ "/api/projects": projects, "/api/gates": { pass: false, fails: ["thiếu QA", "thiếu caption"], animatic: false } });
});

describe("Welcome", () => {
  it("shows the recent projects the server still lists, newest first, and opens one", async () => {
    window.localStorage.setItem(RECENT_STORE, JSON.stringify(["x", "a-02", "cu"]));
    const open = vi.spyOn(actions, "open").mockResolvedValue();
    renderUi(<Welcome />);
    expect(await screen.findByRole("heading", { name: "Mở lại dự án" })).toBeInTheDocument();
    const cards = await screen.findAllByTestId("recent-card");
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining("a-02"), expect.stringContaining("cu")]);
    expect(cards[0]).toHaveTextContent("Video A hai");
    expect(cards[0]).toHaveTextContent("v12");
    await waitFor(() => expect(cards[0]).toHaveTextContent("Chưa đủ cổng xuất (2)"));
    expect(cards[1]).toHaveTextContent("chưa có project.json");
    fireEvent.click(cards[0]!);
    expect(open).toHaveBeenCalledWith("a-02");
    open.mockRestore();
  });

  it("without recent projects says how to start; Dự án mới opens its dialog", async () => {
    renderUi(<Welcome />);
    expect(await screen.findByText("Bắt đầu bằng một dự án mới, hoặc chọn dự án có sẵn ở thanh trên cùng.")).toBeInTheDocument();
    expect(screen.queryByTestId("recent-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dự án mới" }));
    expect(useStudio.getState().dialog).toBe("new-project");
  });

  it("Mở dự án khác focuses the project picker and opens its list", async () => {
    renderUi(<div><ProjectSelect /><Welcome /></div>);
    fireEvent.click(await screen.findByRole("button", { name: "Mở dự án khác" }));
    const picker = document.getElementById(PROJECT_SELECT_ID)!;
    await waitFor(() => expect(picker).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByRole("option", { name: "a-02" })).toBeInTheDocument();
  });

  it("remembers a project once it is opened", async () => {
    queryClient.setQueryData(["/api/projects"], projects);
    await actions.open("cu");
    expect(JSON.parse(window.localStorage.getItem(RECENT_STORE) ?? "[]")).toEqual(["cu"]);
    await actions.open("khong-co");
    expect(JSON.parse(window.localStorage.getItem(RECENT_STORE) ?? "[]")).toEqual(["cu"]);
  });
});
