---
phase: 2
title: "Pipeline series và mẫu tập mới (J1, J3, J4, J5, J6, logo)"
status: done
effort: 8h
depends_on: ["phase-01 task 1.0 (clone $OVC)"]
---

# Phase 02: Pipeline series và mẫu tập mới

## Bối cảnh

Những số đã đúng ở tập 1 phải thành mặc định trong mã, không phải kinh nghiệm phải nhớ: chuỗi nén giọng, logo góc dưới phải, GSAP cục bộ, nạp viseme theo danh sách câu. Tập 1 làm các việc này bằng tay trong `a-01/index.html` (43 dòng `import v01…v43` ở dòng 175-197, GSAP từ CDN ở dòng 20, logo dán bằng ffmpeg sau render). a-02 chưa tồn tại, nên chỗ đúng để đặt các mặc định này là một **mẫu tập** trong kho series, cộng một công cụ tạo tập từ mẫu. Phase 03 bọc công cụ đó thành nút trong Studio.

Phase này là phase đầu tiên sửa kho series S, nên việc đầu tiên là sao lưu cả kho.

## Repo, nhánh, PR

- Nơi sửa: kho series `S` (không phải git, không có PR). Mọi thay đổi ghi vào `$PLAN/reports/phase-02-thay-doi-series.md` (danh sách file tạo và sửa).
- Không sửa Motion Studio hay opus-video trong phase này.

## File sở hữu

- Sửa: `S/tools/cast-tts.mjs`, `S/tools/tests/cast-tts.test.mjs`, `S/README.md` (một mục ngắn).
- Tạo: `S/tools/lib/voice-chain.mjs`, `S/tools/runtime/ui-card.mjs`, `S/tools/tests/ui-card.test.mjs`, `S/tools/new-episode.mjs`, `S/tools/tests/new-episode.test.mjs`, cả thư mục `S/templates/episode/`.
- Chỉ đọc: `$C/video/a-01/**` (mẫu để chép cấu trúc), `/Volumes/2/Edit-Video/claude-project-60s/assets/js/gsap.min.js` (GSAP 3.14.2, cùng bản a-01 dùng).

## Tốn lượt

Không. Chuỗi nén kiểm trên file giọng có sẵn của a-01 (bản chép), không gọi ElevenLabs.

## Task 2.0: Sao lưu kho series

Bước:
1. `mkdir -p "$BK"`.
2. `tar -czf "$BK/song-lag-$(date +%Y%m%d-%H%M).tgz" -C "$C/series" song-lag`.
3. Ghi tên file tar vào `$PLAN/reports/phase-02-thay-doi-series.md`.

Tiêu chí thành công: file tar có, đọc được, và chứa `song-lag/tools/cast-tts.mjs`.

Verify:
```bash
f=$(ls -t "$BK"/song-lag-*.tgz | head -1); echo "$f"
tar -tzf "$f" | command grep -c 'song-lag/tools/cast-tts.mjs'   # 1
```

## Task 2.1: Chốt một bản opus-video trong cast-tts (J3)

Bước:
1. Ở `S/tools/cast-tts.mjs:30`, đổi mặc định từ `~/.agents/skills/opus-video` sang `~/.claude/skills/opus-video`. Giữ biến môi trường `OV` để Studio truyền bản plugin nó đang dùng.
2. Không xóa hay symlink `~/.agents/skills/opus-video` (nằm ngoài hai repo và kho series). Ghi vào báo cáo phase rằng bản `.agents` còn đó và không còn được cast-tts dùng.

Tiêu chí thành công: `command grep -n 'agents/skills' "$S/tools/cast-tts.mjs"` không còn kết quả.

Verify:
```bash
command grep -c 'agents/skills' "$S/tools/cast-tts.mjs"    # 0
command grep -c '.claude/skills/opus-video' "$S/tools/cast-tts.mjs"   # 1
```

## Task 2.2: Chuỗi nén giọng và viseme mặc định (J1)

Bước:
1. Tạo `S/tools/lib/voice-chain.mjs` export:
   - `VOICE_CHAIN = "loudnorm=I=-16:TP=-4.5:LRA=11,alimiter=limit=0.35:attack=5:release=60:level=false:latency=1,volume=2.6dB"` (đúng chuỗi tập 1, báo cáo scout dòng 26);
   - `mixVoice(inMp3, outMp3)`: chạy `ffmpeg -y -i in -af <VOICE_CHAIN> -ar 44100 -b:a 192k out` qua `spawnSync`, ném lỗi có thông điệp tiếng Việt khi ffmpeg lỗi;
   - `copyWords(inMp3, outMp3)`: chép `<in>.words.json` thành `<out>.words.json` (chuỗi nén không dời thời gian; `timing.mjs` đọc `<src>.words.json` của đúng file trong thẻ `<audio>`).
2. Trong `cast-tts.mjs`, thêm cờ:
   - `--mix-out <f>`: sau khi ghi `--out`, gọi `mixVoice` và `copyWords`;
   - `--visemes-out <f>`: gọi `buildTrack` của `tools/lib/visemes.mjs` trên `<out>.words.json` và ghi file, như `tools/lipsync.mjs` đang làm;
   - `--remix`: bỏ qua gọi API, dùng `--out` đã có làm nguồn, chỉ chạy `--mix-out` và `--visemes-out`. Cờ này cho phép nén lại mà không tốn lượt, và là cách kiểm ở task này.
3. Dấu cổng viet-pro vẫn chỉ ghi cho file `--out` (`assets/voice/NN.mp3`), như hiện nay; `check-viet-pro --stage delivery` kiểm đúng file đó (`OV/scripts/check-viet-pro.mjs:37-39`).
4. Cập nhật dòng cách dùng ở đầu file và thông điệp `usage:`.
5. Thêm test vào `S/tools/tests/cast-tts.test.mjs`: chuỗi `VOICE_CHAIN` đúng nguyên văn; `copyWords` chép đúng; `mixVoice` trên một mp3 sinh bằng ffmpeg ra file đo được trong khoảng -16 ± 1 LUFS.

Tiêu chí thành công: test series xanh; nén lại một câu tập 1 trên bản chép cho ra file trong khoảng -17…-15 LUFS và lệch không quá 0,5 LU so với `a-01/assets/mix/voice-12.mp3` đã giao.

Verify:
```bash
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
mkdir -p "$T/remix/assets/voice" "$T/remix/assets/mix"
cp "$C/video/a-01/assets/voice/12.mp3" "$C/video/a-01/assets/voice/12.mp3.words.json" "$T/remix/assets/voice/"
node "$S/tools/cast-tts.mjs" --role khoa --text-file /dev/null --out "$T/remix/assets/voice/12.mp3" --remix --mix-out "$T/remix/assets/mix/voice-12.mp3" --visemes-out "$T/remix/assets/voice/12.visemes.json"
for f in "$T/remix/assets/mix/voice-12.mp3" "$C/video/a-01/assets/mix/voice-12.mp3"; do ffmpeg -hide_banner -nostats -i "$f" -af ebur128 -f null - 2>&1 | command grep -E '^\s+I:' | tail -1; done
test -s "$T/remix/assets/mix/voice-12.mp3.words.json" && test -s "$T/remix/assets/voice/12.visemes.json" && echo OK-SIDECARS
```
Nếu `--text-file /dev/null` bị từ chối vì cast-tts đọc file đó trước khi biết `--remix`, sắp lại thứ tự kiểm cờ để `--remix` không cần `--text-file`, rồi bỏ cờ đó khỏi lệnh Verify.

## Task 2.3: Đạo cụ `ui-card` có tham số (J6)

Bước:
1. Đọc `S/tools/runtime/rig-player.mjs` (cách `createStage` nhận `grids`), `S/tools/lib/pxl.mjs` (dạng lưới) và `S/tools/runtime/pixel-text.mjs` (vẽ chữ, đã sửa lỗi chữ hoa chồng nhau).
2. Tạo `S/tools/runtime/ui-card.mjs` export `uiCard(spec, { palette })` trả về một lưới cùng dạng với đạo cụ trong `props.mjs`, để truyền thẳng vào `grids` của `createStage`. `spec` gồm: `w`, `h` (điểm ảnh nghệ thuật), `frame` (màu khung, chỉ số bảng màu), `fill`, `title`, `lines` (mảng chuỗi), `buttons` (mảng `{ text, fill }`), `counter` (số hay chuỗi ngắn, vẽ góc phải), `avatar` (tên một lưới có sẵn, tùy chọn).
3. Chữ vẽ bằng `pixel-text.mjs`; chữ dài hơn bề ngang thì xuống dòng theo từ; quá chiều cao thì cắt và thêm "…". Mọi điểm ảnh dùng màu trong `S/palette/master.json`.
4. Test `S/tools/tests/ui-card.test.mjs`: kích thước lưới đúng `w×h`; mọi ô là màu trong bảng hoặc trong suốt; tiêu đề có điểm ảnh ở hàng đầu; hai chữ hoa liền nhau không chồng (theo cách test của `pixel-text`); xuống dòng đúng với một chuỗi dài.

Tiêu chí thành công: test xanh; một thẻ "Hoàng Tử Mưa Băng Giá, 38 tuổi" có nút "Kết bạn" và bộ đếm "23" dựng được thành lưới.

Verify:
```bash
cd "$S" && node --test tools/tests/ui-card.test.mjs 2>&1 | tail -3
```

## Task 2.4: Mẫu tập `S/templates/episode/` (J4, J5, logo)

Bước:
1. Đọc cấu trúc a-01 (chỉ đọc): `index.html`, `scenes/lib.mjs`, `scenes/film.mjs`, `scenes/map.mjs`, `PLAN.md` (các mục `## Cảnh`, `## Âm thanh`, `## Sự kiện`, `## Khung hình demo`), `BRIEF.md` (khung frontmatter), `script/scenes.json`.
2. Tạo `S/templates/episode/` gồm:
   - `index.html`: chép khung của a-01 nhưng
     - nạp GSAP từ `assets/vendor/gsap.min.js` (J5), không từ CDN;
     - giữ khối `/* TIMING:BEGIN */ … /* TIMING:END */` để dự án sửa được trong Studio;
     - nạp viseme theo danh sách câu trong `window.TIMING` (J4): gom id `vo-NN` từ `TIMING.scenes[*].lines`, `await Promise.all` các `import("./assets/voice/NN.visemes.json", { with: { type: "json" } })`, câu thiếu file viseme thì dùng mảng rỗng và ghi `console.warn`;
     - nạp rig theo `scenes/cast.json` (mảng id nhân vật) bằng `import("./assets/rig/rigs/<id>.rig.mjs")`, và ảnh nền theo `scenes/backgrounds.json` (mảng tên file trong `assets/bg/`) bằng thẻ `<img class="src">` tạo lúc chạy, chờ `decode()` xong mới dựng timeline;
     - ghép `scenes/cards.mjs` (export `CARDS = { tên: spec }`) qua `uiCard` thành lưới, gộp với `props.props` trước khi truyền `grids`;
     - lớp logo: `<img id="brand-logo" src="assets/brand/logo-badge.png">` đặt tuyệt đối góc dưới phải của `#root`, rộng 112 px, lề phải 24 px, lề dưới 24 px, nằm trên canvas (đúng thông số tập 1);
     - hỗ trợ xem trước một khoảng: nếu có `window.PREVIEW = { from, to }` thì timeline chạy từ `from` tới `to` (`stage.drawFilm(from + proxy.t, shots)`). Phase 09 dùng điểm này;
   - `scenes/lib.mjs`: chép nguyên từ a-01;
   - `scenes/film.mjs`: bản chung, mỗi cảnh kịch bản một module trong bảng `MODULES`, cảnh chưa có module là thẻ tối "CẢNH N" như a-01;
   - `scenes/cast.json` (`[]`), `scenes/backgrounds.json` (`[]`), `scenes/cards.mjs` (`export const CARDS = {}`), `scenes/roles.json` (`{}`);
   - `PLAN.md` có đủ các mục mà `timing.mjs`, `check-preflight.mjs` và `make-demo.mjs` đọc, mỗi bảng một hàng mẫu `s1`;
   - `BRIEF.md.tmpl` với frontmatter như a-01 cộng `series: {{SERIES}}`, `episode: {{N}}`, `title: {{TITLE}}`; giữ `## series_bible` trỏ về `{{SERIES}}`;
   - `assets/vendor/gsap.min.js` chép từ file GSAP 3.14.2 nêu ở mục File sở hữu (ghi nguồn và giấy phép GSAP standard license trong `assets/vendor/README.md`);
   - `assets/brand/logo-badge.png` chép từ `S/refs/logo/logo-2-mascot-badge.png`.
3. Không đặt đường tuyệt đối nào trong mẫu ngoài chỗ giữ chỗ `{{SERIES}}`.

Tiêu chí thành công: mẫu có đủ file; `command grep -c 'cdn.jsdelivr' "$S/templates/episode/index.html"` bằng 0; có khối TIMING; có thẻ logo.

Verify:
```bash
cd "$S/templates/episode" && ls index.html PLAN.md BRIEF.md.tmpl scenes/lib.mjs scenes/film.mjs scenes/cast.json scenes/cards.mjs assets/vendor/gsap.min.js assets/brand/logo-badge.png
command grep -c 'cdn.jsdelivr' index.html                       # 0
command grep -c 'TIMING:BEGIN' index.html                       # 1
command grep -c 'brand-logo' index.html                         # >= 1
command grep -c 'import v[0-9]' index.html                      # 0
```

## Task 2.5: Công cụ tạo tập `S/tools/new-episode.mjs`

Bước:
1. Giao diện: `node new-episode.mjs --root <thư mục chứa các dự án> --episode <N> --title "<tên>" [--name a-NN]`. Mặc định `--name` là `a-` cộng N hai chữ số.
2. Từ chối (exit 6) khi `<root>/<name>` đã có. Từ chối (exit 2) khi tên không khớp `^[a-z0-9][a-z0-9-]{1,40}$` hay N không phải số nguyên dương.
3. Chép mẫu vào thư mục mới, thay `{{SERIES}}` bằng đường tuyệt đối của S, `{{N}}`, `{{TITLE}}`, đổi `BRIEF.md.tmpl` thành `BRIEF.md`; tạo `script/`, `assets/voice/`, `assets/mix/`, `assets/bg/`, `assets/gen/raw/`, `assets/gen/keyed/`, `assets/gen/batches/`, `renders/`, `demo/`; chép `.gitignore` chặn media nếu có mẫu trong `/Volumes/2/Edit-Video/scripts/templates/` (chỉ đọc), không có thì viết tối thiểu.
4. Chạy `sync-to-project.mjs --project <dự án mới>` để có rig, bảng màu, phông.
5. In `CREATED <đường dự án>` và thoát 0.
6. Test `S/tools/tests/new-episode.test.mjs` trong thư mục tạm: tạo được, lần hai exit 6, BRIEF có `series:` trỏ đúng S, không còn chuỗi `{{` nào trong dự án.

Tiêu chí thành công: test xanh; tạo được dự án thử `a-99` trong `$T/root`, chạy `timing.mjs` và lấy một khung demo có logo.

Verify:
```bash
cd "$S" && node --test tools/tests/new-episode.test.mjs 2>&1 | tail -3
mkdir -p "$T/root" && rm -rf "$T/root/a-99"
node "$S/tools/new-episode.mjs" --root "$T/root" --episode 99 --title "Thử mẫu"
command grep -rl '{{' "$T/root/a-99" --include='*.md' --include='*.html' --include='*.json' | wc -l    # 0
node "$OVC/scripts/timing.mjs" --project "$T/root/a-99"
node "$OVC/scripts/make-demo.mjs" --project "$T/root/a-99"
ls "$T/root/a-99/demo"/frame-*.png | head -1
```
Kiểm logo trong khung: viết một script nhỏ `"$T/check-logo.mjs"` dùng `decodePNG` của `S/tools/lib/png.mjs`, đọc khung demo đầu tiên, và kiểm điểm ảnh ở giữa ô logo (x = 1920 − 24 − 56, y = 1080 − 24 − 56) khác màu nền `#181425`. Chạy `node "$T/check-logo.mjs" <khung>` phải in `LOGO OK`.

## Task 2.6: Ghi lại thay đổi

Bước: thêm vào `S/README.md` một mục ngắn "Tập mới và mặc định âm thanh" (cast-tts `--mix-out`, `--visemes-out`, `--remix`; `new-episode.mjs`; `ui-card`); hoàn tất `$PLAN/reports/phase-02-thay-doi-series.md`.

Verify:
```bash
command grep -c 'new-episode' "$S/README.md"     # >= 1
cd "$S" && node --test tools/tests/*.test.mjs 2>&1 | tail -3
```

## Rủi ro

- Nạp viseme và rig động làm khung đầu render trống (Trung bình × Trung bình): mọi `import()` phải xong trước khi đăng ký `window.__timelines["main"]`, như a-01 chờ `decode()` ảnh. Khung demo của task 2.5 bắt lỗi này.
- `hyperframes lint` chê thẻ tạo lúc chạy (Thấp × Thấp): chạy `npx --no-install hyperframes lint "$T/root/a-99"` sau task 2.5 và ghi cảnh báo vào báo cáo.

## Khôi phục

Giải nén tar của task 2.0 vào thư mục tạm, chép lại đúng `tools/cast-tts.mjs`; xóa `templates/episode/`, `tools/new-episode.mjs`, `tools/runtime/ui-card.mjs`, `tools/lib/voice-chain.mjs` và test mới. Xóa `$T/root/a-99`.

## Kết quả thực hiện (2026-10-24)

Mọi task 2.0–2.6 xong, mọi Verify qua; chi tiết file và số đo ở `reports/phase-02-thay-doi-series.md`. Tóm tắt:
- Sao lưu `/Volumes/2/Hoạt hình/plans/backups/song-lag-20261024-1344.tgz`.
- Nén lại câu 12 của a-01 bằng `cast-tts --remix --mix-out`: -16,7 LUFS, bằng bản đã giao.
- `a-99` tạo từ mẫu, `timing.mjs` và `make-demo.mjs` chạy, khung demo có logo (`LOGO OK`), `hyperframes lint` 0 lỗi 0 cảnh báo. Test series 50/50.
- Lệch so với phase: logo của mẫu chép từ `a-01/assets/brand/logo-badge.png` (nền trong suốt), vì `S/refs/logo/logo-2-mascot-badge.png` còn nền xanh để tách và hiện thành ô xanh lá trong khung.
- `ui-card` test bằng bộ vẽ chữ giả trong Node; đường vẽ thật qua `pixel-text.mjs` đã kiểm bằng khung demo của một dự án nháp (đã xoá).

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.
