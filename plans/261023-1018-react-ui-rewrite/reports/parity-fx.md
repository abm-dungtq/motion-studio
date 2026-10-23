# Parity vùng fx (nhóm 4h)

Thử ngày 2026-10-23 trên `http://127.0.0.1:4419/?name=thuy-mau-demo&tab=fx`, server `ui/scripts/smoke-server.mjs` (PID 51742, đã dừng), gốc thử `/tmp/ms-react-root-4419`. Trạng thái lỗi được tạo bằng `page.route` trong trình duyệt, không request nào lỗi thật tới server.

Dữ liệu thử: gốc thử mới không có video, nên `footage/raw/1.mp4` và `footage/raw/3.mp4` (clip testsrc 4 s do ffmpeg sinh) được đăng ký qua `POST /api/media/register`, rồi thả `3.mp4` vào shot s3 và s1 qua `POST /api/timeline/asset`. Mọi file sinh ra (gồm `footage/cut/1-trim-b9b7a682.mp4`) nằm trong gốc thử.

Nhánh này chưa có timeline của vùng timeline, nên không bấm được khối shot. Shot đang chọn là s1, shot đầu tiên mà `syncPick` (`ui/src/api/events.ts`) tự chọn khi nạp manifest. Các dòng UI cũ thử trên s3 thì ở đây thử trên s1; riêng trường hợp s3 được kiểm bằng vitest.

| ID | Đạt | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| INSP-20 | có | panel trái, tab Chuyển cảnh & hiệu ứng (`fx`), mục 1; cột phải, tab Shot giữ nút "Mở thư viện chuyển cảnh" | "Thư viện chuyển cảnh (54)", "Shot s1 đang dùng: (không)"; chip ["Tất cả","Provider (37)","Studio (4)","HyperFrames (30)"]; thẻ đầu "Zoom-Throughzoom-throughProviderHyperFrames". Nút ở inspector mở lại panel trái đã thu gọn, đặt `?tab=fx` |
| INSP-21 | có | tab `fx`, mục 1 | Tìm "zoom" → 4 thẻ; thêm chip Studio → 0; chuỗi không khớp → "Không có chuyển cảnh nào khớp"; chip Studio → 4 thẻ; chọn "Khung va chạm anime" → "native · Dồn dập · 0.1s", mô tả, iframe `sandbox="allow-scripts"`, `title="Xem thử impact-frame"`, `loading="lazy"`, không có `allow-same-origin` |
| INSP-22 | có | tab `fx`, mục 1 | Áp dụng cho shot → POST /api/fx/apply-transition {"name":"thuy-mau-demo","shot":"s1","id":"impact-frame","base":6} 200; toast "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)"; sau đó "Shot s1 đang dùng: impact-frame" |
| INSP-23 | có | cột phải, tab Shot (inspector), mục "Sửa clip của shot" | Shot s1 có `assets/footage/3-2.mp4` → mục "Sửa clip của shot", chọn clip ["3-2.mp4", "1-trim-b9b7a682.mp4"] (clip thứ hai do Dùng trong shot thêm vào). Shot không có video chỉ hiện nút mở tab `fx` |
| TAB-media-18 | có | tab `fx`, mục 2 "Sửa clip" | "Sửa clip", "Cắt, đổi tốc độ, đứng hình, chỉnh màu, cắt khung dọc. Render trước bằng ffmpeg, bản gốc giữ nguyên." Mục này không còn ở tab media |
| TAB-media-19 | có | tab `fx`, mục 2 | Thao tác ["Cắt đoạn","Đổi tốc độ","Đứng hình","Chỉnh màu","Cắt khung"]; ô theo thao tác trim ["Từ giây","Đến giây"], speed ["Điểm neo t:tốc độ (0,25–4), mỗi điểm giữ tới điểm sau", ô "Giữ tiếng"], freeze ["Đứng hình tại giây","Giữ bao lâu (giây)"], grade ["Màu","Cường độ"], reframe ["Khung đích","Tâm khung t:x:y (x, y 0–1), di chuyển thẳng giữa các điểm"], đúng như UI cũ |
| TAB-media-20 | có | tab `fx`, mục 2 | Điểm neo "abc" → toast lỗi "\"abc\" phải có dạng t:rate", không gọi server; Cắt 0–1 s → POST /api/fx/footage {"src":"footage/raw/1.mp4","op":"trim","params":{"in":0,"out":1}} 200, nút "Đang render…", GET /api/jobs 1 lần; kết quả "Trước / Sau", "footage/cut/1-trim-b9b7a682.mp4 · 1.00s", "Biên nhận mvkk3i6j-1c9fe9: kiểm đạt", hai video `/api/fx/clip?name=thuy-mau-demo&src=footage%2Fraw%2F1.mp4` và `…src=footage%2Fcut%2F1-trim-b9b7a682.mp4` |
| TAB-media-21 | có | tab `fx`, mục 2, phần kết quả | Chọn shot ["s1 · Lớp thuỷ màu mới","s2 · Chữ tiếng Việt rõ nét","s3 · Kéo dài cảnh, tranh co giãn theo","s4 · opus-video"], thay ["(thêm vào, không thay)","thay assets/footage/3-2.mp4"]; Dùng trong shot → POST /api/fx/use-clip {"shot":"s1","clip":"footage/cut/1-trim-b9b7a682.mp4","replace":null,"base":7} 200, toast "Đang chờ phiên Claude Code mở nhận việc (studio_request_next)" |
| API-27 | có | `fxApplyTransition` trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/fx/Gallery.tsx` | Xem INSP-22 |
| API-28 | có | `useFxCatalog` trong `ui/src/api/queries.ts`, gọi từ `Gallery.tsx` | Xem INSP-20 (54 thẻ, đếm theo nguồn) |
| API-29 | có | `fxClipUrl` trong `ui/src/api/queries.ts`, dùng cho hai `video` Trước/Sau trong `ClipEditor.tsx` | Xem TAB-media-20 |
| API-30 | có | `fxFootage` trong `ui/src/api/queries.ts`, gọi từ `ClipEditor.tsx`; theo job bằng `useJob.ts` (cache `/api/jobs`, SSE, hỏi lại mỗi 1 s khi job chạy) | Xem TAB-media-20 |
| API-31 | có | `useFxLuts` trong `ui/src/api/queries.ts`, gọi khi chọn Chỉnh màu | GET /api/fx/luts khi chọn Chỉnh màu; ô Màu có nhóm LUT (4) và Preset (5: Ấm, Lạnh, Đậm, Đen trắng, Phai) |
| API-32 | có | `fxUseClip` trong `ui/src/api/queries.ts`, gọi từ `ClipEditor.tsx` | Xem TAB-media-21 |
| STATE-21 | có | tab `fx`, mục 1 | Chặn /api/fx/catalog trả 500 {"error":"lỗi thử catalog"} → "Không đọc được thư viện: lỗi thử catalog" |
| STATE-22 | có | tab `fx`, mục 2, phần kết quả | Job giả có RESULT với warnings và receipt pass false → "cảnh báo thử: khung lệch"; "Biên nhận rc-thu: kiểm không đạt" |
| STATE-23 | có | tab `fx`, mục 2 | Chặn /api/fx/footage trả 500 {"error":"lỗi thử render"} → "lỗi thử render" |
| STATE-24 | có | tab `fx`, mục 2 | Chặn /api/media trả [] → "Chưa có video đã đăng ký. Thêm footage ở trên trước." |
| STATE-25 | có | tab `fx`, mục 2 | Chặn /api/media trả 500 {"error":"lỗi thử media"} → mục Sửa clip hiện "lỗi thử media" |
