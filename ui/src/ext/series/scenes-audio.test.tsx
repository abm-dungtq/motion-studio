import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useStudio } from "@/store/studio.ts";
import { createStudio, getSections } from "@/ext/registry.ts";
import { register } from "./index.ts";
import { ScenesCard, spanText, stateText, type SceneItem } from "./ScenesCard.tsx";
import { AudioReview } from "./AudioReview.tsx";

// Shapes of GET /api/scenes (routes/scenes.mjs) and GET /api/gates (server.mjs gateStatus).
const scene = (id: string, extra: Partial<SceneItem> = {}): SceneItem => ({
  id, label: `Cảnh ${id.slice(1)}`, from: 0, to: 3.5, shots: ["s1"], built: null, clip: null, stills: null,
  current: false, approved: null, approved_current: false, ...extra,
});
const BUILT = { built: "2026-10-24T10:00:00.000Z", clip: "demo/scenes/c1.mp4", stills: "demo/scenes/c1-stills.png", current: true };

function routes(list: SceneItem[], over: Record<string, unknown> = {}) {
  const posts: { path: string; body: unknown }[] = [];
  const post = (path: string, answer: unknown) => (_u: URL, init?: RequestInit) => { posts.push({ path, body: JSON.parse(String(init?.body)) }); return answer; };
  const fetch = mockFetch({
    "/api/scenes": { scenes: list, job: null, can_rebuild: true },
    "/api/scenes/rebuild": post("/api/scenes/rebuild", { job: { id: "j1" } }),
    "/api/scenes/approve": post("/api/scenes/approve", { notes: [], demo: "DEMO.md" }),
    "/api/gates": { pass: true, fails: [], animatic: true, audio_changed: false },
    "/api/gates/audio-check": post("/api/gates/audio-check", { level: "PASS", line: "PASS BALANCE nhạc dưới giọng 5.3 dB", code: 0 }),
    "/api/gates/audio-review": post("/api/gates/audio-review", { line: "audio_review: user@studio" }),
    ...over,
  });
  return { fetch, posts };
}

function open(ui: React.ReactElement) {
  act(() => { useStudio.setState({ name: "ep" }); });
  return renderUi(ui);
}

describe("scenes card", () => {
  test("sits in the director column and the Tài sản tab; the audio card in the export dialog after the gates", () => {
    register(createStudio());
    expect(getSections("director").map((x) => x.id)).toContain("series-scenes");
    expect(getSections("series-assets").map((x) => x.id)).toEqual(["series-scenes"]);
    expect(getSections("export").map((x) => x.id)).toContain("series-audio-review");
  });

  test("states and spans in words", () => {
    expect(spanText({ from: 0, to: 3.5 })).toBe("0s–3.5s");
    expect(stateText(scene("c1"))).toBe("Chưa dựng");
    expect(stateText(scene("c1", { ...BUILT, current: false }))).toMatch(/Mốc cảnh đã đổi/);
    expect(stateText(scene("c1", BUILT))).toBe("Chờ duyệt");
    expect(stateText(scene("c1", { ...BUILT, approved: { by: "user@studio", at: "2026-10-24T10:05:00.000Z", label: "", line: "" }, approved_current: true }))).toBe("Đã duyệt 2026-10-24 10:05");
  });

  test("nothing when the manifest has no scenes", async () => {
    const { fetch } = routes([]);
    const { container } = open(<ScenesCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(within(container).queryByRole("region", { name: "Nhóm cảnh" })).toBeNull();
  });

  test("Dựng lại posts one scene; only scenes built for their span can be ticked; approve sends the ticked ones", async () => {
    const { posts } = routes([scene("c1", BUILT), scene("c2", { ...BUILT, clip: "demo/scenes/c2.mp4", stills: null }), scene("c3")]);
    open(<ScenesCard />);
    const card = await screen.findByRole("region", { name: "Nhóm cảnh" });
    expect(within(card).getByRole("img", { name: "Sáu khung của c1" })).toHaveAttribute("src", "/p/ep/demo/scenes/c1-stills.png?v=2026-10-24T10%3A00%3A00.000Z");
    expect(within(card).getByLabelText("Clip nháp c1")).toBeInTheDocument();
    expect(within(card).queryByRole("checkbox", { name: "Chọn c3 để duyệt" })).toBeNull();
    const approve = within(card).getByRole("button", { name: "Duyệt các cảnh đã chọn" });
    expect(approve).toBeDisabled();
    fireEvent.click(within(card).getByRole("button", { name: "Dựng lại c3" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/scenes/rebuild", body: { name: "ep", scene: "c3" } }]));
    await waitFor(() => expect(within(card).getByRole("button", { name: "Dựng lại c3" })).toBeEnabled());
    fireEvent.click(within(card).getByRole("checkbox", { name: "Chọn c1 để duyệt" }));
    fireEvent.click(within(card).getByRole("checkbox", { name: "Chọn c2 để duyệt" }));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: "/api/scenes/approve", body: { name: "ep", scenes: ["c1", "c2"] } }));
  });

  test("a running scene job turns the rebuild buttons off and says which scene", async () => {
    routes([scene("c1", BUILT)], { "/api/scenes": { scenes: [scene("c1", BUILT)], job: { id: "j", name: "ep", kind: "scene", status: "running", code: null, started: "", meta: { scene: "c1" }, tail: ["render 40%"] }, can_rebuild: true } });
    open(<ScenesCard />);
    const card = await screen.findByRole("region", { name: "Nhóm cảnh" });
    expect(within(card).getByText("Đang dựng c1… render 40%")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Dựng lại c1" })).toBeDisabled();
  });
});

describe("hear it again card", () => {
  test("hidden while the sound did not change", async () => {
    const { fetch } = routes([]);
    const { container } = open(<AudioReview />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(within(container).queryByRole("region", { name: "Tiếng đã đổi sau animatic" })).toBeNull();
  });

  test("Đo tiếng shows the mix-balance line; Nghe rồi, được posts the review", async () => {
    const { posts } = routes([], { "/api/gates": { pass: true, fails: [], animatic: true, audio_changed: true } });
    open(<AudioReview />);
    const card = await screen.findByRole("region", { name: "Tiếng đã đổi sau animatic" });
    fireEvent.click(within(card).getByRole("button", { name: "Đo tiếng" }));
    expect(await within(card).findByText("PASS BALANCE nhạc dưới giọng 5.3 dB")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Nghe rồi, được" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/gates/audio-check", body: { name: "ep" } }, { path: "/api/gates/audio-review", body: { name: "ep" } }]));
  });
});
