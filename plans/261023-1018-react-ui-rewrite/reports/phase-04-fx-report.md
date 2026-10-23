# Vùng fx: tab Chuyển cảnh & hiệu ứng bằng React

Tab mới `fx` (nhóm Chất liệu, thứ tự 40, icon `ArrowLeftRight`) thay cho ba file cũ `public/ext-fx.js`, `fx-gallery.js` và `fx-footage.js`. Chữ, toast, câu lỗi và trạng thái rỗng giữ nguyên văn như bản cũ. Chỗ đặt mới:

- **Thư viện chuyển cảnh** của shot đang chọn: trước nằm trong inspector shot, nay là mục đầu của tab `fx`. Chưa chọn shot thì tab ghi "Chọn một shot trên timeline để áp chuyển cảnh".
- **Sửa clip** cho mọi video đã đăng ký: trước nằm cuối tab Chất liệu, nay là mục thứ hai của tab `fx`.
- **Sửa clip của shot** vẫn nằm trong inspector shot (cột phải, tab Shot), kèm nút "Mở thư viện chuyển cảnh". Nút này mở tab `fx` và mở lại panel trái nếu đang thu gọn.

Câu dẫn của tab lấy theo dặn chung số 10: "Chuyển cảnh giữa các shot và sửa clip footage: cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung."

## File

Mọi file nằm trong `ui/src/ext/fx/`:

| File | Việc |
| --- | --- |
| `index.ts` | `register(studio)`: tab `fx` và mục inspector shot (thứ tự 40) |
| `FxTab.tsx` | Tab: `NeedManifest`, thư viện cho `store.sel`, rồi Sửa clip |
| `Gallery.tsx` | Thư viện chuyển cảnh: tìm, chip nguồn, thẻ, chi tiết, xem thử trong `iframe sandbox="allow-scripts"`, Áp dụng cho shot |
| `Footage.tsx` | Mục Sửa clip, đọc `/api/media` |
| `ClipEditor.tsx` | Bộ sửa clip dùng chung cho tab và inspector: năm thao tác, Render, kết quả Trước/Sau, biên nhận, Dùng trong shot |
| `ShotClips.tsx` | Mục inspector: nút mở tab `fx` và Sửa clip của shot |
| `useJob.ts` | Theo job `fx` qua cache `/api/jobs` (SSE, hỏi lại mỗi 1 s khi job chạy, bỏ chờ sau 30 phút) |
| `clip-params.ts` | Phần thuần: thao tác, preset, `parsePoints`, `paramsOf`, đọc dòng `RESULT` của job |
| `fx-store.ts` | Store nhỏ của vùng: ô tìm, chip và thẻ đang chọn của thư viện; form, job và kết quả của từng bộ sửa theo khoá. Đổi tab hay đổi shot không làm mất form hay job đang chạy |

Vùng này không gọi `fetch` trực tiếp. Mọi đọc ghi đi qua `ui/src/api/queries.ts` (`useFxCatalog`, `useFxLuts`, `useMedia`, `jobsQuery`, `fxClipUrl`, `fxApplyTransition`, `fxFootage`, `fxUseClip`). Màu lấy từ token.

## Test

- vitest `src/ext/fx`: 4 file, 16 test, đều đạt. Phủ các trường hợp: không chọn shot; tiêu đề có số thẻ; lọc và chip; `iframe` có `sandbox="allow-scripts"` và không có `allow-same-origin`; Áp dụng cho shot gửi đúng shot; lỗi đọc thư viện; danh sách clip và năm thao tác; LUT; điểm neo sai; lỗi render; đi trọn Render → job → Trước/Sau → Dùng trong shot; nút "Mở thư viện chuyển cảnh" đặt `leftTab = "fx"`; phần thuần của `clip-params`.
- `npm test`: `ℹ fail 0`, vitest toàn bộ đạt, `tsc --noEmit` sạch.
- Thử trực tiếp trên 4419: đủ 18 dòng nhóm `4h`, xem `parity-fx.md`.

## Ảnh

Thư mục `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/fx/`, có `1440/` và `2560/`:

- `fx.png`: tab `fx`, shot s1 đang chọn, thẻ đầu đã chọn;
- `fx-noshot.png`: tab `fx` lúc vừa mở.

Nhánh này chưa có timeline, và `syncPick` luôn tự chọn shot đầu khi manifest có shot. Vì vậy `fx-noshot` vẫn hiện thư viện của s1, không phải trạng thái chưa chọn shot. Chữ của trạng thái rỗng đã được kiểm bằng vitest. Muốn có ảnh thật của trạng thái này thì phase 5 cần một dự án có manifest nhưng không có shot.

## Yêu cầu đổi hợp đồng

Không có.

## Ghi chú tài liệu (cho phase 5)

- `docs/transitions-and-effects.md`: bảng ở `:13` đang liệt kê `public/ext-fx.js`, `fx-gallery.js`, `fx-footage.js` và `ext-fx.css`. Cần thay bằng `ui/src/ext/fx/` (các file ở bảng trên).
- Ghi chỗ mới: thư viện chuyển cảnh nằm ở tab "Chuyển cảnh & hiệu ứng" trên rail trái và áp cho shot đang chọn; inspector shot chỉ còn "Chuyển cảnh vào", "Sửa clip của shot" và nút "Mở thư viện chuyển cảnh"; "Sửa clip" chuyển từ tab Chất liệu sang tab này.
