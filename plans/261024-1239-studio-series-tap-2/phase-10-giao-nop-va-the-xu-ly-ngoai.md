---
phase: 10
title: "Giao nộp vào kho series, tải lên Drive, thẻ cần xử lý ngoài (H, I)"
status: done
effort: 9h
depends_on: ["phase-09"]
---

# Phase 10: Giao nộp và thẻ cần xử lý ngoài

## Bối cảnh

Mục H của tài liệu: năm việc giao nộp đều ghi vào `S/kenh-youtube/tap-N/` (khóa `delivery_dir` của `S/studio-series.json`, phase 03). Logo đã là lớp `img#brand-logo` của mẫu tập từ phase 02, nên phase này không làm lại.

Sự thật đã kiểm:
- `export.mjs --project <dir> --input <renders/x.mp4> --target youtube,facebook,tiktok [--no-thumb]` ghi ra cạnh file vào, không bao giờ ghi đè (mã thoát 2 khi đã có), chạy preflight final trước (mã thoát 5 khi cổng chặn) (`OV/scripts/export.mjs:1-20`).
- `make-thumbnail.py <ảnh vẽ> <file ra.jpg> "<dòng 1>" "<dòng 2>" [red|yellow|cyan]` ra 1280×720, chữ ở nửa phải (`S/kenh-youtube/make-thumbnail.py:1-14`). `python3` có PIL.
- `check-platform.mjs <kênh> <draft.md>` đọc các mục `## title`, `## description`… (`~/.claude/skills/viet-pro/scripts/check-platform.mjs:1-7`), ERROR thì exit 1.
- `check-viet-pro.mjs --project <dir> --stage delivery` nằm trong plugin (`OV/scripts/check-viet-pro.mjs:4`), đọc `CAPTIONS.md` của dự án (điểm sai 11 của `plan.md`).
- Đã có bản nháp `S/kenh-youtube/tap-2-tieu-de-mo-ta.md` (điểm sai 13).
- `gws` ở `~/.local/bin/gws`, có `--upload`, `--params`, `--json`; tài liệu nói gws từ chối đường ngoài thư mục hiện tại, nên chạy với `cwd` là thư mục của file.

Mục I: một bước hỏng hai lần cùng mã lỗi thì ghi `.opus/handoff/<bước>.md` và hiện thẻ có câu để dán vào Claude Code; thẻ tắt khi file có dòng `resolved:`.

## Repo, nhánh, PR

- opus-video (`$OVC`): nhánh `feat/delivery-commands`, PR "feat(delivery): phụ đề từ words.json, lệnh giao nộp trong COMMANDS". Merge trước phần Studio.
- Motion Studio: nhánh `feat/series-delivery`, PR "feat(delivery): giao nộp vào kho series, tải lên Drive, thẻ cần xử lý ngoài". Merge cuối phase.
- S: `S/studio-series.json` thêm khai báo `make-thumbnail` (sao lưu trước).

## File sở hữu

- opus-video: `scripts/captions-from-words.mjs` (mới), `scripts/tests/captions-from-words.test.mjs` (mới), `scripts/studio-api.mjs` (khóa `export`, `vietPro`, `platform`, `captions` của `COMMANDS`), `CHANGELOG.md`.
- S: `S/studio-series.json`.
- Motion Studio: `lib/delivery.mjs` (mới), `lib/drive.mjs` (mới), `lib/handoff.mjs` (mới), `lib/tools/delivery.mjs` (mới), `routes/delivery.mjs` (mới), `routes/handoff.mjs` (mới), `lib/tools/series.mjs`, `lib/tools/assets.mjs`, `lib/tools/voice.mjs`, `lib/tools/scenes.mjs` (chỉ thêm lời gọi `noteFailure`/`noteSuccess`), `lib/consent.mjs` (đăng ký action `thumbnail`, `drive-upload`), `tests/delivery.test.mjs`, `tests/drive-upload.test.mjs`, `tests/handoff.test.mjs`, `tests/fake-gws.mjs` (mới), `ui/src/ext/series/DeliveryPanel.tsx`, `ui/src/ext/series/HandoffCard.tsx`, `ui/src/ext/series/index.ts`, `docs/series.md`, `CHANGELOG.md`.

## Tốn lượt

- `deliver_thumbnail`: 3 ảnh Codex. Có thẻ đồng ý. Trong phase này chỉ kiểm bằng CLI giả; người dùng chạy thật ở bước 7.
- `drive_upload`: không tốn lượt Codex hay ElevenLabs nhưng ghi lên Drive của người dùng, nên cũng có thẻ đồng ý (`kind: "drive"`). Phase này chỉ kiểm bằng gws giả và `--dry-run` của gws thật; tải thật là việc của người dùng.

## Task 10.1: Phụ đề từ `words.json` và lệnh trong `COMMANDS` (plugin)

Bước:
1. `scripts/captions-from-words.mjs --project <dir> --out <file.srt> [--max-chars 42] [--max-lines 2]`: đọc mọi câu trong `project.json` theo thứ tự `start`, lấy từ ở `<file>.words.json` của câu (giờ tương đối tính từ `start` của câu; kiểm cách `manifest-import.mjs:162-166` đọc words để dùng đúng), gom thành khối phụ đề không quá `max-chars` mỗi dòng và `max-lines` dòng, ngắt ở dấu câu nếu có, mỗi khối từ 1 đến 6 giây. Câu không có words thì chia đều lời theo độ dài câu và in WARN. Bỏ `[bíp]` khỏi chữ hiển thị nếu lời có (theo quy ước kịch bản tập 2, dòng 26).
2. `COMMANDS` thêm: `export: script("export.mjs")`, `vietPro: script("check-viet-pro.mjs")`, `captions: script("captions-from-words.mjs")`, `platform: <đường tuyệt đối tới check-platform.mjs của viet-pro>`. Đường viet-pro tìm bằng hàm có sẵn của `skill-paths.mjs` (cách `check-viet-pro.mjs:6-8` tìm viet-pro), không viết cứng `~/.claude`. Không đổi `STUDIO_API`.
3. Test: dự án giả 2 câu có words → SRT đúng số khối, giờ tăng dần, không khối nào quá 42 ký tự mỗi dòng; câu không words → WARN và vẫn có khối.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
node "$OVC/scripts/captions-from-words.mjs" --project "$T/a01-imp/a-01" --out "$T/a01.srt" && head -12 "$T/a01.srt"
```
(`$T/a01-imp/a-01` là bản chép đã import của hàm `a01_import`; chạy `a01_import "$OVC"` trước nếu chưa có.)

Mở PR, merge, kéo `main`.

## Task 10.2: Công cụ giao nộp (Studio)

Bước:
1. `lib/delivery.mjs`, chung cho bốn việc: `deliveryDir(series, episode)` từ `delivery_dir` thay `{N}` bằng `episode` của BRIEF; tạo thư mục nếu chưa có; chép file vào đó không bao giờ ghi đè (đã có và khác sha thì thêm hậu tố `-2`, `-3`); mỗi việc ghi biên nhận `op: "deliver-<việc>"` có tên file, kích thước, sha.
2. `deliver_text { project }`:
   - nguồn: `S/kenh-youtube/tap-<N>-tieu-de-mo-ta.md` nếu có (đọc qua `seriesPath`), không thì khung trống có `## title`, `## description`;
   - thêm mốc chương vào cuối mục mô tả: mỗi cảnh trong `scenes` của manifest một dòng `m:ss <nhãn>`, dòng đầu luôn `0:00`;
   - ghi bản nháp vào dự án `delivery/tieu-de-mo-ta.md`, nhờ đạo diễn sửa lời nếu cần (yêu cầu tiếp), rồi chạy `COMMANDS.platform` với `youtube` và chạy lint viet-pro (`lint-vietnamese-content.mjs` cạnh `check-platform.mjs`); ERROR thì dừng, trả dòng lỗi;
   - qua thì chép sang `tap-N/tieu-de-mo-ta.md`.
3. `deliver_captions { project }`: `COMMANDS.captions` ra `delivery/<dự án>.srt`; cần `CAPTIONS.md` ở gốc dự án có mục Facebook và TikTok (đạo diễn viết; thiếu thì trả lời nhắn và xếp yêu cầu cho đạo diễn); chạy `COMMANDS.vietPro --project <dir> --stage delivery`; qua thì chép SRT và `CAPTIONS.md` sang `tap-N/`.
4. `deliver_export { project, input? }`: `input` mặc định là file `renders/*-final.mp4` mới nhất; chạy `COMMANDS.export --project <dir> --input <input> --target youtube,facebook,tiktok --no-thumb` (job `export`, một mỗi dự án); mã 5 thì trả "cổng final chặn" kèm đầu ra preflight; xong thì chép ba file ra `tap-N/`.
5. `deliver_thumbnail { project, line1, line2, accent? }`:
   - tạo thẻ đồng ý `kind: "codex"` "3 ảnh nền thumbnail, ước 3 lượt vẽ" với action `thumbnail`;
   - action: một đợt ảnh 3 mục `kind: "thumbnail"` qua `runBatch` của phase 04 (khuôn `image_styles.thumbnail` chừa 45% bên phải), không tách nền;
   - mỗi ảnh xong chạy công cụ series `make-thumbnail` (khai báo ở bước 6) ra `delivery/thumb-<i>.jpg`;
   - bảng duyệt "Thumbnail" ở tab Tài sản (dùng `Board.tsx` của phase 05, `board: "thumbnail"`); duyệt một ảnh thì chép thành `tap-N/thumbnail.jpg`.
6. Khai báo `make-thumbnail` trong `S/studio-series.json`. Hợp đồng phase 03 đã merge (`validateSeries` của plugin, `buildArgv` của Studio) chỉ nhận `file` đuôi `.mjs` chạy bằng `node`, và `positional` là MỘT kiểu (có thể thêm `*`), không nhận danh sách kiểu hay `interpreter`. Vì vậy: viết một bọc `S/kenh-youtube/make-thumbnail.mjs` dùng `parseArgs` rồi `spawnSync("python3", [join(S, "kenh-youtube/make-thumbnail.py"), …])` với các cờ đã kiểm, và khai báo `{ "file": "kenh-youtube/make-thumbnail.mjs", "flags": { "--in": "path:read", "--out": "path:write", "--line1": "text", "--line2": "text", "--accent": "word" }, "writes": ["{project}/delivery"], "timeout_s": 120 }`. Không thêm `interpreter` vào `buildArgv` (giữ bất biến "công cụ series là file .mjs chạy bằng node" của `docs/series.md`); đổi ý thì phải tăng hợp đồng ở cả plugin lẫn Studio và hỏi kongming trước.
7. `lib/tools/delivery.mjs` export `TOOLS` cho bốn việc và `delivery_status { project }` (file nào đã có trong `tap-N/`).
8. Test `tests/delivery.test.mjs` trên series giả và plugin giả: mỗi việc ra đúng file trong `tap-N/` của series giả; chạy hai lần không ghi đè; `deliver_export` khi export giả trả 5 thì báo cổng chặn; `deliver_thumbnail` không tốn lượt khi chưa đồng ý; check-platform giả trả 1 thì không chép.

Verify:
```bash
cd "$MS" && node --test tests/delivery.test.mjs 2>&1 | tail -3
```

## Task 10.3: Tải lên Drive (Studio)

Bước:
1. `lib/drive.mjs`, lệnh gws lấy từ `MOTION_STUDIO_GWS` hoặc `gws` trong các đường tìm CLI (như `lib/agents/run.mjs:15-17` tìm agent), chạy `shell: false`:
   - kiểm tài khoản: `gws drive about get --params '{"fields":"user(emailAddress)"}'`; khác `drive.account` của series thì dừng với lời nhắn tiếng Việt (in email đã che như route series, ví dụ `xao…@gmail.com`);
   - tìm thư mục `drive.folder` ở gốc: `gws drive files list --params '{"q":"name = '\''<folder>'\'' and mimeType = '\''application/vnd.google-apps.folder'\'' and '\''root'\'' in parents and trashed = false","fields":"files(id,name)"}'`; không có thì tạo bằng `gws drive files create --json '{"name":"<folder>","mimeType":"application/vnd.google-apps.folder"}'`;
   - mỗi file trong `tap-N/` (mp4, jpg, srt, md): chạy `gws drive files create --json '{"name":"<tên>","parents":["<id>"]}' --upload <tên>` với `cwd` là `tap-N/`; đọc `id`, `size`, `webViewLink` từ kết quả (thêm `--params '{"fields":"id,size,webViewLink"}'`);
   - so `size` với kích thước trên máy; lệch thì đánh dấu lỗi file đó;
   - biên nhận `op: "drive-upload"` chỉ có tên file, kích thước, link, kết quả so; không lưu đầu ra thô của gws (có thể có token).
2. Tool `drive_upload { project, dry_run? }`: tạo thẻ `kind: "drive"` "Tải <n> file (<tổng MB>) lên Drive <email đã che>/<folder>"; action `drive-upload`. `dry_run: true` thêm `--dry-run` của gws cho mọi lệnh ghi và không cần thẻ.
3. `tests/fake-gws.mjs`: một CLI giả nhận đúng các lệnh trên, giữ trạng thái trong một file JSON tạm, trả `size` bằng kích thước thật của file `--upload` (hoặc lệch khi đặt biến môi trường để thử nhánh lệch), và in một trường `access_token` giả để thử rằng biên nhận không chép nó.
4. Test `tests/drive-upload.test.mjs`: tài khoản sai thì dừng; thư mục chưa có thì tạo một lần, lần hai dùng lại; kích thước lệch báo lỗi đúng file; biên nhận không chứa `access_token`; chưa đồng ý thì không gọi lệnh ghi nào.

Verify:
```bash
cd "$MS" && node --test tests/drive-upload.test.mjs 2>&1 | tail -3
command grep -rn "access_token" "$MS/lib/drive.mjs" | head -2   # chỉ được xuất hiện trong chỗ lọc, không in ra
```

Kiểm với gws thật, chỉ chạy khô (không ghi Drive): trên Studio thử 4420, gọi `drive_upload { project: "a-99", dry_run: true }` sau khi tạo vài file nhỏ trong `tap-99/` của series giả (không dùng `S` thật) và đặt `drive.account` của series giả bằng email gws đang đăng nhập (đọc bằng `gws drive about get`, chỉ so trong mã, không in). `gws drive files create` có `--dry-run` ("Validate the request locally without sending it to the API", đã kiểm bằng `--help`). Lệnh tìm thư mục (`files list`) là lệnh đọc, chạy thật cũng không ghi gì.

## Task 10.4: Thẻ cần xử lý ngoài (I)

Bước:
1. `lib/handoff.mjs`:
   - `noteFailure(dir, { step, code, tail, command })`: ghi vào `.opus/failures.json` (nguyên tử) `{ <step>: { code, count, last, tail } }`; cùng `step` và cùng `code` lần thứ hai liên tiếp thì ghi `.opus/handoff/<step>.md` và trả `{ handoff: true }`;
   - nội dung `.opus/handoff/<step>.md`: tiêu đề tiếng Việt, bước nào, lệnh đã chạy (argv, không có biến môi trường), mã lỗi, 30 dòng cuối, đường dự án, và một khối "Dán vào Claude Code ở terminal" gồm câu nhờ sửa đúng việc đó trong thư mục dự án hoặc kho series; dòng cuối hướng dẫn "Sửa xong thì thêm một dòng `resolved: <ghi chú>` vào file này";
   - `noteSuccess(dir, step)`: xóa đếm của bước đó (không xóa file handoff);
   - `openHandoffs(dir)`: các file trong `.opus/handoff/` chưa có dòng `^resolved:`.
2. Gọi `noteFailure`/`noteSuccess` ở mọi tool chạy công cụ: `series_tool` (bước = tên công cụ, ví dụ `build-rig`), `asset_batch` (bước `asset-batch`), `series_tts` (`tts`), `scene_rebuild` (`scene-<cN>`), bốn `deliver_*`, `drive_upload`. Biên nhận `op: "handoff"` khi một file handoff được tạo.
3. Route `GET /api/handoff?name=` (danh sách thẻ mở, đọc nội dung file), `POST /api/handoff/resolve { name, step, note }` (thêm dòng `resolved: user@studio <ISO> <note>`; người dùng cũng có thể tự thêm bằng tay hay Claude Code thêm).
4. `HandoffCard.tsx`: thẻ đỏ nhạt ở phần "director" (`registerSection("director", …)`), tiêu đề "Cần xử lý ngoài: <bước>", khối câu để dán có nút "Chép", nút "Đã xử lý". Thẻ biến mất khi file có `resolved:`.
5. Test `tests/handoff.test.mjs`: `build-rig` giả lỗi mã 3 hai lần thì có file và thẻ mở; một lần lỗi mã 3 rồi một lần mã 4 thì chưa có; thêm `resolved:` thì không còn thẻ mở; nội dung file không chứa biến môi trường hay chuỗi giống token.

Verify:
```bash
cd "$MS" && node --test tests/handoff.test.mjs 2>&1 | tail -3
```

## Task 10.5: Bảng giao nộp (giao diện) và toàn bộ test

Bước:
1. `DeliveryPanel.tsx`, đăng ký `registerSection("export", …)`: năm dòng (Video, Thumbnail, Tiêu đề và mô tả, Phụ đề, Drive), mỗi dòng có trạng thái từ `delivery_status` ("chưa có", "đã có trong tap-N", "lỗi: …") và một nút chạy. Nút Drive mở thẻ đồng ý. Thẻ `drive` và thẻ `thumbnail` (kind `codex`, action `thumbnail`) hiện qua `useConsent(name)` (`GET /api/consent?name=`) mà phase 07 thêm vào `ui/src/ext/series/api.ts`; render `ConsentCard` ngay trong `DeliveryPanel` dưới dòng tương ứng, vì `GET /api/assets` chỉ gắn thẻ của đợt ảnh (ghi chú kongming, checkpoint 04–05). Không có nút nào ghi đè file đã có.
2. Test vitest cho bảng và thẻ.
3. Chạy toàn bộ test ba nơi.

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
```

## Task 10.6: Kiểm tích hợp với dữ liệu giả

Bước (Studio thử 4420, root `$T/root`, `OPUS_VIDEO_HOME="$OVC"`, `MOTION_STUDIO_AGENT_PATH="$T/fakebin"`, `MOTION_STUDIO_GWS="node $MS/tests/fake-gws.mjs"` nếu biến cho phép lệnh có đối số; nếu không, một script nhỏ `$T/fakebin/gws` gọi nó):
1. `a-99` trỏ series giả `$T/series-gia` (như task 5.4).
2. Gọi `deliver_text`, `deliver_captions` (viết một `CAPTIONS.md` mẫu có hai mục trước), `deliver_thumbnail` (đồng ý thẻ, CLI giả vẽ), `drive_upload` (đồng ý thẻ, gws giả).
3. Giả lập `build-rig` lỗi hai lần bằng `series_tool` với `--char khong-co` → thẻ cần xử lý ngoài hiện trong `GET /api/handoff`; `POST /api/handoff/resolve` → thẻ tắt.
4. Dừng Studio thử.

Tiêu chí thành công: `$T/series-gia/kenh-youtube/tap-99/` (theo `delivery_dir` của series giả) có tiêu đề, SRT, `CAPTIONS.md`, thumbnail; gws giả có đủ file với kích thước khớp; quét biên nhận không thấy chuỗi giống token; S thật không đổi.

Verify:
```bash
ls "$T/series-gia/kenh-youtube/tap-99/"
command grep -rEl 'access_token|sk-[A-Za-z0-9]{20,}|ya29\.' "$T/root/a-99/.opus/receipts" && echo LEAK || echo OK-NO-TOKEN
curl -s "http://127.0.0.1:4420/api/handoff?name=a-99" | head -c 200; echo
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json"; node "$MS/bin/motion-studio.mjs" stop ); lsof -i :4420 >/dev/null || echo OK-STOPPED
```

## Rủi ro

- Tải lên Drive sai tài khoản hay sai thư mục (Thấp × Cao): kiểm email trước mọi lệnh ghi, thẻ đồng ý hiện email đã che và tên thư mục, chỉ thư mục ở gốc có đúng tên.
- Đầu ra gws có token và lọt vào biên nhận hay log job (Trung bình × Cao): biên nhận chỉ ghi trường chọn lọc; log job chỉ giữ dòng tóm tắt; test có `access_token` giả.
- Viết cứng đường viet-pro trong plugin (Thấp × Trung bình): dùng `skill-paths.mjs`.
- `CAPTIONS.md` là chữ quảng bá tiếng Việt, cần viet-pro (Trung bình × Trung bình): đạo diễn viết, cổng `check-viet-pro --stage delivery` chặn; không có đường lách.

## Khôi phục

Revert hai PR. Trả `S/studio-series.json` từ bản sao lưu. File đã chép vào `tap-N/` không bị xóa tự động; xóa tay nếu là dữ liệu thử.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`. Không chạy `drive_upload` thật (không `dry_run`) ở bất kỳ bước nào của phase này.

## Kết quả thực hiện

- Xong ngày 2026-10-24. opus-video có PR [#9](https://github.com/abm-dungtq/opus-video/pull/9), squash vào main `6ae4fbf`. Motion Studio có PR [#32](https://github.com/abm-dungtq/motion-studio/pull/32), squash vào main `7db2350`. Series S có thêm `make-thumbnail` (bọc `kenh-youtube/make-thumbnail.mjs`), bản sao lưu ở `/Volumes/2/Hoạt hình/plans/backups/song-lag-phase10-20261024/`.
- Test: plugin 589 pass; Studio node 474 pass, 2 skip, vitest 275 pass, tsc sạch; S 55 pass. `a01_import` trên main `6ae4fbf` không có WARN mới.
- Chặn giọng: probe `claude -p --model haiku` cho thấy `eleven.mjs tts --help` bị từ chối, còn `sfx --help` vẫn chạy. Ở bản đối chứng không có luật chặn, cả hai lệnh đều chạy.
- Kiểm tích hợp ở cổng 4420, trên series giả:
  - tiêu đề qua check-platform và lint thật;
  - thumbnail do CLI giả vẽ, đã chọn thành `thumbnail.jpg`;
  - Drive qua gws giả khớp kích thước, và chạy khô với gws thật;
  - thẻ cần xử lý ngoài mở rồi tắt.
  - Phụ đề bị cổng viet-pro thật chặn đúng (a-99 chưa có bản ghi viet_pro). Chi tiết ở `reports/phase-10-ket-qua.md`.
- Lệch so với phase:
  - bảng chọn thumbnail nằm trong bảng Giao nộp, không ở tab Tài sản;
  - action được đăng ký trong `routes/delivery.mjs`, không ở `lib/consent.mjs`;
  - `make-thumbnail.py` có thêm đối số nhãn;
  - Drive bỏ qua file đã có cùng tên và cùng cỡ.
