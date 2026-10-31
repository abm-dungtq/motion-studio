import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), suggestChoose: vi.fn(), suggestRun: vi.fn() }));

import { queryClient } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import type { SuggestItem, SuggestRecord, SuggestResponse, SuggestSide } from "@/api/types.ts";
import { NAME, openProject, routes } from "./fixtures.ts";
import { SuggestCard } from "./SuggestCard.tsx";

const choose = vi.mocked(Q.suggestChoose);
const run = vi.mocked(Q.suggestRun);

const dir = (id: string, source: "jev" | "det", score: number | null = null): SuggestItem => ({
  id, label: `Hướng ${id}`, score, confidence: null, reason: `Lý do ${id} (trường \`category: explainer\`).`, source, fields: ["`category: explainer`"],
});
const style = (id: string, d: string, source: "jev" | "det"): SuggestItem => ({
  id, label: id, score: source === "jev" ? 3 : null, confidence: null, reason: `Style ${id}.`, source, directions: [d],
});
const side = (source: "jev" | "det", order: string[]): SuggestSide => ({
  directions: order.map((id, i) => dir(id, source, source === "jev" ? 4 - i : null)),
  styles: [style("data-editorial", "A6", source), style("swiss-kinetic-editorial", "A3", source)],
  workflow: {
    mode: "dao-dien", label: "Đạo diễn", pitch: true, steps: ["pitch", "choose", "voice", "render"],
    skip: [{ step: "cut", reason: "Dự án chưa có footage trong footage/raw hay assets/footage." }],
    reason: "BRIEF không có `mode` hay `creative_override` chỉ cách làm khác, nên dùng cách mặc định.", source,
  },
});
const det = side("det", ["A6", "A8", "A3"]);
const jev = side("jev", ["A8", "A6", "A3"]);
const record = (over: Partial<SuggestRecord> = {}): SuggestRecord => ({
  v: 1, at: "2026-10-23T09:00:00.000Z", project: NAME, hash: "h1", source: "observe", shown: "jev", error: null, det, jev, ms: 900, questions: 13, ...over,
});
const resp = (over: Partial<SuggestResponse> = {}): SuggestResponse => ({
  record: record(), columns: ["jev", "det"], picks: [{ n: 1, id: "A6", style_profile: "data-editorial", dir: "pitch/1" }], source: "observe", source_setting: null,
  modes: [{ id: "dao-dien", label: "Đạo diễn" }, { id: "nhanh", label: "Nhanh" }, { id: "tu-nhac", label: "Từ nhạc" }, { id: "timeline", label: "Timeline" }],
  can_save_mode: false, can_init_pitch: false, ...over,
});
const detOnly = (over: Partial<SuggestResponse> = {}) => resp({ record: record({ source: "deterministic", shown: "det", jev: null }), columns: ["det"], source: "deterministic", ...over });

const card = () => screen.getByRole("region", { name: "Gợi ý cho dự án" });
const dirs = (source: string) => [...card().querySelectorAll(`[data-role="suggest-direction"][data-source="${source}"]`)];
const chooseButton = () => screen.getByRole("button", { name: "Chọn và tạo pitch" });
const show = (r: SuggestResponse) => {
  openProject();
  queryClient.setQueryData(Q.keys.suggest(NAME), r);
  mockFetch({ ...routes(), "/api/suggest": () => queryClient.getQueryData(Q.keys.suggest(NAME)) });
  renderUi(<SuggestCard />);
};

beforeEach(() => {
  choose.mockReset();
  run.mockReset();
});

describe("SuggestCard", () => {
  it("lays the columns out in the order the server gives", () => {
    show(resp({ columns: ["det", "jev"] }));
    const heads = [...card().querySelectorAll('[data-role="suggest-columns"] > [role="radiogroup"]')].map((g) => g.getAttribute("aria-label"));
    expect(heads).toEqual(["Hướng theo Tất định", "Hướng theo Jev"]);
  });

  it("observe shows both columns, picks nothing, and compares rank one", () => {
    show(resp());
    expect(card().querySelector('[data-role="suggest-columns"]')).not.toBeNull();
    expect(card().querySelector('[data-role="suggest-source"]')).toHaveTextContent(/^Jev và tất định, chưa chọn nguồn mặc định$/);
    expect(dirs("jev")).toHaveLength(3);
    expect(dirs("det")).toHaveLength(3);
    expect(dirs("jev")[0]).toHaveAttribute("data-id", "A8");
    expect(dirs("det")[0]).toHaveAttribute("data-id", "A6");
    for (const b of [...dirs("jev"), ...dirs("det")]) expect(b).toHaveAttribute("aria-checked", "false");
    expect(chooseButton()).toBeDisabled();
    expect(card()).toHaveTextContent("Chọn một hướng ở một trong hai cột để tiếp tục.");
    expect(card()).toHaveTextContent("Gợi ý tất định: Hướng A6. Khác với Jev ở hạng 1.");
    fireEvent.click(dirs("jev")[0]);
    expect(chooseButton()).toBeEnabled();
    expect(dirs("jev")[0]).toHaveAttribute("aria-checked", "true");
    expect(dirs("det")[1]).toHaveAttribute("aria-checked", "true");
  });

  it("deterministic only shows no comparison line", () => {
    show(detOnly());
    expect(screen.getByText("Tất định", { selector: '[data-role="suggest-source"]' })).toBeInTheDocument();
    expect(card().querySelector('[data-role="suggest-columns"]')).toBeNull();
    expect(card()).not.toHaveTextContent("Jev ở hạng 1");
    expect(dirs("det")[0]).toHaveAttribute("aria-checked", "true");
    expect(card()).toHaveTextContent("Bỏ qua: cut (Dự án chưa có footage trong footage/raw hay assets/footage.)");
    expect(card()).toHaveTextContent("pitch → choose → voice → render");
    expect(card()).toHaveTextContent("Chế độ này đi kèm lời yêu cầu gửi đạo diễn, chưa lưu vào project.json.");
  });

  it("styles follow the chosen direction", () => {
    show(resp());
    fireEvent.click(dirs("det")[2]);
    const styles = [...card().querySelectorAll('[data-role="suggest-style"]')].map((b) => b.getAttribute("data-id"));
    expect(styles).toEqual(["swiss-kinetic-editorial"]);
    expect(card()).not.toHaveTextContent("data-editorial");
  });

  it("choose sends the direction, style and mode", async () => {
    const reason = "Chế độ vận hành chưa lưu vào project.json vì provider chưa có lệnh ghi trường này. Đạo diễn vẫn nhận chế độ trong lời yêu cầu.";
    choose.mockResolvedValue({ status: 200, data: { outcome: "chosen", direction: "A6", pick: 2, style: "data-editorial", mode: { saved: false, reason } } });
    show(detOnly());
    await act(async () => { fireEvent.click(chooseButton()); });
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith({ name: NAME, direction: "A6", style: "data-editorial", mode: "dao-dien" });
    expect(card()).toHaveTextContent("Đã chọn hướng A6 với style data-editorial. BRIEF.md đã được cập nhật.");
    expect(card()).toHaveTextContent(reason);
  });

  it("queued and not_in_pitch show their sentences", async () => {
    choose
      .mockResolvedValueOnce({ status: 200, data: { outcome: "queued", mode: { saved: false, reason: null } } })
      .mockResolvedValueOnce({ status: 200, data: { outcome: "not_in_pitch", picks: [{ n: 1, id: "A7", style_profile: null, dir: null }], mode: { saved: false, reason: null } } });
    show(detOnly({ picks: null }));
    expect(card()).toHaveTextContent("Dự án chưa có pitch, nên bấm chọn sẽ nhờ đạo diễn tạo pitch trước.");
    await act(async () => { fireEvent.click(chooseButton()); });
    expect(card()).toHaveTextContent("Dự án chưa có pitch. Đã nhờ đạo diễn tạo pitch trước. Khi pitch xong, bạn bấm chọn lại trên thẻ này.");
    await act(async () => { fireEvent.click(chooseButton()); });
    expect(card()).toHaveTextContent("Pitch hiện có không gồm hướng này. Chọn một trong các hướng đã có trong pitch bên dưới.");
    fireEvent.click(screen.getByRole("button", { name: "A7" }));
    expect(screen.getByRole("button", { name: "A7" })).toHaveAttribute("aria-pressed", "true");
    for (const b of dirs("det")) expect(b).toHaveAttribute("aria-checked", "false");
  });

  it("a provider that builds pitches and saves the mode changes the sentences", async () => {
    choose.mockResolvedValue({ status: 200, data: { outcome: "chosen", direction: "A6", pick: 1, style: "data-editorial", initialized: true, mode: { saved: true, reason: null } } });
    show(detOnly({ can_save_mode: true, can_init_pitch: true, picks: null }));
    expect(card()).not.toHaveTextContent("chưa lưu vào project.json");
    expect(card()).not.toHaveTextContent("nhờ đạo diễn tạo pitch trước");
    await act(async () => { fireEvent.click(chooseButton()); });
    expect(card()).toHaveTextContent("Đã tạo pitch với hướng A6 đứng đầu và chọn hướng này. BRIEF.md đã được cập nhật.");
  });

  it("no record shows the empty sentence and a Gợi ý button", async () => {
    run.mockResolvedValue({ status: 200, data: resp({ record: null }) });
    show(resp({ record: null }));
    expect(card()).toHaveTextContent("Chưa có gợi ý. Bấm Gợi ý để xếp hạng hướng, style và quy trình cho dự án này.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gợi ý" })); });
    expect(run).toHaveBeenCalledWith({ name: NAME, refresh: false });
  });
  it("shows the library cases with the reason, the demo video and how to pick one", () => {
    show(resp({ cases: { warning: null, notes: ["Các case chỉ để tham khảo."], case_search: "jev", text: "", items: [
      { n: 1, id: "y:ror-fly-880547", author: "Ror_Fly", category: "explainer", summary: "Recipe motion graphic", why: "loại video khớp (4/4)", demo: "https://skillry.dev/ai-videos/opus-5-5/ror-fly-880547", url: "https://x.com/Ror_Fly/status/1" },
      { n: 2, id: "c:12", author: "bo", category: "motion", summary: "Logo sting", why: "", url: "https://x.com/bo/status/2" },
      { n: 3, id: "y:post-only", author: "cy", category: "explainer", summary: "Collage", why: "", demo: "https://x.com/cy/status/3", url: "https://x.com/cy/status/3" },
    ] } }));
    const items = [...card().querySelectorAll('[data-role="suggest-case"]')];
    expect(items.map((e) => e.getAttribute("data-id"))).toEqual(["y:ror-fly-880547", "c:12", "y:post-only"]);
    expect(screen.getByRole("link", { name: "y:ror-fly-880547" })).toHaveAttribute("href", "https://x.com/Ror_Fly/status/1");
    const demos = card().querySelectorAll('[data-role="suggest-case-demo"]');
    expect(demos).toHaveLength(1); // none for c:12 (no demo) or y:post-only (the demo is the post itself)
    expect(demos[0]).toHaveAttribute("href", "https://skillry.dev/ai-videos/opus-5-5/ror-fly-880547");
    expect(demos[0]).toHaveAttribute("target", "_blank");
    expect(items[0]).toHaveTextContent("Vì sao: loại video khớp (4/4)");
    expect(card()).toHaveTextContent("theo case 2");
    expect(card().querySelector('[data-role="suggest-cases-warning"]')).toBeNull();
  });

  it("puts a Jev failure at the top of the cases as an alert", () => {
    show(resp({ cases: { warning: "Jev không chạy (HTTP 401): danh sách dưới đây chỉ xếp theo từ khoá.", notes: [], case_search: "find-cases (HTTP 401)", text: "", items: [
      { n: 1, id: "y:a", author: "a", category: "motion", summary: "A", why: "", url: "https://x.com/a" },
    ] } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Jev không chạy (HTTP 401)");
  });

  it("says when the cases were ranked for an older brief, and only then", () => {
    const cases = { warning: null, notes: [], case_search: "jev", text: "", items: [{ n: 1, id: "y:a", author: "a", category: "motion", summary: "A", why: "", url: "https://x.com/a" }] };
    show(resp({ cases, cases_stale: true }));
    expect(card().querySelector('[data-role="suggest-cases-stale"]')).toHaveTextContent("Brief đã đổi sau lần gợi ý case này");
    cleanup();
    show(resp({ cases, cases_stale: false }));
    expect(card().querySelector('[data-role="suggest-cases-stale"]')).toBeNull();
  });
});
