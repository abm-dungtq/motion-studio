import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn(), projectText: vi.fn(async () => null) }));
vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), directorAnswer: vi.fn(), director: vi.fn() }));

import { actions } from "@/api/actions.ts";
import { queryClient } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { DirectorRequest } from "@/api/types.ts";
import { answerFailure } from "@/core/gate-cards.ts";
import { DirectorChat } from "./DirectorChat.tsx";
import { approveAsk, choiceAsk, NAME, openProject, req, routes } from "./fixtures.ts";
import { useDirectorMemo } from "./memo.ts";

const answer = vi.mocked(Q.directorAnswer);
const waiting = (ask: DirectorRequest["ask"], id = "r-gate") => req(id, { status: "waiting_user", ask });
const card = () => screen.getByRole("group", { name: "Câu hỏi của đạo diễn" });
const setList = (list: DirectorRequest[]) => act(() => { queryClient.setQueryData(Q.keys.requests(NAME), list); });

beforeEach(() => {
  answer.mockReset();
  vi.mocked(Q.director).mockReset();
  useDirectorMemo.setState({ reopen: new Set(), rejecting: new Set(), drafts: {} });
  mockFetch(routes());
});

describe("GateCard: direction choice", () => {
  it("shows the question with a picture on each option", () => {
    openProject({ requests: [waiting(choiceAsk)] });
    renderUi(<DirectorChat />);
    expect(card()).toHaveTextContent("Đạo diễn cần bạn trả lời");
    expect(card()).toHaveTextContent("Chọn hướng?");
    expect(card().querySelector('[data-role="options"]')).toHaveAttribute("data-pics", "true");
    expect(card().querySelectorAll("img")[1]).toHaveAttribute("src", `/p/${NAME}/pitch/2.png`);
  });

  it("sends the second option's value and locks every button while it waits", async () => {
    let done!: (v: Q.WriteResult) => void;
    answer.mockReturnValue(new Promise((r) => { done = r; }));
    const spy = vi.spyOn(actions, "answer");
    openProject({ requests: [waiting(choiceAsk)] });
    renderUi(<DirectorChat />);
    fireEvent.click(screen.getByRole("button", { name: "Rực rỡ" }));
    expect(spy).toHaveBeenCalledWith("r-gate", "2");
    expect(answer).toHaveBeenCalledWith({ name: NAME, id: "r-gate", value: "2" }, { timeout: 90000 });
    for (const b of card().querySelectorAll("button")) expect(b).toBeDisabled();
    await act(async () => { done({ status: 200, data: {} }); });
  });

  it("shows the answerFailure text in the card when the answer times out, and unlocks it", async () => {
    answer.mockResolvedValue({ status: 0, timeout: true, error: "Studio không trả lời kịp" });
    openProject({ requests: [waiting(choiceAsk)] });
    renderUi(<DirectorChat />);
    fireEvent.click(screen.getByRole("button", { name: "Tối giản" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(answerFailure({ timeout: true }));
    for (const b of card().querySelectorAll("button")) expect(b).toBeEnabled();
  });

  it("keeps the same card element when the request list changes", () => {
    openProject({ requests: [waiting(choiceAsk)] });
    renderUi(<DirectorChat />);
    const before = card();
    setList([req("r0"), waiting(choiceAsk), req("r9", { status: "queued" })]);
    expect(card()).toBe(before);
  });

  it("answers exactly once when the list changes during the press", async () => {
    answer.mockResolvedValue({ status: 200, data: {} });
    openProject({ requests: [waiting(choiceAsk)] });
    renderUi(<DirectorChat />);
    const button = screen.getByRole("button", { name: "Rực rỡ" });
    fireEvent.pointerDown(button, { button: 0 });
    setList([waiting(choiceAsk), req("r9", { status: "running" })]);
    // The redraw waits for the press: the new request is not on screen yet.
    expect(screen.queryByText("Đang làm…")).toBeNull();
    expect(button.isConnected).toBe(true);
    fireEvent.pointerUp(window);
    await act(async () => { fireEvent.click(button); });
    expect(answer).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Đang làm…")).toBeInTheDocument());
  });
});

describe("GateCard: animatic approval", () => {
  it("shows the video, its link and the two buttons", () => {
    openProject({ requests: [waiting(approveAsk)] });
    renderUi(<DirectorChat />);
    expect(card().querySelector("video")).toHaveAttribute("src", `/p/${NAME}/demo/animatic.mp4`);
    expect(screen.getByRole("link", { name: "animatic.mp4" })).toHaveAttribute("target", "_blank");
    expect([...card().querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Chưa được", "Duyệt"]);
  });

  it("approves", async () => {
    answer.mockResolvedValue({ status: 200, data: {} });
    openProject({ requests: [waiting(approveAsk)] });
    renderUi(<DirectorChat />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Duyệt" })); });
    expect(answer).toHaveBeenCalledWith({ name: NAME, id: "r-gate", value: "approve" }, { timeout: 90000 });
  });

  it("opens a reject note on Chưa được, keeps its draft, and sends it with the reject", async () => {
    answer.mockResolvedValue({ status: 200, data: {} });
    openProject({ requests: [waiting(approveAsk)] });
    const first = renderUi(<DirectorChat />);
    fireEvent.click(screen.getByRole("button", { name: "Chưa được" }));
    const note = screen.getByLabelText("Ghi chú: chưa được ở đâu");
    expect(note).toHaveAttribute("placeholder", "Chỗ nào chưa được? Đạo diễn sẽ sửa theo ghi chú này.");
    fireEvent.change(note, { target: { value: "chữ shot 2 nhỏ quá" } });
    first.unmount();
    renderUi(<DirectorChat />);
    expect(screen.getByLabelText("Ghi chú: chưa được ở đâu")).toHaveValue("chữ shot 2 nhỏ quá");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gửi ghi chú" })); });
    expect(answer).toHaveBeenCalledWith({ name: NAME, id: "r-gate", value: { reject: "chữ shot 2 nhỏ quá" } }, { timeout: 90000 });
  });

  it("keeps the card and unlocks it when the answer fails with 500", async () => {
    answer.mockResolvedValue({ status: 500, error: "lỗi thử trả lời", data: { stderr: "dòng đầu\nchi tiết cuối" } });
    openProject({ requests: [waiting(approveAsk)] });
    renderUi(<DirectorChat />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Duyệt" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa gửi được câu trả lời: lỗi thử trả lời (chi tiết cuối). Bấm lại để thử.");
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeEnabled();
  });
});

describe("GateCard: expired question", () => {
  it("answers again as a new request carrying the old question", async () => {
    vi.mocked(Q.director).mockResolvedValue({ status: 200, data: {} });
    openProject({ requests: [req("x", { status: "failed", error: "Hết hạn chờ trả lời", ask: { question: "Muốn chữ gì ở shot cuối?", kind: "text" } })] });
    renderUi(<DirectorChat />);
    fireEvent.click(screen.getByRole("button", { name: "Trả lời lại" }));
    fireEvent.change(screen.getByLabelText("Câu trả lời"), { target: { value: "Chữ: Cảm ơn đã xem" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gửi" })); });
    expect(Q.director).toHaveBeenCalledWith({ name: NAME, scope: "project", text: "Trả lời lại câu hỏi \"Muốn chữ gì ở shot cuối?\": Chữ: Cảm ơn đã xem" });
    expect(answer).not.toHaveBeenCalled();
  });
});
