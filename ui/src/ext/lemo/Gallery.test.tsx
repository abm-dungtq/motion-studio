import { answerConfirm, chooseCombo, comboOption, comboOptions, mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { say } from "@/api/client.ts";
import { lemoApply, lemoFetch } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { LIBRARY, MANIFEST, NAME, PROFILES, PROJECTS, stylesRoute } from "./fixtures.ts";
import { Gallery } from "./Gallery.tsx";
import { useLemo } from "./store.ts";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));
vi.mock("@/api/queries.ts", async (orig) => ({
  ...(await orig<typeof import("@/api/queries.ts")>()),
  lemoApply: vi.fn(), lemoFetch: vi.fn(), lemoDraft: vi.fn(), lemoKeep: vi.fn(),
}));

const titles = () => screen.queryAllByTestId("lemo-card").map((c) => c.querySelector("strong")?.textContent);

function setup(styles: ReturnType<typeof stylesRoute> | ((u: URL) => unknown) = stylesRoute(), extra: Record<string, unknown> = {}) {
  const fetch = mockFetch({ "/api/projects": PROJECTS, "/api/project": MANIFEST, "/api/lemo/styles": styles, ...extra });
  useStudio.setState({ name: NAME });
  renderUi(<Gallery />);
  return fetch;
}

beforeEach(() => {
  useLemo.setState(useLemo.getInitialState(), true);
  vi.mocked(say).mockReset();
  vi.mocked(lemoApply).mockReset();
  vi.mocked(lemoFetch).mockReset();
});

describe("Gallery", () => {
  it("lists every style with its count, group filter and the LemoLab credit", async () => {
    setup();
    await waitFor(() => expect(titles()).toEqual(LIBRARY.map((r) => r.ten)));
    expect(screen.getByTestId("lemo-count")).toHaveTextContent("3 / 3 phong cách");
    expect(screen.getByPlaceholderText("Tìm: truyện tranh, thuỷ màu, tin tức…")).toBeInTheDocument();
    expect(comboOptions("Nhóm phong cách")).toEqual(["Mọi nhóm (3)", "Hội hoạ (1)", "Truyền thống Đông Á (1)", "Tin tức (1)", "Chưa phân nhóm (0)"]);
    expect(comboOption("Nhóm phong cách", "Chưa phân nhóm (0)")).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.getByTestId("lemo-filters")).toHaveClass("sticky");
    expect(screen.getByTestId("lemo-count")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("lemo-credit")).toHaveTextContent("Ảnh và phim mẫu: LemoLab, CC BY 4.0, github.com/lemomo-ai/lemo-opuscar. Mã và tài liệu: MIT.");
    expect(screen.getAllByRole("link", { name: "Xem phim mẫu ↗" })).toHaveLength(3);
    const first = screen.getAllByTestId("lemo-card")[0];
    expect(within(first).getByText("Lớp canvas")).toBeInTheDocument();
    await waitFor(() => expect(within(first).getByRole("button", { name: "Áp Thuỷ màu cho dự án" })).toBeEnabled());
  });

  it("Phong cách riêng sits above the grid", async () => {
    setup();
    const mine = await screen.findByTestId("lemo-mine");
    const grid = await screen.findByTestId("lemo-grid");
    expect(mine.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the source filter keeps ready-made, lemo or own styles, and the group counts follow it", async () => {
    setup(stylesRoute({ withProfiles: true }));
    await waitFor(() => expect(titles()).toHaveLength(4));
    const groupNames = () => comboOptions("Nhóm phong cách");
    expect(comboOptions("Nguồn phong cách")).toEqual(["Mọi nguồn (4)", "Dựng sẵn (1)", "lemo (3)", "Của bạn (0)"]);
    expect(groupNames()).toContain("Chưa phân nhóm (1)");
    chooseCombo("Nguồn phong cách", "Dựng sẵn (1)");
    await waitFor(() => expect(titles()).toEqual(["Truyện tranh đa vũ trụ"]));
    expect(groupNames()).toEqual(["Mọi nhóm (1)", "Hội hoạ (0)", "Truyền thống Đông Á (0)", "Tin tức (0)", "Chưa phân nhóm (1)"]);
    expect(window.location.search).toContain("source=profile");
    chooseCombo("Nguồn phong cách", "lemo (3)");
    await waitFor(() => expect(titles()).toEqual(LIBRARY.map((r) => r.ten)));
    chooseCombo("Nguồn phong cách", "Mọi nguồn (4)");
    expect(window.location.search).not.toContain("source=");
  });

  it("Của bạn with no own style says so and offers to make one", async () => {
    setup();
    await waitFor(() => expect(titles()).toHaveLength(3));
    useLemo.getState().setSource("mine");
    expect(await screen.findByText("Bạn chưa có phong cách riêng.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tạo phong cách riêng" }));
    expect(screen.getByTestId("lemo-mine").querySelector("details")).toHaveProperty("open", true);
    useLemo.getState().setSource("");
  });

  it("search narrows the cards after the debounce and keeps the focus", async () => {
    const fetch = setup();
    await waitFor(() => expect(titles()).toHaveLength(3));
    const box = screen.getByLabelText("Tìm phong cách code");
    await userEvent.type(box, "thuỷ");
    await waitFor(() => expect(titles()).toEqual(["Thuỷ màu"]));
    expect(box).toHaveFocus();
    expect(screen.getByTestId("lemo-count")).toHaveTextContent("1 / 3 phong cách");
    const asked = fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/lemo/styles"));
    expect(asked.at(-1)).toContain(`q=${encodeURIComponent("thuỷ")}`);
    expect(asked.some((u) => u.includes("q=th&") || u.endsWith("q=th"))).toBe(false);
  });

  it("the group filter narrows the cards", async () => {
    setup();
    await waitFor(() => expect(titles()).toHaveLength(3));
    chooseCombo("Nhóm phong cách", "Truyền thống Đông Á (1)");
    await waitFor(() => expect(titles()).toEqual(["Tranh khắc gỗ"]));
  });

  it("a search with no match says so", async () => {
    setup();
    await waitFor(() => expect(titles()).toHaveLength(3));
    await userEvent.type(screen.getByLabelText("Tìm phong cách code"), "zzzzqq");
    expect(await screen.findByText('Không có phong cách nào khớp "zzzzqq". Thử từ khoá ngắn hơn, bỏ dấu hoặc đổi bộ lọc.')).toBeInTheDocument();
  });

  it("own styles, then the ready-made profiles, then the lemo-opuscar library, each with a head and its count", async () => {
    setup(stylesRoute({ mine: true, withProfiles: true }));
    await waitFor(() => expect(titles()).toHaveLength(5));
    const heads = [...screen.getByTestId("lemo-grid").querySelectorAll("h3")].map((h) => h.textContent);
    expect(heads).toEqual(["Của bạn (1)", "Dựng sẵn (1)", "Thư viện lemo-opuscar (3)"]);
    expect(titles()).toEqual(["Mực của tôi", "Truyện tranh đa vũ trụ", ...LIBRARY.map((r) => r.ten)]);
    expect(screen.getByTestId("lemo-section-library")).toHaveTextContent("phim mẫu là phim 16:9 không lời");
  });

  it("tags say what can be built as is and what is only a reference", async () => {
    setup(stylesRoute({ withProfiles: true }));
    await waitFor(() => expect(titles()).toHaveLength(4));
    const tags = screen.getAllByTestId("lemo-card").map((c) => c.querySelector("span[title]")?.textContent);
    expect(tags).toEqual(["Dựng sẵn", "Lớp canvas", "Tham khảo", "Tham khảo"]);
  });

  it("a profile: Xem hồ sơ shows its text, and apply writes style_profile after the question", async () => {
    setup(stylesRoute({ withProfiles: true }), { "/api/lemo/guide": { slug: "comic-multiverse", source: "profile", text: "comic-multiverse — Truyện tranh đa vũ trụ" } });
    await waitFor(() => expect(titles()).toHaveLength(4));
    const card = screen.getAllByTestId("lemo-card")[0];
    expect(within(card).queryByRole("button", { name: "Đọc STYLE.md" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Xem hồ sơ" }));
    expect((await screen.findByTestId("lemo-guide")).textContent).toBe("comic-multiverse — Truyện tranh đa vũ trụ");
    expect(screen.queryByText(/Văn bản của bên thứ ba/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    vi.mocked(lemoApply).mockResolvedValue({ status: 200, data: { runner: "cli" } });
    const apply = within(card).getByRole("button", { name: "Áp Truyện tranh đa vũ trụ cho dự án" });
    await waitFor(() => expect(apply).toBeEnabled());
    await userEvent.click(apply);
    expect(screen.getByRole("button", { name: "Áp và dựng lại 2 shot" })).toBeInTheDocument();
    expect(await answerConfirm(true)).toBe('Áp "Truyện tranh đa vũ trụ" cho cả dự án: ghi style_profile vào BRIEF.md và nhờ đạo diễn dựng lại theo phong cách dựng sẵn?');
    await waitFor(() => expect(lemoApply).toHaveBeenCalledWith({ name: NAME, slug: PROFILES[0].slug, source: "profile", mode: "profile", shot: null }));
  });

  it("STYLE.md is shown as text: a <script> in it stays text and adds no script element", async () => {
    const evil = "# Style\n<script>x</script>\n<img src=x onerror=alert(1)>";
    setup(stylesRoute(), { "/api/lemo/guide": { slug: "watercolor", source: "library", text: evil } });
    await waitFor(() => expect(titles()).toHaveLength(3));
    const scripts = document.querySelectorAll("script").length;
    await userEvent.click(screen.getAllByRole("button", { name: "Đọc STYLE.md" })[0]);
    const pre = await screen.findByTestId("lemo-guide");
    expect(pre.textContent).toBe(evil);
    expect(pre.children).toHaveLength(0);
    expect(document.querySelectorAll("script")).toHaveLength(scripts);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText("STYLE.md · Thuỷ màu")).toBeInTheDocument();
    expect(screen.getByText("Văn bản của bên thứ ba (MIT). Chỉ học ngữ pháp hình ảnh, không chép câu chuyện phim mẫu.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByTestId("lemo-guide")).toBeNull());
  });

  it("apply to the project: Huỷ sends nothing", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Áp .+ cho dự án$/ })[0]).toBeEnabled());
    const native = vi.spyOn(window, "confirm");
    await userEvent.click(screen.getAllByRole("button", { name: /^Áp .+ cho dự án$/ })[1]);
    expect(await answerConfirm(false)).toBe('Áp "Tranh khắc gỗ" cho cả dự án: nhờ đạo diễn dựng theo ngữ pháp của STYLE.md (BRIEF.md giữ nguyên)?');
    expect(lemoApply).not.toHaveBeenCalled();
    expect(native).not.toHaveBeenCalled();
  });

  it("apply a canvas layer: 409 exists asks to replace, then says it was applied", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Áp .+ cho dự án$/ })[0]).toBeEnabled());
    vi.mocked(lemoApply)
      .mockResolvedValueOnce({ status: 409, error: "đã có lớp", data: { code: "exists" } })
      .mockResolvedValueOnce({ status: 200, data: { runner: "mcp" } });
    await userEvent.click(screen.getAllByRole("button", { name: /^Áp .+ cho dự án$/ })[0]);
    const asked = [await answerConfirm(true), await answerConfirm(true)];
    await waitFor(() => expect(lemoApply).toHaveBeenCalledTimes(2));
    expect(vi.mocked(lemoApply).mock.calls[0][0]).toEqual({ name: NAME, slug: "watercolor", source: "library", mode: "layer", shot: null });
    expect(vi.mocked(lemoApply).mock.calls[1][0]).toMatchObject({ slug: "watercolor", mode: "layer", replace: true });
    expect(asked).toEqual([
      'Áp "Thuỷ màu" cho cả dự án: thêm lớp canvas (sửa index.html, ghi lemo_style vào BRIEF.md)?',
      "Dự án đã có một lớp canvas. Thay lớp cũ bằng phong cách này? (scene đã viết được giữ)",
    ]);
    await waitFor(() => expect(say).toHaveBeenCalledWith('Đã áp "Thuỷ màu" cho cả dự án; đã gửi yêu cầu cho đạo diễn (chờ phiên Claude Code nhận việc)'));
  });

  it("marks the style the project uses", async () => {
    setup(stylesRoute({ project: { vertical: false, draft: null, project: { slug: "ukiyo-e", mode: "grammar" } } }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(screen.getByText("Đang dùng cho dự án (tham khảo STYLE.md)")).toBeInTheDocument();
  });

  it("without the library: the profiles are there, and the download button polls until the library is", async () => {
    let fetched = false;
    setup((u) => ({ ...stylesRoute()(u), fetched, rows: fetched ? LIBRARY : PROFILES }));
    const btn = await screen.findByRole("button", { name: "Tải thư viện (≈ 5 MB)" });
    expect(screen.getByText(/Thư viện lemo-opuscar \(59 phong cách phim dựng bằng code, phần lớn để tham khảo\) chưa có trên máy/)).toBeInTheDocument();
    expect(titles()).toEqual(["Truyện tranh đa vũ trụ"]);
    vi.mocked(lemoFetch).mockImplementation(async () => { fetched = true; return { status: 200, data: { ok: true } }; });
    await userEvent.click(btn);
    expect(lemoFetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(titles()).toHaveLength(3));
  });

  it("warnings while reading the library fold into a details", async () => {
    setup(stylesRoute({ warnings: ["a hỏng", "b hỏng"] }));
    expect(await screen.findByText("2 cảnh báo khi đọc thư viện")).toBeInTheDocument();
  });

  it("a failed list says so and Thử lại asks again", async () => {
    let fail = true;
    mockFetch({
      "/api/projects": PROJECTS, "/api/project": MANIFEST,
      "/api/lemo/styles": stylesRoute(),
    });
    const ok = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (fail && String(input).startsWith("/api/lemo/styles")) return new Response(JSON.stringify({ error: "lỗi thử lemo" }), { status: 500 });
      return ok(input, init);
    }));
    useStudio.setState({ name: NAME });
    renderUi(<Gallery />);
    expect(await screen.findByText("Không tải được: lỗi thử lemo. Thử bấm lại mục này trên thanh trái.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(titles()).toHaveLength(3));
  });
});
