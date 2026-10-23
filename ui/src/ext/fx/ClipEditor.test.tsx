import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Footage } from "./Footage.tsx";
import { useFx } from "./fx-store.ts";

const h = vi.hoisted(() => ({ footage: vi.fn(), useClip: vi.fn(), say: vi.fn() }));
vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: h.say }));
vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), fxFootage: h.footage, fxUseClip: h.useClip }));

const NAME = "thuy-mau-demo";
const M = {
  version: 4, capabilities: { editable: true }, lines: [],
  shots: [{ id: "s1", name: "Lớp thuỷ màu mới", start: 0, duration: 2, assets: [] }, { id: "s2", name: "Chữ tiếng Việt rõ", start: 2, duration: 2, assets: [] }],
};
const MEDIA = [{ rel: "footage/raw/1.mp4", kind: "video", duration: 4 }, { rel: "assets/logo.png", kind: "image" }];
const RESULT = { ok: true, rel: "footage/cut/1-trim-70cb8924.mp4", out: "/root/footage/cut/1-trim-70cb8924.mp4", actual_duration: 1, cached: false, receipt: { id: "mvkhzdb8-5da846", pass: true, file: "r.json" }, warnings: ["cảnh báo thử: khung lệch"] };

function setup(media: unknown = MEDIA, jobs: unknown[] = []) {
  const fetch = mockFetch({
    "/api/projects": [{ name: NAME, has_manifest: true }],
    "/api/project": M,
    "/api/media": media,
    "/api/jobs": jobs,
    "/api/fx/luts": { luts: [{ id: "identity", name: "Không đổi", source: "studio" }] },
  });
  queryClient.setQueryData(keys.projects(), [{ name: NAME, has_manifest: true }]);
  queryClient.setQueryData(keys.project(NAME), M);
  useStudio.setState({ name: NAME, sel: "s1" });
  renderUi(<Footage />);
  return fetch;
}

beforeEach(() => {
  useFx.setState(useFx.getInitialState(), true);
  h.footage.mockReset(); h.useClip.mockReset(); h.say.mockReset();
});

describe("Sửa clip", () => {
  it("lists only registered videos and the five operations with their fields", async () => {
    setup();
    expect(await screen.findByText("Cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung dọc. Render trước bằng ffmpeg, bản gốc giữ nguyên.")).toBeInTheDocument();
    const clip = screen.getByRole("combobox", { name: "Clip" }) as HTMLSelectElement;
    expect([...clip.options].map((o) => o.textContent)).toEqual(["1.mp4"]);
    const op = screen.getByRole("combobox", { name: "Thao tác" }) as HTMLSelectElement;
    expect([...op.options].map((o) => o.textContent)).toEqual(["Cắt đoạn", "Đổi tốc độ", "Đứng hình", "Chỉnh màu", "Cắt khung"]);
    expect(screen.getByText("Từ giây")).toBeInTheDocument();
    fireEvent.change(op, { target: { value: "grade" } });
    expect(await screen.findByRole("option", { name: "Không đổi (studio)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ấm" })).toBeInTheDocument();
  });

  it("says when there is no registered video", async () => {
    setup([]);
    expect(await screen.findByText("Chưa có video đã đăng ký. Thêm footage ở trên trước.")).toBeInTheDocument();
  });

  it("refuses a malformed speed point before calling the server", async () => {
    setup();
    fireEvent.change(await screen.findByRole("combobox", { name: "Thao tác" }), { target: { value: "speed" } });
    fireEvent.change(screen.getByPlaceholderText("0:1, 2:2"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Render" }));
    expect(h.say).toHaveBeenCalledWith('"abc" phải có dạng t:rate', true);
    expect(h.footage).not.toHaveBeenCalled();
  });

  it("shows the render error of the server", async () => {
    h.footage.mockResolvedValue({ status: 500, error: "lỗi thử render" });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Render" }));
    expect(await screen.findByText("lỗi thử render")).toBeInTheDocument();
  });

  it("renders, follows the job, shows before and after, then uses the clip in a shot", async () => {
    h.footage.mockResolvedValue({ status: 200, data: { job: { id: "j1" } } });
    h.useClip.mockResolvedValue({ status: 200, data: { asset: "assets/footage/1-trim.mp4", message: "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" } });
    setup(MEDIA, [{ id: "j1", name: NAME, kind: "fx", status: "done", code: 0, started: "2026-10-23T00:00:00Z", tail: [`RESULT ${JSON.stringify(RESULT)}`] }]);
    fireEvent.change(await screen.findByLabelText("Đến giây"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Render" }));
    await waitFor(() => expect(h.footage).toHaveBeenCalledWith({ name: NAME, src: "footage/raw/1.mp4", op: "trim", params: { in: 0, out: 1 } }));
    expect(await screen.findByText("Biên nhận mvkhzdb8-5da846: kiểm đạt")).toBeInTheDocument();
    expect(screen.getByText("footage/cut/1-trim-70cb8924.mp4 · 1.00s")).toBeInTheDocument();
    expect(screen.getByText("cảnh báo thử: khung lệch")).toBeInTheDocument();
    const videos = [...document.querySelectorAll("video")].map((v) => v.getAttribute("src"));
    expect(videos).toEqual([
      `/api/fx/clip?name=${NAME}&src=footage%2Fraw%2F1.mp4`,
      `/api/fx/clip?name=${NAME}&src=footage%2Fcut%2F1-trim-70cb8924.mp4`,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Dùng trong shot" }));
    await waitFor(() => expect(h.useClip).toHaveBeenCalledWith({ name: NAME, shot: "s1", base: 4, clip: "footage/cut/1-trim-70cb8924.mp4", replace: null }));
    await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đang chờ phiên Claude Code mở nhận việc (studio_request_next)"));
  });
});
