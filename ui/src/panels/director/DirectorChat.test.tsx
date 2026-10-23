import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn(), projectText: vi.fn(async () => null) }));

import { actions } from "@/api/actions.ts";
import { queryClient, say } from "@/api/client.ts";
import { keys, setJobLogs } from "@/api/queries.ts";
import type { Job } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { DirectorChat } from "./DirectorChat.tsx";
import { NAME, openProject, req, routes } from "./fixtures.ts";

beforeEach(() => { vi.mocked(say).mockClear(); mockFetch(routes()); });

const chat = () => document.querySelector('[data-role="chat"]')!;

describe("DirectorChat", () => {
  it("says what to do without a project", () => {
    renderUi(<DirectorChat />);
    expect(screen.getByText("Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu.")).toBeInTheDocument();
  });

  it("shows the empty chat text and a missing storyboard", async () => {
    openProject();
    renderUi(<DirectorChat />);
    expect(screen.getByText("Chưa giao việc nào. Viết việc đầu tiên ở ô dưới rồi bấm Giao việc.")).toBeInTheDocument();
    expect(await screen.findByText("Chưa có STORYBOARD.md")).toBeInTheDocument();
  });

  it("puts a follow-up request in the thread of the request it answers, without user words", () => {
    openProject({ requests: [req("r1"), req("r2", { follows: "r1", text: "theo sau" }), req("r3")] });
    renderUi(<DirectorChat />);
    const me = [...chat().querySelectorAll('[data-bubble="me"]')].map((e) => e.textContent);
    expect(me).toHaveLength(2);
    expect(me[0]).toContain("việc r1");
    expect(me[0]).toContain("cả dự án · v4 · ");
    expect(chat().textContent).not.toContain("theo sau");
    const bots = [...chat().querySelectorAll('[data-bubble="bot"]')].map((e) => e.textContent);
    expect(bots).toEqual(["xong r1", "xong r2", "xong r3"]);
  });

  it("shows only the last 12 threads", () => {
    openProject({ requests: Array.from({ length: 14 }, (_, i) => req(`r${i + 1}`)) });
    renderUi(<DirectorChat />);
    const me = [...chat().querySelectorAll('[data-bubble="me"]')].map((e) => e.textContent ?? "");
    expect(me).toHaveLength(12);
    expect(me[0]).toContain("việc r3");
    expect(me[11]).toContain("việc r14");
  });

  it("shows the request states with their buttons and texts", () => {
    openProject({
      requests: [
        req("q", { status: "queued" }), req("run", { status: "running", scope: "shot", target: "s2" }),
        req("f", { status: "failed", error: "Lỗi thử: không tìm thấy file" }),
        req("x", { status: "failed", error: "Hết hạn chờ trả lời (24 giờ)", ask: { question: "Muốn chữ gì ở shot cuối?", kind: "text" } }),
      ],
    });
    renderUi(<DirectorChat />);
    expect(screen.getByText("Đang chờ tới lượt.")).toBeInTheDocument();
    expect(screen.getByText("Đang làm…")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Huỷ yêu cầu" })).toHaveLength(2);
    expect(chat().textContent).toContain("shot s2 · v4");
    expect(screen.getByText("Lỗi thử: không tìm thấy file").closest('[data-bubble="bot"]')).toHaveAttribute("data-state", "err");
    expect(screen.getByText("Hết hạn chờ trả lời. Trả lời lại để đạo diễn làm tiếp.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trả lời lại" }));
    expect(screen.getByText("Trả lời lại câu hỏi đã hết hạn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Viết câu trả lời…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(say).toHaveBeenCalledWith("Viết câu trả lời trước", true);
  });

  it("cancels a request", () => {
    openProject({ requests: [req("q", { status: "queued" })] });
    const cancel = vi.spyOn(actions, "cancelRequest").mockResolvedValue();
    renderUi(<DirectorChat />);
    fireEvent.click(screen.getByRole("button", { name: "Huỷ yêu cầu" }));
    expect(cancel).toHaveBeenCalledWith("q");
  });

  it("shows the running director job with its last 3 log lines", async () => {
    const job = { id: "j1", name: NAME, kind: "director", status: "running", code: null, started: "2026-10-23T04:39:36.000Z", meta: { request: "run" } } as Job;
    openProject({ requests: [req("run", { status: "running" })], jobs: [job] });
    setJobLogs(NAME, { j1: [] });
    renderUi(<DirectorChat />);
    const working = screen.getByRole("status");
    expect(working).toHaveTextContent("Đạo diễn đang làm…");
    expect(working).toHaveTextContent("Đang khởi động…");
    act(() => setJobLogs(NAME, { j1: ["a", "b", "c", "d"] }));
    await waitFor(() => expect(working.querySelector("pre")?.textContent).toBe("b\nc\nd"));
  });

  it("sends the box once with Cmd+Enter and empties it", async () => {
    openProject();
    const direct = vi.spyOn(actions, "direct").mockResolvedValue(true);
    renderUi(<DirectorChat />);
    const box = screen.getByLabelText("Việc giao cho AI");
    expect(box).toHaveAttribute("placeholder", "Ví dụ: shot 2 chậm lại, chữ to hơn, thêm logo cuối video…");
    fireEvent.change(box, { target: { value: "shot 3 chậm lại" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter", metaKey: true }); });
    expect(direct).toHaveBeenCalledTimes(1);
    expect(direct).toHaveBeenCalledWith({ scope: "project", text: "shot 3 chậm lại" });
    expect(useStudio.getState().directorDraft).toBe("");
    expect(box).toHaveValue("");
  });

  it("refuses an empty box with the old toast", async () => {
    openProject({ editable: false });
    renderUi(<DirectorChat />);
    const box = screen.getByLabelText("Việc giao cho AI");
    expect(box).toBeEnabled();
    await act(async () => { fireEvent.keyDown(box, { key: "Enter", ctrlKey: true }); });
    expect(say).toHaveBeenCalledWith("Viết yêu cầu cho đạo diễn trước", true);
    expect(queryClient.getQueryData(keys.requests(NAME))).toEqual([]);
  });

  it("keeps the draft in the store across remounts", () => {
    openProject();
    const first = renderUi(<DirectorChat />);
    fireEvent.change(screen.getByLabelText("Việc giao cho AI"), { target: { value: "shot 3 chậm lại" } });
    first.unmount();
    renderUi(<DirectorChat />);
    expect(screen.getByLabelText("Việc giao cho AI")).toHaveValue("shot 3 chậm lại");
  });
});
