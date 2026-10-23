import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { useStudio } from "@/store/studio.ts";
import { ReceiptList } from "./ReceiptList.tsx";
import { ShotReceipts } from "./ShotReceipts.tsx";

const NAME = "thuy-mau-demo";
const OUT = "footage/cut/1-trim.mp4";
const ROWS = { receipts: [{ id: "r1", op: "<b>x</b>", actor: "human", written: "2026-10-23T04:56:00Z", verdict: "pass", outputs: [OUT] }] };
const DETAIL = { id: "r1", op: "fx-trim", checks: [{ id: "silence", pass: true, level: "info", file: OUT, detail: "<b>x</b> không có tiếng" }] };

describe("receipts", () => {
  it("text from a receipt shows as text, never as HTML; a row opens its checks", async () => {
    mockFetch({ "/api/receipts": ROWS, "/api/receipt": DETAIL });
    useStudio.setState({ name: NAME });
    const { container } = renderUi(<ReceiptList />);
    const row = await screen.findByRole("button", { expanded: false });
    expect(row).toHaveTextContent("<b>x</b>");
    expect(container.querySelector("b")).toBeNull();
    expect(row).toHaveTextContent("đạt");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("<b>x</b> không có tiếng")).toBeInTheDocument();
    expect(screen.getByText("JSON đầy đủ")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });

  it("no receipts: the empty text; a failed read shows the error", async () => {
    mockFetch({ "/api/receipts": { receipts: [] } });
    useStudio.setState({ name: NAME });
    renderUi(<ReceiptList />);
    expect(await screen.findByText("Chưa có biên nhận. Mỗi lần sinh ảnh, kiểm media hay xuất file sẽ ghi một biên nhận ở đây.")).toBeInTheDocument();
  });

  it("the shot inspector lists only the receipts of the shot's files", async () => {
    mockFetch({ "/api/receipts": ROWS });
    useStudio.setState({ name: NAME });
    const m = { version: 1, lines: [], shots: [{ id: "s1", start: 0, end: 1, assets: [OUT] }, { id: "s2", start: 1, end: 2, assets: ["other.mp4"] }] } as unknown as Manifest;
    queryClient.setQueryData([...keys.receipts(NAME), 20], ROWS);
    const { unmount } = renderUi(<ShotReceipts pick={{ kind: "shot", id: "s1" }} m={m} />);
    expect(screen.getByText("Biên nhận của file trong shot")).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent(OUT);
    unmount();
    renderUi(<ShotReceipts pick={{ kind: "shot", id: "s2" }} m={m} />);
    expect(screen.getByText("Chưa có biên nhận cho file của shot này.")).toBeInTheDocument();
  });
});
