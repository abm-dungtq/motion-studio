import "@/shell/test-utils.tsx";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderUi } from "@/shell/test-utils.tsx";
import { actions } from "@/api/actions.ts";
import type { Manifest } from "@/api/types.ts";
import { createStudio, getTabs } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { MUSIC_LEAD, register } from "./index.ts";
import { MusicTab } from "./MusicTab.tsx";

const store = vi.hoisted(() => ({ m: null as unknown }));

vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), useProject: () => ({ data: store.m }) }));
vi.mock("@/api/actions.ts", async (orig) => {
  const real = await orig<typeof import("@/api/actions.ts")>();
  return { ...real, actions: { ...real.actions, patch: vi.fn(async () => true) } };
});

// Shape of GET /api/project?name=thuy-mau-demo (music and events only).
const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  version: 6,
  capabilities: { editable: true },
  lines: [],
  music: [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: 20, gain: 0.52 }],
  events: [
    { id: "sfx-brush-1", shot: "s1", offset: 0.2, sound: "assets/sfx/brush.mp3", label: "Nét cọ đầu tiên quét bầu trời" },
    { id: "sfx-whoosh", shot: "s1", offset: 6.3, sound: "assets/sfx/whoosh.mp3", label: "Máy quay bay xuyên khe núi giữa sang dòng sông" },
    { id: "sfx-x", shot: "s3", offset: 0.2 },
  ],
  ...over,
} as unknown as Manifest);

// jsdom has no layout: give the slider a 100 px track, so clientX is the percentage.
const track = () => {
  const root = document.querySelector<HTMLElement>("[data-slot=slider]")!;
  root.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
  return root;
};

beforeEach(() => {
  store.m = manifest();
  useStudio.setState({ name: "thuy-mau-demo" });
  vi.mocked(actions.patch).mockClear();
});

describe("music tab", () => {
  test("registers in the audio group after voice", () => {
    register(createStudio());
    expect(getTabs().find((t) => t.id === "music")).toMatchObject({ label: "Nhạc & âm thanh", group: "audio", order: 20, lead: MUSIC_LEAD });
  });

  test("a background music card with its file name and volume", () => {
    renderUi(<MusicTab />);
    expect(screen.getByText("bgm.mp3")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Âm lượng assets/bgm/bgm.mp3" })).toBeInTheDocument();
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuemin", "0");
    expect(thumb).toHaveAttribute("aria-valuemax", "100");
    expect(thumb).toHaveAttribute("aria-valuenow", "52");
    expect(screen.getByText("52%")).toBeInTheDocument();
  });

  test("dragging updates the percentage only; releasing at 40 sends set_music 0.4", () => {
    vi.spyOn(Element.prototype, "hasPointerCapture").mockReturnValue(true);
    renderUi(<MusicTab />);
    const root = track();
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 70, button: 0 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 40 });
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(actions.patch).not.toHaveBeenCalled();
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 40 });
    expect(actions.patch).toHaveBeenCalledTimes(1);
    expect(actions.patch).toHaveBeenCalledWith([{ op: "set_music", id: "bgm", field: "gain", value: 0.4 }]);
  });

  test("a refused patch puts the thumb back on the saved volume", async () => {
    vi.mocked(actions.patch).mockResolvedValueOnce(false);
    renderUi(<MusicTab />);
    const thumb = screen.getByRole("slider");
    await act(async () => { fireEvent.keyDown(thumb, { key: "ArrowLeft" }); });
    expect(actions.patch).toHaveBeenCalledWith([{ op: "set_music", id: "bgm", field: "gain", value: 0.51 }]);
    expect(screen.getByText("52%")).toBeInTheDocument();
  });

  test("sound effects: label, shot + offset and file name", () => {
    renderUi(<MusicTab />);
    expect(screen.getByText("Nét cọ đầu tiên quét bầu trời")).toBeInTheDocument();
    expect(screen.getByText("s1 + 6.3s")).toBeInTheDocument();
    expect(screen.getByText("whoosh.mp3")).toBeInTheDocument();
    expect(screen.getByText("sfx-x")).toBeInTheDocument();
  });

  test("empty music and effects keep the old texts", () => {
    store.m = manifest({ music: [], events: [] });
    renderUi(<MusicTab />);
    expect(screen.getByText("Chưa có nhạc nền. Giao việc cho AI chọn nhạc hợp nội dung.")).toBeInTheDocument();
    expect(screen.getByText("Giao việc cho AI")).toBeInTheDocument();
    expect(screen.getByText("Chưa có hiệu ứng âm thanh nào gắn theo shot. Giao việc cho AI nếu cần tiếng nhấn.")).toBeInTheDocument();
  });

  test("a read-only project disables the slider", () => {
    store.m = manifest({ capabilities: { editable: false } } as Partial<Manifest>);
    renderUi(<MusicTab />);
    expect(track()).toHaveAttribute("data-disabled");
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(actions.patch).not.toHaveBeenCalled();
  });
});
