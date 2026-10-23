# Chuyển cảnh và hiệu ứng dựng

Studio gom mọi chuyển cảnh dùng được vào một thư viện, và thêm các thao tác sửa footage chạy trước bằng ffmpeg (cắt, đổi tốc độ, dừng hình, chỉnh màu, đổi khung). Mọi thứ ở đây cho cùng một khung hình mỗi lần render: render hai lần ra cùng file.

| Phần | File |
|---|---|
| Thư viện chuyển cảnh (gộp, lọc) | `lib/fx/catalog.mjs` |
| Gói chuyển cảnh của Studio | `fx/transitions/<id>/` |
| Sửa footage | `lib/fx/footage.mjs` |
| LUT `.cube` | `lib/fx/lut.mjs` |
| Route HTTP | `routes/fx.mjs` |
| Tool cho đạo diễn và MCP | `lib/tools/fx.mjs` (`fx_catalog`, `fx_footage_edit`) |
| Giao diện | `public/ext-fx.js`, `public/fx-gallery.js`, `public/fx-footage.js`, `public/ext-fx.css` |
| GSAP cho trang xem thử | `fx/vendor/gsap.min.js` (3.14.2, GSAP Standard No-Charge License, sha256 ghi ở đầu file) |

## Thư viện chuyển cảnh

`GET /api/fx/catalog` gộp ba nguồn theo id, nguồn trước thắng:

1. **Provider:** các seam trong `directions.json` của provider (`seams[]`, lớp `seam_classes.soft` đánh dấu chuyển cảnh mềm).
2. **Studio:** các gói trong `fx/transitions/`.
3. **HyperFrames:** các mục `###` trong `hyperframes-animation/transitions/css-*.md` (tên đổi thành id kebab-case; `staggered-color-blocks` gộp vào `staggered-blocks`).

Một id có ở nhiều nguồn chỉ hiện một lần. `sources` liệt kê đủ các nguồn, `kind` lấy của nguồn thắng, recipe và trang xem thử lấy của gói Studio nếu có. Các seam bị cấm (`seam_classes.banned` của provider, cộng danh sách nền `fade`, `fade-in`, `fade-out`, `crossfade`, `dissolve`, `opacity`, `none`, `cut`, `dip`, `color-dip`) không bao giờ có trong thư viện, kể cả khi không có provider.

Mỗi mục: `{ id, name, source, sources, kind, energy, soft, description, doc, recipe, preview, pair_seam, duration, params }`.

Cột "Tất định" cho biết khi nào hai lần render ra cùng khung. HyperFrames render bằng cách tua timeline đã đăng ký trên `window.__timelines`; chuyển cảnh nào lấy tiến độ từ timeline đó thì tất định, chuyển cảnh nào đọc đồng hồ hoặc `Math.random` thì không.

| id | Nguồn | Loại | Tất định |
|---|---|---|---|
| `zoom-through` | Provider + HyperFrames | cut-catalog | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `inverse-zoom-through` | Provider | cut-catalog | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `cut-the-curve` | Provider | cut-catalog | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `waterfall-cut` | Provider | cut-catalog | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `card-morph-anchor` | Provider | rule | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `scale-swap-transition` | Provider | rule | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `theme-crossfade-morph` | Provider | rule | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `multi-phase-camera` | Provider | rule | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `viewport-change` | Provider | rule | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `push-slide` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `squeeze` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `circle-iris` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `diagonal-split` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `gravity-drop` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `staggered-blocks` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `grid-dissolve` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `morph-circle` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `zoom-out` | Provider + HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `focus-pull` | Provider + HyperFrames | css (mềm) | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `blur-crossfade` | Provider + HyperFrames | css (mềm) | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `light-leak` | Provider + HyperFrames | css (mềm) | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `sdf-iris` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `domain-warp` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `cross-warp-morph` | Provider | shader (mềm) | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `gravitational-lens` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `whip-pan` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `cinematic-zoom` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `ridged-burn` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `thermal-distortion` | Provider | shader (mềm) | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `swirl-vortex` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `chromatic-split` | Provider | shader | Có, khi tiến độ lấy từ timeline (seek), không từ đồng hồ |
| `beat-cut` | Provider | native | Có (cắt thẳng, không có khung trung gian) |
| `match-cut` | Provider | native | Có (cắt thẳng, không có khung trung gian) |
| `impact-frame` | Studio | css | Có, test `fx-determinism` kiểm |
| `ink-wipe` | Studio | svg | Có, test `fx-determinism` kiểm |
| `smear-cut` | Studio | svg | Có, test `fx-determinism` kiểm |
| `speed-lines` | Studio | canvas | Có, test `fx-determinism` kiểm |
| `3d-card-flip` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `blur-through` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `directional-blur` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `horizontal-blinds` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `vertical-blinds` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `page-burn` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `glitch` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `chromatic-aberration` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `ripple` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `vhs-tape` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `overexposure-burn` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `film-burn` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `shutter` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `clock-wipe` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `vertical-push` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `elastic-push` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |
| `diamond-iris` | HyperFrames | css | Có, khi tween nằm trên timeline đã đăng ký (seek) |

## Gói chuyển cảnh của Studio

Mỗi gói là một thư mục `fx/transitions/<id>/`:

| File | Nội dung |
|---|---|
| `fx.json` | `id`, `name_vi`, `kind` (`shader`, `css`, `svg`, `canvas`), `description_vi`, `params`, `duration`, `energy` (`em`, `vua`, `don-dap`), `pair_seam`, `source` (nguồn tham khảo và giấy phép) |
| `snippet.js` | `MotionFx[id] = { defaults, frame(t, opts), apply(els, state), attach(tl, at, els, opts) }` |
| `snippet.html` | Phần HTML chèn vào composition |
| `recipe.md` | Cách gắn vào cảnh, cho đạo diễn |
| `preview.html` | Trang xem thử: thanh tua, nút phát, bước từng khung, không cần mạng |

| id | Loại | Dài | Hợp với | Ghi seam trong PLAN.md |
|---|---|---|---|---|
| `impact-frame` | css | 2 khung | Đòn đánh, va chạm | `beat-cut` |
| `smear-cut` | svg | 2 khung | Vung nhanh | `whip-pan` |
| `ink-wipe` | svg | 0,9 s | Chuyển cảnh mực, tranh thuỷ mặc | `domain-warp` |
| `speed-lines` | canvas | 0,6 s | Lao tới, tăng tốc | `cinematic-zoom` |

Quy tắc tất định của gói: trạng thái chỉ đến từ `frame(t, opts)`; số ngẫu nhiên lấy từ PRNG có seed (mulberry32); `attach` đặt từng khung bằng `tl.set` ở giữa khung hoặc bằng một tween proxy `{ t }` có `onUpdate`, nên khi HyperFrames tua tới khung nào thì ra đúng khung đó. `snippet.js` không được dùng `Math.random`, `Date`, `performance.now`, `requestAnimationFrame`, `setTimeout`, `setInterval`. `tests/fx-determinism.test.mjs` tìm các tên này trong file, rồi chạy `frame(t)` ở 30 thời điểm hai lần trong sandbox mà các hàm trên ném lỗi.

Thêm gói mới: tạo thư mục với đủ năm file, `fx.json` đúng hợp đồng trên (`validatePack` báo thiếu gì). Studio báo lỗi ngay khi đọc thư viện nếu thiếu file.

## Ranh giới Studio và provider

Bước kiểm kế hoạch (preflight `--stage plan`) và recipe pack của provider chỉ biết các seam có trong `directions.json`. Đã thử trên một bản sao dự án có hướng dựng:

| Ghi trong cột "Nối sang beat sau" | Kết quả |
|---|---|
| `ink-wipe` hoặc `impact-frame` đứng một mình | Preflight trượt: `no known seam` |
| `whip-pan + smear-cut` | Preflight trượt: tách gạch nối, thấy seam cấm `cut` |
| `beat-cut + impact-frame` | Qua, nhưng recipe pack bỏ qua `impact-frame` |

Vì vậy, cho tới khi provider nhận bốn id này là seam `native`, PLAN.md ghi `pair_seam` của gói vào cột "Nối sang beat sau" và ghi tên gói vào cột "Hình / hiệu ứng". Recipe của gói nằm trong `fx/transitions/<id>/recipe.md`, đạo diễn đọc file đó thay cho recipe pack.

Studio không sửa skill hay plugin đã cài. Thay đổi phía provider đi bằng pull request lên repo của provider.

## Áp dụng chuyển cảnh cho shot

Trong inspector của shot, mục "Thư viện chuyển cảnh": tìm, lọc theo nguồn, bấm một mục để xem (gói Studio phát trang xem thử trong iframe sandbox), rồi bấm "Áp dụng cho shot".

`POST /api/fx/apply-transition { name, shot, id, base, duration? }`:

1. Đặt `transition_in` của shot bằng một patch `set_shot` qua gateway của provider (`base` khác phiên bản hiện tại thì trả 409). Giá trị đã đúng thì bỏ qua bước này.
2. Xếp một yêu cầu cho đạo diễn (scope `shot`) nêu recipe, file snippet cần chép vào `assets/fx/<id>.js`, seam ghi trong PLAN.md, và nhắc dừng ở cổng animatic.
3. Chạy đạo diễn nếu runner là `cli` và chưa có job đạo diễn nào chạy. Runner `mcp` thì yêu cầu nằm trong hàng đợi chờ MCP client.

Đổi `transition_in` chỉ ghi vào manifest. HTML của cảnh do đạo diễn sửa; xem lại animatic rồi chạy `npm run check` trước khi render.

## Sửa footage

`POST /api/fx/footage { name, src, op, params, actor? }` chạy một job `fx` (mỗi lúc một job; đang bận thì trả 409). `src` là id hoặc đường dẫn của clip đã đăng ký ở tab Footage, hoặc đường dẫn tương đối trong `footage/`, `shared-assets/` hay trong dự án. Đường thật của file phải nằm trong ba chỗ đó.

| op | params | Đầu ra |
|---|---|---|
| `trim` | `{ in, out }` (giây, làm tròn theo khung) | Đoạn `[in, out)`. Clip có tiếng thì đi qua lệnh `cut apply-edl` của provider |
| `speed` | `{ anchors: [{ t, rate }], audio? }` | Điểm neo `i` giữ tốc độ `rate` (0,25–4) từ `t` tới điểm sau. Mặc định tắt tiếng; `audio: true` chạy `atempo` |
| `freeze` | `{ at, duration, audio? }` | Giữ khung tại `at` trong `duration` giây, tiếng im dưới đoạn dừng. Biên nhận ghi `allow_freeze: true` |
| `grade` | `{ lut \| preset, intensity? }` | `lut3d` hoặc một preset (`warm`, `cool`, `punchy`, `mono`, `faded`), trộn với gốc theo `intensity` (0–1] |
| `reframe` | `{ aspect, anchors?: [{ t, x, y }] }` | Cắt theo tỷ lệ `9:16`, `16:9`, `1:1`, `4:5`, tâm khung đi tuyến tính giữa các điểm neo, ra 1080×1920, 1920×1080, 1080×1080 hoặc 1080×1350 |

Đầu ra: `footage/cut/<tên>-<op>-<sha8>.mp4`, `sha8` tính từ tham số đã chuẩn hoá, file nguồn (đường, cỡ, mtime), cách render và nội dung LUT. File đã có thì dùng lại, không render lần nữa. Studio render ra file tạm, kiểm độ dài (lệch tối đa một khung) và cỡ khung, rồi mới đổi tên. Biên nhận `fx-<op>` ghi vào `.opus/receipts/` của dự án, với `params.expected_duration` và `params.expected`.

Lệnh ffmpeg cố định: `libx264 -crf 14 -preset slow -pix_fmt yuv420p`, giữ fps gốc (`-fps_mode cfr`), `-map_metadata -1 -fflags +bitexact`. Cùng ffmpeg, cùng nguồn, cùng tham số thì ra cùng byte (`tests/fx-footage.test.mjs` kiểm).

`GET /api/fx/luts?name=` liệt kê LUT: `identity`, `shared:<file>.cube` trong `shared-assets/luts/`, `project:<file>.cube` trong `assets/luts/` của dự án, và các look trong `media-use/luts/index.json` của HyperFrames (dựng thành `.cube` bằng `buildCube`). LUT luôn được chép hoặc dựng vào `$MOTION_STUDIO_CACHE/luts` (mặc định `~/.cache/motion-studio/luts`) trước khi đưa cho ffmpeg.

Trong giao diện: tab Footage có mục "Sửa clip" cho mọi video đã đăng ký; inspector của shot có "Sửa clip của shot" cho video trong `assets` của shot. Mỗi mục có xem trước và sau, dòng biên nhận, và nút "Dùng trong shot" (`POST /api/fx/use-clip`): chép clip vào `assets/footage/` của dự án (không ghi đè; file cùng nội dung thì dùng lại), cập nhật `assets` của shot, rồi nhờ đạo diễn thay clip trong HTML.

Đạo diễn và MCP client dùng tool `fx_footage_edit` (gọi route trên, chờ job xong, trả `RESULT`). Dòng lệnh: `node lib/fx/footage.mjs run '<json>'`.

## Route

| Route | Việc |
|---|---|
| `GET /api/fx/catalog` | Thư viện chuyển cảnh, chạy được khi không có provider |
| `GET /api/fx/luts?name=` | Danh sách LUT |
| `GET /api/fx/preview/<id>/<file>` | File của gói Studio. Tên file phải là `[a-z0-9-]+.(html\|js\|json\|md\|css\|svg\|png)`; id sai hay có đoạn `..` thì 403, gói không có thì 404, thiếu `/` cuối thì 301 |
| `GET /api/fx/vendor/<file>.js` | Thư viện JS chép sẵn cho trang xem thử |
| `GET /api/fx/clip?name=&src=` | Phát một clip (có Range), cùng luật `src` như trên |
| `POST /api/fx/footage` | Job sửa footage |
| `POST /api/fx/apply-transition` | Đặt chuyển cảnh cho shot, nhờ đạo diễn |
| `POST /api/fx/use-clip` | Đưa clip đã sửa vào shot, nhờ đạo diễn |

## Nguồn tham khảo

| Phần | Nguồn | Giấy phép |
|---|---|---|
| `buildCube` | hyperframes `packages/cli/src/media-use/lib/cube-build.mjs`, commit `03ed146` | Apache-2.0 |
| PRNG của các gói | mulberry32, https://github.com/bryc/code/blob/master/jshash/PRNGs.md | Public domain |
| Mép mực của `ink-wipe` | gl-transitions `luminance_melt.glsl`, `burn.glsl` (ý tưởng, làm lại bằng SVG filter) | MIT |
| `smear-cut` | gl-transitions `directionalwarp.glsl` (ý tưởng) | MIT |
| Tên tham số speed và freeze | OpenCut, Kdenlive (chỉ theo cách đặt tên, không chép code) | MIT, GPL-3.0 |
| GSAP | jsdelivr `gsap@3.14.2` | GSAP Standard No-Charge License |
