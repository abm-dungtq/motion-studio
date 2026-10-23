# Phase 5: tích hợp, thử liên vùng, fps, ảnh

Bản tích hợp `feat/react-ui` sau khi tám PR vùng (#11–#18) và PR xoá `public/` (#19) đã squash-merge.

## Test

- `npm test` sau khi rebase lên #19: node `ℹ tests 324`, `ℹ pass 323`, `ℹ fail 0`, `ℹ skipped 1`; vitest `39 file, 232 test` đạt; `check-ownership.test.mjs` `pass 6`, `fail 0`. Baseline task 2.0 là `pass 299`.
- `ui/src/integration.test.tsx` (6 test) chạy bộ nạp thật (`import.meta.glob` của `panels/*` và `ext/*`), chỉ giả `fetch`. Nó kiểm:
  - 7 tab trên rail theo đúng thứ tự, có 2 đường kẻ nhóm;
  - không có toast "Extension lỗi";
  - các section `media`, `export` và `director`;
  - thứ tự inspector shot: 0, 30, 40, 50, 60, sau khi bấm khối shot thật trên timeline;
  - hai dòng agent;
  - cả tám khe có nội dung.
- Parity: `node ui/scripts/fill-parity.mjs plans/261023-1018-react-ui-rewrite` in `có 442/442, không 0`. Lệnh không in `THIẾU` hay `TRÙNG`.

## Thử liên vùng trên 4410

Server: `ui/scripts/smoke-server.mjs`. Gốc thử `/tmp/ms-react-root-4410` dựng lại bằng `make-test-root.mjs`. Trình duyệt là Chrome (`playwright-core`), cửa sổ 1440×900. Script thử nằm ở `/tmp/ms-react-walk-4410/walk.mjs`, kết quả thô ở `results.json` cùng thư mục.

Gốc thử được chuẩn bị bằng bốn bước, tất cả chỉ ghi trong `/tmp/ms-react-root-4410`:

- `beat-grid.mjs --min-bpm 120 --write` cho `thuy-mau-demo`, để có lưới phách kéo được;
- đăng ký `pitch/1.mp4` của workspace bằng `POST /api/media/register`, file được chép vào `footage/raw/`;
- tạo dự án `thu-giong-rong` bằng hộp thoại Dự án mới, và bản sao `thu-khong-shot` có `project.json` không có shot nào;
- đổi mtime của `PLAN.md` và `demo/animatic.mp4` trong bản sao, để `/api/gates` trả PASS. Lệnh copy làm mất thứ tự thời gian của các file.

| Mục | Kết quả | Bằng chứng |
|---|---|---|
| 1. Kéo footage từ tab Chất liệu thả vào làn B-roll | có | Dòng `1.mp4` (`[data-media-row]`) thả lên ô B-roll của s4. Một `POST /api/timeline/asset`, `/api/log` từ 41 lên 42 với op `set_shot s4 assets ["assets/footage/1-3.mp4"]`. Ô hiện chip `1-3.mp4`. Toast "Đã thêm 1-3.mp4 vào s4 (đã chép vào assets/footage)" |
| 2. Kéo kết quả "Tìm trong footage" thả vào làn B-roll | có | Gõ "biển", thả thẻ đầu lên ô B-roll của s3. UI gửi `POST /api/timeline/asset {shot:"s3", base:5, path:"/Volumes/2/Edit-Video/footage/raw/ref-anime-samurai-duel.mp4"}`. Server trả 403 "chỉ thêm được file trong dự án, footage/ hoặc shared-assets/ của workspace" và UI hiện đúng câu đó. Chỉ mục B-roll dùng chung chỉ có đường dẫn của workspace thật, nằm ngoài gốc thử; đây là luật của server, bản cũ cũng vậy. Đường thả thành công đi qua cùng `dropOnShot` đã thử ở mục 1 |
| 3. Bấm khối shot: cột phải sang tab Shot, các mục đúng thứ tự | có | Tab trước khi bấm là Đạo diễn, sau khi bấm là Shot. Các mục theo thứ tự `inspector/shot`, `broll-suggest`, `fx`, `lemo`, `receipts`; khối s1 có lớp `sel` |
| 4. Menu chuột phải "Nhờ đạo diễn sửa shot này" | có | Tab Shot mở, tiêu đề "SHOT 2 · 6.5s–12.5s". Focus nằm ở `TEXTAREA` có `aria-label="Chuyển động"` |
| 5. Kéo mốc phách: dòng nhắc duyệt lại, chip cổng | có | Kéo vạch phách +12 px. UI gửi `POST /api/timing/beat {beat0: 0.19}`, rồi hiện toast "Đã dời lưới phách, beat0 0.190s; đang dựng lại TIMING…" và "Đã dựng lại TIMING. Animatic cần duyệt lại". Inspector hiện "Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất". `/api/gates` được gọi lại 589 ms sau khi thả. Chip "Cần duyệt lại animatic" giữ nguyên, vì cổng của bản sao đã ở trạng thái đó từ trước |
| 6. Seed thẻ animatic: chấm báo, chip mở tab Đạo diễn | có | Chạy `seed-gate-cards.mjs … animatic`. Tab Đạo diễn có chấm `aria-label="Có thẻ đang chờ bạn"`. Chip "Cần duyệt lại animatic" chuyển cột phải từ Shot sang Đạo diễn; thẻ "Duyệt animatic?" hiện |
| 7. "Giao việc cho AI" ở trạng thái rỗng của tab Lời & giọng | có | `viet-pro-intro` sau khi nhập có 8 câu, nên không có trạng thái rỗng. Thử trên `thu-giong-rong`, dự án tạo bằng hộp thoại Dự án mới và không có câu thoại: tab hiện "Chưa có câu thoại…". Thu gọn cột phải rồi bấm nút: cột phải mở lại ở tab Đạo diễn |
| 8. Chọn shot ở tab Anime: timeline chọn shot và tua | có | Bấm thẻ s3 trên shot board: khối s3 có lớp `sel`, đồng hồ "0:12.5 / 0:20.0" |
| 9. Tab `fx` theo shot chọn trên timeline; nút trong inspector mở tab `fx` | có | Bấm s3 trên timeline: tab `fx` hiện "Shot s3 đang dùng: (không)". Áp `zoom-through` gửi `POST /api/fx/apply-transition {shot:"s3", id:"zoom-through", base:5}`; log tăng một bản; dòng đổi thành "Shot s3 đang dùng: zoom-through". Từ tab Chất liệu, bấm "Mở thư viện chuyển cảnh" trong inspector: tab trái thành `fx` |
| 10. Xuất bản → "Xuất bộ lớp dựng" | có | Toast "Đang xuất bộ lớp dựng: render rồi cắt từng shot". Hộp thoại "Cổng & tệp đã xuất…" có thẻ "Xuất video · bộ lớp dựng · đang chạy", log hiện "Hình: render index.html…". Job `export` exit 0 sau 45 s, kết quả `renders/thuy-mau-demo-20261023-135540-bundle` (4 shot, 4 file tiếng, 3 phụ đề, fcpxml/xml/otio). Tên này hiện trong hộp thoại |
| 11. Xuất bản → "Xuất video" | có | Lần đầu job exit 5. Hộp thoại hiện "Thiếu cổng: animatic … older than PLAN.md…", giống bản cũ. Sau khi cổng PASS, job exit 0 sau 33 s, ra `renders/thuy-mau-demo-20261023-135737-final.mp4` (20 MB) trong gốc thử, và file này hiện trong hộp thoại |
| 12. `?tab=ai`, `?tab=output`, `?tab=media` | có | `?tab=ai` mở cột phải ở tab Đạo diễn. `?tab=output` mở hộp thoại "Xuất bản". `?tab=media` chọn tab trái `media` |
| 13. Alt+1…7 và các phím trong bảng README; không phím nào chạy khi mở Dự án mới | có | Alt+1…7 lần lượt chọn `media, styles-code, anime, fx, voice, music, library`. Home cho 0:00.0, Shift+→ cho 0:01.0, End cho 0:20.0. L phát (nút "Dừng"), K dừng, J lùi một giây, Space phát rồi dừng. N đổi Hít `true→false`, R đổi `ripple→roll`. `=` và `-` đổi độ rộng track 1440↔1762.5 px, Shift+Z vừa khung. S cắt s1 thành 5 shot và mở menu "Nhờ đạo diễn dựng shot mới" như bản cũ. Cmd+Z còn 4 shot, Cmd+Shift+Z lại 5, Cmd+Z còn 4 (log `undo`, `redo`, `undo`). Delete trên SFX của đạo diễn hiện "SFX này do đạo diễn đặt; …". Shift+kéo câu vo-01 gửi một `POST /api/patch [move_line vo-01]`. Khi hộp thoại Dự án mới mở, các phím Space, End, N, R, Alt+3, Shift+Z, S không đổi đồng hồ, Hít, chế độ hay tab. ←/→ một khung (0,033 s) nhỏ hơn độ phân giải 0,1 s của đồng hồ, nên phần này dựa vào test `keys.test.ts` |
| 14. Thu gọn, mở lại, kéo đổi cỡ; tải lại giữ cỡ | có | Panel trái 305 px, thu gọn còn 0, bấm rail thì về 305. Cột phải 333 px, thu gọn còn 0, "Mở cột phải" thì về 333. Kéo hai tay nắm: trái thành 425, phải thành 433. Sau khi tải lại: 425 và 433. Khoá `localStorage` là `react-resizable-panels:ms-layout` |

### Các mục còn lại từ báo cáo vùng

- **INSP-17 (Gợi ý B-roll), INSP-18 (biên nhận), INSP-19 (phong cách code):** bấm s2 trên timeline thật, rồi đọc tab Shot:
  - "Gợi ý B-roll" có dòng "Tìm theo: … · shot dài 6.0 s" và thẻ gợi ý;
  - "Biên nhận của file trong shot" có dòng `đạt · media-check · assets/footage/1-2.mp4`. Biên nhận này tạo bằng `POST /api/media/check`, chạy cục bộ, không tốn lượt;
  - "Phong cách code" có "Dự án chưa áp phong cách code nào." và danh sách để áp. Ảnh ở `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/final/extra/inspector-lemo-s2.png`.
- **Khối beat, word, line, music, event:** bấm trên timeline thật (word sau khi phóng to, vì chấm từ chỉ hiện từ 120 px/s). Inspector mở đúng mục cho từng khối: "CÂU vo-01", "NHẠC · bgm.mp3", "SFX sfx-brush-1", "MỐC TỪ · "Lớp"", "MỐC PHÁCH · bgm.mp3.beats.json".
- **fx-noshot:** thử trên `thu-khong-shot`, dự án có `project.json` mà không có shot nào. Tab `fx` hiện "Chọn một shot trên timeline để áp chuyển cảnh". Ảnh ở `…/final/extra/fx-noshot.png`.
- **Tên file dài:** đo bằng mắt và bằng script ở 1440 px, với 7 tab của `thuy-mau-demo` và `abm-intro`, cộng cột phải. Tìm ra một lỗi: hàng "Phân tích footage" gồm ô phạm vi, "Phân tích offline" và "Chú thích bằng agent" không xuống dòng, nên panel trái cuộn ngang 170 px. Đã sửa bằng `flex-wrap` ở `ui/src/ext/broll/Analyse.tsx`. Đo lại thì không panel nào còn tràn ngang.
- **MusicTab:** đã bỏ lớp `role="group"`; `aria-label` "Âm lượng <file>" nay gắn thẳng lên thumb của Slider (test đổi theo).
- **Toast khi job Anime xong lúc tab đóng:** đã chuyển việc theo dõi job sang hàm `badge` của tab Anime. Rail luôn render hàm này, nên toast hiện ngay như bản cũ. Hàm luôn trả 0, nên không có số nào hiện trên rail. Cách này không đổi hợp đồng và không đụng vỏ. Có thêm một test: job xong khi tab đóng thì có đúng một toast.
- **"Thêm" bị tắt ở dự án chỉ xem:** giữ như phase file (khác bản cũ, đã ghi ở báo cáo media).

Server 4410 đã dừng sau khi thử.
