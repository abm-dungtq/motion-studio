import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { LIBRARY, libraryParams, promptExcerpt } from "@/core/library.ts";
import { useStudio } from "@/store/studio.ts";
import { LibraryTab } from "./LibraryTab.tsx";
import { useLibraryStore } from "./store.ts";

const direct = vi.hoisted(() => vi.fn(async () => true));
const say = vi.hoisted(() => vi.fn());
vi.mock("@/api/actions.ts", async (orig) => {
  const mod = await orig<typeof import("@/api/actions.ts")>();
  return { ...mod, actions: { ...mod.actions, direct } };
});
vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say }));

const VIDEO = {
  id: "2103273003555402193", title_vi: "Hoạt hình công thức cocktail Negroni từng bước", author: "Ror_Fly", url: "https://x.com/Ror_Fly/status/1",
  category: "explainer", featured: true, metrics: { bookmarks: 1400 }, has_thumb: true,
  vi: { what: "Một ly cocktail.", why: "Nhịp rõ.", how: "Chia bước." }, prompt: "Make a Negroni animation.",
};
const PAGE = {
  items: [VIDEO], total: 30, offset: 0,
  categories: [{ id: "explainer", vi: "Giải thích và dữ liệu" }],
  sources: [{ repo: "yihui-dev/awesome-opus5-5-videos", url: "https://github.com/yihui-dev/awesome-opus5-5-videos", license: "MIT License" }],
};
const NAME = "thuy-mau-demo";

function open(routes: Record<string, unknown>) {
  const fetch = mockFetch(routes);
  queryClient.setQueryData(keys.projects(), [{ name: NAME, title: NAME, has_manifest: true, editable: true, version: 1 }]);
  queryClient.setQueryData(keys.project(NAME), { version: 1, shots: [], lines: [] });
  useStudio.setState({ name: NAME });
  return fetch;
}

afterEach(() => { useLibraryStore.setState(useLibraryStore.getInitialState(), true); });

describe("core/library", () => {
  it("builds the director text and the page params as the old panel did", () => {
    expect(LIBRARY.videos.use(VIDEO)).toBe(`Lấy cảm hứng từ video mẫu "Hoạt hình công thức cocktail Negroni từng bước" (@Ror_Fly, https://x.com/Ror_Fly/status/1) cho dự án này. Học theo: Nhịp rõ. Chia bước. Giữ nội dung, lời và nhịp của dự án.${promptExcerpt(VIDEO.prompt)}`);
    expect(LIBRARY.styles.copy({ id: "s", what: "w" })).toBe("w");
    expect(libraryParams("scenes", "hud", 24, "explainer", true)).toEqual({ kind: "scenes", q: "hud", offset: "24" });
    expect(libraryParams("videos", "", 0, "explainer", true)).toEqual({ kind: "videos", q: "", offset: "0", cat: "explainer", featured: "1" });
  });
});

describe("LibraryTab", () => {
  it("shows the card, Dùng cho dự án sends use(row), Chép copies copy(row)", async () => {
    open({ "/api/library": PAGE });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderUi(<LibraryTab />);
    expect(await screen.findByText("30 mẫu")).toBeInTheDocument();
    expect(screen.getByText("@Ror_Fly · Giải thích và dữ liệu · Tuyển chọn · 1.4k lượt lưu")).toBeInTheDocument();
    expect(document.querySelector("img.lib-thumb")).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("link", { name: "Xem bản gốc" })).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Dùng cho dự án" }));
    expect(direct).toHaveBeenCalledWith({ scope: "project", text: LIBRARY.videos.use(VIDEO) });

    fireEvent.click(screen.getByRole("button", { name: "Chép prompt" }));
    expect(writeText).toHaveBeenCalledWith(LIBRARY.videos.copy(VIDEO));
    await waitFor(() => expect(say).toHaveBeenCalledWith("Đã chép vào bộ nhớ tạm"));
  });

  it("Xem thêm asks for the next offset; the last page ends with the sources", async () => {
    const fetch = open({ "/api/library": (u: URL) => (u.searchParams.get("offset") === "0" ? { ...PAGE, total: 2 } : { ...PAGE, items: [{ ...VIDEO, id: "2" }], offset: 1, total: 2 }) });
    renderUi(<LibraryTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem thêm (còn 1)" }));
    expect(await screen.findByText(/Prompt và video thuộc về tác giả gốc/)).toHaveTextContent("Nguồn: yihui-dev/awesome-opus5-5-videos (MIT). Prompt và video thuộc về tác giả gốc.");
    expect(fetch.mock.calls.map(([u]) => String(u))).toContain("/api/library?kind=videos&offset=1");
    expect(document.querySelectorAll('[data-lib-card="videos"]')).toHaveLength(2);
  });

  it("no match: the empty text with the query; without a project Dùng is off", async () => {
    mockFetch({ "/api/library": { ...PAGE, items: [], total: 0 } });
    useLibraryStore.setState({ query: "zzzqqxx" });
    renderUi(<LibraryTab />);
    expect(await screen.findByText("Không thấy video mẫu nào khớp \"zzzqqxx\". Thử từ khoá ngắn hơn, bỏ dấu, hoặc đổi loại mẫu.")).toBeInTheDocument();
    expect(screen.getByText("Chưa mở dự án: vẫn xem và chép prompt được. Mở một dự án để gửi mẫu cho đạo diễn.")).toBeInTheDocument();
  });

  it("Enter in the search box runs the search", async () => {
    const fetch = open({ "/api/library": PAGE });
    renderUi(<LibraryTab />);
    await screen.findByText("30 mẫu");
    const box = screen.getByRole("searchbox", { name: "Tìm trong thư viện mẫu" });
    fireEvent.change(box, { target: { value: " logo " } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(fetch.mock.calls.map(([u]) => String(u))).toContain("/api/library?kind=videos&q=logo&offset=0"));
  });
});
