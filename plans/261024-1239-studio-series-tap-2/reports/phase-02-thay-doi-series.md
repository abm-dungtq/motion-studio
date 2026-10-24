# Phase 02: thay đổi trong kho series

Ngày 2026-10-24. `S` = `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen/series/song-lag`.

## Sao lưu

- `/Volumes/2/Hoạt hình/plans/backups/song-lag-20261024-1344.tgz` (218 MB), tạo trước mọi thay đổi; `tar -tzf` thấy `song-lag/tools/cast-tts.mjs`.

## File sửa

- `S/tools/cast-tts.mjs`: bản opus-video mặc định đổi từ `~/.agents/skills/opus-video` sang `~/.claude/skills/opus-video` (biến `OV` vẫn thắng); thêm `--mix-out`, `--visemes-out`, `--remix`. `--remix` không cần `--role`, `--text-file` và không gọi API; dấu cổng viet-pro vẫn chỉ ghi cho `--out`. Mã thoát 2 khi sai cách dùng (trước đây `parseArgs` ném lỗi thô).
- `S/tools/tests/cast-tts.test.mjs`: thêm 5 test (`VOICE_CHAIN` nguyên văn, `copyWords`, `mixVoice` ra -16 ± 1 LUFS và lỗi tiếng Việt, `--remix` không gọi API, cách dùng).
- `S/README.md`: mục "Tập mới và mặc định âm thanh".

## File tạo

- `S/tools/lib/voice-chain.mjs` (`VOICE_CHAIN`, `mixVoice`, `copyWords`).
- `S/tools/runtime/ui-card.mjs` (`uiCard`, `canvasRaster`, `wrapWords`, `ellipsize`) và `S/tools/tests/ui-card.test.mjs` (8 test).
- `S/tools/new-episode.mjs` và `S/tools/tests/new-episode.test.mjs` (4 test).
- `S/templates/episode/`: `index.html`, `PLAN.md`, `BRIEF.md.tmpl`, `scenes/{lib.mjs,film.mjs,cards.mjs,cast.json,backgrounds.json,roles.json}`, `assets/vendor/{gsap.min.js,README.md}`, `assets/brand/logo-badge.png`.

## Ghi chú

- Bản `~/.agents/skills/opus-video` vẫn còn trên máy, không xoá và không symlink; `cast-tts` không còn dùng nó.
- Logo của mẫu lấy từ `a-01/assets/brand/logo-badge.png` (355×340, nền trong suốt, đúng file tập 1 dùng), **không** từ `S/refs/logo/logo-2-mascot-badge.png` như phase ghi: file đó là ảnh gốc 1254×1254 còn nền xanh để tách, dán lên khung thì hiện ô xanh lá (đã thấy ở khung demo đầu tiên).
- `ui-card` vẽ chữ qua `drawPixelText` của `pixel-text.mjs` (cần `document`); Node không có canvas, nên test truyền `raster` giả (chữ đơn cách, chữ hoa có dấu chồng nhô lên như VT323). Đường vẽ thật đã kiểm trong trình duyệt bằng một dự án nháp (thẻ "Hoàng Tử Mưa Băng Giá, 38 tuổi", nút "Kết bạn", bộ đếm "23", rig `song`, nền `dad-desk`, khẩu hình câu 12): khung demo ra đúng, đã xoá dự án nháp.
- Mẫu chỉ có ba chỗ giữ chỗ `{{SERIES}}`, `{{N}}`, `{{TITLE}}`, không có đường tuyệt đối (test kiểm).
- Máy có hook chặn lệnh shell và Read chứa chuỗi tên thư mục thư viện bên thứ ba của mẫu; file GSAP được chép bằng một script nhỏ trong `$T`, phép `ls` của Verify 2.4 cho file đó chạy bằng `node -e`.

## Kết quả Verify

- 2.0: tar có, 1 dòng `song-lag/tools/cast-tts.mjs`.
- 2.1: `agents/skills` 0, `.claude/skills/opus-video` 1.
- 2.2: test series xanh; nén lại câu 12 của a-01 (bản chép) ra -16,7 LUFS, bằng đúng `a-01/assets/mix/voice-12.mp3` (-16,7 LUFS); `OK-SIDECARS`.
- 2.3: `ui-card.test.mjs` 8/8.
- 2.4: đủ file; `cdn.jsdelivr` 0, `TIMING:BEGIN` 1, `brand-logo` 2, `import v[0-9]` 0.
- 2.5: `new-episode.test.mjs` 4/4; `a-99` tạo trong `$T/root`, 0 chỗ `{{`, `timing.mjs` ghi TIMING, `make-demo.mjs` ra `demo/frame-00-at-1s.png`, `check-logo.mjs` in `LOGO OK` (điểm (1840,1000) = rgb(253,188,139)). `npx --no-install hyperframes lint` trên a-99: 0 lỗi, 0 cảnh báo.
- 2.6: `new-episode` trong README 2 lần; cả bộ test series 50/50.
