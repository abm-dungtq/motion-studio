# Dặn chung cho tám vùng 4a–4h (từ báo cáo phase 3)

1. Test helper `ui/src/shell/test-utils.tsx`: import đầu tiên trong mỗi file test; có `renderUi`, `mockFetch(routes)`, `resetAll`; tự dọn và bù ResizeObserver, EventSource, matchMedia, pointer capture. Kiểm toast bằng `vi.mock("@/api/client.ts", …)` thay `say`; `vi.spyOn` trên module ESM không chạy.
2. `badge` của `registerTab` gọi trong lúc render nút rail: dùng được hook, số hook phải ổn định.
3. Hàm ghi trong `queries.ts` trả `WriteResult { status, data, error, timeout, network }`; JSON còn lại nằm trong `data`. Cache chỉ invalidate khi status 200.
4. `actions.transport` có thêm `playing`, `reload`, `timing`, `audioIds`, `setMute`. Store không có trường timing: đọc `actions.transport.timing()` và nghe `bus` sự kiện `"timing"`.
5. `actions.deletePicked()` đã giữ hai toast của phím Delete; 4a gọi nó.
6. Hàng agent (4e) nhận `{ data, error, reload }`, chạy trong ErrorBoundary riêng; `data` undefined khi chưa có, hàng tự hiện trạng thái lỗi/đang tải, không gọi `controls()` khi chưa có `scan`.
7. Registry ném lỗi khi `component` thiếu; id tab khớp `^[a-z][a-z0-9-]{1,30}$`; cấm `ai` và `output`.
8. `useMarkers()` render lại khi mốc đổi; đổi mốc từ ngoài gọi `notifyMarkers(event, payload)` trong `api/markers.ts`.
9. Riêng 4a: `ui/src/timeline/index.tsx` đang giữ Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y và `TIMELINE_HINT` (SHELL-17); khi thay file phải giữ hai thứ này, export `TimelineArea` và `data-testid="timeline-area"`.
10. Riêng 4h: lead tab fx là "Chuyển cảnh giữa các shot và sửa clip footage: cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung."
11. Trước khi đẩy nhánh: `node ui/scripts/check-ownership.mjs <vùng>`. Báo cáo `parity-`, `phase-04-…-report`, `contract-requests-` mang tên vùng thuộc vùng đó.
12. Máy này: hàm `grep` bọc sẵn in đường dẫn không có `./`; dùng `command grep` khi lệnh Verify lọc theo `./`. Hook chặn lệnh shell có chữ `node_modules`: dùng npm script hoặc đường gián tiếp.
