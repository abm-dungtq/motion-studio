import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient, say } from "@/api/client.ts";
import { brollApply, keys } from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { SUGGEST } from "./fixtures.ts";
import { resetBroll, useBroll } from "./store.ts";
import { APPLY_TIMEOUT_MS, Suggest } from "./Suggest.tsx";

vi.mock("@/api/client.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client.ts")>()), say: vi.fn() }));
vi.mock("@/api/queries.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/queries.ts")>()), brollApply: vi.fn() }));
vi.mock("@/api/actions.ts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/api/actions.ts")>();
  return { ...orig, actions: { ...orig.actions, direct: vi.fn(async () => true) } };
});

function open(editable = true): Manifest {
  const m = { version: 7, shots: [{ id: "s2" }], lines: [], capabilities: { editable } } as unknown as Manifest;
  queryClient.setQueryData(keys.projects(), [{ name: "demo", title: "", has_manifest: true, editable, version: 7 }]);
  queryClient.setQueryData(keys.project("demo"), m);
  useStudio.setState({ name: "demo", sel: "s2", pick: { kind: "shot", id: "s2" } });
  return m;
}

beforeEach(() => {
  resetBroll();
  vi.mocked(say).mockClear();
  vi.mocked(brollApply).mockReset();
  vi.mocked(actions.direct).mockClear();
});

describe("B-roll suggestions", () => {
  it("lists the parts with what to use and the director tick", async () => {
    const m = open();
    const f = mockFetch({ "/api/broll/suggest": SUGGEST });
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    expect(await screen.findByText("Tìm theo: song nuoc lieu · shot dài 5.5 s")).toBeInTheDocument();
    expect(screen.getByText("Gợi ý B-roll")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nhờ đạo diễn đặt clip vào cảnh" })).toBeChecked();
    expect(screen.getByText("ngắn hơn shot: cần lặp/chậm")).toBeInTheDocument();
    expect(screen.getByText("dùng 0:10.0–0:15.5")).toBeInTheDocument();
    expect(String(f.mock.calls[0][0])).toBe("/api/broll/suggest?name=demo&shot=s2");
  });

  it("Đặt vào shot sends the shot and the chosen part, then asks the director", async () => {
    const m = open();
    mockFetch({ "/api/broll/suggest": SUGGEST });
    vi.mocked(brollApply).mockResolvedValue({ status: 200, data: { rel: "assets/broll/s2-ab.mp4", version: 8 } });
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    await screen.findByText("dùng 0:10.0–0:15.5");
    const card = screen.getByText("dùng 0:10.0–0:15.5").closest("[data-broll-hit]") as HTMLElement;
    await act(async () => { fireEvent.click(within(card).getByRole("button", { name: "Đặt vào shot" })); });
    expect(brollApply).toHaveBeenCalledWith({ name: "demo", shot: "s2", base: 7, sha256: "s2", start: 10, end: 15.5 }, { timeout: APPLY_TIMEOUT_MS });
    expect(say).toHaveBeenCalledWith("Đã thêm assets/broll/s2-ab.mp4 vào shot s2 (v8); Cmd+Z để hoàn tác");
    expect(actions.direct).toHaveBeenCalledWith({ scope: "shot", target: "s2", text: "Đặt clip B-roll assets/broll/s2-ab.mp4 (đã có trong assets của shot s2) vào cảnh của shot này, đúng thời lượng shot." });
  });

  it("without the tick, or when the clip was there, the director is not asked", async () => {
    const m = open();
    mockFetch({ "/api/broll/suggest": SUGGEST });
    vi.mocked(brollApply).mockResolvedValueOnce({ status: 200, data: { rel: "assets/broll/a.mp4", unchanged: true } }).mockResolvedValueOnce({ status: 200, data: { rel: "assets/broll/b.mp4", version: 9 } });
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    const buttons = await screen.findAllByRole("button", { name: "Đặt vào shot" });
    await act(async () => { fireEvent.click(buttons[0]); });
    expect(say).toHaveBeenCalledWith("assets/broll/a.mp4 đã có trong shot s2");
    fireEvent.click(screen.getByRole("checkbox", { name: "Nhờ đạo diễn đặt clip vào cảnh" }));
    expect(useBroll.getState().askDirector).toBe(false);
    await act(async () => { fireEvent.click(buttons[1]); });
    expect(actions.direct).not.toHaveBeenCalled();
  });

  it("a failed place says why", async () => {
    const m = open();
    mockFetch({ "/api/broll/suggest": SUGGEST });
    vi.mocked(brollApply).mockResolvedValue({ status: 422, error: "không cắt được clip" });
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    const [b] = await screen.findAllByRole("button", { name: "Đặt vào shot" });
    await act(async () => { fireEvent.click(b); });
    expect(say).toHaveBeenCalledWith("không cắt được clip", true);
    expect(b).toBeEnabled();
  });

  it("a read-only project keeps Đặt vào shot off", async () => {
    const m = open(false);
    mockFetch({ "/api/broll/suggest": SUGGEST });
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    for (const b of await screen.findAllByRole("button", { name: "Đặt vào shot" })) expect(b).toBeDisabled();
  });

  it("no match, no query, and a failed load", async () => {
    const m = open();
    mockFetch({ "/api/broll/suggest": { query: "abc", duration: 2, items: [] } });
    let view = renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    expect(await screen.findByText(`Không có footage khớp "abc". Phân tích thêm footage ở tab Footage.`)).toBeInTheDocument();
    view.unmount(); queryClient.removeQueries({ queryKey: keys.brollSuggest("demo") });
    mockFetch({ "/api/broll/suggest": { query: "", duration: 2, items: [] } });
    view = renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    expect(await screen.findByText("Shot chưa có tên hay lời để tìm.")).toBeInTheDocument();
    view.unmount(); queryClient.removeQueries({ queryKey: keys.brollSuggest("demo") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "lỗi thử gợi ý" }), { status: 500 })));
    renderUi(<Suggest pick={{ kind: "shot", id: "s2" }} m={m} />);
    expect(await screen.findByText("lỗi thử gợi ý")).toBeInTheDocument();
  });
});
