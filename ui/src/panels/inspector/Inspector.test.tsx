import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { markers } from "@/api/markers.ts";
import { bus } from "@/core/bus.ts";
import { createStudio } from "@/ext/registry.ts";
import { InspectorHost } from "@/shell/InspectorHost.tsx";
import { useStudio, type PickKind } from "@/store/studio.ts";
import { openProject, routes } from "@/panels/director/fixtures.ts";
import { register } from "./index.ts";

beforeEach(() => { vi.mocked(say).mockClear(); mockFetch(routes()); });

function show(kind: PickKind, id: string, { editable = true } = {}) {
  register(createStudio());
  const m = openProject({ editable });
  useStudio.getState().setPick(kind, id, m);
  return renderUi(<div data-slot="right.shot"><InspectorHost /></div>);
}

describe("inspector: shot", () => {
  it("shows the title and fields, and applies one patch with set_shot and resize_shot", async () => {
    const patch = vi.spyOn(actions, "patch").mockResolvedValue(true);
    show("shot", "s2");
    expect(screen.getByText("SHOT 2 · 6.5s–12.5s")).toBeInTheDocument();
    expect(screen.getByText("Chất liệu (0)")).toBeInTheDocument();
    expect(screen.getByText("Chưa có chất liệu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(say).toHaveBeenCalledWith("Không có gì thay đổi");
    fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Chữ tiếng Việt rõ" } });
    fireEvent.change(screen.getByLabelText("Số giây"), { target: { value: "7" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Áp dụng" })); });
    expect(patch).toHaveBeenCalledWith([
      { op: "set_shot", id: "s2", field: "name", value: "Chữ tiếng Việt rõ" },
      { op: "resize_shot", id: "s2", duration: 7 },
    ]);
    expect(say).toHaveBeenCalledWith("Đã áp dụng");
  });

  it("asks the director with the note at the playhead", () => {
    const direct = vi.spyOn(actions, "direct").mockResolvedValue(true);
    show("shot", "s2");
    useStudio.setState({ t: 7.04 });
    fireEvent.change(screen.getByLabelText("Chuyển động"), { target: { value: " cho chữ to hơn " } });
    fireEvent.click(screen.getByRole("button", { name: "Nhờ đạo diễn" }));
    expect(direct).toHaveBeenCalledWith({ scope: "shot", target: "s2", t: 7, text: "cho chữ to hơn" });
  });

  it("disables the fields on a read-only project but keeps the note editable", () => {
    show("shot", "s2", { editable: false });
    expect(screen.getByLabelText("Tên")).toBeDisabled();
    expect(screen.getByLabelText("Số giây")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Chuyển cảnh vào" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Áp dụng" })).toBeDisabled();
    expect(screen.getByLabelText("Chuyển động")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nhờ đạo diễn" })).toBeEnabled();
  });

  it("focuses the motion note on focus-note", async () => {
    show("shot", "s2");
    await act(async () => { bus.emit("focus-note"); await new Promise((r) => requestAnimationFrame(r)); });
    expect(document.activeElement).toBe(screen.getByLabelText("Chuyển động"));
  });

  it("starts with the retimed note when a marker change rebuilt TIMING", () => {
    show("shot", "s1");
    expect(document.querySelector('[data-role="retimed"]')).toBeNull();
    act(() => useStudio.getState().setRetimed(true));
    expect(document.querySelector('[data-role="retimed"]')).toHaveTextContent("Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất");
  });
});

describe("inspector: line, music, SFX", () => {
  it("shows a line with the stale note and the button to the voice tab", () => {
    show("line", "vo-03");
    expect(screen.getByText("CÂU vo-03 · 12.8s–16.4s")).toBeInTheDocument();
    expect(screen.getByText("Lời đã sửa, cần qua cổng viet-pro và lồng tiếng lại")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sửa lời ở tab Lời & giọng" }));
    expect(useStudio.getState().leftTab).toBe("voice");
  });

  it("sends one update_music with the changed fields only", async () => {
    const patch = vi.spyOn(actions, "patch").mockResolvedValue(true);
    show("music", "bgm");
    expect(screen.getByText("NHẠC · bgm.mp3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Âm lượng (%)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(say).toHaveBeenCalledWith("Âm lượng trong 0–100%", true);
    fireEvent.change(screen.getByLabelText("Âm lượng (%)"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Fade vào (giây)"), { target: { value: "1.5" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Áp dụng" })); });
    expect(patch).toHaveBeenCalledWith([{ op: "update_music", id: "bgm", gain: 0.6, fade_in: 1.5 }]);
  });

  it("offers Xoá SFX only for an SFX added in Studio", () => {
    const remove = vi.spyOn(actions, "directRemoveSfx").mockResolvedValue(true);
    const first = show("event", "sfx-whoosh");
    expect(screen.getByText("SFX sfx-whoosh · 0:06.3")).toBeInTheDocument();
    expect(screen.getByLabelText("Nhãn")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Xoá SFX" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nhờ đạo diễn xoá SFX này" }));
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: "sfx-whoosh" }));
    first.unmount();
    act(() => useStudio.getState().setPick("event", "sfx-1"));
    renderUi(<div data-slot="right.shot"><InspectorHost /></div>);
    expect(screen.getByRole("button", { name: "Xoá SFX" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nhờ đạo diễn xoá SFX này" })).toBeNull();
  });

  it("says a marker is gone when the timing data has none", () => {
    show("beat", "bgm");
    expect(screen.getByText("MỐC PHÁCH")).toBeInTheDocument();
    expect(screen.getByText("Mốc này không còn (file đã đổi). Chọn lại trên timeline.")).toBeInTheDocument();
  });

  it("shows a word marker with its times and the sync check", async () => {
    mockFetch({ ...routes(), "/api/timing": {
      grid: { music_id: "bgm", file: "assets/bgm/bgm.mp3.beats.json", sha: "a", beat0: 0.004, beatLen: 0.473, original: 0.004 },
      lines: [{ id: "vo-03", file: "assets/voice/03.mp3.words.json", sha: "b", offset: 12.8, words: [{ text: "Kéo", start: 0, end: 0.2 }, { text: "dài", start: 0.25, end: 0.5 }], original: [{ start: 0, end: 0.2 }, { start: 0.2, end: 0.5 }] }],
      undo: 2, busy: null,
    } });
    const sync = vi.spyOn(markers, "wordSync").mockResolvedValue();
    show("word", "vo-03#1");
    await act(async () => { await markers.load(); });
    expect(screen.getByText('MỐC TỪ · "dài"')).toBeInTheDocument();
    expect(screen.getByText("vo-03 · từ #2/2 · assets/voice/03.mp3.words.json")).toBeInTheDocument();
    expect(screen.getByText("13.050s – 13.300s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Về gốc" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Hoàn tác mốc (2)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm khớp lời" }));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("shows the beat grid with its BPM", async () => {
    mockFetch({ ...routes(), "/api/timing": { grid: { music_id: "bgm", file: "assets/bgm/bgm.mp3.beats.json", sha: "a", beat0: 0.004, beatLen: 0.473, original: 0.004 }, lines: [], undo: 0 } });
    show("beat", "bgm");
    await act(async () => { await markers.load(); });
    expect(screen.getByText("MỐC PHÁCH · bgm.mp3.beats.json")).toBeInTheDocument();
    expect(screen.getByText("assets/bgm/bgm.mp3.beats.json · 126.8 BPM · một phách 0.473s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Về gốc" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hoàn tác mốc" })).toBeDisabled();
  });
});
