---
phase: 7
title: "Người nói, lồng tiếng theo vai và tạo giọng mới (E)"
status: done
effort: 8h
depends_on: ["phase-06"]
---

# Phase 07: Người nói và lồng tiếng theo vai

## Bối cảnh

Manifest hiện chỉ có `lines: [{ id, shot, text, file, start, duration, gate }]` (`OV/scripts/manifest.mjs:8`, kiểm ở dòng 65-76), không có người nói. Import đặt mọi câu `gate: "unknown"` (`OV/scripts/manifest-import.mjs:168`) và tìm lời ở `script/<tên file>.txt` (dòng 158-161), nên với a-01 (`assets/mix/voice-01.mp3`) nó tìm `script/voice-01.txt` là file không có, rồi rơi về `words.json`. Vai nằm ở `scenes/roles.json` của dự án (`"01": "ptv"`), dấu cổng ở `assets/voice/NN.mp3.gate.json` (điểm sai 6 của `plan.md`).

Phase này làm ba việc theo mục E của tài liệu:
1. Plugin: trường `speaker` tùy chọn; import nối vai và cổng theo số `NN`; hai op mới `set_line_speaker`, `set_line_audio`.
2. Kho series: role `ba-noi` trong `S/voices/roles.json` (cần để Voice Design chạy, điểm sai 14).
3. Studio: tool `series_tts` và `voice_design` (có thẻ đồng ý), route chọn giọng, ô người nói trong tab "Lời & giọng".

`STUDIO_API` giữ 4: trường mới là tùy chọn, op mới thêm vào `OPS` như tiền lệ `set_workflow_mode` (`OV/scripts/studio-api.mjs:9-10`); Studio dò op có trong `OPS` trước khi dùng, như `canSetWorkflowMode` (`lib/providers/opus-video.mjs:129-133`).

## Repo, nhánh, PR

- opus-video (`$OVC`): nhánh `feat/line-speaker`, PR "feat(manifest): người nói của câu, cổng giọng theo số câu". Merge trước phần Studio.
- Kho series S: một file dữ liệu, có sao lưu.
- Motion Studio: nhánh `feat/series-voice`, PR "feat(voice): lồng tiếng theo vai và tạo giọng mới cho series". Merge cuối phase.

## File sở hữu

- opus-video: `scripts/manifest.mjs`, `scripts/manifest-import.mjs`, `scripts/gateway.mjs` (mảng `OPS` ở dòng 61), `scripts/studio-api.mjs` (khóa `timing` của `COMMANDS`), `scripts/tests/manifest.test.mjs`, `scripts/tests/manifest-import.test.mjs`, `scripts/tests/gateway.test.mjs` (ba file này đã có), `references/manifest.md` nếu có, `CHANGELOG.md`.
- S: `S/voices/roles.json`.
- Motion Studio: `lib/tools/voice.mjs` (mới), `routes/voice.mjs` (mới), `lib/series-voice.mjs` (mới), `tests/series-voice.test.mjs` (mới), `tests/fake-plugin.mjs` (thêm op), `ui/src/panels/voice/VoiceTab.tsx`, `ui/src/panels/voice/VoiceTab.test.tsx`, `ui/src/ext/series/VoicePick.tsx` (mới), `ui/src/ext/series/index.ts` (đăng ký thẻ chọn giọng), `docs/series.md`, `CHANGELOG.md`.


## Tốn lượt

- Task 7.6 (thật): một lần Voice Design cho bà nội, 3 bản nghe thử. Người điều phối tự đồng ý thẻ này (lời cho phép của người dùng ở `plan.md`). Không chạy `save`: chọn giọng là việc của người dùng ở bước 7, vì tạo giọng thật cũng tốn lượt và là lựa chọn nghe bằng tai.
- Mọi test khác dùng ElevenLabs giả: biến `OV` trỏ một plugin giả và `cast-tts` giả trong series giả của `tests/fixtures/series/` (phase 03), không gọi mạng.

## Task 7.1: Trường `speaker` và import vai, cổng theo số câu (plugin)

Bước:
1. `manifest.mjs`: thêm `speaker` tùy chọn vào chú thích dòng 8 và vào `validate`: nếu có thì là chuỗi khớp `^[a-z0-9][a-z0-9-]{0,40}$`. Không bắt buộc, để manifest cũ vẫn hợp lệ.
2. `manifest-import.mjs`, trong khối dựng `lines` (dòng 156-169):
   - `nn` = nhóm số cuối của tên file (`voice-01` → `01`, `07` → `07`); không có số thì giữ cách cũ;
   - lời: thử `script/<tên file>.txt` như cũ, rồi `script/<nn>.txt`, rồi mới `words.json`;
   - `speaker`: nếu có `scenes/roles.json` và có khóa `nn` thì gán; không có thì bỏ trường;
   - `gate`: tìm dấu ở `<file>.gate.json` rồi `assets/voice/<nn>.mp3.gate.json`; có dấu và `stampMatches` (`OV/scripts/script-md.mjs:44`) với lời đọc được, không có `override`, thì `"pass"`; có dấu nhưng không khớp thì `"stale"`; không có dấu thì `"unknown"` như cũ.
3. Test: một dự án giả 3 câu (`assets/mix/voice-01.mp3`…, `script/01.txt`…, `scenes/roles.json`, dấu khớp cho câu 1, dấu lệch cho câu 2, không dấu câu 3) cho ra `speaker` đúng và gate `pass`, `stale`, `unknown`.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
a01_import "$OVC" > "$T/a01-import-7.txt" 2>&1; echo "exit $?"
command grep WARN "$T/a01-import-7.txt" | diff - "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-NO-NEW-WARN
```
`a01_import` (mục "Nhập thử a-01" của `plan.md`) nhập trên bản chép `$T/a01-imp/a-01`, không ghi vào a-01. Kiểm nội dung trên chính bản chép đó:
```bash
node -e 'const m=require(process.argv[1]);const r=require(process.argv[2]);const bad=m.lines.filter(l=>{const nn=(l.file.match(/(\d+)\.mp3$/)||[])[1];return l.speaker!==r[nn]||l.gate!=="pass"});console.log(m.lines.length,"câu, lệch",bad.length);process.exit(m.lines.length===43&&bad.length===0?0:1)' "$T/a01-imp/a-01/project.json" "$T/a01-imp/a-01/scenes/roles.json" && echo OK-A01-SPEAKERS
```

## Task 7.2: Op `set_line_speaker` và `set_line_audio` (plugin)

Bước:
1. `gateway.mjs`, cạnh `set_line_text` (dòng 154-160):
   - `set_line_speaker { id, speaker }`: kiểm định dạng như task 7.1; gán `l.speaker`; `l.gate = "stale"`; nếu dự án có `scenes/roles.json` thì cập nhật khóa `nn` của câu (ghi nguyên tử), để import lại không mất người nói; biên nhận "đổi người nói, cần lồng tiếng lại".
   - `set_line_audio { id, file, duration }`: `file` là đường trong dự án và phải tồn tại; `duration` số dương; gán cả hai; `gate` tính lại từ dấu như task 7.1 (dùng chung một hàm `gateOf(root, line)` export từ `manifest-import.mjs` hoặc một file nhỏ mới `scripts/line-gate.mjs`, không chép code hai nơi); không đổi `start`; nếu `duration` mới làm câu tràn sang shot sau thì vẫn ghi và thêm biên nhận cảnh báo, không tự dời câu.
2. Thêm hai tên vào `OPS` (`gateway.mjs:61`, `studio-api.mjs` xuất lại) và khóa `timing` vào `COMMANDS` (`studio-api.mjs:34`). Không đổi `STUDIO_API`.
3. Hai op từ chối khi manifest `capabilities.editable` là false, giống các op sửa khác (kiểm cách các op hiện có từ chối và làm y vậy).
4. Test: đổi người nói làm gate `stale` và sửa `scenes/roles.json`; `set_line_audio` với dấu khớp cho `pass`, với file không có thì lỗi; manifest không sửa được thì từ chối.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
node -e 'import(process.argv[1]).then(m=>{const o=m.OPS;process.exit(o.includes("set_line_speaker")&&o.includes("set_line_audio")?0:1)})' "$OVC/scripts/studio-api.mjs" && echo OK-OPS
node -e 'import(process.argv[1]).then(m=>console.log(m.STUDIO_API))' "$OVC/scripts/studio-api.mjs"   # phải in 4
```

Mở PR, merge, rồi `git -C "$OVC" checkout main && git -C "$OVC" pull`.

## Task 7.3: Role bà nội trong kho series

Bước:
1. Sao lưu: `cp -p "$S/voices/roles.json" "$BK/song-lag-phase07-$(date +%Y%m%d)-roles.json"` (tạo thư mục trước).
2. Thêm một phần tử vào mảng `S/voices/roles.json` theo đúng dạng các phần tử có sẵn (`id`, `name`, `description_en`, `sample_vi`):
   - `id: "ba-noi"`, `name: "Bà nội"`;
   - `description_en`: "Elderly Vietnamese countryside grandmother around 75, Northern accent, slow warm slightly raspy voice, blunt and affectionate, speaks to her grown son on a landline at night";
   - `sample_vi`: một đoạn 150 đến 300 ký tự giọng bà, có câu thoại thật của tập 2 ("Đẻ mỗi mày. Đêm hôm hỏi linh tinh. Ăn cơm chưa?", `$C/scripts/a-02-tai-khoan-facebook-dau-tien.md:99`) và vài câu đời thường không chửi thề (dòng 254: bà nội không chửi thề).
3. `sample_vi` là nội dung tiếng Việt, phải qua viet-pro: lưu đoạn đó ra `$T/ba-noi-sample.md` và chạy `node ~/.claude/skills/viet-pro/scripts/lint-vietnamese-content.mjs "$T/ba-noi-sample.md"` (exit 1 khi có ERROR; cổng `check-viet-pro.mjs` của plugin chạy trên cả dự án, không dùng cho một file lẻ). Có ERROR thì sửa câu.

Verify:
```bash
node -e 'const r=require(process.argv[1]);const b=r.find(x=>x.id==="ba-noi");process.exit(b&&b.sample_vi.length>=100&&b.sample_vi.length<=1000?0:1)' "$S/voices/roles.json" && echo OK-ROLE
node ~/.claude/skills/viet-pro/scripts/lint-vietnamese-content.mjs "$T/ba-noi-sample.md" && echo OK-LINT
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
```

## Task 7.4: Tool lồng tiếng theo vai (Studio)

Bước:
1. `lib/series-voice.mjs`:
   - `ttsLine({ projectDir, series, line, home })`: dựng argv của công cụ series `cast-tts` qua `buildArgv` (phase 03): `--role <line.speaker> --text-file script/<nn>.txt --out assets/voice/<nn>.mp3 --mix-out assets/mix/voice-<nn>.mp3 --visemes-out <đường viseme mà mẫu tập dùng>` (đúng cờ phase 02 thêm; đọc `S/tools/cast-tts.mjs` sau phase 02 để lấy tên cờ chính xác). Môi trường con có `OV=<home của provider>` để cổng viet-pro dùng đúng bản plugin.
   - Sau khi chạy: `ffprobe` đo độ dài file mix; gọi op `set_line_audio { id, file: "assets/mix/voice-<nn>.mp3", duration }` qua gateway của provider; chạy `COMMANDS.timing` của plugin (`timing.mjs --project .`) để cập nhật mốc. `COMMANDS` hiện không có `timing` (`OV/scripts/studio-api.mjs:34-48`), nên task 7.2 thêm `timing: script("timing.mjs")` vào `COMMANDS` trong cùng PR plugin (thêm khóa, không đổi `STUDIO_API`, như `OPS`); ghi biên nhận `op: "series-tts"` (vai, số câu, mã thoát, độ dài; không có khóa hay nội dung `.env`).
   - Mã thoát 4 của cast-tts là cổng viet-pro chặn: trả `{ ok: false, gate: "blocked", tail }` và không thử lại.
2. Thêm `"cast-tts"` vào `tools` của `S/studio-series.json` nếu phase 03 chưa có, với cờ `--role id`, `--text-file path:read`, `--out path:write`, `--mix-out path:write`, `--visemes-out path:write`, `--speed number`, `writes: ["{project}/assets"]`. Sao lưu file trước khi sửa.
3. `lib/tools/voice.mjs` export `TOOLS`:
   - `series_tts { project, ids }`: một câu thì chạy ngay (job `tts`), vì tài liệu cho lồng lại một câu lẻ không cần hỏi; từ hai câu trở lên thì tạo thẻ đồng ý `kind: "elevenlabs"` với ước tính số ký tự (tổng độ dài lời) và số câu, action `tts-batch`. Câu chưa có `speaker` thì từ chối với lời nhắn "Chọn người nói trước".
   - `voice_design { project, role }`: role phải có trong `roles.json` của series và chưa có trong `cast.json`; tạo thẻ đồng ý `kind: "elevenlabs"` ("Tạo 3 giọng thử cho <tên>, 1 lượt Voice Design"); action `voice-design` chạy `voice-design design --role <id>`, chép 3 file nghe thử sang `.opus/voice-design/<id>/` của dự án để giao diện phát được, rồi xếp thẻ chọn giọng.
4. `routes/voice.mjs`: `GET /api/voice/previews?name=` (các role đang chờ chọn và đường file nghe thử), `POST /api/voice/pick { name, role, pick }` chạy `voice-design save --role <id> --pick <n>` (người dùng bấm là đồng ý), ghi biên nhận `op: "voice-pick"`, rồi xếp yêu cầu cho đạo diễn "Giọng <tên> đã chọn. Lồng tiếng các câu của <tên> bằng series_tts."
5. `director.mjs` không đổi thêm: luật prompt của phase 03 đã cấm gọi `eleven.mjs tts`, `cast-tts` trực tiếp (sfx/music vẫn cho phép). Rủi ro còn lại ghi ở dưới.
6. Test `tests/series-voice.test.mjs` trên series giả (cast-tts giả ghi một mp3 im lặng nhỏ bằng ffmpeg, dấu cổng và in mã thoát theo biến môi trường): một câu chạy không thẻ, có biên nhận và `set_line_audio` được gọi; ba câu tạo thẻ, chưa đồng ý thì không chạy gì; mã thoát 4 trả `gate: "blocked"`; câu không có người nói bị từ chối; `voice_design` với role đã có trong `cast.json` bị từ chối; biên nhận không chứa chuỗi giống khóa.

Verify:
```bash
cd "$MS" && node --test tests/series-voice.test.mjs 2>&1 | tail -3
command grep -rn "eleven.mjs\|ELEVENLABS" "$MS/lib/series-voice.mjs" "$MS/lib/tools/voice.mjs" | head -3   # phải rỗng: Studio chỉ gọi công cụ series
```

## Task 7.5: Ô người nói và thẻ chọn giọng (giao diện)

Bước:
1. `VoiceTab.tsx`: mỗi thẻ câu thêm một ô chọn người nói (danh sách vai từ `GET /api/series?name=`, trường `roles`; dự án không thuộc series thì ô chỉ hiện chữ, không sửa), có chấm màu theo vai (màu cố định suy từ id, không lưu). Đổi người nói gửi op `set_line_speaker` khi provider có op này, rồi hiện "Cần lồng tiếng lại".
2. Nút "Lồng tiếng lại" trên câu `stale` gọi `series_tts` với một id; nút "Lồng tiếng các câu cũ" trên đầu tab gọi với mọi câu `stale` (sẽ ra thẻ đồng ý ở tab Tài sản; tab "Lời & giọng" hiện thẻ đó luôn bằng `ConsentCard` của phase 05).
   Lưu ý (kongming, checkpoint 04–05): tab Tài sản hiện chỉ lấy thẻ gắn với một đợt ảnh (`GET /api/assets` → `consent: waitingCard(...)` lọc `action.name === "asset-batch"`, `routes/assets.mjs`; `AssetsTab.tsx` đọc `batches[].consent`). Thẻ `kind: "elevenlabs"` của `series_tts`/`voice_design` (và `drive`, `thumbnail` ở phase 10) sẽ KHÔNG hiện nếu chỉ dùng lại component. Phải thêm trong `ui/src/ext/series/api.ts` một query `useConsent(name)` đọc `GET /api/consent?name=` (mọi thẻ `waiting`, không phân biệt action) và render danh sách đó bằng `ConsentCard` ở đầu tab Tài sản (thay cho `batches[].consent`, tránh hiện trùng) và ở tab "Lời & giọng". Test vitest: thẻ `elevenlabs` hiện ở cả hai tab, thẻ `codex` của đợt ảnh không hiện hai lần.
3. `VoicePick.tsx` trong `ui/src/ext/series/`: thẻ "Chọn giọng cho <tên>" với 3 trình phát và 3 nút "Chọn giọng này"; đăng ký vào tab Tài sản (phase 05) và vào phần "director" bằng `registerSection("director", …)` để người dùng thấy ở cả hai chỗ.
4. Test vitest: ô người nói gửi đúng op; dự án không series không sửa được; thẻ chọn giọng gọi `/api/voice/pick` với đúng số.

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
```

## Task 7.6: Kiểm thật trên a-02 (Tốn lượt ElevenLabs, một lần)

Bước:
1. Mở Studio thử 4420, root `$T/root-series` (symlink `a-01`, `a-02` trỏ tới `$C/video/…`), `OPUS_VIDEO_HOME="$OVC"` (như task 6.0).
2. Gọi `voice_design { project: "a-02", role: "ba-noi" }` qua `callTool` (cách task 4.5), đọc thẻ, đồng ý một lần. Ghi giờ và ước tính vào `$PLAN/reports/phase-07-ket-qua.md`.
3. Chờ job xong: 3 file ở `.opus/voice-design/ba-noi/`, `GET /api/voice/previews?name=a-02` có `ba-noi`. Không gọi `/api/voice/pick`.
4. Không chạy `series_tts` thật trong phase này: lời a-02 chưa có và chưa qua cổng viet-pro, còn lồng lại một câu a-01 sẽ tốn lượt ngoài phần được cho phép. Lồng tiếng thật là việc của người dùng ở bước 7; ở đây `series_tts` chỉ được kiểm bằng test của task 7.4.
5. Dừng Studio thử.

Tiêu chí thành công: 3 bản nghe thử có thật, mỗi file dài hơn 1 giây (`ffprobe`); một biên nhận `voice-design`; `cast.json` của S không đổi (chưa chọn).

Verify:
```bash
for f in "$C/video/a-02/.opus/voice-design/ba-noi/"*.mp3; do ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done
cmp -s "$S/voices/cast.json" "$BK/song-lag-phase06-"*/cast.json && echo OK-CAST-UNCHANGED
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json"; node "$MS/bin/motion-studio.mjs" stop ); lsof -i :4420 >/dev/null || echo OK-STOPPED
```

## Rủi ro

- Đạo diễn vẫn chạy được `node $OV/scripts/eleven.mjs` vì `ALLOWED_TOOLS` cho mọi `node $OV/scripts/*` (`OV/scripts/studio-api.mjs:63`) và plan không được sửa `ALLOWED_TOOLS` (Trung bình × Trung bình). Giảm bằng luật prompt của phase 03 và kiểm biên nhận: mọi file trong `assets/voice/` phải có biên nhận `series-tts`. Ghi rủi ro này trong `docs/series.md` và trong danh sách cho người dùng (phase 11). Chặn hẳn cần đổi `ALLOWED_TOOLS`, là việc của người dùng quyết.
- Import đổi `gate` của a-01 từ `unknown` sang `pass` làm Studio hiện khác (Thấp × Thấp): đây là ý muốn của tài liệu (mục E, kiểm "43 câu có speaker và gate pass").
- `set_line_speaker` ghi `scenes/roles.json`, một file ngoài `project.json` (Thấp × Trung bình): gateway đã ghi `index.html`; vẫn ghi nguyên tử và trong cùng khóa gateway.

## Khôi phục

Revert hai PR. Trả `S/voices/roles.json` từ bản sao lưu. Xóa `.opus/voice-design/` của a-02 nếu cần (không phải ảnh gốc; giữ cũng không hại).

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`. Riêng phase này: không đồng ý thẻ ElevenLabs thứ hai; nếu Voice Design lỗi, ghi báo cáo và để người dùng chạy lại từ Studio ở bước 7.

## Kết quả thực hiện (2026-10-24)

Mọi task 7.1–7.6 xong, mọi Verify qua; chi tiết ở `reports/phase-07-ket-qua.md`. Tóm tắt:
- Plugin: PR https://github.com/abm-dungtq/opus-video/pull/7, squash `40f8aeb` (`speaker`, import theo số `NN`, op `set_line_speaker`/`set_line_audio`, `COMMANDS.timing`; `STUDIO_API` vẫn 4). a-01 import trên bản chép: 43 câu, 0 lệch.
- Studio: PR https://github.com/abm-dungtq/motion-studio/pull/30, squash `67232cb` (`series_tts`, `voice_design`, `/api/voice/*`, ô người nói, thẻ Chọn giọng, `useConsent` ở tab Tài sản và tab Lời & giọng). Việc thêm a (thẻ đợt ảnh có `codex_max`, "tối đa M lượt Codex …") gộp vào PR này vì cùng sửa thẻ đồng ý.
- S: vai `ba-noi` trong `voices/roles.json`, khai báo `cast-tts`/`voice-design`, `voice-design.mjs` nhận từ lệnh sau cờ (ngoài danh sách file sở hữu, cần cho route), `hd-rig.mjs` tự tạo `poses/` (việc thêm b). Sao lưu ở `song-lag-phase07-20261024/`.
- 7.6: một lượt Voice Design thật cho bà nội (thẻ `c-mvm654p1-a302`, đồng ý 16:00:39), 3 bản nghe thử 23,6 s, 28,4 s, 24,2 s ở `a-02/.opus/voice-design/ba-noi/`. `cast.json` không đổi. Studio thử 4420 đã dừng, 4317 vẫn pid 82168.
- Chờ người dùng: chọn giọng bà nội (thẻ "Chọn giọng cho Bà nội"); 4317 cần restart để có route mới.
