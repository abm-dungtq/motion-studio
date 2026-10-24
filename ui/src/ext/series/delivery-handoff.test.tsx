import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStudio } from "@/store/studio.ts";
import { createStudio, getSections } from "@/ext/registry.ts";
import { register } from "./index.ts";
import { DeliveryPanel, rowText, type DeliveryStatus } from "./DeliveryPanel.tsx";
import { HandoffCard } from "./HandoffCard.tsx";

// Shapes of GET /api/delivery (routes/delivery.mjs deliveryStatus) and GET /api/handoff.
const empty = { files: [], error: null };
const status = (over: Partial<DeliveryStatus> = {}): DeliveryStatus => ({
  series: "Series Thử", episode: 2, folder: "S/kenh/tap-2", exists: true,
  files: [{ name: "ep-final-youtube.mp4", size: 10 }],
  rows: {
    video: { files: ["ep-final-youtube.mp4"], error: null },
    thumbnail: { ...empty, drafts: ["delivery/thumb-1.jpg", "delivery/thumb-2.jpg", "delivery/thumb-3.jpg"] },
    text: { files: [], error: { code: 1, count: 1, last: "2026-10-24T10:00:00.000Z", tail: ["ERROR title: dài quá"] } },
    captions: empty,
    drive: { ...empty, last: null },
  },
  input: "renders/ep-final.mp4",
  drive: { folder: "thu", account: "som…@example.com" },
  can: { text: true, captions: true, export: true, thumbnail: true, drive: true },
  jobs: [],
  ...over,
});
const card = (id: string, action: string, kind: string, title: string) => ({ id, kind, title, count: 1, estimate: null, quota: null, status: "waiting", action: { name: action, args: {} } });

function routes(over: Record<string, unknown> = {}) {
  const posts: { path: string; body: unknown }[] = [];
  const post = (path: string, answer: unknown) => (_u: URL, init?: RequestInit) => { posts.push({ path, body: JSON.parse(String(init?.body)) }); return answer; };
  const table: Record<string, unknown> = {
    "/api/delivery": status(),
    "/api/consent": { cards: [card("c-1", "drive-upload", "drive", "Tải 1 file (0.0 MB) lên Drive som…@example.com/thu"), card("c-2", "tts-batch", "elevenlabs", "Lồng tiếng 3 câu")] },
    "/api/delivery/export": post("/api/delivery/export", { job: { id: "j" }, input: "renders/ep-final.mp4" }),
    "/api/delivery/text": post("/api/delivery/text", { ok: false, message: "check-platform youtube báo lỗi" }),
    "/api/delivery/thumbnail": post("/api/delivery/thumbnail", { waiting_consent: true }),
    "/api/delivery/thumbnail/pick": post("/api/delivery/thumbnail/pick", { ok: true, files: ["S/kenh/tap-2/thumbnail.jpg"] }),
    "/api/delivery/drive": post("/api/delivery/drive", { waiting_consent: true }),
    "/api/delivery/ask": post("/api/delivery/ask", { ok: true }),
    "/api/handoff": { cards: [{ step: "build-rig", file: ".opus/handoff/build-rig.md", text: "# Cần xử lý ngoài: build-rig", paste: "Trong thư mục dự án /x: bước \"build-rig\" lỗi" }] },
    "/api/handoff/resolve": post("/api/handoff/resolve", { ok: true }),
    ...over,
  };
  for (const k of Object.keys(table)) if (table[k] === undefined) delete table[k];
  const fetch = mockFetch(table);
  return { fetch, posts };
}
function open(ui: React.ReactElement) {
  act(() => { useStudio.setState({ name: "ep" }); });
  return renderUi(ui);
}

describe("delivery panel", () => {
  test("sits in the export dialog; the handoff cards at the top of the director column", () => {
    register(createStudio());
    expect(getSections("export").map((x) => x.id)).toContain("series-delivery");
    expect(getSections("director")[0]?.id).toBe("series-handoff");
  });

  test("row states in words", () => {
    expect(rowText(empty, "S/kenh/tap-2")).toBe("chưa có");
    expect(rowText({ files: ["a.srt"], error: null }, "S/kenh/tap-2")).toBe("đã có trong tap-2: a.srt");
    expect(rowText({ files: ["a.srt"], error: { code: 3, count: 2, last: "", tail: ["thiếu file"] } }, "S/kenh/tap-2")).toBe("lỗi: thiếu file");
  });

  test("five rows; only the Drive card shows under Drive; the buttons post their step", async () => {
    const { posts } = routes();
    open(<DeliveryPanel />);
    const panel = await screen.findByRole("region", { name: "Giao nộp" });
    for (const r of ["Video", "Thumbnail", "Tiêu đề và mô tả", "Phụ đề", "Drive"]) expect(within(panel).getByRole("listitem", { name: r })).toBeInTheDocument();
    const drive = within(panel).getByRole("listitem", { name: "Drive" });
    expect(await within(drive).findByText("Tải 1 file (0.0 MB) lên Drive som…@example.com/thu")).toBeInTheDocument();
    expect(within(panel).queryByText("Lồng tiếng 3 câu")).toBeNull();
    expect(within(panel).getByText("lỗi: ERROR title: dài quá")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Xuất 3 nền tảng" }));
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/delivery/export", body: { name: "ep" } }));
    const thumb = within(panel).getByRole("listitem", { name: "Thumbnail" });
    const draw = within(thumb).getByRole("button", { name: "Vẽ 3 thumbnail" });
    expect(draw).toBeDisabled();
    fireEvent.change(within(thumb).getByLabelText("Dòng chữ 1"), { target: { value: "BÍ MẬT" } });
    fireEvent.change(within(thumb).getByLabelText("Dòng chữ 2"), { target: { value: "CUỐI" } });
    await waitFor(() => expect(draw).toBeEnabled());
    fireEvent.click(draw);
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/delivery/thumbnail", body: { name: "ep", line1: "BÍ MẬT", line2: "CUỐI" } }));
    await waitFor(() => expect(within(thumb).getByRole("button", { name: "Chọn ảnh 2" })).toBeEnabled());
    fireEvent.click(within(thumb).getByRole("button", { name: "Chọn ảnh 2" }));
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/delivery/thumbnail/pick", body: { name: "ep", n: 2 } }));
    expect(within(thumb).getByRole("img", { name: "Thumbnail 1" }).getAttribute("src")).toMatch(/^\/p\/ep\/delivery\/thumb-1\.jpg\?v=/);
    const text = within(panel).getByRole("listitem", { name: "Tiêu đề và mô tả" });
    fireEvent.click(within(text).getByRole("button", { name: "Nhờ đạo diễn sửa" }));
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/delivery/ask", body: { name: "ep", row: "text" } }));
    await waitFor(() => expect(within(drive).getByRole("button", { name: "Tải lên Drive" })).toBeEnabled());
    fireEvent.click(within(drive).getByRole("button", { name: "Tải lên Drive" }));
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/delivery/drive", body: { name: "ep" } }));
  });

  test("no final render: the video button is off and says why", async () => {
    routes({ "/api/delivery": status({ input: null }) });
    open(<DeliveryPanel />);
    const panel = await screen.findByRole("region", { name: "Giao nộp" });
    expect(within(panel).getByRole("button", { name: "Xuất 3 nền tảng" })).toBeDisabled();
    expect(within(panel).getByText(/Chưa có renders\/\*-final\.mp4/)).toBeInTheDocument();
  });

  test("nothing outside a series (404)", async () => {
    const { fetch } = routes({ "/api/delivery": undefined });
    const { container } = open(<DeliveryPanel />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(within(container).queryByRole("region", { name: "Giao nộp" })).toBeNull();
    expect(within(container).queryByText(/^Giao nộp:/)).toBeNull();
  });
});

describe("handoff card", () => {
  test("shows the text to paste; Chép copies it; Đã xử lý posts the step", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { posts } = routes();
    open(<HandoffCard />);
    const c = await screen.findByRole("region", { name: "Cần xử lý ngoài: build-rig" });
    expect(within(c).getByText(/bước "build-rig" lỗi/)).toBeInTheDocument();
    fireEvent.click(within(c).getByRole("button", { name: "Chép" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Trong thư mục dự án /x: bước \"build-rig\" lỗi"));
    fireEvent.click(within(c).getByRole("button", { name: "Đã xử lý" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/handoff/resolve", body: { name: "ep", step: "build-rig" } }]));
  });

  test("nothing when no card is open", async () => {
    const { fetch } = routes({ "/api/handoff": { cards: [] } });
    const { container } = open(<HandoffCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(within(container).queryByRole("region", { name: /Cần xử lý ngoài/ })).toBeNull();
  });
});
