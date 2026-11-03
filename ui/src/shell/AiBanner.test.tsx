import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { actions } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { Snapshot } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { answerConfirm, mockFetch, renderUi } from "./test-utils.tsx";
import { AiBanner, headline } from "./AiBanner.tsx";

const ID = "r-20261101120000-abcd";
const turn = (over: Partial<Snapshot["summary"]> = {}): Snapshot => ({
  id: ID, at: "2026-11-01T12:00:00Z", version: 3, state: "done", files: 9,
  summary: { from: 3, to: 5, changed: ["index.html", "project.json"], added: ["compositions/b.html"], removed: [], overwritten: [], created: [], ...over },
});

function setup(snapshots: Snapshot[], can_restore = true) {
  queryClient.setQueryData(keys.projects(), [{ name: "p1", has_manifest: true, editable: true }]);
  queryClient.setQueryData(keys.snapshots("p1"), { snapshots, can_restore });
  useStudio.setState({ name: "p1" });
  return renderUi(<AiBanner />);
}

// fetch that answers POSTs in order from `answers` ([status, body]) and GETs from `gets`.
function stubPosts(answers: [number, unknown][], gets: Record<string, unknown> = {}) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://studio.test");
    if (init?.method === "POST") {
      posts.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
      const [status, body] = answers.shift() ?? [500, { error: "no answer" }];
      return new Response(JSON.stringify(body), { status });
    }
    return new Response(JSON.stringify(gets[url.pathname] ?? { error: "not found" }), { status: url.pathname in gets ? 200 : 404 });
  }));
  return posts;
}

describe("AiBanner", () => {
  it("says how many files the turn changed and between which versions", () => {
    setup([turn()]);
    expect(screen.getByRole("status")).toHaveTextContent("Đạo diễn đã sửa 3 file, v3 → v5");
    expect(screen.getByRole("button", { name: "Hoàn tác lượt đạo diễn" })).toBeInTheDocument();
  });

  it("names overwritten media in the headline", () => {
    expect(headline(turn({ overwritten: ["assets/voice/01.mp3"] }))).toBe("Đạo diễn đã sửa 3 file, v3 → v5 · 1 file media bị ghi đè, không hoàn tác được");
  });

  it("shows nothing without a finished turn, and no undo without the gateway restore", () => {
    const { container } = setup([{ ...turn(), state: "kept" }]);
    expect(container.querySelector("[data-banner]")).toBeNull();
    queryClient.setQueryData(keys.snapshots("p1"), { snapshots: [turn()], can_restore: false });
    expect(screen.queryByRole("button", { name: "Hoàn tác lượt đạo diễn" })).toBeNull();
  });

  it("Giữ posts keep for the turn", async () => {
    const posts = stubPosts([[200, { ...turn(), state: "kept" }]], { "/api/snapshots": { snapshots: [], can_restore: true } });
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Giữ" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/snapshots/keep", body: { name: "p1", id: ID } });
  });

  it("asks before undoing edits made after the turn, then undoes with force", async () => {
    const posts = stubPosts([
      [409, { error: "Sau lượt AI đã có sửa khác (v5 → v6). Hoàn tác cả các sửa sau đó?", code: "NEWER" }],
      [200, { version: 7, files: 3, overwritten: [], created: [], lines: [] }],
    ], { "/api/snapshots": { snapshots: [], can_restore: true } });
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác lượt đạo diễn" }));
    expect(await answerConfirm(true)).toMatch(/Hoàn tác lượt đạo diễn/);
    expect(await answerConfirm(true)).toMatch(/v5 → v6/);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].body).toEqual({ name: "p1", id: ID, force: true });
  });

  it("Hoàn tác asks first; Huỷ restores nothing; Giữ is the main button", async () => {
    const posts = stubPosts([[200, { version: 7, files: 3, overwritten: [], created: [], lines: [] }]], { "/api/snapshots": { snapshots: [], can_restore: true } });
    setup([turn()]);
    expect(screen.getByRole("button", { name: "Giữ" })).toHaveClass("bg-primary");
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác lượt đạo diễn" }));
    expect(await answerConfirm(false)).toMatch(/Hoàn tác lượt đạo diễn/);
    expect(posts).toHaveLength(0);
  });

  it("after an undo with overwritten voice, says which lines need voicing again", async () => {
    stubPosts([[200, { version: 6, files: 3, overwritten: ["assets/voice/01.mp3"], created: [], lines: [{ id: "l1", text: "Xin chào" }] }]],
      { "/api/snapshots": { snapshots: [], can_restore: true } });
    setup([turn({ overwritten: ["assets/voice/01.mp3"] })]);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác lượt đạo diễn" }));
    await answerConfirm(true);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1 file đã bị ghi đè, không lấy lại được: assets/voice/01.mp3");
    expect(alert).toHaveTextContent("Cần lồng tiếng lại câu: l1 “Xin chào”");
  });

  it("Xem thay đổi lists each file with its diff", async () => {
    mockFetch({ "/api/snapshots/diff": { id: ID, state: "done", from: 3, files: [{ path: "index.html", kind: "changed", before: "<h1>A</h1>", after: "<h1>B</h1>" }], overwritten: [], created: [] } });
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Xem thay đổi" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(await within(d).findByRole("tab", { name: "Theo file" }));
    await waitFor(() => expect(d).toHaveTextContent("index.html"));
    expect(d).toHaveTextContent("- <h1>A</h1>");
    expect(d).toHaveTextContent("+ <h1>B</h1>");
  });

  it("Theo shot is the first tab and tells the project.json changes shot by shot", async () => {
    const before = { version: 3, shots: [{ id: "s1", start: 0, end: 2 }, { id: "s2", start: 2, end: 4 }, { id: "s3", start: 4, end: 6 }], lines: [] };
    const after = { ...before, version: 5, shots: [...before.shots.slice(0, 2), { id: "s3", start: 4, end: 7.5 }] };
    mockFetch({ "/api/snapshots/diff": { id: ID, state: "done", from: 3, files: [{ path: "project.json", kind: "changed", before: JSON.stringify(before), after: JSON.stringify(after) }], overwritten: ["assets/voice/01.mp3"], created: [] } });
    queryClient.setQueryData(keys.project("p1"), after);
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Xem thay đổi" }));
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByRole("tab", { name: "Theo shot" })).toHaveAttribute("aria-selected", "true");
    const row = await within(d).findByRole("button", { name: /Shot 3 dài 2,0 s → 3,5 s/ });
    expect(within(d).getByText("1 file media bị ghi đè, hoàn tác không lấy lại được")).toHaveClass("text-warn");
    const select = vi.spyOn(actions, "select");
    const seek = vi.spyOn(actions, "seek");
    fireEvent.click(row);
    expect(select).toHaveBeenCalledWith("s3");
    expect(seek).toHaveBeenCalledWith(4);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Theo shot says so when the turn changed no shot or line", async () => {
    mockFetch({ "/api/snapshots/diff": { id: ID, state: "done", from: 3, files: [{ path: "index.html", kind: "changed", before: "a", after: "b" }], overwritten: [], created: [] } });
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Xem thay đổi" }));
    expect(await screen.findByText("Không có thay đổi về shot và lời.")).toBeInTheDocument();
  });
});
