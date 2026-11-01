import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    expect(screen.getByRole("status")).toHaveTextContent("AI đã sửa 3 file, v3 → v5");
    expect(screen.getByRole("button", { name: "Hoàn tác" })).toBeInTheDocument();
  });

  it("names overwritten media in the headline", () => {
    expect(headline(turn({ overwritten: ["assets/voice/01.mp3"] }))).toBe("AI đã sửa 3 file, v3 → v5 · 1 file media bị ghi đè, không hoàn tác được");
  });

  it("shows nothing without a finished turn, and no undo without the gateway restore", () => {
    const { container } = setup([{ ...turn(), state: "kept" }]);
    expect(container.querySelector("[data-banner]")).toBeNull();
    queryClient.setQueryData(keys.snapshots("p1"), { snapshots: [turn()], can_restore: false });
    expect(screen.queryByRole("button", { name: "Hoàn tác" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(await answerConfirm(true)).toMatch(/v5 → v6/);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].body).toEqual({ name: "p1", id: ID, force: true });
  });

  it("after an undo with overwritten voice, says which lines need voicing again", async () => {
    stubPosts([[200, { version: 6, files: 3, overwritten: ["assets/voice/01.mp3"], created: [], lines: [{ id: "l1", text: "Xin chào" }] }]],
      { "/api/snapshots": { snapshots: [], can_restore: true } });
    setup([turn({ overwritten: ["assets/voice/01.mp3"] })]);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1 file đã bị ghi đè, không lấy lại được: assets/voice/01.mp3");
    expect(alert).toHaveTextContent("Cần lồng tiếng lại câu: l1 “Xin chào”");
  });

  it("Xem thay đổi lists each file with its diff", async () => {
    mockFetch({ "/api/snapshots/diff": { id: ID, state: "done", from: 3, files: [{ path: "index.html", kind: "changed", before: "<h1>A</h1>", after: "<h1>B</h1>" }], overwritten: [], created: [] } });
    setup([turn()]);
    fireEvent.click(screen.getByRole("button", { name: "Xem thay đổi" }));
    const d = await screen.findByRole("dialog");
    await waitFor(() => expect(d).toHaveTextContent("index.html"));
    expect(d).toHaveTextContent("- <h1>A</h1>");
    expect(d).toHaveTextContent("+ <h1>B</h1>");
  });
});
