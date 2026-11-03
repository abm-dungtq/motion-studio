import { answerConfirm, mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, idleTransport } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import type { Note } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { NoteInput } from "./NoteInput.tsx";
import { NoteMarks } from "./NoteMarks.tsx";
import { NotesList } from "./NotesList.tsx";

const note = (id: string, t: number, text: string, state: Note["state"] = "open"): Note => ({ id, t, text, shot: "s1", state, created: "2026-11-03T10:00:00.000Z", request: null });

// A small notes server: add, update, remove and send change the list the next GET returns.
function server(start: Note[]) {
  let notes = [...start];
  const body = (i?: RequestInit) => JSON.parse(String(i?.body ?? "{}"));
  const fetch = mockFetch({
    "/api/projects": [{ name: "demo", title: "Demo", has_manifest: true, editable: true, version: 1 }],
    "/api/project": { version: 1, fps: 30, shots: [{ id: "s1", start: 0, end: 10 }, { id: "s2", start: 10, end: 20 }], lines: [] },
    "/api/notes": () => ({ notes }),
    "/api/notes/add": (_u: URL, i?: RequestInit) => { const b = body(i); const n = note(`n-${notes.length + 1}`, b.t, b.text); n.shot = b.shot; notes.push(n); return n; },
    "/api/notes/update": (_u: URL, i?: RequestInit) => { const b = body(i); notes = notes.map((n) => (n.id === b.id ? { ...n, ...(b.text ? { text: b.text } : {}), ...(b.state ? { state: b.state } : {}) } : n)); return {}; },
    "/api/notes/remove": (_u: URL, i?: RequestInit) => { const b = body(i); notes = notes.filter((n) => n.id !== b.id); return { ok: true }; },
    "/api/notes/send": (_u: URL, i?: RequestInit) => { const b = body(i); notes = notes.map((n) => (b.ids.includes(n.id) ? { ...n, state: "sent" as const, request: "r1" } : n)); return { request: { id: "r1" } }; },
    "/api/requests": [],
    "/api/jobs": [],
  });
  const calls = (path: string) => fetch.mock.calls.filter(([u]) => new URL(String(u), "http://x").pathname === path).map(([, i]) => body(i));
  return { calls };
}

beforeEach(() => {
  queryClient.clear();
  useStudio.setState({ name: "demo", noteAt: null, rightTab: "shot" });
  actions.transport = idleTransport;
});

describe("NotesList", () => {
  it("says how to pin a note when there is none", async () => {
    server([]);
    renderUi(<NotesList />);
    expect(await screen.findByText("Nhấn C khi xem để ghim ghi chú tại playhead.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ghi chú (0 chưa xử lý)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Giao đạo diễn/ })).toBeNull();
  });

  it("counts open notes, closes one with Xong and sends the rest after asking", async () => {
    const { calls } = server([note("n-1", 12.4, "chữ ra muộn"), note("n-2", 3, "nhạc to quá")]);
    renderUi(<NotesList />);
    const sendBtn = await screen.findByRole("button", { name: "Giao đạo diễn sửa 2 ghi chú" });
    expect(sendBtn).toBeInTheDocument();
    expect(screen.getAllByTestId("note-row").map((r) => r.textContent)).toEqual([expect.stringContaining("0:03.0"), expect.stringContaining("0:12.4")]);

    fireEvent.click(screen.getByRole("button", { name: "Xong ghi chú 0:03.0" }));
    await screen.findByRole("button", { name: "Giao đạo diễn sửa 1 ghi chú" });
    expect(calls("/api/notes/update")).toEqual([{ name: "demo", id: "n-2", state: "done" }]);
    expect(screen.getByRole("heading", { name: "Ghi chú (1 chưa xử lý)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Giao đạo diễn sửa 1 ghi chú" }));
    expect(await answerConfirm(true)).toBe("Giao 1 ghi chú cho đạo diễn?");
    await waitFor(() => expect(calls("/api/notes/send")).toEqual([{ name: "demo", ids: ["n-1"] }]));
    await waitFor(() => expect(screen.getByTestId("note-row")).toHaveTextContent("đã giao đạo diễn"));
    expect(screen.queryByRole("button", { name: /Giao đạo diễn sửa/ })).toBeNull();
  });

  it("sends nothing when the question is cancelled", async () => {
    const { calls } = server([note("n-1", 1, "a")]);
    renderUi(<NotesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Giao đạo diễn sửa 1 ghi chú" }));
    await answerConfirm(false);
    expect(calls("/api/notes/send")).toEqual([]);
  });

  it("edits a note's text with Enter and deletes one", async () => {
    const { calls } = server([note("n-1", 5, "chữ nhỏ"), note("n-2", 6, "xoá tôi")]);
    renderUi(<NotesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa ghi chú 0:05.0" }));
    const box = screen.getByRole("textbox", { name: "Sửa ghi chú 0:05.0" });
    fireEvent.change(box, { target: { value: "chữ nhỏ quá" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls("/api/notes/update")).toEqual([{ name: "demo", id: "n-1", text: "chữ nhỏ quá" }]));
    fireEvent.click(screen.getByRole("button", { name: "Xoá ghi chú 0:06.0" }));
    await waitFor(() => expect(screen.getAllByTestId("note-row")).toHaveLength(1));
    expect(calls("/api/notes/remove")).toEqual([{ name: "demo", id: "n-2" }]);
  });
});

describe("NoteMarks and NoteInput", () => {
  it("marks open and sent notes on the ruler; a click seeks and opens the director tab", async () => {
    server([note("n-1", 12.4, "chữ ra muộn"), note("n-2", 3, "đã gửi", "sent"), note("n-3", 4, "xong rồi", "done")]);
    const seek = vi.fn();
    actions.transport = { ...idleTransport, seek };
    renderUi(<div><NoteMarks pps={10} /><NotesList /></div>);
    const marks = await screen.findAllByTestId("note-mark");
    expect(marks.map((m) => [m.getAttribute("aria-label"), m.textContent])).toEqual([["Ghi chú 0:12.4: chữ ra muộn", "!"], ["Ghi chú 0:03.0: đã gửi", "→"]]);
    fireEvent.click(screen.getByRole("button", { name: "Ghi chú 0:12.4: chữ ra muộn" }));
    expect(seek).toHaveBeenCalledWith(12.4);
    expect(useStudio.getState().rightTab).toBe("director");
  });

  it("pins the typed note with the shot under the playhead on Enter; Escape drops it", async () => {
    const { calls } = server([]);
    renderUi(<NoteInput pps={10} width={1000} />);
    expect(screen.queryByTestId("note-input")).toBeNull();
    act(() => useStudio.getState().setNoteAt(12.4));
    const box = await screen.findByRole("textbox", { name: /Ghi chú tại 0:12.4/ });
    await waitFor(() => expect(box).toHaveFocus());
    fireEvent.change(box, { target: { value: "  thử ghi chú " } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls("/api/notes/add")).toEqual([{ name: "demo", t: 12.4, text: "thử ghi chú", shot: "s2" }]));
    expect(useStudio.getState().noteAt).toBeNull();

    act(() => useStudio.getState().setNoteAt(1));
    fireEvent.keyDown(await screen.findByRole("textbox"), { key: "Escape" });
    expect(useStudio.getState().noteAt).toBeNull();
    expect(calls("/api/notes/add")).toHaveLength(1);
  });
});
