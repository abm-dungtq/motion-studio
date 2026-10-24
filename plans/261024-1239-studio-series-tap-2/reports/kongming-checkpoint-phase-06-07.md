# Checkpoint kongming sau phase 06–07 (2026-10-24)

Kết luận: **GO sang phase 09 sau khi 08 merge.** Bằng chứng thật khớp báo cáo; hợp đồng mục E làm đủ phần công cụ, còn hai dòng kiểm của E là việc người dùng ở bước 7 (ghi rõ dưới). Ba câu hỏi được trả lời ở mục 3–5. Một sửa nhỏ đã áp vào phase 11 (mục 6). Không sửa phase 08.

## 1. Bằng chứng đã kiểm

| Cái gì | Kết quả |
|---|---|
| `cd $MS && npm test` tại `67232cb` | node 450 test, 448 pass, 2 skip có sẵn, 0 fail; ui 258 pass; ownership 6 pass |
| `cd $OVC && node --test scripts/tests/*.test.mjs` tại `40f8aeb` (main, cây sạch) | 569 pass, 0 fail |
| `cd $S && node --test tools/tests/*.test.mjs` | 51 pass, 0 fail |
| Mốc nhập a-01 | `WARN` trong `$T/a01-import-8.txt` trùng `reports/a01-import-moc-warn.txt` (0 dòng mới); `$T/root/a-01/project.json` có |
| `git log` MS | #27 `ced48e1`, #28 `4b39f6d`, #29 `a94fc4c`, #30 `67232cb` đúng như báo cáo; cây sạch ngoài `plans/` |
| Studio 4317 | pid 82168 vẫn chạy, `~/.config/motion-studio/studio.json` root `/Volumes/2/Edit-Video`, khởi động 2026-10-23 17:45:32 (+0700), tức 28 giây sau commit `8408c00` → server đang chạy mã **#22**. Cổng 4420 trống, không còn tiến trình đạo diễn hay render |
| Kho S | `voices/roles.json` có `ba-noi`; `cast.json` chưa có `ba-noi` (đúng: chờ người dùng chọn); `characters/ba-noi/approval.json` `approved: true`, 2026-10-24, `user@studio` (duyệt thay, ghi chú trong `notes`); `studio-series.json` khai báo 11 công cụ gồm `cast-tts`, `voice-design` |

## 2. Đối chiếu hợp đồng mục E

| Dòng hợp đồng | Trạng thái |
|---|---|
| `lines[].speaker` tùy chọn | Có (`manifest.mjs`, PR opus-video #7) |
| import đọc `scenes/roles.json` và dấu cổng | Có, nối theo số `NN` (điểm sai 6, 22 của plan) |
| op `set_line_speaker` đánh dấu câu cũ | Có, kèm `set_line_audio`; `STUDIO_API` vẫn 4 |
| `series_tts` chạy cast-tts → mix → lipsync → timing | Có qua công cụ series; chỉ kiểm bằng cast-tts giả |
| `voice_design` tạo giọng, thẻ nghe 2–3 mẫu, chọn ghi `cast.json` | Có; 3 bản thật đã sinh; `save` chưa chạy |
| Tab lồng tiếng có ô người nói, tô màu theo vai | Có (`VoiceTab.tsx` +87 dòng) |
| Kiểm: nhập a-01, 43 câu có speaker và `gate: pass` | **Đạt** (`OK-A01-SPEAKERS`) |
| Kiểm: đổi người nói một câu, lồng lại ra -16 LUFS | **Chưa chạy thật** — plan chủ ý không tốn lượt ngoài phần được phép; là việc bước 7. Ghi vào `viec-nguoi-dung-tap-2.md` (phase 11) để người dùng đo một câu đầu tiên bằng `mix-balance` |
| Kiểm: bà nội có giọng trong `cast.json` | **Chờ người dùng bấm "Chọn giọng này"** (cần 4317 chạy bản mới, tức sau phase 11, hoặc xem mục 5) |

## 3. Câu 1: đạo diễn vẫn gọi được `eleven.mjs tts` — nên chặn từ Studio không?

**Đề xuất: có, chặn bằng deny rule chỉ cho dự án series, không đụng `ALLOWED_TOOLS`. Cỡ S (1,5–2 giờ hai repo). Gánh ở phase 10.**

Sự thật đã kiểm:
- `director.mjs:125-130` dựng argv `--allowedTools … --disallowedTools …p.director.deniedTools`; `claude --help` (2.1.304) xác nhận `--disallowedTools, --disallowed-tools <tools...>` nhận dạng `Bash(git *)`. Không gọi model.
- `DENIED_TOOLS` của plugin đã có tiền lệ cùng hình dạng: `Bash(node ${OV}/scripts/make-pitch.mjs choose*)` (`studio-api.mjs`, chú thích ghi đã kiểm với haiku). Deny thắng allow, và deny Bash khớp mọi lệnh con của chuỗi `&&` (tài liệu permissions, ghi nhớ kongming 2026-10-17).
- `eleven.mjs` lấy lệnh con là **đối số đầu tiên** (`const [cmd, ...rest] = process.argv.slice(2)`, dòng 85); các lệnh: `doctor, voice-info, models, tts, sfx, music, audio-meta, probe-models`. **`audio-meta` cũng gọi `tts()` cho từng câu** (dòng 309–330), nên phải chặn cả nó; `voice-info`, `models`, `doctor` chỉ đọc.
- Cách gọi khác (`$OV`, dấu nháy quanh đường dẫn, đường tương đối) không khớp allow `Bash(node ${OV}/scripts/*)` nên đã bị từ chối sẵn trong `-p`; chỉ cần deny đúng cách gọi được phép.
- `seriesRule(p, dir)` (`director.mjs:78-82`) đã biết dự án có thuộc series không; luật prompt hiện có (cấm `eleven.mjs tts`, `voice*`) đúng ý nhưng chỉ là lời khuyên.

Thiết kế cụ thể:
1. Plugin (`$OVC`, gộp vào PR `feat/delivery-commands` của task 10.1 vì PR đó đã sửa `studio-api.mjs`): thêm export mới, không tăng `STUDIO_API`, không đổi `ALLOWED_TOOLS`/`DENIED_TOOLS`:
   `export const VOICE_DENIED_TOOLS = [`Bash(node ${OV}/scripts/eleven.mjs tts*)`, `Bash(node ${OV}/scripts/eleven.mjs audio-meta*)`];` kèm chú thích bất biến: "giọng của một tập series chỉ đi qua công cụ series có thẻ đồng ý". Test trong `scripts/tests/*`: hai mẫu có mặt, không mẫu nào khớp `sfx`/`music`.
2. Studio (PR `feat/series-delivery` của phase 10): `lib/providers/opus-video.mjs` thêm `director.voiceDeniedTools: api.VOICE_DENIED_TOOLS ?? []` (plugin cũ → rỗng, không vỡ); `director.mjs` `claudeArgs(p, prompt, sid, mcp, extraDenied = [])` nối thêm khi `seriesRule` trả về luật (cùng điều kiện, một nguồn sự thật); `launch` truyền vào. Test `tests/director.test.mjs`: dự án series có hai mẫu trong argv, dự án thường không có; `tests/fake-plugin.mjs` xuất mảng giả.
3. Verify hành vi một lần (một lượt Claude haiku, không tốn Codex/ElevenLabs): trong thư mục tạm, chạy `claude -p "Chạy lệnh: node $OVC/scripts/eleven.mjs tts --help, rồi node $OVC/scripts/eleven.mjs sfx --help" --model haiku --output-format json --permission-mode acceptEdits --allowedTools <đúng ALLOWED_TOOLS> --disallowedTools <DENIED_TOOLS + VOICE_DENIED_TOOLS>`; kết quả phải cho thấy lệnh `tts` bị từ chối quyền và `sfx --help` chạy. Dùng argv do `claudeArgs()` in ra, không gõ tay (ghi nhớ kongming).
4. `docs/series.md` dòng 113 và lưu ý cuối `viec-nguoi-dung-tap-2.md` đổi từ "chỉ nằm trong prompt" sang "bị chặn bằng quyền cho dự án series".

Vì sao không làm ở phase 09: 09 là PR Studio về cảnh, không có PR plugin; phase 08 đang sửa `studio-api.mjs` song song nên PR plugin mới lúc này sẽ đụng file. Phase 10 có sẵn PR ở cả hai repo. Vì sao không chặn cả `eleven.mjs` cho series: `sfx`/`music` đạo diễn vẫn cần (plan và hợp đồng cho phép), và chúng không có cổng viet-pro.

Đây là thêm phạm vi so với plan đã duyệt (plan ghi "chặn hẳn là việc người dùng quyết" với nghĩa đổi `ALLOWED_TOOLS`; đề xuất này không đổi nó). Mặc định nên làm; bằng chứng lật lại: người dùng muốn đạo diễn tự lồng tiếng trực tiếp trong dự án series, hoặc probe haiku cho thấy deny có đối số không khớp (khi đó rơi về phương án B: chặn cả `eleven.mjs` cho series và thêm tool Studio cho sfx/music, cỡ M, phase sau tập 2).

## 4. Câu 2: tự kiểm ảnh tốn gấp 4 — phương án và chi phí (chưa làm, chờ người dùng)

Đo được ở phase 06 (`phase-06-ket-qua.md`): 4 ảnh → 8 lượt vẽ + 8 lượt đọc; cả 4 lần vẽ lại tự động đều vẫn trượt (`flat_green` luôn trượt với ảnh Codex dù `import-sprite` tách sạch; `right_character` trượt vì ảnh tham chiếu chỉ là mẫu nét vẽ). Tức là 8 trong 16 lượt không đổi được kết quả. Tập 2 còn khoảng 7 tư thế + 6 nền + đạo cụ vật: với cách hiện tại là xấp xỉ 4 lượt mỗi ảnh.

| # | Phương án | Sửa ở đâu | Cỡ | Tiết kiệm mỗi ảnh | Đánh đổi |
|---|---|---|---|---|---|
| A | Giữ nguyên | — | 0 | 0 | 4 lượt/ảnh, thẻ đã ghi trần đúng |
| B | Đặt `agents.order.vision` trong `~/.config/motion-studio/studio.json` để `claude` (hoặc `agy`/`gemini`) đọc ảnh trước Codex (`lib/agents/index.mjs:44-46`, `pick` ưu tiên `caps.vision === "yes"`) | cấu hình, không mã | 10 phút | 2 lượt Codex (đổi sang quota Claude) | Tốn quota Claude của người dùng; phải kiểm `claude` có `caps.vision` là `yes` trong quét agent |
| C | Bỏ vẽ lại tự động: trượt kiểm → `needs_review` ngay, người dùng bấm "Vẽ lại" kèm lý do (nút đã có) | `lib/assets/batch.mjs` nhánh `again` (dòng ~300-310), `estimate.codex_max` = n vẽ + n đọc, test, `docs/assets.md` | XS, ~45 phút | 2 lượt | Thêm một lần bấm của người dùng khi ảnh thật sự hỏng; mất lợi ích vẽ lại tự động cho `no_text`/`single_figure` |
| C' | Vẽ lại tự động chỉ khi trượt `no_text` hay `single_figure`; trượt `flat_green`/`right_character` thì chỉ ghi `needs_review` | như C | S, ~1 giờ | 2 lượt trong trường hợp hay gặp | Trần thẻ vẫn 4n (không biết trước trượt gì) |
| D | `right_character` chỉ bật khi ảnh tham chiếu thuộc thư mục của chính nhân vật (`refs/<id>-hd/`, `characters/<id>/`), còn tham chiếu nét vẽ thì tắt; hoặc thêm trường `refs_role: "style"` trong file đợt do đạo diễn ghi | `checkKeys`/`validateBatch` của `batch.mjs`, docs | S, ~1,5 giờ | 1 vẽ + 1 đọc ở đợt thiết kế nhân vật mới | Đợt tư thế vẫn kiểm đúng; cần đạo diễn khai báo đúng |
| E | `flat_green` đo bằng điểm ảnh tại chỗ (tỉ lệ điểm gần `#00FF00` ở viền và nền) thay cho hỏi agent | `batch.mjs` + bộ đọc PNG (S đã có `quantize.mjs`, `import-sprite.mjs` đọc PNG; dùng chung) | M, 2–3 giờ | lượt đọc chỉ còn để `no_text`/`single_figure`; bỏ vẽ lại vô ích | Thêm mã xử lý ảnh trong Studio; ngưỡng cần chỉnh |

Gợi ý mặc định nếu người dùng hỏi: **C' + D** (cỡ S, một PR `fix(assets)` riêng, làm **trước phase 10** vì task 10.2 dùng `runBatch` cho thumbnail và sẽ đụng `batch.mjs`), cộng **B** nếu người dùng chấp nhận tốn quota Claude để đọc ảnh. Không làm gì cho tới khi người dùng quyết; thẻ hiện đã ghi trần 4n nên không ai bị bất ngờ.

## 5. Câu 3: giao diện mới trên server 4317 cũ — rủi ro cho người dùng

Sự thật: `GET /` của server đọc `ui/dist/index.html` từ đĩa **mỗi lần** (`server.mjs:314-318`), còn mã Node (routes, lib) là ESM đã nạp lúc khởi động và không đổi. Bản dựng giao diện hiện tại ghi 16:00:14 (+0700) lúc Studio thử 4420 khởi động ở task 7.6, mới hơn nguồn (`uiState().stale === false`). Kiểm thật trên 4317: `GET /` trả 200; `GET /api/consent?name=abm-intro` và `/api/series?name=abm-intro` trả 404 `{"error":"không có"}`.

Rủi ro, từ cao xuống thấp:
1. **Cửa sổ trắng khi build lại.** Mỗi lần executor khởi động Studio thử (phase 09, 10) mà nguồn `ui/src` mới hơn bản dựng, Vite dọn `ui/dist` rồi ghi lại (vài giây tới vài chục giây). Người dùng tải lại 4317 đúng lúc đó nhận 503 "Giao diện chưa được build" hoặc 404 asset. Tải lại sau là xong. Giảm: executor báo trước trong report khi sắp `start` Studio thử; không làm gì thêm.
2. **Giao diện mới hơn API.** Trang mới gọi `/api/series`, `/api/consent`, `/api/voice/previews`, `/api/assets` mà server #22 không có. Đã rà: `useSeries` coi 404 là "không thuộc series" (`api.ts:23-25`), `OpenConsentCards` bỏ qua lỗi (`ConsentCards.tsx:9-10`), `useVoicePreviews` coi 404 là null, `useAssets` chỉ bật khi có series. Hệ quả: tab Tài sản hiện "không thuộc series", ô người nói chỉ hiện chữ, không vỡ. Nhưng `useConsent` **poll 2 giây một lần** (`POLL_MS = 2000`) vào 404 khi mở tab Lời & giọng: tốn log, không hại. Ngoài `ui/src/ext/series/` và `VoiceTab.tsx`, không file giao diện lõi nào đổi từ #22 (`git diff --stat 8408c00..HEAD`), nên các tính năng cũ gọi đúng route cũ.
3. **Trang đã mở từ trước khi build lại.** Bản dựng chỉ có 2 file asset (không có chunk tải trễ), nên trang đang mở vẫn chạy tới khi tải lại; tải lại thì nhận bộ mới nhất quán. Không mất việc đang làm ngoài trình duyệt (job chạy ở server).
4. **Không được restart 4317 sớm để "có tính năng mới".** Studio `67232cb` với plugin cài `4fbc815` là trạng thái nửa vời: `series_tts` cần `COMMANDS.timing` và op `set_line_audio` chưa có trong bản cài → lỗi khi người dùng bấm. Giữ đúng plan: restart ở phase 11 sau `npm run setup`.

Nếu người dùng muốn chọn giọng bà nội **trước** phase 11: cách an toàn là executor mở Studio thử 4420 trên `$T/root-series` với `OPUS_VIDEO_HOME=$OVC` (như task 7.6) cho người dùng vào `http://127.0.0.1:4420` bấm "Chọn giọng này" rồi dừng; chi phí là 4420 bận trong lúc đó nên không chạy Verify tích hợp của phase 09/10 song song. Mặc định: chờ phase 11.

## 6. Sửa đã áp vào phase 09–11

- `phase-11-cai-dat-chay-that-ban-giao.md` task 11.2 (bước 2 và Verify): `pgrep -f "permission-mode acceptEdits"` → `pgrep -f "[p]ermission-mode acceptEdits"`, tương tự `[h]yperframes render`. Lý do: khi shell chạy bằng `-c`, cmdline của chính shell chứa chuỗi tìm nên `pgrep -f` luôn khớp và báo BUSY giả; dấu ngoặc vuông là cách chuẩn né. Trên máy này tool chạy qua file script nên vừa thử không khớp, nhưng executor khác có thể gặp.
- Không sửa phase 09, 10. Hai lưu ý cho executor phase 09 (không phải lỗi):
  - `writeDemoNote` nằm ở `routes/assets.mjs`, không ở `lib/`. `routes/scenes.mjs` import từ `./assets.mjs` được; nếu muốn `lib/scenes.mjs` dùng thì chuyển hàm sang `lib/` và thêm `routes/assets.mjs` vào file sở hữu của phase 09.
  - `$T/root/a-99` chưa có `project.json` (chưa nhập); task 9.5 bước 2 "import lại (`--force`)" chạy lần đầu không cần `--force` (`manifest-import.mjs` thoát 6 chỉ khi đã có `project.json`). `renders/` của a-99 đang rỗng nên Verify `OK-NO-FULL-RENDER` dùng được. `index.html` của a-99 có `window.PREVIEW` (dòng 16, 101) cho task 9.0.

## 7. Giả định

- Phase 08 làm trong worktree riêng, không ghi vào `$OVC` main (cây `$OVC` sạch tại `40f8aeb`); test plugin ở đây là của main, không gồm 08. Độ tin: cao.
- Người dùng vẫn muốn mọi lần tốn ElevenLabs trong dự án series đi qua thẻ (đúng hợp đồng mục 2); vì vậy đề xuất mục 3 không trái quyết định đã duyệt. Độ tin: trung bình-cao; lật lại nếu người dùng nói đạo diễn được tự lồng tiếng.
- Phase 09/10 sẽ khởi động Studio thử ít nhất một lần nữa và nguồn `ui/src` sẽ đổi (9.4, 10.5), nên rủi ro mục 5.1 chắc chắn xảy ra ít nhất một lần. Độ tin: cao.
