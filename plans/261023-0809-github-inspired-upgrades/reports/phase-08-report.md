# Báo cáo phase 8: phong cách code (lemo-opuscar)

Phase 8 đã xong. PR: **https://github.com/abm-dungtq/motion-studio/pull/9** (`feat/lemo-opuscar` → `main`). Chưa merge.

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/lemo-opuscar`, tách từ `main` mới nhất (f614d77).
- **Test:** `npm test` chạy 176 test, đạt 176, lỗi 0. Baseline là 141; phase này thêm 35.

## Commit

| Commit | Nội dung |
|---|---|
| 6c2bbf8 | `feat(lemo)`: tải thư viện ở commit ghim, chỉ lấy file trong danh sách |
| 6057a8b | `feat(lemo)`: danh mục, tên tiếng Việt, phong cách riêng |
| 29c7665 | `feat(lemo)`: giữ bản nháp vào thư mục phong cách dùng chung |
| c63b350 | `feat(provider)`: khoá `lemo` trong adapter (chỉ một khoá) |
| f80ab8d | `feat(lemo)`: áp phong cách theo lớp canvas hoặc theo ngữ pháp, cho dự án hoặc một shot |
| 5312646 | `feat(ui)`: tab Phong cách code và mục phong cách trong inspector shot |
| 38fbf45 | `docs(lemo)`: `docs/lemo-styles.md` |
| 68474c9 | `fix(lemo)`: giữ ảnh chụp PNG làm khung phong cách |
| 8881d8b | `docs(lemo)`: khung của phong cách riêng có thể là PNG |

## File

Tất cả file đều trong phạm vi phase 8:

- **Thư viện và logic:** `lib/lemo/pin.json`, `vi.json`, `fetch.mjs`, `catalog.mjs`, `my-styles.mjs`, `requests.mjs`
- **Route và tool:** `routes/lemo.mjs`, `lib/tools/lemo.mjs`
- **Giao diện:** `public/ext-lemo.js`, `public/ext-lemo.css`, `public/lemo-gallery.js`, `public/lemo-mystyle.js`
- **Tài liệu:** `docs/lemo-styles.md`
- **Test:** `tests/lemo-fetch.test.mjs`, `lemo-catalog.test.mjs`, `lemo-my-styles.test.mjs`, `lemo-requests.test.mjs`, `lemo-routes.test.mjs`
- **Fixture:** `tests/fixtures/lemo/**`
- **Adapter:** `lib/providers/opus-video.mjs` chỉ thêm khoá `lemo` kèm một dòng chú thích.

Tên provider không xuất hiện ở file nào ngoài adapter (đã grep, không tính `tests/fixtures`).

## Nghiệm thu

Đã chạy thử trên cổng 4408 với dự án `/Volumes/2/Edit-Video/ms-smoke-8`, đặt `LEMO_MY_STYLES=/tmp/ms-smoke-8-my-styles`.

| Tiêu chí | Kết quả |
|---|---|
| `/api/lemo/styles` trả 59 dòng thư viện, đúng 2 dòng `layer: true`, mọi khung trả 200 `image/jpeg` | Đạt. Hai dòng lớp canvas là watercolor (2d) và glass-product (3d). Cả 59 khung trả 200 `image/jpeg`. Không có cảnh báo. |
| Tab hiện 59 thẻ trong 11 nhóm với tên tiếng Việt; tìm "thuỷ màu" ra Thuỷ màu tự vẽ; có ảnh chụp | Đạt. Xem ảnh `01-gallery.png` và `02-search-thuy-mau.png`. |
| Áp watercolor: BRIEF có `lemo_style: watercolor`, có `assets/lemo/CREDITS`, yêu cầu gửi đạo diễn có dòng `next:` | Đạt |
| Đạo diễn xong: `npm run check` thoát 0; chụp hai lần cho shasum giống nhau | Đạt. Hai lần `snapshot --at 3.0,7.5` giống nhau. Xem ảnh `04-ms-smoke-8-frames-s1-s2.jpg`. |
| Áp ukiyoe cho s2: yêu cầu có đường `STYLE.md` và id `s2`; sha256 của BRIEF giữ nguyên | Đạt. Sha256 của BRIEF trước và sau đều là `5b8bb0e6…`. Xem ảnh `03-shot-inspector.png`. |
| Phong cách riêng: `lemo-style/` có `style.json`, `STYLE.md`, `CHANGES.md` và khung; "Giữ phong cách" tạo thư mục và dòng README; thẻ đứng đầu "Của bạn" | Đạt, kèm sai khác 6 ở dưới. Đạo diễn tạo PNG chứ không tạo `styleframe.jpg`; Studio đổi thành `styleframe.jpg` khi người dùng bấm Giữ. `/tmp/ms-smoke-8-my-styles/khac-go-que/styleframe.jpg` là JPEG 1920×1080. README có dòng mới. `/api/lemo/frame/mine/khac-go-que.jpg` trả 200. Xem ảnh `05`, `06` và `07`. |
| `~/.cache/opus-video/` không đổi mtime | Đạt. Bốn đường dẫn đã chụp mtime trước khi chạy và so lại sau; không có thay đổi. |
| Server 4408 đã dừng; 4317 vẫn chạy với pid cũ | Đạt. `lsof -i :4408` rỗng. 4317 vẫn là pid 63883. |

Ảnh chụp nằm ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-lemo-shots/` (01–07).

Thư viện tải về `~/.cache/motion-studio/lemo-opuscar/3961ddb…/` gồm 241 file, 5,1 MB, không có file `.js`, `.py` hay `.sh`.

## Sai khác so với phase file

1. **Route ảnh khung là `/api/lemo/frame/...`**. Lý do: luật đường dẫn route của phase 1 là `^/api/[a-z0-9/_-]+$`, nên route phải đăng ký theo prefix.
2. **Thêm hai route:** `GET /api/lemo/guide` hiện `STYLE.md` dạng chữ thuần trong dialog, và `POST /api/lemo/draft` gửi yêu cầu tạo phong cách riêng.
3. **`apply` có thêm mode `markers`**. Mode này gửi yêu cầu chèn bốn dấu LEMO khi lệnh `add` thoát mã 3.
4. **Dạng của `.opus/lemo.json`** là `{project, shots: {<id>}, layer}`.
5. **`POST /api/lemo/fetch` chạy job loại `lemo-fetch`**, không theo dự án. `apply` chạy job loại `lemo` của dự án; job thứ hai cùng lúc trả 409 `busy`.
6. **Khung phong cách là PNG. Đây là trường hợp của Failure Protocol, đã hỏi kongming.**
   - Vấn đề: đạo diễn chỉ chụp được bằng `hyperframes snapshot`, lệnh này ghi PNG. Đạo diễn không có quyền đổi tên hay chuyển định dạng, nên không tạo được `styleframe.jpg`.
   - kongming đề xuất phương án A, và tôi đã làm theo:
     - yêu cầu gửi đạo diễn chỉ đòi một ảnh PNG trong `lemo-style/`;
     - khi người dùng bấm "Giữ phong cách", Studio chọn khung theo thứ tự: `styleframe.jpg` thật, `styleframe.png`, `frame-00-*.png`, PNG duy nhất, rồi PNG mới nhất (kèm cảnh báo);
     - Studio đổi ảnh thành `styleframe.jpg` bằng ffmpeg (`execFileSync`, không qua shell); máy không có ffmpeg thì giữ `styleframe.png`;
     - route ảnh khung nhận PNG cho phong cách riêng; thư viện vẫn chỉ nhận JPEG.
   - Câu nghiệm thu "đạo diễn tạo `styleframe.jpg`" nên sửa thành "đạo diễn chụp một khung PNG; Studio đổi thành `styleframe.jpg` khi giữ". Tôi chưa sửa plan; việc này để orchestrator quyết.

## Chi phí và dọn dẹp

- **Quota:** 3 lượt chạy đạo diễn (lớp watercolor, ngữ pháp ukiyoe cho s2, bản nháp phong cách riêng). Thêm một lần hỏi kongming.
- **Đã dừng và xoá:**
  - server 4408 và phiên agent-browser `ms-smoke-8`;
  - `/tmp/ms8-*` và `/tmp/ms-smoke-8.mjs`;
  - file chụp mtime;
  - các thư mục tạm `lemo-home-*` và `lemo-lib-*` trong `$TMPDIR`.
- **Còn giữ, chờ người dùng xác nhận mới xoá:**
  - `/Volumes/2/Edit-Video/ms-smoke-8`;
  - `/tmp/ms-smoke-8-my-styles`;
  - cache thư viện `~/.cache/motion-studio/lemo-opuscar/` (5,1 MB; Studio dùng lại được).
- **Không đổi:** `~/lemo-my-styles/` thật, `~/.claude/skills/**`, commit ghim của lemo ở upstream.

Status: DONE_WITH_CONCERNS
Summary: Phase 8 xong, PR #9 mở vào main (chưa merge), `npm test` đạt 176/176, và chạy thử trên cổng 4408 đạt mọi tiêu chí nghiệm thu. Riêng khung phong cách: đạo diễn tạo PNG và Studio đổi thành `styleframe.jpg` khi người dùng bấm giữ, theo phương án kongming đề xuất.
Concerns:
- Câu nghiệm thu về `styleframe.jpg` trong phase file nên sửa theo sai khác 6.
- Thư viện Studio ghim ở `3961ddb`, còn engine của provider ở `b5e8ef9`. Với lớp canvas, đạo diễn dùng dòng `next:` của provider nên không lệch; vẫn nên đồng bộ hai commit khi đổi ghim.
- Dự án `ms-smoke-8` và `/tmp/ms-smoke-8-my-styles` chờ người dùng xác nhận mới xoá.
