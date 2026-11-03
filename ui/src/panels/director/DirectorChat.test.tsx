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
    // Only the short line is a status; the log under it is hidden from screen readers.
    expect(screen.getByRole("status")).toHaveTextContent(/^Đạo diễn đang làm…$/);
    const working = document.querySelector<HTMLElement>('[data-role="working"]')!;
    expect(working.querySelector("pre")).toHaveAttribute("aria-hidden", "true");
    expect(working).toHaveTextContent("Đang khởi động…");
    act(() => setJobLogs(NAME, { j1: ["a", "b", "c", "d"] }));
    await waitFor(() => expect(working.querySelector("pre")?.textContent).toBe("b\nc\nd"));
  });

  it("sends the box once with Cmd+Enter and empties it", async () => {
    openProject();
    const direct = vi.spyOn(actions, "direct").mockResolvedValue(true);
    renderUi(<DirectorChat />);
    const box = screen.getByLabelText("Việc giao cho đạo diễn");
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
    const box = screen.getByLabelText("Việc giao cho đạo diễn");
    expect(box).toBeEnabled();
    await act(async () => { fireEvent.keyDown(box, { key: "Enter", ctrlKey: true }); });
    expect(say).toHaveBeenCalledWith("Viết yêu cầu cho đạo diễn trước", true);
    expect(queryClient.getQueryData(keys.requests(NAME))).toEqual([]);
  });

  it("keeps the draft in the store across remounts", () => {
    openProject();
    const first = renderUi(<DirectorChat />);
    fireEvent.change(screen.getByLabelText("Việc giao cho đạo diễn"), { target: { value: "shot 3 chậm lại" } });
    first.unmount();
    renderUi(<DirectorChat />);
    expect(screen.getByLabelText("Việc giao cho đạo diễn")).toHaveValue("shot 3 chậm lại");
  });

  describe("scrolling", () => {
    // jsdom has no layout: give the viewport a height so "at the end" means something.
    const inPanel = (suggest: boolean) => {
      renderUi(
        <div data-slot="scroll-area-viewport">
          <section data-section="director/suggest">{suggest ? <p>Gợi ý hướng dựng</p> : null}</section>
          <section data-section="director/chat"><DirectorChat /></section>
        </div>,
      );
      const vp = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
      Object.defineProperty(vp, "scrollHeight", { configurable: true, value: 1000 });
      Object.defineProperty(vp, "clientHeight", { configurable: true, value: 300 });
      return vp;
    };
    // Query updates reach components on the next tick; wait until the new turn is drawn.
    const addRequest = async (id: string) => {
      act(() => { queryClient.setQueryData(keys.requests(NAME), [...(queryClient.getQueryData<ReturnType<typeof req>[]>(keys.requests(NAME)) ?? []), req(id)]); });
      await waitFor(() => expect(chat().textContent).toContain(`xong ${id}`));
    };

    it("does not pull the reader down on a new message; Tin mới ↓ does", async () => {
      openProject({ requests: [req("r1")] });
      useStudio.setState({ rightTab: "director" });
      const vp = inPanel(false);
      vp.scrollTop = 0;
      fireEvent.scroll(vp);
      await addRequest("r2");
      expect(vp.scrollTop).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "Tin mới ↓" }));
      expect(vp.scrollTop).toBe(1000);
      expect(screen.queryByRole("button", { name: "Tin mới ↓" })).not.toBeInTheDocument();
    });

    it("shows the suggest card on open instead of the end of the chat", async () => {
      openProject({ requests: [req("r1")] });
      useStudio.setState({ rightTab: "director" });
      const vp = inPanel(true);
      await addRequest("r2");
      expect(vp.scrollTop).toBe(0);
    });

    it("follows the end when the suggest card is empty", async () => {
      openProject({ requests: [req("r1")] });
      useStudio.setState({ rightTab: "director" });
      const vp = inPanel(false);
      await addRequest("r2");
      expect(vp.scrollTop).toBe(1000);
    });
  });
});
