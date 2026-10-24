---
phase: 8
title: "Cảnh trong manifest, khóa kéo mép và cổng tách hình/tiếng (F plugin, G)"
status: done
effort: 4h
depends_on: ["phase-07"]
---

# Phase 08: Cảnh trong manifest và cổng tách hình, tiếng

## Bối cảnh

Hai việc của plugin, cùng một PR vì cùng chạm `manifest.mjs`, `manifest-import.mjs`, `gateway.mjs`:

1. **Cảnh (F, phần plugin).** `project.json` thêm `scenes: [{ id, label, shots }]` tùy chọn, và cờ `capabilities.picture_from_code` cho dự án dựng hình bằng mã (a-01 gọi `buildFilm` trong module nội tuyến, `a-01/index.html:218`). Với cờ này, kéo mép shot, thêm hay bớt shot bị từ chối có lý do; chỉ dời câu được.
2. **Cổng hình, tiếng (G).** Hiện nay cổng final so ngày sửa: animatic cũ hơn `index.html` hay `compositions/*.html` là FAIL (`OV/scripts/check-preflight.mjs:264`, hàm `newerThan` ở dòng 405-410). Lồng lại một câu chạy `timing.mjs`, viết lại khối `TIMING` trong `index.html`, nên mtime đổi và cổng FAIL dù hình không đổi. Ngược lại, sửa `scenes/s03.mjs` không đổi mtime của `index.html`, nên lọt qua. `visualHash` (`OV/scripts/render-final.mjs:135-161`) có sẵn nhưng chỉ dùng cho `--audio-only`, gồm cả khối `TIMING` và không gồm `scenes/` (điểm sai 7 của `plan.md`).

Thiết kế `pictureHash(project, composition)`:
- `index.html` đã bỏ thẻ audio (`stripAudio`) và bỏ đoạn giữa `/* TIMING:BEGIN */` và `/* TIMING:END */`. `TIMING` là dữ liệu sinh ra từ giọng và `PLAN.md` (`timing.mjs`); `PLAN.md` vẫn được cổng kiểm riêng bằng mtime (`check-preflight.mjs:263`), nên bỏ `TIMING` khỏi hash không làm lọt thay đổi kế hoạch;
- cộng mọi file trong `scenes/` (đệ quy, sắp theo tên);
- cộng phần còn lại như `visualHash`: tham chiếu cục bộ, `compositions/` không phải html, `assets/` trừ thư mục âm thanh (`SOUND_DIRS`).
`visualHash` giữ nguyên để `--audio-only` vẫn chặn khi hình đổi.

## Repo, nhánh, PR

opus-video (`$OVC`), nhánh `feat/scenes-and-picture-gate`, PR "feat(gate): cảnh trong manifest, cổng final so hash hình và tiếng". Merge cuối phase, rồi `git -C "$OVC" checkout main && git -C "$OVC" pull`.

## File sở hữu

`scripts/manifest.mjs`, `scripts/manifest-import.mjs`, `scripts/gateway.mjs`, `scripts/render-final.mjs` (thêm `pictureHash`, truyền cờ), `scripts/make-demo.mjs`, `scripts/check-preflight.mjs`, `scripts/studio-api.mjs` (khóa `mixBalance` của `COMMANDS`; `OPS` thêm `set_scenes` ở `gateway.mjs`), các test `scripts/tests/manifest.test.mjs`, `scripts/tests/manifest-import.test.mjs`, `scripts/tests/gateway.test.mjs`, `scripts/tests/picture-gate.test.mjs` (mới), tài liệu cổng final trong `references/` nếu có mục đó (tìm bằng `command grep -rln "approval:" "$OVC/references"`), `CHANGELOG.md`.

## Tốn lượt

Không.

## Task 8.1: `scenes` và `picture_from_code` trong manifest

Bước:
1. `manifest.mjs`: `scenes` tùy chọn; nếu có thì là mảng `{ id: /^c\d+$/, label: chuỗi, shots: [id shot có thật] }`, mỗi shot thuộc tối đa một cảnh, thứ tự cảnh theo thứ tự shot. `capabilities.picture_from_code` tùy chọn, kiểu bool.
2. `manifest-import.mjs`:
   - `picture_from_code: true` khi `index.html` có chuỗi `buildFilm(`. Không đoán thêm kiểu nào khác;
   - `scenes`: nếu có `scenes/scenes.json` (mảng `{ id, label, shots }`) thì dùng sau khi kiểm; nếu không mà có `script/scenes.json` (số câu → số cảnh kịch bản, như a-01) thì gom shot theo cảnh của câu nằm trong shot; các shot đầu chưa có câu nào gom vào một cảnh "Đầu phim"; không có cả hai thì bỏ `scenes`. Nhãn cảnh lấy từ tiêu đề cảnh nếu `scenes/scenes.json` có, không thì "Cảnh N".
   - Trước khi viết, đọc `$C/video/a-01/script/scenes.json` để biết đúng dạng (bản đồ hay mảng) rồi viết trình đọc cho dạng đó.
3. Test: dự án giả có `buildFilm(` cho cờ true; dự án giả có `script/scenes.json` ra cảnh đúng, có "Đầu phim"; `scenes` sai (shot lạ, shot trùng hai cảnh) bị `validate` từ chối.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/manifest*.test.mjs 2>&1 | tail -3
a01_import "$OVC" > "$T/a01-import-8.txt" 2>&1; echo "exit $?"
command grep '^WARN' "$T/a01-import-8.txt" | diff - "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-NO-NEW-WARN
node -e 'const m=require(process.argv[1]);console.log(m.capabilities.picture_from_code,(m.scenes||[]).length,"cảnh");process.exit(m.capabilities.picture_from_code===true&&m.scenes&&m.scenes.length>0?0:1)' "$T/a01-imp/a-01/project.json" && echo OK-A01-SCENES
```

## Task 8.2: Gateway: `set_scenes` và khóa kéo mép

Bước:
1. Op `set_scenes { scenes }`: kiểm như `validate`, ghi; biên nhận "đổi nhóm cảnh". Thêm vào `OPS`.
2. `resize_shot`, `add_shot`, `remove_shot` (`gateway.mjs:121`, `213`, `225`): khi `capabilities.picture_from_code` là true thì ném `OpError("hình dựng bằng mã (buildFilm): mốc shot đi theo lời; sửa lời hoặc scenes/*.mjs, không kéo mép")`. `move_line` vẫn chạy.
3. `remove_shot` và `add_shot` khi không có cờ: cập nhật `scenes` cho khớp (shot bị bỏ ra khỏi cảnh; shot mới vào cảnh của shot đứng trước).
4. Test: ba op bị từ chối với cờ, có đúng câu lý do; `move_line` vẫn qua; `set_scenes` sai bị từ chối.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/gateway*.test.mjs 2>&1 | tail -3
```

## Task 8.3: `pictureHash` và hash trong DEMO.md

Bước:
1. `render-final.mjs`: export `pictureHash` theo thiết kế ở Bối cảnh. Dùng lại `stripAudio`, `localRefs`, `subScenes`, `walk`, `SOUND_DIRS` có sẵn; không chép code. Tách phần chung của `visualHash` và `pictureHash` thành một hàm nội bộ nhận tùy chọn `{ timing: "keep" | "drop", scenesDir: bool }`.
2. `make-demo.mjs`, khi `--animatic` xong: ghi thêm `visual_hash: <pictureHash>` và `audio_hash: <audioHash>` vào DEMO.md. Thêm `visual_hash`, `audio_hash` vào `DEMO_KEYS` (dòng 47) và vào biểu thức giữ khóa của `writeDemoMd` (dòng 55), để lần chạy sau không xóa và không nhân đôi. Dòng `audio_review:` cũng phải được giữ khi chạy lại (thêm vào biểu thức giữ; không thêm vào `DEMO_KEYS` nếu `DEMO_KEYS` là danh sách make-demo tự viết, kiểm ý nghĩa ở dòng 47-57 trước khi sửa).
3. `make-demo.mjs --record-audio-review <ai>`: không render gì, chỉ ghi (hoặc thay) dòng `audio_review: <ai> <ISO> <audioHash hiện tại>` trong DEMO.md, phía trên `## Frames`, rồi exit 0. Studio gọi lệnh này qua `COMMANDS.demo` khi người dùng bấm "Nghe rồi, được" (phase 09), để cách tính hash chỉ nằm trong plugin.
4. Test `scripts/tests/picture-gate.test.mjs`: dự án giả nhỏ (index.html có TIMING và audio, `scenes/s01.mjs`, `assets/img/a.png`, `assets/voice/01.mp3`): đổi TIMING → `pictureHash` giữ nguyên, `visualHash` đổi; đổi `scenes/s01.mjs` → `pictureHash` đổi; đổi `assets/voice/01.mp3` → `pictureHash` giữ, `audioHash` đổi; `writeDemoMd` chạy lại giữ `visual_hash`, `audio_hash`, `audio_review`; `--record-audio-review user@studio` ghi đúng hash và không đụng `approval:`.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/picture-gate.test.mjs 2>&1 | tail -3
```

## Task 8.4: Cổng final so hash

Bước:
1. `check-preflight.mjs`, trong `checkAnimatic` (dòng 250-275), cho khóa `animatic` (không phải bản 9x16 khi chưa có hash riêng cho nó):
   - DEMO.md có `visual_hash:` → so với `pictureHash` hiện tại, bỏ phép `newerThan`. Khác → FAIL "hình đã đổi sau animatic được duyệt (<file đầu tiên khác nếu dò được>); chạy lại make-demo.mjs --animatic". Bằng → qua phần hình.
   - Có `audio_hash:` mà khác `audioHash` hiện tại → WARN "tiếng đã đổi sau animatic: nghe lại, chạy mix-balance.mjs và qc âm thanh, rồi bấm Nghe rồi, được". Nếu DEMO.md có `audio_review: <ai> <ISO> <hash>` với `<hash>` bằng `audioHash` hiện tại thì không WARN.
   - Không có `visual_hash:` (dự án cũ) → giữ nguyên cách so mtime cũ.
   - Cờ `--legacy-mtime`: luôn đi đường mtime cũ, in một dòng WARN "đang dùng --legacy-mtime". Ghi trong CHANGELOG: cờ này bỏ sau 2026-10-31.
2. `PLAN.md` mới hơn animatic vẫn FAIL như cũ (dòng 263), không đổi.
3. Phần kiểm khung demo (dòng 520-530, WARN "composition changed after the demo") giữ nguyên.
4. `render-final.mjs` chuyển cờ `--legacy-mtime` của nó sang preflight (cách nó đang gọi preflight `--stage final`, xem dòng 3 và phần dựng argv preflight).
5. Test trong `picture-gate.test.mjs`: dự án giả có animatic và hash; chỉ đổi voice → preflight final exit 0 kèm WARN "nghe lại"; thêm `audio_review` đúng hash → không WARN; đổi `scenes/s01.mjs` → FAIL; xóa `visual_hash:` → đường mtime cũ; `--legacy-mtime` → đường mtime cũ kèm WARN. Preflight cần khung demo và ffprobe đo chuyển động animatic: dùng tham số `motion`, `probe` mà `checkAnimatic` đã nhận (dòng 250) để tiêm giá trị giả trong test, không render thật.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
```

## Task 8.5: `COMMANDS.mixBalance`, tài liệu, PR

Bước:
1. `studio-api.mjs`: thêm `mixBalance: script("mix-balance.mjs")` vào `COMMANDS` (Studio dùng ở phase 09). Không đổi `STUDIO_API`.
2. Tài liệu: một đoạn về `visual_hash`, `audio_hash`, `audio_review`, `--legacy-mtime` ở chỗ đang nói về cổng final và `approval:`; một đoạn về `scenes` và `picture_from_code` ở tài liệu manifest. Nếu `references/*.md` là file sinh ra (đầu file có ghi "generated"), sửa nguồn và chạy lại script sinh tương ứng thay vì sửa tay.
3. Mở PR, merge, kéo `main` về `$OVC`.

Verify:
```bash
node -e 'import(process.argv[1]).then(m=>{console.log(m.STUDIO_API,Boolean(m.COMMANDS.mixBalance),m.OPS.includes("set_scenes"))})' "$OVC/scripts/studio-api.mjs"   # 4 true true
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
a01_import "$OVC" 2>&1 | command grep '^WARN' | diff - "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-A01
```

## Rủi ro

- Hash sai làm kẹt render final của dự án đang làm dở (Trung bình × Cao): dự án không có `visual_hash:` đi đường cũ; có `--legacy-mtime` làm lối thoát một tuần; test bao cả bốn ca.
- Bỏ `TIMING` khỏi hash làm lọt một thay đổi nhịp hình do lồng lại câu dài hơn (Trung bình × Thấp): WARN "nghe lại" bắt người dùng xem lại; nhóm cảnh có thể dựng lại riêng ở phase 09. Ghi rõ trong tài liệu.
- `scenes/` có file tạm (`.DS_Store`) làm hash đổi vô cớ (Thấp × Thấp): bỏ dotfile khi đi thư mục.

## Khôi phục

Revert PR trên `main` của opus-video, kéo lại `$OVC`. Bản cài `$OVI` chưa đổi tới phase 11.

## Kết quả thực hiện (2026-10-24)

Mọi task 8.1–8.5 xong, mọi Verify qua; chi tiết ở `reports/phase-08-ket-qua.md`. Tóm tắt:
- Plugin: PR https://github.com/abm-dungtq/opus-video/pull/8, squash `062c309` (thân sạch, không dòng ghi công). Test plugin 583 pass, 0 fail (mốc trước phase 569). `STUDIO_API` vẫn 4, `COMMANDS.mixBalance` có, `OPS` có `set_scenes`.
- a-01 nhập trên bản chép: exit 0, cùng dòng đầu `shots=20 lines=43 music=10 events=45`, không WARN mới; bản chép `--write` có `picture_from_code: true` và 8 cảnh (`c0` "Đầu phim" s1–s13, rồi `c3`–`c9` mỗi cảnh một shot). `$C/video/a-01` không có `project.json` lẫn `.opus`.
- Cổng: lồng lại một câu (đổi file giọng và khối TIMING) → chỉ WARN "tiếng đã đổi sau animatic…", hết WARN khi có `audio_review` đúng hash; sửa `scenes/s01.mjs` → FAIL "hình đã đổi sau animatic được duyệt (…scenes/s01.mjs…)". Không `visual_hash:` hoặc `--legacy-mtime` → đường mtime cũ (kèm WARN với cờ).
- Lệch so với phase: `pictureHash` bỏ thêm file âm thanh (`.mp3`, `.wav`… và `.words.json`, `.gate.json`) ở mọi thư mục của `assets/`, vì giọng tập series nằm ở `assets/mix/voice-NN.mp3`, ngoài `SOUND_DIRS`; không bỏ thì lồng lại một câu vẫn FAIL. Tài liệu manifest viết ở `skills/ov-studio/SKILL.md` (không có tài liệu manifest trong `references/`); `scripts/tests/studio-api.test.mjs` thêm `mixBalance` vào danh sách khóa `COMMANDS`. CHANGELOG sửa một đoạn bị chèn nhầm `# Changelog` từ PR trước.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`. Nếu thấy phải đổi hình dạng một trường có sẵn (không chỉ thêm), dừng và hỏi kongming theo mốc dừng 3.
