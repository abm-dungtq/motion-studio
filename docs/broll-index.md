# Chỉ mục B-roll

Studio hiểu footage có sẵn trên máy để tìm và gợi ý B-roll cho shot. Mỗi file chỉ được phân tích một lần theo nội dung (sha256). Mọi bước đều chạy offline, trừ bước chú thích. Bước chú thích nhờ agent đọc ảnh (xem [agents.md](agents.md)) xem contact sheet, không xem từng khung.

## Dùng thế nào

- **Tab Chất liệu, mục "Tìm trong footage".** Gõ từ khoá, có dấu hay không đều được: "biển" và "bien" ra cùng kết quả. Lọc theo cỡ cảnh nếu cần. Kéo một kết quả lên timeline: dữ liệu kéo là `text/x-ms-media` `{ rel: null, kind: "video", path, sha256, start, end }`.
- **Mục "Phân tích footage".**
  - Trước khi chạy, mục này cho biết số file, số file chưa phân tích, số shot chưa có chú thích và số lượt đọc ảnh sẽ tốn.
  - "Phân tích offline" không tốn lượt nào.
  - "Chú thích bằng agent" chỉ bấm được khi con số lượt đã chính xác, tức không còn file nào chưa phân tích offline. Lượt chạy bị giới hạn đúng ở con số đó.
- **Inspector của một shot, mục "Gợi ý B-roll".**
  - Mục này hiện 5 đoạn hợp nhất, tìm theo tên shot, `motion_note` và lời thoại trong shot. Đoạn ngắn hơn shot ghi "cần lặp/chậm".
  - "Đặt vào shot" cắt đoạn vào `<dự án>/assets/broll/<tên>-<start>-<end>.mp4` (libx264 crf 14, cắt đúng khung), rồi ghi biên nhận `broll-cut`.
  - Đường dẫn được thêm vào `assets` của shot qua gateway, nên có phiên bản mới và Hoàn tác được.
  - Đánh dấu "Nhờ đạo diễn đặt clip vào cảnh" thì Studio gửi thêm yêu cầu cho đạo diễn. Studio không sửa HTML.
- **Sau khi đăng ký footage** ("Footage đã thêm"), video mới tự vào hàng đợi phân tích offline. Bước chú thích vẫn chờ người bấm.

## Các bước và chi phí

| Bước | Cách làm | Offline | Chạy lại khi |
|---|---|---|---|
| Hash | sha256 đọc theo khối 4 MB; nhớ theo (đường thật, kích thước, mtime) trong `hashes.json` | có | file đổi kích thước hoặc mtime |
| Thông số | ffprobe: thời lượng, kích thước, fps, codec, có tiếng không | có | `versions.probe` cũ |
| Tách shot | ffmpeg `scale=320:-2,scdet=threshold=10`; bỏ cắt cách cắt trước dưới 0,6 s, shot cuối dưới 0,6 s nhập vào shot trước; clip dưới 2 s là một shot | có | `versions.scenes` cũ |
| Keyframe | shot từ 1,5 s lấy 3 khung (25 %, 50 %, 75 %), shot ngắn hơn lấy 1 khung; JPEG cạnh dài 320 px | có | `versions.frames` cũ, hoặc thiếu file |
| Lời nói | `silencedetect=n=-35dB:d=0.5`; phần không im lặng trên 30 % thì coi là có lời và chạy `media-use/scripts/transcribe.mjs` | có | `versions.speech` cũ |
| Chú thích | contact sheet 3×3 (960×540), 4 tờ mỗi lượt gọi agent đọc ảnh | **không** | shot chưa có chú thích, hoặc `versions.describe` cũ |
| Tìm | BM25 rút gọn trên chú thích, tag (tính hai lần), chủ thể, nơi chốn, chữ trên hình, lời nói, tên file; `fold()` bỏ dấu | có | dựng lại sau mỗi lượt chạy |

Contact sheet:

- Shot được xếp vào tờ theo nhóm 1 hoặc 3 ô, lấy từ mọi clip của lượt chạy. Xếp theo kiểu first-fit, theo thứ tự (sha256, shot).
- Một nhóm không bao giờ nằm vắt qua hai tờ. Một tờ chỉ đóng khi nhóm kế không còn vừa, nên mỗi tờ đầy có ít nhất 3 shot.
- Vì vậy số lượt đọc ảnh luôn ≤ ceil(số shot / 12).

Đổi prompt hay schema (`lib/broll/describe.mjs` `VERSION`) thì chỉ bước chú thích chạy lại. Tách shot lại thì chú thích của clip đó cũng làm lại, vì số shot đã khác.

### Đo trên workspace thật (2026-10-23, Mac M-series)

| Lượt | File | Clip khác nhau | Shot | Lượt đọc ảnh | Thời gian |
|---|---|---|---|---|---|
| Offline lần đầu | 21 | 17 | 33 | 0 | 43,6 s (có ASR whisper cho 2 clip có tiếng) |
| Chú thích | 21 | 17 | 33 → 8 tờ | **2** (agy, 20 + 13 shot) | 227 s (khoảng 113 s mỗi lượt) |
| Lần hai | 22 | 17 | 33 | 0 | 0,1 s; 0 lần chạy ffmpeg hay ffprobe; mọi file "đã có trong cache" |

Giới hạn lý thuyết là ceil(33 / 12) = 3 lượt. Thực tế tốn 2 lượt: 14 shot ngắn chỉ chiếm 1 ô mỗi shot, nên 33 shot vừa 71 ô, tức 8 tờ. Nếu mỗi khung một lượt gọi thì sẽ tốn 71 lượt. Bốn file trùng nội dung (bản chép giữa các dự án) không tốn thêm bước nào.

## Cài đặt

Đặt trong `studio.json`, khoá `broll`. Khoá này được giữ lại khi Studio dừng rồi chạy lại.

```json
{ "broll": { "auto": true, "vision": true, "asr": false, "max_calls_per_run": 50 } }
```

- `auto: false`: đăng ký footage xong không tự phân tích.
- `vision: false`: không bao giờ dựng contact sheet hay gọi agent đọc ảnh. Khi đó chỉ tìm được theo tên file và lời nói.
- `asr: false`: chỉ đo có lời hay không, không chép lời.
- `max_calls_per_run`: số lượt đọc ảnh tối đa của một lượt chạy. Mỗi lần chạy CLI tính là một lượt, kể cả lần thử lại.

## Riêng tư

- Agent chỉ nhận các tờ JPEG 960×540 thu nhỏ. `describeImages` chép chúng vào một thư mục tạm riêng.
- Agent không nhận file gốc, âm thanh hay đường dẫn thật. Prompt chỉ nói "Ảnh n, ô k". Bảng ánh xạ ô về (clip, shot) chỉ nằm trong Studio.
- Tờ được dựng trong thư mục tạm và xoá ngay sau lượt gọi, kể cả khi bị huỷ.

## Khi agent trả sai

- Mỗi lần thử gắn với một agent cụ thể theo `agents.order.vision`, agent đã thử "Thử khả năng" đứng trước. Vì vậy mỗi lần thử đúng bằng một lượt.
- Câu trả lời không có JSON, hoặc không có mục nào hợp schema (`lib/broll/describe-schema.json`), được thử lại đúng một lần với agent kế. Sai nữa thì các shot của lượt đó ghi `describe_error`. Lượt chạy sau không tự thử lại các shot này, để không tốn quota lặp lại.
- Shot thiếu trong một câu trả lời hợp lệ cũng ghi `describe_error`.
- Hết quota, hoặc hết ngân sách lượt trong lượt chạy, thì dừng. Các bước offline đã xong vẫn nằm trong cache. Shot chưa chú thích chờ lượt sau.

## Cache

Thư mục cache là `~/.cache/motion-studio/broll/`, hoặc `$MOTION_STUDIO_BROLL_CACHE`. Xoá được bất cứ lúc nào.

```text
hashes.json                 (đường thật, size, mtime) → sha256
index.json                  chỉ mục tìm kiếm, mỗi shot một mục
run.lock                    một lượt chạy mỗi máy (pid; lock của pid đã chết bị bỏ)
<sha256>/meta.json          { sha256, size, probe, seen_paths, indexed_at, versions }
<sha256>/scenes.json        [{ i, start, end }]
<sha256>/frames/s<i>-<k>.jpg
<sha256>/speech.json        { has_speech, ratio, transcript, engine, asr_tried }
<sha256>/describe.json      [{ shot, caption_vi, tags, shot_type, camera, subjects, place, time_of_day, text_on_screen, quality } | { shot, describe_error }]
```

- File chép hay dời chỗ vẫn trúng cache, vì `seen_paths` giữ mọi đường từng thấy.
- Chạy cho một dự án thì biên nhận `broll-index` nằm trong `<dự án>/.opus/receipts/`. Chạy toàn workspace thì biên nhận nằm trong `<cache>/.opus/receipts/`.

## HTTP và tool

| Route | Việc |
|---|---|
| `GET /api/broll/search?q=&kind=&min_dur=&limit=` | `q` tối đa 200 ký tự; trả `{ items: [{ sha256, shot, start, end, duration, path, paths, caption_vi, tags, shot_type, said, thumb, score }] }` |
| `GET /api/broll/clip?sha=` | mọi thứ đã biết về một clip |
| `GET /api/broll/thumb?sha=&f=` | keyframe JPEG; `sha` khớp `^[0-9a-f]{64}$`, `f` khớp `^s\d+-\d\.jpg$` |
| `GET /api/broll/plan?name=&scope=` | đếm trước khi chạy: `files`, `new_files`, `shots_pending`, `sheets`, `calls`, `settings` |
| `POST /api/broll/index { name?, scope, vision?, max_calls? }` | job `broll`: một job mỗi máy; chủ job là dự án hoặc `_workspace`; dòng cuối là `RESULT <json>` |
| `GET /api/broll/job` | job `broll` gần nhất |
| `GET /api/broll/suggest?name=&shot=` | gợi ý cho shot (cần provider) |
| `POST /api/broll/apply { name, shot, base, sha256, start, end }` | cắt vào `assets/broll/` và `set_shot assets` (cần provider) |

`scope: "workspace"` quét cả root. `scope: "project"` quét thư mục dự án, `footage/`, `shared-assets/` và các video trong `.opus/media.json`. Cả hai đều bỏ qua `node_modules`, `renders`, `demo`, thư mục chấm và `assets/broll`.

Tool (`lib/tools/broll.mjs`, chỉ đọc cache):

- `broll_search`;
- `broll_describe_clip` (nhận `sha256` hoặc `path`);
- `broll_suggest` (nhận `project` và `shot`).

Dòng lệnh: `node lib/broll/index.mjs run '{"root":"/Volumes/2/Edit-Video","scope":"workspace","vision":false}'`.

## Lệch so với kế hoạch ban đầu

- **Không có `drawtext`.** ffmpeg 8.1.2 trên máy này build không có freetype. Vì vậy số ô là ảnh PPM nhỏ, vẽ từ font bitmap 5×7 phóng 6 lần, đè lên ô bằng `overlay`. Lưới dựng bằng `xstack` thay cho `tile`. Ô trống là ô đen.
- **Contact sheet gom shot của nhiều clip.** Kế hoạch ban đầu làm sheet riêng cho từng clip. Gom nhiều clip là cách duy nhất giữ số lượt ≤ ceil(shot / 12) khi nhiều clip chỉ có một shot. Tờ chỉ sống trong thư mục tạm, nên route `thumb` không phục vụ tên `sheet-*.jpg`.

## Hạn chế đã biết

- `scdet` bắt tốt cắt cứng nhưng kém với chuyển cảnh mềm. Clip anime nhiều cắt nhanh cho shot dài khoảng 0,7–1 s.
- Một clip dài không có cắt nào là một shot duy nhất, với một chú thích. Ví dụ clip đường phố 60 s.
- ASR dùng `transcribe.mjs` của media-use. Trên máy này nó chạy whisper qua `hyperframes transcribe`, không chỉ định ngôn ngữ. Với nhạc hay tiếng Việt, kết quả có thể là câu tiếng Anh bịa ra (ví dụ "Thanks for watching!"), và câu đó vào chỉ mục tìm kiếm. Vì vậy `asr` mặc định tắt; bật bằng `broll.asr: true` khi footage có lời rõ.
- Tìm không dấu thì "biển" cũng khớp "biến". Đây là cái giá của việc tìm có dấu và không dấu cho cùng kết quả.
- Huỷ job giữa lượt đọc ảnh thì CLI của agent (chạy trong process group riêng) vẫn chạy tới hết thời gian chờ của nó (tối đa 3 phút). ffmpeg thì dừng ngay.

## Hướng sau

Embedding cục bộ (CLIP hoặc SigLIP) cho tìm theo nghĩa, 0 lượt gọi. Cần tải model khoảng 0,5–1 GB và chạy Python, và không cho chú thích tiếng Việt. Chưa làm.

## Nguồn học

- [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect) (BSD-3-Clause): `min_scene_len` và cách gộp shot ngắn.
- [mifi/lossless-cut](https://github.com/mifi/lossless-cut) (GPL-2.0, chỉ đọc để học, không chép mã): cách đọc log của filter ffmpeg.
- [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) (Apache-2.0): cách mô tả clip cho agent.
- [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) (MIT): lưới thư viện media có tìm kiếm và kéo thả.
