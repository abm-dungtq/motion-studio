# Parity vùng anime (nhóm 4f)

Thử trực tiếp ngày 2026-10-23 trên `http://127.0.0.1:4417` (`ui/scripts/smoke-server.mjs`; hai lượt trên gốc thử `/tmp/ms-react-root-4417` dựng lại sạch: PID 5447 trên nhánh vùng, PID 12687 sau khi merge `origin/feat/react-ui`; cả hai đã dừng, cả hai lượt đạt đủ). Trình duyệt: Chrome qua playwright-core, script `/tmp/ms-react-anime-walk/walk.mjs`. Trạng thái lỗi tạo bằng `page.route`; Sinh biến thể và Sinh sheet không gọi agent sinh ảnh (variant chặn bằng `page.route`, sheet bấm Huỷ ở hộp xác nhận). Không có lỗi trang (`pageerror` rỗng).

| ID | Đạt | Chỗ trong UI mới | Ghi chú |
| --- | --- | --- | --- |
| TAB-anime-01 | có | panel trái, tab Anime (`ui/src/ext/anime`) | tab con ["Shot board","Nhân vật","Hoạt hình"] |
| TAB-anime-02 | có | panel trái, tab Anime (`ui/src/ext/anime`) | bảng shot mở, chữ rỗng đúng, tag note 1 |
| TAB-anime-03 | có | panel trái, tab Anime (`ui/src/ext/anime`) | cột ["Thiếu plate 4","Có plate 0","Có biến thể 0","Đã có track 0"], nút Tải lại Gốc thử 4417 có 4 shot (bản cũ trên 4411 ghi 5); bố cục cột và chữ giống. |
| TAB-anime-04 | có | panel trái, tab Anime (`ui/src/ext/anime`) | thẻ {"title":"chưa có ảnh nào tên <shot>-*.png trong assets/plates/","img":"không có ảnh","name":"s1 · Lớp thuỷ màu mới","meta":"0 plate · 0 biến thể"} |
| TAB-anime-05 | có | panel trái, tab Anime (`ui/src/ext/anime`) | bấm s2 → đồng hồ "0:06.5 / 0:20.0"; cột phải: "" Bấm thẻ gọi actions.pick("shot","s2") (vitest) rồi tua tới đầu shot. |
| TAB-anime-06 | có | panel trái, tab Anime (`ui/src/ext/anime`) | chi tiết shot đủ chữ |
| TAB-anime-07 | có | panel trái, tab Anime (`ui/src/ext/anime`) | ô ["Ảnh gốc","Kiểu","Thay đổi (tiếng Anh cho agent)","Tên file","sim (độ giống màu nền)","blend (mép mềm)"], nút Sinh biến thể tắt |
| TAB-anime-08 | có | panel trái, tab Anime (`ui/src/ext/anime`) | variant chặn bằng page.route: thiếu thay đổi → "Ghi thay đổi cần làm"; confirm "Sinh một ảnh bằng agent sinh ảnh (tốn 1 ảnh quota) cho s2 → s2-v1.png?"; POST variant {shot:s2, base:assets/plates/s2-a.png}; theo job; toast "Đã có s2-v1.png (1024px, nền #0047FF)" Không sinh ảnh thật: board, POST variant và GET job bị chặn bằng page.route. |
| TAB-anime-09 | có | panel trái, tab Anime (`ui/src/ext/anime`) | form "Thêm nhân vật" ô ["Id (chữ thường, số, -)","Tên","Màu nền tách (không dùng xanh lá nếu nhân vật có màu xanh lá)","Bảng màu (#RRGGBB, cách nhau bằng dấu phẩy)","Sheet (đường trong dự án, có thể để trống)","Ghi chú, mô tả"] |
| TAB-anime-10 | có | panel trái, tab Anime (`ui/src/ext/anime`) | POST /api/anime/chars {"char":{"id":"thu-nv","name":"Nhân vật thử","key_color":"#0047FF","palette":["#112233","#445566"],"notes":"","sheet":null},"status":200}, toast "Đã lưu Nhân vật thử" |
| TAB-anime-11 | có | panel trái, tab Anime (`ui/src/ext/anime`) | thẻ {"img":"chưa có sheet","row":"Nhân vật thửthu-nv","swatches":3,"details":"Sinh sheet 4 góc","btns":["Sinh sheet","Sửa","Bỏ"]} |
| TAB-anime-12 | có | panel trái, tab Anime (`ui/src/ext/anime`) | trống → toast lỗi "Ghi mô tả nhân vật trước (tiếng Anh cho agent)"; confirm "Sinh sheet 4 góc cho Nhân vật thử (tốn 1 ảnh quota)?"; Huỷ → không POST (0) Không bấm Đồng ý (tốn quota). |
| TAB-anime-13 | có | panel trái, tab Anime (`ui/src/ext/anime`) | Sửa → "Sửa thu-nv"; Bỏ → confirm "Bỏ Nhân vật thử khỏi thư viện? File sheet vẫn giữ nguyên." → POST {remove:thu-nv} 200 |
| TAB-anime-14 | có | panel trái, tab Anime (`ui/src/ext/anime`) | POST /api/anime/enable 200, toast "Đã chép 4 file vào assets/anim/" |
| TAB-anime-15 | có | panel trái, tab Anime (`ui/src/ext/anime`) | nút ["Lưu và build","Build lại","Bỏ bản nháp"]; "Chưa có stack. Mỗi stack là một phần tử id=… trong index.html." |
| TAB-anime-16 | có | panel trái, tab Anime (`ui/src/ext/anime`) | trống → [lỗi] "Cần id và shot"; s2-chu/s2 → ["s2-chu (s2)"] |
| TAB-anime-17 | có | panel trái, tab Anime (`ui/src/ext/anime`) | track ["1. lipsync: voice (id thẻ audio)/open/half/closed/idle/from/to","2. blink: pose/at (giây hoặc s4+0.5, cách nhau bằng dấu phẩy)/frames","3. wind: frames (tư thế, cách nhau bằng dấu phẩy)/fps/phase","4. keys: "] |
| TAB-anime-18 | có | panel trái, tab Anime (`ui/src/ext/anime`) | ô shot, nút + lipsync/+ blink/+ wind/+ keys, "Offsets theo tư thế", ô JSON khác ({}), nút "Xoá stack" |
| TAB-anime-19 | có | panel trái, tab Anime (`ui/src/ext/anime`) | impact ["at/frames/mode"] |
| TAB-anime-20 | có | panel trái, tab Anime (`ui/src/ext/anime`) | JSON hỏng → .bad (true), toast "Ô JSON chưa hợp lệ: Expected property name or '}' in JSON at position 2 (line 1 column 3)"; JSON hợp lệ → POST manifest {base_sha:93f3711b5ab611777c8bbed220921575ce4c1b59c6a705329d183f183ade0114, confirm:false} 400, toast "manifest chưa hợp lệ: stacks.s2-chu.tracks[0]: lipsync cần voice (id thẻ <audio>); stacks.…" |
| TAB-anime-21 | có | panel trái, tab Anime (`ui/src/ext/anime`) | POST /api/anime/manifest {confirm:false} 200, toast "Đã lưu (sao lưu .opus/anim-backups/2026-10-23T06-02-10-049Z.json)" |
| TAB-anime-22 | có | panel trái, tab Anime (`ui/src/ext/anime`) | khối build "Build lỗi (exit 1)anim build: stack s2-chu: no element id=\"s2-chu\" in index.html"; GET /api/anime/job 3 lần (1,2 s một lần), trước đó 2 |
| TAB-anime-23 | có | panel trái, tab Anime (`ui/src/ext/anime`) | POST /api/anime/rebuild 200, khối build "Build lỗi (exit 1)" |
| TAB-anime-24 | có | panel trái, tab Anime (`ui/src/ext/anime`) | Bỏ bản nháp → GET /api/anime/manifest, nháp (1 track chưa lưu) bỏ, còn bản trên đĩa (0 track) |
| TAB-anime-25 | có | panel trái, tab Anime (`ui/src/ext/anime`) | manifest chặn trả final → "Dự án đã có bản final (renders/thu-final.mp4). Lưu sẽ hỏi xác nhận; bản cũ luôn được sao lưu."; POST chặn trả 428 → hộp xác nhận "…Vẫn lưu? Bản cũ được sao lưu vào .opus/anim-backups/.", Huỷ không gửi lại |
| TAB-anime-26 | có | panel trái, tab Anime (`ui/src/ext/anime`) | đổi sang perf-60 → tab con "Hoạt hình", nháp bị bỏ (track 0) |
| API-05 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | GET /api/anime/board, /chars, /manifest khi mở tab |
| API-06 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-10: POST /api/anime/chars 200, toast "Đã lưu Nhân vật thử" |
| API-07 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-14 |
| API-08 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-22 |
| API-09 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-20 và TAB-anime-21 |
| API-10 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-23 |
| API-11 | có | hook `useAnime`/`useAnimeJob` và hàm ghi trong `ui/src/api/queries.ts`, gọi từ `ui/src/ext/anime` | xem TAB-anime-08: POST /api/anime/variant qua `animeVariant`, theo job, toast kết quả; chặn bằng page.route, không sinh ảnh. |
| STATE-01 | có | panel trái, tab Anime (`ui/src/ext/anime`) | "Không tải được shot board: lỗi thử board" |
| STATE-02 | có | panel trái, tab Anime (`ui/src/ext/anime`) | chữ rỗng đúng, tag "ghi chú thử" |
| STATE-06 | có | panel trái, tab Anime (`ui/src/ext/anime`) | "Không tải được thư viện nhân vật: lỗi thử chars" |
| STATE-07 | có | panel trái, tab Anime (`ui/src/ext/anime`) | chữ rỗng đúng |
| STATE-10 | có | panel trái, tab Anime (`ui/src/ext/anime`) | "Không tải được manifest: lỗi thử manifest" |
| STATE-11 | có | panel trái, tab Anime (`ui/src/ext/anime`) | chữ đúng + nút "Bật hệ lật ảnh" |
| STATE-12 | có | panel trái, tab Anime (`ui/src/ext/anime`) | không có dự án: "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng." UI mới hiện chữ này cả khi mở trang chưa có dự án (bản cũ để trống ở lần mở đầu). |
| STATE-13 | có | panel trái, tab Anime (`ui/src/ext/anime`) | "Lỗi giao diện: Cannot read properties of null (reading 'map')" |
