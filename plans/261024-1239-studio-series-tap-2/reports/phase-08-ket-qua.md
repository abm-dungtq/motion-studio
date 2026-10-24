# Phase 08: kết quả (2026-10-24, Asia/Saigon)

## PR

| Repo | PR | Squash | Nội dung |
|---|---|---|---|
| opus-video | https://github.com/abm-dungtq/opus-video/pull/8 | `062c309` | `scenes` và `capabilities.picture_from_code` trong manifest, op `set_scenes`, khóa kéo mép/thêm/bớt shot khi hình dựng bằng mã, `pictureHash`, `visual_hash`/`audio_hash`/`audio_review` trong DEMO.md, cổng final so hash, `--legacy-mtime`, `COMMANDS.mixBalance` |

Thân squash sạch (không dòng ghi công, không mã phase). Nhánh `feat/scenes-and-picture-gate` đã xoá; `$OVC` ở `main` @`062c309`. Bản cài `$OVI` không đổi (@`4fbc815`). Repo không có CI.

## File đã sửa (trong `$OVC`)

- `scripts/manifest.mjs`: `SCENE_ID`, `validateScenes(scenes, shots)` (id `c<#>` không trùng, `label` chuỗi, `shots` không rỗng, shot có thật, mỗi shot một cảnh, nối mọi cảnh theo thứ tự thì shot đúng thứ tự thời gian); `validate` gọi nó và kiểm `capabilities.picture_from_code` là bool khi có.
- `scripts/manifest-import.mjs`: `importScenes` (đọc `scenes/scenes.json` dạng mảng nếu hợp lệ, không thì WARN; rồi `script/scenes.json` dạng bản đồ `NN → số cảnh`, đúng dạng của a-01); `picture_from_code: true` khi `index.html` có `buildFilm(`.
- `scripts/gateway.mjs`: op `set_scenes` (biên nhận "đổi nhóm cảnh: N cảnh", `[]` bỏ nhóm), thêm vào `OPS`; `resize_shot`/`add_shot`/`remove_shot` ném đúng câu lý do của phase khi có cờ; `add_shot` cho shot mới vào cảnh của shot đứng trước (ở đầu thì cảnh của shot kế), `remove_shot` rút shot khỏi cảnh và bỏ cảnh rỗng.
- `scripts/render-final.mjs`: hàm nội bộ `pictureInputs(project, composition, { timing, scenesDir, soundFiles })` dùng chung cho `visualHash` (giữ nguyên thứ tự băm, sidecar cũ vẫn khớp) và `pictureHash` (`timing: "drop"`, `scenesDir: true`, `soundFiles: "drop"`); thêm `pictureFiles`; cờ `--legacy-mtime` chuyển vào `check()`.
- `scripts/make-demo.mjs`: `visual_hash`, `audio_hash` vào `DEMO_KEYS`; `audio_review` giữ riêng (không vào `DEMO_KEYS`); `writeDemoMd(..., hashes)` (`undefined` giữ, `null` bỏ, object đặt); `--animatic` của bản chính ghi hai hash; `--record-audio-review <ai>` (export `recordAudioReview`) ghi hoặc thay một dòng, không đụng `approval:`, exit 2 khi tên sai hay chưa có DEMO.md.
- `scripts/check-preflight.mjs`: `checkAnimatic` so hash cho khóa `animatic` khi DEMO.md có `visual_hash:`; `PLAN.md` mới hơn animatic vẫn FAIL; kiểm khung demo giữ nguyên; `--legacy-mtime` và `LEGACY_MTIME_WARN`.
- `scripts/studio-api.mjs`: `COMMANDS.mixBalance`, chú thích không bump.
- Test: `manifest.test.mjs`, `manifest-import.test.mjs`, `gateway.test.mjs`, `picture-gate.test.mjs` (mới, 7 test), `studio-api.test.mjs` (danh sách khóa `COMMANDS` thêm `mixBalance`).
- Tài liệu: `references/plan-demo.md` (mục "Hash hình và tiếng của animatic"), `skills/ov-studio/SKILL.md` (nhóm cảnh, `picture_from_code`), `CHANGELOG.md`.

## Verify

- 8.1: `manifest*.test.mjs` xanh; `a01_import "$OVC"` exit 0, `diff` WARN với mốc rỗng: OK-NO-NEW-WARN; bản chép `--write` → `true 8 cảnh`, OK-A01-SCENES.
- 8.2: `gateway*.test.mjs` 47 pass.
- 8.3, 8.4: `picture-gate.test.mjs` 7 pass: đổi TIMING thì `pictureHash` giữ, `visualHash` đổi; đổi giọng (`assets/voice/` lẫn `assets/mix/`), `.words.json`, dotfile trong `scenes/` thì `pictureHash` giữ, `audioHash` đổi; đổi `scenes/s01.mjs` thì `pictureHash` đổi; `writeDemoMd` chạy lại giữ mỗi khóa đúng một lần; `--record-audio-review user@studio` ghi đúng hash, file còn lại giữ nguyên byte; cổng: chỉ đổi giọng + TIMING → 0 lỗi, 1 WARN "nghe lại"; thêm `audio_review` → 0 WARN; sửa `scenes/s01.mjs` → FAIL; bỏ `visual_hash:` hoặc `--legacy-mtime` → lỗi mtime cũ, `check()` có WARN `--legacy-mtime`; `render-final` chuyển cờ.
- 8.5: `4 true true`; toàn bộ test plugin 583 pass, 0 fail (trước phase 569); `a01_import "$OVC"` OK-A01 (chạy lại sau merge trên `main`).
- Kiểm thêm, chỉ đọc: `pictureHash` chạy được trên a-02 thật (77 file, 57 ms, không thiếu tham chiếu); `audioHash` a-02 chạy được.
- `$C/video/a-01` không có `project.json` lẫn `.opus`. Không chạy Studio, không dùng 4317, không tốn lượt ElevenLabs/Codex.

## Lệch so với phase

1. **`pictureHash` bỏ file âm thanh ở mọi thư mục của `assets/`** (đuôi `.mp3 .wav .m4a .aac .ogg .oga .flac .opus`, cùng `.words.json`, `.gate.json`), thêm tùy chọn nội bộ `soundFiles` ngoài hai tùy chọn phase ghi. Lý do: a-01 và mẫu tập series để giọng ở `assets/mix/voice-NN.mp3` (cast-tts `--mix-out`), không nằm trong `SOUND_DIRS` (`voice`, `sfx`, `bgm`); không bỏ thì lồng lại một câu vẫn FAIL, trái mục tiêu G. `visualHash` không đổi.
2. Tài liệu manifest không có trong `references/`; đoạn về `scenes`/`picture_from_code` ghi ở `skills/ov-studio/SKILL.md`, nơi đang mô tả `project.json` và gateway.
3. `scripts/tests/studio-api.test.mjs` (ngoài danh sách) thêm `mixBalance` vào danh sách khóa `COMMANDS` mà test so khớp đúng từng khóa; phép kiểm file tồn tại vẫn chạy cho khóa mới.
4. `CHANGELOG.md` có một đoạn của PR #7 bị chèn nhầm `# Changelog\n\n` thay cho `` $` `` (lỗi `String.replace` với `` $` ``); đã sửa trong PR này.
5. FAIL "hình đã đổi" nêu tối đa 3 file trong tập băm có mtime mới hơn animatic, vì DEMO.md chỉ lưu một hash nên không dò chính xác file khác được.

## Ghi chú cho phase 09

- `scenes/roles.json` và `scenes/cast.json` nằm trong `scenes/` nên thuộc `pictureHash`: đổi người nói (`set_line_speaker` ghi `roles.json`) là đổi hình (FAIL), lồng lại cùng người nói chỉ WARN.
- Root `data-duration` của `index.html` nằm ngoài khối TIMING, nên câu lồng lại làm đổi tổng thời lượng sẽ đổi `pictureHash` (FAIL); thêm nữa, gateway viết lại cột Thời điểm của `PLAN.md` khi mốc shot đổi, và `PLAN.md` mới hơn animatic vẫn FAIL. Thẻ "nghe lại" chỉ gặp khi câu mới không đổi mốc cảnh.
- Studio gọi "Nghe rồi, được" bằng `node <COMMANDS.demo> --project <dir> --record-audio-review user@studio` (chỉ nhận `--project` đi kèm).
- `mcp/server.mjs` (mô tả tool `project_patch` cho đạo diễn) vẫn liệt kê op cũ, chưa có `set_scenes` (cũng chưa có `set_line_speaker`, `set_line_audio` từ phase 07); op vẫn chạy vì gateway nhận theo `OPS`. Ngoài danh sách file của phase này nên không sửa.

## Rủi ro còn lại

- Bỏ TIMING khỏi hash có thể lọt một đổi nhịp hình do câu lồng lại dài hơn mà mốc cảnh không đổi; WARN "nghe lại" là chỗ chặn, đã ghi trong `references/plan-demo.md`.
- `--legacy-mtime` phải bỏ sau 2026-10-31 (ghi trong CHANGELOG).
