import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudio, getInspectorSections, getSections } from "@/ext/registry.ts";
import { register } from "./index.ts";
import { Search, DEBOUNCE_MS } from "./Search.tsx";
import { resetBroll } from "./store.ts";
import { HIT, PLAN } from "./fixtures.ts";

function fakeDrag() {
  const data: Record<string, string> = {};
  return { data, dataTransfer: { setData: (k: string, v: string) => { data[k] = v; }, effectAllowed: "none" } };
}

beforeEach(() => resetBroll());
afterEach(() => vi.useRealTimers());

describe("broll search", () => {
  it("registers the media section and the shot inspector section", () => {
    register(createStudio());
    expect(getSections("media").map((s) => [s.id, s.order])).toEqual([["broll-search", 40]]);
    expect(getInspectorSections("shot").map((s) => [s.id, s.order])).toEqual([["broll-suggest", 30]]);
  });

  it("shows every analysed part before anything is typed; a result drags with sha256, start and end", async () => {
    const f = mockFetch({ "/api/broll/search": { items: [HIT] }, "/api/broll/plan": PLAN, "/api/broll/job": { job: null } });
    renderUi(<Search />);
    expect(screen.getByRole("heading", { name: "Tìm trong footage" })).toBeInTheDocument();
    const card = await screen.findByTitle(`${HIT.path} Kéo vào timeline`);
    expect(card).toHaveTextContent("0:00.0–0:03.0 · 3.0 s · trung");
    expect(card).toHaveTextContent("nút · tím");
    expect(card).toHaveTextContent("2.mp4");
    const url = new URL(String(f.mock.calls.find((c) => String(c[0]).startsWith("/api/broll/search"))?.[0]), "http://x");
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "40" });
    const d = fakeDrag();
    fireEvent.dragStart(card, { dataTransfer: d.dataTransfer });
    expect(JSON.parse(d.data["text/x-ms-media"])).toEqual({ rel: null, kind: "video", path: HIT.path, sha256: "ab12", start: 0, end: 3 });
    expect(d.data["text/plain"]).toBe(HIT.path);
  });

  it("searches 250 ms after typing stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = mockFetch({ "/api/broll/search": (u: URL) => ({ items: u.searchParams.get("q") ? [] : [HIT] }), "/api/broll/plan": PLAN, "/api/broll/job": { job: null } });
    renderUi(<Search />);
    await screen.findByTitle(`${HIT.path} Kéo vào timeline`);
    const searches = () => f.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/broll/search"));
    const before = searches().length;
    fireEvent.change(screen.getByLabelText("Tìm footage"), { target: { value: "biển" } });
    await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS - 50); });
    expect(searches().length).toBe(before);
    await act(async () => { vi.advanceTimersByTime(100); });
    await waitFor(() => expect(searches().at(-1)).toBe("/api/broll/search?q=bi%E1%BB%83n&limit=40"));
    expect(await screen.findByText("Không có đoạn nào khớp.")).toBeInTheDocument();
  });

  it("an index with nothing analysed, and a failed search", async () => {
    mockFetch({ "/api/broll/search": { items: [] }, "/api/broll/plan": PLAN, "/api/broll/job": { job: null } });
    const view = renderUi(<Search />);
    expect(await screen.findByText("Chưa có footage nào được phân tích.")).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).startsWith("/api/broll/search")
      ? new Response(JSON.stringify({ error: "lỗi thử tìm footage" }), { status: 500 })
      : new Response(JSON.stringify(String(u).startsWith("/api/broll/plan") ? PLAN : { job: null }), { status: 200 }))));
    resetBroll();
    const { queryClient } = await import("@/api/client.ts");
    queryClient.clear();
    renderUi(<Search />);
    expect(await screen.findByText("lỗi thử tìm footage")).toBeInTheDocument();
  });
});
