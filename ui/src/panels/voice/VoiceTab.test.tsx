import "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { SectionHost } from "@/shell/SectionHost.tsx";
import { register as registerSeries } from "@/ext/series/index.ts";
import type { Manifest } from "@/api/types.ts";
import { createStudio, getTabs } from "@/ext/registry.ts";
import { useStudio } from "@/store/studio.ts";
import { register, VOICE_LEAD } from "./index.ts";
import { NEEDS_VOICE, speakerColour, useStaleCount, VoiceTab } from "./VoiceTab.tsx";

// The manifest the mocked useProject answers; setManifest stands in for an SSE reload.
const store = vi.hoisted(() => {
  const subs = new Set<() => void>();
  return {
    m: null as unknown,
    subs,
    set(m: unknown) { this.m = m; for (const fn of subs) fn(); },
  };
});

vi.mock("@/api/queries.ts", async (orig) => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (fn: () => void) => { store.subs.add(fn); return () => { store.subs.delete(fn); }; };
  return { ...(await orig<typeof import("@/api/queries.ts")>()), useProject: () => ({ data: useSyncExternalStore(subscribe, () => store.m) }) };
});
vi.mock("@/api/actions.ts", async (orig) => {
  const real = await orig<typeof import("@/api/actions.ts")>();
  return { ...real, actions: { ...real.actions, patch: vi.fn(async () => true), direct: vi.fn(async () => true) } };
});
vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

// Shape of GET /api/project?name=thuy-mau-demo (lines only, plus what the panel reads).
const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  version: 4,
  capabilities: { editable: true },
  lines: [
    { id: "vo-01", shot: "s1", text: "Lớp thuỷ màu mới tự vẽ từng nét trên giấy.", start: 0.5, duration: 4.5, gate: "unknown" },
    { id: "vo-02", shot: "s2", text: "Chữ tiếng Việt nằm ở lớp riêng nên dấu luôn rõ.", start: 6.9, duration: 3.7, gate: "pass" },
    { id: "vo-03", shot: "s3", text: "Kéo dài một cảnh, nét vẽ tự giãn theo.", start: 12.8, duration: 3.6, gate: "unknown" },
  ],
  ...over,
} as unknown as Manifest);

const stale = (): Manifest => {
  const m = manifest({ version: 5 });
  m.lines[2] = { ...m.lines[2]!, text: "Kéo dài một cảnh, nét vẽ tự giãn theo nhịp.", gate: "stale" };
  return m;
};

beforeEach(() => {
  mockFetch({});
  store.m = manifest();
  useStudio.setState({ name: "thuy-mau-demo" });
  vi.mocked(actions.patch).mockClear();
  vi.mocked(actions.direct).mockClear();
  vi.mocked(say).mockClear();
});

describe("voice tab", () => {
  test("registers in the audio group with its lead and icon", () => {
    register(createStudio());
    const tab = getTabs().find((t) => t.id === "voice");
    expect(tab).toMatchObject({ label: "Lời & giọng", group: "audio", order: 10, lead: VOICE_LEAD });
    expect(tab?.badge).toBe(useStaleCount);
  });

  test("one card per line: number, id, gate badge and the textarea label", () => {
    renderUi(<VoiceTab />);
    expect(screen.getByText("1. vo-01")).toBeInTheDocument();
    expect(screen.getByText("3. vo-03")).toBeInTheDocument();
    expect(screen.getByText("pass")).toBeInTheDocument();
    expect(screen.getByLabelText("Câu 3")).toHaveValue("Kéo dài một cảnh, nét vẽ tự giãn theo.");
    expect(screen.queryByText("Nhờ duyệt và lồng tiếng lại")).toBeNull();
  });

  test("Lưu lời with no change says so and sends nothing", async () => {
    renderUi(<VoiceTab />);
    await act(async () => { fireEvent.click(screen.getAllByText("Lưu lời")[2]!); });
    expect(say).toHaveBeenCalledWith("Không có gì thay đổi");
    expect(actions.patch).not.toHaveBeenCalled();
  });

  test("Lưu lời after an edit sends set_line_text, then asks for the viet-pro gate", async () => {
    renderUi(<VoiceTab />);
    fireEvent.change(screen.getByLabelText("Câu 3"), { target: { value: "Kéo dài một cảnh, nét vẽ tự giãn theo nhịp." } });
    await act(async () => { fireEvent.click(screen.getAllByText("Lưu lời")[2]!); });
    expect(actions.patch).toHaveBeenCalledWith([{ op: "set_line_text", id: "vo-03", text: "Kéo dài một cảnh, nét vẽ tự giãn theo nhịp." }]);
    expect(say).toHaveBeenCalledWith("Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại");
  });

  test("a refused patch gives no gate toast", async () => {
    vi.mocked(actions.patch).mockResolvedValueOnce(false);
    renderUi(<VoiceTab />);
    fireEvent.change(screen.getByLabelText("Câu 1"), { target: { value: "khác" } });
    await act(async () => { fireEvent.click(screen.getAllByText("Lưu lời")[0]!); });
    expect(actions.patch).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });

  test("a stale line shows the reminder and asks the director for the line", async () => {
    store.m = stale();
    renderUi(<VoiceTab />);
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText("Nhờ duyệt và lồng tiếng lại")); });
    expect(actions.direct).toHaveBeenCalledWith({
      scope: "line",
      target: "vo-03",
      text: "Câu vo-03 đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.",
    });
  });

  test("the badge counts stale lines", () => {
    function Badge() { return <output>{useStaleCount()}</output>; }
    store.m = stale();
    renderUi(<Badge />);
    expect(screen.getByRole("status")).toHaveTextContent("1");
    act(() => store.set(manifest({ version: 6 })));
    expect(screen.getByRole("status")).toHaveTextContent("0");
  });

  test("no lines: the empty text and a button to the director tab", () => {
    store.m = manifest({ lines: [] });
    renderUi(<VoiceTab />);
    expect(screen.getByText("Chưa có câu thoại. Giao việc cho AI viết kịch bản.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Giao việc cho AI"));
    expect(useStudio.getState().rightTab).toBe("director");
  });

  test("a read-only project disables the text and Lưu lời", () => {
    store.m = manifest({ capabilities: { editable: false } } as Partial<Manifest>);
    renderUi(<VoiceTab />);
    expect(screen.getByLabelText("Câu 1")).toBeDisabled();
    for (const b of screen.getAllByText("Lưu lời")) expect(b).toBeDisabled();
  });

  test("a new manifest keeps a half-typed line, and redraws once typing stops", () => {
    renderUi(<VoiceTab />);
    const box = screen.getByLabelText("Câu 1");
    box.focus();
    fireEvent.change(box, { target: { value: "đang gõ dở" } });
    const outside = manifest({ version: 5 });
    outside.lines[1] = { ...outside.lines[1]!, text: "Sửa từ ngoài." };
    act(() => store.set(outside));
    expect(screen.getByLabelText("Câu 1")).toHaveValue("đang gõ dở");
    box.blur();
    const later = manifest({ version: 6 });
    act(() => store.set(later));
    expect(screen.getByLabelText("Câu 1")).toHaveValue("Lớp thuỷ màu mới tự vẽ từng nét trên giấy.");
  });
});

// A series episode: GET /api/series lists the roles, GET /api/voice/previews says the provider can
// set a speaker, GET /api/consent the waiting cards; the posts are recorded.
const VOICE_CARD = { id: "c-tts", kind: "elevenlabs", title: "Lồng tiếng 2 câu bằng giọng cast của series, ước 80 ký tự ElevenLabs", count: 2, estimate: { lines: 2, chars: 80 }, status: "waiting" };
function seriesRoutes({ canSet = true, cards = [] as unknown[] } = {}) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const post = (path: string, answer: unknown) => (_u: URL, init?: RequestInit) => { posts.push({ path, body: JSON.parse(String(init?.body ?? "{}")) }); return answer; };
  mockFetch({
    "/api/series": { name: "Sóng thử", dir: "/s", characters: [], roles: ["ptv", "ba-noi"], writable: [] },
    "/api/voice/previews": { roles: [], can_set_speaker: canSet },
    "/api/consent": { cards },
    "/api/voice/tts": post("/api/voice/tts", { job: { id: "j1" } }),
  });
  return posts;
}
const withSpeakers = (m: Manifest): Manifest => { m.lines[0] = { ...m.lines[0]!, speaker: "ptv" }; return m; };

describe("voice tab in a series episode", () => {
  test("a speaker box per line with the series roles; a change sends set_line_speaker and asks to voice again", async () => {
    seriesRoutes();
    store.m = withSpeakers(manifest());
    renderUi(<VoiceTab />);
    const box = await screen.findByLabelText("Người nói câu 1");
    expect(box).toHaveValue("ptv");
    expect([...(box as HTMLSelectElement).options].map((o) => o.value)).toEqual(["ptv", "ba-noi"]);
    expect(screen.getByLabelText("Người nói câu 2")).toHaveValue("");
    await act(async () => { fireEvent.change(box, { target: { value: "ba-noi" } }); });
    expect(actions.patch).toHaveBeenCalledWith([{ op: "set_line_speaker", id: "vo-01", speaker: "ba-noi" }]);
    expect(say).toHaveBeenCalledWith(NEEDS_VOICE);
  });

  test("the colour of a role is fixed by its id", () => {
    expect(speakerColour("ba-noi")).toBe(speakerColour("ba-noi"));
    expect(speakerColour("ba-noi")).toMatch(/^bg-(track|deco)-/);
    expect(new Set(["ptv", "ba-noi", "song", "me", "bo"].map(speakerColour)).size).toBeGreaterThan(1);
  });

  test("a provider without the op, a read-only project and a project of no series only show the speaker", async () => {
    seriesRoutes({ canSet: false });
    store.m = withSpeakers(manifest());
    const one = renderUi(<VoiceTab />);
    expect(await screen.findByText("Người nói: ptv")).toBeInTheDocument();
    expect(screen.queryByLabelText("Người nói câu 1")).toBeNull();
    one.unmount();

    seriesRoutes();
    store.m = withSpeakers(manifest({ capabilities: { editable: false } } as Partial<Manifest>));
    const two = renderUi(<VoiceTab />);
    expect(await screen.findByText("Người nói: ptv")).toBeInTheDocument();
    expect(screen.queryByLabelText("Người nói câu 1")).toBeNull();
    two.unmount();

    mockFetch({});
    act(() => { useStudio.setState({ name: "le" }); });
    store.m = withSpeakers(manifest());
    renderUi(<VoiceTab />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("Người nói: ptv")).toBeNull();
    expect(screen.queryByLabelText("Người nói câu 1")).toBeNull();
  });

  test("Lồng tiếng lại voices one stale line; Lồng tiếng các câu cũ sends every stale line", async () => {
    const posts = seriesRoutes();
    const m = withSpeakers(manifest({ version: 5 }));
    m.lines[0] = { ...m.lines[0]!, gate: "stale" };
    m.lines[2] = { ...m.lines[2]!, gate: "stale", speaker: "ba-noi" };
    store.m = m;
    renderUi(<VoiceTab />);
    const redo = await screen.findAllByRole("button", { name: "Lồng tiếng lại" });
    expect(redo).toHaveLength(2);
    expect(screen.queryByText("Nhờ duyệt và lồng tiếng lại")).toBeNull();
    await act(async () => { fireEvent.click(redo[0]!); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Lồng tiếng các câu cũ (2)" })); });
    await waitFor(() => expect(posts.map((p) => p.body)).toEqual([{ name: "thuy-mau-demo", ids: ["vo-01"] }, { name: "thuy-mau-demo", ids: ["vo-01", "vo-03"] }]));
  });

  test("a stale line without a speaker cannot be voiced yet", async () => {
    seriesRoutes();
    store.m = stale();
    renderUi(<VoiceTab />);
    expect(await screen.findByRole("button", { name: "Lồng tiếng lại" })).toBeDisabled();
  });

  test("the waiting voice card of the series shows under the tab", async () => {
    seriesRoutes({ cards: [VOICE_CARD] });
    registerSeries(createStudio());
    renderUi(<><VoiceTab /><SectionHost hostId="voice" /></>);
    const card = await screen.findByRole("region", { name: "Thẻ chờ đồng ý" });
    expect(within(card).getByText(VOICE_CARD.title)).toBeInTheDocument();
    expect(within(card).queryByText(/lượt đọc ảnh/)).toBeNull();
  });
});
