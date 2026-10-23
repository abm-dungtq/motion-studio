import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { say } from "@/api/client.ts";
import { lemoDraft, lemoKeep } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { MANIFEST, NAME, PROJECTS, stylesRoute } from "./fixtures.ts";
import { MyStyle } from "./MyStyle.tsx";
import { useLemo } from "./store.ts";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));
// The write functions are mocked: "Giữ phong cách" never reaches a server, so nothing is copied
// into an own-styles folder by these tests. The answers name a /tmp folder only.
vi.mock("@/api/queries.ts", async (orig) => ({
  ...(await orig<typeof import("@/api/queries.ts")>()),
  lemoApply: vi.fn(), lemoFetch: vi.fn(), lemoDraft: vi.fn(), lemoKeep: vi.fn(),
}));

const MY_DIR = "/tmp/ms-react-lemo-test/my-styles";
const DRAFT = {
  style: { slug: "my-ink", en: "My Ink", based_on: "watercolor", line: "Mực loang trên giấy dó" },
  frame: "lemo-style/styleframe.jpg", frame_note: null, changes: "# CHANGES\n<b>đậm</b>", valid: true, has_guide: true,
};

function setup(over: Parameters<typeof stylesRoute>[0] = {}, name: string | null = NAME) {
  mockFetch({ "/api/projects": PROJECTS, "/api/project": MANIFEST, "/api/lemo/styles": stylesRoute({ my_dir: MY_DIR, ...over }) });
  useStudio.setState({ name });
  renderUi(<MyStyle />);
}

beforeEach(() => {
  useLemo.setState(useLemo.getInitialState(), true);
  vi.mocked(say).mockReset();
  vi.mocked(lemoDraft).mockReset();
  vi.mocked(lemoKeep).mockReset();
});

describe("MyStyle", () => {
  it("without an open project it says where kept styles are", async () => {
    setup({}, null);
    expect(await screen.findByText(`Mở một dự án để tạo phong cách riêng. Phong cách đã giữ nằm ở ${MY_DIR}.`)).toBeInTheDocument();
    expect(screen.getByText("Phong cách riêng")).toBeInTheDocument();
  });

  it("the form asks the director for a draft", async () => {
    setup();
    expect(await screen.findByText("Tạo phong cách riêng")).toBeInTheDocument();
    const base = screen.getByLabelText("Phong cách gốc");
    expect([...base.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Từ trang trắng", "Thuỷ màu", "Tranh khắc gỗ", "Bàn tin tức"]);
    vi.mocked(lemoDraft).mockResolvedValue({ status: 200, data: { ok: true } });
    await userEvent.type(screen.getByPlaceholderText("Tên phong cách (tuỳ chọn)"), "Phong cách thử");
    await userEvent.click(screen.getByRole("button", { name: "Nhờ đạo diễn tạo" }));
    expect(lemoDraft).toHaveBeenCalledWith({ name: NAME, base: null, source: null, title: "Phong cách thử", description: "" });
    await waitFor(() => expect(say).toHaveBeenCalledWith("Đã gửi yêu cầu tạo phong cách riêng cho đạo diễn"));
  });

  it("a draft shows its frame and CHANGES.md as text; Giữ phong cách keeps it once", async () => {
    setup({ project: { vertical: false, draft: DRAFT } });
    expect(await screen.findByText("Bản nháp: My Ink (my-ink)")).toBeInTheDocument();
    expect(screen.getByAltText("Khung phong cách").getAttribute("src")).toMatch(/^\/p\/thuy-mau-demo\/lemo-style\/styleframe\.jpg\?v=\d+$/);
    expect(screen.getByTestId("lemo-changes").textContent).toBe(DRAFT.changes);
    expect(screen.getByTestId("lemo-changes").children).toHaveLength(0);
    expect(screen.getByText("Tạo bản nháp khác")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(lemoKeep).mockResolvedValue({ status: 200, data: { ok: true, dir: `${MY_DIR}/my-ink`, frame: "styleframe.jpg" } });
    await userEvent.click(screen.getByRole("button", { name: "Giữ phong cách" }));
    expect(confirm).toHaveBeenCalledWith(`Giữ "My Ink" vào ${MY_DIR}/my-ink/? Thư mục đã có thì không ghi đè.`);
    expect(lemoKeep).toHaveBeenCalledTimes(1);
    expect(lemoKeep).toHaveBeenCalledWith({ name: NAME });
    await waitFor(() => expect(say).toHaveBeenCalledWith(`Đã giữ phong cách ở ${MY_DIR}/my-ink`));
  });

  it("without lemo-style/STYLE.md the keep button is off", async () => {
    setup({ project: { vertical: false, draft: { ...DRAFT, has_guide: false } } });
    const btn = await screen.findByRole("button", { name: "Giữ phong cách" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Cần lemo-style/STYLE.md");
    expect(lemoKeep).not.toHaveBeenCalled();
  });
});
