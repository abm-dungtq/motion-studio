# Changelog

## Chưa phát hành

- Xuất bộ lớp dựng (`bundle.mjs`, nút "Xuất bộ lớp dựng" trong tab Xuất bản, `POST /api/bundle`): MP4 từng shot cắt đúng khung, tiếng tổng cùng giọng, nhạc, SFX tách riêng, phụ đề SRT và `manifest.json`, để dựng tiếp trong Concat, CapCut, DaVinci hay Premiere.
- Sửa: bấm chọn hướng hay "Duyệt" trên thẻ đạo diễn vẫn có lúc không gửi gì và không báo gì. Giữ nguyên node thẻ chưa đủ: mỗi lần vẽ lại, panel gỡ thẻ ra rồi gắn vào khung mới, và Chromium bỏ cú click khi nút rời trang giữa lúc nhấn và nhả chuột, kể cả khi nút được gắn lại. Panel giờ hoãn vẽ lại tới khi nhả chuột (hoặc phím Space), rồi mới vẽ sau cú click.
- Câu trả lời thẻ chờ tối đa 90 giây; quá hạn hay lỗi trong trang thì thẻ ghi rõ lý do thay vì khoá nút mãi. Mỗi câu trả lời tới server được ghi một dòng trong `studio.log`.

## v1.1.0 (2026-10-17): timeline sửa nhanh kiểu CapCut

- Sửa: bấm "Duyệt" hay chọn hướng trên thẻ đạo diễn đôi khi không có tác dụng. `claude -p` thoát vài giây sau `studio_ask`, panel vẽ lại cả thẻ (nút bị thay giữa lúc bấm) và bỏ khối "Đạo diễn đang làm…" bên dưới nên thẻ tụt xuống, cú bấm rơi vào video. Thẻ đang chờ giờ giữ nguyên node qua mỗi lần vẽ lại và giữ chỗ trên màn hình; khối "đang làm" không hiện cho job đã hỏi xong.
- Câu trả lời gửi không được thì thẻ ghi rõ lý do bằng tiếng Việt: trang hết phiên sau khi Studio khởi động lại (403), mất kết nối, hay lỗi cổng từ server.
- Cần plugin opus-video 2.3.0 trở lên (`STUDIO_API >= 3`); plugin cũ hơn thì Studio dừng và báo rõ bản cần.
- Track SFX: kéo dời (`move_event`), chuột phải "Thêm SFX tại đây…" (`add_event`, file chung được chép vào dự án), Delete xoá SFX thêm từ Studio (`remove_event`). SFX do đạo diễn đặt hiện "Nhờ đạo diễn". Id trùng thẻ `<audio>` đã có bị từ chối (422).
- Khối nhạc: kéo thân, cắt đầu, cắt cuối; inspector chỉnh âm lượng, fade vào, fade ra (`update_music`). Fade chỉ nghe trong video xuất.
- Cắt shot tại playhead bằng S: một patch, tổng thời lượng không đổi; shot mới trống kèm nút "Nhờ đạo diễn dựng shot mới".
- Làm lại: nút "Làm lại" và Cmd/Ctrl+Shift+Z (`POST /api/redo`). Nút luôn bật; không còn gì để làm lại thì hiện thông báo.
- Kéo thước hoặc playhead để tua; phím tắt Space, J/K/L, ←/→, Shift+←/→, Home/End, S, Delete, N, Shift+Z, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z; menu chuột phải cho từng loại khối.
- Hít (phím N, nút "Hít") vào playhead, mép shot, câu, SFX, phách nhạc, đầu từ, có vạch hít khi kéo.
- Sóng âm trên khối giọng và nhạc, vạch phách, chấm đầu từ, Ctrl/Cmd+cuộn zoom quanh con trỏ, nút "Vừa khung".
- M/S trên từng track âm thanh: chỉ đổi player, không đổi `project.json`.
- Chip cổng trên thanh trên ("Cần duyệt lại animatic", "Chưa đủ cổng xuất") từ `GET /api/gates`, và danh sách FAIL trong tab Xuất bản.
- API mới: `POST /api/redo`, `GET /api/sounds`, `POST /api/sounds/import`, `GET /api/gates`.
- Sửa: thanh trên cùng không còn tràn dòng; hàng Shot không bị thước thời gian che.

## v1.0.0 (2026-10-17): tách từ opus-video v2.1.0

- Motion Studio rời plugin opus-video thành repo riêng, giữ lịch sử commit của `studio/`, `scripts/studio.mjs` và các test của nó.
- Bố cục mới: các module server ở thư mục gốc, giao diện trong `public/`, lệnh chạy là `bin/motion-studio.mjs`, test trong `tests/`.
- `lib/plugin.mjs` tìm plugin theo `OPUS_VIDEO_HOME`, rồi `~/.claude/skills/opus-video`. Studio chỉ import `scripts/studio-api.mjs` của plugin và kiểm tra khi khởi động: `STUDIO_API >= 2`, schema `opus-video/project@1`, plugin bản 2.x. Sai thì báo rõ bản cần và bản đang có.
- Tính năng giữ nguyên như opus-video v2.1.0: tạo dự án mới, nạp footage, giao việc nhiều lượt cho đạo diễn AI với thẻ duyệt, chip agent, sửa timeline qua gateway có Hoàn tác, xuất MP4.
