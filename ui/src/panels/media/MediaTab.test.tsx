import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient, say } from "@/api/client.ts";
import { keys, mediaRegister } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { browseMemo } from "./Browser.tsx";
import { MediaTab } from "./MediaTab.tsx";

vi.mock("@/api/client.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client.ts")>()), say: vi.fn() }));
vi.mock("@/api/queries.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/queries.ts")>()), mediaRegister: vi.fn() }));

// Shapes of GET /api/media, /api/media/browse and /api/files (server.mjs, routes/), trimmed.
const MEDIA = [{ rel: "footage/raw/1.mp4", path: "/tmp/root/footage/raw/1.mp4", kind: "video", duration: 3.03, width: 1920, height: 1080 }];
const HOME = { path: "/Users/me", parent: "/Users", entries: [{ type: "dir", name: "Desktop", path: "/Users/me/Desktop" }, { type: "dir", name: "Movies", path: "/Users/me/Movies" }] };
const MOVIES = {
  path: "/Users/me/Movies", parent: "/Users/me",
  entries: [{ type: "dir", name: "pitch", path: "/Users/me/Movies/pitch" }, { type: "file", name: "1.mp4", path: "/Users/me/Movies/1.mp4", kind: "video", size: 734003 }],
};
const FILES = [{ path: "assets/bgm/bgm.mp3", size: 10 }, { path: "assets/hero.png", size: 10 }, { path: "assets/audio_meta.json", size: 10 }];

function open(name: string, editable = true) {
  queryClient.setQueryData(keys.projects(), [{ name, title: name, has_manifest: true, editable, version: 3 }]);
  queryClient.setQueryData(keys.project(name), { version: 3, shots: [], lines: [], capabilities: { editable } });
  useStudio.setState({ name });
}

function routes(extra: Record<string, unknown> = {}) {
  return mockFetch({
    "/api/media": MEDIA,
    "/api/media/browse": (u: URL) => (u.searchParams.get("path") === "/Users/me/Movies" ? MOVIES : HOME),
    "/api/files": FILES,
    ...extra,
  });
}

function fakeDrag() {
  const data: Record<string, string> = {};
  return { data, dataTransfer: { setData: (k: string, v: string) => { data[k] = v; }, effectAllowed: "none" } };
}

beforeEach(() => {
  browseMemo.path = null;
  vi.mocked(say).mockClear();
  vi.mocked(mediaRegister).mockReset();
});

describe("media tab", () => {
  it("shows the three sections in the old order", async () => {
    open("demo");
    routes();
    renderUi(<MediaTab />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Footage đã thêm", "Chọn file trên máy", "File trong assets/"]);
    await screen.findByText("1.mp4", { selector: "span[title='footage/raw/1.mp4']" });
  });

  it("without a manifest asks for one", () => {
    useStudio.setState({ name: null });
    routes();
    renderUi(<MediaTab />);
    expect(screen.getByText("Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu.")).toBeInTheDocument();
  });

  it("a footage row drags as text/x-ms-media { rel, kind, path } and text/plain", async () => {
    open("demo");
    routes();
    renderUi(<MediaTab />);
    const row = (await screen.findByTitle("Kéo vào timeline"));
    expect(row).toHaveAttribute("draggable", "true");
    expect(within(row).getByText("Video · 0:03 · 1920×1080")).toBeInTheDocument();
    const d = fakeDrag();
    fireEvent.dragStart(row, { dataTransfer: d.dataTransfer });
    expect(JSON.parse(d.data["text/x-ms-media"])).toEqual({ rel: "footage/raw/1.mp4", kind: "video", path: "/tmp/root/footage/raw/1.mp4" });
    expect(d.data["text/plain"]).toBe("footage/raw/1.mp4");
  });

  it("says so when no footage is registered", async () => {
    open("demo");
    routes({ "/api/media": [] });
    renderUi(<MediaTab />);
    expect(await screen.findByText("Chưa có footage. Chọn file bên dưới.")).toBeInTheDocument();
  });

  it("opens ~/Movies on the first visit and keeps the folder for the next", async () => {
    open("demo");
    routes();
    const view = renderUi(<MediaTab />);
    await waitFor(() => expect(screen.getByLabelText("Thư mục đang xem")).toHaveValue("/Users/me/Movies"));
    expect(screen.getByRole("button", { name: "Lên" })).toBeEnabled();
    expect(screen.getByText("Video · 0.7 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pitch/ })).toHaveTextContent("pitch›");
    view.unmount();
    routes({ "/api/media/browse": (u: URL) => ({ ...MOVIES, path: u.searchParams.get("path") }) });
    renderUi(<MediaTab />);
    await waitFor(() => expect(screen.getByLabelText("Thư mục đang xem")).toHaveValue("/Users/me/Movies"));
  });

  it("an empty folder and a folder that cannot open say what to do", async () => {
    open("demo");
    routes({ "/api/media/browse": (u: URL) => (u.searchParams.get("path") ? { path: "/x", parent: "/", entries: [] } : HOME) });
    renderUi(<MediaTab />);
    expect(await screen.findByText("Thư mục này không có thư mục con hay file media. Bấm Lên hoặc gõ đường dẫn khác.")).toBeInTheDocument();
    const box = screen.getByLabelText("Thư mục đang xem");
    fireEvent.change(box, { target: { value: "/nope" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "không có đường dẫn này" }), { status: 404 })));
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("Không mở được: không có đường dẫn này. Gõ đường dẫn khác hoặc bấm Lên.")).toBeInTheDocument();
  });

  it("Thêm registers the file, says it was copied and stays off", async () => {
    open("demo");
    routes();
    vi.mocked(mediaRegister).mockResolvedValue({ status: 200, data: { copied: true } });
    renderUi(<MediaTab />);
    const add = await screen.findByRole("button", { name: "Thêm 1.mp4" });
    await act(async () => { fireEvent.click(add); });
    expect(mediaRegister).toHaveBeenCalledWith({ name: "demo", src: "/Users/me/Movies/1.mp4" });
    expect(say).toHaveBeenCalledWith("Đã thêm 1.mp4, đã chép vào footage/raw");
    expect(add).toHaveTextContent("Đã thêm");
    expect(add).toBeDisabled();
  });

  it("Thêm of a file already there, and a failed Thêm", async () => {
    open("demo");
    routes();
    vi.mocked(mediaRegister).mockResolvedValueOnce({ status: 200, data: { existing: true } }).mockResolvedValueOnce({ status: 500, error: "lỗi thử đăng ký" });
    const view = renderUi(<MediaTab />);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Thêm 1.mp4" })); });
    expect(say).toHaveBeenCalledWith("1.mp4 đã có trong danh sách");
    view.unmount();
    renderUi(<MediaTab />);
    const add = await screen.findByRole("button", { name: "Thêm 1.mp4" });
    await act(async () => { fireEvent.click(add); });
    expect(say).toHaveBeenCalledWith("lỗi thử đăng ký", true);
    expect(add).toHaveTextContent("Thêm");
    expect(add).toBeEnabled();
  });

  it("a read-only project keeps Thêm off", async () => {
    open("old", false);
    routes();
    renderUi(<MediaTab />);
    expect(await screen.findByRole("button", { name: "Thêm 1.mp4" })).toBeDisabled();
  });

  it("assets/ shows every file but .json", async () => {
    open("demo");
    routes();
    renderUi(<MediaTab />);
    await screen.findByTitle("assets/hero.png");
    expect(screen.getByAltText("assets/hero.png")).toHaveAttribute("src", "/p/demo/assets/hero.png");
    expect(screen.getByTitle("assets/bgm/bgm.mp3")).toHaveTextContent("bgm.mp3");
    expect(screen.queryByTitle("assets/audio_meta.json")).toBeNull();
  });

  it("an empty assets/ points to the director", async () => {
    open("demo");
    routes({ "/api/files": [] });
    renderUi(<MediaTab />);
    expect(await screen.findByText("Chưa có file nào trong assets/. Giao việc cho AI tìm footage hoặc tạo hình cho dự án.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giao việc cho AI" })).toBeInTheDocument();
  });
});
