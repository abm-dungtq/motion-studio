# Vá đường của công cụ series (2026-10-24)

Kết quả: PR https://github.com/abm-dungtq/motion-studio/pull/25 đã squash-merge vào `main` @ `42fefcb`. Thân commit sạch, không có trailer.

## Đã sửa trong Motion Studio

- `lib/series-run.mjs`: kiểm thư mục `read` giờ nằm trong `value()`, chỗ xử lý giá trị dùng chung cho cờ và đối số vị trí. Vì vậy `positional: "path:read*"` không còn đọc được `S/tools/*`, `S/studio-series.json`. Thư mục `read`/`writes` có `{char}` chỉ mở khi lần chạy có nhân vật (`char` của yêu cầu hoặc `--char`); không có nhân vật thì bỏ qua, không trả 400. Nhờ vậy đợt vẽ ảnh (không truyền char) vẫn chạy được `import-sprite`.
- `lib/series.mjs`: `seriesFor` trả 400 khi realpath của thư mục series nằm trong realpath của dự án. Đã thử với `series: ./x`, `series: .` và dự án là symlink.
- `routes/series.mjs`: `series/put` kiểm đích bằng lstat. Đích là symlink, kể cả symlink hỏng, thì trả 400. Đích không phải file cũng trả 400. File mới và `.bak-` tạo bằng `COPYFILE_EXCL`. Hàm `taken` của route episode dùng chung helper lstat này.
- `docs/series.md`: ghi thêm các luật trên.
- Test (`tests/series-tool.test.mjs`, fixture thêm `read-list` và `sprite`): thêm 4 test, cả 4 trượt trên mã cũ. Kết quả `npm test`: node 435 test, 433 pass, 2 skip sẵn có, 0 fail; ui 40 file, 240 pass.

## Kho series S

- Đã sao lưu bản gốc vào `/Volumes/2/Hoạt hình/plans/backups/song-lag-fix-guards-261024/studio-series.json`.
- `import-sprite.writes` đổi từ `["{project}/assets/gen", "characters"]` thành `["{project}/assets/gen", "characters/{char}/poses"]`. Chọn `poses` thay vì cả `characters/{char}`: `import-sprite` chỉ ghi `.pxl` tư thế, nên `src/hd-poses.mjs` của chính nhân vật đó cũng không bị ghi đè.
- Kiểm `validateSeries` của `$OVC` in `SERIES OK`. Bản `$OVI` chưa có `validateSeries`, đúng dự kiến (phase 11 mới cập nhật). Test series `tools/tests` 50/50 pass.
- Probe `buildArgv` trên khai báo thật: cờ của đợt vẽ ảnh qua được, `writes` chỉ còn `P/assets/gen`. `--out S/characters/bo/src/hd-poses.mjs` bị 400 (có hay không có `char`). Ghi vào `bo/poses` với `char: me` bị 400, với `char: bo` thì qua. `tests/asset-batch.test.mjs` 7/7 pass.

## Sự cố

Cây làm việc `/Volumes/2/Motion-Studio` dùng chung với executor phase 05. Lệnh `git checkout -b` đầu tiên của tôi đã đẩy cây đó từ `feat/asset-board` sang nhánh fix. Đã trả lại `feat/asset-board` ngay, thay đổi chưa commit của phase 05 (`gates.mjs`, `tests/studio-gates.test.mjs`) còn nguyên vì hai nhánh cùng ở `bcb7478`. Phần còn lại làm trong worktree riêng, worktree đã gỡ. Người điều phối đã được báo.
