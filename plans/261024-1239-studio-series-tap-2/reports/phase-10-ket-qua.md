# Phase 10: kết quả (2026-10-24, Asia/Saigon)

Trạng thái: xong. Có bốn chỗ lệch so với phase, ghi ở cuối. Phụ đề của a-99 bị cổng viet-pro thật chặn, đúng như thiết kế.

## opus-video

PR [#9](https://github.com/abm-dungtq/opus-video/pull/9) "feat(delivery): phụ đề từ words.json, lệnh giao nộp trong COMMANDS" đã squash vào main `6ae4fbf`. Thân commit không có dòng ghi công, nhánh đã xoá.

- `scripts/captions-from-words.mjs` (mới) cùng test:
  - Đọc lời và mốc từ (words) của từng câu, gom thành khối phụ đề: mỗi khối tối đa 42 ký tự mỗi dòng, 2 dòng, dài 1–6 giây.
  - Câu thiếu words thì chia đều thời gian và in một dòng WARN.
  - Không ghi đè file ra.
- `COMMANDS` có thêm `export`, `vietPro`, `captions`, `platform`. Đường viet-pro tìm bằng `findSkill`, không viết cứng.
- `VOICE_DENIED_TOOLS` chặn `eleven.mjs tts*` và `eleven.mjs audio-meta*`. Không bump `STUDIO_API`.
- Mô tả của `project_patch` trong `mcp/server.mjs` liệt kê mọi op, có cả `set_scenes`, `set_line_speaker`, `set_line_audio`.
- Kết quả kiểm:
  - Test plugin: 589 pass.
  - `a01_import` trên main: exit 0, không có WARN mới.
  - SRT tạo từ bản chép a-01: 186 khối.

## Motion Studio

PR [#32](https://github.com/abm-dungtq/motion-studio/pull/32) đã squash vào main `7db2350`. Worktree `~/.cache/ms-tap2/ms-delivery` đã gỡ, nhánh local và nhánh remote đã xoá. `/Volumes/2/Motion-Studio` không bị đổi nhánh.

- `lib/delivery.mjs` và `routes/delivery.mjs`:
  - Lấy `{N}` từ `episode:` trong BRIEF.
  - `placeCopy` không ghi đè: cùng sha thì coi như đã giao, khác sha thì thêm `-2`, `-3`, gặp symlink thì trả 409.
  - Mỗi lần giao ghi biên nhận `deliver-*` có tên, cỡ, sha256.
  - Bước dài (export, thumbnail, drive) chạy thành job qua runner `node lib/delivery.mjs run <bước>`.
  - Lỗi của bước giao nộp được đếm ở phía server, nên bấm trên giao diện cũng được tính.
- `lib/drive.mjs`:
  - Các bước theo thứ tự: kiểm tài khoản bằng `about get`; tìm thư mục ở gốc, chưa có thì tạo; tải bằng `--upload` với cwd là thư mục giao nộp; so kích thước.
  - `dry_run` thêm `--dry-run` của gws cho mọi lệnh ghi.
  - Biên nhận chỉ giữ các trường đã chọn.
- `lib/handoff.mjs` và `routes/handoff.mjs`:
  - Lỗi hai lần liền cùng mã thì ghi `.opus/handoff/<bước>.md` và biên nhận `handoff`.
  - Dòng `resolved:` đóng thẻ.
  - Đã bọc các tool `series_tool`, `asset_batch`, `series_tts`, `scene_rebuild`. Câu bị cổng chặn không tính là lỗi.
- `lib/tools/delivery.mjs`: `deliver_text`, `deliver_captions`, `deliver_export`, `deliver_thumbnail`, `delivery_status`, `drive_upload`.
- Chặn giọng:
  - `director.voiceDeniedTools` của provider được nối vào `--disallowedTools` khi dự án thuộc series.
  - Luật prompt nhắc thêm `drive_upload`.
- Giao diện:
  - `DeliveryPanel.tsx` (order 35 trong "export") có năm dòng, thẻ đồng ý nằm dưới dòng Thumbnail và dòng Drive. Chọn thumbnail và nút "Nhờ đạo diễn sửa" cũng ở đây.
  - `HandoffCard.tsx` (order 3 trong "director").
- Test `npm test`:
  - node: 476 test (474 pass, 2 skip, 0 fail).
  - vitest: 275/275.
  - tsc: sạch.
  - check-ownership: 6/6.
- Các file test mới:

  | File | Số test |
  |---|---|
  | `tests/delivery.test.mjs` | 8 |
  | `tests/drive-upload.test.mjs` | 6 |
  | `tests/handoff.test.mjs` | 4 |
  | `ui/src/ext/series/delivery-handoff.test.tsx` | 7 |

## Probe chặn giọng (`claude -p --model haiku`)

| | `eleven.mjs tts --help` | `eleven.mjs sfx --help` |
|---|---|---|
| Có luật chặn | Từ chối: "Permission to use Bash … has been denied" | Chạy, in trợ giúp |
| Không có luật (đối chứng) | Chạy | Chạy |

## Series S

- Đã sao lưu `studio-series.json` và `make-thumbnail.py` vào `/Volumes/2/Hoạt hình/plans/backups/song-lag-phase10-20261024/`.
- `kenh-youtube/make-thumbnail.mjs` (mới): bọc `parseArgs`, chạy `python3 make-thumbnail.py`, không ghi đè.
- `make-thumbnail.py` nhận đối số thứ 6 là nhãn góc trên. Mặc định giữ "SÓNG LAG · TẬP 1" như cũ.
- Khai báo `make-thumbnail` có thêm cờ `--tag`. Ngoài khóa này, phần còn lại của file giống hệt bản sao lưu. `validateSeries` trả `[]`.
- Thử tay trên ảnh gốc của tập 1: ra JPEG 1280×720, nhãn "SÓNG LAG · TẬP 2". Chạy lần hai trả exit 2 (không ghi đè).
- Test S: 55 pass.
- Không tạo `tap-99` hay `tap-2` trong S thật.

## Kiểm tích hợp (Studio thử 4420, root `$T/root`, a-99 trỏ `$T/series-gia`)

Series giả được sửa như sau, bản cũ lưu ở `$T/p10/series-gia.before.json`:
- `delivery_dir` là `kenh-youtube/tap-{N}`;
- thêm `make-thumbnail`, chép từ S;
- thêm `build-rig` giả;
- thêm `image_styles.thumbnail`;
- thêm bản nháp `kenh-youtube/tap-99-tieu-de-mo-ta.md`.

Kết quả từng bước:
- `deliver_text`:
  - check-platform youtube và lint viet-pro thật đều qua (1 WARN oxford-comma).
  - Ra `tap-99/tieu-de-mo-ta.md`, có mốc chương `0:00 Mở đầu` và `0:05 Kết` chèn trước `## tags`.
- `deliver_captions`:
  - Cổng viet-pro `--stage delivery` thật chặn, vì a-99 là mẫu tập chưa có bản ghi `## viet_pro` và chưa có `script-table.md`. Không chép gì.
  - Không làm giả bản ghi viet_pro để lách cổng.
  - Lần đầu, a-99 (không có câu lồng tiếng) ra SRT rỗng. Đã sửa: SRT rỗng giờ trả `no-cues` và không chạy cổng; kiểm lại trên Studio thử ra đúng `no-cues`.
- `deliver_thumbnail`:
  - Gọi tool chỉ tạo thẻ codex "3 ảnh nền thumbnail, ước 3 lượt vẽ (tối đa 12 lượt Codex gồm tự kiểm)". Log CLI giả không có dòng exec nào trước khi đồng ý.
  - Đồng ý thẻ: job `asset-batch` exit 0, ra 3 ảnh `delivery/thumb-*.jpg`.
  - Chọn ảnh 1: ra `tap-99/thumbnail.jpg`, nhãn "SERIES THỬ · TẬP 99".
- `drive_upload` qua gws giả:
  - Thẻ "Tải 2 file (0.1 MB) lên Drive som…@example.com/thu". Trước khi đồng ý không có lệnh gws nào chạy.
  - Đồng ý thẻ: tạo thư mục `thu`, 2 file khớp kích thước.
- `drive_upload { dry_run: true }` với gws thật:
  - Studio khởi động lại với `MOTION_STUDIO_GWS=~/.local/bin/gws`. `drive.account` của series giả lấy email gws trong mã, không in ra.
  - Kết quả `ok`, account `xao…@gmail.com`, `folder_created: true` (chạy khô), mỗi file "chạy khô: gws nhận lệnh". Không có gì được ghi lên Drive.
  - Sau đó trả `drive.account` của series giả về `someone@example.com`.
- `series_tool build-rig --char khong-co`:
  - Chạy hai lần: lần hai trả `handoff`, và `GET /api/handoff` có thẻ `build-rig`.
  - `POST /api/handoff/resolve` trả 200, sau đó danh sách thẻ rỗng.
  - File handoff không có biến môi trường hay khóa.
- Quét `.opus` của a-99 tìm `access_token`, `sk-`, `sk_`, `ya29.` và email chưa che: OK-NO-TOKEN.
- Dọn dẹp:
  - Studio thử đã dừng (OK-STOPPED). 4317 vẫn là pid 82168.
  - BRIEF của a-99 đã trả về bản trước (`$T/p10/a-99-BRIEF.before.md`).
- Không tốn lượt Codex, ElevenLabs. Không tải gì lên Drive thật.

## Lệch so với phase

1. Bảng chọn thumbnail nằm trong bảng Giao nộp (`DeliveryPanel`, `POST /api/delivery/thumbnail/pick`), không ở tab Tài sản qua `Board.tsx`:
   - AssetsTab và Board không thuộc phần sở hữu của phase;
   - AssetsTab ghi rõ "thumbnails need no board".
2. Action `thumbnail` và `drive-upload` được đăng ký trong `routes/delivery.mjs`, theo cách `routes/assets.mjs` và `routes/voice.mjs` đang làm. `lib/consent.mjs` không đổi.
3. `make-thumbnail.py` của S nhận thêm đối số nhãn (đã sao lưu), và khai báo có thêm cờ `--tag`. Lý do: script viết cứng "SÓNG LAG · TẬP 1", nên tập 2 trở đi sẽ mang nhãn sai.
4. Drive bỏ qua file đã có trên Drive cùng tên và cùng cỡ, để lần tải sau không tạo bản trùng.
5. `deliver_export` chỉ xuất các nền tảng còn thiếu file: `export.mjs` thoát mã 2 khi file ra đã có.

## Còn mở

- Checkpoint 06–07 mục 4 khuyên làm PR `fix(assets)` trước phase 10. Việc này chưa làm, chờ người dùng quyết.
- Phụ đề và CAPTIONS.md chỉ giao được khi tập có bản ghi viet_pro đầy đủ. Tập thật (a-02) cần đạo diễn hoàn tất bước viet-pro trước khi chạy `deliver_captions`.
