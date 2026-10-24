# Đánh giá kiểm thử: nâng cấp Motion Studio cho Sóng Lag tập 2

Thời điểm: 2026-10-24 18:21 (Asia/Saigon). Chế độ: chỉ đọc, không sửa mã hay test, không gọi Codex hay ElevenLabs, chỉ gửi GET tới Studio 4317.

Status: DONE_WITH_CONCERNS
Summary: Mọi bộ test xanh: Motion Studio 474/476 pass (2 skip do môi trường) cộng 275/275 vitest và 6/6 ownership; plugin opus-video 589/589; kho series 55/55. Không có test trượt nên không có test flaky nào được xác nhận, và hai lần chạy Motion Studio cho cùng kết quả. Nhưng ba nhánh lỗi của các module series, asset và delivery mới chưa có test, và gate a-02 còn 5 lý do fail.

## 1. Kết quả test

| Hạng mục | Lệnh | Tổng | Pass | Fail | Skip | Thời gian | Thoát |
|---|---|---|---|---|---|---|---|
| Motion Studio, node | `npm test` (phần `tests/*.test.mjs`) | 476 | 474 | 0 | 2 | 20,9 s | 0 |
| Motion Studio, ui vitest | `npm test` (phần ui) | 275 (43 file) | 275 | 0 | 0 | 6,3 s | 0 |
| Motion Studio, ownership | `scripts/check-ownership.test.mjs` | 6 | 6 | 0 | 0 | 0,14 s | 0 |
| Motion Studio, typecheck | `npm --prefix ui run typecheck` | n/a | n/a | n/a | n/a | nhanh | 0 |
| Plugin opus-video | `node --test scripts/tests/*.test.mjs` | 589 | 589 | 0 | 0 | 14,8 s | 0 |
| Kho series song-lag | `node --test tools/tests/*.test.mjs` (README dòng 28) | 55 | 55 | 0 | 0 | 1,1 s | 0 |

- Hai test skip trong Motion Studio đều do môi trường. Một là đọc `timeline.otio` bằng OTIO thật, vì `opentimelineio` không có trong `/Users/tqd/.claude/skills/.venv/bin/python3`. Hai là test với plugin API 4 thật, vì không có bản clone tại `/Volumes/2/opus-video-upstream-work`.
- Các test `{ skip }` cần ffmpeg (quality-checks, fx-footage) đều chạy, vì ffmpeg có tại `/opt/homebrew/bin`.
- Motion Studio không có script lint, và không có cấu hình eslint, prettier hay biome. Không có lint nào được chạy.

## 2. Flaky

- Motion Studio: chạy `npm test` hai lần, kết quả giống hệt nhau (474 pass, 2 skip, 275 vitest pass, ownership pass). Không có test trượt nên không cần chạy lại để phân biệt flaky.
- Plugin opus-video: hai lần (một lần thường, một lần có coverage), cùng 589/589.
- Kho series: một lần, 55/55.
- Hai lần chạy là ít bằng chứng. Chúng chỉ cho thấy không có flaky lộ rõ, chưa đủ để loại trừ hẳn.

## 3. Thời gian và test chậm

- Motion Studio node: 20,9 s và 20,1 s ở hai lần. Các test chậm nhất gồm: lượt tài khoản codex-pool (6,9 s), deliver_export (6,1 s), asset_batch (5,6 s), và cancel kill child bỏ qua SIGTERM (5,3 s).
- Vitest: 6,3 s. jsdom được tạo 43 lần, tốn 17,2 s (35% thời gian). Có thể giảm bằng `pool: 'vmThreads'` hoặc `isolate: false`, nhưng không bắt buộc.
- Plugin: chậm nhất là test BUSY khóa (5,0 s), không có test nào vượt 6 s.

## 4. Coverage

Repo không có script coverage. Motion Studio có đo bằng `node --test --experimental-test-coverage`. Ui không đo được vì không có `@vitest/coverage-v8`.

- Tổng toàn bộ file: line 80,76%, branch 75,46%, function 78,69%. Con số này gồm cả file trong `~/.claude/skills/opus-video/scripts` được test nạp vào, nên không phải chỉ số riêng của Motion Studio.
- Plugin opus-video tổng: line 85,54%, branch 79,66%, function 87,33%.

Module mới của đợt này:

| Module | Line % | Branch % | Func % | Test chính |
|---|---|---|---|---|
| lib/series-run.mjs | 100,00 | 92,45 | 100,00 | tests/series-tool.test.mjs |
| lib/series.mjs | 100,00 | 77,53 | 100,00 | series-config, series-tool, series-voice |
| lib/series-voice.mjs | 97,51 | 67,31 | 86,00 | tests/series-voice.test.mjs |
| lib/consent.mjs | 100,00 | 86,44 | 92,31 | tests/consent.test.mjs |
| lib/assets/batch.mjs | 100,00 | 79,72 | 97,33 | tests/asset-batch.test.mjs |
| lib/tools/series.mjs | 99,05 | 56,52 | 100,00 | tests/series-tool.test.mjs |
| routes/series.mjs | 98,96 | 73,04 | 100,00 | tests/series-tool.test.mjs |
| routes/assets.mjs | 99,29 | 74,23 | 100,00 | tests/asset-batch.test.mjs |
| routes/delivery.mjs | 98,78 | 71,19 | 92,00 | tests/delivery.test.mjs, tests/drive-upload.test.mjs |
| lib/delivery.mjs | 99,39 | 74,58 | 94,29 | tests/delivery.test.mjs |
| director.mjs | 98,18 | 77,12 | 96,77 | tests/director.test.mjs, tests/director-mcp.test.mjs |

Phần deny của director đã có test: `tests/director.test.mjs:159` (plugin không được sửa, không có `..` sau scripts/) và `:166` (DEMO.md, BRIEF.md và make-pitch choose bị chặn, studio_ask được phép). Dòng chưa phủ trong director.mjs là 155 và 203-205, tức nhánh sự kiện không rõ và nhánh lỗi khi khởi chạy director. Cả hai không liên quan trực tiếp đến deny.

### Vùng thiếu test (ưu tiên giảm dần)

1. `lib/series-voice.mjs:120-122` (`syncText`, nhánh ghi file văn bản TTS khi nội dung chưa có hoặc đã đổi). Không test nào chạy tới nhánh này. Lỗi ghi file `script/*.txt` sẽ không bị bắt.
2. Nhánh BUSY trả 409 chưa có test ở ba nơi: `routes/series.mjs:77-78` (chạy công cụ series đang bận), `routes/assets.mjs:79-80` (đợt ảnh đang chạy), và `routes/delivery.mjs:58-59` (việc giao nộp đang chạy). Test có 409 ở `tests/series-tool.test.mjs:265` là 409 khi tập đã tồn tại, không phải BUSY.
3. `lib/tools/series.mjs:30`, nhánh "việc vẫn chạy sau thời hạn". Test timeout ở `tests/series-tool.test.mjs:196` chỉ kiểm trạng thái `cancelled`, không kiểm nhánh trả lời này.
4. Actor không hợp lệ, `routes/series.mjs:33`, rơi về `human`. Mọi test actor đều dùng giá trị hợp lệ (`director:r-1`).
5. `lib/series-voice.mjs:238-240`, nhánh lỗi của CLI cast-tts. Chưa có test.

## 5. Trạng thái Studio port 4317 (chỉ GET)

Tiến trình PID 66098 đang lắng nghe 127.0.0.1:4317. Tôi không khởi động, không dừng và không restart nó.

| Endpoint | HTTP | Ý chính |
|---|---|---|
| `/` | 200 | Trang UI, `lang="vi"`, 742 byte. Lưu ý dưới đây về token. |
| `/api/status` | 200 | `ok: true`, provider `opus-video` phiên bản 2.5.0, api 4 |
| `/api/projects` | 200 | Mảng 22 dự án |
| `/api/series?name=a-02` | 200 | Các khóa: name, dir, characters, roles, tools, writable, image_styles, episode, delivery_dir, drive |
| `/api/consent?name=a-02` | 200 | `{"cards":[]}`, không có thẻ chờ |
| `/api/gates?name=a-02` | 200 | `pass: false` với 5 lý do: PLAN.md chỉ trích 1 blueprint/rule token (cần ít nhất 2); DEMO.md không có `animatic:`; thiếu build/RECIPES.md; demo/ có 0 PNG (PLAN yêu cầu 1); DEMO.md thiếu phê duyệt. Kèm `animatic: true`, `audio_changed: false` |
| `/api/assets?name=a-02` | 200 | Các khóa: series, batches |

Lưu ý về token: lệnh đọc `/` của tôi đã in 300 ký tự đầu, trong đó có thẻ meta `studio-token` của phiên Studio cục bộ. Token này nằm trong transcript của phiên này. Nó chỉ dùng được với Studio trên 127.0.0.1. Nên xoay token khi Studio được khởi động lại lần sau. Tôi không in lại token.

Trạng thái gate a-02 là dữ liệu sản xuất, không phải lỗi test. Việc sửa gate thuộc về người dùng.

## 6. Kiểm tra chỉ đọc và tình trạng repo

- Motion Studio: nhánh `main`, commit `e905cc4`, trùng với `origin/main` theo `git ls-remote` tại thời điểm chạy. Cây làm việc chỉ có hai mục untracked trong `plans/` (`plans/261024-1239-studio-series-tap-2/` và `plans/journals/2026-10-24-motion-studio-upgrade-for-song-lag-episode-2.md`). Không có file nào bị đổi bởi các lần chạy.
- Plugin opus-video đang cài: commit `4f9b88e` trên `main`, trùng với `origin/main` theo `git ls-remote`. Cây làm việc sạch.
- Kho series: các file có mtime từ 17:09 đến 17:38, trước khi chạy test. Không có file nào thay đổi sau thời điểm đó.
- `/Volumes/2/Hoạt hình/content/261022-chuoi-kenh-ke-chuyen/video/a-01`: không có file nào thay đổi trong 90 phút gần đây. Không ghi vào thư mục này.

## 7. Build

Không chạy `vite build`. Lệnh này không nằm trong phạm vi yêu cầu và sẽ ghi vào `ui/dist`. Typecheck của ui đã đạt.

## Đề xuất (theo thứ tự ưu tiên)

1. Thêm test cho nhánh ghi file TTS trong `syncText` (`lib/series-voice.mjs:120-122`), gồm trường hợp file chưa có và trường hợp nội dung đổi.
2. Thêm test BUSY trả 409 cho `routes/series.mjs`, `routes/assets.mjs` và `routes/delivery.mjs`. Cách làm: giữ một job đang chạy rồi gọi lần hai.
3. Thêm test cho nhánh "vẫn chạy sau thời hạn" (`lib/tools/series.mjs:30`) và cho actor sai định dạng rơi về `human`.
4. Cân nhắc `pool: 'vmThreads'` cho vitest để giảm 17 s dựng jsdom.
5. Thêm `@vitest/coverage-v8` nếu muốn đo coverage của ui.

## Câu hỏi chưa giải quyết

- Kỹ năng `fable-thinking` không có trong danh mục skill của phiên này, nên không gọi. Báo cáo được viết trực tiếp.
- Hook Naming trong bối cảnh chỉ định đường dẫn `plans/261023-1018-react-ui-rewrite/reports/`. Báo cáo này được ghi vào đường dẫn người dùng yêu cầu. Nếu cần vị trí theo hook, phải xác nhận.
- Chỉ số coverage của Motion Studio có lẫn file plugin. Cần một lệnh tách riêng nếu muốn số liệu chính xác cho Motion Studio.
- Gate a-02 còn fail 5 lý do. Cần người dùng quyết định thứ tự xử lý.
- Hai lần chạy Motion Studio chưa đủ để loại trừ flaky hoàn toàn. Nếu cần độ tin cậy cao hơn, chạy lặp 5 lần trở lên.
