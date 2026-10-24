---
phase: 6
title: "Bài kiểm thật: tạo a-02 và đợt vẽ bà nội từ Studio (mốc bước 3)"
status: done
effort: 3h + thời gian máy
depends_on: ["phase-05"]
---

# Phase 06: Bài kiểm thật, đợt vẽ bà nội

## Bối cảnh

Đây là bài kiểm thật duy nhất có vẽ ảnh bằng Codex trong plan (tài liệu mục 8, "sau bước 3"). Mục tiêu là chứng minh một vòng đầy đủ chạy từ Studio: tạo dự án a-02, đạo diễn viết đợt ảnh, thẻ đồng ý, vẽ song song, tự kiểm, tách nền, bảng duyệt, `approval.json`, rồi dựng rig bà nội qua công cụ series.

Bà nội trong kịch bản tập 2 chỉ cần mức `design` và tư thế ngồi nghe điện thoại, ở màn hình chia đôi cảnh 5 (`$C/scripts/a-02-tai-khoan-facebook-dau-tien.md:87,99,268`). Vì vậy đợt thật gồm khoảng 4 ảnh trong hai đợt: đợt thiết kế 2 phương án, rồi đợt tư thế 2 ảnh (`sit-phone`, `sit-phone-talk`). Bảy tư thế mới của tập 2 là của Sóng, bố, mẹ (dòng 269), người dùng làm ở bước 7 (danh sách phase 11).

Nhân vật HD của tập 1 có cấu trúc: ảnh Codex ở `S/refs/<id>-hd/codex/pose-stand.png` và `S/refs/<id>-hd/poses/<tư thế>.png`, mô tả tư thế ở `S/refs/<id>-hd/poses.tsv`, khuôn nhân vật ở `S/refs/<id>-hd/style.txt`, mã dựng ở `S/characters/<id>/src/hd-poses.mjs` (ví dụ `S/characters/bo/src/hd-poses.mjs:1-30`, gọi `buildPoses` của `S/tools/lib/hd-rig.mjs`), cùng `character.json`, `parts/*.pxl`, `src/hd/stand.pxl` theo `S/characters/SCHEMA.md`. Mã dựng và các file `.pxl` chỉnh tay là phần khó nhất; đó là lý do có mốc dừng 1.

## Repo, nhánh, PR

Không đổi mã. Chỉ có dữ liệu: dự án mới `$C/video/a-02` (không phải git) và dữ liệu nhân vật bà nội trong S. Nếu bài kiểm lộ lỗi mã, sửa trong một PR nhỏ `fix/...` của repo tương ứng, merge, rồi chạy lại đúng task trượt.

## File sở hữu

- Tạo: `$C/video/a-02/**` (qua `series_episode_new`), `S/refs/ba-noi-hd/**`, `S/characters/ba-noi/**` (qua route duyệt và `series_file_put`), `$PLAN/reports/phase-06-ket-qua.md`.
- Sao lưu trước khi đụng: `S/voices/roles.json`, `S/voices/cast.json`, `S/characters/` (danh sách), `S/refs/` (danh sách) vào `$BK/song-lag-phase06-<ngày>/`.
- Không sửa: `$C/video/a-01/**`, nhân vật khác trong S.

## Tốn lượt

Có, Codex (codex-pool). Người điều phối tự đồng ý hai thẻ đợt của phase này, vì người dùng đã cho chạy liên tục tới hết bài kiểm bà nội. Ước tính: đợt thiết kế 2 ảnh, đợt tư thế 2 ảnh, cộng tối đa 1 lần tự vẽ lại mỗi ảnh và các lần đọc ảnh tự kiểm, tức khoảng 4 đến 8 lượt vẽ và 4 đến 8 lượt đọc ảnh. Trước mỗi thẻ, đọc con số ước tính trên thẻ; nếu thẻ ước hơn 10 lượt vẽ thì không đồng ý, dừng và hỏi người điều phối.

Claude (`claude -p` của đạo diễn) cũng chạy, nhưng không phải quota Codex hay ElevenLabs.

## Task 6.0: Chuẩn bị và sao lưu

Bước:
1. Kiểm phase 01 đến 05 đã merge: `git -C "$MS" log --oneline -1 origin/main` có các PR; `git -C "$OVC" checkout main && git -C "$OVC" pull`.
2. Sao lưu:
   ```bash
   d="$BK/song-lag-phase06-$(date +%Y%m%d)"; mkdir -p "$d"
   cp -p "$S/voices/roles.json" "$S/voices/cast.json" "$d/"
   ls -la "$S/characters" > "$d/characters.ls"; ls -la "$S/refs" > "$d/refs.ls"
   ```
3. Kiểm chưa có `$C/video/a-02` và chưa có `S/characters/ba-noi`. Có rồi thì dừng và hỏi.
4. Mở Studio thử 4420 với root `$T/root-series`, một root riêng chỉ chứa symlink `a-01` trỏ tới `$C/video/a-01` thật. Đây là đúng cách 4317 sẽ chạy sau phase 11 (root giữ ở Edit-Video, các tập nối vào bằng symlink), nên bài kiểm thật đi qua đường symlink. a-01 không bị ghi vì chỉ đọc qua route GET và đợt chạy trên a-02:
   ```bash
   mkdir -p "$T/root-series" && ln -sfn "$C/video/a-01" "$T/root-series/a-01"
   ( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json" OPUS_VIDEO_HOME="$OVC"; node "$MS/bin/motion-studio.mjs" start --background --root "$T/root-series"; node "$MS/bin/motion-studio.mjs" status )
   ```
   Ghi pid vào `$PLAN/reports/phase-06-ket-qua.md`.

Verify:
```bash
test -f "$BK/song-lag-phase06-$(date +%Y%m%d)/roles.json" && echo OK-BACKUP
test ! -e "$C/video/a-02" && echo OK-NO-A02
test -L "$T/root-series/a-01" && curl -s http://127.0.0.1:4420/api/projects | command grep -o '"a-01"' | head -1
```

## Task 6.1: Tạo a-02 từ Studio

Bước:
1. Đọc token thử vào biến, không in (cách ở phase 03, task 3.7).
2. `POST /api/series/episode` với `{ "from": "a-01", "episode": 2, "title": "Tài Khoản Facebook Đầu Tiên" }`; chờ job xong qua `GET /api/series/job?id=<job.id của phản hồi>` (job tạo tập đăng ký dưới tên dự án nguồn `a-01`, không phải `a-02`; route này còn trả `receipt` khi biên nhận đã ghi vào tập mới).
3. `POST /api/import` với `{ "name": "a-02" }` để có `project.json`.
4. Chép kịch bản nguồn vào dự án để đạo diễn đọc được: `cp "$C/scripts/a-02-tai-khoan-facebook-dau-tien.md" "$C/video/a-02/script/kich-ban-nguon.md"`.

Tiêu chí thành công: thư mục thật `$C/video/a-02` được tạo cạnh a-01 (không nằm trong `$T/root-series`), root thử có symlink `a-02` trỏ tới nó, `a-02` hiện trong `/api/projects`; `BRIEF.md` có `series:`, `episode: 2`, `title:`; `GET /api/series?name=a-02` trả `name` là "Sóng Lag" và `dir` kết thúc bằng `series/song-lag`; có biên nhận của job tạo tập.

Verify:
```bash
test -d "$C/video/a-02" && test -L "$T/root-series/a-02" && test "$(readlink "$T/root-series/a-02")" = "$C/video/a-02" && echo OK-A02-SYMLINK
command grep -E '^(series|episode|title):' "$C/video/a-02/BRIEF.md"
test -f "$C/video/a-02/project.json" && echo OK-MANIFEST
curl -s "http://127.0.0.1:4420/api/series?name=a-02" | head -c 200; echo
ls "$C/video/a-02/.opus/receipts/"*/ | head -3
```

## Task 6.2: Đợt thiết kế bà nội (Tốn lượt)

Bước:
1. Gửi một yêu cầu cho đạo diễn qua `POST /api/director` với `{ "name": "a-02", "scope": "project", "text": "<câu dưới>" }`:
   "Tạo đợt ảnh `ba-noi-design` cho nhân vật mới bà nội (mức design, chỉ cần ngồi nghe điện thoại ở cảnh 5 của script/kich-ban-nguon.md). Hai phương án, kind pose, nền xanh. Mô tả bà theo mẫu của S/refs/bo-hd/style.txt: một bà cụ nông thôn miền Bắc khoảng bảy mươi tuổi, tóc bạc búi, áo bà ba nâu, quần đen. Ảnh tham chiếu: S/refs/bo-hd/codex/pose-stand.png (mẫu nét vẽ) và S/refs/song-hd/codex/pose-stand.png (mẫu mật độ điểm ảnh). Đích: S/refs/ba-noi-hd/codex/pose-stand-a.png và pose-stand-b.png. Ghi file đợt rồi gọi asset_batch, không gọi codex trực tiếp."
2. Đạo diễn ghi `assets/gen/batches/ba-noi-design.json` và gọi `asset_batch`. Thẻ đồng ý hiện trong `GET /api/consent?name=a-02`.
3. Đọc ước tính trên thẻ. Từ 10 lượt vẽ trở xuống thì đồng ý: `POST /api/consent/answer { name: "a-02", id, ok: true }` (hình dạng body theo task 4.2 của phase 04). Ghi vào báo cáo: giờ đồng ý, ước tính, quota tài khoản trên thẻ.
4. Chờ job `asset-batch` hết chạy. Đọc `asset_status` qua `GET /api/assets?name=a-02`.

Tiêu chí thành công: hai ảnh có trạng thái `keyed` hoặc `needs_review`; mỗi lần vẽ có một biên nhận `image-generate`, mỗi lần đọc ảnh có một biên nhận `image-check`; đạo diễn nhận yêu cầu tiếp "Đợt ba-noi-design xong …".

Verify:
```bash
node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=Object.values(s.items).map(i=>i.status);console.log(v.join(","));process.exit(v.length===2&&v.every(x=>/keyed|needs_review/.test(x))?0:1)' "$C/video/a-02/.opus/assets/ba-noi-design.json" && echo OK-BATCH
command grep -l '"op": *"image-generate"' -r "$C/video/a-02/.opus/receipts" | wc -l
```

## Task 6.3: Duyệt tờ thiết kế (thay người dùng)

Bước:
1. Xem hai ảnh ở 4× (công cụ trình duyệt nếu có; nếu không, dùng Read trên `assets/gen/keyed/<id>.png`). Chọn một phương án đạt: đúng một bà cụ, nền tách sạch, cùng nét vẽ với tập 1.
2. Cả hai trượt: bấm vẽ lại qua `POST /api/assets/redo` với một lý do cụ thể (tối đa 2 lần cho cả phase). Vẫn trượt thì sang mốc dừng (task 6.6).
3. Duyệt phương án chọn: `POST /api/assets/approve { name: "a-02", batch: "ba-noi-design", board: "character:ba-noi", ids: ["<id chọn>"], notes: "Duyệt thay người dùng trong bài kiểm Studio ngày <ngày>; người dùng xem lại ở bước 7." }`.

Tiêu chí thành công: `S/characters/ba-noi/approval.json` có `approved: true`, ngày, ghi chú duyệt thay; ảnh nằm ở `S/refs/ba-noi-hd/codex/pose-stand-<a|b>.png`; `DEMO.md` của a-02 có dòng `tài sản character:ba-noi: approved …` trên `## Frames`.

Verify:
```bash
node -e 'const a=require(process.argv[1]);console.log(a.date,a.approved);process.exit(a.approved===true?0:1)' "$S/characters/ba-noi/approval.json" && echo OK-APPROVED
ls "$S/refs/ba-noi-hd/codex/"
command grep -n "character:ba-noi" "$C/video/a-02/DEMO.md"
```

## Task 6.4: Đợt tư thế bà nội (Tốn lượt)

Bước:
1. Yêu cầu đạo diễn: "Thiết kế bà nội đã duyệt (S/refs/ba-noi-hd/codex/pose-stand-<x>.png). Tạo đợt `ba-noi-poses`: sit-phone (ngồi trên chiếu, cầm ống nghe điện thoại bàn áp tai, tay kia cầm quạt nan), sit-phone-talk (như trên, miệng đang nói). Viết thêm hai dòng đó vào assets/gen/rig-src/poses.tsv theo định dạng của S/refs/bo-hd/poses.tsv. Đích S/refs/ba-noi-hd/poses/<tư thế>.png. Gọi asset_batch."
2. Đồng ý thẻ như task 6.2, cùng giới hạn 10 lượt.
3. Chờ xong, xem ở 4×, duyệt cả bảng (`board: "character:ba-noi"`, cả hai id) hoặc vẽ lại theo luật của task 6.3.

Tiêu chí thành công: hai ảnh tư thế ở `S/refs/ba-noi-hd/poses/`; `approval.json` có `previous` giữ lần duyệt thiết kế; biên nhận đủ như task 6.2.

Verify:
```bash
ls "$S/refs/ba-noi-hd/poses/"
node -e 'const a=require(process.argv[1]);process.exit(a.previous&&a.approved===true?0:1)' "$S/characters/ba-noi/approval.json" && echo OK-PREVIOUS
```

## Task 6.5: Dựng rig bà nội qua công cụ series

Bước:
1. Yêu cầu đạo diễn: "Dựng rig HD cho ba-noi theo mẫu của bố. Viết trong dự án, ở assets/gen/rig-src/: character.json (tier design, 4 biểu cảm neutral, happy, angry, shocked theo S/characters/SCHEMA.md), parts/head-front.pxl, parts/eyes-*.pxl, parts/brows-*.pxl, parts/mouth-*.pxl, src/hd/stand.pxl, src/hd-poses.mjs (chép khung S/characters/bo/src/hd-poses.mjs, đổi REFS sang refs/ba-noi-hd, các tư thế stand, sit-phone, sit-phone-talk). Rồi dùng series_file_put đưa từng file vào rig_src của ba-noi, chạy series_tool hd-poses (char ba-noi), build-rig --char ba-noi, validate, sync-to-project. Lỗi thì đọc tail, sửa file trong dự án, đưa lại với replace."
2. Theo dõi `GET /api/jobs?name=a-02` và biên nhận `op: "series-tool"`, `op: "series-put"` (tên op theo `routes/series.mjs` đã merge ở phase 03).
3. Không sửa tay file trong `S/characters/ba-noi/`. Nếu đạo diễn kẹt, chỉ gửi thêm yêu cầu cho đạo diễn (tối đa 3 yêu cầu sửa).

Tiêu chí thành công: `validate` exit 0; `$C/video/a-02/assets/rig/rigs/` có file rig của `ba-noi` sau `sync-to-project` (đích theo `S/tools/sync-to-project.mjs:16-20`); một khung xem thử của bà nội (đường `--preview` của hd-poses trong `assets/gen/`) nhìn ra đúng nhân vật.

Verify:
```bash
command grep -h '"tool"' -r "$C/video/a-02/.opus/receipts" | sort | uniq -c
ls "$C/video/a-02/assets/rig/rigs" | command grep -i ba-noi
cd "$S" && node tools/validate.mjs --char ba-noi; echo "exit $?"
```
(`validate` chỉ đọc, in `OK` hoặc `FAIL n`; cú pháp ở `S/tools/validate.mjs:3`.)

## Task 6.6: Mốc dừng và báo cáo

Bước:
1. Nếu task 6.2 đến 6.5 đều qua: ghi `$PLAN/reports/phase-06-ket-qua.md` gồm số lượt vẽ thật, số lần vẽ lại, thời gian từng đợt, những chỗ đạo diễn kẹt, và những gì người dùng nên xem lại.
2. Nếu đợt hoặc duyệt không ra được tờ nhân vật (task 6.2 đến 6.4 trượt sau Failure Protocol): ghi rõ vì sao, dừng phần bà nội, các phase sau vẫn làm (mốc dừng 1).
3. Nếu tờ nhân vật đã duyệt nhưng rig (task 6.5) trượt hai lần cùng một lỗi: ghi đầu ra, ghi đường thoát "dựng rig bà nội bằng Claude Code ở terminal trong S" vào báo cáo; phase 10 sẽ biến chỗ này thành thẻ cần xử lý ngoài. Không coi đây là lỗi của plan.
4. Quét biên nhận không có chuỗi giống token:
   ```bash
   command grep -rEl 'sk-[A-Za-z0-9]{20,}|xi-api-key|"token" *: *"[A-Za-z0-9]{16,}' "$C/video/a-02/.opus/receipts" && echo LEAK || echo OK-NO-TOKEN
   ```
5. Dừng Studio thử, kiểm cổng trống, kiểm 4317 vẫn chạy pid cũ.

Verify:
```bash
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json"; node "$MS/bin/motion-studio.mjs" stop )
lsof -i :4420 >/dev/null || echo OK-STOPPED
lsof -i :4317 | head -2
test -s "$PLAN/reports/phase-06-ket-qua.md" && echo OK-REPORT
```

## Rủi ro

- Codex không giữ được nét nhân vật từ một ảnh thiết kế (Trung bình × Trung bình; tài liệu mục 10 ghi là chưa thử). Giảm bằng ảnh tham chiếu thứ hai là thiết kế đã duyệt, và luật vẽ lại tối đa 2 lần.
- Đạo diễn gọi codex hay `eleven.mjs` thẳng (Thấp × Trung bình): luật prompt của phase 03; kiểm biên nhận, mọi lần vẽ phải có biên nhận `image-generate` gắn job đợt. Thấy lần vẽ không có biên nhận thì dừng và báo.
- Rig không dựng được trong Studio (Cao × Trung bình): đường thoát ở task 6.6, không chặn các phase sau.
- Ghi nhầm vào a-01 (Thấp × Cao): a-01 chỉ được đọc; trước và sau phase so `find "$C/video/a-01" -newer "$PLAN/plan.md" -type f | wc -l` phải bằng 0.

## Khôi phục

- Xóa `$C/video/a-02` (chỉ chứa dữ liệu của bài kiểm; ảnh trong `assets/gen/raw/` chép ra `$BK/song-lag-phase06-<ngày>/raw/` trước khi xóa, vì luật không xóa ảnh gốc).
- Xóa `S/characters/ba-noi` và `S/refs/ba-noi-hd` (cả hai là mới); trả `roles.json`, `cast.json` từ bản sao lưu nếu đã đổi.

## Kết quả thực hiện (2026-10-24)

Mọi task 6.0–6.6 xong, mọi Verify qua; chi tiết ở `reports/phase-06-ket-qua.md`, sự cố ở `reports/phase-06-su-co.md`. Tóm tắt:
- a-02 tạo từ Studio thử 4420 (root `$T/root-series`, symlink), `project.json` v1; a-01 không có file nào mới.
- Lỗi mã lộ ra ở 6.2: đạo diễn của dự án symlink không ghi được file (Claude Code giải cwd thành realpath). Sửa ở PR https://github.com/abm-dungtq/motion-studio/pull/27, squash `ced48e1`, rồi chạy lại 6.2.
- Hai thẻ đồng ý (ước 2 lượt mỗi thẻ). Thực tế 8 lượt vẽ và 8 lượt đọc ảnh, đều qua codex-pool: cả 4 ảnh trượt kiểm (`right_character` ở đợt thiết kế, `flat_green` ở cả hai đợt), mỗi ảnh tự vẽ lại một lần, rồi vào `needs_review`.
- Người điều phối duyệt thay `pose-stand-b`, rồi `sit-phone`, `sit-phone-talk`; `approval.json` có `previous`, ghi chú duyệt thay nằm trong `approval.json` và DEMO.md.
- Rig dựng trong Studio: 27 `series_file_put`, `hd-poses` (lần 1 thiếu thư mục `poses/`, đạo diễn tự vá), `build-rig`, `validate` OK, `sync-to-project`; `a-02/assets/rig/rigs/ba-noi.rig.mjs` có. Mốc dừng 1 không xảy ra.
- Quét biên nhận: `OK-NO-TOKEN`. Studio thử đã dừng, 4317 vẫn pid 82168.
- Việc thêm: PR docs https://github.com/abm-dungtq/motion-studio/pull/28 (`docs/assets.md` ghi route duyệt bảng và trạng thái `approved`), squash `4b39f6d`.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`. Riêng phase này: không bao giờ đồng ý một thẻ thứ ba tốn lượt khi hai đợt đầu chưa ra kết quả; hỏi người điều phối.
