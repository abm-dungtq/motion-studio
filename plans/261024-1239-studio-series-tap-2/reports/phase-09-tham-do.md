# Phase 09: thăm dò render một khoảng (2026-10-24, Asia/Saigon)

Kết luận: **Nhánh A** (render khoảng chạy được). `scene_rebuild` render trang xem trước của cảnh bằng `hyperframes render -c demo/scenes/preview-<cN>.html --quality draft`, không render cả tập.

## Môi trường

- `npx hyperframes --version` trong dự án thử: **0.8.191** (bản toàn cục `~/.local/bin/hyperframes`; dự án series không có `package.json` nên không ghim 0.8.144 như dự án Edit-Video).
- Dự án thử: `$T/root/a-99` (mẫu tập phase 02, 10 s, một cảnh giữ chỗ) và bản chép `$T/p09/a99-probe` có TIMING hai cảnh (`s1` 0–4 s, `s2` 4–10 s, chuyển `grid-dissolve` 0,4 s ở giây 4) để khung thay đổi theo thời gian.

## Kết quả

1. `render -c demo/scenes/preview-test.html` (có `<base href="../../">`) chạy, exit 0, 5 s; `ffprobe` 3,000 s. Hyperframes nhận composition nằm trong `demo/scenes/` và `<base>` đúng.
2. **Lỗi của cách làm trong phase (bước 1):** mẫu tập đọc `const end = Number(root.dataset.duration)`; đặt `data-duration` gốc = 3 làm cả phim chỉ dài 3 s, nên khoảng 2–5 bị cắt còn 2–3 rồi đứng hình (giây 2,8 của clip vẫn là "CẢNH 1", bản đầy đủ ở 4,8 là "CẢNH 2"). Giữ `data-duration` = 10 thì hyperframes render 10 s (độ dài clip lấy từ `data-duration` gốc).
3. Cách đúng (đã viết vào `S/tools/scene-preview.mjs`): `data-duration` gốc = `to − from`, đồng thời thay đúng một câu `const end = Number(root.dataset.duration);` bằng độ dài cả phim; chèn `window.PREVIEW = { from, to, scene }` trước module. So khung clip 2–5 với bản đầy đủ: giây 0,5/1/1,95/2,2 (giữa dissolve)/2,8 của clip trùng giây 2,5/3/3,95/4,2/4,8 của bản đầy đủ, PSNR `inf` (trùng từng điểm ảnh). Trạng thái GSAP không lệch.
4. Thẻ `<audio>` giữ nguyên (module đọc mốc giọng từ chúng cho khẩu hình) nhưng `data-volume="0"`, vì mốc của chúng là của cả phim: clip nháp không có tiếng (đo `volumedetect` −91 dB), render vẫn exit 0.
5. `buildFilm` chạy trong Node: `checkCues` của `scene-preview` trên bản chép a-01 (`$T/root/a-01`, 451,93 s) dựng 75 shot, kiểm cue 0 lỗi, 93 ms. `scene-preview` vì vậy kiểm cue trong Node (exit 3 khi sai); không dựng được thì WARN và để trang tự kiểm (mẫu tập đã gọi `validateCues` trước khi vẽ).

## Hệ quả cho thiết kế

- Không cần nhánh B (render cả tập rồi cắt), nên không đo thời gian nhánh B.
- `S/spikes/film-stills.mjs` (ảnh ghép của tập 1) không hợp với mẫu tập mới: nó đọc rig từ `import` tĩnh (mẫu tập nạp theo `scenes/cast.json`), nền từ thẻ `<img class="src">` tĩnh (mẫu tập tạo từ `scenes/backgrounds.json`), bỏ chữ trên hình, và đọc `timing.json` chứ không đọc khối TIMING. Trên a-99 nó cho khung trống. Studio vì vậy cắt ảnh ghép 6 khung từ chính clip nháp bằng ffmpeg (đúng hình đã render); `film-stills` không được khai báo: `validateSeries` của plugin chỉ nhận một kiểu cho `positional`, và công cụ không chạy đúng trên mẫu tập (xem `phase-09-su-co.md`).
