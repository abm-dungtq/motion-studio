# Phase 7: hiểu B-roll có sẵn, tối ưu chi phí

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/broll-index`
- **Nhánh:** `feat/broll-index`
- **Cổng server thử:** 4407
- **Effort:** 10h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1:
  - `describeImages()` (đọc ảnh);
  - seam route, `addSection("media")`, `addInspectorSection`;
  - seam tool, `writeReceipt`, `hfSkills()`.

## Mục tiêu

Một pipeline hiểu footage và B-roll đang có. Pipeline phải:

- chạy offline trước tiên;
- rẻ nhất mà vẫn dùng được;
- không phân tích lại thứ đã phân tích.

Bảy phần:

1. **Metadata:** ffprobe.
2. **Phát hiện cảnh/shot.**
3. **Lấy keyframe:** vài khung mỗi shot, ghép **contact sheet** để giảm số lượt gọi đọc ảnh.
4. **Chú thích và gắn tag** bằng CLI đọc được ảnh (phase 1), gom theo lô contact sheet.
5. **ASR tuỳ chọn** cho clip có lời.
6. **Cache chỉ mục theo hash nội dung.**
7. **Tìm bằng chữ**, và **gợi ý B-roll** đặt vào timeline.

## Hiện trạng đã kiểm (tránh làm trùng)

**Studio** (`media.mjs`):
- `probe(file)` (ffprobe, timeout 20 s) trả `{ duration, width, height, codec }`.
- `register(root, dir, src)` ghi `.opus/media.json`, chép file ngoài vào `footage/raw/`.
- Chưa có phân tích nội dung.

**Plugin:**
- `cut.mjs probe` tìm khoảng lặng an toàn để cắt talking-head, không phải chỉ mục.
- `ov-footage` là nhánh cắt clip quay thật theo EDL.
- `captions-from-transcript.mjs` dựng phụ đề từ `transcript.json`.
- Không có chỉ mục B-roll, nên không trùng.

**media-use skill** (`~/.claude/skills/media-use/scripts/transcribe.mjs`):
- ASR cục bộ: parakeet-mlx, dự phòng whisper.cpp qua `hyperframes transcribe`.
- **Dùng lại script này cho ASR,** không viết lại.

**Máy:**
- ffmpeg 8.1.2 có `scdet`, `tile`, `select`, `silencedetect`.
- Có `whisper-cli` (`/opt/homebrew/bin/whisper-cli`).
- Không có `parakeet-mlx`, không có PySceneDetect: venv `~/.claude/skills/.venv` không có `scenedetect`.

**Lượng footage hôm nay:** `/Volumes/2/Edit-Video/footage/raw` có 1 file (5,3 MB). Toàn workspace, trừ `renders/` và `demo/`, có khoảng 18 file video, tổng khoảng 60 MB. Pipeline phải chạy tốt từ con số nhỏ này và vẫn chịu được hàng trăm GB sau này.

**Thư viện:** `fold()` của `lib/library.mjs:17` bỏ dấu tiếng Việt; dùng lại để tìm không dấu.

## So sánh phương án và chi phí

Ước tính cho 1 giờ footage, khoảng 400 shot. Chi phí ở đây là số lượt gọi CLI tính vào quota gói thuê bao, không phải tiền API.

| Bước | Phương án | Offline | Chi phí | Chất lượng | Chọn |
|---|---|---|---|---|---|
| Cảnh/shot | ffmpeg `scdet` (`-vf scdet=threshold=10` hoặc `select='gt(scene,0.3)',showinfo`) | có | 1 lần giải mã, khoảng 0,3–0,5× thời gian thực trên M-series [ước tính, đo ở bước 9] | đủ cho cắt cứng; kém với chuyển mềm | **mặc định** |
| | PySceneDetect `AdaptiveDetector` | có (cần venv) | chậm hơn khoảng 2× | tốt hơn với chuyển mềm và máy rung | tuỳ chọn khi đã cài vào `~/.claude/skills/.venv` |
| Keyframe | 3 khung mỗi shot (25 %, 50 %, 75 %); shot < 1,5 s lấy 1 khung | có | rẻ (seek + giải mã) | đủ | **mặc định** |
| Đọc ảnh | Mỗi khung một lượt | không | khoảng 1.200 lượt | tốt | không |
| | **Contact sheet 3×3** (9 khung, 3 shot/tờ), **4 tờ mỗi lượt** | không | khoảng 400 / 3 / 4 ≈ **34 lượt** | tốt; mô tả theo ô | **mặc định** |
| | Embedding cục bộ (CLIP / SigLIP) | có | 0 lượt, nhưng tải model khoảng 0,5–1 GB và cần Python | tìm theo nghĩa tốt, không có chú thích tiếng Việt | chưa làm; ghi làm hướng sau trong docs |
| | Gửi cả video lên dịch vụ đám mây | không | đắt, cần upload | tốt | không (không offline) |
| ASR | `transcribe.mjs` (parakeet → whisper.cpp) chỉ cho clip có lời | có | chỉ chạy trên clip có lời | tốt | **mặc định, tuỳ chọn** |
| Phát hiện lời | `silencedetect=n=-35dB:d=0.5` trên luồng tiếng: phần không im lặng > 30 % thì coi là có lời | có | rẻ | đủ để lọc | **mặc định** |
| Tìm | Chỉ mục chữ (BM25 rút gọn trên caption, tag, transcript, tên file; `fold()` bỏ dấu) | có | 0 | tốt với từ khoá | **mặc định** |

**Chốt:**
- `scdet`, 3 keyframe mỗi shot, sheet 3×3, 4 sheet mỗi lượt gọi;
- ASR chỉ khi có lời;
- tìm bằng chỉ mục chữ.

Mọi bước trừ đọc ảnh đều chạy offline. Đọc ảnh là bước duy nhất tốn quota, và chạy **đúng một lần cho mỗi hash**.

## Repo học hoặc chép

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | BSD-3-Clause | Ngưỡng và độ dài shot tối thiểu (`min_scene_len`); cách gộp cảnh quá ngắn. Áp lên kết quả `scdet` |
| [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) | Apache-2.0 | Cách mô tả clip cho agent (tool), receipt của phân tích |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | UX thư viện media: lưới, tìm, kéo vào timeline |
| [mifi/lossless-cut](https://github.com/mifi/lossless-cut) | GPL-2.0 (học tập, ghi nguồn) | Lệnh ffmpeg phát hiện cảnh và khung đen, cách đọc output `showinfo` |

## Sở hữu file

**Sửa:** `media.mjs`. Sau khi `register` thành công, gọi `enqueueIndex(path)` nếu `studio.json` `broll.auto` khác `false`. Thêm `hashFile(path)`.

**Tạo mới:**
- `lib/broll/index.mjs`: điều phối, cache, hàng đợi một việc mỗi lần.
- `lib/broll/hash.mjs`: sha256 dạng stream; nhớ đệm `(realpath, size, mtimeMs) → hash` trong `~/.cache/motion-studio/broll/hashes.json`.
- `lib/broll/scenes.mjs`: `scdet`, parse `showinfo`, gộp shot ngắn.
- `lib/broll/frames.mjs`: lấy keyframe, ghép contact sheet bằng ffmpeg `tile`, đánh số ô.
- `lib/broll/describe.mjs`: gom lô sheet, gọi `describeImages`, schema JSON, ánh xạ ô → shot.
- `lib/broll/speech.mjs`: `silencedetect`, gọi ASR qua `<hfSkills>/media-use/scripts/transcribe.mjs`.
- `lib/broll/search.mjs`: BM25 rút gọn, `fold()`.
- `lib/broll/suggest.mjs`: gợi ý cho shot hoặc câu.
- `lib/broll/apply.mjs`: cắt đoạn vào `<dự án>/assets/broll/`, ghi receipt, `set_shot assets`.
- `routes/broll.mjs`:
  - `GET /api/broll/search`;
  - `GET /api/broll/clip`;
  - `POST /api/broll/index` (job `broll`);
  - `GET /api/broll/suggest`;
  - `POST /api/broll/apply`.
- `lib/tools/broll.mjs`: `broll_search`, `broll_describe_clip`, `broll_suggest`.
- `public/ext-broll.js`, `public/broll-search.js`, `public/ext-broll.css`.
- `docs/broll-index.md`.
- Test: `tests/broll-scenes.test.mjs`, `tests/broll-cache.test.mjs`, `tests/broll-describe.test.mjs`, `tests/broll-search.test.mjs`.

**Không đụng:** `server.mjs`, `panels.js`, `timeline.js` và file của phase khác.

## Luồng dữ liệu và cache

```text
nguồn: <root>/footage/**, <root>/shared-assets/**, <dự án>/assets/** và file trong .opus/media.json (video)
   │  (POST /api/broll/index { name?, scope: "project" | "workspace" } hoặc tự chạy sau register)
   ▼
hash.mjs: (realpath, size, mtime) → sha256 (đọc lại chỉ khi size/mtime đổi; file chép hay dời chỗ vẫn trúng cache)
   ▼
cache ~/.cache/motion-studio/broll/<sha256>/
   meta.json     { sha256, size, probe:{duration,width,height,fps,codec,audio}, seen_paths[], indexed_at, versions:{scenes:1,describe:1} }
   scenes.json   [{ i, start, end }]            (scdet threshold, min 0.6 s; một shot nếu clip < 2 s)
   frames/       s<i>-<k>.jpg  (320 px cạnh dài)
   sheets/       sheet-<n>.jpg (3×3, 960×540, ô đánh số 1–9 góc trên trái bằng drawtext)
   describe.json [{ shot:i, caption_vi, tags[], shot_type, camera, subjects[], place, time_of_day, text_on_screen, quality }]
   speech.json   { has_speech, ratio, transcript?:[{start,end,text}] }
   receipt: writeReceipt vào <dự án>/.opus/receipts khi chạy từ một dự án; chạy toàn workspace thì ghi vào cache
   ▼
mỗi bước chỉ chạy khi file của bước đó thiếu, hoặc versions.<bước> cũ hơn mã → đổi prompt thì chỉ chạy lại describe
   ▼
search.mjs: chỉ mục chữ dựng lại khi có describe/speech mới; lưu ~/.cache/motion-studio/broll/index.json
   GET /api/broll/search?q=…&kind=&min_dur= → [{ sha256, path(s), shot, start, end, caption_vi, tags, thumb, score }]
suggest.mjs: shot của project.json → truy vấn từ shot.name + motion_note + chữ các câu trong shot (fold, bỏ stopword vi)
   → top 5 đoạn có độ dài ≥ độ dài shot (hoặc đánh dấu "cần lặp/chậm")
   POST /api/broll/apply { name, shot, base, sha256, start, end }
      → cắt đoạn [start, end] vào TRONG dự án: <dự án>/assets/broll/<stem>-<start>-<end>.mp4
        (ffmpeg -ss/-to, re-encode libx264 crf 14 để chính xác khung; đã có thì dùng lại) + writeReceipt
      → set_shot assets = [...assets cũ, "assets/broll/<…>.mp4"] (manifest.mjs:56 chỉ nhận đường tương đối trong dự án)
      → gửi yêu cầu đạo diễn đặt clip vào cảnh của shot (Studio không sửa HTML)
```

**Gom lô đọc ảnh** (`describe.mjs`):
- Mỗi lượt gửi ≤ 4 sheet, tức ≤ 12 shot.
- Prompt tiếng Việt yêu cầu **chỉ JSON** theo schema (agy dùng `--json-schema`).
- Ô được ghi bằng `sheet` + `ô`, ánh xạ về `(clip, shot)` qua bảng nằm phía Studio. CLI không bao giờ biết đường dẫn thật ngoài thư mục tạm.
- Kết quả sai schema thì thử lại một lần với agent kế trong `order.vision`, rồi đánh dấu `describe_error`.
- Ảnh gửi đi là ảnh JPEG 960×540 chép vào thư mục tạm riêng. Không gửi file gốc hay âm thanh.

## Các bước

1. **Đọc trước.**
   - Kiểu `shots[].assets` đã kiểm: `manifest.mjs:7` ghi `assets: [path]`, và `manifest.mjs:56` từ chối mọi phần tử không phải đường dẫn tương đối nằm trong dự án.
   - Vì vậy đoạn B-roll phải được **cắt vào trong dự án** (`assets/broll/`) trước khi ghi vào `assets`. Không ghi object `{ in, out }`, không ghi đường `footage/` ở cấp workspace.
   - Đọc output `showinfo`/`scdet` của ffmpeg 8.1.2 trên một clip thật.
2. **`hash.mjs`**, **`scenes.mjs`**, **`frames.mjs`**: hàm dựng lệnh là hàm thuần, để test được.
3. **`speech.mjs`**: chạy `transcribe.mjs --input <wav> --engine auto`; không có engine nào thì `transcript: null`, không lỗi. Không cài gì.
4. **`describe.mjs`** qua `describeImages` của phase 1; schema JSON để trong file `lib/broll/describe-schema.json`.
5. **`index.mjs`:**
   - một hàng đợi toàn cục chạy từng file một;
   - job `broll` gắn với dự án (hoặc tên `_workspace`) để hiện log;
   - huỷ được giữa chừng; bước đã xong vẫn giữ trong cache.
6. **`search.mjs`** và **`suggest.mjs`**.
7. **`routes/broll.mjs`:** tham số `q` ≤ 200 ký tự. Ảnh thumbnail và sheet phục vụ qua `GET /api/broll/thumb?sha=&f=`; `sha` khớp `^[0-9a-f]{64}$`, `f` khớp `^(s\d+-\d|sheet-\d+)\.jpg$`.
8. **UI:**
   - `addSection("media")`: ô tìm, lưới kết quả có thumbnail và đoạn thời gian, nút "Phân tích footage" (cho biết số file mới và số lượt đọc ảnh dự kiến **trước khi chạy**);
   - `addInspectorSection({ kinds: ["shot"] })`: "Gợi ý B-roll" (top 5), nút "Đặt vào shot";
   - kéo kết quả lên làn B-roll của phase 3 bằng `text/x-ms-media` (định dạng phase 1).
9. **Thử thật trên 4407:**
   - phân tích toàn workspace (khoảng 18 file);
   - đo thời gian và số lượt đọc ảnh; ghi vào `docs/broll-index.md`;
   - chạy lần hai → 0 lượt đọc ảnh, 0 lần giải mã lại;
   - tìm "kiếm" hoặc "biển" ra kết quả hợp lý;
   - gợi ý cho một shot của `ms-smoke-7`.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`, kể cả `tests/studio-media.test.mjs` cũ (register không đổi kết quả trả về).
- `tests/broll-scenes.test.mjs`: video ghép bằng ffmpeg từ 3 đoạn `color` khác màu, mỗi đoạn 2 s → `scenes.json` có 3 shot, biên lệch ≤ 1 khung; shot < `min` được gộp; clip 1 s → 1 shot.
- `tests/broll-cache.test.mjs`:
  - phân tích lần 1 (đọc ảnh bằng `agy` giả trên PATH, ghi lượt gọi vào file đếm) → đếm = ceil(sheet / 4);
  - lần 2 → đếm không tăng, không có lệnh ffmpeg giải mã nào (bọc `exec` để đếm);
  - chép file sang đường khác → trúng cùng `sha256`, đếm không tăng, `seen_paths` có cả hai;
  - tăng `versions.describe` → chỉ describe chạy lại.
- `tests/broll-describe.test.mjs`:
  - CLI giả trả JSON đúng schema → ánh xạ ô về đúng `(clip, shot)`;
  - trả rác → thử agent kế một lần → `describe_error`;
  - prompt và thư mục tạm không chứa đường dẫn gốc (khẳng định qua log của CLI giả).
- `tests/broll-search.test.mjs`: tìm "bien" khớp caption "biển"; xếp hạng ổn định; `suggest` cho shot có câu "thanh kiếm" xếp clip tag `kiếm` đầu tiên.

## Tiêu chí nghiệm thu

- Lần phân tích đầu toàn workspace xong. Số lượt đọc ảnh ≤ ceil(tổng shot / 12). Thời gian và số lượt ghi trong PR.
- Lần thứ hai: 0 lượt đọc ảnh, 0 lần giải mã, log in "đã có trong cache" cho mọi file.
- Tìm bằng tiếng Việt có dấu và không dấu cho cùng kết quả.
- "Đặt vào shot" ghi `assets` qua gateway, có phiên bản mới và Hoàn tác được.
- Ảnh chụp lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-broll-shots/`.
- Server 4407 đã dừng. Không còn process ffmpeg hay ASR nào của phase (`pgrep -f "broll|whisper-cli"` rỗng).

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Tốn quota khi workspace lớn | Vừa | Vừa | Báo trước số lượt; `broll.max_calls_per_run` mặc định 50; chỉ chạy khi bấm (tự chạy sau register mặc định chỉ làm bước offline, describe chờ bấm) |
| Hash file lớn chậm | Thấp | Thấp | Nhớ đệm theo (path, size, mtime); stream 4 MB; chạy trong job |
| CLI trả JSON sai | Vừa | Thấp | Schema + thử lại một lần + đánh dấu lỗi |
| Lộ nội dung riêng tư cho dịch vụ đọc ảnh | Vừa | Vừa | Chỉ sheet thu nhỏ; nút rõ ràng; `broll.vision: false` để chỉ dùng offline (tìm theo tên file và transcript) |
| Cắt B-roll vào `assets/broll/` làm dự án nặng thêm | Chắc chắn (nhỏ) | Thấp | Chỉ cắt đoạn được chọn; `.gitignore` của dự án đã chặn `*.mp4`; dùng lại file nếu đã có |

## Hoàn tác

`git revert -m 1 <merge>`. Cache ở `~/.cache/motion-studio/broll/` xoá được bất cứ lúc nào. `media.mjs` về như cũ. `assets` đã đặt hoàn tác được bằng Undo.

## PR upstream

Không cần. `assets` chỉ nhận đường dẫn trong dự án (`manifest.mjs:56`), nên Studio cắt đoạn vào `assets/broll/` rồi ghi đường đó; schema giữ nguyên.

## PR

Tiêu đề: `feat(broll): content-hash index with scene detection, contact-sheet captions, speech and search`.

Commit gợi ý:
1. `feat(broll): content hash cache and scene detection`
2. `feat(broll): keyframes and contact sheets`
3. `feat(broll): batched captions through the vision agent`
4. `feat(broll): optional speech transcripts`
5. `feat(broll): search and shot suggestions`
6. `feat(ui): footage search and B-roll suggestions`
7. `docs(broll): costs and cache`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu: **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- `file:line`.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng. Hết quota đọc ảnh thì dừng ở bước offline đã xong (cache giữ lại) và báo người dùng.
