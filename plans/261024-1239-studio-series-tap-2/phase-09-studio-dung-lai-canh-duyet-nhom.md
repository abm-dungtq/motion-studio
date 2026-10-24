---
phase: 9
title: "Dựng lại một cảnh, duyệt theo nhóm cảnh, thẻ nghe lại (F Studio, G thẻ)"
status: done
effort: 5h
depends_on: ["phase-08"]
---

# Phase 09: Dựng lại cảnh và duyệt theo nhóm

## Bối cảnh

Sau phase 08, manifest có `scenes` và `capabilities.picture_from_code`, DEMO.md có `visual_hash:`, `audio_hash:`, và `make-demo.mjs --record-audio-review` ghi dòng nghe lại. Phase này làm phần Studio:

1. Tool `scene_rebuild { scene }`: kiểm cue, rồi ảnh tĩnh, rồi clip nháp đúng khoảng của cảnh vào `demo/scenes/`, không render cả tập (tài liệu mục F).
2. Thẻ "Duyệt nhóm cảnh" ghi `- cảnh N: approved user@studio <ISO> <nhãn>` phía trên `## Frames` (dùng `writeDemoNote` của phase 05). Dòng này là ghi chú duyệt từng phần; cổng final vẫn cần dòng `approval:` từ thẻ animatic có sẵn (`gates.mjs:36-47`).
3. Khóa kéo mép shot trên giao diện khi `picture_from_code` (gateway đã từ chối ở phase 08; giao diện ẩn tay kéo và tắt phím S để người dùng không gặp lỗi).
4. Thẻ "Nghe lại": chạy mix-balance, hiện kết quả, nút "Nghe rồi, được".

Sự thật đã kiểm:
- `hyperframes render` không có cờ khoảng thời gian; chỉ có `-c <composition>`, `--quality`, `-o` (cách `OV/scripts/make-demo.mjs:139,164` gọi). `hyperframes snapshot <dir> --at t1,t2 -o <dir>` cắt ảnh tĩnh (dòng 158).
- Mẫu tập của phase 02 có điểm móc `window.PREVIEW = { from, to }`: timeline chạy từ `from` tới `to`.
- `validateCues(scene, allowedMoves, rigs, grids)` nằm ở `S/tools/runtime/rig-player.mjs:48`, có test ở `S/tools/tests/rig-player.test.mjs`.
- Ảnh ghép khung của tập 1: `S/spikes/film-stills.mjs <project> <out.png> <t>... [--cols 3] [--scale 1]` (dòng 4).
- a-01 dựng hình trong `scenes/film.mjs` từ `window.TIMING` (cảnh kịch bản 3 đến 9 là `s14` đến `s20`, `scenes/film.mjs:1-3`).

## Repo, nhánh, PR

- Kho series S: hai công cụ và khai báo trong `studio-series.json` (sao lưu trước).
- Motion Studio: nhánh `feat/scene-rebuild`, PR "feat(scenes): dựng lại một cảnh, duyệt nhóm cảnh, thẻ nghe lại". Merge cuối phase.

## File sở hữu

- S: `S/tools/scene-preview.mjs` (mới), `S/tools/tests/scene-preview.test.mjs` (mới), `S/studio-series.json` (khai báo `scene-preview`, `film-stills`).
- Motion Studio: `lib/scenes.mjs` (mới), `lib/tools/scenes.mjs` (mới), `routes/scenes.mjs` (mới), `routes/gates-audio.mjs` (mới, hai route POST), `server.mjs` (chỉ hàm `gateStatus`, dòng 276-290), `tests/scene-rebuild.test.mjs` (mới), `tests/audio-review.test.mjs` (mới), `ui/src/ext/series/ScenesCard.tsx` (mới), `ui/src/ext/series/AudioReview.tsx` (mới), `ui/src/ext/series/index.ts`, `ui/src/timeline/tracks/ShotTrack.tsx`, `ui/src/timeline/keys.ts`, `ui/src/timeline/timeline.test.tsx`, `ui/src/timeline/keys.test.ts`, `ui/src/core/timeline-edit.ts` (kiểu `Manifest`), `docs/series.md`, `CHANGELOG.md`.

## Tốn lượt

Không. Render nháp chạy trên máy (hyperframes, ffmpeg), không gọi Codex hay ElevenLabs.

## Task 9.0: Thăm dò render một khoảng (làm trước, quyết định nhánh)

Bước:
1. Trên bản chép `$T/root/a-99` (mẫu tập của phase 02, đã có `window.PREVIEW`), viết tay một `demo/scenes/preview-test.html`: chép `index.html`, thêm `<base href="../../">` đầu `<head>`, thêm `<script>window.PREVIEW={from:2,to:5}</script>` trước module, đặt `data-duration` của phần tử gốc thành `3`.
2. Chạy trong thư mục dự án: `npx hyperframes render -c demo/scenes/preview-test.html --quality draft -o demo/scenes/test.mp4`.
3. Đo `ffprobe` độ dài (phải khoảng 3 giây) và cắt một khung ở giây 1 để nhìn có đúng hình của giây 3 trong bản đầy đủ không.
4. Ghi kết quả vào `$PLAN/reports/phase-09-tham-do.md`, chọn một trong hai nhánh:
   - **Nhánh A (render khoảng chạy được):** `scene_rebuild` dùng cách này.
   - **Nhánh B (không chạy):** `scene_rebuild` render cả composition ở `--quality draft` một lần vào `demo/scenes/full-<pictureHash 12 ký tự>.mp4` (dùng lại nếu hash chưa đổi) rồi cắt khoảng bằng `ffmpeg -ss <from> -to <to> -c copy`. Chậm hơn ở lần đầu nhưng các cảnh sau nhanh.
5. Thăm dò thêm: chạy `node -e` import `scenes/film.mjs` của bản chép a-01 với một `timing` lấy từ khối TIMING, xem `buildFilm` có chạy trong node không (không cần DOM). Có thì `scene-preview` kiểm cue trong node; không thì kiểm cue trong trình duyệt (bước 2 của task 9.1).

Verify:
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 "$T/root/a-99/demo/scenes/test.mp4"
test -s "$PLAN/reports/phase-09-tham-do.md" && command grep -E "Nhánh (A|B)" "$PLAN/reports/phase-09-tham-do.md"
```

## Task 9.1: Công cụ series `scene-preview`

Bước:
1. Sao lưu `S/studio-series.json` vào `$BK/song-lag-phase09-<ngày>/`.
2. `S/tools/scene-preview.mjs --project <dir> --scene <cN> --from <s> --to <s> --out <dir>/demo/scenes/preview-<cN>.html`:
   - đọc `index.html`, chèn `<base href>` đúng số cấp từ `--out` về gốc dự án, chèn `window.PREVIEW`, sửa `data-duration` gốc thành `to - from`;
   - kiểm cue: nếu thăm dò cho thấy `buildFilm` chạy trong node, gọi nó với `TIMING` đọc từ khối `TIMING:BEGIN/END`, lấy các shot trong khoảng, gọi `validateCues` với `assets/rig/allowed-moves.json` và rig trong `assets/rig/rigs/`; lỗi thì in `ERROR <shot> <lý do>` và exit 3. Nếu không chạy được trong node, chèn vào trang một đoạn gọi `validateCues` trước khi dựng, ghi lỗi vào `document.title = "CUE-ERROR …"`, và in WARN "kiểm cue chạy trong trình duyệt".
   - In `RESULT {"html": "...", "from": s, "to": s}`.
3. Khai báo trong `S/studio-series.json` (theo luật cờ của phase 03): `scene-preview` (`--project project`, `--scene word`, `--from number`, `--to number`, `--out path:write`, `writes: ["{project}/demo"]`) và `film-stills` (`file: spikes/film-stills.mjs`, `positional` theo dạng `<project> <out.png> <t>...`, `--cols int`, `--scale int`, `writes: ["{project}/demo"]`). Nếu `buildArgv` của phase 03 chưa hỗ trợ positional nhiều kiểu, khai báo `film-stills` với `positional: "project path:write number*"` và mở rộng `buildArgv` cho dạng đó trong PR Studio này, có test.
4. Test `S/tools/tests/scene-preview.test.mjs`: trang sinh ra có `<base>` đúng, có `window.PREVIEW`, `data-duration` đúng; cue sai (động tác ngoài `allowed-moves.json`) thì exit 3 (nếu nhánh node).

Verify:
```bash
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
node -e 'const s=require(process.argv[1]);process.exit(s.tools["scene-preview"]&&s.tools["film-stills"]?0:1)' "$S/studio-series.json" && echo OK-DECLARED
```

## Task 9.2: Job `scene_rebuild` (Studio)

Bước:
1. `lib/scenes.mjs`:
   - `sceneWindow(manifest, sceneId)`: `from` = start của shot đầu, `to` = end của shot cuối trong `scenes[i].shots`; cảnh không có hay manifest không có `scenes` thì lỗi tiếng Việt "Dự án chưa có nhóm cảnh".
   - `rebuildScene({ projectDir, series, sceneId })` chạy trong job `scene` (một job mỗi dự án): (a) `scene-preview` qua `buildArgv`; (b) ảnh tĩnh: `film-stills` với 6 mốc chia đều trong khoảng, ra `demo/scenes/<cN>-stills.png`; với dự án không thuộc series dùng `npx hyperframes snapshot` như make-demo; (c) clip nháp theo nhánh của task 9.0 ra `demo/scenes/<cN>.mp4`; (d) ghi `.opus/scenes/<cN>.json` `{ from, to, stills, clip, built }` (`built` là giờ ISO; thẻ duyệt hiện "đã dựng lúc …"). Studio không tự tính hash hình; hash là việc của plugin ở cổng final. Biên nhận `op: "scene-rebuild"`.
2. `lib/tools/scenes.mjs` export `TOOLS`: `scene_rebuild { project, scene }` (đạo diễn gọi sau khi sửa `scenes/*.mjs`), `scene_list { project }`.
3. `routes/scenes.mjs`: `GET /api/scenes?name=` (cảnh, nhãn, trạng thái dựng, dòng duyệt đọc từ DEMO.md), `POST /api/scenes/rebuild { name, scene }`, `POST /api/scenes/approve { name, scenes: [cN], note? }` → với mỗi cảnh `writeDemoNote(dir, "cảnh N: approved user@studio <ISO> <nhãn>")`; chỉ nhận cảnh đã có clip; biên nhận `op: "scene-approve"`; xếp yêu cầu tiếp cho đạo diễn "Người dùng duyệt cảnh <N…>".
4. Test `tests/scene-rebuild.test.mjs` với series giả (công cụ giả `scene-preview` và `film-stills` ghi file nhỏ) và `hyperframes` giả trong `PATH` tạm (một script in ra file mp4 rỗng): cảnh có thật thì job ra đủ ba file và biên nhận; cảnh lạ trả 400; duyệt cảnh chưa dựng bị từ chối; duyệt hai cảnh ghi hai dòng đúng chỗ trên `## Frames`.

Verify:
```bash
cd "$MS" && node --test tests/scene-rebuild.test.mjs 2>&1 | tail -3
```

## Task 9.3: Thẻ nghe lại (Studio)

Bước:
1. `POST /api/gates/audio-check { name }`: chạy `COMMANDS.mixBalance` với `--project <dir>` (job `audio-check`), trả đầu ra tóm tắt (độ chênh giọng và nhạc, đích 4 đến 7 dB theo `CLAUDE.md` của Edit-Video mục 5). Không tốn lượt.
2. `POST /api/gates/audio-review { name }`: người dùng bấm "Nghe rồi, được" → chạy `COMMANDS.demo` với `["--project", dir, "--record-audio-review", "user@studio"]`; biên nhận `op: "audio-review"`.
3. Thẻ chỉ hiện khi preflight final báo WARN "tiếng đã đổi". `GET /api/gates` đã chạy `check-preflight --stage final --json` (`server.mjs:276-290`, hàm `gateStatus`) nhưng chỉ trả `errors`. Mở rộng `gateStatus` trả thêm `audio_changed: true` khi `j.warnings` có một dòng khớp `/tiếng đã đổi/`; giữ nguyên các trường cũ. Thẻ đọc trường này.
4. Test `tests/audio-review.test.mjs` với plugin giả (`tests/fake-plugin.mjs` thêm `mixBalance`, `demo --record-audio-review`, preflight in WARN): thẻ hiện khi có WARN, bấm thì gọi đúng lệnh với đúng argv.

Verify:
```bash
cd "$MS" && node --test tests/audio-review.test.mjs 2>&1 | tail -3
```

## Task 9.4: Giao diện: thẻ nhóm cảnh, thẻ nghe lại, khóa kéo mép

Bước:
1. `ScenesCard.tsx` (đăng ký `registerSection("director", …)` và trong tab Tài sản): danh sách cảnh, mỗi cảnh có nhãn, khoảng giờ, nút "Dựng lại cảnh này", ảnh ghép khung, trình phát clip nháp, ô chọn. Nút "Duyệt các cảnh đã chọn". Chỉ cảnh đã có clip mới chọn được.
2. `AudioReview.tsx`: thẻ "Tiếng đã đổi sau animatic" với kết quả mix-balance và nút "Nghe rồi, được". Đăng ký vào `registerSection("export", …)` để hiện trong hộp xuất bản, cạnh nút "Xuất video".
3. `ShotTrack.tsx`: khi `m.capabilities.picture_from_code` thì ẩn tay kéo mép (như khi `!editable`, dòng 102) và menu chuột phải không có mục cắt, thêm, xóa shot; rê chuột lên shot hiện chú thích "Hình dựng bằng mã: mốc shot đi theo lời. Dời câu thì được."
4. `keys.ts`: phím S (`case "split"`, dòng 23) không làm gì và hiện thông báo ngắn như trên khi có cờ.
5. Kiểu `Manifest` của giao diện (`ui/src/core/timeline-edit.ts:15`) thêm `scenes?` và `capabilities?: { picture_from_code?: boolean }`.
6. Test vitest: có cờ thì không có tay kéo, phím S không gọi `split`; không cờ thì như cũ; thẻ nhóm cảnh gửi đúng danh sách; thẻ nghe lại gọi đúng route.

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
```

## Task 9.5: Kiểm tích hợp

Bước (Studio thử 4420, root `$T/root`, `OPUS_VIDEO_HOME="$OVC"`):
1. Trên bản chép a-01 (`$T/root/a-01`, đã import bằng `$OVC` sau phase 08): gửi `resize_shot` qua `POST /api/patch` → lỗi có câu "hình dựng bằng mã"; gửi `move_line` → qua.
2. Trên `$T/root/a-99`: thêm `scenes/scenes.json` hai cảnh, import lại (`--force`), `POST /api/scenes/rebuild` cảnh `c1` → có `demo/scenes/c1.mp4`, `c1-stills.png`; duyệt `c1`, `c2` (dựng `c2` trước) → DEMO.md có hai dòng; không có `renders/` mới (không render cả tập).
3. Dừng Studio thử.

Verify:
```bash
ls "$T/root/a-99/demo/scenes/"
command grep -n "cảnh [12]: approved" "$T/root/a-99/DEMO.md"
test ! -d "$T/root/a-99/renders" || test -z "$(ls -A "$T/root/a-99/renders")" && echo OK-NO-FULL-RENDER
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json"; node "$MS/bin/motion-studio.mjs" stop ); lsof -i :4420 >/dev/null || echo OK-STOPPED
```

## Rủi ro

- `hyperframes render -c` không nhận trang trong `demo/scenes/` hay `<base>` (Trung bình × Trung bình): task 9.0 quyết định nhánh trước khi viết mã; nhánh B luôn chạy được.
- Clip nháp lệch hình so với bản đầy đủ do `PREVIEW` không bắt đầu đúng trạng thái GSAP (Trung bình × Thấp): thăm dò so một khung; nếu lệch, nhánh B.
- Kiểm cue trong trình duyệt không chặn render (Thấp × Thấp): lỗi hiện trong tiêu đề và WARN; vẫn tốt hơn hiện nay (không kiểm).
- Thẻ nghe lại tốn thời gian chạy preflight mỗi lần mở (Thấp × Thấp): chỉ chạy khi mở hộp xuất bản.

## Khôi phục

Revert PR Studio. Trả `S/studio-series.json` từ bản sao lưu; xóa `S/tools/scene-preview.mjs` và test của nó. File trong `demo/scenes/` là sản phẩm phụ, xóa được.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.

## Kết quả thực hiện

- Xong ngày 2026-10-24. Motion Studio có PR [#31](https://github.com/abm-dungtq/motion-studio/pull/31), squash vào main `ab81a79`. Series S có thêm `tools/scene-preview.mjs` kèm test, và `scene-preview` đã được khai báo.
- Task 9.0 đi nhánh A: trang xem trước render đúng khoảng giây của cảnh, khung trùng bản đầy đủ. Chi tiết ở `reports/phase-09-tham-do.md`.
- Verify của task 9.1 trượt có chủ đích ở dòng `OK-DECLARED`: `film-stills` không được khai báo vì `validateSeries` chỉ nhận một kiểu cho `positional` và công cụ không chạy đúng trên mẫu tập. Ảnh ghép được cắt từ clip nháp. Xem `reports/phase-09-su-co.md`.
- `npm test` của Studio sạch: node 455 pass, 2 skip; vitest 268 pass.
- Kiểm tích hợp ở cổng 4420:
  - Trên bản chép a-01, `resize_shot` bị từ chối vì "hình dựng bằng mã", còn `move_line` qua.
  - Trên a-99, dựng c1 và c2 rồi duyệt cả hai mà không render cả tập. Chi tiết ở `reports/phase-09-ket-qua.md`.
