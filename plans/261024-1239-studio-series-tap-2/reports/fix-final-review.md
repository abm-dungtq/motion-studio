# Sửa 3 việc thiếu của duyệt cuối (2026-10-24, Asia/Saigon)

Kết quả: cả 3 việc đã xong. 4317 chạy lại với pid 66098, root `/Volumes/2/Edit-Video`, plugin cài `4f9b88e`. `/api/gates?name=a-02` không còn `unknown style` và không còn FAIL về hướng; các FAIL còn lại đều do tập chưa dựng.

## 1. Style `pixel-arcade-hd` vào plugin

- PR [opus-video #10](https://github.com/abm-dungtq/opus-video/pull/10), squash-merge `4f9b88e`. PR thêm `data/styles/pixel-arcade-hd.json`, chép nguyên từ `~/.agents/skills/opus-video` (nội dung trùng byte với `S/style/pixel-arcade-hd.json`). `index.json` được sinh bằng `styles.mjs index --write`, không sửa tay.
- Kiểm: `styles.mjs validate` PASS 65 profile. Test plugin 589 pass, 0 fail, cả trên `$OVC` lẫn bản cài sau setup. `a01_import "$OVC"` exit 0, 0 dòng WARN, khớp mốc. `a-01/project.json` vẫn chưa có.
- `S/tools/install-style.mjs`: mặc định đổi sang `~/.claude/skills/opus-video`, và chú thích nói rõ plugin đã có sẵn profile. Bản sao lưu nằm ở `/Volumes/2/Hoạt hình/plans/backups/song-lag-fix-final-review-261024/tools/`. Test series 55 pass, 0 fail. Không chạy `install-style` trên bản cài.

## 2. Hướng thị giác trong BRIEF

- Lý do chọn: a-01 đã qua cổng final với `direction: A7` và `direction_swaps: none` (A7 chỉ quy định cách nối cảnh, còn hình do `S/style/direction.json` khoá), nên mẫu tập và a-02 khoá cùng giá trị thay vì dùng `creative_override`.
- Đã thêm hai dòng đó vào `S/templates/episode/BRIEF.md.tmpl` và `C/video/a-02/BRIEF.md`.
- Khi đã có `direction:`, cổng sáng tạo chạy thật và đòi PLAN có dòng `Hướng: …`. Vì vậy tôi thêm `- Hướng: A7 (series khóa theo tập 1)…` vào `S/templates/episode/PLAN.md` và `C/video/a-02/PLAN.md`. Đây là phần tôi làm thêm ngoài BRIEF, để không còn FAIL về hướng. Bản sao lưu của cả 4 file nằm cùng thư mục backup ở trên.
- `check-preflight --stage final` trên a-02 (cũng là `/api/gates` của 4317) còn 5 FAIL, đều đúng vì tập chưa dựng:
  1. `PLAN.md "## Cảnh"` mới nêu 1 blueprint/rule, cần ít nhất 2 (đạo diễn điền khi viết cảnh).
  2. `DEMO.md` chưa có `animatic:`.
  3. `build/RECIPES.md` chưa có (đạo diễn chạy `recipe-pack` ở bước dựng).
  4. `demo/` có 0 khung.
  5. `DEMO.md` chưa có approval.

  Ngoài ra còn 1 WARN `## Nhịp`, không chặn. `a-01` trên 4317 cũng không còn `unknown style`.

## 3. Email trong chú thích Motion Studio

- PR [motion-studio #33](https://github.com/abm-dungtq/motion-studio/pull/33), squash-merge `e905cc4`. Ví dụ trong chú thích `maskAccount` (`lib/series.mjs:94`) giờ là `ten@example.com`. PR làm trong worktree `~/.cache/ms-tap2/ms-email` (đã gỡ sau khi merge); `/Volumes/2/Motion-Studio` không đổi nhánh.
- `npm test`: node 474 pass, 2 skip, 0 fail; vitest 275/275; ownership 6/6.
- Kết quả quét `@gmail.com`:
  - File được theo dõi của Motion Studio: chỉ còn `<email tài khoản Drive>`, là email giả trong `tests/drive-upload.test.mjs`.
  - File được theo dõi của plugin: 0. Các lần trùng chỉ nằm trong log git cục bộ của bản clone, không phải nội dung repo.
- **Email thật vẫn nằm trong lịch sử git công khai của Motion Studio**, từ commit của #32. Lịch sử không bị viết lại, theo đúng ràng buộc.

## Danh sách việc người dùng

Đã sửa `reports/viec-nguoi-dung-tap-2.md`:

- Đầu file: cập nhật sha.
- Mục 1: hướng A7 đã khoá sẵn, không cần chọn.
- Mục 4: đạo diễn chạy `check-viet-pro`, người dùng chỉ đọc kết quả.
- Mục 5: đổi người nói sau khi đã duyệt animatic thì cổng final FAIL và phải duyệt lại, nên làm phép kiểm trước khi duyệt.
- Mục 6: đạo diễn phải nêu ≥2 blueprint/rule và chạy `recipe-pack`.
- Mục 7: WARN `## Nhịp` không chặn.
- Mục 8: ghi điều kiện style, nay đã có.
- Mục 10: email chỉ ghi dạng che chung.
- Mục 11: dọn rác là tùy chọn, không tính vào chỉ số 0 lệnh.

## Cài đặt và 4317

- `git pull --ff-only` của Motion Studio lên `e905cc4`. `npm run setup -- --yes` đưa plugin từ `6ae4fbf` lên `4f9b88e`, tương thích `STUDIO_API` 4, bản cài sạch và trùng `main` trên GitHub.
- Trước khi restart, 4317 không có việc nào đang chạy: không có đạo diễn, render, `codex exec` hay `eleven.mjs`, và không có Studio thử ở 4420. Pid cũ là 38307.
- Sau khi `stop` rồi `start --background --root /Volumes/2/Edit-Video`:
  - pid 66098, `/` trả 200;
  - `/api/status` báo opus-video 2.5.0, api 4;
  - `/api/projects` có 22 dự án, trong đó `a-02` sửa được và `a-01` ở dạng nhập.

## Còn mở

- `plans/261024-1239-studio-series-tap-2/phase-03-khai-bao-va-cong-cu-series.md` chứa email thật nguyên văn. Thư mục `plans/` chưa được git theo dõi và cũng không nằm trong `.gitignore`, nên nếu ai đó commit `plans/` thì email sẽ lộ lần nữa. Nên che email trong file đó, hoặc thêm `plans/` vào `.gitignore`.
