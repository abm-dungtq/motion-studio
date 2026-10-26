import { renderUi, resetAll } from "@/shell/test-utils.tsx";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { ShotVideogen } from "./ShotVideogen.tsx";
import type { VgItem, VgStatus } from "./api.ts";

const M = { version: 7, width: 1920, height: 1080, capabilities: { editable: true }, lines: [], shots: [{ id: "s1", start: 0, end: 5, assets: ["assets/a.png"] }] } as unknown as Manifest;
const UP: VgStatus = { glabs_url: "http://127.0.0.1:8765", up: true, error: null, key: true, today: 3, cap: 40, job: null };
const item = (o: Partial<VgItem>): VgItem => ({ id: "vg-1", shot: "s1", state: "collected", charge: "charged", task_id: "0a1b2c3d", error: null, files: ["assets/gen/video/x.mp4"], prompt_head: "sóng vỗ", created: "2026-10-26T03:00:00.000Z", updated: "2026-10-26T03:00:00.000Z", version: null, ...o });

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
  it("says why it cannot send while G-Labs is closed", async () => {
    serve({ "/api/videogen/status": { ...UP, up: false, error: "Mở G-Labs Studio và bấm Start ở tab Webhook" }, "/api/videogen/items": { items: [] } });
    open();
    expect(await screen.findByText("Mở G-Labs Studio và bấm Start ở tab Webhook")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo clip AI" })).toBeDisabled();
  });

  it("picks the shortest clip that covers the shot, 360p only for text", () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    open();
    expect((screen.getByRole("combobox", { name: "Độ dài" }) as HTMLSelectElement).value).toBe("6");
    const res = () => [...(screen.getByRole("combobox", { name: "Chất lượng" }) as HTMLSelectElement).options].map((o) => o.value);
    expect(res()).toContain("360p");
    fireEvent.change(screen.getByRole("combobox", { name: "Kiểu" }), { target: { value: "start" } });
    expect(res()).not.toContain("360p");
  });

  it("sends one request after the confirm, with the shown version", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    open();
    await create();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(posts[0]).toMatchObject({ path: "/api/videogen/shot", body: { name: "ep", shot: "s1", base: 7, prompt: "sóng vỗ", seconds: 6, resolution: "720p", mode: "t2v" } });
    expect(posts[0].body).not.toHaveProperty("again");
  });

  it("an unknown earlier result needs a second confirm before sending again", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } }, { "/api/videogen/shot": [[409, { code: "DUPLICATE", id: "vg-old", error: "x" }], [200, { job: { id: "j2" } }]] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    open();
    await create();
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(posts[1].body).toMatchObject({ again: "vg-old" });
  });

  it("a task G-Labs still has is followed, never sent again", async () => {
    const posts = serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [] } }, { "/api/videogen/shot": [[409, { code: "RESUMABLE", id: "vg-live", error: "x" }]] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open();
    await create();
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ path: "/api/videogen/resume", body: { name: "ep", id: "vg-live" } });
    expect(posts.some((p) => "again" in p.body)).toBe(false);
  });

  it("lists this shot's clips with what can be done with each", async () => {
    serve({ "/api/videogen/status": UP, "/api/videogen/items": { items: [
      item({ id: "a", state: "collected" }),
      item({ id: "b", state: "intent", task_id: null, files: [] }),
      item({ id: "c", state: "submitted" }),
      item({ id: "d", shot: "s9", state: "collected" }),
    ] } });
    open();
    expect(await screen.findByText("đã tải về, chưa gắn")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Gắn vào shot" })).toHaveLength(1);
    expect(screen.getByText("chưa rõ kết quả")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập file đã tải" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theo dõi tiếp" })).toBeInTheDocument();
  });
});
