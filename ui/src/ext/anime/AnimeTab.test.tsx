import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bus } from "@/core/bus.ts";
import { useStudio } from "@/store/studio.ts";
import { AnimeTab, LEAD, useJobEndsBadge } from "./AnimeTab.tsx";
import { useAnimeStore } from "./store.ts";
import { register } from "./index.ts";
import { createStudio, getTabs } from "@/ext/registry.ts";

const h = vi.hoisted(() => ({ say: vi.fn(), pick: vi.fn(), seek: vi.fn(), manifest: vi.fn(), rebuild: vi.fn(), variant: vi.fn() }));

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: h.say }));
vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), animeManifest: h.manifest, animeRebuild: h.rebuild, animeVariant: h.variant }));
vi.mock("@/api/actions.ts", async (orig) => {
  const real = await orig<typeof import("@/api/actions.ts")>();
  return { ...real, actions: { ...real.actions, pick: h.pick, transport: { ...real.actions.transport, seek: h.seek } } };
});

// Shapes of GET /api/anime/* (routes/anime.mjs, lib/anime/board.mjs).
const COLUMNS = [{ id: "missing", label: "Thiếu plate" }, { id: "plate", label: "Có plate" }, { id: "variants", label: "Có biến thể" }, { id: "animated", label: "Đã có track" }];
const shot = (id: string, start: number, extra = {}) => ({ id, name: `Cảnh ${id}`, start, end: start + 3, thumb: null, plates: [], variants: [], stacks: [], tracks: 0, status: "missing", ...extra });
const BOARD = { source: "project", note: null, columns: COLUMNS, shots: [shot("s1", 0), shot("s2", 7.1, { status: "plate", plates: ["assets/plates/s2-a.png"], thumb: "assets/plates/s2-a.png" })], chars: [] };
const MANIFEST = { exists: true, enabled: true, manifest: { stacks: { "s2-chu": { shot: "s2", tracks: [] } }, impacts: [] }, sha: "93f3711b", final: [], backups: [] };

function routes(over: Record<string, unknown> = {}) {
  return mockFetch({
    "/api/projects": [{ name: "demo", has_manifest: true }, { name: "raw", has_manifest: false }],
    "/api/project": { shots: [{ id: "s1", start: 0 }, { id: "s2", start: 7.1 }], lines: [], version: 4 },
    "/api/anime/board": BOARD,
    "/api/anime/chars": { chars: [] },
    "/api/anime/manifest": MANIFEST,
    ...over,
  });
}

// The rail renders the tab's badge whether the tab is open or not; it follows the jobs.
function RailBadge() { useJobEndsBadge(); return null; }

function open(name: string | null, sub: "board" | "chars" | "anim" = "board") {
  act(() => { useStudio.setState({ name }); useAnimeStore.getState().setSub(sub); });
  return renderUi(<><RailBadge /><AnimeTab /></>);
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  useAnimeStore.getState().setSub("board");
});

describe("Anime tab", () => {
  test("registers in the assets group with the old lead", () => {
    register(createStudio());
    const t = getTabs().find((x) => x.id === "anime");
    expect(t).toMatchObject({ label: "Anime", group: "assets", order: 30, lead: LEAD, badge: useJobEndsBadge });
    expect(LEAD).toBe("Motion comic: nhân vật, shot board, biến thể tư thế và hoạt hình lật ảnh");
  });

  test("shows three sub-tabs with the old labels", async () => {
    routes();
    open("demo");
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Shot board", "Nhân vật", "Hoạt hình"]);
  });

  test("no project: the old empty text", () => {
    routes();
    open(null);
    expect(screen.getByText("Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng.")).toBeInTheDocument();
  });

  test("a project without project.json still shows the shot board", async () => {
    routes({ "/api/anime/board": { ...BOARD, source: "manifest" } });
    open("raw");
    expect(await screen.findByText("Thiếu plate")).toBeInTheDocument();
    expect(screen.getByText("Có plate")).toBeInTheDocument();
    expect(screen.queryByText(/Dự án chưa có project.json/)).toBeNull();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });

  test("board errors and empty board use the old texts", async () => {
    routes({ "/api/anime/board": { ...BOARD, shots: [], note: "ghi chú thử" } });
    open("raw");
    expect(await screen.findByText("Chưa có shot nào. Nhập dự án (project.json) hoặc thêm stack vào assets/anim/manifest.json ở mục Hoạt hình.")).toBeInTheDocument();
    expect(screen.getByText("ghi chú thử")).toBeInTheDocument();
  });

  test("picking a shot emits anime:shot and, with a manifest, picks and seeks to its start", async () => {
    routes();
    const seen: unknown[] = [];
    const off = bus.on("anime:shot", (s) => seen.push(s));
    open("demo");
    const card = await screen.findByRole("button", { name: /s2 · Cảnh s2/ });
    await waitFor(() => expect(useStudio.getState().name).toBe("demo"));
    // wait for the manifest so the pick reaches the timeline
    await waitFor(async () => {
      fireEvent.click(card);
      expect(h.pick).toHaveBeenCalledWith("shot", "s2");
    });
    expect(h.seek).toHaveBeenCalledWith(7.1);
    expect((seen[0] as { id: string }).id).toBe("s2");
    off();
    expect(screen.getByText("Sinh biến thể tư thế")).toBeInTheDocument();
    expect(screen.getByText("Chưa có sheet nhân vật (mục Nhân vật).")).toBeInTheDocument();
  });

  test("without a manifest, picking a shot does not touch the timeline", async () => {
    routes();
    open("raw");
    fireEvent.click(await screen.findByRole("button", { name: /s1 · Cảnh s1/ }));
    expect(h.pick).not.toHaveBeenCalled();
    expect(screen.getByText("Shot s1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sinh biến thể" })).toBeDisabled();
  });

  test("Sinh biến thể: asks first, then posts and follows the job", async () => {
    routes({ "/api/anime/job": { job: { id: "j1", status: "done", code: 0 }, log: ['RESULT {"ok":true,"file":"assets/plates/anim/s2-v1.png","width":1024,"color":"#0047FF"}'] } }); // token-exempt: test data
    h.variant.mockResolvedValue({ status: 200, data: { job: { id: "j1", status: "running", code: null } } });
    open("demo");
    fireEvent.click(await screen.findByRole("button", { name: /s2 · Cảnh s2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sinh biến thể" }));
    expect(h.say).toHaveBeenCalledWith("Ghi thay đổi cần làm", true);
    fireEvent.change(screen.getByPlaceholderText("mouth half open, eyes unchanged"), { target: { value: "mouth open" } });
    fireEvent.click(screen.getByRole("button", { name: "Sinh biến thể" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("Sinh một ảnh bằng agent sinh ảnh (tốn 1 ảnh quota) cho s2 → s2-v1.png?");
    fireEvent.click(within(dlg).getByRole("button", { name: "Đồng ý" }));
    await waitFor(() => expect(h.variant).toHaveBeenCalledWith(expect.objectContaining({ name: "demo", shot: "s2", base: "assets/plates/s2-a.png", change: "mouth open", out_name: "s2-v1", sim: 0.18, blend: 0.06 })));
    await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đã có s2-v1.png (1024px, nền #0047FF)", false)); // token-exempt: test data
  });
});

test("a job that ends while the tab is closed says so at once", async () => {
  routes({ "/api/anime/job": { job: { id: "j2", status: "done", code: 0 }, log: [] } });
  act(() => { useStudio.setState({ name: "demo" }); useAnimeStore.getState().follow("sheet", { id: "j2", name: "demo", kind: "anime-sheet", status: "running", code: null, started: "2026-10-23T05:00:00.000Z" }, "Tèo"); });
  renderUi(<RailBadge />);
  await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đã có sheet của Tèo", false));
  expect(h.say).toHaveBeenCalledTimes(1);
});

describe("Hoạt hình (manifest editor)", () => {
  test("409: the old message shows and the draft stays", async () => {
    routes();
    h.manifest.mockResolvedValue({ status: 409, error: "manifest đã đổi" });
    open("demo", "anim");
    fireEvent.click(await screen.findByRole("button", { name: "+ lipsync" }));
    expect(screen.getByText("1. lipsync")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu và build" }));
    await waitFor(() => expect(h.say).toHaveBeenCalledWith("Manifest vừa được sửa ở chỗ khác. Bấm Bỏ bản nháp để tải bản mới.", true));
    expect(h.manifest).toHaveBeenCalledWith(expect.objectContaining({ name: "demo", base_sha: "93f3711b", confirm: false }));
    expect(screen.getByText("1. lipsync")).toBeInTheDocument();
    expect(useAnimeStore.getState().draft?.m.stacks["s2-chu"].tracks).toHaveLength(1);
  });

  test("428: a confirm dialog opens; confirming sends again with confirm", async () => {
    routes({ "/api/anime/manifest": { ...MANIFEST, final: ["renders/thu-final.mp4"] } });
    h.manifest
      .mockResolvedValueOnce({ status: 428, error: "dự án đã có bản final (renders/thu-final.mp4): xác nhận trước khi sửa hoạt hình" })
      .mockResolvedValueOnce({ status: 200, data: { sha: "abc", backup: ".opus/anim-backups/x.json", job: null } });
    open("demo", "anim");
    expect(await screen.findByText("Dự án đã có bản final (renders/thu-final.mp4). Lưu sẽ hỏi xác nhận; bản cũ luôn được sao lưu.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu và build" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("Vẫn lưu? Bản cũ được sao lưu vào .opus/anim-backups/.");
    fireEvent.click(within(dlg).getByRole("button", { name: "Đồng ý" }));
    await waitFor(() => expect(h.manifest).toHaveBeenCalledTimes(2));
    expect(h.manifest.mock.calls[1][0]).toMatchObject({ confirm: true });
    await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đã lưu (sao lưu .opus/anim-backups/x.json)"));
  });

  test("428 cancelled: nothing is sent again", async () => {
    routes();
    h.manifest.mockResolvedValue({ status: 428, error: "final" });
    open("demo", "anim");
    fireEvent.click(await screen.findByRole("button", { name: "Lưu và build" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.manifest).toHaveBeenCalledTimes(1);
  });

  test("a bad JSON box blocks the save with the parse error", async () => {
    routes();
    open("demo", "anim");
    const box = await screen.findByLabelText("Khoá khác (JSON)");
    fireEvent.change(box, { target: { value: "{ sai json" } });
    fireEvent.blur(box);
    await waitFor(() => expect(box).toHaveClass("bad"));
    fireEvent.click(screen.getByRole("button", { name: "Lưu và build" }));
    expect(h.say).toHaveBeenCalledWith(expect.stringMatching(/^Ô JSON chưa hợp lệ: /), true);
    expect(h.manifest).not.toHaveBeenCalled();
  });

  test("not enabled: the old empty text and the enable button", async () => {
    routes({ "/api/anime/manifest": { exists: false, enabled: false, manifest: null, sha: null, final: [] } });
    open("demo", "anim");
    expect(await screen.findByText(/Dự án chưa có hệ lật ảnh \(assets\/anim\/\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bật hệ lật ảnh" })).toBeInTheDocument();
  });

  test("Thêm stack needs an id and a shot", async () => {
    routes({ "/api/anime/manifest": { ...MANIFEST, manifest: { stacks: {}, impacts: [] } } });
    open("demo", "anim");
    expect(await screen.findByText("Chưa có stack. Mỗi stack là một phần tử id=… trong index.html.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect(h.say).toHaveBeenCalledWith("Cần id và shot", true);
    fireEvent.change(screen.getByPlaceholderText("id phần tử, ví dụ s3-hero"), { target: { value: "s2-chu" } });
    fireEvent.change(screen.getByPlaceholderText("shot, ví dụ s3"), { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect(screen.getByRole("option", { name: "s2-chu (s2)" })).toBeInTheDocument();
  });

  test("switching sub-tabs keeps the draft", async () => {
    routes();
    const user = userEvent.setup();
    open("demo", "anim");
    fireEvent.click(await screen.findByRole("button", { name: "+ blink" }));
    await user.click(screen.getByRole("tab", { name: "Shot board" }));
    await user.click(screen.getByRole("tab", { name: "Hoạt hình" }));
    expect(await screen.findByText("1. blink")).toBeInTheDocument();
  });

  test("a new project drops the draft and keeps the sub-tab", async () => {
    routes();
    open("demo", "anim");
    fireEvent.click(await screen.findByRole("button", { name: "+ wind" }));
    act(() => { useStudio.setState({ name: "raw" }); });
    expect(useAnimeStore.getState().sub).toBe("anim");
    await waitFor(() => expect(screen.queryByText("1. wind")).toBeNull());
  });
});

test("putting the JSON box back to its first text clears the error", async () => {
  routes();
  open("demo", "anim");
  const box = await screen.findByLabelText("Khoá khác (JSON)");
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "{ sai json" } });
  fireEvent.blur(box);
  await waitFor(() => expect(box).toHaveClass("bad"));
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "{}" } });
  fireEvent.blur(box);
  await waitFor(() => expect(box).not.toHaveClass("bad"));
  expect(useAnimeStore.getState().draft?.rawErr).toBeNull();
});
