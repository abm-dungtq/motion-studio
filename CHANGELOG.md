# Changelog

## Chưa phát hành

- Sửa: bấm "Duyệt" hay chọn hướng trên thẻ đạo diễn đôi khi không có tác dụng. `claude -p` thoát vài giây sau `studio_ask`, panel vẽ lại cả thẻ (nút bị thay giữa lúc bấm) và bỏ khối "Đạo diễn đang làm…" bên dưới nên thẻ tụt xuống, cú bấm rơi vào video. Thẻ đang chờ giờ giữ nguyên node qua mỗi lần vẽ lại và giữ chỗ trên màn hình; khối "đang làm" không hiện cho job đã hỏi xong.
- Câu trả lời gửi không được thì thẻ ghi rõ lý do bằng tiếng Việt: trang hết phiên sau khi Studio khởi động lại (403), mất kết nối, hay lỗi cổng từ server.

## v1.0.0 (2026-10-17): tách từ opus-video v2.1.0

- Motion Studio rời plugin opus-video thành repo riêng, giữ lịch sử commit của `studio/`, `scripts/studio.mjs` và các test của nó.
- Bố cục mới: các module server ở thư mục gốc, giao diện trong `public/`, lệnh chạy là `bin/motion-studio.mjs`, test trong `tests/`.
- `lib/plugin.mjs` tìm plugin theo `OPUS_VIDEO_HOME`, rồi `~/.claude/skills/opus-video`. Studio chỉ import `scripts/studio-api.mjs` của plugin và kiểm tra khi khởi động: `STUDIO_API >= 2`, schema `opus-video/project@1`, plugin bản 2.x. Sai thì báo rõ bản cần và bản đang có.
- Tính năng giữ nguyên như opus-video v2.1.0: tạo dự án mới, nạp footage, giao việc nhiều lượt cho đạo diễn AI với thẻ duyệt, chip agent, sửa timeline qua gateway có Hoàn tác, xuất MP4.
