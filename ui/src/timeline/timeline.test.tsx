import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { Profiler } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient, say } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { MEDIA_DRAG } from "@/core/dnd.ts";
import { musicDragOps, rippleLineOps, rollOps } from "@/core/timeline-edit.ts";
import { registerTimelineDecorator } from "@/ext/registry.ts";
import { PointMenuHost } from "@/shell/PointMenu.tsx";
import { useStudio } from "@/store/studio.ts";
import { TimelineArea, TIMELINE_HINT } from "./index.tsx";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

const base = (): Manifest => ({
  version: 3,
  duration: 12,
  fps: 30,
  capabilities: { editable: true },
  shots: [{ id: "s1", name: "Mở", start: 0, end: 5 }, { id: "s2", name: "Giữa", start: 5, end: 9 }, { id: "s3", start: 9, end: 12 }],
  lines: [
    { id: "vo-01", shot: "s1", text: "Câu một", start: 0.5, duration: 1.5 },
    { id: "vo-02", shot: "s2", text: "Câu hai", start: 5.5, duration: 1 },
    { id: "vo-03", shot: "s2", text: "Câu ba", start: 7, duration: 1 },
  ],
  music: [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: 10, gain: 0.5 }],
  events: [{ id: "sfx-a", shot: "s1", offset: 3, label: "Cọ" }, { id: "sfx-b", shot: "s3", offset: 1, studio: true }],
});

function open(m: Manifest = base(), extra: Record<string, unknown> = {}) {
  queryClient.setQueryData(Q.keys.projects(), [{ name: "demo", title: "Demo", has_manifest: true, editable: Boolean(m.capabilities?.editable), version: m.version }]);
  queryClient.setQueryData(Q.keys.project("demo"), m);
  mockFetch({ "/api/project": m, "/api/projects": [], "/api/timeline/media": { render: null, files: {} }, "/api/timing": { grid: null, lines: [] }, "/api/log": [], ...extra });
  useStudio.setState({ name: "demo", pps: 60, snap: false });
}

let patch: ReturnType<typeof vi.spyOn>;
let pick: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  patch = vi.spyOn(actions, "patch").mockResolvedValue(true);
  pick = vi.spyOn(actions, "pick");
});

const el = (sel: string): HTMLElement => {
  const x = document.querySelector<HTMLElement>(sel);
  if (!x) throw new Error(`no ${sel}`);
  return x;
};

// A press at x 100, moves to 100 + dx, release there.
function drag(target: HTMLElement, dx: number, opts: { shiftKey?: boolean } = {}) {
  fireEvent.pointerDown(target, { button: 0, clientX: 100, pointerId: 1, ...opts });
  fireEvent.pointerMove(target, { clientX: 100 + dx / 2, pointerId: 1, ...opts });
  fireEvent.pointerMove(target, { clientX: 100 + dx, pointerId: 1, ...opts });
  fireEvent.pointerUp(target, { clientX: 100 + dx, pointerId: 1, ...opts });
}

describe("TimelineArea", () => {
  it("shows the key hint and 'Chưa có timeline' without a project", () => {
    mockFetch({ "/api/projects": [] });
    renderUi(<TimelineArea />);
    expect(screen.getByTestId("timeline-area")).toBeInTheDocument();
    expect(screen.getByText(TIMELINE_HINT)).toBeInTheDocument();
    expect(screen.getByText("Chưa có timeline")).toBeInTheDocument();
  });

  it("draws five tracks with every block", () => {
    open();
    renderUi(<TimelineArea />);
    expect([...document.querySelectorAll(".tl-label")].map((e) => e.firstChild?.textContent)).toEqual(["Shot", "B-roll", "Lồng tiếng", "Nhạc", "SFX"]);
    expect(document.querySelectorAll('[data-kind="shot"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-kind="broll"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-kind="line"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-kind="music"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-kind="event"]')).toHaveLength(2);
    expect(el('[data-id="s1"]').textContent).toContain("1 · Mở");
    expect(el('[data-shot="s1"]').title).toBe("Thả footage vào đây để thêm cho s1");
  });

  it("Ripple: dragging a shot's right edge 30 px sends one resize_shot", () => {
    open();
    renderUi(<TimelineArea />);
    drag(el('[data-id="s1"] .handle'), 30);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith([{ op: "resize_shot", id: "s1", duration: 5.5 }]);
  });

  it("Roll: the same drag sends exactly rollOps", () => {
    open();
    useStudio.setState({ mode: "roll" });
    renderUi(<TimelineArea />);
    expect(el('[data-id="s3"] .handle').title).toBe("Shot cuối: Roll cần shot kế tiếp, kéo sẽ không đổi gì");
    drag(el('[data-id="s1"] .handle'), 30);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(rollOps(base(), "s1", 0.5).ops);
  });

  it("dragging a line sends move_line; with Shift exactly rippleLineOps", () => {
    open();
    renderUi(<TimelineArea />);
    drag(el('[data-id="vo-01"]'), 30);
    expect(patch).toHaveBeenLastCalledWith([{ op: "move_line", id: "vo-01", start: 1 }]);
    drag(el('[data-id="vo-02"]'), 30, { shiftKey: true });
    expect(patch).toHaveBeenLastCalledWith(rippleLineOps(base(), "vo-02", 6).ops);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(rippleLineOps(base(), "vo-02", 6).ops).toHaveLength(2);
  });

  it("dragging an SFX sends move_event; dragging the music sends musicDragOps", () => {
    open();
    renderUi(<TimelineArea />);
    drag(el('[data-id="sfx-a"]'), 15);
    expect(patch).toHaveBeenLastCalledWith([{ op: "move_event", id: "sfx-a", start: 3.25 }]);
    const m = base();
    drag(el('[data-id="bgm"]'), 60);
    expect(patch).toHaveBeenLastCalledWith([musicDragOps(m.music![0], "move", 1, 12)]);
    drag(el('[data-id="bgm"] .handle:not(.left)'), -60);
    expect(patch).toHaveBeenLastCalledWith([musicDragOps(m.music![0], "trim-end", -1, 12)]);
    drag(el('[data-id="bgm"] .handle.left'), 30);
    expect(patch).toHaveBeenLastCalledWith([musicDragOps(m.music![0], "trim-start", 0.5, 12)]);
    expect(patch).toHaveBeenCalledTimes(4);
  });

  it("a press that moves 2 px picks the block and sends nothing", () => {
    open();
    renderUi(<TimelineArea />);
    drag(el('[data-id="vo-02"]'), 2);
    drag(el('[data-id="sfx-a"]'), 2);
    drag(el('[data-id="bgm"]'), 2);
    expect(patch).not.toHaveBeenCalled();
    expect(pick.mock.calls).toEqual([["line", "vo-02"], ["event", "sfx-a"], ["music", "bgm"]]);
  });

  it("a view-only project: drags send nothing, a click still picks", () => {
    const m = { ...base(), capabilities: { editable: false } };
    open(m);
    renderUi(<TimelineArea />);
    expect(el('[data-testid="timeline-inner"]').classList.contains("readonly")).toBe(true);
    drag(el('[data-id="s1"] .handle'), 30);
    drag(el('[data-id="vo-01"]'), 30);
    drag(el('[data-id="sfx-a"]'), 30);
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(el('[data-id="vo-01"]'));
    expect(pick).toHaveBeenLastCalledWith("line", "vo-01");
  });

  it("snapping pulls a dragged SFX onto a shot edge and shows the snap line", () => {
    open();
    useStudio.setState({ snap: true });
    renderUi(<TimelineArea />);
    // sfx-a at 3 s; 117 px is 4.95 s, 3 px from the s1/s2 cut at 5 s.
    const b = el('[data-id="sfx-a"]');
    fireEvent.pointerDown(b, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(b, { clientX: 217, pointerId: 1 });
    expect(el('[data-testid="snap-line"]').hidden).toBe(false);
    fireEvent.pointerUp(b, { clientX: 217, pointerId: 1 });
    expect(el('[data-testid="snap-line"]').hidden).toBe(true);
    expect(patch).toHaveBeenCalledWith([{ op: "move_event", id: "sfx-a", start: 5 }]);
  });

  it("setT moves the knob without rendering any block again", () => {
    open();
    const commits = vi.fn();
    renderUi(<Profiler id="timeline" onRender={commits}><TimelineArea /></Profiler>);
    const head = el('[data-testid="playhead"]');
    const before = head.style.transform;
    commits.mockClear();
    act(() => useStudio.getState().setT(5));
    expect(head.style.transform).not.toBe(before);
    expect(head.style.transform).toBe("translateX(389px)");
    expect(commits).not.toHaveBeenCalled();
  });

  it("zoom buttons and the mode and snap buttons", () => {
    open();
    renderUi(<TimelineArea />);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to" }));
    expect(useStudio.getState().pps).toBe(75);
    fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
    expect(useStudio.getState().pps).toBe(60);
    fireEvent.click(screen.getByTestId("mode-btn"));
    expect(screen.getByTestId("mode-btn")).toHaveTextContent("Roll");
    expect(screen.getByTestId("mode-btn")).toHaveAttribute("aria-pressed", "true");
    expect(say).toHaveBeenLastCalledWith("Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên");
    fireEvent.click(screen.getByTestId("snap-btn"));
    expect(say).toHaveBeenLastCalledWith("Hít: bật");
    expect(screen.getByTestId("snap-btn")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("timing-undo")).toBeDisabled();
    expect(screen.getByTestId("timing-undo")).toHaveAttribute("title", "Chưa sửa mốc phách hay mốc từ nào");
  });

  it("M and S change only the player's audio rule", () => {
    open();
    renderUi(<TimelineArea />);
    fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Nhạc" }));
    fireEvent.click(screen.getByRole("button", { name: "Chỉ nghe Lồng tiếng" }));
    expect(useStudio.getState().audio).toEqual({ mute: ["music"], solo: ["voice"] });
    expect(screen.getByRole("button", { name: "Tắt tiếng Nhạc" })).toHaveAttribute("aria-pressed", "true");
    expect(patch).not.toHaveBeenCalled();
  });

  it("dropping a broken MEDIA_DRAG says it could not read the file", () => {
    open();
    renderUi(<TimelineArea />);
    const dataTransfer = { types: [MEDIA_DRAG], getData: () => "{broken", dropEffect: "" };
    fireEvent.drop(el('[data-shot="s2"]'), { dataTransfer });
    expect(say).toHaveBeenCalledWith("Không đọc được file vừa thả", true);
  });

  it("dropping footage on a B-roll block posts /api/timeline/asset", async () => {
    const posted: unknown[] = [];
    open(base(), { "/api/timeline/asset": (_u: URL, init?: RequestInit) => { posted.push(JSON.parse(String(init?.body))); return { path: "pitch/2.png" }; } });
    renderUi(<TimelineArea />);
    const dataTransfer = { types: [MEDIA_DRAG], getData: () => JSON.stringify({ rel: "pitch/2.png", kind: "img", path: "/w/pitch/2.png" }), dropEffect: "" };
    fireEvent.drop(el('[data-shot="s2"]'), { dataTransfer });
    await waitFor(() => expect(say).toHaveBeenCalledWith("Đã thêm 2.png vào s2"));
    expect(posted).toEqual([{ name: "demo", shot: "s2", base: 3, path: "/w/pitch/2.png" }]);
  });

  it("right click menus of a shot, a director SFX, a Studio SFX and empty SFX lane", async () => {
    open();
    renderUi(<><TimelineArea /><PointMenuHost /></>);
    const labels = async () => (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    fireEvent.contextMenu(el('[data-id="s2"]'));
    expect(await labels()).toEqual(["Cắt tại playhead (S)", "Roll điểm cắt về playhead", "Nhờ đạo diễn sửa shot này"]);
    fireEvent.contextMenu(el('[data-id="s3"]'));
    expect(await labels()).toEqual(["Cắt tại playhead (S)", "Nhờ đạo diễn sửa shot này"]);
    fireEvent.contextMenu(el('[data-id="sfx-a"]'));
    expect(await labels()).toEqual(["Nhờ đạo diễn xoá SFX này"]);
    fireEvent.contextMenu(el('[data-id="sfx-b"]'));
    expect(await labels()).toEqual(["Xoá SFX"]);
    fireEvent.contextMenu(el('[data-id="bgm"]'));
    expect(await labels()).toEqual(["Đưa về đầu video", "Chạy tới hết video"]);
    fireEvent.contextMenu(el('[data-testid="lane-sfx"]'));
    expect(await labels()).toEqual(["Thêm SFX tại đây…"]);
  });

  it("draws the decorators' bands and marks, view only", () => {
    open();
    registerTimelineDecorator(() => [
      { t: 1, until: 3, lane: "shot", label: "dải thử", kind: "warn" },
      { t: 2, lane: "voice", label: "vạch thử", kind: "info" },
      { t: 2, lane: "nowhere" as "shot", label: "bỏ", kind: "info" },
    ]);
    registerTimelineDecorator(() => { throw new Error("hỏng"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderUi(<TimelineArea />);
    const deco = [...document.querySelectorAll<HTMLElement>(".tl-deco")];
    expect(deco.map((d) => [d.dataset.kind, d.classList.contains("band"), d.title, d.style.pointerEvents])).toEqual([
      ["warn", true, "dải thử", "none"],
      ["info", false, "vạch thử", "none"],
    ]);
    expect(deco[0].textContent).toBe("dải thử");
  });
});
