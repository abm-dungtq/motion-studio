# Phase 6: nâng cấp chuyển cảnh và hiệu ứng dựng

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/fx-transitions`
- **Nhánh:** `feat/fx-transitions`
- **Cổng server thử:** 4406
- **Effort:** 10h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1:
  - seam UI: `addInspectorSection`, `addSection("media")`;
  - seam route, `writeReceipt`;
  - `P.commands.cut`, `hfSkills()`;
  - bản sửa `/api/directions` (phase 1, bước 0b).
- **Phụ thuộc mềm:** phase 5. Kiểm `frozen-frames` biết `allow_freeze`; trước khi phase 5 merge thì chỉ có kiểm cơ bản.

## Mục tiêu

1. **Kiểm kê** những gì Studio và provider đang có về chuyển cảnh và hiệu ứng.
2. **Chuyển cảnh phong phú hơn**, tất định khi HyperFrames render:
   - dùng lại shader có sẵn;
   - thêm whip, zoom, glitch, ink, impact frame anime, smear.
3. **Công cụ dựng footage:** trim, speed ramp, freeze frame, màu/LUT, crop/reframe. Đều tất định, render trước bằng ffmpeg, có biên nhận.
4. **Chốt ranh giới:** việc nào làm trong Studio, việc nào cần PR upstream.

## Kiểm kê (đã kiểm 2026-10-23)

**Studio hôm nay:**
- Chuyển cảnh chỉ là một ô chọn `transition_in` trong inspector của shot (`public/inspector.js:36-46`). Ô này ghi bằng op `set_shot field transition_in` (`gateway.mjs:62` cho phép trường này).
- Danh sách lấy từ `GET /api/directions` (`public/inspector.js:16`). **Lỗi:** API trả số thứ tự `"0"…"32"` thay vì tên (`server.mjs:339`); phase 1 sửa.
- Studio không có công cụ sửa footage nào, ngoài trim nhạc trên timeline (`update_music`).

**Provider** (`data/directions.json` của plugin): 33 seam, theo `kind`:

| kind | Số lượng | Seam |
|---|---|---|
| `cut-catalog` | 4 | zoom-through, inverse-zoom-through, cut-the-curve, waterfall-cut |
| `rule` | 5 | card-morph-anchor, scale-swap-transition, theme-crossfade-morph, multi-phase-camera, viewport-change |
| `css` | 12 | push-slide, squeeze, circle-iris, diagonal-split, gravity-drop, staggered-blocks, grid-dissolve, morph-circle, zoom-out, focus-pull, blur-crossfade, light-leak |
| `shader` | 10 | sdf-iris, domain-warp, cross-warp-morph, gravitational-lens, **whip-pan**, **cinematic-zoom**, ridged-burn, thermal-distortion, swirl-vortex, **chromatic-split** |
| `native` | 2 | beat-cut, match-cut |

- `seam_classes.banned`: fade, crossfade, dissolve, cut, dip, "mờ dần", … Studio **không** được gợi ý các seam này.
- `seam_classes.soft`: 5 seam.
- `recipe-pack.mjs` gom recipe theo seam ghi trong cột "Nối sang beat sau" của PLAN.md (`classifySeams`, `directions.mjs:214`).

**HyperFrames skill** (`~/.claude/skills/hyperframes-animation/transitions/`):
- `catalog.md` (127 dòng: luật cứng CSS, định tuyến shader);
- 13 file `css-*.md`: 3d, blur, cover, destruction, dissolve, distortion (glitch, chromatic, ripple, VHS), grid, light, mechanical, other, push, radial, scale;
- `overview.md`.

Shader do gói `@hyperframes/shader-transitions` lo. Danh sách built-in ở mức gói [UNVERIFIED: hook chặn đọc `node_modules`]; dùng 10 seam shader ở trên làm danh sách đã biết.

**media-use skill:**
- `luts/index.json` là catalog màu ("color grade looks", có `params` dựng `.cube` offline);
- `scripts/recipe.mjs`, `transcribe.mjs`.

**Plugin `cut.mjs`:** `probe` (tìm khoảng lặng an toàn), `apply-edl` (ghép theo danh sách cắt), qua `P.commands.cut` của phase 1.

**Kết luận kiểm kê:**
- whip (`whip-pan`), zoom (`cinematic-zoom`, `zoom-through`, `zoom-out`) và glitch (`chromatic-split`, cùng glitch trong `css-distortion.md`) **đã có**: dùng lại, không viết lại.
- **Còn thiếu:** ink wipe, impact frame anime (khung âm bản hoặc bóng đen 2–3 khung, như `impacts` của Zoro), smear frame (vệt kéo giãn ở điểm cắt), speed-lines burst.
- **Công cụ footage còn thiếu hết.**

## Ranh giới Studio và upstream

| Việc | Ở đâu | Lý do |
|---|---|---|
| Catalog gộp (provider seam + HyperFrames + gói fx của Studio), bản xem trước, chọn cho shot | Studio | UI và dữ liệu đọc; ghi qua `set_shot` có sẵn |
| Gói chuyển cảnh mới (ink-wipe, impact-frame, smear-cut, speed-lines) dạng recipe + snippet HTML/JS tất định | Studio (`fx/transitions/`) | Đạo diễn nhận đường recipe trong yêu cầu, rồi chép snippet vào dự án. Không cần plugin biết |
| Sửa HTML để gắn chuyển cảnh | Đạo diễn, qua `ctx.direct` | Studio không sửa HTML của dự án (luật hiện có) |
| Trim, speed ramp, freeze, LUT, crop/reframe footage | Studio (ffmpeg render trước → `footage/cut/`) | Tất định, không phụ thuộc runtime; đúng luật workspace (clip đã cắt ở `footage/cut/`) |
| Trim theo EDL | Dùng `P.commands.cut apply-edl` | Không viết lại thứ plugin đã có |
| Seam id mới được `recipe-pack`/`check-preflight` nhận | **PR upstream, có điều kiện** | Chỉ khi bước 1 chứng minh preflight hoặc recipe-pack từ chối hay bỏ qua id lạ trong PLAN.md |

## Repo học hoặc chép

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) `packages/shader-transitions`, registry | Apache-2.0 | API shader transition; cách viết GLSL mới cho ink và smear theo đúng khung gói. Đọc trong `/tmp/ms-ref/hyperframes` |
| [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions) | MIT | GLSL mẫu: ink (`InvertedPageCurl`, `luminance_melt`), `directional-warp` cho smear, `crosszoom`. Chép shader, ghi tên tác giả và URL ở đầu file |
| [Augani/openreel-video](https://github.com/Augani/openreel-video) `packages/fxpkg` | MIT | Định dạng gói hiệu ứng (manifest + tham số + preview) cho `fx/transitions/<id>/fx.json` |
| [KDE/kdenlive](https://github.com/KDE/kdenlive), [olive-editor/olive](https://github.com/olive-editor/olive) | GPL-3.0 (học tập, ghi nguồn) | Danh mục hiệu ứng có tham số (XML MLT), cách đặt tên tham số speed ramp và freeze |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | UX của speed ramp (điểm neo tốc độ) và crop |
| Dự án `zoro-vs-mihawk` của người dùng | của người dùng | Impact `invert`/`silhouette`, shock ring `feDisplacementMap` có lớp lót `feFlood` 128, luật tất định (handoff, quyết định 6–7) |

## Sở hữu file

**Tạo mới:**
- `lib/fx/catalog.mjs`: gộp provider seams (từ `/api/directions`), HyperFrames (`<hfSkills>/hyperframes-animation/transitions/*.md`, đọc tiêu đề) và gói `fx/transitions/*/fx.json`; bỏ id bị cấm.
- `lib/fx/footage.mjs`: `trim`, `speedRamp`, `freeze`, `grade`, `reframe` → ffmpeg, receipt.
- `lib/fx/lut.mjs`: đọc `.cube` trong `shared-assets/luts/` và `<project>/assets/luts/`; dựng `.cube` từ `params` của catalog media-use (`luts/index.json`) bằng hàm `buildCube` tự viết. Chép thuật toán, không chạy script ngoài.
- `fx/transitions/ink-wipe/`, `fx/transitions/impact-frame/`, `fx/transitions/smear-cut/`, `fx/transitions/speed-lines/`. Mỗi thư mục có:
  - `fx.json`: id, tên tiếng Việt, kind (`shader` | `css` | `svg`), tham số, độ dài mặc định, nhãn energy;
  - `recipe.md`: cách đạo diễn gắn, luật tất định;
  - `snippet.html`;
  - `snippet.js`: hàm thuần f(t) qua tween proxy GSAP, PRNG có seed, không `Math.random`/`Date`/`performance.now`/`requestAnimationFrame`;
  - `preview.html`: trang xem độc lập.
- `fx/vendor/gsap.min.js`
- `routes/fx.mjs`:
  - `GET /api/fx/catalog`;
  - `GET /fx/preview/<id>`, chỉ phục vụ file trong `fx/transitions/<id>/`;
  - `POST /api/fx/footage` (job `fx`);
  - `POST /api/fx/apply-transition` (`set_shot` + yêu cầu đạo diễn kèm đường recipe).
- `lib/tools/fx.mjs`: `fx_catalog`, `fx_footage_edit`.
- `public/ext-fx.js`, `public/fx-gallery.js`, `public/fx-footage.js`, `public/ext-fx.css`.
- `docs/transitions-and-effects.md`.
- Test: `tests/fx-catalog.test.mjs`, `tests/fx-footage.test.mjs`, `tests/fx-determinism.test.mjs`.

**Sửa:** không có file nào có sẵn. Inspector có sẵn giữ ô chọn đơn giản; thư viện chuyển cảnh mới là một mục riêng, thêm qua `addInspectorSection`.

**Không đụng:** `inspector.js` (thuộc phase 3), `server.mjs`, plugin, skill HyperFrames.

## Luồng dữ liệu

```text
Inspector shot → mục "Thư viện chuyển cảnh" (fx-gallery.js)
   GET /api/fx/catalog → [{ id, name_vi, source: provider | hyperframes | studio, kind, energy, soft, preview? }]
   bấm thẻ → iframe /fx/preview/<id> (chỉ với gói Studio) ; provider/HF → mô tả + đường tài liệu
   "Áp dụng" → POST /api/fx/apply-transition { name, shot, id, base, duration? }
       1. P.gateway.patch [set_shot transition_in = id] (actor human)
       2. P.requests.enqueue + pump: "Gắn chuyển cảnh <id> vào đầu shot <shot>. Recipe: <đường tuyệt đối fx/transitions/<id>/recipe.md>
          (nếu là gói Studio) hoặc seam của provider (recipe-pack tự gom)." → đạo diễn sửa HTML, đánh dấu cần duyệt animatic

Footage (tab Footage, addSection("media"); inspector: asset của shot)
   "Sửa clip" → fx-footage.js → POST /api/fx/footage { name, src, op, params }
     op trim:    P.commands.cut apply-edl với EDL một đoạn [in, out]   (cùng định dạng cut.mjs --help)
     op speed:   các điểm neo [{ t, rate }] → các đoạn: trim + setpts=PTS/rate (+ atempo chuỗi 0.5–2.0, hoặc tắt tiếng) → concat
     op freeze:  tpad=stop_mode=clone:stop_duration=d tại t (hoặc select khung → loop) ; params allow_freeze cho kiểm của phase 5
     op grade:   lut3d=file=<cube>:interp=tetrahedral | eq/colorbalance preset ; intensity bằng blend với bản gốc
     op reframe: crop=w:h:x(t):y(t) (biểu thức tuyến tính theo điểm neo) → scale tới khung đích (16:9 / 9:16 / 1:1)
     mã hoá: libx264 -crf 14 -preset slow -pix_fmt yuv420p, giữ fps nguồn (-fps_mode cfr), -map_metadata -1
     → <root>/footage/cut/<stem>-<op>-<sha8 của params+nguồn>.mp4 (đã có thì dùng lại, không render lại)
     → writeReceipt(op "fx.<op>", inputs [src], outputs [out], params, expected_duration)
   "Dùng trong shot" → chép out vào <dự án>/assets/footage/<tên>.mp4 (không ghi đè; manifest.mjs:56 chỉ nhận
       đường tương đối trong dự án) → set_shot assets (thay src cũ) + yêu cầu đạo diễn đổi src trong HTML
```

## Các bước

1. **Kiểm kê sâu và chốt upstream.**
   - Đọc `transitions/catalog.md`, `overview.md`, `css-*.md`; đọc `packages/shader-transitions` ở `/tmp/ms-ref/hyperframes`.
   - Ghi bảng đầy đủ id → nguồn → kind → tất định không vào `docs/transitions-and-effects.md`.
   - Thử: viết PLAN.md mẫu trong dự án tạm có seam `ink-wipe` ở cột "Nối sang beat sau", chạy `node <P.commands.preflight> --project <tmp> --stage final` và `node <P.commands.recipe> --project <tmp>`, rồi ghi kết quả.
   - Từ chối hay bỏ qua id → mở PR upstream (xem dưới). Nhận → không cần.
2. **`lib/fx/catalog.mjs`** và route catalog.
3. **Bốn gói chuyển cảnh mới:**
   - **ink-wipe:** shader GLSL mask nhiễu (fbm có seed) hoặc SVG `feTurbulence` + `feDisplacementMap` trên mask. Chọn theo bước 1: shader nếu gói shader-transitions nhận GLSL tuỳ biến.
   - **impact-frame:** 2–3 khung invert hoặc silhouette, cộng speed lines tỏa tâm; dùng `tl.set`, không tween opacity, giống Zoro.
   - **smear-cut:** 2 khung kéo giãn theo hướng chuyển động (`scaleX` + `filter: blur` theo trục, hoặc GLSL `directional-warp`).
   - **speed-lines:** canvas vẽ theo f(t), PRNG có seed.

   Mỗi gói có `preview.html` chạy offline:
   - dùng `fx/vendor/gsap.min.js`, bản 3.14.2, cùng bản `catalog.md` dùng; đầu file ghi URL nguồn và giấy phép GSAP;
   - route `/fx/preview/` phục vụ thêm `fx/vendor/`.
4. **`lib/fx/footage.mjs`** và `lib/fx/lut.mjs`. Dựng lệnh ffmpeg bằng hàm thuần `buildArgs(op, params, probe)` để test.
5. **`routes/fx.mjs`:**
   - `/fx/preview/<id>` kiểm id khớp `^[a-z0-9-]+$` và realpath nằm trong `fx/transitions/`;
   - `/api/fx/footage` chỉ nhận `src` là `rel` của file đã đăng ký trong `.opus/media.json`, hoặc nằm trong dự án, `footage/` hay `shared-assets/`; lấy theo luật `allowed()` của `media.mjs`, gọi qua `register`/`readMedia`, không tự viết lại.
6. **UI:** thư viện chuyển cảnh trong inspector, hộp "Sửa clip" có xem trước trước và sau (hai `<video>`), nhãn biên nhận.
7. **Tool** `lib/tools/fx.mjs`.
8. **Thử thật trên 4406** với `ms-smoke-6`:
   - áp `impact-frame` cho một shot;
   - đạo diễn gắn, rồi render animatic;
   - speed ramp, freeze, LUT và reframe 9:16 trên `/Volumes/2/Edit-Video/footage/raw/ref-anime-samurai-duel.mp4`, chỉ đọc nguồn; kết quả ra `footage/cut/`.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`.
- `tests/fx-catalog.test.mjs`:
  - catalog gộp không có id nào trong `seam_classes.banned`;
  - id không trùng;
  - đủ 4 gói Studio, mỗi `fx.json` có đủ trường bắt buộc;
  - `/fx/preview/../x` → 403;
  - id lạ → 404.
- `tests/fx-footage.test.mjs`, trên `testsrc2` 4 s 30 fps sinh bằng ffmpeg:
  - trim [1, 3] → 2,000 s ± 1 khung;
  - speed ramp [{ t: 0, rate: 1 }, { t: 2, rate: 2 }] → độ dài = 2 + 1 = 3 s ± 1 khung;
  - freeze 1 s tại 2 s → 5 s, và `freezedetect` thấy đoạn đứng ≈ 1 s ở 2 s;
  - LUT identity (dựng bằng `buildCube`) → PSNR so với nguồn ≥ 45 dB (`ffmpeg -lavfi psnr`);
  - reframe 9:16 → 1080×1920 (`ffprobe`);
  - cùng params chạy lần hai → không render lại (mtime không đổi) và cùng tên file;
  - receipt có `expected_duration`.
- `tests/fx-determinism.test.mjs`: mỗi gói Studio:
  - (a) grep `snippet.js` không có `Math.random`, `Date`, `performance.now`, `requestAnimationFrame`;
  - (b) gọi hàm f(t) của snippet trong Node (snippet xuất hàm thuần tách khỏi DOM) tại 30 mốc, hai lần → kết quả giống hệt.

## Tiêu chí nghiệm thu

- Ô chọn chuyển cảnh cũ hiện tên seam (nhờ phase 1). Thư viện mới hiện ≥ 30 mục từ ba nguồn, có nhãn nguồn, và không có seam bị cấm.
- Trên `ms-smoke-6`:
  - áp `impact-frame` → `transition_in` đổi (đọc `/api/project`) và có yêu cầu đạo diễn kèm đường recipe;
  - sau khi đạo diễn làm xong, `npm run check` của dự án exit 0;
  - snapshot hai lần ở khung chuyển cảnh cho `shasum` giống nhau.
- Bốn thao tác footage thật ra file trong `footage/cut/`, có receipt, verdict không `fail`. Freeze có `allow_freeze`.
- Ảnh chụp lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-fx-shots/`.
- Server 4406 đã dừng.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Chuyển cảnh mới không tất định khi render | Vừa | Cao | Test cấm API không tất định; f(t) thuần; snapshot hai lần so `shasum` |
| Shader tuỳ biến không chạy được với gói shader-transitions bản đang ghim | Vừa | Vừa | Bước 1 kiểm; dự phòng là bản SVG hoặc CSS của cùng hiệu ứng |
| Speed ramp làm lệch tiếng | Vừa | Vừa | Mặc định tắt tiếng clip đã ramp (B-roll); tuỳ chọn atempo có cảnh báo |
| Re-encode giảm chất lượng | Thấp | Thấp | CRF 14, preset slow; giữ nguồn |
| Hai nguồn catalog dùng một id cho hai thứ khác nhau | Thấp | Thấp | Provider thắng, các nguồn khác thêm tiền tố `hf:` / `studio:` |

## Hoàn tác

`git revert -m 1 <merge>`. File trong `footage/cut/` và receipt giữ nguyên; người dùng dọn bằng `sweep-after-final.sh` khi muốn. `transition_in` đã đặt hoàn tác được bằng Undo của Studio.

## PR upstream (chỉ khi bước 1 chứng minh cần)

Khi preflight hoặc recipe-pack từ chối hay bỏ qua id mới, mở PR từ `/Volumes/2/opus-video-upstream-work`:

- thêm `ink-wipe`, `impact-frame`, `smear-cut`, `speed-lines` vào `data/directions.json` `seams`, với kind phù hợp (`shader` / `css`) và đường recipe ngoài;
- hoặc cho phép `seams[].recipe` trỏ file tuyệt đối để recipe-pack gom;
- test ở `scripts/tests/`.

Cho tới khi PR đó merge, yêu cầu đạo diễn vẫn kèm đường recipe, nên tính năng chạy được.

## PR

Tiêu đề: `feat(fx): transition library, anime impact and smear packs, deterministic footage edits`.

Commit gợi ý:
1. `feat(fx): merged transition catalog without banned seams`
2. `feat(fx): ink wipe, impact frame, smear cut and speed lines packs`
3. `feat(fx): trim, speed ramp, freeze, grade and reframe for footage`
4. `feat(ui): transition gallery and clip editor`
5. `docs(fx): inventory and how to apply`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu (ví dụ `inspector.js`): **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output;
- điều kiện đạt bị trượt;
- `file:line`.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
