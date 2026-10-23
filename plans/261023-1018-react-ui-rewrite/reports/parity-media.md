# Parity vùng media (nhóm 4b)

Thử ngày 2026-10-23 trên `http://127.0.0.1:4413` (server `ui/scripts/smoke-server.mjs`, PID 52809 rồi PID 94018 cho TAB-media-10, cả hai đã dừng; gốc thử `/tmp/ms-react-root-4413`), bản build của nhánh `feat/react-ui-media`, Chrome qua playwright-core. Trạng thái lỗi tạo bằng `page.route` (không request lỗi thật nào tới server). Phân tích offline và Chú thích bằng agent không bấm thật, như cột "Cũ": lượt chạy ghi chỉ mục vào `~/.cache/motion-studio/broll` và lượt vision tốn quota; hai luồng đó được thử bằng test component với `brollIndex` bị mock.

Chọn shot trên UI mới cần timeline (vùng 4a), nên mục "Gợi ý B-roll" (INSP-17, API-12, API-17, STATE-14) được thử bằng test component dùng đúng hình dạng phản hồi thật lấy từ 4413 (`GET /api/broll/suggest?name=thuy-mau-demo&shot=s1` trả `query` "lop thuy mau opus video tung net tren giay", `duration` 6.5, 5 mục có `use`, `need_stretch`). Phase 5 cần bấm lại trên UI khi timeline đã ghép.

| ID | Mới | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| INSP-17 | có | cột phải, tab Shot: `ui/src/ext/broll/Suggest.tsx` (inspector `broll-suggest`, kinds shot, order 30) | Tiêu đề "Gợi ý B-roll", dòng "Tìm theo: … · shot dài 5.5 s", ô "Nhờ đạo diễn đặt clip vào cảnh" (bật sẵn, nhớ giữa các shot), thẻ có "dùng 0:10.0–0:15.5" hoặc "ngắn hơn shot: cần lặp/chậm", nút "Đặt vào shot" (tắt ở dự án chỉ xem). Gọi một lần cho mỗi (dự án, shot, phiên bản). Thử bằng `Suggest.test.tsx`; bấm trên UI chờ timeline 4a |
| TAB-media-01 | có | panel trái, tab Chất liệu, mục "Footage đã thêm" | Sau khi thêm 1.mp4: `1.mp4 · Video · 0:03 · 1920×1080 · draggable=true · title "Kéo vào timeline"` |
| TAB-media-02 | có | như trên | dragstart: types `["text/x-ms-media","text/plain"]`, media `{"rel":"footage/raw/1.mp4","kind":"video","path":"/private/tmp/ms-react-root-4413/footage/raw/1.mp4"}`, plain `footage/raw/1.mp4` (qua `setMediaDrag`, effectAllowed copy) |
| TAB-media-03 | có | mục "Chọn file trên máy" | Lần đầu ô đường dẫn = `/Users/tqd/Movies`, 2 mục (ABM, TV) |
| TAB-media-04 | có | như trên | Trong pitch bấm Lên → `/Volumes/2/Edit-Video/thuy-mau-demo`; ở `/` nút Lên bật (server trả parent) |
| TAB-media-05 | có | như trên | Thư mục `["assets›","build›","capture›","compositions›"]`; trong pitch: `1.mp4 / Video · 0.7 MB`, `1.png / Ảnh · 0.1 MB`, `2.mp4 / Video · 0.5 MB`, `2.png / Ảnh · 0.1 MB`, mỗi file một nút Thêm |
| TAB-media-06 | có | như trên | POST /api/media/register 200, nút thành "Đã thêm" (tắt), toast "Đã thêm 1.mp4, đã chép vào footage/raw", danh sách footage tải lại |
| TAB-media-07 | có | như trên | Thêm lại → toast "1.mp4 đã có trong danh sách" |
| TAB-media-08 | có | như trên | register chặn trả 500 → toast lỗi "lỗi thử đăng ký", nút về "Thêm" và bật |
| TAB-media-09 | có | mục "File trong assets/" | 16 ô, bỏ .json; 5 ô đầu `div assets/bgm/bgm.mp3`, `div assets/fonts/BeVietnamPro-Bold.ttf`, `…-Medium.ttf`, `…-Regular.ttf`, `…-SemiBold.ttf`; ảnh là `img`, video là `video #t=0.1` |
| TAB-media-10 | có | như trên | Vào pitch, đổi sang tab Lời & giọng (tab trái gỡ hẳn), quay lại: vẫn ở `/Volumes/2/Edit-Video/thuy-mau-demo/pitch` (thư mục nhớ trong `browseMemo` suốt đời trang). Thử lần hai sau khi ghép `origin/feat/react-ui` có tab voice, server PID 94018, đã dừng |
| TAB-media-11 | có | panel trái, tab Chất liệu | Thứ tự h3: "Footage đã thêm", "Chọn file trên máy", "File trong assets/", "Tìm trong footage". "Sửa clip" chuyển sang tab fx (vùng 4h) theo phạm vi của phase, không còn ở tab này |
| TAB-media-12 | có | mục "Tìm trong footage" | Gõ "biển" → một GET `/api/broll/search?q=bi%E1%BB%83n&limit=40` khoảng 360 ms sau phím đầu (debounce 250 ms sau phím cuối), 9 kết quả. Hàm `params()` của hợp đồng bỏ `kind=` rỗng; server đọc `c.q("kind") \|\| null` nên giống nhau (`routes/broll.mjs:60`). Cỡ cảnh: `["mọi cỡ cảnh","toàn","trung","cận","đặc tả","flycam","khác"]`, đổi cỡ thì tìm ngay |
| TAB-media-13 | có | như trên | Thẻ đầu: có ảnh, `0:00.0–0:03.0 · 3.0 s · trung`, chú thích "Nút bấm màu tím có chữ 'Tạo video mới' …", tags, `2.mp4`, draggable; dragstart `{ rel: null, kind: "video", path, sha256, start: 0, end: 3 }` |
| TAB-media-14 | có | như trên | Chưa gõ: lưới hiện 39 thẻ (cũ ghi 33; chỉ mục dùng chung `~/.cache/motion-studio/broll` đã có thêm clip từ đó, giới hạn vẫn 40) |
| TAB-media-15 | có | chi tiết "Phân tích footage" dưới lưới | Mở sẵn; phạm vi `["Cả workspace","Dự án đang mở"]`; kế hoạch `6 file video, 0 clip đã phân tích offline, 6 file chưa phân tích.` / `Chạy "Phân tích offline" trước (không tốn lượt) để biết chính xác số lượt đọc ảnh.` |
| TAB-media-16 | có | như trên | "Chú thích bằng agent" tắt, "Phân tích offline" bật. Test: đủ bốn nhánh của paintPlan (vision tắt, còn file chưa phân tích, hết shot chờ, số lượt chính xác → "Chú thích bằng agent (20 lượt)") |
| TAB-media-17 | có | như trên | Không bấm thật (lý do ở đầu file). `Analyse.test.tsx`: bấm gửi `brollIndex({ scope: "workspace", vision: false, name })`, hộp log "Đang chạy" + 6 dòng cuối bỏ `RESULT`, hai nút tắt khi chạy, theo `/api/broll/job` mỗi 1,5 s (`refetchInterval`), xong thì tải lại kế hoạch và kết quả tìm |
| API-12 | có | `brollApply` của `ui/src/api/queries.ts`, gọi từ `Suggest.tsx` | Body `{ name, shot, base, sha256, start: use.start, end: use.end }`, timeout 11 phút; toast cũ; nhờ đạo diễn qua `actions.direct` với đúng câu cũ. Thử bằng test (mock) |
| API-13 | có | `brollIndex`, gọi từ `Analyse.tsx` | Như TAB-media-17; `max_calls` = min(calls, max_calls_per_run) khi chú thích |
| API-14 | có | `brollJobQuery`, `Analyse.tsx` | Gọi lúc mở tab (job null trên 4413) và mỗi 1,5 s khi job đang chạy; lỗi giữ trạng thái cũ |
| API-15 | có | `brollPlanQuery`, `Analyse.tsx` | Như TAB-media-15; phạm vi "Dự án đang mở" gửi `name=…&scope=project` |
| API-16 | có | `brollSearchQuery`, `Search.tsx` | Như TAB-media-12 |
| API-17 | có | `brollSuggestQuery`, `Suggest.tsx` | GET `/api/broll/suggest?name=demo&shot=s2` (test); trên 4413 trả đúng hình dạng (5 mục) |
| API-26 | có | `useFiles(name, "assets")`, `Assets.tsx` | Như TAB-media-09 |
| API-45 | có | `useMedia(name)`, `Registered.tsx` | Như TAB-media-01; rỗng thì "Chưa có footage. Chọn file bên dưới." |
| API-46 | có | `mediaBrowseQuery` qua `queryClient.fetchQuery`, `Browser.tsx` | Như TAB-media-03..05, từng cấp một như cũ |
| API-47 | có | `mediaRegister`, `Browser.tsx` | Như TAB-media-06..08 |
| STATE-08 | có | mục "Tìm trong footage" | search chặn 500 → hộp đỏ "lỗi thử tìm footage" |
| STATE-09 | có | chi tiết "Phân tích footage" | plan chặn 500 → hộp đỏ "lỗi thử kế hoạch"; hai nút tắt (true, true) |
| STATE-14 | có | inspector "Gợi ý B-roll" | suggest trả 500 → hộp đỏ "lỗi thử gợi ý" (test); thêm hai chữ rỗng: `Không có footage khớp "abc". Phân tích thêm footage ở tab Footage.` và "Shot chưa có tên hay lời để tìm." |
| STATE-35 | có | mục "Footage đã thêm" | Trước khi thêm: "Chưa có footage. Chọn file bên dưới." |
| STATE-36 | có | mục "Chọn file trên máy" | `/Volumes/2/Edit-Video/thuy-mau-demo/compositions` → "Thư mục này không có thư mục con hay file media. Bấm Lên hoặc gõ đường dẫn khác." |
| STATE-37 | có | như trên | `/khong-co-dau` → "Không mở được: không có đường dẫn này. Gõ đường dẫn khác hoặc bấm Lên."; `/etc` → "Không mở được: chỉ duyệt được trong thư mục nhà và /Volumes. Gõ đường dẫn khác hoặc bấm Lên." |

## Khác bản cũ

- Dự án chỉ xem: nút "Thêm" của trình duyệt file bị tắt, theo phase 4b (bước 4b.1.5 và test bắt buộc). Bản cũ (`public/panels.js:155-157`) không tắt nút này và server vẫn nhận `/api/media/register` cho dự án chỉ xem. Nếu muốn giữ đúng bản cũ thì bỏ `!editable` ở `Browser.tsx`.
- Khung nội dung tab có `contain: inline-size`: vùng cuộn của panel trái (Radix ScrollArea, shell) đo nội dung như bảng, tên file dài làm panel tràn ngang. Nên sửa gốc ở shell trong phase 5 (xem báo cáo phase).
