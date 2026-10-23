# Phase 2: pipeline anime motion-comic trong Studio

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/anime-pipeline`
- **Nhánh:** `feat/anime-pipeline`
- **Cổng server thử:** 4402
- **Effort:** 12h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1. Cần `generateImage()` (`lib/agents/index.mjs`), seam route, `addTab`, `writeReceipt` và seam tool.
- **Phụ thuộc mềm:** phase 5 (kiểm chất lượng ảnh trong `lib/quality/`, tự áp khi merge).

## Mục tiêu

Đưa cách làm của dự án Zoro vs Mihawk vào Studio. Kiểu làm là ảnh tĩnh composite cộng limited animation; không dùng image-to-video. Bốn tính năng:

1. **Thư viện character sheet** theo dự án.
2. **Shot board**, dạng kanban theo shot.
3. **"Sinh biến thể tư thế":**
   - gọi `generateImage()` ở chế độ sửa ảnh, với ảnh gốc của shot và sheet nhân vật;
   - tách nền chroma-key bằng ffmpeg (chromakey, despill);
   - phóng to (lanczos, hoặc upscaler AI nếu máy có).
4. **Sửa `assets/anim/manifest.json` trên UI** (lipsync, blink, wind, keys, impacts, offsets), rồi build lại bằng `node assets/anim/build.mjs`.

## Hiện trạng đã kiểm

**Handoff:** `/Volumes/2/Edit-Video/zoro-vs-mihawk/plans/handoffs/anime-motion-comic-20261022-1657.md`.

**Hệ lật ảnh nằm trong dự án, không trong plugin:** `assets/anim/{manifest.json, build.mjs (331 dòng), anim.js (179 dòng), anim-data.js}`.
- `build.mjs` ghi `window.ZvmAnimData` (`build.mjs:327`). `anim.js` dùng tên `ZvmAnim`.
- Hai file này không chứa tên provider (đã grep: 0), nên chép vào Studio không làm trượt test chặn tên.

**Manifest Zoro hôm nay:**
- `{ fps, dir, stacks (15), impacts (4) }`.
- Khoá có trong các stack: `shot, breathe, tracks, origin, tweens, smears, tremor, steps, ghosts, streaks`.
- Loại track: `wind, keys, lipsync, blink`.
- `impacts[]` có `{ at, frames, mode: "invert" | "silhouette", stack }` (`build.mjs:311-315`).
- `offsets` mỗi tư thế chỉ nhận số `x`, `y`, `scale` (`build.mjs:295-300`). Hôm nay chưa stack nào dùng, nhưng builder đã hỗ trợ.

**Ảnh:**
- Sheet ở `assets/chars/{zoro,mihawk}-sheet.png`.
- Plate ở `assets/plates/`, biến thể ở `assets/plates/anim/`, ảnh gốc Codex ở `assets/plates/anim/raw/`.

**Lệnh mẫu đã chạy thật** (handoff, "Lệnh mẫu đã dùng"):
- Sửa ảnh giữ khung: prompt qua stdin, `codex-pool exec --skip-git-repo-check -C <raw> -i base.png -`.
- Tách nền: `scale=2208:1242:flags=lanczos,chromakey=0x004CFE:0.18:0.06,despill=type=blue:mix=0.6:expand=0.1,format=rgba`.
- Nền chuẩn là `#0047FF`; Codex thực trả `#004FFD`/`#004CFE`. Không dùng xanh lá, vì trùng màu tóc Zoro.

**Dự án Zoro chưa có `project.json`** (handoff, "Open risks"). Shot board phải chạy được bằng shot lấy từ `manifest.json` khi không có `project.json`.

**Máy:** ffmpeg 8.1.2 có `chromakey`, `despill`, `tile` (đã kiểm `ffmpeg -filters`). Không có `realesrgan-ncnn-vulkan`.

## Repo học hoặc chép

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [LingyiChen-AI/AIComicBuilder](https://github.com/LingyiChen-AI/AIComicBuilder) | Apache-2.0 | Prompt bảng nhân vật 4 góc (trước, nghiêng, sau, ¾); kanban phân cảnh theo giai đoạn; cổng duyệt từng giai đoạn; cách giữ nhân vật nhất quán bằng ảnh tham chiếu. Clone vào `/tmp/ms-ref/AIComicBuilder`, đọc phần character, storyboard và prompt. Chép mẫu prompt thì ghi URL, commit và `Apache-2.0` ở đầu file |
| Dự án `zoro-vs-mihawk` của người dùng | của người dùng | `assets/anim/build.mjs` và `anim.js` làm template. Đổi `ZvmAnimData`/`ZvmAnim` thành `StudioAnimData`/`StudioAnim`, giữ một alias cũ để dự án Zoro chạy y nguyên |

## Sở hữu file

**Tạo mới:**
- `lib/anime/chars.mjs`: thư viện sheet, file `assets/chars/chars.json`.
- `lib/anime/board.mjs`: dựng shot board.
- `lib/anime/variant.mjs`: sinh, tách nền, phóng to, receipt.
- `lib/anime/keying.mjs`: đo màu nền, dựng chuỗi filter ffmpeg.
- `lib/anime/manifest.mjs`: đọc, kiểm, ghi nguyên tử, sao lưu, chạy build.
- `lib/anime/prompts.mjs`: mẫu prompt (có ghi nguồn AIComicBuilder).
- `routes/anime.mjs`
- `lib/tools/anime.mjs`: tool `anime_generate_variant`, `anime_manifest_get`, `anime_manifest_set`.
- `templates/anim/build.mjs`, `templates/anim/anim.js`, `templates/anim/manifest.example.json`
- `public/ext-anime.js`, `public/ext-anime.css`, `public/anime-board.js`, `public/anime-chars.js`, `public/anime-manifest.js`
- `docs/anime-motion-comic.md`
- Test: `tests/anime-keying.test.mjs`, `tests/anime-manifest.test.mjs`, `tests/anime-variant.test.mjs`, `tests/anime-routes.test.mjs`

**Sửa:** không có file nào có sẵn.

**Không đụng:** mọi file lõi. Dự án `zoro-vs-mihawk` chỉ được đọc; muốn ghi phải có lời cho phép riêng của người dùng.

## Luồng dữ liệu

```text
Tab "Anime" (ext-anime.js)
 ├─ Nhân vật: GET/POST /api/anime/chars ─► assets/chars/chars.json + assets/chars/*.png
 │     { id, name, sheet, key_color, notes, palette[] }
 │     "Sinh sheet" ─► generateImage(prompt 4 góc, nền key_color) ─► assets/chars/<id>-sheet.png + receipt
 ├─ Shot board: GET /api/anime/board
 │     shots = project.json shots (nếu có), không thì từ manifest.stacks[*].shot
 │     mỗi shot: plate nền, plate nhân vật, biến thể (assets/plates/anim/<shot>-*), stack trong manifest,
 │     cột trạng thái (thiếu plate / có plate / có biến thể / đã có track) suy từ file, không lưu riêng
 ├─ Sinh biến thể: POST /api/anime/variant { name, shot, base, chars[], change, out_name } ─► job "anime"
 │     1. generateImage({ edit: true, refs: [base, ...sheets], prompt: prompts.edit(change), out: raw/<out>.png })
 │     2. keying.measure(raw) → màu nền (trung vị 4 góc 16×16 px qua ffmpeg crop+scale=1:1, rawvideo rgb24)
 │     3. ffmpeg: scale=<W>:-2:flags=lanczos, chromakey=<màu>:<sim>:<blend>, despill=type=<blue|green>, format=rgba
 │        → assets/plates/anim/<out>.png (W = rộng của plate gốc cùng shot, mặc định 2208)
 │     4. writeReceipt(op "anime.variant", inputs [base, sheets], outputs [raw, png], params)
 └─ Manifest: GET/POST /api/anime/manifest { name, base_sha, manifest }
       kiểm (lib/anime/manifest.mjs) → sao lưu .opus/anim-backups/<ts>.json → ghi nguyên tử
       → job "anime-build": node assets/anim/build.mjs (cwd dự án) → WARN trên stderr hiện ở UI
       base_sha khác sha hiện tại → 409 (ai đó vừa sửa)
```

## Các bước

1. **Học trước.** Clone AIComicBuilder vào `/tmp/ms-ref/AIComicBuilder`. Ghi 5–10 dòng tóm tắt prompt sheet và luồng kanban vào phần đầu `docs/anime-motion-comic.md`. Không chạy mã của repo đó.
2. **Template.** Chép `build.mjs` và `anim.js` của Zoro vào `templates/anim/`:
   - đổi tên global, giữ alias `window.ZvmAnimData = window.StudioAnimData`;
   - giữ hành vi y nguyên, không sửa logic.

   Test: build template trên một bản sao manifest Zoro trong thư mục tạm ra `anim-data.js` giống bản của Zoro, chỉ khác tên global.
3. **`lib/anime/manifest.mjs`.**
   - Đọc manifest.
   - Kiểm theo đúng luật của `build.mjs`: `type ∈ {lipsync, blink, wind, keys}`; `impacts.mode ∈ {invert, silhouette}`; `silhouette` cần `stack` có thật; `offsets` chỉ có số `x`, `y`, `scale`.
   - Giữ nguyên các khoá lạ (`tweens`, `smears`, `tremor`, `steps`, `ghosts`, `streaks`, `breathe`, `origin`). Ghi lại phải ra đúng thứ tự khoá cũ.
   - `rebuild(dir)` chạy `node assets/anim/build.mjs` của **dự án**, không phải template.
   - Dự án chưa có hệ lật ảnh thì có hàm "Bật hệ lật ảnh": chép `templates/anim/*` vào `assets/anim/`, không ghi đè.
4. **`lib/anime/keying.mjs`.**
   - `measure(png)`: trung vị màu 4 góc.
   - `filterChain({ color, width, sim = 0.18, blend = 0.06, spill })`: `spill` là `blue` khi kênh B trội, `green` khi kênh G trội.
   - `key(src, dst, opts)`: ffmpeg không shell, timeout 60 s, `-y` chỉ ghi vào `dst` mới.
5. **`lib/anime/variant.mjs`.**
   - Nối `generateImage` → `measure` → `key` → `writeReceipt`.
   - Phóng to:
     - mặc định lanczos tới rộng của plate gốc;
     - có `realesrgan-ncnn-vulkan` trên PATH thì dùng nó trước khi key (phát hiện, không cài);
     - ghi cách đã dùng vào receipt.
6. **`lib/anime/chars.mjs`** và **`lib/anime/board.mjs`**. Board không ghi trạng thái riêng; mọi cột suy từ file đang có.
7. **`routes/anime.mjs`:**
   - `GET /api/anime/board|chars|manifest`;
   - `POST /api/anime/chars|variant|manifest|enable|rebuild`.

   Chỉ cần `projectDir`, không bắt buộc `withManifest`. Job loại `anime` và `anime-build` qua `startJob`, nên mỗi dự án chỉ có một việc mỗi loại.
8. **UI.**
   - `addTab({ id: "anime", label: "Anime" })` gồm ba mục con: Nhân vật, Shot board, Hoạt hình.
   - Board vẽ thẻ thumbnail bằng `/p/<name>/assets/...`.
   - Sửa manifest có form cho 6 loại người dùng nêu:
     - lipsync: voice, open, half, closed, idle, from, to;
     - blink: pose, at[], frames;
     - wind: frames[], fps, phase;
     - keys: danh sách pose và frames;
     - impacts: at, frames, mode, stack;
     - offsets: x, y, scale theo tư thế.
   - Thêm một ô JSON thô cho các khoá khác.
   - Nút "Build lại" hiện các dòng WARN.
   - Chọn shot trên board thì `ctx.emit` để timeline nhảy tới shot (`ctx.transport.seek`).
9. **Tool** `lib/tools/anime.mjs`, để đạo diễn và client MCP gọi được sau khi phase 5 merge.
10. **Docs** `docs/anime-motion-comic.md`: quy trình 8 bước theo handoff, luật màu nền, "lệch khung thì sửa bằng offsets, không sinh lại", và luật tất định (không `Math.random`, `Date`…).
11. **Thử thật trên 4402.**
    - Dùng dự án thử `ms-smoke-2`: tạo bằng `scripts/new-project.sh`, bật hệ lật ảnh, chép 1 plate và 1 sheet của Zoro sang.
    - Sinh **một** biến thể bằng `codex-pool` (tốn 1 ảnh quota), tách nền, build.
    - Mở dự án Zoro chỉ để đọc board và manifest, không ghi.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`; `ℹ pass` = số của `main` + số test mới.
- `tests/anime-keying.test.mjs`:
  - ffmpeg `lavfi` sinh PNG 320×180 nền `#004CFE` có một hình tròn đỏ ở giữa;
  - `measure` ra màu cách `#004CFE` ≤ 4 đơn vị mỗi kênh;
  - sau `key`: pixel góc có alpha = 0, pixel tâm có alpha = 255 và màu đỏ giữ ±10;
  - ảnh nền xanh lá → `spill = "green"`.
- `tests/anime-manifest.test.mjs`:
  - round-trip manifest Zoro: chép vào tmp, đọc rồi ghi lại → `JSON.stringify` giống hệt bản gốc;
  - từ chối `type: "foo"`, `mode: "x"`, `silhouette` thiếu `stack`, offset `x: "1"`;
  - ghi với `base_sha` cũ → lỗi 409;
  - sao lưu có trong `.opus/anim-backups/`.
- Test template trong `tests/anime-manifest.test.mjs`: `node templates/anim/build.mjs` trên bản sao dự án mẫu (tmp, có `index.html` với `window.TIMING` tối thiểu) exit 0; chạy hai lần cho sha256 `anim-data.js` giống nhau (tất định).
- `tests/anime-variant.test.mjs`:
  - CLI `codex-pool` giả (helper `tests/fake-cli.mjs` của phase 1) ghi một PNG nền xanh;
  - `POST /api/anime/variant` → job xong, có `assets/plates/anim/<out>.png` dạng RGBA (`ffprobe pix_fmt` = `rgba`);
  - receipt có đủ sha256 của raw và png;
  - tên trùng → `-2`, không ghi đè.
- `tests/anime-routes.test.mjs`:
  - board chạy được khi dự án không có `project.json` (shot lấy từ manifest);
  - tên dự án sai → 400;
  - POST không token → 403.

## Tiêu chí nghiệm thu

- Trên 4402 với dự án Zoro (chỉ đọc; hôm nay chưa có `project.json`), board hiện mọi shot khác nhau có trong `manifest.stacks[*].shot` (đếm bằng `node -e` khi thử), kèm nhãn "chưa nhập project.json". Thumbnail đúng plate. Khi đã có `project.json`, board hiện đủ shot của nó (STORYBOARD có 16).
- Với `ms-smoke-2`:
  - một biến thể sinh thật bằng `codex-pool`, đã tách nền, rộng bằng plate gốc;
  - receipt nằm trong `.opus/receipts/`;
  - sửa `blink.at` trên UI → build exit 0 → `anim-data.js` đổi đúng khung (so `git diff --no-index` hai bản).
- Ảnh chụp tab Anime lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-anime-shots/`.
- Dự án Zoro không bị ghi: kiểm bằng `find` mtime sau phiên thử, không file nào mới hơn lúc bắt đầu.
- Server 4402 đã dừng.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Sửa manifest làm hỏng dự án đang chốt (Zoro) | Thấp | Cao | Mặc định chỉ đọc khi dự án có file final trong `renders/`: UI hỏi xác nhận, và luôn sao lưu trước khi ghi |
| Codex trả màu nền lệch nên key sót viền | Vừa | Vừa | Đo màu thật mỗi ảnh; cho chỉnh `sim`/`blend` trên UI; lưu thông số vào receipt |
| Despill đổi màu bên trong nhân vật (vụ quần Mihawk thành hồng) | Vừa | Vừa | Có tuỳ chọn "despill chỉ ở viền": `alphaextract` → `erosion` → mask; mặc định `mix=0.6` như lệnh đã dùng |
| Tốn quota khi thử | Chắc chắn (nhỏ) | Thấp | Chỉ 1 ảnh khi nghiệm thu; test dùng CLI giả |
| Template khác bản Zoro sau khi đổi tên | Thấp | Vừa | Test so `anim-data.js` |

## Hoàn tác

`git revert -m 1 <merge>`. Dữ liệu sinh ra trong dự án là `assets/chars/chars.json`, `assets/plates/anim/*`, `.opus/anim-backups/` và `.opus/receipts/`. Studio không xoá chúng; người dùng tự giữ hay xoá. Manifest khôi phục từ `.opus/anim-backups/`.

## PR upstream

Không cần. Hệ lật ảnh là mã của dự án, và việc sinh ảnh đi qua registry của phase 1.

## PR

Tiêu đề: `feat(anime): character sheets, shot board, pose variants and anim manifest editor`.

Commit gợi ý:
1. `feat(anime): limited-animation template`
2. `feat(anime): chroma key and upscale for generated poses`
3. `feat(anime): manifest editor with backups and rebuild`
4. `feat(anime): character library and shot board`
5. `feat(ui): anime tab`
6. `docs(anime): motion-comic workflow`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu: **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- `file:line` liên quan.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng. Hết quota Codex hay gặp lỗi credit thì dừng và báo người dùng, không đổi sang tài khoản khác bằng tay.
