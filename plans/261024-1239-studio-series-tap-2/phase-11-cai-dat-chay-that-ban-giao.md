---
phase: 11
title: "Cập nhật bản cài plugin, nối a-01/a-02 vào root Studio 4317 bằng symlink, bàn giao việc cho người dùng"
status: done
effort: 3h
depends_on: ["phase-10"]
---

# Phase 11: Cài đặt, chạy thật, bàn giao

## Bối cảnh

Đây là phase duy nhất được đụng bản cài plugin `$OVI` và Studio 4317 đang chạy. Sau phase này người dùng mở `http://127.0.0.1:4317`, thấy `a-01` và `a-02`, và tự làm tập 2 trong Studio (bước 7 của tài liệu). Executor không sản xuất tập 2.

Sự thật đã kiểm:
- `npm run setup` là `node bin/motion-studio.mjs setup` (`package.json:10`); với `--yes` nó so bản cài với đỉnh `main` của `abm-dungtq/opus-video` (`git ls-remote`), và với bản cài là git checkout thì `git pull --ff-only` (`lib/providers/opus-video.mjs:142-200`). Bản cài phải sạch (không có thay đổi chưa commit) thì mới kéo được; plan chưa bao giờ sửa tại chỗ nên nó sạch.
- `start` cũng dựng lại giao diện khi mã nguồn mới hơn bản dựng (`bin/motion-studio.mjs:25-27`).
- Một máy chỉ có một Studio theo file trạng thái; muốn nạp mã mới phải `stop` rồi `start` (`bin/motion-studio.mjs:20-24`). Root KHÔNG đổi: vẫn là `/Volumes/2/Edit-Video` (ở đó có `scripts/compress-final.sh`, `shared-assets/sfx`, `scripts/new-project.sh` mà route xuất bản, thư viện âm thanh và Dự án mới đọc theo root; `$C/video` không có các thứ đó). Các tập của series được nối vào root bằng symlink; `projectsOf` nhận symlink từ phase 03 (task 3.3 bước 5).
- Dự án là thư mục con trực tiếp của root (hoặc symlink tới thư mục, sau phase 03) có `project.json`, hoặc có `index.html` cộng `BRIEF.md` (hiện là "Nhập dự án") (`bin/motion-studio.mjs:21-22`). `a-01` chưa có `project.json`; plan không nhập nó vì nhập là ghi vào a-01. Người dùng tự bấm "Nhập dự án" nếu muốn xem a-01 trên timeline.

## Repo, nhánh, PR

Không có PR mới. Nếu phase này lộ lỗi mã, sửa bằng một PR `fix/...` nhỏ ở repo tương ứng, merge, rồi chạy lại từ task 11.1.

## File sở hữu

- Bản cài `$OVI` (chỉ qua `npm run setup -- --yes`).
- File trạng thái `~/.config/motion-studio/studio.json` (chỉ qua `stop`/`start` của Studio).
- `$PLAN/reports/phase-11-ket-qua.md`, `$PLAN/reports/viec-nguoi-dung-tap-2.md` (mới).

## Tốn lượt

Không.

## Task 11.1: Kiểm mọi thứ đã merge và xanh

Bước:
1. Mọi PR của phase 01 đến 10 đã merge: `gh pr list --repo abm-dungtq/opus-video --state open --author @me` và `gh pr list --repo abm-dungtq/motion-studio --state open --author @me` không còn PR nào của plan.
2. `git -C "$MS" checkout main && git -C "$MS" pull --ff-only`; `git -C "$OVC" checkout main && git -C "$OVC" pull --ff-only`.
3. Chạy toàn bộ test ba nơi.

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
git -C "$MS" status --porcelain | wc -l   # 0
```

## Task 11.2: Chắc chắn 4317 không đang làm việc

Bước:
1. Đọc pid và root của Studio 4317 (không in token): `node -e 'const s=require(process.argv[1]);console.log(s.pid,s.root,s.port)' ~/.config/motion-studio/studio.json`. Ghi vào báo cáo.
2. Kiểm không có job đang chạy: `pgrep -fl "[p]ermission-mode acceptEdits"` (đạo diễn) và `pgrep -fl "[h]yperframes render"` (render) đều rỗng. Dấu ngoặc vuông ở chữ đầu để `pgrep -f` không khớp chính dòng lệnh của shell đang chạy nó (shell gọi bằng `-c` mang nguyên chuỗi tìm trong cmdline, cho kết quả BUSY giả; kongming sửa ở checkpoint 06–07). Có thì chờ, kiểm lại mỗi 5 phút, tối đa 30 phút; vẫn còn thì dừng và hỏi người điều phối. Không giết job của người dùng.
3. Không có Studio thử nào còn chạy: `lsof -i :4420` rỗng.

Verify:
```bash
pgrep -f "[p]ermission-mode acceptEdits" >/dev/null && echo BUSY-DIRECTOR || echo OK-NO-DIRECTOR
pgrep -f "[h]yperframes render" >/dev/null && echo BUSY-RENDER || echo OK-NO-RENDER
lsof -i :4420 >/dev/null && echo TEST-STUDIO-RUNNING || echo OK-NO-TEST
```

## Task 11.3: Cập nhật bản cài plugin

Bước:
1. Ghi sha cũ: `git -C "$OVI" rev-parse --short HEAD` (đang là `4fbc815`) vào báo cáo.
2. `cd "$MS" && npm run setup -- --yes`.
3. Kiểm sha mới bằng đỉnh `main` trên GitHub; chạy test plugin trong bản cài.

Tiêu chí thành công: setup exit 0; `$OVI` ở đúng commit `main` mới nhất; test plugin trong bản cài xanh; `STUDIO_API` vẫn 4.

Verify:
```bash
test "$(git -C "$OVI" rev-parse HEAD)" = "$(git ls-remote https://github.com/abm-dungtq/opus-video.git refs/heads/main | cut -f1)" && echo OK-INSTALLED-MAIN
cd "$OVI" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
node -e 'import(process.argv[1]).then(m=>console.log(m.STUDIO_API))' "$OVI/scripts/studio-api.mjs"   # 4
```

## Task 11.4: Nối a-01, a-02 vào root và chạy lại Studio 4317

Bước:
1. Tạo symlink trong root Edit-Video (không chép, không di chuyển dữ liệu; tên đã có thì dừng và hỏi, không ghi đè):
   ```bash
   for n in a-01 a-02; do test -e "/Volumes/2/Edit-Video/$n" && { echo "đã có /Volumes/2/Edit-Video/$n"; exit 1; }; ln -s "$C/video/$n" "/Volumes/2/Edit-Video/$n"; done
   ```
2. Dừng Studio đang chạy (môi trường mặc định, không đặt biến thử): `node "$MS/bin/motion-studio.mjs" stop`.
3. Khởi động cùng root cũ: `node "$MS/bin/motion-studio.mjs" start --background` (root lấy từ file trạng thái, vẫn là `/Volumes/2/Edit-Video`); `status`.
4. Ghi pid, cổng, root vào báo cáo. Đây là tiến trình người dùng giữ lại; không dừng nó khi xong phase.

Tiêu chí thành công: hai symlink đúng đích; `status` báo chạy ở `http://127.0.0.1:4317`, root `/Volumes/2/Edit-Video`; trang chủ trả 200.

Verify:
```bash
test "$(readlink /Volumes/2/Edit-Video/a-02)" = "$C/video/a-02" && test "$(readlink /Volumes/2/Edit-Video/a-01)" = "$C/video/a-01" && echo OK-SYMLINKS
node "$MS/bin/motion-studio.mjs" status | command grep -c "root /Volumes/2/Edit-Video"   # 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4317/
```

## Task 11.5: Kiểm sau khi chạy

Bước:
1. `GET /api/projects`: có `a-02` (sửa được), `a-01` (dạng "Nhập dự án", chưa có `project.json`) và các dự án cũ của Edit-Video vẫn còn (ví dụ `abm-intro`).
2. `GET /api/series?name=a-02`: trả series Sóng Lag; email Drive đã che.
3. `GET /api/assets?name=a-02`: thấy hai đợt của phase 06. `GET /api/handoff?name=a-02`: thấy thẻ mở nếu phase 06 đi đường thoát.
4. `GET /api/gates?name=a-02`: chạy được (sẽ chưa pass, vì tập 2 chưa dựng).
5. Nhập a-01 trên bản chép bằng plugin đã cài, so mốc: `a01_import "$OVI"`; không có WARN mới; 43 câu có `speaker` đúng và `gate: "pass"` (lệnh kiểm của task 7.1, đổi đường sang bản chép).
6. a-01 thật không bị đổi: `find "$C/video/a-01" -newer "$PLAN/plan.md" -type f | wc -l` bằng 0.

Verify:
```bash
curl -s http://127.0.0.1:4317/api/projects | command grep -o '"a-0[12]"' | sort -u
curl -s http://127.0.0.1:4317/api/projects | command grep -c '"abm-intro"'   # 1
curl -s "http://127.0.0.1:4317/api/series?name=a-02" | head -c 200; echo
a01_import "$OVI" > "$T/a01-import-11.txt" 2>&1; echo "exit $?"
command grep '^WARN' "$T/a01-import-11.txt" | diff - "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-NO-NEW-WARN
test "$(find "$C/video/a-01" -newer "$PLAN/plan.md" -type f | wc -l | tr -d ' ')" = 0 && echo OK-A01-UNTOUCHED
```

## Task 11.6: Danh sách việc người dùng làm trong Studio cho tập 2

Viết `$PLAN/reports/viec-nguoi-dung-tap-2.md` bằng tiếng Việt, câu đầy đủ, theo đúng thứ tự dưới đây. Mỗi mục nói: bấm ở đâu, Studio sẽ làm gì, có tốn lượt không, khi nào coi là xong.

1. **Mở Studio.** `http://127.0.0.1:4317`, chọn `a-02`. Các dự án cũ ở `/Volumes/2/Edit-Video` vẫn ở cùng danh sách; `a-01`, `a-02` là symlink trong Edit-Video trỏ tới `$C/video/`, dữ liệu vẫn nằm ở kho Hoạt hình. Tập 3 trở đi tạo bằng "Dự án mới" dạng tập series (series_episode_new) sẽ tự nằm cạnh a-02 và tự có symlink.
2. **Bà nội.** Tab Tài sản: xem lại tờ nhân vật bà nội (executor đã duyệt thay trong bài kiểm, ghi chú trong `approval.json`); nghe 3 giọng thử ở thẻ "Chọn giọng cho Bà nội" và bấm chọn một (tốn một lượt tạo giọng ElevenLabs). Nếu có thẻ "Cần xử lý ngoài: build-rig", dán câu trong thẻ vào Claude Code ở terminal.
3. **Tài sản mới của tập 2** (kịch bản `$C/scripts/a-02-tai-khoan-facebook-dau-tien.md`, mục "Tài sản hình"): nhờ đạo diễn tạo đợt cho 7 tư thế mới của Sóng, bố, mẹ; đợt 6 nền mới; đợt đạo cụ vật; các thẻ `ui-card` cho màn hình Facebook (hơn 25 cái, làm bằng mã, không tốn lượt). Mỗi đợt có thẻ đồng ý ghi số lượt ước tính. Duyệt từng bảng ở 4×, đánh dấu ảnh hỏng kèm một câu lý do để vẽ lại.
4. **Kịch bản và người nói.** Nhờ đạo diễn tách kịch bản thành `script/NN.txt` và `scenes/roles.json`, bảng 3 cột của viet-pro, rồi qua cổng `check-viet-pro` đạt PASS (không lách bằng `--lang en`). Kiểm ô người nói của từng câu ở tab "Lời & giọng".
5. **Lồng tiếng và nhạc.** Bấm "Lồng tiếng các câu cũ" (thẻ đồng ý, tốn lượt ElevenLabs theo số ký tự trên thẻ). Nhạc nền và SFX sinh ra đã được cắt im lặng và chuẩn hóa về -12,5 LUFS.
6. **Dựng cảnh.** Nhờ đạo diễn viết `scenes/*.mjs` theo từng cảnh; mỗi cảnh xong bấm "Dựng lại cảnh này", xem ảnh ghép và clip nháp, chọn các cảnh đạt và bấm "Duyệt các cảnh đã chọn". Kéo mép shot bị khóa vì hình dựng bằng mã; dời câu thì được.
7. **Animatic và duyệt cuối.** Nhờ đạo diễn chạy animatic; duyệt ở thẻ animatic (ghi `approval:`). Nếu sau đó chỉ lồng lại tiếng, hộp xuất bản hiện thẻ "Tiếng đã đổi": nghe lại, bấm "Nghe rồi, được".
8. **Xuất video.** "Xuất video" trong hộp xuất bản; đích qc-mp4 0 FAIL, độ to -16 đến -12 LUFS.
9. **Giao nộp.** Bảng giao nộp: Video (ba bản youtube, facebook, tiktok), Thumbnail (thẻ đồng ý 3 lượt vẽ, chọn 1 trong 3), Tiêu đề và mô tả (lấy bản nháp `tap-2-tieu-de-mo-ta.md`, thêm mốc chương, qua `check-platform youtube`), Phụ đề (SRT và `CAPTIONS.md`, qua cổng giao nộp viet-pro). Tất cả vào `S/kenh-youtube/tap-2/`.
10. **Drive.** Bấm Drive, đọc email và thư mục trên thẻ, đồng ý. Studio báo tên file, kích thước, link và kết quả so kích thước.
11. **Dọn rác.** Theo mục 10 của `CLAUDE.md` Edit-Video (`sweep-after-final.sh`, chỉ liệt kê trước).
12. **Ghi lại** thời gian làm và số lần phải mở terminal, để so với mục tiêu của tài liệu.

Kèm hai lưu ý cuối file:
- Đạo diễn về quyền vẫn chạy được `eleven.mjs` của plugin (rủi ro còn lại của phase 07). Nếu thấy file giọng không có biên nhận `series-tts`, báo lại; chặn hẳn cần đổi `ALLOWED_TOOLS` của plugin, là quyết định của người dùng.
- Gợi ý cập nhật `CLAUDE.md` của Edit-Video (người dùng tự quyết, executor không sửa): các tập series là symlink trong root (dữ liệu ở kho Hoạt hình, không phải media thô ở gốc), tab Tài sản, giao nộp.

Verify:
```bash
f="$PLAN/reports/viec-nguoi-dung-tap-2.md"; test -s "$f" && command grep -c '^[0-9]\+\. \*\*' "$f"   # 12
```

## Task 11.7: Báo cáo phase và dọn tiến trình

Bước:
1. `$PLAN/reports/phase-11-ket-qua.md`: sha plugin cũ và mới, pid và root Studio cũ và mới, kết quả các Verify, những gì còn mở.
2. Dọn: không còn Studio thử (`lsof -i :4420` rỗng); xóa `$T` nếu không còn cần (chỉ là chỗ thử, dựng lại được). Không dừng Studio 4317.
3. Cập nhật `status` của `plan.md` và các phase thành `completed` (hoặc ghi rõ phase nào `completed` kèm lo ngại).

Verify:
```bash
lsof -i :4420 >/dev/null || echo OK-NO-TEST
node "$MS/bin/motion-studio.mjs" status
test -s "$PLAN/reports/phase-11-ket-qua.md" && echo OK-REPORT
```

## Rủi ro

- Bản mới làm Studio 4317 hỏng khi người dùng đang cần (Thấp × Cao): mọi thứ đã chạy ở 4420 trước; nếu hỏng, làm theo mục Khôi phục ngay, không sửa nóng.
- Setup không kéo được vì bản cài bẩn hay lệch nhánh (Thấp × Trung bình): setup không ghi đè git checkout; đọc lời báo, dừng và hỏi người điều phối, không `git reset` bản cài.
- Một route nào đó so `realpath` của file với đường symlink (không phải realpath của thư mục dự án) và từ chối file của a-02 (Thấp × Trung bình): đã rà `server.mjs:148-149`, `lib/tools.mjs:109-112`, `routes/fx.mjs:43`, `routes/lemo.mjs:209`, `lib/timing-edit.mjs:29` đều realpath cả hai vế; phase 06–10 chạy trên root symlink nên lỗi kiểu này lộ trước phase 11. Nếu còn, sửa route đó bằng PR `fix/...`, không bỏ symlink.

## Khôi phục

- Studio: revert PR gây lỗi trên `main` của Motion Studio, rồi `stop` và `start --background` (root không đổi). Hai symlink `a-01`, `a-02` chỉ là lối vào; xóa symlink (`rm` đúng file symlink, không `rm -r`) không đụng dữ liệu ở `$C/video`.
- Plugin: setup chỉ `pull --ff-only` nên không lùi được bằng `--ref`. Revert PR gây lỗi trên `main` của opus-video, rồi `cd "$MS" && npm run setup -- --yes` để kéo commit revert. Không `git checkout` hay `git reset` tay trong `$OVI`; nếu revert không đủ, dừng và hỏi người điều phối.

## Kết quả thực hiện (2026-10-24)

Mọi task 11.1–11.7 xong, mọi Verify qua. Chi tiết ở `reports/phase-11-ket-qua.md`.

- Test xanh ở cả ba nơi. Motion Studio: node 474 pass, 2 skip, vitest 275. Plugin: 589. Series: 55. Không còn PR mở.
- Trước khi dừng 4317 đã kiểm: không có đạo diễn hay render đang chạy, pid 82168 không có tiến trình con, cổng 4420 trống.
- Bản cài plugin lên `6ae4fbf` (2.5.0) qua `npm run setup -- --yes`: bằng đỉnh `main`, test trong bản cài 589 pass, `STUDIO_API` 4.
- Hai symlink `/Volumes/2/Edit-Video/a-01` và `a-02` trỏ tới `$C/video/`.
- Studio 4317 chạy lại: pid 38307, root `/Volumes/2/Edit-Video`. Kiểm sau khi chạy:
  - `/` trả 200; `/api/status` báo provider 2.5.0.
  - `/api/projects` có `a-01` (Nhập dự án), `a-02` (sửa được) và `abm-intro`.
  - Các route `series`, `consent`, `assets`, `handoff`, `gates`, `voice/previews`, `delivery` của a-02 đều trả 200.
  - Chip đạo diễn ổn.
- `a01_import "$OVI"` trên bản chép: không có WARN mới, 43 câu đúng người nói và cổng. a-01 thật không bị đổi.
- Danh sách việc người dùng có 12 mục, ở `reports/viec-nguoi-dung-tap-2.md`.
- `~/.cache/ms-tap2` chỉ được liệt kê, không xoá.
- `ak plan phase close` và `ak plan update` báo "planstore: plan not found" (kể cả sau `reindex`), nên trạng thái phải sửa thẳng trong front-matter.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`. Riêng phase này: mọi lỗi ở task 11.3 trở đi là lý do dừng và hỏi trước khi làm gì thêm với `$OVI` hay 4317.
