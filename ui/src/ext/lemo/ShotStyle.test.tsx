import { answerConfirm, mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lemoApply } from "@/api/queries.ts";
import { createStudio, getInspectorSections, getSections, getTabs } from "@/ext/registry.ts";
import { InspectorHost } from "@/shell/InspectorHost.tsx";
import { useStudio } from "@/store/studio.ts";
import { LIBRARY, MANIFEST, MINE, NAME, PROFILES, PROJECTS, stylesRoute } from "./fixtures.ts";
import { LEAD, register } from "./index.ts";
import { useLemo } from "./store.ts";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));
vi.mock("@/api/queries.ts", async (orig) => ({
  ...(await orig<typeof import("@/api/queries.ts")>()),
  lemoApply: vi.fn(), lemoFetch: vi.fn(), lemoDraft: vi.fn(), lemoKeep: vi.fn(),
}));

beforeEach(() => {
  useLemo.setState(useLemo.getInitialState(), true);
  vi.mocked(lemoApply).mockReset();
  register(createStudio());
});

function pickShot(id: string, over: Parameters<typeof stylesRoute>[0] = {}) {
  mockFetch({ "/api/projects": PROJECTS, "/api/project": MANIFEST, "/api/lemo/styles": stylesRoute(over) });
  useStudio.setState({ name: NAME });
  useStudio.getState().setPick("shot", id, MANIFEST);
  renderUi(<InspectorHost />);
}

describe("register", () => {
  it("adds the Phong cách tab and the shot section; the own styles are part of the tab", () => {
    const tab = getTabs().find((t) => t.id === "styles-code");
    expect(tab).toMatchObject({ label: "Phong cách", group: "assets", order: 20, lead: LEAD });
    expect(getSections("styles-code").map((s) => [s.id, s.order])).toEqual([]);
    expect(getInspectorSections("shot").map((s) => s.id)).toContain("lemo");
    expect(getInspectorSections("line").map((s) => s.id)).not.toContain("lemo");
  });
});

describe("ShotStyle", () => {
  it("shows Phong cách for a picked shot, with the project's and the shot's style", async () => {
    pickShot("s2", { project: { vertical: false, draft: null, project: { slug: "watercolor", mode: "layer" }, shots: { s2: { slug: "ukiyo-e", mode: "grammar" } } } });
    expect(await screen.findByRole("heading", { name: "Phong cách" })).toBeInTheDocument();
    expect(await screen.findByText("Dự án: Thuỷ màu (lớp canvas)")).toBeInTheDocument();
    expect(screen.getByText("Shot s2: Tranh khắc gỗ (tham khảo STYLE.md)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Phong cách cho shot này" }));
    const names = screen.getAllByRole("option").map((o) => [...o.querySelectorAll("span")].map((x) => x.textContent).join(" · "));
    expect(names).toEqual(["Thuỷ màu · lớp canvas", "Tranh khắc gỗ · tham khảo", "Bàn tin tức · tham khảo"]);
  });

  it("groups the styles by source and narrows a long list by search", async () => {
    const extra = Array.from({ length: 8 }, (_, i) => ({ ...LIBRARY[2]!, slug: `x${i}`, ten: `Kiểu ${i}` }));
    pickShot("s2", { rows: [...MINE, ...PROFILES, ...LIBRARY, ...extra] as never });
    await userEvent.click(await screen.findByText("Áp phong cách cho shot này"));
    fireEvent.click(screen.getByRole("combobox", { name: "Phong cách cho shot này" }));
    expect(within(screen.getByRole("listbox")).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Của bạn", "Dựng sẵn", "lemo"]);
    const all = screen.getAllByRole("option").length;
    expect(all).toBe(13);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "truyen tranh" } });
    expect(screen.getAllByRole("option").length).toBeLessThan(all);
    expect(screen.getByRole("option", { name: /Truyện tranh đa vũ trụ/ })).toBeInTheDocument();
  });

  it("applies the chosen style to the shot after the question", async () => {
    pickShot("s2");
    expect(await screen.findByText("Dự án chưa áp phong cách nào.")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Áp phong cách cho shot này"));
    await userEvent.click(screen.getByRole("combobox", { name: "Phong cách cho shot này" }));
    await userEvent.click(screen.getByRole("option", { name: /Bàn tin tức/ }));
    vi.mocked(lemoApply).mockResolvedValue({ status: 200, data: { runner: "mcp" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Áp" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Áp" }));
    expect(await answerConfirm(true)).toBe('Áp "Bàn tin tức" cho shot s2: nhờ đạo diễn dựng theo ngữ pháp của STYLE.md (BRIEF.md giữ nguyên)?');
    expect(lemoApply).toHaveBeenCalledWith({ name: NAME, slug: "news-desk", source: "library", mode: "grammar", shot: "s2" });
  });

  it("is not there for a line", async () => {
    mockFetch({ "/api/projects": PROJECTS, "/api/project": MANIFEST, "/api/lemo/styles": stylesRoute() });
    useStudio.setState({ name: NAME, pick: { kind: "line", id: "l1" } });
    renderUi(<InspectorHost />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("lemo-shot")).toBeNull();
  });
});
