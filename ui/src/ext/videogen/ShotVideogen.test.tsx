import { renderUi, resetAll } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { ShotVideogen } from "./ShotVideogen.tsx";
import { GflowRow } from "./GflowRow.tsx";
import type { VgItem, VgStatus } from "./api.ts";
import type { AgentRowProps } from "@/ext/registry.ts";

const M2 = (shots: unknown[]) => ({ version: 7, width: 1920, height: 1080, capabilities: { editable: true }, lines: [], shots }) as unknown as Manifest;
const M = { version: 7, width: 1920, height: 1080, capabilities: { editable: true }, lines: [], shots: [{ id: "s1", start: 0, end: 5, assets: ["assets/a.png"] }] } as unknown as Manifest;
const UP: VgStatus = { bin: "/u/.local/bin/gflow", found: true, version: "0.90.0", tested: true, profile: "p1", today: 3, cap: 20, images_today: 1, image_cap: 30, waf_until: null, job: null };
const item = (o: Partial<VgItem>): VgItem => ({ id: "vg-1", shot: "s1", kind: "video", state: "collected", charge: "charged", flow_project: "proj-1", error: null, files: ["assets/gen/video/x.mp4"], prompt_head: "sóng vỗ", created: "2026-10-26T03:00:00.000Z", updated: "2026-10-26T03:00:00.000Z", version: null, ...o });

// GET answers by path; POST answers by path as [status, body] (one per call, the last repeats).
// Every POST body is kept for the assertions.
function serve(get: Record<string, unknown>, post: Record<string, [number, unknown][]> = {}) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://studio.test");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (init?.method === "POST") {
      posts.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
      const list = post[url.pathname] ?? [[200, { job: { id: "j1" } }]];
      const [status, body] = list.length > 1 ? list.shift()! : list[0];
      return json(status, body);
    }
    return url.pathname in get ? json(200, get[url.pathname]) : json(404, { error: "not found" });
  }));
  return posts;
}
const open = () => renderUi(<ShotVideogen pick={{ kind: "shot", id: "s1" }} m={M} />);
// Answers the in-page confirm; returns the question it asked.
const agree = async (): Promise<string> => {
  const d = await screen.findByRole("dialog");
  const text = d.textContent ?? "";
  fireEvent.click(screen.getByRole("button", { name: "Đồng ý" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return text;
};
const create = async () => {
  fireEvent.change(screen.getByRole("textbox", { name: "Mô tả chuyển động" }), { target: { value: "sóng vỗ" } });
  const b = screen.getByRole("button", { name: "Tạo clip AI" });
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(b);
};

beforeEach(() => {
  resetAll();
  useStudio.setState({ name: "ep" });
  vi.restoreAllMocks();
});

describe("shot inspector AI clip section", () => {
  it("says why it cannot send without gflow", async () => {
    serve({ "/api/videogen/status": { ...UP, found: false }, "/api/videogen/items": { items: [] } });
    open();
    await waitFor(() => expect(screen.getByRole("button", { name: "Tạo clip AI" })).toHaveAccessibleDescription("Chưa có gflow ở /u/.local/bin/gflow"));
    expect(screen.getByRole("button", { name: "Tạo clip AI" })).toBeDisabled();
  });

  it("says when today's cap is reached", async () => {
    serve({ "/api/videogen/status": { ...UP, today: 20 }, "/api/videogen/items": { items: [] } });
    open();
    expect(await screen.findByText("Đã đủ 20 clip hôm nay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo clip AI" })).toBeDisabled();
  });

  it("asks for an image when the shot has none", () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    renderUi(<ShotVideogen pick={{ kind: "shot", id: "s1" }} m={M2([{ id: "s1", start: 0, end: 4, assets: ["footage/raw/a.mp4"] }])} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Kiểu" }), { target: { value: "start" } });
    expect(screen.getByText("Shot chưa có ảnh; thêm ảnh vào shot hoặc dùng Chỉ chữ")).toBeInTheDocument();
  });

  it("starts fresh on another shot: its own length, no images of the old one", () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    const m = M2([{ id: "s1", start: 0, end: 5, assets: ["assets/a.png"] }, { id: "s2", start: 5, end: 13, assets: ["assets/b.png"] }]);
    function Host() {
      const [id, setId] = useState("s1");
      return <><button onClick={() => setId("s2")}>sang s2</button><ShotVideogen pick={{ kind: "shot", id }} m={m} /></>;
    }
    renderUi(<Host />);
    fireEvent.change(screen.getByRole("combobox", { name: "Kiểu" }), { target: { value: "start" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Ảnh đầu" }), { target: { value: "assets/a.png" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Mô tả chuyển động" }), { target: { value: "cũ" } });
    fireEvent.click(screen.getByRole("button", { name: "sang s2" }));
    expect((screen.getByRole("combobox", { name: "Độ dài" }) as HTMLSelectElement).value).toBe("8");
    expect((screen.getByRole("combobox", { name: "Kiểu" }) as HTMLSelectElement).value).toBe("t2v");
    expect((screen.getByRole("textbox", { name: "Mô tả chuyển động" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("picks the shortest clip that covers the shot; 10 s and quality only with omni-flash", () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    open();
    const len = () => [...(screen.getByRole("combobox", { name: "Độ dài" }) as HTMLSelectElement).options].map((o) => o.value);
    expect((screen.getByRole("combobox", { name: "Độ dài" }) as HTMLSelectElement).value).toBe("6");
    expect(len()).not.toContain("10");
    expect(screen.queryByRole("combobox", { name: "Chất lượng" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "omni-flash" } });
    expect(len()).toContain("10");
    fireEvent.change(screen.getByRole("combobox", { name: "Độ dài" }), { target: { value: "10" } });
    expect([...(screen.getByRole("combobox", { name: "Chất lượng" }) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["720p", "360p"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "veo-fast" } });
    expect((screen.getByRole("combobox", { name: "Độ dài" }) as HTMLSelectElement).value).toBe("8");
  });

  it("Huỷ in the confirm sends nothing", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    open();
    await create();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toHaveLength(0);
  });

  it("sends one request after the confirm, with the shown version", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    open();
    await create();
    expect(posts).toHaveLength(0);
    await agree();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: "/api/videogen/shot", body: { name: "ep", shot: "s1", base: 7, prompt: "sóng vỗ", seconds: 6, model: "veo-lite", mode: "t2v" } });
    expect(posts[0].body).not.toHaveProperty("again");
    expect(posts[0].body).not.toHaveProperty("resolution");
  });

  it("an unknown earlier result needs a second confirm before sending again", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } }, { "/api/videogen/shot": [[409, { code: "DUPLICATE", id: "vg-old", error: "x" }], [200, { job: { id: "j2" } }]] });
    open();
    await create();
    await agree();
    expect(await agree()).toMatch(/có thể tốn credit lần hai/);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].body).toMatchObject({ again: "vg-old" });
  });

  it("a clip Flow already made is downloaded, never made again", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } }, { "/api/videogen/shot": [[409, { code: "RECOVERABLE", id: "vg-made", error: "x" }]] });
    open();
    await create();
    await agree();
    expect(await agree()).toMatch(/Tải về \(miễn phí\)/);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ path: "/api/videogen/recover", body: { name: "ep", id: "vg-made" } });
    expect(posts.some((p) => "again" in p.body)).toBe(false);
  });

  it("switches between image and video; an image goes to /image with its model and frame", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    open();
    expect(screen.queryByRole("textbox", { name: "Mô tả ảnh" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ảnh" }));
    expect(screen.getByRole("button", { name: "Ảnh" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("textbox", { name: "Mô tả chuyển động" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Mô tả ảnh" }), { target: { value: "biển" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Khung ảnh" }), { target: { value: "1:1" } });
    const b = screen.getByRole("button", { name: "Tạo ảnh AI" });
    await waitFor(() => expect(b).toBeEnabled());
    fireEvent.click(b);
    expect(await agree()).toMatch(/Tạo một ảnh nano2 1:1/);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: "/api/videogen/image", body: { prompt: "biển", mode: "t2i", model: "nano2", aspect: "1:1", refs: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect((screen.getByRole("textbox", { name: "Mô tả chuyển động" }) as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Ảnh" }));
    expect((screen.getByRole("textbox", { name: "Mô tả ảnh" }) as HTMLTextAreaElement).value).toBe("biển");
  });

  it("after the submit the running item offers Ngừng chờ, with what it still costs", async () => {
    const posts = serve({ "/api/videogen/status": { ...UP, job: { id: "j1", name: "ep" } }, "/api/videogen/items": { items: [item({ id: "r", state: "running", phase: "sent", files: [] })] } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng chờ lượt AI đang tạo" }));
    expect(await agree()).toMatch(/vẫn tính credit/);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/videogen/cancel", body: { name: "ep" } });
  });

  it("lists this shot's clips with what can be done with each", async () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [
      item({ id: "a", state: "collected" }),
      item({ id: "b", state: "intent", files: [] }),
      item({ id: "c", state: "made", files: [], prompt_head: "đã tạo" }),
      item({ id: "d", shot: "s9", state: "collected" }),
      item({ id: "e", state: "cancelled", charge: "charged" }),
      item({ id: "f", kind: "image", state: "made", files: [], prompt_head: "ảnh đã tạo" }),
    ] } });
    open();
    expect(await screen.findByText("đã tải về, chưa gắn")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Gắn vào shot: / })).toHaveLength(2);
    expect(screen.getByText("chưa rõ kết quả")).toBeInTheDocument();
    expect(screen.getByText("Có thể đã tốn credit. Bấm Đối chiếu hoặc mở Flow kiểm trước khi tạo lại.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Tải về từ Flow: / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Tải về từ Flow: đã tạo"]);
    expect(screen.getAllByRole("button", { name: /^Nhập file đã tải: / })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Đối chiếu: / })).toHaveLength(1);
  });

  it("Đối chiếu asks the server to look in the catalog", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [item({ id: "u", state: "indeterminate", files: [] })] } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Đối chiếu: sóng vỗ" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/videogen/reconcile", body: { name: "ep", id: "u" } });
  });

  it("Dùng file tạm only when the run left a temp file; it imports that file", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [item({ id: "p", state: "indeterminate", files: [], part: true }), item({ id: "q", state: "indeterminate", files: [], prompt_head: "mây" })] } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Dùng file tạm: sóng vỗ" }));
    expect(screen.queryByRole("button", { name: "Dùng file tạm: mây" })).toBeNull();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/videogen/import", body: { name: "ep", id: "p", base: M.version, part: true } });
  });
});

describe("agent row for gflow", () => {
  it("shows version, profile and counts; Kiểm đăng nhập calls auth once", async () => {
    const posts = serve({ "/api/videogen/status": UP }, { "/api/videogen/auth": [[200, { ok: true, code: 0 }]] });
    renderUi(<GflowRow {...({} as AgentRowProps)} />);
    const row = await screen.findByTestId("gflow-row");
    await waitFor(() => expect(row).toHaveTextContent("profile: p1"));
    expect(row).toHaveTextContent("video hôm nay: 3/20");
    expect(row).toHaveTextContent("ảnh: 1/30");
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm đăng nhập" }));
    expect(await screen.findByText("đăng nhập còn hạn")).toBeInTheDocument();
    expect(posts).toEqual([{ path: "/api/videogen/auth", body: {} }]);
  });
});
