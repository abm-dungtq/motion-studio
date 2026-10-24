# Sửa lỗi plugin opus-video theo đánh giá mã (2026-10-24)

Status: DONE_WITH_CONCERNS
Summary: [opus-video PR #11](https://github.com/abm-dungtq/opus-video/pull/11) đã squash-merge (`2e59187`). Cả ba lỗi đều có test mới, test trượt trên mã cũ rồi qua sau khi sửa. Plugin 595/595, nhập bản chép a-01 exit 0 và 0 WARN. Probe `claude -p` cho thấy luật deny không chặn hết các cách viết lệnh, nên kiểm được đặt trong chính script.

## 1. Hash hình gộp cả `assets/gen/`

**Nguyên nhân (đã xác nhận).** `pictureInputs` (`scripts/render-final.mjs`, vòng `walk(join(root, "assets"))`) băm mọi file dưới `assets/`. Thư mục này gồm cả `assets/gen/` (batches, raw, keyed, rig-preview). Studio ghi `assets/gen/batches/thumbnail.json` ngay lúc tạo thẻ thumbnail (`lib/delivery.mjs:34`), nên cổng final FAIL.

**Trượt trên mã cũ** (`$T/h3-red.txt`):
```
✖ files under assets/gen/ (...) are not the picture
  + 'b96b81a9…'  - '0254aa9b…'   (pictureHash đổi)
{"errors":["hình đã đổi sau animatic được duyệt (assets/gen/batches/thumbnail.json); chạy lại make-demo.mjs --animatic"]}
```

**Sửa.** Khi duyệt `assets/`, bỏ qua `rel.startsWith("assets/gen/")` (hằng `WORK_DIR`). Thay đổi này áp dụng cho cả `pictureHash` (cổng final, `make-demo --animatic`, `pictureFiles` trong `check-preflight`) lẫn `visualHash` (`render-final --audio-only`), vì cả hai dùng chung `pictureInputs`. Nếu composition tham chiếu thẳng tới một file trong `assets/gen/` thì file đó vẫn được băm qua tham chiếu, và test có kiểm trường hợp này.

**Dự án tự chứa.** Grep `assets/gen` trong `a-02/index.html` và `a-02/scenes/` không thấy tham chiếu nào. Rig đi qua `sync-to-project` vào `assets/rig`, nền đã duyệt được chép vào `assets/bg/` (`routes/assets.mjs:174`), còn thumbnail ra `delivery/` (`lib/delivery.mjs:244`), không nằm trong `assets/`. Hiện chưa có `DEMO.md` nào mang `visual_hash:` (đã quét a-01, a-01-pilot, a-02 và Edit-Video), nên đổi cách tính hash không làm hỏng animatic nào đã duyệt.

**Qua:** `picture-gate.test.mjs` 8/8. Cổng trên fixture tạm trả `{"errors":[]}`.

## 2. Đạo diễn gọi được các lệnh tốn lượt của `eleven.mjs`

**Liệt kê lệnh con** (đọc `scripts/eleven.mjs`):

| Lệnh | API | Tốn lượt |
|---|---|---|
| `doctor` | GET subscription | không |
| `voice-info` | GET voice | không |
| `models` | GET models | không |
| `tts` | TTS | có |
| `audio-meta` | TTS từng câu | có |
| `probe-models` | TTS cho mỗi model | có |
| `sfx` | sound-generation | có (được phép) |
| `music` | music | có (được phép) |

Đây là script duy nhất trong plugin gọi ElevenLabs. `cast-tts` của series gọi API qua `S/tools/lib/eleven-env.mjs`, không đi qua `eleven.mjs`. Người dùng chọn chỉ cho chạy đúng `sfx` và `music`, nên ba lệnh miễn phí cũng bị chặn.

**Probe** (`claude` 2.1.304, `claude -p --model haiku --permission-mode acceptEdits`, cờ allow/deny lấy đúng từ `studio-api.mjs`, chạy trên bản chép plugin có `eleven.mjs` giả. Không tốn lượt ElevenLabs hay Codex. Kết quả lưu ở `$T/probe-*.jsonl`):

| Lệnh | Luật cũ | Luật mới (`*eleven.mjs <lệnh>*`) | Có thêm kiểm trong script |
|---|---|---|---|
| `…/scripts/eleven.mjs tts` | DENIED | DENIED | DENIED |
| `…/scripts/./eleven.mjs tts` | **chạy** | DENIED | DENIED |
| `…/scripts//eleven.mjs probe-models` | — | DENIED | — |
| `…/eleven.mjs probe-models` | **chạy** | DENIED | — |
| `…/eleven.mjs "tts"` | — | **chạy** | exit 5 |
| `…/eleven.mjs 'probe-models'` | — | **chạy** | exit 5 |
| `…/eleven.mjs "doctor"` | — | — | exit 5 |
| `cd …/scripts && node eleven.mjs tts` | DENIED (cần duyệt) | | |
| symlink tới plugin, `//` ở đầu đường | DENIED (không khớp allow) | | |
| `OPUS_STUDIO_RUNNER= node …`, `env -u … node …` | | DENIED (không khớp allow) | |
| `eleven.mjs sfx`, `music` | chạy | chạy | chạy (tới API giả) |

Luật Bash so khớp theo chữ, nên một chữ đặt trong ngoặc kép vẫn lọt mọi luật deny. Ngược lại, đạo diễn không gỡ được biến môi trường: lệnh bắt đầu bằng `VAR=` hay `env` không khớp luật allow nào.

**Thiết kế.** File mới `scripts/director-guard.mjs`:
- `underDirector()` trả về đúng khi `MOTION_STUDIO_RUNNER` hoặc `OPUS_STUDIO_RUNNER` bằng `cli`. Studio đặt biến này cho `claude -p` (`lib/providers/opus-video.mjs:104`).
- `elevenRefusal(cmd, dirs)`: khi chạy dưới đạo diễn, lệnh không thuộc `["sfx","music"]` và một trong các thư mục là tập series (`seriesDirOf`) thì `eleven.mjs` thoát mã 5 trước khi đọc khoá. Các thư mục được xét là cwd, `--project`, `--hyperframes`, thư mục chứa `--text-file`/`--script` và thư mục cha của nó. Danh sách này là allowlist, nên lệnh con thêm sau này cũng bị chặn theo mặc định.
- Dự án thường dưới đạo diễn vẫn chạy được như cũ, vì luật chỉ áp cho series theo đúng phạm vi yêu cầu.
- Studio không tự chạy `eleven.mjs`, nên không cần cờ riêng nào do Studio cấp.

`VOICE_DENIED_TOOLS` vẫn là mảng chuỗi frozen, giờ gồm `Bash(*eleven.mjs <lệnh>*)` cho 6 lệnh. Studio đọc mảng này theo cách cũ, `STUDIO_API` vẫn là 4.

**Trượt trên mã cũ** (`$T/m2m3-red.txt`): `tts` dưới `OPUS_STUDIO_RUNNER=cli` trong tập series chạy tiếp tới cổng viet-pro, không bị từ chối. Thiếu `director-guard.mjs` thì ERR_MODULE_NOT_FOUND.
**Qua:** `director-guard.test.mjs` 5/5. Test có kiểm mọi lệnh với cả hai tên biến, kiểm dự án được nêu bằng cờ khi cwd khác, và kiểm rằng danh sách chặn khớp với usage của `eleven.mjs` trừ sfx/music. Mọi test chạy với HOME trống và khoá rỗng, nên không lần chạy nào gọi được API.

## 3. Đạo diễn tự ghi được "Nghe rồi, được"

**Nguyên nhân.** `make-demo.mjs --record-audio-review user@studio` khớp `Bash(node $OV/scripts/*)`. Probe với luật cũ: lệnh chạy được. Thêm luật `Bash(*--record-audio-review*)` thì vẫn lọt với cách viết `--record-audio-r""eview`.

**Trượt trên mã cũ:** dưới env đạo diễn, lệnh thoát 0 và ghi `audio_review:` vào DEMO.md (`0 !== 2`).

**Sửa.** Khi `underDirector()` đúng, `make-demo` thoát mã 2 và không ghi gì. Luật này áp cho mọi dự án, vì dòng xác nhận này luôn là của người dùng. `DENIED_TOOLS` có thêm `Bash(*--record-audio-review*)` làm lớp chặn đầu.

**Đường của Studio vẫn chạy.** `routes/gates-audio.mjs:67` gọi `runFile(process.execPath, [demo, "--project", dir, "--record-audio-review", BY])` mà không truyền `env`, nên lệnh nhận env của tiến trình Studio. Kiểm `ps -E` trên Studio 4317 (pid 66098): không có `*_STUDIO_RUNNER`. Test có kiểm thêm rằng không có biến thì lệnh thoát 0 và ghi `audio_review: user@studio <ISO> <hash>`. Sau probe, sha của DEMO.md không đổi (`469540ad…`).

## Kiểm chung

- `node --test scripts/tests/*.test.mjs`: 595/595 trên nhánh và trên `main` sau merge.
- Test Studio đọc plugin mới (`OPUS_VIDEO_HOME=$OVC`): `director*`, `provider*`, `audio-review`, `gate-cards`, `studio-gates` cho 42 pass và 1 skip. Test bị skip là `provider-api4`, do máy thiếu bản clone, không liên quan thay đổi này.
- `a01_import "$OVC"`: exit 0, 0 dòng WARN, khớp `a01-import-moc-warn.txt`.
- Commit đã squash có body sạch: không có Co-Authored-By, không mã finding, không email.

## Việc phía Studio (để orchestrator giao, tôi không sửa)

1. `director.mjs:82` (`seriesRule`): câu prompt đang ghi "Không gọi … `eleven.mjs tts` hay `eleven.mjs voice*` trực tiếp". Đề nghị đổi đoạn đó thành: "Với `eleven.mjs` chỉ dùng `sfx` và `music`; mọi lệnh con khác (tts, audio-meta, probe-models, doctor, voice-info, models) bị từ chối với mã 5 (giọng chỉ qua series_tts, voice_design)." Plugin đã chặn rồi; sửa câu này chỉ giúp đạo diễn khỏi thử lệnh vô ích.
2. Tuỳ chọn, để chắc thêm: `routes/gates-audio.mjs:67` truyền env đã bỏ hai biến, để nút vẫn chạy kể cả khi Studio được khởi động từ một shell có sẵn các biến đó:
   `{ cwd: dir, timeout: REVIEW_TIMEOUT_MS, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTION|OPUS)_STUDIO_RUNNER$/.test(k))) }`
3. Không cần đổi gì cho phần hash hình. Thumbnail ra `delivery/`, trạng thái đợt nằm trong `.opus/`.

## Concerns

- Bản cài `$OVI` chưa đổi. Studio 4317 chỉ có các chốt này sau khi chạy `npm run setup -- --yes` theo phase 11. Việc chạy lúc nào để người điều phối quyết.
- Chốt mới chỉ áp cho `eleven.mjs` của plugin. Một script do đạo diễn viết rồi chạy qua `hd-poses` (mục còn mở, ghi ở checkpoint trước) vẫn tự gọi API được.
- Plan ghi Studio 4317 chạy pid 38307, nhưng `studio.json` hiện ghi pid 66098: đã có người restart. Tôi không restart.

## Câu hỏi chưa giải

- Ba lệnh miễn phí (`doctor`, `voice-info`, `models`) đang bị chặn theo đúng hướng "chỉ sfx/music". Nếu đạo diễn cần `doctor` để chẩn đoán khoá thì phải thêm lệnh này vào `ELEVEN_DIRECTOR_COMMANDS`.
