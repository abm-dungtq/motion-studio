import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useStudio } from "@/store/studio.ts";
import { createStudio, getTabs } from "@/ext/registry.ts";
import { AssetsTab, boardsOf, LEAD } from "./AssetsTab.tsx";
import { extraTurnsText } from "./ConsentCard.tsx";
import { register } from "./index.ts";
import type { AssetsList } from "./types.ts";

// Shapes of GET /api/series and GET /api/assets (routes/series.mjs, routes/assets.mjs).
const SERIES = { name: "Series Thử", dir: "/s", characters: ["thu"], roles: [], writable: ["refs", "rig_src", "props"] };
const CARD = { id: "c-1", kind: "codex", title: "Đợt bà nội: 4 ảnh, codex-pool, ước 4 lượt vẽ; acct1 còn 62% trong 5 giờ", count: 4, estimate: { images: 4, codex_turns: 4, agent: "codex-pool" }, quota: { accounts: [{ name: "acct1", ok: true, h5: 38 }] }, status: "waiting" };
const item = (id: string, kind: string, extra = {}) => ({ id, kind, character: null, target: null, status: "keyed", raw: `assets/gen/raw/${id}.png`, keyed: `assets/gen/keyed/${id}.${kind === "background" ? "png" : "pxl"}`, preview: `assets/gen/keyed/${id}.png`, reasons: [], ...extra });
const ASSETS: AssetsList = {
  series: "Series Thử",
  batches: [
    { batch: "ba-noi", running: false, consent: CARD as AssetsList["batches"][0]["consent"], job: null, items: [] },
    {
      batch: "dot", running: false, consent: null, job: null,
      items: [
        item("ngoi", "pose", { character: "thu" }),
        item("dung", "pose", { character: "thu", status: "needs_review", reasons: ["tay trái thừa ngón"] }),
        item("bg-san", "background"),
        item("ly", "prop", { status: "drawing", preview: null }),
      ] as AssetsList["batches"][0]["items"],
    },
  ],
};

function routes(over: Record<string, unknown> = {}) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const post = (path: string, answer: unknown) => (_u: URL, init?: RequestInit) => { posts.push({ path, body: JSON.parse(String(init?.body ?? "{}")) }); return answer; };
  const fetch = mockFetch({
    "/api/series": SERIES,
    "/api/assets": ASSETS,
    "/api/consent/answer": post("/api/consent/answer", { card: { ...CARD, status: "approved" }, job: { id: "j1", status: "running" } }),
    "/api/assets/approve": post("/api/assets/approve", { ok: true, ids: ["ngoi"], copied: [] }),
    "/api/assets/redo": post("/api/assets/redo", { job: { id: "j2" } }),
    ...over,
  });
  return { fetch, posts };
}

function open(name: string | null) {
  act(() => { useStudio.setState({ name }); });
  return renderUi(<AssetsTab />);
}

describe("Tài sản tab", () => {
  test("registers in the assets group", () => {
    register(createStudio());
    expect(getTabs().find((x) => x.id === "series-assets")).toMatchObject({ label: "Tài sản", group: "assets", lead: LEAD });
  });

  test("a project of no series says so in one sentence", async () => {
    mockFetch({});
    open("le");
    expect(await screen.findByText("Dự án này không thuộc series nào.")).toBeInTheDocument();
  });

  test("shows the waiting consent card; Đồng ý posts the answer to the consent route", async () => {
    const { posts } = routes();
    open("ep");
    const card = await screen.findByRole("region", { name: "Thẻ chờ đồng ý" });
    expect(within(card).getByText(CARD.title)).toBeInTheDocument();
    expect(within(card).getByText("acct1 còn 62% trong 5 giờ")).toBeInTheDocument();
    expect(within(card).getByText(extraTurnsText(4))).toBeInTheDocument();
    expect(extraTurnsText(4)).toContain("Tối đa 8 lượt vẽ và 8 lượt đọc ảnh");
    fireEvent.click(within(card).getByRole("button", { name: "Đồng ý" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/consent/answer", body: { name: "ep", id: "c-1", ok: true } }]));
  });

  test("boards in order with states in words; Duyệt cả bảng sends the keyed images of the sheet", async () => {
    const { posts } = routes();
    const { container } = open("ep");
    const sheet = await screen.findByRole("region", { name: "Tờ nhân vật thu" });
    expect(within(container).getAllByRole("region").map((r) => r.getAttribute("aria-label")).filter((l) => !l?.startsWith("Notifications"))).toEqual(["Thẻ chờ đồng ý", "Tờ nhân vật thu", "Bảng nền", "Bảng đạo cụ"]);
    expect(within(sheet).getByText("chờ duyệt")).toBeInTheDocument();
    expect(within(sheet).getByText("cần xem")).toBeInTheDocument();
    expect(within(sheet).getByText("Tự kiểm: tay trái thừa ngón")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Bảng đạo cụ" })).getByText("đang vẽ")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Duyệt cả bảng" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/assets/approve", body: { name: "ep", batch: "dot", board: "character:thu", ids: ["ngoi"] } }]));
  });

  test("Vẽ lại stays off until an image is ticked and a reason is written", async () => {
    const { posts } = routes();
    open("ep");
    const sheet = await screen.findByRole("region", { name: "Tờ nhân vật thu" });
    const redo = within(sheet).getByRole("button", { name: "Vẽ lại ảnh đã đánh dấu" });
    expect(redo).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Đánh dấu dung" }));
    expect(redo).toBeDisabled();
    fireEvent.change(within(sheet).getByRole("textbox", { name: /Lý do vẽ lại/ }), { target: { value: "  " } });
    expect(redo).toBeDisabled();
    fireEvent.change(within(sheet).getByRole("textbox", { name: /Lý do vẽ lại/ }), { target: { value: "Bỏ ngón tay thừa." } });
    expect(redo).toBeEnabled();
    fireEvent.click(redo);
    await waitFor(() => expect(posts).toEqual([{ path: "/api/assets/redo", body: { name: "ep", batch: "dot", ids: ["dung"], reason: "Bỏ ngón tay thừa.", from: "board" } }]));
  });

  test("images are pixelated; 4× by default on a sheet, 2× on backgrounds, the buttons change the size class", async () => {
    routes();
    open("ep");
    const sheet = await screen.findByRole("region", { name: "Tờ nhân vật thu" });
    const img = within(sheet).getByRole("img", { name: "Ảnh ngoi" });
    expect(img.style.imageRendering).toBe("pixelated");
    expect(img.className).toContain("[image-rendering:pixelated]");
    expect(img.getAttribute("src")).toBe("/p/ep/assets/gen/keyed/ngoi.png");
    expect(img.className).toContain("[zoom:4]");
    expect(within(screen.getByRole("region", { name: "Bảng nền" })).getByRole("img", { name: "Ảnh bg-san" }).className).toContain("[zoom:2]");
    fireEvent.click(within(sheet).getByRole("button", { name: "8×" }));
    expect(img.className).toContain("[zoom:8]");
    expect(img.className).not.toContain("[zoom:4]");
    expect(within(sheet).getByRole("button", { name: "8×" })).toHaveAttribute("aria-pressed", "true");
  });

  test("Xem rộng opens the board in a dialog with every image at full size, side by side", async () => {
    routes();
    open("ep");
    const sheet = await screen.findByRole("region", { name: "Tờ nhân vật thu" });
    expect(within(sheet).getByRole("img", { name: "Ảnh ngoi" }).parentElement).toHaveAttribute("data-fit", "cell");
    fireEvent.click(within(sheet).getByRole("button", { name: "Xem rộng Tờ nhân vật thu" }));
    const dialog = await screen.findByRole("dialog", { name: "Tờ nhân vật thu" });
    const imgs = within(dialog).getAllByRole("img");
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual(["Ảnh ngoi", "Ảnh dung"]);
    for (const i of imgs) {
      expect(i.parentElement).toHaveAttribute("data-fit", "wide");
      expect(i.parentElement?.className).not.toContain("max-h-96");
      expect(i.className).toContain("[zoom:4]");
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "8×" }));
    expect(imgs[0].className).toContain("[zoom:8]");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(sheet).getByRole("img", { name: "Ảnh ngoi" }).className).toContain("[zoom:8]");
  });

  test("a tick and a reason given in the wide view are the board's; Vẽ lại and Duyệt work from the dialog", async () => {
    const { posts } = routes();
    open("ep");
    const sheet = await screen.findByRole("region", { name: "Tờ nhân vật thu" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Xem rộng Tờ nhân vật thu" }));
    let dialog = await screen.findByRole("dialog", { name: "Tờ nhân vật thu" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Đánh dấu dung" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Lý do vẽ lại/ }), { target: { value: "Bỏ ngón tay thừa." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(sheet).getByRole("checkbox", { name: "Đánh dấu dung" })).toBeChecked();
    expect(within(sheet).getByRole("textbox", { name: /Lý do vẽ lại/ })).toHaveValue("Bỏ ngón tay thừa.");
    expect(within(sheet).getByRole("button", { name: "Vẽ lại ảnh đã đánh dấu" })).toBeEnabled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Xem rộng Tờ nhân vật thu" }));
    dialog = await screen.findByRole("dialog", { name: "Tờ nhân vật thu" });
    expect(within(dialog).getByRole("checkbox", { name: "Đánh dấu dung" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Duyệt cả bảng" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/assets/approve", body: { name: "ep", batch: "dot", board: "character:thu", ids: ["ngoi", "dung"] } }]));
    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: "Đánh dấu dung" })).not.toBeChecked());
  });

  test("boardsOf leaves screen cards and thumbnails out", () => {
    const list: AssetsList = { series: "x", batches: [{ batch: "b", running: false, consent: null, job: null, items: [item("the", "ui-card"), item("thumb", "thumbnail")] as AssetsList["batches"][0]["items"] }] };
    expect(boardsOf(list)).toEqual([]);
  });
});
