# Yêu cầu đổi hợp đồng: vùng director

## 1. `ui/src/shell/InspectorHost.tsx`: chữ lỗi của một mục inspector

- **File:** `ui/src/shell/InspectorHost.tsx:23` (thẻ `<ErrorBoundary what=… resetKey=…>` bọc mỗi mục).
- **Thay đổi:** thêm `fallback={(e) => <p role="alert" className="…">{`Mục mở rộng lỗi: ${e.message}`}</p>}` cho `ErrorBoundary` này (chỉ ở inspector; `SectionHost` giữ `Fail`).
- **Lý do:** UI cũ in `Mục mở rộng lỗi: <message>` khi một mục inspector ném lỗi (`public/inspector.js:35`). Dòng checklist `STATE-29` và `EXT-03` đòi đúng chữ này. Hiện `ErrorBoundary` không có `fallback` nên rơi vào `Fail` (`ui/src/shell/states.tsx:37-40`), in `Không tải được: … Thử bấm lại mục này trên thanh trái.`, sai chữ và sai chỗ (inspector không ở thanh trái).
- **Vùng director không vá được:** lỗi ném trong component của extension, boundary của shell bắt trước; mục của vùng không bọc được mục của vùng khác.
- **Ảnh hưởng tới vùng director:** `STATE-29`, `EXT-03` ghi `không` trong `parity-director.md` cho tới khi sửa xong; phần còn lại không phụ thuộc.
- **Trạng thái:** đã sửa trên `feat/react-ui` (commit `a8a4ed4`), đã merge vào `feat/react-ui-director`.
