# Phase 8: phong cách code từ lemo-opuscar

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/lemo-opuscar`
- **Nhánh:** `feat/lemo-opuscar`
- **Cổng server thử:** 4408
- **Effort:** 8h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1:
  - seam route (`routes/*.mjs`, `provider: false`);
  - seam UI: `addTab`, `addInspectorSection`;
  - seam tool (`lib/tools/*.mjs`);
  - mẫu khai lệnh provider có đường dự phòng (phase 1, mục "Lệnh provider").
- **Phụ thuộc mềm:** phase 5. Tool `lemo_*` hiện cho đạo diễn và client MCP ngoài khi phase 5 đã merge; trước đó chỉ gọi được qua `callTool`.

## Mục tiêu

1. Mở trong Studio cả thư viện 59 phong cách của lemo-opuscar: ảnh khung, tên tiếng Việt, nhóm, công dụng, phim mẫu, `STYLE.md`.
2. Áp một phong cách cho dự án hoặc cho một shot theo hai cách:
   - **lớp canvas**: chỉ hai phong cách provider đã kiểm (`watercolor`, `glass-product`). Studio chạy lệnh `lemo add` của provider, ghi `lemo_style:` vào `BRIEF.md` khi người dùng bấm, rồi nhờ đạo diễn viết scene;
   - **theo ngữ pháp**: 57 phong cách còn lại. Đạo diễn đọc `STYLE.md` và dựng bằng chính composition HyperFrames, không đổi `BRIEF.md`.
3. Tạo và giữ phong cách riêng theo quy trình `MY-STYLES.md` của lemo. Studio ghi phong cách vào `~/lemo-my-styles/<slug>/` đúng định dạng của lemo, nên plugin lemo-opuscar (nếu người dùng cài sau) cũng dùng được, và ngược lại.

## Nghiên cứu lemo-opuscar (đã kiểm 2026-10-23)

Clone chỉ đọc tại `/tmp/lemo-opuscar-src/repo` (`--depth 1`, HEAD `3961ddb`, 2026-10-22). Không chạy script, không cài gì.

**Repo:** `gh api repos/lemomo-ai/lemo-opuscar` cho 5 600 sao, push gần nhất 2026-10-22, giấy phép MIT. README mục Licence: code và docs MIT; phim demo và ảnh tĩnh (`styles/`, gallery, Releases) CC BY 4.0, ghi công "LemoLab" kèm link repo; ba giọng đọc không thuộc CC BY.

**Nó là gì.** Không phải ứng dụng hay engine dựng chung. Đây là một bộ phong cách cho agent viết code:
- `AGENTS.md`, `DIRECTOR.md` (cách đạo diễn: brief, nhạc trước, camera, 12 lỗi hay gặp, kiểm trước khi giao), `TECHNIQUE.md` (cách dựng).
- `styles/<slug>/` × 59, trong 11 nhóm. Mỗi phong cách có:
  - `style.json`: `slug`, `num`, `en`, `cn`, `category_en`, `film`, `line`, `uses[]`, `frame_sec`, `dur` (mẫu ở `styles/_template/style.json`);
  - `STYLE.md`: prompt phong cách 11 mục cố định (Essence, Materials & rendering, Colour logic, Type & subtitles, Motion, Camera, Sound, Native moves, Pitfalls, Engine, Variation space);
  - `DEMO.md`: cách phim mẫu được làm; 20/59 file có mục "Engine reference";
  - `demo/`: mã nguồn phim mẫu, phần lớn là `main.js`/`film.js` riêng từng phim, không phải engine dùng lại được.
- Ảnh khung 800×450 ở `docs/frames/<slug>.jpg` (59 file, 3,1 MB). Phim mẫu ở Release `films`: `releases/download/films/<slug>.mp4`, đủ 59 slug (đã đối chiếu bằng `gh api …/releases/tags/films`).
- **Phong cách riêng** (`MY-STYLES.md`): đổi một phong cách thư viện hoặc làm từ trang trắng. Hỏi từng câu, viết `STYLE.md` + `CHANGES.md` + `style.json` (có `based_on`, `borrows`), dựng một khung phong cách, rồi phim thử 15–30 s. Người dùng đồng ý thì chép vào `~/lemo-my-styles/<slug>/` và thêm một dòng vào `~/lemo-my-styles/README.md`. Slug không được trùng thư viện.

**Render** (`core/README.md`, `TECHNIQUE.md` §2): mỗi phim là một trang có `window.render(t)` thuần, `READY`, `DUR`, tuỳ chọn `EV` và `TEXTS`. `core/render/video.mjs` mở Chromium qua `playwright-core` (`core/render/page.mjs:4`), chụp JPEG từng khung, nhiều worker, pipe vào ffmpeg. Tất định nhờ PRNG có seed (`core/lib.js`), cấm `Date.now`/`Math.random`. Đây chính là cách HyperFrames seek rồi chụp.

**Âm thanh và hậu kỳ:** Python (`numpy`, `scipy`, `soxr`; Kokoro, edge-tts, faster-whisper; numba). Kokoro chỉ có tiếng Anh và tiếng Trung (`TECHNIQUE.md:98`). `core/render/mux.sh`: loudnorm hai lượt −14 LUFS, true peak −1,2 dB, thêm grain bằng ffmpeg.

**Đạo diễn AI:** plugin Claude Code (`plugin/skills/lemo-opuscar/SKILL.md`) clone thư viện về `~/lemo-opuscar` rồi giao cho `AGENTS.md`. Không có server, manifest hay hàng đợi yêu cầu.

## Provider đã lấy gì từ lemo-opuscar (không làm lại)

Bản 2.4.0 của plugin thêm lớp lemo-canvas (`CHANGELOG.md` mục v2.4.0; `references/lemo-canvas.md`):

| Đã có | Ở đâu |
|---|---|
| `lemo.mjs fetch | list [--json] | add --project --style [--force] | remove` | `scripts/lemo.mjs:6-24` (mã thoát 2, 3, 4, 5) |
| Danh mục 2 phong cách đã kiểm, ghim commit `b5e8ef9`, three.js 0.170.0 | `data/lemo/styles.json` |
| Cache sparse khoảng 0,5 MB | `~/.cache/opus-video/lemo-opuscar/b5e8ef9…` (có trên máy) |
| Hợp đồng scene `window.lemoRender(t, win)`, mốc theo tỉ lệ shot, chữ tiếng Việt ở DOM | `references/lemo-canvas.md` mục "Hợp đồng của scene" |
| Profile `lemo-watercolor`, `lemo-glass-product` (`engine: "lemo-canvas"`) | `data/styles/lemo-*.json`; Studio đã liệt kê chúng trong "Thư viện mẫu → Phong cách" qua `lib/library.mjs:92` |
| `BRIEF.md` `lemo_style:` khoá hướng hình khi chọn pitch | `scripts/make-pitch.mjs:176-189` |
| Dòng `next:` sau `add` chỉ đường tới `STYLE.md` | `scripts/lemo.mjs:253` |
| Số đo: 2D render khoảng 1,3 lần, hai bản giống từng byte; 3D khoảng 5 lần, PSNR ≥ 53 dB | `references/lemo-canvas.md` mục "Tốc độ và tính tất định" |

**Còn thiếu trong Studio hôm nay:**
- 57/59 phong cách không có chỗ nào để xem hay chọn;
- không có nút thêm lớp canvas: người dùng phải tự gõ lệnh;
- không có phong cách riêng.

`COMMANDS` của STUDIO_API 4 không có khoá `lemo` (`scripts/studio-api.mjs:29`). Đạo diễn chạy được `node <provider>/scripts/*` (`studio-api.mjs:51`), nhưng bị chặn sửa `BRIEF.md` và chặn `cp`/`mv` (`studio-api.mjs:56-58`). Vì vậy `lemo_style:` phải do Studio ghi khi người dùng bấm, qua `setFrontmatter` (`create.mjs:30`, chỉ import).

## Các phương án đã cân nhắc

| Ý tưởng | Quyết định | Lý do |
|---|---|---|
| Provider thứ hai `lib/providers/lemo-opuscar.mjs` | **Bỏ** | Provider là chủ `project.json`: manifest, gateway, hàng đợi yêu cầu, đạo diễn (`lib/provider.mjs:9-21`). lemo không có thứ nào trong số đó. `MOTION_STUDIO_PROVIDER` chọn một provider cho cả Studio, nên đổi sang lemo thì mất mọi dự án hiện có |
| Đường render từng khung canvas/WebGL riêng, trộn theo shot | **Bỏ** | Cần `playwright-core` và `three` qua npm, trái luật "không dependency npm". HyperFrames đã seek rồi chụp từng khung và đã render engine lemo tất định (số đo ở trên). Hai bộ render trong một video làm vỡ player, timeline, cổng viet-pro, và chuẩn hoá âm lượng hai lần. Font của lemo không có dấu tiếng Việt |
| Trộn theo shot | **Giữ, theo cách rẻ** | Hợp đồng `lemoRender(t, win)` đã cho scene biết khung giờ từng shot. Muốn vẽ canvas cho một shot thì chỉ cần nhờ đạo diễn vẽ trong `win[shot]`, không cần bộ render thứ hai |
| Kokoro/edge-tts | **Bỏ** | Không có tiếng Việt. Workspace bắt buộc ElevenLabs qua cổng viet-pro |
| Nhạc sampler/pluck, `sfx.py` | **Bỏ** | Cần Python, numba và vài GB mẫu nhạc. Provider đã sinh nhạc nền và SFX. Studio không có runtime Python |
| `mux.sh` (loudnorm −14 LUFS, grain) | **Chỉ học** | Bản giao do `render-final` và `compress-final` lo (8 Mbit/s). Thêm một bước master nữa thì chuẩn hoá hai lần. Phase 5 đã thêm kiểm `loudness` |
| `readcheck` (thời gian đọc chữ qua `window.TEXTS`) | **Hoãn** | Composition HyperFrames không có `TEXTS`. Provider đã có `word-sync`. Để sau, có thể làm thành một kiểm trong `lib/quality/` |
| Chuyển 57 engine còn lại thành lớp canvas ngay trong Studio | **Bỏ** | Danh mục lớp canvas là dữ liệu của plugin (profile, file engine, smoke từng phong cách). Làm trong Studio là chép lại `lemo.mjs`. Khi người dùng muốn thêm phong cách nào thì mở PR upstream cho đúng phong cách đó (mục PR upstream) |
| Vendor 59 ảnh khung vào repo Studio | **Bỏ** | Repo phình thêm 3–5 MB nhị phân CC BY. Thay bằng tải về cache, ghim commit |
| Chọn phong cách ngay trong hộp "Dự án mới" | **Hoãn** | Phải sửa `create.mjs` và `app.js`, không thuộc phase này. Tạo dự án xong là áp được ngay trong tab |
| Chạy nguyên văn quy trình `MY-STYLES.md` | **Chuyển thể** | Quy trình gốc dùng `AskUserQuestion` và bộ render playwright của lemo. Ở đây dùng thẻ hỏi của Studio, còn khung phong cách chụp bằng công cụ chụp khung mà đạo diễn đã được phép chạy |

**Hình chọn (nhỏ nhất mà có giá trị):** một tab "Phong cách code" với thư viện 59 + phong cách riêng, hai cách áp (lớp canvas hoặc theo ngữ pháp, cho dự án hoặc cho một shot), và nút "Giữ phong cách". Mọi việc ghi đều đi qua lệnh có sẵn của provider, qua `setFrontmatter`, hoặc qua yêu cầu cho đạo diễn. Không có bộ render mới.

## Sở hữu file

**Tạo mới:**
- `lib/lemo/pin.json`: `{ repo, sha: "3961ddb3d24d8876e0e2754f7790d66908acee51", slugs: [59 slug] }`.
- `lib/lemo/vi.json`: tên tiếng Việt cho 59 phong cách và 11 nhóm (`{ styles: { <slug>: "…" }, groups: { <category_en>: "…" } }`).
- `lib/lemo/fetch.mjs`: `fetchLibrary({ home, pin, git = "git" })`. Chỉ lấy file theo danh sách sparse: `LICENSE`, `MY-STYLES.md`, `styles/*/style.json`, `styles/*/STYLE.md`, `styles/*/DEMO.md`, `docs/frames/*.jpg`.
- `lib/lemo/catalog.mjs`: `libraryStyles(home)`, `myStyles(dir)`, `search(rows, q)` (dùng `fold()` của `lib/library.mjs:17`, chỉ import), `layerSlugs(P)`.
- `lib/lemo/my-styles.mjs`: `keepStyle({ projectDir, myDir, librarySlugs })`, `readmeRow(style)`.
- `lib/lemo/requests.mjs`: hàm thuần dựng văn bản yêu cầu cho đạo diễn (`layerScene`, `grammarProject`, `grammarShot`, `draftStyle`, `insertMarkers`).
- `routes/lemo.mjs`
- `lib/tools/lemo.mjs`: tool chỉ đọc `lemo_styles` (tìm), `lemo_style_guide` (đường `STYLE.md` + 8 000 ký tự đầu).
- `public/ext-lemo.js`, `public/lemo-gallery.js`, `public/lemo-mystyle.js`, `public/ext-lemo.css`.
- `docs/lemo-styles.md`
- Test: `tests/lemo-fetch.test.mjs`, `tests/lemo-catalog.test.mjs`, `tests/lemo-my-styles.test.mjs`, `tests/lemo-requests.test.mjs`, `tests/lemo-routes.test.mjs`.
- Fixture: `tests/fixtures/lemo/` (repo nhỏ 3 phong cách, 1 `style.json` hỏng; `fake-lemo.mjs` giả lệnh `lemo` của provider, ghi log lời gọi).

**Sửa:**
- `lib/providers/opus-video.mjs`: thêm đúng một khoá `lemo: s("lemo.mjs")` vào `commands`, trước dòng `...(api.COMMANDS ?? {})` (`lib/providers/opus-video.mjs:87-88`). Giống bảy lệnh phase 1 thêm. Plugin cũ hơn 2.4.0 không có file này thì route kiểm `existsSync` và tắt cách "lớp canvas".

**Không đụng:** `server.mjs`, `create.mjs` (chỉ import `setFrontmatter`), `panels.js`, `inspector.js`, `app.js`, mọi file của phase 2–7, `fx/` của phase 6, plugin, `~/.cache/opus-video/`.

Tiền tố `lemo` không trùng tiền tố nào của phase 2–7 (`anime`, `timeline`, `nle`, `mcp`/`receipts`, `fx`, `broll`).

## Luồng dữ liệu

```text
Tab "Phong cách code" (ext-lemo.js → lemo-gallery.js)
  GET /api/lemo/styles?q=&group=&name=<dự án>          (provider: false; thiếu provider thì không có lớp canvas)
     ├─ cache chưa có → { fetched: false } → nút "Tải thư viện (≈ 5 MB)"
     │     POST /api/lemo/fetch → job "lemo" (git, không shell):
     │       git init → fetch --depth 1 --filter=blob:none origin <sha> → sparse-checkout set --no-cone <mẫu>
     │       → checkout <sha> → ~/.cache/motion-studio/lemo-opuscar/<sha>/   (đã có và đúng sha thì không làm gì)
     ├─ myStyles($LEMO_MY_STYLES ?? ~/lemo-my-styles): style.json + STYLE.md; xếp trước thư viện
     ├─ libraryStyles(cache): 59 × style.json → lọc trường, cắt độ dài, gắn tên/nhóm từ vi.json
     └─ layerSlugs(P): node <P.commands.lemo> list --json → slug có status "verified"
  → [{ slug, source: "mine" | "library", ten, en, nhom, line, uses, dur, based_on?,
       frame: "/lemo/frame/<slug>.jpg", film_url, guide (đường tuyệt đối STYLE.md), layer: bool }]
  GET /lemo/frame/<slug>.jpg  → slug khớp ^[a-z0-9-]+$, realpath trong cache hoặc thư mục phong cách riêng,
                                 4 byte đầu là JPEG → image/jpeg ; còn lại 403/404

Áp phong cách (thẻ → "Áp cho dự án" | inspector shot → "Áp cho shot này")
  POST /api/lemo/apply { name, slug, mode: "layer" | "grammar", shot? }
   mode layer (slug ∈ layerSlugs):
     job "lemo": node <P.commands.lemo> add --project <dir> --style <slug>
        exit 4 (chưa có cache) → fetch rồi add lại một lần
        exit 5 (đã có lớp)     → trả { code: "exists" }; UI hỏi "Thay lớp?" → remove rồi add
        exit 3 (thiếu dấu)     → trả { code: "markers" }; UI đề nghị yêu cầu insertMarkers cho đạo diễn
        exit 0 → setFrontmatter(BRIEF.md, { lemo_style: slug }) → .opus/lemo.json { slug, mode, shot?, at }
               → ctx.direct(layerScene({ slug, next: dòng "next:" trong log, shot?, win? }))
   mode grammar: không đổi BRIEF.md → .opus/lemo.json → ctx.direct(grammarProject|grammarShot({ guide, shot? }))
  GET /api/lemo/project?name= → { slug, mode, layer_files: bool, scene: "scene.js" | "scene3d.js" | null,
                                   vertical: bool (data-width < data-height của index.html) }

Phong cách riêng (lemo-mystyle.js)
  "Tạo phong cách riêng" { base | blank, mô tả, tên } → ctx.direct(draftStyle({ base guide, MY-STYLES.md }))
     đạo diễn làm trong <dự án>/lemo-style/: style.json, STYLE.md, CHANGES.md, styleframe.jpg (+ DEMO.md, demo/)
     câu hỏi đi qua thẻ hỏi của Studio; khung phong cách là composition của chính dự án
  "Giữ phong cách" (chỉ người dùng bấm) POST /api/lemo/keep { name }
     → keepStyle: kiểm style.json, slug ^[a-z0-9][a-z0-9-]{1,40}$, không trùng 59 slug thư viện hay phong cách riêng đã có
     → chép danh sách trắng (style.json, STYLE.md, CHANGES.md, DEMO.md, styleframe*.jpg, test.mp4, test.jpg, demo/ không
        symlink, không node_modules/renders/out, tổng ≤ 300 MB) vào thư mục tạm cạnh đích → rename thành <myDir>/<slug>/
     → thêm một dòng vào <myDir>/README.md (tạo file nếu chưa có)
```

## Văn bản yêu cầu cho đạo diễn (`lib/lemo/requests.mjs`)

Mọi yêu cầu đều có các luật sau, lấy từ `references/lemo-canvas.md` và `DIRECTOR.md` §12:
- chủ đề, lời và nhịp là của dự án; chỉ học ngữ pháp hình ảnh trong `STYLE.md`; không chép câu chuyện, cảnh, nhân vật hay thẻ kết của phim mẫu;
- mọi chữ tiếng Việt nằm ở lớp DOM, dùng Be Vietnam Pro, qua cổng viet-pro;
- hình là hàm thuần của `t`, không `Math.random`/`Date`/`performance.now`; mốc đặt theo tỉ lệ shot;
- xong thì chạy kiểm của dự án.

| Hàm | Khi nào | Nội dung riêng |
|---|---|---|
| `layerScene` | lớp canvas đã thêm | dòng `next:` của `add`; có `shot` thì chỉ vẽ trong `win[shot]`, ngoài khoảng đó trả canvas trống |
| `grammarProject` | phong cách theo ngữ pháp, cả dự án | đường `STYLE.md`; dựng bằng GSAP/DOM/canvas trong composition HyperFrames |
| `grammarShot` | theo ngữ pháp, một shot | như trên, chỉ shot `<id>`, giữ các shot khác |
| `draftStyle` | tạo phong cách riêng | đường `MY-STYLES.md` và `STYLE.md` gốc; làm trong `lemo-style/`; hỏi người dùng bằng thẻ hỏi, không tự chép ra ngoài dự án |
| `insertMarkers` | `add` trả exit 3 | chèn bốn dấu rỗng như `references/lemo-canvas.md` mô tả, rồi báo xong |

Tên provider không xuất hiện trong văn bản. Đường tài liệu của provider lấy từ dòng `next:` hoặc từ `P.home`.

## Các bước

1. **Ghim và dịch tên.** Ghi `lib/lemo/pin.json` (sha ở trên, 59 slug lấy từ `ls styles` của bản clone `/tmp/ms-ref/lemo-opuscar`). Viết `lib/lemo/vi.json`. Ví dụ: `watercolor` → "Thuỷ màu tự vẽ" (giữ đúng tên mà profile của provider dùng), `ukiyoe` → "Tranh khắc Ukiyo-e".
2. **`lib/lemo/fetch.mjs`** và `tests/lemo-fetch.test.mjs`. Test dùng repo git cục bộ dựng trong thư mục tạm (`file://`), không cần mạng.
3. **`lib/lemo/catalog.mjs`** và `tests/lemo-catalog.test.mjs`:
   - chỉ giữ các trường của bảng `style.json`;
   - chuỗi cắt ở 400 ký tự, `uses` tối đa 6 mục;
   - `style.json` hỏng thì bỏ qua, có cảnh báo trong `warnings[]`.
4. **`lib/lemo/my-styles.mjs`** và `tests/lemo-my-styles.test.mjs`.
5. **`lib/lemo/requests.mjs`** và `tests/lemo-requests.test.mjs`.
6. **Adapter:** thêm khoá `lemo`. Chạy `tests/provider.test.mjs` với plugin thật 2.5.0 và với `fakePlugin` API 3.
7. **`routes/lemo.mjs`:**
   - `GET /api/lemo/styles`, `GET /lemo/frame/<slug>.jpg`, `GET /api/lemo/project`: đặt `provider: false`;
   - `POST /api/lemo/fetch`, `/api/lemo/apply`, `/api/lemo/keep`: kiểm token như mọi POST; một job `lemo` mỗi dự án (`jobs.mjs running`);
   - `tests/lemo-routes.test.mjs` dùng `createServer` trên cổng 0, `fakePlugin({ api: 4, extra })` (`tests/fake-plugin.mjs:8`), với `extra` khai `COMMANDS = { lemo: <đường tests/fixtures/lemo/fake-lemo.mjs> }`.
8. **UI:**
   - `addTab({ id: "styles-code", label: "Phong cách code" })`: thanh tìm, lọc theo nhóm, mục "Của bạn" ở đầu, lưới thẻ (ảnh khung, tên Việt, tên gốc, một dòng, công dụng);
   - mỗi thẻ có nhãn "Lớp canvas" hoặc "Theo ngữ pháp", nút "Xem phim mẫu" (mở `film_url` ở tab mới), "Đọc STYLE.md" (hiện dạng chữ thuần, không render HTML), "Áp cho dự án";
   - dự án 9:16 thì nhãn "Lớp canvas" kèm cảnh báo "chỉ vẽ cho khung 16:9"; phong cách 3D kèm "render chậm khoảng 5 lần";
   - chân tab ghi công: "Ảnh và phim mẫu: LemoLab, CC BY 4.0, github.com/lemomo-ai/lemo-opuscar";
   - `addInspectorSection({ kinds: ["shot"] })`: phong cách hiện tại của dự án và nút "Áp phong cách cho shot này" (mở bộ chọn rút gọn);
   - `lemo-mystyle.js`: hộp "Tạo phong cách riêng"; khi có `lemo-style/style.json` thì hiện khung phong cách, bảng `CHANGES.md` và nút "Giữ phong cách".
9. **Tool** `lib/tools/lemo.mjs` (`mutates: false`, `provider: false`).
10. **Docs:** `docs/lemo-styles.md` gồm cách dùng, hai cách áp, phong cách riêng, cache, `LEMO_MY_STYLES`, ghi công, cách đổi commit ghim.
11. **Thử thật trên 4408** với `/tmp/ms-smoke-8.mjs` (mục "Cách chạy server thử" trong `plan.md`) và dự án `ms-smoke-8`. Đặt `LEMO_MY_STYLES=/tmp/ms-smoke-8-my-styles` để không ghi vào `~/lemo-my-styles` khi thử. Làm theo thứ tự:
    1. tải thư viện;
    2. áp `watercolor` dạng lớp canvas cho cả dự án;
    3. áp `ukiyoe` theo ngữ pháp cho shot `s2`;
    4. tạo phong cách riêng từ `ukiyoe` rồi giữ;
    5. dừng server.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0` và `ℹ pass` ≥ baseline lúc rebase + số test mới (ghi số trong PR).
- `tests/lemo-fetch.test.mjs`:
  - thư mục cache chỉ chứa file khớp mẫu sparse; `find <cache> -type f -name '*.js' -o -name '*.py' -o -name '*.sh'` (bỏ `.git/`) ra 0 file;
  - gọi lần hai thì không chạy `git fetch` (git giả ghi log; log không có dòng mới);
  - sha không có trong repo → lỗi, không để lại thư mục `<sha>` dở dang;
  - lệnh git chạy không qua shell (khẳng định bằng log đối số).
- `tests/lemo-catalog.test.mjs`:
  - fixture 3 phong cách + 1 hỏng → 3 dòng, `warnings.length === 1`;
  - trường lạ trong `style.json` không có trong kết quả; chuỗi 2 000 ký tự bị cắt còn ≤ 400;
  - khoá của `vi.json` `styles` khớp đúng `pin.json` `slugs` (59, không thiếu, không thừa); mọi `category_en` của fixture có trong `groups`;
  - `search(rows, "thuy mau")` và `"thuỷ màu"` đều ra `watercolor`;
  - phong cách riêng xếp trước thư viện; `layer` đúng theo danh sách `verified` giả.
- `tests/lemo-my-styles.test.mjs`:
  - slug trùng thư viện → lỗi `conflict`; trùng phong cách riêng đã có → `conflict`; slug sai mẫu → `invalid`;
  - `node_modules/`, `out/` và một symlink trong `lemo-style/` không có ở đích;
  - draft > 300 MB (file thưa tạo bằng `truncate`) → `too_large`, đích không có gì;
  - `README.md` được tạo với đúng một dòng; giữ phong cách thứ hai thì thêm dòng thứ hai, dòng cũ không đổi;
  - không còn thư mục tạm cạnh đích sau khi xong hoặc khi lỗi.
- `tests/lemo-requests.test.mjs`: mỗi hàm cho văn bản chứa đường `STYLE.md` truyền vào, câu cấm chép câu chuyện phim mẫu, luật chữ ở DOM; `grammarShot` chứa id shot; `layerScene` có `shot` thì chứa `win`; không văn bản nào chứa tên provider.
- `tests/lemo-routes.test.mjs`:
  - `GET /api/lemo/styles` chạy được với `OPUS_VIDEO_HOME=/nonexistent` (không provider), mọi `layer: false`;
  - `/lemo/frame/..%2Fx.jpg` → 403; slug lạ → 404; file không phải JPEG → 415;
  - POST không token → 403;
  - `apply` layer, fake exit 0 → `BRIEF.md` có `lemo_style: watercolor`, có `.opus/lemo.json`, log fake có `add --project <dir> --style watercolor`;
  - fake exit 4 lần đầu → log có `fetch` rồi `add` lần hai;
  - fake exit 3 → `{ code: "markers" }`, sha256 của `BRIEF.md` không đổi;
  - `apply` layer với slug không `verified` → 422, `BRIEF.md` không đổi, fake không bị gọi `add`;
  - `apply` grammar → `BRIEF.md` không đổi, `.opus/lemo.json` có `mode: "grammar"`;
  - hai `apply` cùng lúc cho một dự án → cái sau 409.
- `tests/provider.test.mjs`: xanh, kể cả kiểm chặn tên provider ở mọi file mới.

## Tiêu chí nghiệm thu

- `curl -s :4408/api/lemo/styles` sau khi tải: 59 dòng `source: "library"`, đúng 2 dòng `layer: true` (`watercolor`, `glass-product`). Mọi `frame` trả 200 `image/jpeg`.
- Tab "Phong cách code" hiện 59 thẻ trong 11 nhóm, tên tiếng Việt. Tìm "thuỷ màu" ra Thuỷ màu tự vẽ. Ảnh chụp lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-lemo-shots/`.
- Trên `ms-smoke-8`:
  - sau khi áp `watercolor`: `BRIEF.md` có `lemo_style: watercolor`, `assets/lemo/CREDITS` có, hàng đợi có yêu cầu kèm dòng `next:`;
  - đạo diễn xong: `npm run check` của dự án exit 0; chụp cùng một khung hai lần cho `shasum` giống nhau;
  - sau khi áp `ukiyoe` cho `s2`: có yêu cầu kèm đường `STYLE.md` của `ukiyoe` và id `s2`; sha256 của `BRIEF.md` trước và sau giống nhau.
- Phong cách riêng: đạo diễn tạo `lemo-style/` có `style.json`, `STYLE.md`, `CHANGES.md` và khung chụp PNG. "Giữ phong cách" đổi khung đó thành `styleframe.jpg` bằng ffmpeg (không có ffmpeg thì giữ `styleframe.png`), tạo `/tmp/ms-smoke-8-my-styles/<slug>/` cùng dòng `README.md`, và thẻ hiện ở đầu mục "Của bạn".
- `~/.cache/opus-video/` không đổi mtime (Studio không ghi vào cache của plugin).
- Server 4408 đã dừng (`lsof -i :4408` rỗng). Server 4317 vẫn chạy, pid không đổi. Dự án `ms-smoke-8` và `/tmp/ms-smoke-8-my-styles` chỉ xoá khi người dùng xác nhận.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| `STYLE.md` của bên thứ ba chèn lệnh vào prompt đạo diễn | Thấp | Vừa | Ghim sha đã đọc; đạo diễn vẫn bị chặn WebFetch, chặn sửa ngoài dự án, chặn `BRIEF.md` (`studio-api.mjs:56`); UI hiện `STYLE.md` dạng chữ thuần |
| Hai commit ghim lệch nhau (Studio `3961ddb`, provider `b5e8ef9`), `STYLE.md` của 2 phong cách lớp canvas khác nhau chút | Vừa | Thấp | Với lớp canvas, yêu cầu dùng dòng `next:` của provider (đúng commit của engine), không dùng `guide` của Studio |
| Lớp canvas trên dự án 9:16 vẽ sai bố cục | Vừa | Vừa | Cảnh báo trên thẻ; `reframe` của provider đã in `WARN lemo` |
| Phong cách 3D làm render chậm khoảng 5 lần | Cao | Thấp | Nhãn "render chậm"; nghiệm thu chỉ dùng 2D |
| Tải thư viện lỗi mạng hoặc GitHub đổi | Thấp | Thấp | Job báo lỗi rõ; cache cũ đúng sha vẫn dùng được; thư mục dở dang bị xoá |
| "Giữ phong cách" ghi đè phong cách của người dùng | Thấp | Cao | Kiểm trùng slug, chép vào thư mục tạm rồi rename, không bao giờ ghi vào thư mục đã có |
| Đạo diễn sửa `index.html` làm hỏng dấu LEMO | Thấp | Vừa | `add` trả exit 3, UI đề nghị yêu cầu `insertMarkers`; `remove` giữ scene |
| `lemo.mjs list --json` đổi dạng ở bản plugin sau | Thấp | Vừa | Đọc phòng thủ (thiếu `status` thì coi là chưa kiểm); test với output giả cả hai dạng |

## Hoàn tác

- `git revert -m 1 <merge>`: gỡ tab, route, tool và khoá `lemo` của adapter. Phase khác không vỡ, vì seam nạp được thư mục rỗng.
- Dữ liệu ngoài repo vẫn nằm nguyên và vô hại:
  - `~/.cache/motion-studio/lemo-opuscar/`: xoá được;
  - `.opus/lemo.json`: Studio đọc, provider không đọc;
  - `~/lemo-my-styles/`: của người dùng, không tự xoá.
- Dự án đã có lớp canvas thì gỡ bằng `lemo remove --project <dir>` của provider và xoá dòng `lemo_style:` trong `BRIEF.md`. Hai việc này đều có sẵn, không phụ thuộc phase 8.

## PR upstream

Không cần cho phase này. Khoá `lemo` có đường dự phòng trong adapter, như bảy lệnh của phase 1.

Chỉ mở PR từ `/Volumes/2/opus-video-upstream-work` khi điều kiện sau xảy ra:

| Khi nào | Nội dung |
|---|---|
| Người dùng muốn một phong cách thứ ba có lớp canvas thật (không chỉ theo ngữ pháp) | Theo `references/lemo-canvas.md` mục "Thêm một phong cách lemo khác": mục trong `data/lemo/styles.json`, profile `data/styles/lemo-<slug>.json`, smoke render hai lần. Studio tự thấy nhờ `list --json`, không cần sửa |
| Muốn bỏ đường dự phòng trong adapter | Thêm `lemo` vào `COMMANDS` của `scripts/studio-api.mjs`; `...api.COMMANDS` của adapter tự lấy |

## PR

Tiêu đề: `feat(lemo): code-made film styles gallery, canvas layer and own styles`.

Commit gợi ý:
1. `feat(lemo): pinned sparse fetch of the style library`
2. `feat(lemo): style catalog with Vietnamese names and own styles`
3. `feat(lemo): keep a drafted style in the shared styles folder`
4. `feat(provider): lemo command`
5. `feat(lemo): apply a style as canvas layer or grammar, per project or shot`
6. `feat(ui): code styles tab and shot style section`
7. `docs(lemo): gallery, applying styles and own styles`

Thân PR: tóm tắt, cách thử, `ℹ pass N`, ảnh chụp. Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc cần sửa file ngoài sở hữu (ví dụ `server.mjs`, `create.mjs`, `inspector.js`): **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
