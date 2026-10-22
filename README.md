# Motion Studio

Giao diện web chạy trên máy cho plugin Claude Code [opus-video](https://github.com/abm-dungtq/opus-video). Từ trình duyệt bạn tạo dự án video mới, nạp footage, giao việc cho đạo diễn AI (chính Claude Code trên máy bạn), bấm chọn hướng và duyệt animatic, sửa timeline rồi xuất MP4. Không cần terminal sau lần khởi động đầu.

Studio chỉ nghe `127.0.0.1:4317`. Mọi thay đổi timeline đi qua cổng lệnh `gateway.mjs` của plugin, nên mỗi lần sửa là một phiên bản có Hoàn tác.

## Cần có

- Node.js 20 trở lên. Không có dependency npm, không có bước build.
- Plugin opus-video 2.3.0 trở lên (dưới 3.0) đã cài, thường ở `~/.claude/skills/opus-video`. Studio đọc plugin qua một file duy nhất, `scripts/studio-api.mjs`.
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

## Timeline

Bốn track: Shot, Lồng tiếng, Nhạc, SFX. Kéo chuột chỉ xem trước tại chỗ; thả ra Studio gửi đúng một patch, thành một phiên bản mới.

- **SFX:** kéo khối để dời; chuột phải "Thêm SFX tại đây…" chọn file của dự án hoặc `shared-assets/sfx/`. Delete chỉ xoá SFX thêm từ Studio; SFX do đạo diễn đặt có nút "Nhờ đạo diễn". Id SFX trùng một thẻ `<audio>` đã có bị từ chối (HTTP 422).
- **Nhạc:** kéo thân để dời, kéo mép để cắt đầu hoặc cuối; inspector chỉnh âm lượng, fade vào, fade ra. Fade chỉ nghe trong video xuất ra, player xem trước không fade.
- **Cắt shot:** chọn shot, đặt playhead bên trong, bấm S. Shot mới trống, cần đạo diễn dựng cảnh; Studio đưa nút "Nhờ đạo diễn dựng shot mới".
- **Hít** (phím N hoặc nút "Hít"): mép khối hít vào playhead, mép shot, câu, SFX, phách nhạc, đầu từ.
- **M/S** trên nhãn track tắt tiếng hoặc solo track đó trong player. Chỉ ảnh hưởng xem trước, không đổi `project.json` hay video xuất.
- **Chip cổng** cạnh nút Xuất video: "Cần duyệt lại animatic" hoặc "Chưa đủ cổng xuất". Tab Xuất bản liệt kê các dòng FAIL.
- Sóng âm trên khối giọng và nhạc, vạch phách trên thước, chấm đầu từ khi zoom lớn. Ctrl/Cmd+cuộn để zoom quanh con trỏ, "Vừa khung" để xem cả video.

### Phím tắt timeline

Không chạy khi con trỏ đang ở ô nhập liệu.

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| J / K / L | Lùi một giây / dừng / phát |
| ← / → | Lùi / tới một khung |
| Shift+← / Shift+→ | Lùi / tới một giây |
| Home / End | Về đầu / cuối video |
| S | Cắt shot đang chọn tại playhead |
| Delete | Xoá SFX đang chọn (chỉ SFX thêm từ Studio) |
| N | Bật / tắt hít |
| Shift+Z | Vừa khung |
| Cmd/Ctrl+Z | Hoàn tác |
| Cmd/Ctrl+Shift+Z | Làm lại (nút "Làm lại" luôn bật; không còn gì để làm lại thì hiện thông báo) |

## Bộ lớp dựng

Nút "Xuất bộ lớp dựng" trong tab Xuất bản xuất dự án thành các lớp để dựng tiếp trong Concat, CapCut, DaVinci hay Premiere. Chạy tay bằng lệnh:

```bash
node bundle.mjs --project <thư mục dự án> [--ratio 9x16] [--source <mp4 đã render>] [--out <thư mục>]
```

Kết quả nằm trong `renders/<dự án>-<thời điểm>[-<tỉ lệ>]-bundle/`:

- `shots/NN-<shot>.mp4`: hình từng shot (H.264 CRF 12, không tiếng), cắt theo mốc shot trong `project.json` làm tròn về khung.
- `audio/mix.wav`, `voice.wav`, `music.wav`, `sfx.wav`: tiếng tổng và tiếng tách theo vai, 48 kHz, dài bằng video, đặt từ giây 0.
- `captions.srt`: phụ đề từ các câu thoại, câu dài được tách theo mốc từng từ.
- `manifest.json` (schema `motion-studio/bundle@1`): khung vào và ra của từng shot, file tiếng, câu thoại, SFX.

HyperFrames không render riêng một đoạn, nên lệnh render cả video một lần rồi cắt. Chuyển cảnh nằm sẵn trong hình của các shot nó vắt qua: giữ thứ tự và độ dài shot thì nối lại liền mạch. Lệnh dùng chung hàng đợi với Xuất video, mỗi dự án chạy một việc xuất một lúc. Bước nào lỗi thì cả thư mục bị xoá.

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
| 1.1.x | 2.3.0 trở lên, dưới 3.0 | 3 |

## Test

```bash
npm test
```

Test cần plugin đã cài, vì các module của Studio nạp plugin ngay khi import. Plugin ở chỗ khác thì đặt `OPUS_VIDEO_HOME`.

## Giấy phép

MIT, xem `LICENSE`.
