# Phase 09: kết quả (2026-10-24, Asia/Saigon)

Trạng thái: xong, có một lệch đã ghi lại (`film-stills`, xem `phase-09-su-co.md`).

## Motion Studio

PR [#31](https://github.com/abm-dungtq/motion-studio/pull/31) "feat(scenes): dựng lại một cảnh, duyệt nhóm cảnh, thẻ nghe lại", squash vào main `ab81a79`. Worktree `~/.cache/ms-tap2/ms-scenes` đã gỡ, nhánh local đã xoá. Không đổi nhánh của `/Volumes/2/Motion-Studio`, không tăng `STUDIO_API`.

- `lib/scenes.mjs`, `routes/scenes.mjs`, `lib/tools/scenes.mjs`:
  - Việc `scene` chạy `scene-preview` của series, rồi `npx hyperframes render --quality draft` ra `demo/scenes/cN.mp4`.
  - Ảnh ghép 6 khung được cắt bằng ffmpeg; kết quả ghi vào `.opus/scenes/cN.json` kèm biên nhận `scene-rebuild`.
  - Duyệt ghi dòng `- cảnh N: approved user@studio <ISO> <nhãn>` vào `DEMO.md` kèm biên nhận `scene-approve`, rồi báo cho đạo diễn.
  - Tool có `scene_list` và `scene_rebuild`, không có tool duyệt.
- `routes/gates-audio.mjs`:
  - `audio-check` chạy `COMMANDS.mixBalance` và trả dòng `PASS|WARN|FAIL BALANCE`.
  - `audio-review` chạy `make-demo --record-audio-review user@studio` kèm biên nhận `audio-review`.
  - `gateStatus` của `server.mjs` trả thêm `audio_changed`.
- Giao diện:
  - Thẻ "Nhóm cảnh" nằm ở cột Đạo diễn và tab Tài sản.
  - Thẻ "Tiếng đã đổi sau animatic" nằm trong hộp Xuất bản.
  - Với `capabilities.picture_from_code`: tay kéo mép bị ẩn, menu không có Cắt/Roll, phím S chỉ báo "Hình dựng bằng mã: mốc shot đi theo lời. Dời câu thì được."
- Tài liệu: thêm hai mục mới trong `docs/series.md` và một dòng trong `CHANGELOG.md`.

## Series S

- Đã sao lưu: `$BK/song-lag-phase09-20261024/studio-series.json`.
- Thêm `S/tools/scene-preview.mjs` và `S/tools/tests/scene-preview.test.mjs`, khai báo `scene-preview` trong `S/studio-series.json`. `validateSeries` trả `[]`.

## Verify

| Task | Kết quả |
|---|---|
| 9.0 | Nhánh A. hyperframes 0.8.191; clip 3 s; khung trùng bản đầy đủ (PSNR inf). Chi tiết ở `phase-09-tham-do.md` |
| 9.1 | `node --test tools/tests/*.test.mjs` của S: 55/55 pass. `OK-DECLARED` **trượt** vì `film-stills` không khai báo (có chủ đích, theo lời khuyên của kongming) |
| 9.2 | `tests/scene-rebuild.test.mjs`: 4/4 pass |
| 9.3 | `tests/audio-review.test.mjs`: 3/3 pass |
| 9.4 | `npm test` exit 0: node 457 test (455 pass, 2 skip, 0 fail); vitest 268/268; tsc sạch; check-ownership 6/6 |
| 9.5 | Xem bên dưới |

Kiểm tích hợp trên Studio thử ở cổng 4420 (root `$T/root`, `OPUS_VIDEO_HOME=$OVC`, state `$T/p09/studio.json`), chạy từ worktree:

- Bản chép a-01, import lại bằng `$OVC --force` để manifest có `picture_from_code: true`:
  - `resize_shot` trả 422 `INVALID: hình dựng bằng mã (buildFilm): …`.
  - `move_line vo-01` trả 200.
- a-99:
  - Tách PLAN thành hai shot `s1` 0–5 và `s2` 5–10, thêm `scenes/scenes.json` hai cảnh, và trỏ dòng `series:` của BRIEF sang S. Bản cũ lưu ở `$T/p09/`.
  - Import ra 2 cảnh.
  - Dựng lại c1 và c2, mỗi cảnh xong trong khoảng 6 s; mỗi clip dài 5,000 s.
  - Duyệt cả hai, `DEMO.md` có hai dòng:
    - dòng 6: `- cảnh 1: approved user@studio 2026-10-24T09:38:57.312Z Mở đầu`
    - dòng 7: `- cảnh 2: approved user@studio 2026-10-24T09:38:57.312Z Kết`
  - `renders/` trống (OK-NO-FULL-RENDER).
  - `/api/scenes` báo `current` và `approved_current` đều true.
- `/api/gates` của a-99 và a-01 đều trả về trường `audio_changed: false`.
- Đã dừng Studio thử (OK-STOPPED). 4317 vẫn pid 82168, không bị đụng tới.

Ghi chú:

- a-99 là mẫu tập: `scenes/film.mjs` chỉ có một thẻ giữ chỗ "CẢNH 1" cho cả phim, nên ảnh ghép của c2 vẫn hiện "CẢNH 1". Đó là hình thật ở giây 5–10, không phải lỗi cắt khoảng.
- Không duyệt trên a-02 thật: phase chỉ cho ghi file được phép trên a-02, và theo plan thì kiểm tích hợp chạy trên a-99. Bước duyệt cảnh 1–2 đã chạy trên a-99.
- Không tốn lượt ElevenLabs hay Codex.
