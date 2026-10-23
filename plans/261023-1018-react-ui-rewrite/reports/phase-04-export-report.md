# Vùng export: hộp thoại Xuất bản, biên nhận, Thư viện mẫu, hộp thoại agent

Nhánh `feat/react-ui-export`, cắt từ `origin/feat/react-ui` (sau tag `ui-contracts-v1`) và đã merge lại `origin/feat/react-ui` mới nhất (`61397b3`, có sửa hợp đồng cho AGENT-15). PR vào `feat/react-ui`.

## Việc đã làm

- **Hộp thoại Xuất bản** (`ui/src/panels/export/`): ba mục đăng ký vào khe `export`.
  - `GateFails` (order 10): tiêu đề "Cần duyệt lại animatic" / "Chưa đủ cổng xuất" và từng dòng FAIL; chưa có dự án hay project.json thì hiện câu `NeedManifest` một lần.
  - `Jobs` (order 20): 4 job mới nhất, Log trong `<details>` mở khi job chạy và cuộn theo dòng mới, nút Dừng gọi `actions.cancelJob`.
  - `Exported` (order 30): mỗi thư mục bộ lớp dựng là một dòng (manifest.json), rồi các MP4; tự tải lại khi một job kết thúc.
- **Biên nhận** (`ui/src/ext/receipts/`): mục "Biên nhận" (order 40) trong hộp thoại Xuất bản, có "Làm mới" (`refetch`) và mở chi tiết từng kiểm cùng "JSON đầy đủ". Thêm mục inspector cho shot (order 60) liệt kê biên nhận của file trong `shot.assets`. Bộ đệm cũ được thay bằng cache TanStack Query. Mọi chữ đều là text node.
- **Tab Thư viện mẫu** (`ui/src/core/library.ts`, `ui/src/panels/library/`): tab `library`, nhóm `library`, order 10, icon `Library`.
  - Phần thuần (`LIBRARY`, `promptExcerpt`, `use`, `copy`, `libraryParams`) nằm trong `core/library.ts`.
  - Tab có bốn loại mẫu, ô tìm (Enter hoặc nút Tìm), thể loại (shadcn `Select`), ô "Chỉ mẫu tuyển chọn", phân trang "Xem thêm", thẻ toolkit, ví dụ bấm được và dòng nguồn (`safeUrl`).
  - Trạng thái tìm kiếm giữ trong store zustand riêng của vùng, sống lâu hơn tab, như `memo` cũ.
- **Hộp thoại agent**:
  - `panels/agent/AgentStatus.tsx`: các dòng trạng thái của `/api/agent`.
  - `ext/agents/AgentTable.tsx`: bảng Agent CLI, quota, thứ tự định tuyến, "Làm mới" và "Thử khả năng". Khi probe chạy, bảng hỏi lại `/api/agents` mỗi 1,5 s, tối đa 6 phút.
  - Bảng rộng `min(640px, calc(100vw - 16px))`.
  - Không đọc email, token hay cách đăng nhập.
  - Không hiện nút khi chưa có scan.

## Kiểm tra

- `npm test` ở gốc: `ℹ pass 315`, `ℹ fail 0`; vitest của `ui/` xanh toàn bộ (số ở phần mô tả PR).
- Test của vùng (vitest, `src/panels/export src/ext/receipts src/panels/library src/panels/agent src/ext/agents`): 4 file, 20 test.
- `tsc --noEmit` sạch.
- `node ui/scripts/check-ownership.mjs export`: ok.
- Thử trực tiếp trên 4416:
  - đã đi hết 65 dòng nhóm 4e, kết quả ở `reports/parity-export.md`;
  - cả 65 dòng "có"; AGENT-15 đạt sau khi merge sửa hợp đồng `61397b3`;
  - "Thử khả năng" chỉ chạy khi bị chặn trong trình duyệt hoặc trong vitest, nên không tốn quota.
- Ảnh: `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/export/{1440,2560}/{export,library,agent}.png`. Lệnh `shoot.mjs` in `ok 6`.

## Yêu cầu đổi hợp đồng

`reports/contract-requests-export.md`, mục 1: hộp thoại agent đóng bằng Escape không trả focus về chip, vì Radix Dialog chỉ trả focus cho `DialogTrigger`. Orchestrator đã sửa `ui/src/shell/AgentDialog.tsx` và `ui/src/shell/AgentChip.tsx` (`61397b3`); đã merge và thử lại trên 4416: Escape trả focus về chip.

## Khác bản cũ có chủ đích

- STATE-16: bản cũ hiện "Mục mở rộng lỗi: Cannot read properties of null (reading 'agents')" khi `/api/agents` lỗi lúc chưa có scan. Bản mới hiện "Không đọc được danh sách agent: <lỗi>" và không có nút, theo dặn chung số 6.
- GET `/api/library` không gửi `q=` rỗng, vì hàm `params` của `queries.ts` bỏ tham số rỗng. Server mặc định `q` là chuỗi rỗng nên kết quả như cũ.
- Mở hộp thoại agent chỉ gọi GET `/api/agent` một lần, do chip gọi `refetch`. Dòng trạng thái không gọi thêm, để giữ đúng "(1)" của AGENT-02.

## Ghi chú tài liệu (cho phase 5)

Đã đọc lại bốn tài liệu: không file nào nhắc `public/`. Vẫn cần sửa chữ "tab Xuất bản", vì tab đó nay là menu Xuất bản cộng hộp thoại "Cổng & tệp đã xuất…":

- `docs/receipts.md:15`: "Tab Xuất bản → Biên nhận" → "Xuất bản → Cổng & tệp đã xuất… → Biên nhận".
- `docs/nle-export.md:3`: "nút **Xuất bộ lớp dựng** ở tab Xuất bản" → "mục **Xuất bộ lớp dựng** trong menu Xuất bản".
- `docs/agents.md` và `docs/extensions.md:147-178` (mục "Biên nhận", "Agent CLI"): không có chỗ trỏ `public/` cần sửa. Nếu mục extension có mô tả API `addSection("output", …)` / `addAgentRows` thì đổi sang `registerSection("export", …)` / `registerAgentRows({ component, width })` khi phase 5 viết lại trang API.
