# Báo cáo planner: viết lại UI Motion Studio bằng React

Ngày 2026-10-23. Plan ở `plans/261023-1018-react-ui-rewrite/plan.md`, có 12 file phase.

## Kết quả

Plan đã được chia lại để chạy song song tối đa, theo yêu cầu của người dùng:

- **Xương sống ngắn:**
  - task 2.0: tạo worktree `feat/react-ui`, sửa fixture lemo cho `npm test` xanh;
  - phase 1 (checklist parity, công cụ thử) chạy song song với phase 2 (khung `ui/`, token, build, port TS);
  - phase 3 dựng vỏ và đóng băng hợp đồng chung bằng tag `ui-contracts-v1`.
- **Tỏa ra:** tám agent song song, mỗi agent có nhánh `feat/react-ui-<vùng>`, worktree riêng, cổng 4412–4419 và tập file riêng trong `ui/src/`:
  - 4a timeline;
  - 4b chất liệu + B-roll;
  - 4c lời + nhạc;
  - 4d đạo diễn + thẻ cổng + inspector;
  - 4e xuất bản + biên nhận + thư viện + dòng agent;
  - 4f anime;
  - 4g lemo;
  - 4h fx.
- **Phase 5 nối tiếp:** gộp tám PR, chạy test tích hợp với bộ nạp thật, thử 14 luồng liên vùng, đo lại fps, chụp 28 ảnh, thử clone sạch, xoá `public/`, sửa tài liệu, mở một PR lên `main`.
- **Công và đường găng:** tổng 93h; đường găng 2 → 3 → 4a → 5 khoảng 46h.

## Hợp đồng chung giữ các vùng không đụng nhau

Ba điều giữ cho tám vùng không cùng sửa một file:

- **Bộ nạp tự tìm thư mục.** Nó nạp `ui/src/panels/*/index.ts` rồi `ui/src/ext/*/index.ts`, nên không có file đăng ký chung.
- **Một file duy nhất gọi server.** `ui/src/api/` có hook hoặc hàm cho đủ 66 route mà UI cũ gọi; Verify đếm bằng grep. Store Zustand có hình dạng chốt sẵn.
- **Bản đồ sở hữu có kiểm.** `ui/ownership.json` và `check-ownership.mjs` chặn mọi file ngoài vùng. Một test đảm bảo không có glob nào trùng giữa hai vùng.

Vùng cần đổi hợp đồng thì ghi yêu cầu cho orchestrator, không tự sửa.

## Đã kiểm trong code

- `routes/extensions.mjs:12-17` bắt lỗi khi thiếu thư mục, nên xoá `public/` không làm route lỗi. `lib/routes.mjs:21` `PUBLIC_FILE` phải giữ.
- `public/panels.js:128` gọi `fetch` thẳng tới `STORYBOARD.md`. Hợp đồng có thêm `useProjectText`.
- `public/inspector.js` và timeline dùng chung `ctx.markers`. Hợp đồng có thêm thực thể `markers` trong `ui/src/api/markers.ts`.
- Thứ tự mục inspector của extension cũ là `broll`, `fx`, `lemo`, `receipts` (theo tên file). Plan chốt `order` 30, 40, 50, 60.

## Câu hỏi còn mở

Mỗi câu đã có mặc định, xem `plan.md`:

1. Giữ `/api/extensions`.
2. Thư viện chuyển cảnh chuyển sang tab `fx`.
3. Commit ảnh JPEG vào `screens/`.
4. Ảnh trên sân khấu khi chưa có composition.
5. Chữ lead của tab `fx`.
