# Duyệt cuối plan "Studio làm trọn Sóng Lag tập 2" (kongming, 2026-10-24)

Phạm vi: đối chiếu hợp đồng `C/docs/motion-studio-nang-cap-tap-2.md` (mục "Xong nghĩa là", việc A–J, "Không làm", ràng buộc) với mã trên `main` của hai repo, test chạy lại, và Studio 4317 đang chạy (chỉ `GET`). Không sửa mã, không POST, không tốn lượt.

Kết luận: **GO với 3 việc phải sửa trước khi người dùng bắt đầu bước 7**, trong đó hai việc làm cổng final của a-02 FAIL ngay bây giờ và một việc lộ dữ liệu cá nhân lên repo công khai. Phần công cụ của 10 việc A–J đều có mã, test và bằng chứng chạy thật; phần kết quả tập 2 đúng là việc của người dùng ở bước 7.

## 1. Bằng chứng đã kiểm lại (không lấy từ báo cáo)

| Kiểm | Kết quả |
|---|---|
| `main` Motion Studio | `7db2350` (#32); PR #23–#32 đều merged; 0 PR mở |
| Plugin cài `~/.claude/skills/opus-video` | `6ae4fbf` (#9), `STUDIO_API = 4` (`scripts/studio-api.mjs:27`), cây sạch; 0 PR mở |
| Test Motion Studio (`npm test`) | node 476 test: 474 pass, 2 skip, 0 fail; vitest 275/275; ownership 6/6 |
| Test plugin (bản cài) | 589 pass, 0 fail |
| Test series S | 55 pass, 0 fail |
| `a01_import "$OVI"` trên bản chép | exit 0, `shots=20 lines=43`, WARN khớp mốc (`OK-NO-NEW-WARN`); `--write` ra 43 câu, 43 `speaker` khớp `scenes/roles.json`, 43 `gate: pass`, 8 cảnh, `picture_from_code: true`. `C/video/a-01/project.json` vẫn không tồn tại |
| 4317 (pid 38307, root Edit-Video) | `/api/status` 2.5.0 api 4; `/api/projects` 22 dự án, `a-02` editable, `a-01` chưa nhập, `abm-intro` còn; `/api/series?name=a-02` và `?name=a-01` đều ra "Sóng Lag"; `/api/consent`, `/api/handoff` rỗng; `/api/voice/previews` có 3 bản bà nội; `/api/delivery` tập 2, Drive thư mục `song-lag`, email đã che; `/api/scenes` `can_rebuild: true`; `/api/agent` claude đăng nhập, ffmpeg/ffprobe có. Bundle JS của UI có "Giao nộp", "Chọn giọng", "Nhóm cảnh", "Cần xử lý ngoài", "Tài sản", "Xem rộng", "Nghe rồi" |
| Symlink | `/Volumes/2/Edit-Video/a-01`, `a-02` → `C/video/a-0N` |
| Biên nhận a-02 | 61 file: image-generate 8, image-check 8, consent 3, asset-approve 2, series-episode 1, series-put 28, series-tool 10, voice-design 1; quét `access_token|sk-|sk_|ya29.|xi-api-key` = 0 |
| `S/characters/ba-noi/approval.json` | `approved: true`, `date: 2026-10-24`, `notes` ghi rõ người điều phối duyệt thay; `previous` giữ lần duyệt thiết kế |
| `S/voices/cast.json` | chưa có `ba-noi` (đúng: chờ người dùng chọn giọng); `roles.json` có `ba-noi` |
| `S/studio-series.json` | khóa `name, characters, voices, read, writable, episode, delivery_dir, drive, image_styles, tools`; 13 công cụ; `image_styles` đủ 5 kind; `delivery_dir: kenh-youtube/tap-{N}` |
| Chuỗi Sóng Lag trong mã | plugin: 0. Studio: 0 đường dẫn, **nhưng `lib/series.mjs:94` có email Gmail thật của tài khoản Drive trong chú thích** (xem mục 3) |
| Chặn giọng | `VOICE_DENIED_TOOLS` (`studio-api.mjs:88`) chặn `eleven.mjs tts*` và `audio-meta*`; `lib/providers/opus-video.mjs:100` nối vào provider |
| `COMMANDS` plugin | có `timing, mixBalance, export, vietPro, captions, platform`; `captions-from-words.mjs` tồn tại |
| Cổng hình/tiếng | `pictureHash` (`render-final.mjs:199`), `--legacy-mtime` ở preflight và render-final; CHANGELOG ghi bỏ cờ sau 2026-10-31 |
| `check-preflight --stage final` chạy thẳng trên a-02 | FAIL 4 dòng: thiếu `direction:`, **unknown style `pixel-arcade-hd`**, demo 0 khung, DEMO.md chưa approval. Hai dòng sau là bình thường (tập chưa dựng); hai dòng đầu là vấn đề thật (mục 3) |

## 2. Đối chiếu hợp đồng

Phân loại: **đạt** = có mã, test, và đã chạy thật hoặc kiểm tích hợp; **đạt công cụ, chờ bước 7** = công cụ xong, kết quả phụ thuộc người dùng làm tập 2; **thiếu** = chưa làm hoặc đang hỏng.

### "Xong nghĩa là"

| Mục | Phân loại | Ghi chú |
|---|---|---|
| `video/a-02/renders/` có final, qc-mp4 0 FAIL, -16…-12 LUFS | đạt công cụ, chờ bước 7 | **Nhưng cổng final hiện FAIL vì style `pixel-arcade-hd` không có trong plugin đang cài** (mục 3.1) và BRIEF a-02 không có `direction:`/`creative_override` (mục 3.2). Phải sửa trước khi người dùng tới bước 8 |
| Không gõ terminal; mọi lần ra terminal có thẻ "cần xử lý ngoài" | đạt công cụ, chờ bước 7 | Thẻ handoff đã kiểm thật (`build-rig` lỗi 2 lần → thẻ; `resolved:` → tắt). Nếu không sửa 3.1 bằng PR, người dùng phải gõ 1 lệnh `install-style` ngay trước khi bắt đầu, tức vi phạm chỉ số "0 lệnh" từ đầu |
| `S/kenh-youtube/tap-2/` đủ video, thumbnail, `tieu-de-mo-ta.md` (check-platform PASS), `CAPTIONS.md` (viet-pro delivery PASS); Drive có bản sao | đạt công cụ, chờ bước 7 | `deliver_text`, `deliver_captions`, `deliver_thumbnail`, `deliver_export`, `drive_upload` có mã, test và kiểm tích hợp trên a-99; Drive chỉ kiểm gws giả và `--dry-run` thật (đúng quyết định của plan) |
| Mọi lần gọi Codex, ElevenLabs có biên nhận | đạt | 16 lần Codex + 1 Voice Design trong bài kiểm đều có biên nhận; 0 chuỗi giống token. Lỗ còn lại đã ghi trong danh sách việc: `eleven.mjs sfx|music` vẫn chạy được không qua thẻ |
| `manifest-import` a-01 không WARN mới; test hai repo xanh | đạt | Đã chạy lại hôm nay, xem mục 1 |

### Việc A–J

| Việc | Phân loại | Bằng chứng / ghi chú |
|---|---|---|
| A Khai báo series | đạt | `studio-series.json` đủ khóa; `validateSeries` trong plugin; `/api/series` tìm đúng series cho cả a-01 (dòng dự phòng `Thư mục series:`) và a-02 |
| B Công cụ series | đạt | `series_tool`/`series_list`, từ chối cờ lạ, `..`, ghi ngoài vùng (PR #23, vá #25, test `series-tool.test.mjs`); 10 biên nhận `series-tool` thật trong a-02 |
| C Vẽ theo đợt | đạt công cụ | Đợt thật 2×2 ảnh bà nội chạy xong, có biên nhận; song song và hết lượt giữa chừng kiểm bằng CLI giả (`asset-batch.test.mjs`). Tốn 4 lượt mỗi ảnh (vẽ lại tự động + đọc ảnh) là vấn đề hiệu quả, không phải lỗi; phương án C'+D chờ người dùng quyết (mục 3 danh sách việc) |
| D Bảng duyệt | đạt | `approval.json` `approved: true` kèm ngày; tab Tài sản, Xem rộng 4× (PR #26, #29). Duyệt là do người điều phối duyệt thay, đã ghi rõ |
| E Người nói, lồng tiếng theo vai | đạt công cụ, chờ bước 7 | Import 43 câu đúng vai và cổng (kiểm lại hôm nay); `set_line_speaker`, `series_tts` chạy `cast-tts --mix-out --visemes-out` rồi `timing`; `voice_design` chạy thật ra 3 bản. **Chưa làm:** chọn giọng bà nội (`cast.json`), phép kiểm "đổi người nói một câu rồi lồng lại ra -16 LUFS" từ Studio (chuỗi nén đã kiểm trực tiếp trên câu 12 của a-01 ra -16,7 LUFS ở phase 02) |
| F Cảnh và duyệt theo nhóm | đạt công cụ, chờ a-02 thật | `set_scenes`, `scene_rebuild`, dòng duyệt trong DEMO.md, khóa kéo mép (kiểm trên a-99 và bản chép a-01: `resize_shot` 422 có lý do) |
| G Cổng tách hình/tiếng | đạt | `pictureHash`, WARN "nghe lại", `audio_review`, FAIL khi sửa `scenes/*.mjs` (7 test `picture-gate.test.mjs`); `--legacy-mtime` còn hạn tới 2026-10-31 |
| H Giao nộp | đạt công cụ, chờ bước 7 | Logo là lớp `<img>` trong `index.html` mẫu tập (dòng 41); 5 tool giao nộp; thumbnail có nhãn theo tập; Drive dry-run thật ra `ok`. Lệch đã ghi: bảng chọn thumbnail nằm ở hộp Giao nộp thay vì tab Tài sản (hợp lý) |
| I Thẻ cần xử lý ngoài | đạt | `lib/handoff.mjs`: 2 lần cùng mã → file + thẻ; `resolved:` đóng; kiểm tích hợp phase 10 |
| J1 `--mix-out` mặc định trong cast-tts | đạt qua Studio, lệch chữ | `cast-tts.mjs` vẫn coi `--mix-out` là cờ tùy chọn; `lib/series-voice.mjs:89` luôn truyền nó. Chạy từ terminal không có `--mix-out` thì vẫn ra file chưa nén. Chấp nhận được vì đường chính là Studio |
| J2 Chuẩn hóa nhạc/SFX | đạt | `eleven.mjs` cắt im lặng và đưa về -12,5 LUFS (PR #5) |
| J3 Chốt một bản opus-video | **thiếu một nửa** | `cast-tts.mjs:61` đã về `~/.claude/skills/opus-video`, nhưng `S/tools/install-style.mjs:11` vẫn mặc định `~/.agents/skills/opus-video`, và hậu quả là style `pixel-arcade-hd` chỉ có ở `~/.agents/...`, không có ở bản plugin Studio đang dùng (mục 3.1) |
| J4 Viseme theo TIMING | đạt | `index.html` mẫu tập nạp `assets/voice/NN.visemes.json` theo `lineIds` (dòng 68–72) |
| J5 GSAP cục bộ | đạt | `assets/vendor/gsap.min.js` có trong a-02 |
| J6 `ui-card` có tham số | đạt | `scenes/cards.mjs` + runtime `ui-card.mjs`; `image_styles.ui-card` |

### "Không làm" và ràng buộc

- Không tự đăng mạng xã hội, không sửa tập 1 (`a-01` không có file mới, không `project.json`), không trình sửa cảnh JSON/kéo thả, không kênh B/C: **giữ đúng**.
- Chỉ sửa hai repo + kho S + a-02: đúng. `make-thumbnail.py` của S có sao lưu.
- Không in khóa/token: biên nhận sạch. **Nhưng** email tài khoản Drive nằm nguyên văn trong chú thích mã của repo công khai (mục 3.3).
- Không viết đường Sóng Lag trong mã: đường dẫn thì không có; email thì có (cùng mục 3.3).
- Đạo diễn không gọi `codex exec`: đúng, mọi lần vẽ đi qua `asset_batch`. `ALLOWED_TOOLS` không đổi; chỉ thêm deny list.
- `STUDIO_API` vẫn 4, đúng mốc dừng 3.

## 3. Thiếu thật (phải làm trước bước 7)

### 3.1 Style `pixel-arcade-hd` không có trong plugin Studio đang dùng — cổng final FAIL

- Bằng chứng: `~/.claude/skills/opus-video/data/styles/` không có `pixel-arcade-hd.json` (chỉ `~/.agents/skills/opus-video/data/styles/` có); `node styles.mjs validate` của bản cài PASS 64 profile, không có hd. `check-preflight --stage final` trên a-02 và `/api/gates?name=a-01` trên 4317 đều in `unknown style "pixel-arcade-hd"; nearest: pixel-arcade`.
- Nguyên nhân: tập 1 render bằng bản plugin ở `~/.agents` (nơi `install-style.mjs` chép vào). Studio dùng `~/.claude`. Việc J3 chỉ sửa `cast-tts`, bỏ quên `install-style`; `S/README.md:22` cũng dặn "cài lại sau mỗi lần cập nhật plugin" nhưng phase 11 không chạy.
- Hệ quả: người dùng không render được final ở bước 8; không có công cụ series nào cài style được (ghi vào cây plugin, ngoài vùng `writable`), nên cách duy nhất là terminal.
- Khuyên: **không** chép tay vào `~/.claude/...` rồi thôi, vì `data/styles/index.json` là file git theo dõi; sửa nó khiến `npm run setup` (`pull --ff-only`) có thể kẹt lần sau. Làm một PR nhỏ trên opus-video: thêm `data/styles/pixel-arcade-hd.json` (chép từ `S/style/`) và chạy `styles.mjs index --write`, test `styles` xanh; rồi `npm run setup -- --yes` và restart 4317. Đồng thời sửa `install-style.mjs:11` về `~/.claude` để `S/README.md` đúng. Nếu không muốn đưa style của series vào plugin, phương án B là `styles.mjs` nhận thêm thư mục style từ `studio-series.json` — tốn hơn, không cần cho tập 2.

### 3.2 BRIEF a-02 không có `direction:` lẫn `creative_override` — cổng final FAIL, danh sách việc không có bước này

- Bằng chứng: `check-preflight.mjs:337` FAIL khi `brief_version >= 2` mà không có `direction:`; mẫu `S/templates/episode/BRIEF.md.tmpl` không có dòng nào trong hai dòng đó; a-01 có `direction: A7`. `viec-nguoi-dung-tap-2.md` không có bước chọn hướng.
- Khuyên (mặc định): thêm vào mẫu tập và BRIEF a-02 dòng `creative_override: hướng thị giác do series khóa ở style/direction.json` (≥10 ký tự → cổng chỉ WARN, `check-preflight.mjs:325-329`). Lý do: hướng của series đã chốt trong `S/style/direction.json`, bắt chọn lại A1–A9 cho mỗi tập là thừa. Phương án khác: thêm vào danh sách việc bước "bấm thẻ gợi ý hướng của đạo diễn" (`routes/suggest.mjs` → `choose` ghi `direction:`), cho giống a-01. Người dùng quyết; mặc định là `creative_override`.

### 3.3 Email tài khoản Drive nằm trong chú thích mã của repo công khai

- Bằng chứng: `/Volumes/2/Motion-Studio/lib/series.mjs:94` chú thích hàm `maskAccount` lấy đúng email Gmail thật làm ví dụ. Repo `abm-dungtq/motion-studio` là PUBLIC.
- Vi phạm hai điều: ràng buộc "không có `xaopako` trong mã Studio" và nguyên tắc không đưa dữ liệu cá nhân vào repo. Sửa: đổi ví dụ thành `someone@example.com`. Email đã nằm trong lịch sử git công khai từ #32; không rewrite lịch sử, chỉ sửa đi và cân nhắc đổi email nhận thông báo nếu lo spam.

## 4. Danh sách việc người dùng (`viec-nguoi-dung-tap-2.md`)

Đủ 12 mục, thứ tự đúng, mỗi mục có chỗ bấm, có tốn lượt hay không, và điều kiện xong; các việc "Chờ bạn quyết" nêu đúng (giọng bà nội, tờ nhân vật, phương án tự kiểm ảnh, kiểm -16 LUFS, viet-pro trước captions, Drive thật). Cần thêm hoặc sửa:

1. Thêm bước **hướng thị giác / `creative_override`** trước mục 7 (mục 3.2), hoặc ghi rõ đã sửa trong mẫu tập.
2. Mục 8 "Xuất video" phải ghi điều kiện: style `pixel-arcade-hd` đã có trong plugin (mục 3.1). Hiện bấm sẽ FAIL ngay.
3. Mục 11 "Dọn rác" bảo chạy `./scripts/sweep-after-final.sh` ở terminal; mâu thuẫn với "không gõ terminal". Ghi rõ đây là việc tùy chọn sau giao nộp và không tính vào chỉ số 0 lệnh, hoặc bỏ khỏi danh sách.
4. Mục 4 nhắc "chạy cổng check-viet-pro" nhưng không nói ai bấm: ghi rõ là nhờ đạo diễn chạy, người dùng chỉ đọc kết quả.
5. Mục 7 nên nói thêm WARN `PLAN.md has no "## Nhịp"` là cảnh báo, không chặn.

## 5. Rủi ro còn mở (không chặn)

- `eleven.mjs sfx|music` tốn lượt không qua thẻ; kiểm biên nhận sau mỗi tập như danh sách việc đã ghi.
- Mỗi ảnh Codex tốn ~4 lượt do tự kiểm; phương án C'+D là PR nhỏ, nên làm trước đợt vẽ 7 tư thế + 6 nền (khoảng 13 ảnh → tiết kiệm ~26 lượt).
- `--legacy-mtime` phải gỡ sau 2026-10-31.
- Đổi người nói làm đổi `scenes/roles.json` → đổi `pictureHash` → FAIL cổng final, phải duyệt animatic lại (đã ghi ở phase 08). Người dùng cần biết trước khi "kiểm đổi người nói" ở mục 5.

## 6. Việc tiếp theo, theo thứ tự

1. PR opus-video: thêm `data/styles/pixel-arcade-hd.json` + `index --write`; sửa `S/tools/install-style.mjs` về `~/.claude`. Rồi `npm run setup -- --yes`, restart 4317, kiểm `GET /api/gates?name=a-02` không còn dòng `unknown style`.
2. Sửa `BRIEF.md.tmpl` và `C/video/a-02/BRIEF.md`: thêm `creative_override` (hoặc ghi bước chọn hướng vào danh sách việc).
3. PR Motion Studio: đổi email trong chú thích `lib/series.mjs:94` thành ví dụ giả.
4. Cập nhật `viec-nguoi-dung-tap-2.md` theo mục 4.
5. (Nên) PR `fix(assets)` C'+D trước đợt vẽ lớn.
6. Bắt đầu bước 7.

## Giả định

- 4317 chỉ kiểm bằng GET; thẻ/route POST tin theo test và báo cáo phase (độ tin: cao, test tích hợp đã chạy trên 4420).
- Drive thật chưa từng tải; coi dry-run là đủ cho phần công cụ (độ tin: trung bình; lần tải thật đầu tiên có thể lộ lỗi quyền gws).
- `~/.agents/skills/opus-video` không phải bản Studio dùng (độ tin: cao, `cast-tts.mjs:61`, provider đọc `~/.claude`).
