# Motion Studio

Giao diện web chạy trên máy cho plugin Claude Code [opus-video](https://github.com/abm-dungtq/opus-video). Từ trình duyệt bạn tạo dự án video mới, nạp footage, giao việc cho đạo diễn AI (chính Claude Code trên máy bạn), bấm chọn hướng và duyệt animatic, sửa timeline rồi xuất MP4. Không cần terminal sau lần khởi động đầu.

Studio chỉ nghe `127.0.0.1:4317`. Mọi thay đổi timeline đi qua cổng lệnh `gateway.mjs` của plugin, nên mỗi lần sửa là một phiên bản có Hoàn tác.

## Cần có

- Node.js 20 trở lên. Không có dependency npm, không có bước build.
- Plugin opus-video 2.x đã cài, thường ở `~/.claude/skills/opus-video`. Studio đọc plugin qua một file duy nhất, `scripts/studio-api.mjs`.
- Claude Code (`claude`) đã đăng nhập, nếu muốn giao việc cho đạo diễn AI.
- ffmpeg và ffprobe để đọc metadata footage và xuất video.

## Cài và chạy

```bash
git clone https://github.com/abm-dungtq/motion-studio ~/Projects/motion-studio
cd ~/Projects/motion-studio
node bin/motion-studio.mjs start --background
```

Mở `http://127.0.0.1:4317`. Các lệnh khác:

```bash
node bin/motion-studio.mjs status                    # running <url> … | stopped
node bin/motion-studio.mjs stop                      # dừng server và mọi job
node bin/motion-studio.mjs start --background --root <thư mục chứa các dự án>
```

Thư mục gốc mặc định là `/Volumes/2/Edit-Video` (đổi bằng `--root` hoặc `OPUS_STUDIO_ROOT`). Mỗi dự án là một thư mục con có `project.json`.

Lệnh cũ của plugin vẫn chạy: `node ~/.claude/skills/opus-video/scripts/studio.mjs start --background` tìm Studio ở `MOTION_STUDIO_HOME`, rồi `~/Projects/motion-studio`, và chạy `bin/motion-studio.mjs` với cùng tham số.

## Biến môi trường

| Biến | Dùng để |
|---|---|
| `OPUS_VIDEO_HOME` | Thư mục plugin opus-video, khi không nằm ở `~/.claude/skills/opus-video` |
| `OPUS_STUDIO_ROOT` | Thư mục chứa các dự án |
| `OPUS_STUDIO_STATE` | File trạng thái (mặc định `~/.config/opus-video/studio.json`, chmod 600) |

## Tương thích

Khi khởi động, `lib/plugin.mjs` kiểm `STUDIO_API`, schema manifest và bản plugin. Không khớp thì Studio dừng và in bản cần cùng bản đang có.

| Motion Studio | opus-video | `STUDIO_API` |
|---|---|---|
| 1.0.x | 2.1.0 trở lên, dưới 3.0 | 2 |

## Test

```bash
npm test
```

Test cần plugin đã cài, vì các module của Studio nạp plugin ngay khi import. Plugin ở chỗ khác thì đặt `OPUS_VIDEO_HOME`.

## Giấy phép

MIT, xem `LICENSE`.
