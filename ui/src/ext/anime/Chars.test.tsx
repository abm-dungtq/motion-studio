import { mockFetch, renderUi } from "@/shell/test-utils.tsx";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { queryClient } from "@/api/client.ts";
import { keys } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { AnimeTab } from "./AnimeTab.tsx";
import { useAnimeStore } from "./store.ts";

const h = vi.hoisted(() => ({ say: vi.fn(), chars: vi.fn() }));
vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: h.say }));
vi.mock("@/api/queries.ts", async (orig) => ({ ...(await orig<typeof import("@/api/queries.ts")>()), animeChars: h.chars }));

const CHAR = { id: "thu-nv", name: "Nhân vật thử", key_color: "#0047FF", palette: ["#112233", "#445566"], notes: "", sheet: null, exists: false }; // token-exempt: test data

let charsAnswer: unknown;
function open() {
  mockFetch({
    "/api/projects": [{ name: "demo", has_manifest: true }],
    "/api/project": { shots: [], lines: [] },
    "/api/anime/board": { columns: [], shots: [], chars: [] },
    "/api/anime/chars": () => charsAnswer,
    "/api/anime/manifest": { exists: false, enabled: false, manifest: null, sha: null, final: [] },
  });
  act(() => { useStudio.setState({ name: "demo" }); useAnimeStore.getState().setSub("chars"); });
  return renderUi(<AnimeTab />);
}

beforeEach(() => {
  h.say.mockReset();
  h.chars.mockReset();
  charsAnswer = { chars: [] };
});

test("empty library and the add form with the old labels", async () => {
  open();
  expect(await screen.findByText("Chưa có nhân vật. Thêm một nhân vật rồi sinh sheet 4 góc, hoặc đặt sẵn assets/chars/<id>-sheet.png.")).toBeInTheDocument();
  expect(screen.getByText("Thêm nhân vật")).toBeInTheDocument();
  for (const l of ["Id (chữ thường, số, -)", "Tên", "Màu nền tách (không dùng xanh lá nếu nhân vật có màu xanh lá)", "Bảng màu (#RRGGBB, cách nhau bằng dấu phẩy)", "Sheet (đường trong dự án, có thể để trống)", "Ghi chú, mô tả"]) {
    expect(screen.getByLabelText(l)).toBeInTheDocument();
  }
});

test("what is typed in the form stays when the chars query reloads", async () => {
  open();
  const id = await screen.findByLabelText("Id (chữ thường, số, -)");
  fireEvent.change(id, { target: { value: "thu-nv" } });
  fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Nhân vật thử" } });
  charsAnswer = { chars: [CHAR] };
  await act(() => queryClient.invalidateQueries({ queryKey: keys.anime("chars", "demo") }));
  expect(await screen.findByText("thu-nv", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByLabelText("Id (chữ thường, số, -)")).toHaveValue("thu-nv");
  expect(screen.getByLabelText("Tên")).toHaveValue("Nhân vật thử");
});

test("Lưu posts the character with the palette as a list and says so", async () => {
  h.chars.mockResolvedValue({ status: 200, data: { char: { ...CHAR } } });
  open();
  fireEvent.change(await screen.findByLabelText("Id (chữ thường, số, -)"), { target: { value: "thu-nv" } });
  fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Nhân vật thử" } });
  fireEvent.change(screen.getByLabelText("Bảng màu (#RRGGBB, cách nhau bằng dấu phẩy)"), { target: { value: "#112233, #445566" } }); // token-exempt: test data
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(h.say).toHaveBeenCalledWith("Đã lưu Nhân vật thử"));
  expect(h.chars).toHaveBeenCalledWith({ name: "demo", char: { id: "thu-nv", name: "Nhân vật thử", key_color: "#0047FF", palette: ["#112233", "#445566"], notes: "", sheet: null } }); // token-exempt: test data
  expect(screen.getByLabelText("Id (chữ thường, số, -)")).toHaveValue("");
});

test("Sinh sheet: needs a description, then asks; Huỷ sends nothing", async () => {
  charsAnswer = { chars: [CHAR] };
  open();
  const card = await screen.findByText("chưa có sheet");
  const root = card.closest("[data-char]") as HTMLElement;
  fireEvent.click(within(root).getByRole("button", { name: "Sinh sheet" }));
  expect(h.say).toHaveBeenCalledWith("Ghi mô tả nhân vật trước (tiếng Anh cho agent)", true);
  fireEvent.change(within(root).getByPlaceholderText("young swordsman, green hair, three katanas, white shirt"), { target: { value: "a girl" } });
  fireEvent.click(within(root).getByRole("button", { name: "Sinh sheet" }));
  const dlg = await screen.findByRole("dialog");
  expect(dlg).toHaveTextContent("Sinh sheet 4 góc cho Nhân vật thử (tốn 1 ảnh quota)?");
  fireEvent.click(within(dlg).getByRole("button", { name: "Huỷ" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(h.chars).not.toHaveBeenCalled();
});

test("Sửa fills the form; Bỏ asks then removes", async () => {
  charsAnswer = { chars: [CHAR] };
  h.chars.mockResolvedValue({ status: 200, data: {} });
  open();
  const root = (await screen.findByText("chưa có sheet")).closest("[data-char]") as HTMLElement;
  fireEvent.click(within(root).getByRole("button", { name: "Sửa" }));
  expect(screen.getByText("Sửa thu-nv")).toBeInTheDocument();
  fireEvent.click(within(root).getByRole("button", { name: "Bỏ" }));
  const dlg = await screen.findByRole("dialog");
  expect(dlg).toHaveTextContent("Bỏ Nhân vật thử khỏi thư viện? File sheet vẫn giữ nguyên.");
  fireEvent.click(within(dlg).getByRole("button", { name: "Đồng ý" }));
  await waitFor(() => expect(h.chars).toHaveBeenCalledWith({ name: "demo", remove: "thu-nv" }));
});

test("a load error uses the old text", async () => {
  mockFetch({ "/api/projects": [{ name: "demo", has_manifest: false }] });
  act(() => { useStudio.setState({ name: "demo" }); useAnimeStore.getState().setSub("chars"); });
  renderUi(<AnimeTab />);
  expect(await screen.findByText("Không tải được thư viện nhân vật: not found")).toBeInTheDocument();
});
