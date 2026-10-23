# Báo cáo phase 7: hiểu B-roll có sẵn, tối ưu chi phí

- **PR:** https://github.com/abm-dungtq/motion-studio/pull/7 (chưa merge)
- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/broll-index`, nhánh `feat/broll-index`, tách từ `main` ở `f614d77`.
- **Test:** `npm test` đạt 156, lỗi 0. Baseline là 141, nên nhánh thêm 15 test (`tests/broll-*.test.mjs`).
- **Commit:** 7 commit, đều theo conventional commits.

## Đã làm

1. `lib/broll/hash.mjs`: sha256 đọc theo khối 4 MB, nhớ theo (realpath, size, mtime). Có `peekHash()` để đếm trước mà không đọc file.
2. `lib/broll/ffmpeg.mjs`: chạy ffmpeg/ffprobe không qua shell, có timeout và có huỷ. Hook `onExec` dùng để test đếm lần giải mã.
3. `lib/broll/scenes.mjs`: `scdet` trên khung đã thu nhỏ, đọc log, gộp shot ngắn theo kiểu `min_scene_len` của PySceneDetect.
4. `lib/broll/frames.mjs`: kế hoạch keyframe; contact sheet 3×3 dựng bằng `xstack`, số ô là ảnh PPM; xếp nhóm ô first-fit.
5. `lib/broll/describe.mjs` và `describe-schema.json`: prompt chỉ nói "Ảnh n, ô k"; ánh xạ câu trả lời về (clip, shot); thử lại một lần với agent kế.
6. `lib/broll/speech.mjs`: `silencedetect`, và ASR qua `media-use/scripts/transcribe.mjs`. Không có engine thì `transcript: null`.
7. `lib/broll/index.mjs`:
   - điều phối và cache theo version từng bước;
   - một lượt chạy mỗi máy (`run.lock`), huỷ được;
   - `enqueueIndex` sau register, chỉ chạy bước offline;
   - biên nhận `broll-index`;
   - lệnh `run` cho job.
8. `lib/broll/search.mjs` (BM25 với `fold()`) và `lib/broll/suggest.mjs` (truy vấn từ tên shot, `motion_note` và lời thoại; top 5; `need_stretch`).
9. `lib/broll/apply.mjs`: cắt đoạn vào `assets/broll/` (crf 14), ghi biên nhận `broll-cut`, rồi `set_shot assets` qua gateway.
10. `routes/broll.mjs`: `search`, `clip`, `thumb`, `plan`, `index`, `job`, `suggest`, `apply`.
11. `lib/tools/broll.mjs`: `broll_search`, `broll_describe_clip`, `broll_suggest`.
12. Giao diện:
    - `public/ext-broll.js`, `public/broll-search.js`, `public/ext-broll.css`;
    - mục "Tìm trong footage" và "Phân tích footage" trong tab Footage;
    - mục "Gợi ý B-roll" trong inspector shot, có nút "Đặt vào shot";
    - kéo kết quả lên timeline bằng `text/x-ms-media`.
13. `media.mjs`:
    - register xếp video mới vào hàng đợi phân tích (import lười để tránh vòng import với `lib/quality`);
    - export `hashFile`;
    - kết quả trả về của register giữ nguyên.
14. `docs/broll-index.md`: cách dùng, chi phí đo được, cài đặt, riêng tư, cache, HTTP và tool, chỗ lệch, hạn chế.

## Nghiệm thu

| Tiêu chí | Kết quả |
|---|---|
| Lần đầu toàn workspace xong; số lượt ≤ ceil(shot/12) | Đạt. 21 file, 17 clip, 33 shot. Offline 43,6 s. Chú thích **2 lượt agy** (giới hạn là 3) trong 227 s. 33/33 shot có chú thích, 0 lỗi |
| Lần hai: 0 lượt, 0 giải mã, mọi file "đã có trong cache" | Đạt. Job ghi 22/22 "đã có trong cache" (lúc này đã có thêm một file trùng nội dung), 0 lượt, 0,1 s. Một lượt đếm bằng hook `onExec` cho 0 lần chạy ffmpeg/ffprobe |
| Có dấu và không dấu cho cùng kết quả | Đạt. "kiem" = "kiếm" (14 shot kiếm sĩ), "bien" = "biển" |
| "Đặt vào shot" ghi `assets` qua gateway, có phiên bản mới, Hoàn tác được | Đạt trên `ms-smoke-7`: shot s2 lên v3 với `assets/broll/ref-anime-samurai-duel-12_30-14_30.mp4` (h264, 2,0 s, có biên nhận `broll-cut`). Bấm Hoàn tác lên v4 với `assets` rỗng |
| Ảnh chụp | `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-broll-shots/`: `01-search-kiem.png`, `02-analyze-box.png`, `03-suggest-shot.png`, `04-placed-v3.png`, `05-undo.png` |
| Server 4407 dừng; không còn process `broll` hay `whisper-cli` | Đạt. `lsof -i :4407` rỗng, `pgrep -f "broll\|whisper-cli"` rỗng. 4317 vẫn PID 63883, không bị đụng |

**Quota đã tiêu:** 2 lượt đọc ảnh (agy), đúng hạn mức 2. Không sinh ảnh. Không gọi đạo diễn: lúc bấm "Đặt vào shot" đã bỏ chọn "Nhờ đạo diễn".

**Footage gốc:** chỉ đọc. Không file nào trong `footage/raw` bị sửa hay dời.

## Lệch so với phase file

- **Sửa `lib/config.mjs` (ngoài danh sách sở hữu).** Thêm `"broll"` vào `SETTINGS`, trong commit riêng. Không có dòng này thì khoá `broll` mất mỗi lần Studio chạy lại, và `broll.vision: false` âm thầm bật lại việc gửi ảnh. Làm theo Failure Protocol: đã hỏi kongming, kongming chọn cách này. Có test khoá hành vi trong `tests/broll-cache.test.mjs`.
- **Không có `drawtext`** trong ffmpeg 8.1.2 của máy (thiếu freetype). Số ô là PPM vẽ từ font bitmap 5×7, lưới dựng bằng `xstack` thay cho `tile`. Có test so điểm ảnh của nhãn.
- **Contact sheet gom shot của nhiều clip**, mỗi shot 1 hoặc 3 ô. Không làm sheet riêng từng clip, vì làm riêng thì không giữ được giới hạn ceil(shot/12). Tờ chỉ sống trong thư mục tạm, nên `thumb` chỉ phục vụ `s<i>-<k>.jpg`.
- **Mỗi lần thử gắn với một agent cụ thể.** `describeImages` tự chuyển agent khi lỗi, nên một lượt gọi có thể thành nhiều lần chạy CLI. Gắn agent giúp ngân sách lượt luôn đúng.
- **Thêm route** `GET /api/broll/plan` (đếm trước khi chạy) và `GET /api/broll/job` (job `_workspace` không xem được qua `/api/jobs`).
- **Thêm file** `lib/broll/ffmpeg.mjs` và `tests/broll-fake.mjs`, đều nằm trong tiền tố `broll` của phase.
- **Tab có id `media`.** Ghi chú "footage" trong `docs/extensions.md` của phase 1 là sai.
- **Nút chú thích chỉ bấm được khi số lượt đã chính xác**, tức không còn file chưa phân tích offline. Trước đó người dùng bấm "Phân tích offline" (không tốn lượt).

## Dọn dẹp

- Server 4407 (PID 69010) đã dừng. Phiên trình duyệt `ms-smoke-7` đã đóng.
- `/tmp/ms-broll-7` (state tạm, script server, nội dung PR) và `/tmp/ms-broll-try` đã xoá.
- Dự án thử `/Volumes/2/Edit-Video/ms-smoke-7` vẫn còn, kèm `assets/broll/` (3 MB). Xoá cần người dùng đồng ý.
- Cache `~/.cache/motion-studio/broll/` giữ kết quả phân tích thật, gồm 17 clip, để dùng tiếp.

Status: DONE_WITH_CONCERNS
Summary: Chỉ mục B-roll theo hash nội dung đã xong và chạy thật trên workspace. Lần đầu tốn 2 lượt agy cho 33 shot, lần hai tốn 0 lượt và 0 lần giải mã; tìm có dấu và không dấu ra cùng kết quả. "Đặt vào shot" có phiên bản mới và Hoàn tác được. npm test đạt 156/0 và PR #7 đã mở, chưa merge.
Concerns:
- PR sửa một dòng `lib/config.mjs` ngoài danh sách sở hữu, như mục "Lệch so với phase file" ở trên. Orchestrator cần duyệt ngoại lệ này.
- ASR (whisper qua `transcribe.mjs`, không chỉ định ngôn ngữ) bịa câu tiếng Anh cho 2 clip có nhạc hoặc tiếng Việt, ví dụ "Thanks for watching!", và câu đó vào chỉ mục tìm kiếm. Cân nhắc đặt mặc định `broll.asr: false`, hoặc sửa upstream cho `transcribe.mjs` nhận tham số ngôn ngữ.
- Huỷ job giữa lượt đọc ảnh thì CLI agent (process group riêng) chạy tới hết timeout của nó, tối đa 3 phút.
- Commit `feat(ui)` có lẫn hai sửa nhỏ ở backend: gắn agent cho mỗi lần thử, và log theo đường tương đối.
- `ms-smoke-7` chờ người dùng đồng ý mới xoá.
