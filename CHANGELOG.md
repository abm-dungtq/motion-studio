# Changelog

## Chưa phát hành

- Tab Phong cách: 59 phong cách code của lemo-opuscar (MIT; ảnh CC BY 4.0, ghi công LemoLab) trong 11 nhóm, tên tiếng Việt, tìm kiếm, ảnh khung. Áp cho cả dự án hoặc từng shot; watercolor và glass-product thành lớp canvas qua provider. Đạo diễn soạn được phong cách riêng, "Giữ phong cách" lưu vào `~/lemo-my-styles/`. Bản tải về ghim commit, coi là dữ liệu, không chạy script nào trong đó.
- Thư viện chuyển cảnh 54 mục (seam opus-video, gói Studio, HyperFrames) trong inspector của shot, có trang xem thử. Bốn gói anime tất định: `impact-frame`, `smear-cut`, `ink-wipe`, `speed-lines`. "Sửa clip": cắt đoạn, đổi tốc độ, đứng hình, LUT hoặc preset màu, cắt khung 9:16 / 16:9 / 1:1 / 4:5, ra `footage/cut/` kèm biên nhận. Xem `docs/transitions-and-effects.md`.
- Chỉ mục B-roll theo hash nội dung (tab Footage): tách shot, contact sheet gộp nhiều shot cho mỗi lượt agent ảnh (mặc định agy), cache nên lần chạy sau không gọi agent và không giải mã lại. Tìm có dấu và không dấu, "Đặt vào shot" cắt clip vào `assets/broll/` và hoàn tác được. Cài đặt ở khoá `broll` của `studio.json` (`asr` mặc định tắt). Xem `docs/broll-index.md`.
- Timeline: Roll/Ripple ở mép shot (phím R), Shift+kéo câu thoại dời cả các câu sau, nhạc chồng nhau tách làn, SFX xếp tối đa 4 tầng, làn B-roll nhận footage thả vào (chép vào `assets/footage/`, không ghi đè). Waveform và thumbnail cache trong IndexedDB; mốc phách và mốc từ kéo được, có hoàn tác và kiểm khớp lời. Popover agent có `max-height`. Xem `docs/timeline.md`.
- Tab Anime cho video anime motion-comic: board shot đọc `assets/anim/manifest.json`, sinh biến thể tư thế qua agent ảnh (tách nền xanh, có biên nhận), sửa track lipsync/blink/wind/keys trên UI rồi build ra `anim-data.js` tất định. Mẫu `templates/anim/`, tool `anime_*`. Xem `docs/anime-motion-comic.md`.
- Bộ tool chung qua MCP (`mcp/studio-mcp.mjs`, profile `external` và `director`): `project_*`, `receipts_list`, `receipt_get`, `media_check`. Biên nhận có verdict `pass`/`warn`/`fail` từ chín kiểm chất lượng (ngưỡng ở khoá `quality` của `studio.json`), hiện ở tab Xuất bản và inspector. `/api/mcp/config` trả lệnh nối cho claude, codex, agy, opencode. Xem `docs/mcp.md`, `docs/receipts.md`.
- Bộ lớp dựng ghi thêm `timeline.fcpxml` (FCPXML 1.10, `--fcpxml-version 1.8`), `timeline.xml` (xmeml v5) và `timeline.otio` (OpenTimelineIO), mở thẳng trong Final Cut Pro, Premiere và DaVinci Resolve. `manifest.json` giữ schema `motion-studio/bundle@1`, thêm trường `nle`. Cờ `--nle fcpxml,xmeml,otio | none`; tool `nle_export`. Xem `docs/nle-export.md`.
- `npm run setup` (`node bin/motion-studio.mjs setup [--yes] [--ref <ref>] [--host claude|codex|all]`): kiểm provider mặc định so với bản mới nhất trên GitHub (`git ls-remote` + `plugin.json`), báo chưa cài / cũ / đã mới nhất, hỏi [Y/n] rồi cài hoặc cập nhật. Git checkout được `pull --ff-only` (từ chối khi bẩn hay khác nhánh); bản sao thì chạy `install.sh` chính thức. Sau khi cài, Studio kiểm lại `STUDIO_API`. `start` và banner "chưa có provider" nhắc lệnh này; `/api/status` có trường `setup`.
- Với `STUDIO_API` 4, Studio dùng `COMMANDS` (đường lệnh; `COMMANDS.choose = { file, args }` với `{project}`, `{pick}` cho thẻ chọn hướng) và `SKILLS` (dòng skill trong prompt đạo diễn) do plugin khai. Không có thì dùng tên file và cú pháp `make-pitch choose` như trước.

- Ranh giới provider: Studio lấy mọi thứ của plugin qua `lib/provider.mjs`. Plugin opus-video là provider mặc định, bọc trong `lib/providers/opus-video.mjs`, file duy nhất còn tên plugin; `lib/plugin.mjs` bị bỏ. Schema `opus-video/project@1` giữ nguyên. Adapter nhận `STUDIO_API` 3 và 4.
- Studio khởi động được khi chưa có provider: provider nạp lười ở lần đầu cần. `GET /api/status` mới trả `{ ok, provider, error, hint }`; `/api/agent` thêm `provider` và `provider_error`; chip agent đỏ và trang hiện hướng dẫn; route cần provider trả 503 kèm lý do.
- `OPUS_VIDEO_HOME` đã đặt thì Studio chỉ dùng thư mục đó. Trước đây đường sai bị bỏ qua và Studio lặng lẽ dùng `~/.claude/skills/opus-video`.
- Biến môi trường mới: `MOTION_STUDIO_ROOT`, `MOTION_STUDIO_STATE`, `MOTION_STUDIO_COMPRESS`, `MOTION_STUDIO_HF_RUNTIME`, `MOTION_STUDIO_PROVIDER`. Tên cũ `OPUS_STUDIO_ROOT`, `OPUS_STUDIO_STATE`, `OPUS_COMPRESS_FINAL`, `OPUS_HF_RUNTIME` vẫn chạy, mỗi tên cảnh báo một lần, và **bỏ ở 2.0**. `OPUS_STUDIO_RUNNER`/`OPUS_STUDIO_REQUEST` (giao thức với MCP server của plugin) giữ nguyên.
- File trạng thái chuyển sang `~/.config/motion-studio/studio.json`. Lần đầu Studio chép `~/.config/opus-video/studio.json` sang (chmod 600), không xoá file cũ.
- Thư mục gốc mặc định: `--root`, `MOTION_STUDIO_ROOT`, thư mục gốc của lần chạy trước (giữ trong file trạng thái qua stop/start), rồi `/Volumes/2/Edit-Video`. Đường cứng này **bỏ ở 2.0**. Thư mục gốc không tồn tại thì `start` báo rõ và thoát mã 2.
- Lệnh nén sau Xuất video mặc định là `<root>/scripts/compress-final.sh` của workspace đang mở, không còn ghim `/Volumes/2/Edit-Video`.
- Giao diện và prompt không còn ghi cứng tên plugin: tiêu đề trang "Motion Studio", nhãn nguồn trong Thư viện mẫu lấy từ provider (`source`, `source_label`), đoạn prompt riêng của plugin do adapter cung cấp.

- Thư viện mẫu làm lại: bốn mục Video mẫu, Cảnh mẫu, Phong cách, Prompt mẫu, có ảnh bìa và giải thích tiếng Việt. Dữ liệu gộp từ sáu repo GitHub về video Claude Opus 5.5 (khoảng 1.250 video, 200 video tuyển chọn có giải thích đầy đủ, 37 kỹ thuật cảnh, 12 công thức phong cách, khung prompt và bộ công cụ đạo diễn). Tìm không dấu, lọc thể loại, xem thêm theo trang, chép prompt khi chưa mở dự án. API mới `GET /api/library`; ảnh bìa tải bằng `scripts/library-thumbs.mjs`.
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
