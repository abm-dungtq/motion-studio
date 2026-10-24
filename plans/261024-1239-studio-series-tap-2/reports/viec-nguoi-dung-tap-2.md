# Việc người dùng làm trong Studio cho Sóng Lag tập 2

Ngày lập: 2026-10-24 (Asia/Saigon). Studio 4317 đã chạy bản mới (Motion Studio `e905cc4`, plugin opus-video 2.5.0 `4f9b88e`, `STUDIO_API` 4). Cập nhật sau duyệt cuối: plugin đã có style `pixel-arcade-hd`, BRIEF và PLAN của a-02 (cùng mẫu tập) đã có hướng `A7` như tập 1. Trong file này, `C` là `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen` và `S` là `C/series/song-lag`.

Thứ tự dưới đây là thứ tự nên làm. Mỗi mục ghi: bấm ở đâu, Studio làm gì, có tốn lượt không, khi nào coi là xong. Các mục có chữ **Chờ bạn quyết** là việc đã phát sinh trong lúc dựng công cụ mà người thực hiện không được quyết thay.

1. **Mở Studio.** Vào `http://127.0.0.1:4317` và chọn `a-02` ("Tài Khoản Facebook Đầu Tiên"). Các dự án cũ ở `/Volumes/2/Edit-Video` vẫn nằm cùng danh sách. `a-01` và `a-02` là symlink trong Edit-Video trỏ tới `C/video/`, nên dữ liệu vẫn nằm ở kho Hoạt hình. `a-01` hiện ở dạng "Nhập dự án": người thực hiện không nhập nó, vì nhập sẽ ghi `project.json` vào a-01. Bạn chỉ bấm "Nhập dự án" nếu muốn xem a-01 trên timeline. Hướng thị giác không cần chọn lại: BRIEF a-02 đã ghi `direction: A7` và `direction_swaps: none` giống tập 1, PLAN có dòng `- Hướng: A7`; series khóa hình theo `S/style/direction.json`, A7 chỉ quy định cách nối cảnh. Tập mới tạo từ mẫu tập cũng có sẵn hai dòng này. Nếu muốn đổi hướng cho một tập thì nhờ đạo diễn gợi ý hướng rồi bấm thẻ chọn. Tập 3 trở đi tạo bằng cách nhờ đạo diễn của tập trước "tạo tập mới" (tool `series_episode_new`). Tập mới sẽ tự nằm cạnh `a-02` trong `C/video/` và tự có symlink trong root. Nút "Dự án mới" trên thanh trên cùng chỉ tạo dự án thường của Edit-Video. Không tốn lượt. Xong khi tab Tài sản của a-02 hiện series "Sóng Lag".

2. **Bà nội: xem lại tờ nhân vật và chọn giọng.** Bài kiểm của plan đã vẽ bà nội và người điều phối duyệt thay. Lời ghi duyệt thay nằm trong `S/characters/ba-noi/approval.json` (trường `notes`, cả lần hiện tại lẫn `previous`) và trong `DEMO.md` của a-02. Ở tab Tài sản, mở bảng bà nội, bấm "Xem rộng" rồi xem ở 4×. **Chờ bạn quyết** bốn điểm:
   - Màu áo không đồng nhất: tư thế `stand` áo nâu, còn hai tư thế ngồi chiếu (`sit-phone`, `sit-phone-talk`) ra đỏ gạch sau khi lượng tử hoá bảng màu.
   - Chiếu nhảy hình: `sit-phone` có chiếu chữ nhật, `sit-phone-talk` có chiếu tròn. Nếu cảnh 5 đổi qua lại hai tư thế này thì chiếu sẽ đổi hình. Có hai cách sửa: chỉ dùng một tư thế rồi cho bà nói bằng khẩu hình (viseme), hoặc bấm "Vẽ lại" ảnh kia kèm lý do "cùng kiểu chiếu với ảnh còn lại".
   - Mặt `head-front.pxl` do đạo diễn viết tay. Validate đã đạt, nhưng mặt cần được xem ở 4× trên tờ rig `C/video/a-02/assets/gen/rig-preview/ba-noi-sheet.png`.
   - Nếu chưa ưng ảnh nào, bấm "Vẽ lại" kèm một câu lý do. Mỗi lần vẽ lại tốn lượt Codex, và thẻ đồng ý ghi số lượt tối đa.

   Sau đó nghe 3 giọng thử ở thẻ "Chọn giọng cho Bà nội" (tab Tài sản hoặc tab Lời & giọng). Ba file là `C/video/a-02/.opus/voice-design/ba-noi/ba-noi-1.mp3`, `ba-noi-2.mp3`, `ba-noi-3.mp3`, dài 23,6 s, 28,4 s và 24,2 s. Bấm "Chọn giọng này" trên bản bạn thích. Studio sẽ chạy `voice-design save`, ghi giọng vào `S/voices/cast.json`, rồi giao đạo diễn lồng tiếng các câu của bà nội. Bước này tốn một lượt tạo giọng ElevenLabs. Xong khi `cast.json` có `ba-noi`. Nếu cột Đạo diễn hiện thẻ "Cần xử lý ngoài" (ví dụ `build-rig`), bấm "Chép", dán câu đó vào Claude Code ở terminal, làm xong thì bấm "Đã xử lý".

3. **Quyết cách tự kiểm ảnh, rồi làm tài sản mới của tập 2.** **Chờ bạn quyết trước đợt vẽ đầu tiên.** Bài kiểm bà nội đo được khoảng 4 lượt Codex cho mỗi ảnh: 4 ảnh tốn 8 lượt vẽ và 8 lượt đọc ảnh. Lý do là `flat_green` gần như luôn trượt với ảnh Codex, còn `right_character` trượt khi ảnh tham chiếu chỉ là mẫu nét vẽ, nên mỗi lần vẽ lại tự động đều phí. Các phương án nằm ở `reports/kongming-checkpoint-phase-06-07.md`, mục 4:
   - A: giữ nguyên, khoảng 4 lượt mỗi ảnh.
   - B: đặt `agents.order.vision` để `claude` đọc ảnh thay Codex. Đây chỉ là cấu hình, nhưng sẽ tốn quota Claude.
   - C: bỏ vẽ lại tự động.
   - C': chỉ vẽ lại tự động khi trượt `no_text` hoặc `single_figure`.
   - D: tắt `right_character` khi ảnh tham chiếu chỉ là mẫu nét vẽ.
   - E: đo `flat_green` bằng điểm ảnh tại chỗ thay vì hỏi agent.

   Gợi ý mặc định là C' + D (một PR nhỏ), cộng B nếu bạn chấp nhận tốn quota Claude. Báo người điều phối phương án bạn chọn. Nếu không ai sửa gì thì Studio chạy theo A, và thẻ đồng ý đã ghi đúng trần 4n lượt.

   Sau đó, theo mục "Tài sản hình" của kịch bản `C/scripts/a-02-tai-khoan-facebook-dau-tien.md` (dòng 266-271), nhờ đạo diễn tạo các đợt sau:
   - 7 tư thế mới của Sóng, bố, mẹ;
   - 6 nền mới;
   - đạo cụ vật;
   - hơn 25 thẻ `ui-card` cho màn hình Facebook. Thẻ này làm bằng mã nên không tốn lượt.

   Mỗi đợt có thẻ đồng ý ghi số lượt ước tính và số lượt tối đa. Duyệt từng bảng ở 4× ("Xem rộng"). Ảnh hỏng thì đánh dấu kèm một câu lý do để vẽ lại; ảnh đạt thì bấm "Duyệt cả bảng". Xong khi mọi bảng của tập 2 đã duyệt và rig đã đồng bộ vào a-02.

4. **Kịch bản, người nói và cổng viet-pro.** Nhờ đạo diễn tách kịch bản (`script/kich-ban-nguon.md` của a-02) thành `script/NN.txt` và `scenes/roles.json`, kèm bảng 3 cột của viet-pro. Sau đó nhờ đạo diễn chạy cổng `check-viet-pro` cho tới khi đạt PASS; bạn chỉ đọc kết quả ở cột Đạo diễn, không gõ lệnh. Không lách cổng bằng `--lang en`. Ở tab Lời & giọng, kiểm ô người nói của từng câu; mỗi vai có một màu riêng. Bước này không tốn lượt. Xong khi cổng viet-pro PASS, BRIEF có bản ghi `## viet_pro`, và mọi câu có đúng người nói.

5. **Lồng tiếng, nhạc, và một lần kiểm "đổi người nói".** Ở tab Lời & giọng, bấm "Lồng tiếng các câu cũ". Studio hiện thẻ đồng ý, kèm số ký tự sẽ tốn lượt ElevenLabs. Nhạc nền và SFX sinh ra đã được cắt im lặng và chuẩn hoá về khoảng -12,5 LUFS. **Kiểm này chưa chạy thật, chờ bạn làm ở câu đầu tiên:**
   - đổi người nói của một câu ở ô người nói (câu đó chuyển sang cần lồng lại);
   - lồng lại đúng câu đó;
   - đo file `assets/mix/voice-NN.mp3` của câu: độ to phải khoảng -16 LUFS (bản giao tập 1 là -16,7 LUFS);
   - đo nhạc dưới giọng bằng nút "Đo tiếng" (mix-balance), đích 4–7 dB.

   Lưu ý: đổi người nói làm đổi `scenes/roles.json`, mà file này nằm trong dấu hình của cổng final. Nếu animatic đã duyệt rồi mới đổi người nói thì cổng final sẽ FAIL và phải duyệt animatic lại (mục 7). Nên làm phép kiểm này trước khi duyệt animatic.

   Nếu lệch, báo trước khi lồng cả tập. Xong khi mọi câu có giọng, `gate: pass`, và mỗi file giọng mới có biên nhận `series-tts` (hoặc `voice-design`) trong `.opus/receipts/` của a-02.

6. **Dựng cảnh và duyệt cảnh trên a-02 thật.** Nhờ đạo diễn viết `scenes/*.mjs` theo từng cảnh. Thẻ "Nhóm cảnh" nằm ở cột Đạo diễn và tab Tài sản. Mỗi cảnh viết xong, bấm "Dựng lại cảnh này" để xem ảnh ghép 6 khung và clip nháp không tiếng. Tick các cảnh đạt rồi bấm "Duyệt các cảnh đã chọn"; Studio ghi dòng duyệt vào `DEMO.md`. Bước này không tốn lượt (render nháp chạy trên máy). Chức năng này mới chỉ được kiểm trên mẫu tập a-99, chưa chạy trên a-02 thật, nên lần đầu cần để ý khoảng giây của từng cảnh có khớp lời không. Tay kéo mép shot bị khoá vì hình dựng bằng mã; dời câu thì vẫn được. Bảng `## Cảnh` của PLAN.md phải nêu ít nhất 2 blueprint/rule khác nhau (cột Blueprint/Rule), và đạo diễn phải chạy `recipe-pack` trước khi dựng; thiếu một trong hai thì cổng final FAIL. Đây là phần đạo diễn làm khi viết cảnh. Xong khi mọi cảnh có trạng thái đã duyệt và đang khớp.

7. **Animatic và duyệt cuối.** Nhờ đạo diễn chạy animatic, rồi duyệt ở thẻ animatic; Studio ghi `approval:`. Nếu sau đó chỉ lồng lại tiếng, hộp Xuất bản hiện thẻ "Tiếng đã đổi sau animatic". Khi đó bấm "Đo tiếng", nghe lại, rồi bấm "Nghe rồi, được". Còn nếu sửa `scenes/*.mjs` sau khi duyệt thì cổng final sẽ FAIL, và phải duyệt animatic lại. Dòng WARN `PLAN.md has no "## Nhịp"` chỉ là cảnh báo, không chặn. Bước này không tốn lượt. Xong khi `/api/gates` của a-02 không còn FAIL.

8. **Xuất video.** Điều kiện: style `pixel-arcade-hd` phải có trong plugin đang cài. Điều này đã xong (opus-video #10, kiểm `/api/gates?name=a-02` không còn `unknown style`), nên không cần chạy `install-style` nữa. Bấm "Xuất video" trong hộp Xuất bản. Studio render bằng `render-final.mjs` rồi nén ra `renders/a-02-…-final.mp4`. Bước này không tốn lượt, chỉ tốn thời gian máy. Xong khi `qc-mp4` có 0 FAIL và độ to nằm trong khoảng -16 đến -12 LUFS.

9. **Giao nộp vào kho series.** Bảng Giao nộp có năm dòng; mọi thứ đi vào `S/kenh-youtube/tap-2/`:
   - Video: ba bản youtube, facebook, tiktok. Không tốn lượt.
   - Thumbnail: thẻ đồng ý 3 lượt vẽ, tối đa 12 lượt Codex khi tính cả tự kiểm. Chọn 1 trong 3 ảnh để ra `thumbnail.jpg` có nhãn "SÓNG LAG · TẬP 2".
   - Tiêu đề và mô tả: lấy bản nháp `S/kenh-youtube/tap-2-tieu-de-mo-ta.md`, thêm mốc chương, rồi qua `check-platform youtube`.
   - Phụ đề: SRT và `CAPTIONS.md`. **Phải xong mục 4 trước.** `deliver_captions` chạy cổng `check-viet-pro --stage delivery`, và cổng này đòi a-02 có bản ghi `## viet_pro`, `script-table.v1.md` cùng dấu cổng của mọi `assets/voice/NN.mp3`. Thiếu thì cổng chặn và không chép gì; đừng làm giả bản ghi để lách.

   Studio không ghi đè: file trùng nội dung được coi là đã giao, còn file khác nội dung thì thêm hậu tố `-2`. Xong khi thư mục `tap-2/` đủ các file và mỗi file có biên nhận `deliver-*`.

10. **Drive: lần tải thật đầu tiên.** Đây là lần đầu Studio gửi file ra ngoài, nên làm chậm. Trước đó tính năng này chỉ được kiểm bằng gws giả và chạy khô. Bấm dòng Drive trong bảng Giao nộp. Thẻ đồng ý ghi email đã che (ba ký tự đầu rồi `…@gmail.com`), thư mục `song-lag`, số file và tổng dung lượng. Đọc kỹ rồi mới bấm đồng ý. Studio kiểm tài khoản, tạo thư mục nếu chưa có, tải lên, rồi báo tên file, kích thước, link và kết quả so kích thước. File đã có trên Drive với cùng tên và cùng cỡ sẽ được bỏ qua. Xong khi mọi file báo khớp kích thước và mở được link trên Drive. Nếu tải trượt hai lần liền, cột Đạo diễn sẽ hiện thẻ "Cần xử lý ngoài".

11. **Dọn rác (tùy chọn, sau khi giao nộp xong).** Việc này không nằm trong chỉ số "0 lệnh terminal" và bỏ qua được; ổ đầy thì mới cần làm. Làm theo mục 10 của `/Volumes/2/Edit-Video/CLAUDE.md`. Chạy `./scripts/sweep-after-final.sh a-02` ở `/Volumes/2/Edit-Video` để liệt kê trước. Khi dòng `Giữ:` đúng thì mới thêm `--apply`. Script giữ các file final, delivery và compressed. Không xoá `assets/`, `assets/gen/raw/` hay sidecar âm thanh.

12. **Ghi lại** tổng thời gian làm tập 2 và số lần phải mở terminal (mỗi thẻ "Cần xử lý ngoài" tính một lần), để so với mục tiêu của tài liệu `C/docs/motion-studio-nang-cap-tap-2.md`.

## Lưu ý

- Từ phase 10, đạo diễn của dự án series bị chặn hai lệnh `eleven.mjs tts` và `eleven.mjs audio-meta` (luật `--disallowedTools`). Các lệnh `sfx` và `music` của `eleven.mjs` vẫn chạy được, và chúng tốn lượt ElevenLabs mà không qua thẻ đồng ý. Sau mỗi tập, kiểm mọi file giọng mới có biên nhận `series-tts` hoặc `voice-design`; nếu thấy file không có biên nhận thì báo lại. Muốn chặn hẳn phải đổi `ALLOWED_TOOLS` của plugin, và đó là quyết định của bạn.
- Gợi ý cập nhật `/Volumes/2/Edit-Video/CLAUDE.md` (bạn tự quyết, người thực hiện không sửa file này):
  - Các tập series là symlink trong root, dữ liệu nằm ở kho Hoạt hình, nên không vi phạm quy tắc "không để media thô ở gốc".
  - Tab Tài sản (đợt vẽ, bảng duyệt, chọn giọng).
  - Bảng Giao nộp và Drive.
