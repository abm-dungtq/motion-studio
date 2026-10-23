import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient, say } from "@/api/client.ts";
import { brollIndex, keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { Analyse, jobText } from "./Analyse.tsx";
import { PLAN } from "./fixtures.ts";
import { resetBroll } from "./store.ts";

vi.mock("@/api/client.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client.ts")>()), say: vi.fn() }));
// The index run is never started for real here: it would read footage and, with vision, spend
// agent calls.
vi.mock("@/api/queries.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/queries.ts")>()), brollIndex: vi.fn() }));

const EXACT = { ...PLAN, clips: 6, new_files: 0, shots_pending: 40, sheets: 5, calls: 25 };

beforeEach(() => {
  resetBroll();
  vi.mocked(say).mockClear();
  vi.mocked(brollIndex).mockReset();
});

describe("footage analysis", () => {
  it("keeps the captions button off while files wait for the offline analysis", async () => {
    mockFetch({ "/api/broll/plan": PLAN, "/api/broll/job": { job: null } });
    renderUi(<Analyse />);
    expect(await screen.findByText("6 file video, 0 clip đã phân tích offline, 6 file chưa phân tích.")).toBeInTheDocument();
    expect(screen.getByText(`Chạy "Phân tích offline" trước (không tốn lượt) để biết chính xác số lượt đọc ảnh.`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chú thích bằng agent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Phân tích offline" })).toBeEnabled();
    expect(screen.getByText("Phân tích footage").closest("details")).toHaveAttribute("open");
  });

  it("with an exact count the captions button names it, capped per run", async () => {
    mockFetch({ "/api/broll/plan": EXACT, "/api/broll/job": { job: null } });
    renderUi(<Analyse />);
    expect(await screen.findByText("40 shot chưa có chú thích → 5 contact sheet → 25 lượt đọc ảnh (tối đa 20 lượt mỗi lần chạy).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chú thích bằng agent (20 lượt)" })).toBeEnabled();
  });

  it("vision off, and nothing left to caption, keep it off", async () => {
    mockFetch({ "/api/broll/plan": { ...EXACT, settings: { vision: false, max_calls_per_run: 20 } }, "/api/broll/job": { job: null } });
    const view = renderUi(<Analyse />);
    expect(await screen.findByText("Đọc ảnh đang tắt (studio.json broll.vision: false): chỉ tìm được theo tên file và lời nói.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chú thích bằng agent/ })).toBeDisabled();
    view.unmount();
    queryClient.clear();
    mockFetch({ "/api/broll/plan": { ...EXACT, shots_pending: 0, calls: 0 }, "/api/broll/job": { job: null } });
    renderUi(<Analyse />);
    expect(await screen.findByText("Mọi shot đã có chú thích: không cần lượt đọc ảnh nào.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chú thích bằng agent" })).toBeDisabled();
  });

  it("a failed plan says why and turns both buttons off", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).startsWith("/api/broll/plan")
      ? new Response(JSON.stringify({ error: "lỗi thử kế hoạch" }), { status: 500 })
      : new Response(JSON.stringify({ job: null }), { status: 200 }))));
    renderUi(<Analyse />);
    expect(await screen.findByText("lỗi thử kế hoạch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phân tích offline" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chú thích bằng agent" })).toBeDisabled();
  });

  it("Phân tích offline starts a run without vision and follows the job until it ends", async () => {
    useStudio.setState({ name: "demo" });
    let job = null as Record<string, unknown> | null;
    const f = mockFetch({ "/api/broll/plan": PLAN, "/api/broll/job": () => ({ job }) });
    vi.mocked(brollIndex).mockImplementation(async () => {
      job = { id: "b1", status: "running", code: null, tail: ["RESULT {}", "đọc 1.mp4"] };
      return { status: 200, data: { job } };
    });
    renderUi(<Analyse />);
    const offline = await screen.findByRole("button", { name: "Phân tích offline" });
    await waitFor(() => expect(offline).toBeEnabled());
    await act(async () => { fireEvent.click(offline); });
    expect(brollIndex).toHaveBeenCalledWith({ scope: "workspace", vision: false, name: "demo" });
    expect(await screen.findByText(/Đang chạy/)).toHaveTextContent("Đang chạy đọc 1.mp4");
    expect(offline).toBeDisabled();
    const plans = () => f.mock.calls.filter((c) => String(c[0]).startsWith("/api/broll/plan")).length;
    const before = plans();
    job = { ...(job as Record<string, unknown>), status: "done", code: 0 };
    await act(async () => { await queryClient.refetchQueries({ queryKey: keys.brollJob() }); });
    expect(await screen.findByText(/^Xong/)).toBeInTheDocument();
    await waitFor(() => expect(plans()).toBeGreaterThan(before));
  });

  it("a failed start says why", async () => {
    mockFetch({ "/api/broll/plan": PLAN, "/api/broll/job": { job: null } });
    vi.mocked(brollIndex).mockResolvedValue({ status: 409, error: "đang có một lượt phân tích" });
    renderUi(<Analyse />);
    const offline = await screen.findByRole("button", { name: "Phân tích offline" });
    await waitFor(() => expect(offline).toBeEnabled());
    await act(async () => { fireEvent.click(offline); });
    expect(brollIndex).toHaveBeenCalledWith({ scope: "workspace", vision: false });
    expect(say).toHaveBeenCalledWith("đang có một lượt phân tích", true);
  });

  it("the job text", () => {
    expect(jobText({ id: "x", name: "", kind: "broll", status: "failed", code: 2, started: "", tail: ["a", "RESULT {}"] })).toBe("Dừng (mã 2)\na");
    expect(jobText({ id: "x", name: "", kind: "broll", status: "cancelling", code: null, started: "" })).toBe("Đang huỷ");
  });
});
