# Motion Studio

Giao diện web chạy trên máy cho dự án video do đạo diễn AI dựng. Từ trình duyệt bạn tạo dự án video mới, nạp footage, giao việc cho đạo diễn AI (chính Claude Code trên máy bạn), bấm chọn hướng và duyệt animatic, sửa timeline rồi xuất MP4. Không cần terminal sau lần khởi động đầu.

Studio không tự giữ schema dự án: một provider sở hữu `project.json`, cổng lệnh sửa timeline và hàng đợi yêu cầu cho đạo diễn. Provider mặc định là plugin Claude Code [opus-video](https://github.com/abm-dungtq/opus-video) (xem mục Provider).

Studio chỉ nghe `127.0.0.1:4317`. Mọi thay đổi timeline đi qua cổng lệnh của provider, nên mỗi lần sửa là một phiên bản có Hoàn tác.

## Cần có

- Node.js 20 trở lên. Không có dependency npm, không có bước build.
- Một provider. Provider mặc định là plugin opus-video 2.3.0 trở lên (dưới 3.0), thường ở `~/.claude/skills/opus-video`. Chưa có provider thì Studio vẫn mở được trang và báo rõ thiếu gì.
- Claude Code (`claude`) đã đăng nhập, nếu muốn giao việc cho đạo diễn AI.
- ffmpeg và ffprobe để đọc metadata footage và xuất video.

## Cài và chạy

```bash
git clone https://github.com/abm-dungtq/motion-studio ~/Projects/motion-studio && cd ~/Projects/motion-studio && npm run setup
node bin/motion-studio.mjs start --background
```

`npm run setup` tìm provider mặc định (plugin opus-video) và so với bản mới nhất trên GitHub (commit của `main` qua `git ls-remote`, số bản trong `.claude-plugin/plugin.json`). Kết quả là một trong ba: chưa cài, cũ (bản đang có → bản mới nhất), hoặc đã mới nhất. Chưa cài hay cũ thì Studio hỏi "Cài/cập nhật opus-video bản mới nhất? [Y/n]" (Enter là có):

- plugin là git checkout: `git -C <thư mục> pull --ff-only`. Checkout có thay đổi chưa commit, hay đang ở nhánh khác, thì Studio từ chối và không đụng tới;
- còn lại: chạy installer chính thức `install.sh` của plugin (`--ref`, cùng cờ host). Installer cất bản cũ vào `~/.opus-video-backups/` và cài kèm viet-pro cùng skill HyperFrames.

Sau khi cài, Studio nạp lại provider và kiểm `STUDIO_API`. Tham số: `npm run setup -- --yes` (không hỏi), `--ref <nhánh hoặc tag>` (mặc định `main`), `--host claude|codex|all` (mặc định `all`, như installer). Không có terminal mà thiếu `--yes` thì Studio không cài gì, chỉ in lệnh cần chạy (thoát mã 3). `start` khi chưa có provider in một dòng nhắc chạy `npm run setup`; trang Studio hiện cùng lệnh đó.

Mở `http://127.0.0.1:4317`. Các lệnh khác:

```bash
node bin/motion-studio.mjs status                    # running <url> … | stopped
node bin/motion-studio.mjs stop                      # dừng server và mọi job
node bin/motion-studio.mjs start --background --root <thư mục chứa các dự án>
```

Thư mục gốc lấy theo thứ tự: `--root`, `MOTION_STUDIO_ROOT`, thư mục gốc của lần chạy trước (lưu trong file trạng thái), cuối cùng `/Volumes/2/Edit-Video` (đường dự phòng này bỏ ở 2.0). Mỗi dự án là một thư mục con có `project.json`.

Lệnh cũ của provider mặc định vẫn chạy: `node ~/.claude/skills/opus-video/scripts/studio.mjs start --background` tìm Studio ở `MOTION_STUDIO_HOME`, rồi `~/Projects/motion-studio`, và chạy `bin/motion-studio.mjs` với cùng tham số.

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

## Thư viện mẫu

Tab Thư viện mẫu có bốn mục, tìm được bằng tiếng Việt có dấu hay không dấu, hoặc bằng tiếng Anh:

- **Video mẫu:** khoảng 1.250 video làm bằng Claude Opus 5.5, gộp từ sáu danh sách công khai trên GitHub. 200 video tuyển chọn có giải thích tiếng Việt: video làm gì, điều đáng học, cách dùng cho dự án. Video còn lại có tên tiếng Việt và prompt gốc. Lọc được theo thể loại hoặc chỉ xem mẫu tuyển chọn.
- **Cảnh mẫu:** các kỹ thuật dựng cảnh hay gặp (chữ động, HUD, biến hình, khớp beat…), kèm gợi ý để dán vào prompt và video ví dụ, cùng các hướng cảnh của provider.
- **Phong cách:** 12 công thức phong cách có bản dịch, cùng các phong cách của provider.
- **Prompt mẫu:** khung prompt video chuyên nghiệp để điền, các prompt được lưu nhiều nhất kèm phân tích cấu trúc, và bộ công cụ đạo diễn (quy trình, cách góp ý, kiểm tra trước khi render).

Không cần mở dự án vẫn xem và chép prompt được. Khi đã mở dự án, "Dùng cho dự án" gửi mẫu cho đạo diễn kèm phần giải thích và đoạn trích prompt.

Ảnh bìa không nằm trong repo. Tải một lần về `~/.cache/motion-studio/library/thumbs` (khoảng 25 MB, đổi chỗ bằng `MOTION_STUDIO_THUMBS`):

```bash
node scripts/library-thumbs.mjs
```

Dữ liệu nằm trong `library/library.json`, dựng bằng `scripts/build-library.mjs` từ các repo ở commit cố định. Nguồn, giấy phép và cách dựng lại ghi trong [library/SOURCES.md](library/SOURCES.md). Phần tiếng Việt nằm trong `library/vi/`.

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
- `timeline.fcpxml` (Final Cut Pro, DaVinci Resolve), `timeline.xml` (Premiere, Resolve), `timeline.otio` (OpenTimelineIO): các shot nối nhau, stem tiếng trên từng track, marker cho câu thoại và SFX. Mở trong phần mềm dựng, cờ `--nle` và giới hạn: [docs/nle-export.md](docs/nle-export.md).

HyperFrames không render riêng một đoạn, nên lệnh render cả video một lần rồi cắt. Chuyển cảnh nằm sẵn trong hình của các shot nó vắt qua: giữ thứ tự và độ dài shot thì nối lại liền mạch. Lệnh dùng chung hàng đợi với Xuất video, mỗi dự án chạy một việc xuất một lúc. Bước nào lỗi thì cả thư mục bị xoá.

## Biến môi trường

Studio đọc tên mới trước. Tên cũ vẫn chạy, mỗi tên in một dòng cảnh báo lên stderr một lần, và sẽ bỏ ở 2.0.

| Biến | Tên cũ (bỏ ở 2.0) | Dùng để |
|---|---|---|
| `MOTION_STUDIO_ROOT` | `OPUS_STUDIO_ROOT` | Thư mục chứa các dự án |
| `MOTION_STUDIO_STATE` | `OPUS_STUDIO_STATE` | File trạng thái (mặc định `~/.config/motion-studio/studio.json`, chmod 600) |
| `MOTION_STUDIO_COMPRESS` | `OPUS_COMPRESS_FINAL` | Lệnh nén bản giao sau khi render (mặc định `<root>/scripts/compress-final.sh`) |
| `MOTION_STUDIO_HF_RUNTIME` | `OPUS_HF_RUNTIME` | File HyperFrames runtime cho player |
| `MOTION_STUDIO_PROVIDER` | | Chọn provider trong `lib/providers/` (mặc định provider có `DEFAULT`) |
| `MOTION_STUDIO_THUMBS` | | Thư mục ảnh bìa của thư viện mẫu (mặc định `~/.cache/motion-studio/library/thumbs`) |
| `MOTION_STUDIO_HOME` | | Nơi shim của provider mặc định tìm Studio |
| `MOTION_STUDIO_HF_SKILLS` | | Thư mục skill HyperFrames Studio đọc (mặc định `~/.claude/skills`) |
| `MOTION_STUDIO_AGENT_PATH` | | Đường tìm agent CLI. Đã đặt thì Studio chỉ tìm ở đó, không thêm `~/.local/bin` hay `/opt/homebrew/bin` |
| `OPUS_VIDEO_HOME` | | Thư mục plugin opus-video (chỉ provider mặc định đọc). Đã đặt thì Studio chỉ dùng thư mục đó |

Lần đầu chạy mà chưa có `~/.config/motion-studio/studio.json`, Studio chép file trạng thái cũ của provider (`~/.config/opus-video/studio.json`) sang, và không xoá file cũ. Studio không đọc, không in, không chép file `.env` khoá API của provider.

`OPUS_STUDIO_RUNNER` và `OPUS_STUDIO_REQUEST` không đổi tên: provider mặc định đặt chúng cho `claude -p` để MCP server của plugin biết yêu cầu nào đang chạy.

## Tính năng mở rộng

Thêm tính năng bằng cách thêm file, không sửa `server.mjs` hay `public/app.js`:

- `routes/*.mjs`: route HTTP. Route của Studio luôn được thử trước; đường trùng làm Studio báo lỗi lúc khởi động.
- `public/ext-*.js` và `public/ext-*.css`: tab, mục trong tab, mục trong inspector, dòng trong popover agent, dấu trên timeline, icon.
- `lib/tools/*.mjs`: tool cho đạo diễn AI và MCP client.
- `lib/quality/*.mjs`: kiểm chạy trên mọi file Studio tạo ra. Kết quả nằm trong biên nhận `<dự án>/.opus/receipts/`.
- `lib/agents/cli/*.mjs`: agent CLI trên máy (claude, codex, codex-pool, agy, …) để viết chữ, đọc ảnh, sinh ảnh. Bảng trạng thái và nút "Thử khả năng" nằm trong popover của chip agent.

Ví dụ chạy được cho từng chỗ cắm: [docs/extensions.md](docs/extensions.md). Agent CLI, thứ tự thử và cách đổi: [docs/agents.md](docs/agents.md).

## Provider

Mọi thứ Studio cần từ bên ngoài đi qua `lib/provider.mjs`: đọc và kiểm `project.json`, cổng lệnh (patch, hoàn tác, làm lại, lịch sử), hàng đợi yêu cầu cho đạo diễn, danh sách tool và đoạn prompt cho `claude -p`, đường các lệnh (render, mix, pitch, import, demo, recipe, preflight, cases, styles, timing, beat grid, word sync, SFX sync, cut, reframe, qc), và file thư viện (hướng cảnh, phong cách). Contract ghi ở đầu file đó.

Adapter nằm trong `lib/providers/`, mỗi provider một file đi kèm Studio. Studio không nạp mã từ thư mục ngoài repo. Hôm nay chỉ có `lib/providers/opus-video.mjs`; đó là file duy nhất nhắc tên plugin, đường dẫn và script của nó (test chặn tên này ở mọi chỗ khác).

Provider nạp lười, ở lần đầu một route cần đến. Thiếu provider hay provider không tương thích thì server vẫn chạy: `GET /api/status` trả `{ ok: false, provider: null, error, hint }`, chip agent đỏ, trang hiện hướng dẫn, các route cần provider trả 503 kèm lý do. Cài provider xong không cần khởi động lại Studio.

## Tương thích

Lần đầu nạp, adapter opus-video kiểm `STUDIO_API`, schema manifest và bản plugin. Không khớp thì Studio báo bản cần cùng bản đang có (trong `/api/status` và trên trang).

| Motion Studio | opus-video | `STUDIO_API` |
|---|---|---|
| 1.0.x | 2.1.0 trở lên, dưới 3.0 | 2 |
| 1.1.x | 2.3.0 trở lên, dưới 3.0 | 3 |
| chưa phát hành | 2.3.0 trở lên, dưới 3.0 | 3 hoặc 4 |

## Test

```bash
npm test
```

Phần lớn test cần provider mặc định đã cài (plugin ở chỗ khác thì đặt `OPUS_VIDEO_HOME`). `tests/no-provider.test.mjs` và `tests/config.test.mjs` chạy được khi chưa có provider.

## Giấy phép

MIT, xem `LICENSE`.
