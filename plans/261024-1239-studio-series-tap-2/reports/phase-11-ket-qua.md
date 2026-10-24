# Phase 11: kết quả (2026-10-24, Asia/Saigon)

Phase đã xong. Bản cài plugin đã lên `main` mới nhất. Studio 4317 chạy mã mới với root cũ, và hai symlink `a-01`, `a-02` đã nằm trong root. Danh sách việc của người dùng ở `reports/viec-nguoi-dung-tap-2.md`. Phase không tốn lượt Codex hay ElevenLabs và không tạo PR mới.

## Trước và sau

| | Trước | Sau |
|---|---|---|
| Motion Studio (`/Volumes/2/Motion-Studio`, `main`) | bản cục bộ đi sau `origin/main`; server 4317 chạy mã #22 (khởi động 2026-10-23 17:45:32) | `7db2350` (#32), đã `pull --ff-only` |
| Plugin cài `~/.claude/skills/opus-video` | `4fbc815` | `6ae4fbf`, bằng đỉnh `main` trên GitHub (`OK-INSTALLED-MAIN`), version 2.5.0, `STUDIO_API` 4, cây sạch |
| Bản clone `$OVC` | `6ae4fbf` | `6ae4fbf` (đã cập nhật sẵn) |
| Studio 4317 | pid 82168, root `/Volumes/2/Edit-Video`, cổng 4317 | pid 38307, root `/Volumes/2/Edit-Video`, cổng 4317, khởi động 2026-10-24 17:20:19 (+0700); log `~/.config/motion-studio/studio.log` |

Tiến trình 38307 là Studio người dùng dùng tiếp, nên phase không dừng nó.

## Verify

- 11.1:
  - Không còn PR mở của plan ở cả hai repo.
  - Test Motion Studio: node có 476 test (474 pass, 2 skip có sẵn, 0 fail), vitest 275/275, kiểm sở hữu 6/6.
  - Test plugin `$OVC`: 589 pass. Test series S: 55 pass.
  - `git status --porcelain` của MS chỉ có thư mục `plans/261024-1239-studio-series-tap-2/` chưa track (không phải mã).
- 11.2:
  - Ngay trước khi dừng 4317 đã kiểm hai lần, cả hai lần đều ra `OK-NO-DIRECTOR`, `OK-NO-RENDER` và `OK-NO-TEST`.
  - pid 82168 không có tiến trình con.
  - Không có job nào của người dùng bị cắt.
- 11.3:
  - `npm run setup -- --yes` báo "đã cài 2.5.0 bằng git pull, tương thích (STUDIO_API 4)".
  - Test plugin trong bản cài: 589 pass.
- 11.4:
  - Symlink đúng đích (`OK-SYMLINKS`).
  - `stop` rồi `start --background` chạy mà không đặt biến môi trường thử nào; giao diện báo "đã mới".
  - `status` có `root /Volumes/2/Edit-Video`, và `GET /` trả 200.
- 11.5, kiểm sau khi chạy:
  - `/api/status`: provider `opus-video` 2.5.0, api 4.
  - `/api/projects` có 22 dự án:
    - `a-02` có `has_manifest: true` và `editable: true`;
    - `a-01` có `has_manifest: false` (dạng "Nhập dự án");
    - `abm-intro` vẫn còn.
  - `/api/series?name=a-02`: 200, trả "Sóng Lag", `dir` kết thúc bằng `series/song-lag`, Drive `xao…@gmail.com` (email đã che), thư mục `song-lag`.
  - `/api/consent?name=a-02`: 200 `{"cards":[]}`. Route này không còn 404 như trên server cũ.
  - `/api/assets?name=a-02` có hai đợt của phase 06:
    - `ba-noi-design`: `pose-stand-a` ở trạng thái `needs_review`, `pose-stand-b` đã `approved`;
    - `ba-noi-poses`: cả hai ảnh đã `approved`.
  - `/api/handoff?name=a-02`: không có thẻ, đúng vì phase 06 không đi đường thoát.
  - `/api/gates?name=a-02` chạy được và trả `pass: false`, đúng vì tập 2 chưa dựng.
  - `/api/voice/previews?name=a-02` có `ba-noi` với 3 bản và `can_set_speaker: true`.
  - `/api/delivery?name=a-02` trả tập 2, thư mục `S/kenh-youtube/tap-2`, chưa có file.
  - Chip đạo diễn (`/api/agent`):
    - `claude` 2.1.304 có sẵn và đã đăng nhập;
    - runner là `cli`;
    - có ffprobe và ffmpeg;
    - `provider_error` là null.
  - Bản giao diện mà 4317 phục vụ có các chuỗi "Giao nộp", "Chọn giọng", "Nhóm cảnh", "Cần xử lý ngoài" và "Tài sản".
  - `a01_import "$OVI"` trên bản chép:
    - exit 0;
    - dòng đầu `shots=20 lines=43 music=10 events=45 editable=true`;
    - không có WARN mới (`OK-NO-NEW-WARN`).
  - Bản chép chạy thêm `--write` cho ra 43 câu, 0 lệch người nói hay cổng (`OK-A01-SPEAKERS`), `picture_from_code: true` và 8 cảnh.
  - a-01 thật không có file nào mới (`OK-A01-UNTOUCHED`) và vẫn chưa có `project.json`.
- 11.6: `viec-nguoi-dung-tap-2.md` có đúng 12 mục. Các việc chờ người dùng đã phát sinh nằm trong các mục đó:
  - chọn giọng bà nội;
  - xem lại tờ bà nội đã được duyệt thay (áo nâu hay đỏ gạch, chiếu chữ nhật hay tròn, mặt `head-front` ở 4×);
  - quyết phương án tự kiểm ảnh (A/B/C/C'+D/E);
  - kiểm đổi người nói rồi lồng lại phải ra khoảng -16 LUFS;
  - duyệt cảnh trên a-02 thật;
  - chạy viet-pro trước `deliver_captions`;
  - lần tải Drive thật đầu tiên.
- 11.7: cổng 4420 trống (`OK-NO-TEST`) và `status` vẫn báo 4317 chạy.

## Dọn

Theo lệnh của người điều phối, phase chỉ liệt kê, không xoá. `~/.cache/ms-tap2/` có:
- `opus-video/` (7,2 MB): bản clone `$OVC`. Còn cần nếu muốn sửa plugin tiếp.
- `thu/` (85 MB): chỗ thử `$T`, dựng lại được. Bên trong có `root/`, `root-series/` (symlink a-01, a-02), `a01-imp/`, `series-gia/`, `fakebin/`, `p05-*`, `p06`, `p09`, `p10`, `wide/`, `remix/`, các file `a01-import-*.txt` và `studio.json`, `studio.log` của Studio thử.
- `p11-ms-test.txt` (48 KB): log `npm test` của phase này.

Xoá các thư mục này không đụng tới dữ liệu thật. Tuy vậy, `thu/root-series/a-02` là symlink trỏ vào a-02 thật, nên khi xoá phải dùng `rm` thường, không theo symlink.

## Còn mở

- Mọi việc chờ người dùng đã ghi ở `viec-nguoi-dung-tap-2.md`, các mục 2, 3, 5, 6, 9 và 10.
- Commit squash `17745d0` (opus-video #6) còn trailer `Co-authored-by`. Commit này đã lên `main` nên không force-push được, và để nguyên như kongming khuyên ở checkpoint phase 03.
- `--legacy-mtime` của cổng final phải bỏ sau 2026-10-31 (đã ghi trong CHANGELOG plugin).
- `CLAUDE.md` của Edit-Video chưa nhắc tới các symlink series. Phase chỉ gợi ý trong danh sách việc, không sửa file đó.
