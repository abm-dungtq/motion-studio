# Changelog

## v1.0.0 (2026-10-17): tách từ opus-video v2.1.0

- Motion Studio rời plugin opus-video thành repo riêng, giữ lịch sử commit của `studio/`, `scripts/studio.mjs` và các test của nó.
- Bố cục mới: các module server ở thư mục gốc, giao diện trong `public/`, lệnh chạy là `bin/motion-studio.mjs`, test trong `tests/`.
- `lib/plugin.mjs` tìm plugin theo `OPUS_VIDEO_HOME`, rồi `~/.claude/skills/opus-video`. Studio chỉ import `scripts/studio-api.mjs` của plugin và kiểm tra khi khởi động: `STUDIO_API >= 2`, schema `opus-video/project@1`, plugin bản 2.x. Sai thì báo rõ bản cần và bản đang có.
- Tính năng giữ nguyên như opus-video v2.1.0: tạo dự án mới, nạp footage, giao việc nhiều lượt cho đạo diễn AI với thẻ duyệt, chip agent, sửa timeline qua gateway có Hoàn tác, xuất MP4.
