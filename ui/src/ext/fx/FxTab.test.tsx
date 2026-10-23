import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { FxTab } from "./FxTab.tsx";
import { useFx } from "./fx-store.ts";

const h = vi.hoisted(() => ({ apply: vi.fn(), say: vi.fn() }));
vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: h.say }));
vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), fxApplyTransition: h.apply }));

const NAME = "thuy-mau-demo";
// Shapes of GET /api/project, /api/fx/catalog and /api/media (lib/fx/catalog.mjs, routes/media.mjs).
const M = {
  version: 4, capabilities: { editable: true }, duration: 6, lines: [],
  shots: [{ id: "s1", name: "Lớp thuỷ màu mới", start: 0, duration: 3, assets: [] }, { id: "s3", name: "Kéo dài cảnh", start: 3, duration: 3, transition_in: "", assets: [] }],
};
const CATALOG = {
  items: [
    { id: "zoom-through", name: "Zoom-Through", source: "provider", sources: ["provider", "hyperframes"], kind: "camera", energy: [], soft: false, description: "Đẩy máy qua khung", doc: null, recipe: null, preview: null, pair_seam: "zoom-through" },
    { id: "impact-frame", name: "Khung va chạm anime", source: "studio", sources: ["studio"], kind: "native", energy: ["don-dap"], soft: false, description: "2–3 khung âm bản", doc: "/fx/impact-frame/recipe.md", recipe: "/fx/impact-frame/recipe.md", preview: "/api/fx/preview/impact-frame/", pair_seam: "impact-frame", duration: 0.1 },
    { id: "ink-wipe", name: "Ink Wipe", source: "hyperframes", sources: ["hyperframes"], kind: "css", energy: [], soft: true, description: "HyperFrames · wipe", doc: "/hf/ink.md", recipe: null, preview: null, pair_seam: null },
  ],
  counts: { provider: 1, studio: 1, hyperframes: 2 },
  banned: [],
};

function setup(sel: string | null, catalog: unknown = CATALOG) {
  mockFetch({
    "/api/projects": [{ name: NAME, has_manifest: true }],
    "/api/project": M,
    "/api/fx/catalog": catalog,
    "/api/media": [],
  });
  queryClient.setQueryData(keys.projects(), [{ name: NAME, has_manifest: true }]);
  queryClient.setQueryData(keys.project(NAME), M);
  useStudio.setState({ name: NAME, sel, pick: sel ? { kind: "shot", id: sel } : null });
  return renderUi(<FxTab />);
}

beforeEach(() => {
  useFx.setState(useFx.getInitialState(), true);
  h.apply.mockReset();
  h.say.mockReset();
});

describe("fx tab", () => {
  it("asks for a shot when none is selected", async () => {
    setup(null);
    expect(await screen.findByText("Chọn một shot trên timeline để áp chuyển cảnh")).toBeInTheDocument();
    expect(await screen.findByText("Sửa clip")).toBeInTheDocument();
  });

  it("shows the library of the selected shot with the catalog count", async () => {
    setup("s3");
    expect(await screen.findByText("Thư viện chuyển cảnh (3)")).toBeInTheDocument();
    expect(screen.getByText("Shot s3 đang dùng: (không)")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "HyperFrames (2)" })).toBeInTheDocument();
  });

  it("filters by text and source chip, and says when nothing matches", async () => {
    setup("s3");
    fireEvent.change(await screen.findByRole("searchbox", { name: "Tìm chuyển cảnh" }), { target: { value: "zoom" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Studio (1)" }));
    expect(screen.getByText("Không có chuyển cảnh nào khớp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio (1)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("previews a Studio pack in an iframe sandboxed to scripts only", async () => {
    setup("s3");
    fireEvent.click(await screen.findByRole("option", { name: /Khung va chạm anime/ }));
    const frame = screen.getByTitle("Xem thử impact-frame");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("native · Dồn dập · 0.1s")).toBeInTheDocument();
  });

  it("applies the picked transition to the selected shot", async () => {
    h.apply.mockResolvedValue({ status: 200, data: { message: "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" } });
    setup("s3");
    fireEvent.click(await screen.findByRole("option", { name: /Khung va chạm anime/ }));
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng cho shot" }));
    await waitFor(() => expect(h.apply).toHaveBeenCalledWith({ name: NAME, shot: "s3", id: "impact-frame", base: 4 }));
    await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đang chờ phiên Claude Code mở nhận việc (studio_request_next)"));
  });

  it("says when the catalog cannot be read", async () => {
    mockFetch({});
    queryClient.setQueryData(keys.projects(), [{ name: NAME, has_manifest: true }]);
    queryClient.setQueryData(keys.project(NAME), M);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const p = new URL(String(input), "http://studio.test").pathname;
      if (p === "/api/fx/catalog") return new Response(JSON.stringify({ error: "lỗi thử catalog" }), { status: 500 });
      if (p === "/api/projects") return new Response(JSON.stringify([{ name: NAME, has_manifest: true }]));
      return new Response("[]");
    }));
    useStudio.setState({ name: NAME, sel: "s3", pick: { kind: "shot", id: "s3" } });
    renderUi(<FxTab />);
    expect(await screen.findByText("Không đọc được thư viện: lỗi thử catalog")).toBeInTheDocument();
  });
});
