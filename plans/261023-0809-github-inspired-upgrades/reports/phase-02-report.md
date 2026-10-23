# Báo cáo phase 2: Anime motion comic

Ngày 2026-10-23. Nhánh `feat/anime-pipeline`, worktree `/Volumes/2/Motion-Studio/.claude/worktrees/anime-pipeline`.

**PR:** https://github.com/abm-dungtq/motion-studio/pull/5 (chưa merge). GitHub báo `MERGEABLE`, trạng thái `CLEAN` với `main` hiện tại.

## Kết quả

Đã xong toàn bộ phạm vi của phase:

- mẫu hệ lật ảnh;
- thư viện nhân vật;
- shot board;
- sinh biến thể tư thế (tách nền, phóng to);
- sửa manifest có sao lưu và build;
- route `/api/anime/*` và 3 tool;
- tab Anime;
- tài liệu.

Cả ba tiêu chí nghiệm thu thật đều đạt. Tốn 1 ảnh quota.

### Commit

| Commit | Nội dung |
|---|---|
| `b9144ce` | `feat(anime): limited-animation template` |
| `4e542aa` | `feat(anime): manifest editor with backups and rebuild` |
| `7e2d5ff` | `feat(anime): chroma key and upscale for generated poses` |
| `3a1f6fe` | `feat(anime): character library, shot board and pose variant jobs` |
| `60be8fd` | `feat(ui): anime tab` |
| `832aa1a` | `docs(anime): motion-comic workflow` |
| (cuối) | `fix(ui): show anime warnings as a full-width notice` |

Không commit nào nhắc AI hay có dòng Co-Authored-By. Không có mã phase trong code, test hay commit. Không thêm dependency npm. Tên provider mặc định không xuất hiện trong file mới (đã grep).

### File

Code:

- `templates/anim/build.mjs`, `templates/anim/anim.js`, `templates/anim/manifest.example.json`;
- `lib/anime/keying.mjs`, `prompts.mjs`, `manifest.mjs`, `chars.mjs`, `board.mjs`, `variant.mjs`;
- `routes/anime.mjs`, `lib/tools/anime.mjs`;
- `public/ext-anime.js`, `public/ext-anime.css`, `public/anime-board.js`, `public/anime-chars.js`, `public/anime-manifest.js`;
- `docs/anime-motion-comic.md`.

Test:

- `tests/anime-keying.test.mjs`, `tests/anime-manifest.test.mjs`, `tests/anime-variant.test.mjs`, `tests/anime-routes.test.mjs`;
- `tests/fixtures/anime/zoro-manifest.json`.

## Test

- Trên nhánh, `npm test` cho `ℹ tests 166`, `ℹ pass 166`, `ℹ fail 0`. Lúc tách nhánh `main` có 141 test, cộng 25 test mới.
- Thử gộp với `origin/main` mới nhất (đã có #3 và #4), chạy trong worktree tạm, đã gỡ sau đó: `ℹ tests 201`, `ℹ pass 200`, `ℹ fail 0`, `ℹ skipped 1`. Test bị bỏ qua thuộc `main`: `nle-export` cần `xmllint` hoặc OpenTimelineIO, máy này thiếu. Test đó không thuộc phase này.
- Test template build manifest Zoro bằng mẫu và bằng `build.mjs` gốc của Zoro, cả hai trong thư mục tạm. Hai kết quả chỉ khác tên global. Build hai lần ra cùng sha256.

## Nghiệm thu thật (cổng 4402)

1. **Board Zoro, chỉ đọc.** Board có 14 shot, đúng 14 giá trị khác nhau của `manifest.stacks[*].shot` (đếm bằng `node -e`). Có nhãn "chưa nhập project.json". Thumbnail đúng plate.
2. **Biến thể thật trên `ms-smoke-2`.** Shot s11, ảnh gốc `assets/plates/s11-zoro.png`, đính sheet Zoro, thay đổi "eyes closed (blink), everything else identical". Job sinh ảnh qua `codex-pool`, exit 0.
   - File ra là `assets/plates/anim/s11-blink.png`, `ffprobe` cho `1672,942,rgba`. Rộng bằng plate (1672). Alpha ở góc bằng 0.
   - Màu nền đo được là `0x004EFD`, despill blue, phóng to bằng lanczos (máy không có realesrgan).
   - Có hai biên nhận: `.opus/receipts/20261023/anime-variant-mvkco4kk-98d291.json` và `image-generate-mvkco43c-f67152.json`.
3. **Sửa `blink.at` trên UI.**
   - Thêm track blink (pose `s11-blink`, `at` = 1.0), bấm "Lưu và build", exit 0. Chép `anim-data.js` ra `/tmp/ms-anim-data-1.js`.
   - Sửa `at` thành 1.5 trên UI rồi build lại, exit 0.
   - `git diff --no-index` cho thấy đổi đúng 1 dòng: các khung `[30,"s11-blink"],[33,"base"]` thành `[45,"s11-blink"],[48,"base"]`.
4. **Cảnh báo build.** Thêm track keys có pose thiếu file thì build vẫn thành công. UI hiện "Build xong, 1 cảnh báo" kèm dòng `missing assets/plates/anim/s11-k2.png -> base`. Sau đó đã bỏ track này và build lại sạch.
5. **Zoro không bị ghi.** `find /Volumes/2/Edit-Video/zoro-vs-mihawk -newer /tmp/ms-phase2-start.marker` không ra gì.
6. **Dọn tiến trình.**
   - Server 4402 đã dừng: `lsof` không còn ai nghe cổng 4402.
   - Đã đóng phiên trình duyệt `ms-smoke-2`.
   - Server 4317 (PID 63883) vẫn chạy, không đụng tới.

Ảnh chụp nằm ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-anime-shots/`:

- `01-zoro-board.png`
- `02-zoro-shot-s4.png`
- `03-zoro-manifest-readonly.png`
- `04-smoke-variant-result.png`
- `05-smoke-manifest-blink-build.png`
- `06-smoke-build-warnings.png`

## Quota

Dùng 1 ảnh qua `codex-pool`, trong giới hạn 3. Trước khi thử: acct1 5h 12%, acct2 5h 2%. Không đổi tài khoản bằng tay.

## Lệch so với phase

- **File fixture ngoài danh sách sở hữu.** `tests/fixtures/anime/zoro-manifest.json` là file mới, chép từ manifest Zoro, để test round-trip không phụ thuộc dự án ngoài repo. File không đụng file của phase khác.
- **Mã 428.** Dự án đã có `renders/*final*.mp4` mà lưu hoặc build thiếu `confirm` thì trả 428 (Precondition Required). Phase chỉ nói "hỏi xác nhận".
- **Tên file sao lưu** dùng giờ ISO UTC, ví dụ `.opus/anim-backups/2026-10-23T02-28-30-077Z.json`.
- **Khối `TIMING` trong `index.html` phải là JSON** (khoá có ngoặc kép), vì `build.mjs` gốc parse bằng JSON. Đã ghi trong tài liệu.
- **Stack s7 của Zoro không có plate**, nên thumbnail của nó là `null` và board hiện "không có ảnh".
- **Commit thứ 4** ghi "character library, shot board and pose variant jobs" thay cho "character library and shot board", vì commit đó gồm cả job biến thể. Thêm một commit `fix(ui)` cho CSS.
- **Build manifest với track keys phủ cả shot:** blink bị keys đè (log cho 1 pose event). Đây là luật của `build.mjs` gốc, giữ nguyên.

## Để lại, cần người dùng quyết

- Dự án thử `/Volumes/2/Edit-Video/ms-smoke-2`: có ảnh plate và sheet chép từ Zoro, biến thể `s11-blink`, receipt và sao lưu. Chỉ xoá khi người dùng đồng ý.
- File tạm:
  - `/tmp/ms-smoke-2.mjs` (script chạy server thử);
  - `/tmp/ms-anim-data-1.js`, `/tmp/ms-pr2-body.md`, `/tmp/ms-phase2-start.marker`;
  - `/tmp/ms-ref/AIComicBuilder` (bản clone để đọc).

## Status

Status: DONE_WITH_CONCERNS
Summary: Tab Anime đã xong. `npm test` xanh: 166/166 trên nhánh, 200 đạt và 1 bỏ qua khi gộp với `main` mới. Nghiệm thu thật đạt, tốn 1 ảnh `codex-pool`. PR #5 đã mở, chưa merge.
Concerns: (1) File fixture `tests/fixtures/anime/zoro-manifest.json` nằm ngoài danh sách sở hữu, dù là file mới. (2) Dự án thử `ms-smoke-2` và các file trong `/tmp` còn để lại, chờ người dùng cho xoá. (3) `CHANGELOG.md` chưa thêm dòng; theo plan việc này làm ở commit cuối trước khi merge.
