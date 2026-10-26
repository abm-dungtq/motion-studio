# Motion Studio

[English](README.md) · **Tiếng Việt**

**Phần mềm dựng video để đạo diễn AI làm phần dựng, còn bạn là người quyết.** Motion Studio là ứng dụng web chạy ngay trên máy bạn. Bạn tạo dự án, thả footage vào, giao việc cho đạo diễn bằng lời thường, bấm duyệt lựa chọn của nó trên thẻ, chỉnh kết quả trên timeline kiểu CapCut, rồi xuất MP4 hoặc bộ lớp dựng cho Final Cut Pro, Premiere và DaVinci Resolve. Sau lần khởi động đầu, bạn không cần mở terminal nữa.

[![Release](https://img.shields.io/badge/release-v2.0.0-orange.svg)](https://github.com/abm-dungtq/motion-studio/releases/tag/v2.0.0)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-339933.svg)
![Runs locally](https://img.shields.io/badge/runs-127.0.0.1%20only-555.svg)
![Tests](https://img.shields.io/badge/tests-499%20passing-brightgreen.svg)

![Motion Studio: đạo diễn hỏi bạn chọn hướng, timeline hiện shot, lồng tiếng, nhạc và SFX](plans/261023-1018-react-ui-rewrite/screens/1440-director.jpg)

[Vì sao chọn Motion Studio](#vì-sao-chọn-motion-studio) · [Tính năng](#tính-năng) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Timeline](#timeline) · [Xuất sang phần mềm dựng](#xuất-sang-phần-mềm-dựng) · [Cho nhà phát triển](#cho-nhà-phát-triển) · [Hợp tác](#hợp-tác)

---

## Vì sao chọn Motion Studio

AI giờ đã dựng được cả video, nhưng phần lớn công cụ bắt bạn chọn một trong hai. Hoặc là một khung chat trả về file hoàn chỉnh mà bạn không sửa được, hoặc là phần mềm dựng quen thuộc với AI chỉ là một plugin đứng bên lề. Motion Studio gom cả hai vào một cửa sổ.

- **Đạo diễn chính là Claude Code của bạn.** Studio chạy `claude` đã đăng nhập sẵn trên máy, có nhớ ngữ cảnh dự án. Không cần mua thêm gói AI nào. Dữ liệu chỉ rời máy qua những lệnh gọi của agent và của các dịch vụ bạn đã đồng ý.
- **Bạn giữ quyền quyết định.** Khi cần bạn chọn, chẳng hạn dùng hướng hình nào trong ba hướng hay animatic đã ổn chưa, đạo diễn hỏi bằng thẻ rồi chờ. Chỉ bạn mới duyệt được hướng hay bản cắt; đạo diễn không tự duyệt việc của mình.
- **Lần sửa nào cũng thành một phiên bản.** Kéo một shot, dời một câu thoại hay đổi chỗ một tiếng động đều thành một phiên bản có số, hoàn tác và làm lại được, dù người sửa là bạn hay đạo diễn.
- **Riêng tư ngay từ thiết kế.** Studio chỉ nghe ở `127.0.0.1`, từ chối yêu cầu đến từ trang web khác. Nó cũng không bao giờ đọc, in hay chép file khoá API của bạn.

## Tính năng

| | |
|---|---|
| **Đạo diễn AI** | Trò chuyện nhiều lượt với đạo diễn; thẻ duyệt hướng, animatic và từng cảnh; thẻ gợi ý xếp hạng hướng và phong cách theo brief; chip trạng thái cho biết `claude` đã cài và đăng nhập chưa |
| **Timeline** | Các track Shot, B-roll, Lồng tiếng, Nhạc và SFX; kéo mép kiểu Ripple và Roll; cắt shot tại playhead; hít vào mép shot, câu thoại, phách nhạc và đầu từ; sóng âm; tắt tiếng và solo; kéo được mốc phách và mốc từ; chip cổng báo còn gì chặn việc xuất |
| **Hình và chuyển động** | 59 phong cách vẽ bằng code từ lemo-opuscar chia 11 nhóm, áp cho cả dự án hoặc từng shot; thư viện 54 kiểu chuyển cảnh có trang xem thử; bốn gói anime (impact frame, smear cut, ink wipe, speed lines); công cụ sửa clip để cắt đoạn, đổi tốc độ, đứng hình, áp LUT và đổi khung |
| **Footage** | Duyệt thư mục trên máy và đăng ký video, âm thanh, ảnh; chỉ mục B-roll theo nội dung, tìm shot bằng mô tả tiếng Việt hay tiếng Anh rồi đặt vào timeline, hoàn tác được |
| **Thư viện mẫu** | Khoảng 1.250 video làm bằng Claude Opus 5.5, trong đó 200 video có giải thích tiếng Việt, cùng kỹ thuật dựng cảnh, công thức phong cách và khung prompt chuyên nghiệp |
| **Làm phim nhiều tập** | Dùng chung nhân vật, giọng, nền và công cụ giữa các tập; bảng duyệt tờ nhân vật và bảng nền; vẽ ảnh theo đợt có tự kiểm; chọn giọng riêng cho từng nhân vật; dựng lại và duyệt một cảnh mà không phải render lại cả tập |
| **Giao bản cuối** | Xuất MP4 và nén bằng một nút; bản riêng cho YouTube, Facebook và TikTok; tiêu đề và mô tả có mốc chương; phụ đề SRT; ba ảnh thumbnail để chọn; tải lên Google Drive sau khi bạn đồng ý |
| **Minh bạch** | Thẻ đồng ý trước mọi việc tốn lượt (Codex, ElevenLabs, Drive); biên nhận có kết luận đạt, cảnh báo hoặc lỗi từ chín bài kiểm chất lượng; thẻ "Cần xử lý ngoài" khi một bước lỗi hai lần, có sẵn câu để dán vào Claude Code |
| **Mở rộng được** | Tool MCP cho Claude Code, Codex, Antigravity và opencode; hợp đồng provider; các thư mục cắm thêm route, tab, tool, bài kiểm chất lượng và agent CLI |

## Bắt đầu nhanh

Máy cần Node.js 22.18 trở lên, ffmpeg kèm ffprobe. Muốn dùng đạo diễn AI thì cần thêm Claude Code (`claude`) đã đăng nhập.

```bash
git clone https://github.com/abm-dungtq/motion-studio ~/Projects/motion-studio
cd ~/Projects/motion-studio && npm run setup
node bin/motion-studio.mjs start --background
```

Mở `http://127.0.0.1:4317`.

`npm run setup` build giao diện và so provider mặc định, plugin [opus-video](https://github.com/abm-dungtq/opus-video), với bản phát hành mới nhất trên GitHub. Nếu chưa cài hoặc đã cũ, Studio hỏi "Cài/cập nhật opus-video bản mới nhất? [Y/n]". Git checkout được cập nhật bằng `git pull --ff-only`. Nếu checkout còn thay đổi chưa commit hay đang ở nhánh khác thì Studio không đụng tới. Các trường hợp còn lại chạy installer chính thức của plugin, installer cất bản cũ trước khi cài. Tham số: `--yes` (không hỏi), `--ref <nhánh hoặc tag>`, `--host claude|codex|all`.

```bash
node bin/motion-studio.mjs status                 # running <url> … | stopped
node bin/motion-studio.mjs stop                   # dừng server và mọi job
node bin/motion-studio.mjs start --background --root <thư mục chứa các dự án>
```

Mỗi dự án là một thư mục con có `project.json`. Thư mục gốc lấy theo thứ tự: `--root`, `MOTION_STUDIO_ROOT`, rồi thư mục gốc của lần chạy trước.

### Nâng cấp từ 1.x

Bản 2.0 viết lại giao diện bằng React, TypeScript, Tailwind và shadcn/ui, theme tối theo kiểu phần mềm dựng. Sau khi pull, chạy `npm run setup` một lần. Thư mục `public/` đã bỏ, nên extension giao diện giờ nằm ở `ui/src/ext/<tên>/index.ts` (xem [docs/extensions.md](docs/extensions.md)). Cần Node.js 22.18 trở lên.

## Timeline

Kéo chuột chỉ xem trước tại chỗ. Thả ra thì Studio gửi đúng một patch, thành một phiên bản mới.

- **SFX:** kéo khối để dời. Chuột phải chọn "Thêm SFX tại đây…" để lấy file trong dự án hoặc `shared-assets/sfx/`. Phím Delete chỉ xoá SFX thêm từ Studio; SFX do đạo diễn đặt thì có nút "Nhờ đạo diễn".
- **Nhạc:** kéo thân khối để dời, kéo mép để cắt đầu hoặc cuối. Inspector chỉnh âm lượng, fade vào và fade ra. Fade chỉ nghe được trong video xuất.
- **Cắt shot:** chọn shot, đặt playhead bên trong rồi bấm S. Shot mới để trống, Studio đưa nút "Nhờ đạo diễn dựng shot mới".
- **Hít** (phím N hoặc nút "Hít") vào playhead, mép shot, câu thoại, SFX, phách nhạc và đầu từ.
- **M/S** trên nhãn track tắt tiếng hoặc solo track đó, chỉ trong player.
- **Chip cổng** cạnh menu Xuất bản báo "Cần duyệt lại animatic" hoặc "Chưa đủ cổng xuất"; bấm vào để mở thẻ duyệt hoặc danh sách lỗi.

### Phím tắt

Phím tắt tạm tắt khi con trỏ đang ở ô nhập liệu, khi đang mở hộp thoại hay menu, hoặc khi focus nằm trên rail tab. Alt+1…9 chọn tab trên rail.

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| J / K / L | Lùi một giây / dừng / phát |
| ← / → | Lùi / tới một khung |
| Shift+← / Shift+→ | Lùi / tới một giây |
| Home / End | Về đầu / cuối video |
| S | Cắt shot đang chọn tại playhead |
| Delete / Backspace | Xoá SFX đang chọn (chỉ SFX thêm từ Studio) |
| N | Bật / tắt hít |
| R | Đổi chế độ kéo mép shot: Ripple (video dài hay ngắn theo) hoặc Roll (chỉ dời điểm cắt) |
| Shift+kéo câu thoại | Dời câu đó cùng các câu sau nó trong shot |
| = hoặc + / - | Phóng to / thu nhỏ timeline |
| Shift+Z | Vừa khung |
| Cmd/Ctrl+Z | Hoàn tác |
| Cmd/Ctrl+Shift+Z, Ctrl+Y | Làm lại |

Chi tiết ở [docs/timeline.md](docs/timeline.md).

## Xuất sang phần mềm dựng

Mục "Xuất bộ lớp dựng" trong menu Xuất bản tách dự án thành các lớp để bạn dựng tiếp trong CapCut, Final Cut Pro, Premiere hay DaVinci Resolve:

```bash
node bundle.mjs --project <thư mục dự án> [--ratio 9x16] [--source <mp4 đã render>] [--out <thư mục>]
```

Thư mục `renders/<dự án>-<thời điểm>[-<tỉ lệ>]-bundle/` gồm:

- `shots/NN-<shot>.mp4`: hình từng shot, H.264 CRF 12, không tiếng, cắt đúng khung theo mốc shot;
- `audio/mix.wav`, `voice.wav`, `music.wav`, `sfx.wav`: tiếng tổng và tiếng tách theo vai, 48 kHz, dài bằng video;
- `captions.srt`, câu dài được tách theo mốc từng từ;
- `manifest.json` (schema `motion-studio/bundle@1`);
- `timeline.fcpxml` (Final Cut Pro, DaVinci Resolve), `timeline.xml` (Premiere, Resolve) và `timeline.otio` (OpenTimelineIO): các shot nối theo thứ tự, mỗi stem tiếng một track, marker cho câu thoại và SFX. Chi tiết và giới hạn: [docs/nle-export.md](docs/nle-export.md).

Chuyển cảnh nằm sẵn trong hình của các shot nó vắt qua, nên giữ thứ tự và độ dài shot thì nối lại liền mạch.

## Thư viện mẫu

Tab Thư viện mẫu có bốn mục: video mẫu, cảnh mẫu, phong cách và prompt mẫu. Tìm được bằng tiếng Việt có dấu hay không dấu, hoặc bằng tiếng Anh. Chưa mở dự án vẫn xem và chép prompt được; khi đã mở dự án, nút "Dùng cho dự án" gửi mẫu kèm phần giải thích cho đạo diễn.

Ảnh bìa không nằm trong repo. Tải một lần (khoảng 25 MB) về `~/.cache/motion-studio/library/thumbs`:

```bash
node scripts/library-thumbs.mjs
```

Nguồn, giấy phép và cách dựng lại dữ liệu ghi trong [library/SOURCES.md](library/SOURCES.md).

## Cho nhà phát triển

<details>
<summary><b>Chỗ cắm mở rộng</b></summary>

Thêm tính năng bằng cách thêm file, không sửa `server.mjs` hay khung giao diện trong `ui/src/shell/`:

- `routes/*.mjs`: route HTTP. Route của Studio luôn được thử trước; đường trùng làm Studio báo lỗi lúc khởi động.
- `ui/src/ext/<tên>/index.ts`: export `register(studio)` rồi gọi `registerTab`, `registerSection`, `registerInspectorSection`, `registerAgentRows` hoặc `registerTimelineDecorator`.
- `lib/tools/*.mjs`: tool cho đạo diễn AI và MCP client.
- `lib/quality/*.mjs`: bài kiểm chạy trên mọi file Studio tạo ra; kết quả nằm trong `<dự án>/.opus/receipts/`.
- `lib/agents/cli/*.mjs`: agent CLI trên máy (claude, codex, codex-pool, agy, gemini, cursor-agent, opencode) để viết chữ, đọc ảnh và sinh ảnh.

Ví dụ chạy được: [docs/extensions.md](docs/extensions.md). Agent và thứ tự thử: [docs/agents.md](docs/agents.md). MCP: [docs/mcp.md](docs/mcp.md). Biên nhận: [docs/receipts.md](docs/receipts.md). Ảnh và clip AI cho shot qua gflow-cli (Google Flow): [docs/videogen.md](docs/videogen.md).

</details>

<details>
<summary><b>Provider và tương thích</b></summary>

Mọi thứ Studio cần từ bên ngoài đi qua `lib/provider.mjs`: đọc và kiểm `project.json`, cổng lệnh (patch, hoàn tác, làm lại, lịch sử), hàng đợi yêu cầu cho đạo diễn, tool và đoạn prompt cho `claude -p`, đường các lệnh (render, mix, pitch, import, demo, preflight, timing…) và file thư viện. Hợp đồng ghi ở đầu file đó.

Adapter nằm trong `lib/providers/`, mỗi provider một file đi kèm Studio; Studio không nạp mã từ ngoài repo. Hiện có `lib/providers/opus-video.mjs`. Provider nạp lười: thiếu hay không tương thích thì server vẫn chạy, `GET /api/status` nói rõ lỗi, còn các route cần provider trả 503 kèm lý do. Cài provider xong không cần khởi động lại.

| Motion Studio | opus-video | `STUDIO_API` |
|---|---|---|
| 1.0.x | 2.1.0 trở lên, dưới 3.0 | 2 |
| 1.1.x | 2.3.0 trở lên, dưới 3.0 | 3 |
| 2.0.x | 2.3.0 trở lên, dưới 3.0 | 3 hoặc 4 |

</details>

<details>
<summary><b>Biến môi trường</b></summary>

| Biến | Dùng để |
|---|---|
| `MOTION_STUDIO_ROOT` | Thư mục chứa các dự án |
| `MOTION_STUDIO_PORT` | Cổng (mặc định 4317), để chạy một Studio thử cạnh Studio thật; đặt kèm `MOTION_STUDIO_STATE` riêng |
| `MOTION_STUDIO_STATE` | File trạng thái (mặc định `~/.config/motion-studio/studio.json`, chmod 600) |
| `MOTION_STUDIO_COMPRESS` | Lệnh nén sau khi xuất (mặc định `<root>/scripts/compress-final.sh`) |
| `MOTION_STUDIO_PROVIDER` | Provider trong `lib/providers/` |
| `MOTION_STUDIO_HOME` | Nơi shim của provider tìm Studio |
| `MOTION_STUDIO_HF_RUNTIME`, `MOTION_STUDIO_HF_SKILLS` | File HyperFrames runtime cho player; thư mục skill HyperFrames (mặc định `~/.claude/skills`) |
| `MOTION_STUDIO_AGENT_PATH` | Đường tìm agent CLI; đã đặt thì Studio chỉ tìm ở đó |
| `MOTION_STUDIO_GWS` | File chạy `gws` dùng để tải lên Google Drive |
| `MOTION_STUDIO_CACHE`, `MOTION_STUDIO_BROLL_CACHE`, `MOTION_STUDIO_LEMO_CACHE`, `MOTION_STUDIO_THUMBS` | Thư mục cache (mặc định trong `~/.cache/motion-studio/`) |
| `OPUS_VIDEO_HOME` | Thư mục plugin opus-video (chỉ provider mặc định đọc); đã đặt thì Studio chỉ dùng thư mục đó |

Tên cũ `OPUS_STUDIO_ROOT`, `OPUS_STUDIO_STATE`, `OPUS_COMPRESS_FINAL` và `OPUS_HF_RUNTIME` vẫn chạy, mỗi tên cảnh báo một lần. Thư mục gốc dự phòng cũ `/Volumes/2/Edit-Video` cũng vậy. Cả hai đã lỗi thời và sẽ bị bỏ ở một bản lớn sau. `OPUS_STUDIO_RUNNER` và `OPUS_STUDIO_REQUEST` giữ tên vì là giao thức với MCP server của plugin.

</details>

<details>
<summary><b>Test</b></summary>

```bash
npm test
```

Phần lớn test cần provider mặc định đã cài (plugin ở chỗ khác thì đặt `OPUS_VIDEO_HOME`). `tests/no-provider.test.mjs` và `tests/config.test.mjs` chạy được khi chưa có provider.

</details>

Lịch sử đầy đủ ở [CHANGELOG.md](CHANGELOG.md).

## Hợp tác

Motion Studio miễn phí và mã nguồn mở theo giấy phép MIT. Nếu bạn cần cài đặt cho đội của mình, viết provider cho quy trình riêng, thêm tab hay tool theo yêu cầu, hoặc cần hỗ trợ làm video bằng Studio, hãy [mở issue](https://github.com/abm-dungtq/motion-studio/issues) hoặc liên hệ qua [@abm-dungtq](https://github.com/abm-dungtq) trên GitHub.

## Giấy phép

MIT, xem `LICENSE`. Các phong cách lemo-opuscar dùng giấy phép MIT, ảnh theo CC BY 4.0 (ghi công LemoLab); nguồn dữ liệu thư viện mẫu và giấy phép của chúng ghi trong [library/SOURCES.md](library/SOURCES.md).
