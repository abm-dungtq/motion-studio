# Phong cách code (lemo-opuscar)

Tab **Phong cách code** mở thư viện 59 phong cách phim dựng bằng code của [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar), cùng các phong cách riêng của bạn. Mỗi phong cách có ảnh khung, tên tiếng Việt, nhóm, công dụng, phim mẫu và `STYLE.md` (prompt phong cách 11 mục). Bạn áp một phong cách cho cả dự án hoặc cho một shot.

Studio không có bộ render thứ hai. Mọi phong cách đều dựng bằng chính composition HyperFrames của dự án, nên player, timeline, cổng viet-pro và bản xuất vẫn chạy như cũ.

## Tải thư viện

Lần đầu, tab hiện nút **Tải thư viện (≈ 5 MB)**. Studio chỉ tải dữ liệu, không tải mã chạy được:

- `styles/*/style.json`, `styles/*/STYLE.md`, `styles/*/DEMO.md`;
- ảnh khung 800×450 `docs/frames/*.jpg`;
- `LICENSE` và `MY-STYLES.md`.

Thư viện được ghim ở một commit trong [`lib/lemo/pin.json`](../lib/lemo/pin.json) và nằm ở `~/.cache/motion-studio/lemo-opuscar/<sha>/` (đổi chỗ bằng `MOTION_STUDIO_LEMO_CACHE`). Studio tải bằng `git` không qua shell: `fetch --depth 1 --filter=blob:none`, sparse-checkout theo danh sách trên, rồi xoá dữ liệu git và mọi file ngoài danh sách. Đã có bản đúng commit thì không tải lại. Tải lỗi thì không để lại thư mục dở dang.

Phim mẫu không tải về. Nút **Xem phim mẫu** mở bản phát hành `films` trên GitHub ở tab mới.

## Hai cách áp

Mỗi thẻ ghi rõ một nhãn:

| Nhãn | Phong cách | Studio làm gì |
|---|---|---|
| **Lớp canvas** | Các phong cách mà lệnh `lemo list --json` của provider báo `verified` (hiện là `watercolor` và `glass-product`) | Chạy `lemo add --project <dự án> --style <slug>` thành job `lemo` của dự án, ghi `lemo_style: <slug>` vào `BRIEF.md`, rồi gửi đạo diễn yêu cầu viết scene kèm dòng `next:` mà lệnh in ra |
| **Theo ngữ pháp** | 57 phong cách còn lại và phong cách riêng | Không đổi `BRIEF.md`. Gửi đạo diễn yêu cầu đọc `STYLE.md` rồi dựng bằng GSAP, DOM hoặc canvas trong composition của dự án |

Lớp canvas có thêm các trường hợp sau:

- Engine của provider chưa có trong cache (lệnh `add` thoát với mã 4): Studio chạy `lemo fetch` rồi `add` lại một lần.
- Dự án đã có lớp (mã 5): Studio hỏi "Thay lớp cũ?". Đồng ý thì Studio chạy `remove` rồi `add`; scene đã viết vẫn giữ.
- `index.html` thiếu bốn dấu của lớp canvas (mã 3): Studio đề nghị nhờ đạo diễn chèn dấu. Chèn xong thì bấm áp lại.

Thẻ cũng cảnh báo hai việc. Với dự án 9:16, lớp canvas chỉ vẽ cho khung 16:9. Với phong cách 3D, render chậm khoảng 5 lần.

**Áp cho một shot.** Chọn một shot trên timeline. Inspector có mục **Phong cách code**: phong cách đang dùng của dự án và của shot, và **Áp phong cách cho shot này**.

- Lớp canvas cho một shot: scene chỉ vẽ khi `t` nằm trong `win["<shot>"]`, ngoài khoảng đó trả canvas trống.
- Theo ngữ pháp cho một shot: đạo diễn chỉ sửa shot đó, giữ các shot khác.

Studio ghi lựa chọn vào `<dự án>/.opus/lemo.json`. File có `project` (phong cách của cả dự án), `shots.<id>` (phong cách từng shot) và `layer` (lớp canvas đang có). Provider không đọc file này, nên xoá nó không làm hỏng dự án.

Mọi yêu cầu gửi đạo diễn đều kèm cùng bốn luật:

- chủ đề, lời và nhịp là của dự án; chỉ học ngữ pháp hình ảnh, không chép câu chuyện, cảnh hay nhân vật của phim mẫu;
- chữ tiếng Việt nằm ở lớp DOM, dùng Be Vietnam Pro, qua cổng viet-pro;
- hình là hàm thuần của `t`;
- xong thì chạy `npm run check`.

## Phong cách riêng

Mục **Phong cách riêng** ở cuối tab đi theo quy trình `MY-STYLES.md` của lemo-opuscar:

1. Chọn phong cách gốc, hoặc "Từ trang trắng". Ghi tên và mô tả nếu muốn, rồi bấm **Nhờ đạo diễn tạo**.
2. Đạo diễn hỏi bạn từng câu bằng thẻ hỏi của Studio. Nó viết `style.json`, `STYLE.md` và `CHANGES.md` trong `<dự án>/lemo-style/`, chụp một khung phong cách PNG vào đó, và có thể thêm `DEMO.md`, `demo/`, `test.mp4`. Đạo diễn không tự chép ra ngoài dự án, cũng không đổi tên hay định dạng file.
3. Mục này hiện khung phong cách và bảng `CHANGES.md`. Ưng thì bấm **Giữ phong cách**. Chỉ cú bấm này ghi ra ngoài dự án.

**Giữ phong cách** chép bản nháp vào `~/lemo-my-styles/<slug>/` (đổi chỗ bằng `LEMO_MY_STYLES`) và thêm một dòng vào `~/lemo-my-styles/README.md`. Đây đúng là thư mục và định dạng mà plugin lemo-opuscar dùng, nên hai bên thấy phong cách của nhau. Studio kiểm mấy điều trước khi chép:

- slug khớp `^[a-z0-9][a-z0-9-]{1,40}$`;
- slug không trùng phong cách nào của thư viện hay phong cách riêng đã có;
- chỉ chép `style.json`, `STYLE.md`, `CHANGES.md`, `DEMO.md`, `styleframe*.jpg`, `test.mp4`, `test.jpg` và `demo/` (bỏ symlink, file chấm, `node_modules`, `renders`, `out`);
- tổng không quá 300 MB.

Khung phong cách là `styleframe.jpg` nếu có; không thì `styleframe.png`, ảnh `frame-00-*.png` của `hyperframes snapshot`, hoặc ảnh PNG duy nhất trong `lemo-style/` (nhiều ảnh thì lấy ảnh mới nhất và báo). Studio đổi ảnh PNG thành `styleframe.jpg` bằng ffmpeg, đúng tên mà `MY-STYLES.md` dùng; máy không có ffmpeg thì giữ `styleframe.png`.

Studio chép vào một thư mục tạm cạnh đích rồi đổi tên, nên không bao giờ ghi vào một thư mục đã có. Phong cách riêng hiện ở đầu tab, mục **Của bạn**, và áp theo ngữ pháp. Studio không tự xoá thứ gì trong `~/lemo-my-styles/`.

## Cho đạo diễn và client MCP

Hai tool chỉ đọc nằm trong [`lib/tools/lemo.mjs`](../lib/tools/lemo.mjs):

- `lemo_styles` tìm phong cách, có dấu hay không dấu đều được;
- `lemo_style_guide` trả đường tới `STYLE.md` và 8 000 ký tự đầu.

## HTTP

| Route | Việc |
|---|---|
| `GET /api/lemo/styles?q=&group=&name=` | Thư viện và phong cách riêng, lọc theo từ khoá và nhóm; `project` là trạng thái của dự án `name` |
| `GET /api/lemo/frame/<slug>.jpg`, `/api/lemo/frame/mine/<slug>.jpg` | Ảnh khung. Slug sai mẫu hoặc đường ra ngoài thư mục thì 403, không có thì 404, không phải JPEG thì 415 |
| `GET /api/lemo/guide?slug=&source=` | `STYLE.md` dạng chữ thuần |
| `GET /api/lemo/project?name=` | `.opus/lemo.json`, file của lớp canvas, scene, khung dọc hay ngang, bản nháp trong `lemo-style/` |
| `POST /api/lemo/fetch` | Tải thư viện (job `lemo-fetch`) |
| `POST /api/lemo/apply {name, slug, mode, shot?, source?, replace?}` | `mode` là `layer`, `grammar` hoặc `markers`. Mỗi dự án chỉ một lần áp một lúc (409 `busy`) |
| `POST /api/lemo/draft {name, base?, source?, title?, description?}` | Nhờ đạo diễn tạo phong cách riêng |
| `POST /api/lemo/keep {name}` | Giữ bản nháp `lemo-style/` |

Các route GET và `keep` chạy được khi chưa cài provider. Khi đó không có phong cách nào là lớp canvas.

## Đổi commit ghim

1. Đọc thay đổi của lemo-opuscar từ commit đang ghim tới commit mới, nhất là `style.json`, `STYLE.md` và `MY-STYLES.md`.
2. Sửa `sha` và `slugs` trong `lib/lemo/pin.json`. Phong cách mới cần tên trong `lib/lemo/vi.json`; nhóm mới cần tên trong `groups`. Test `tests/lemo-catalog.test.mjs` báo nếu thiếu.
3. Chạy `npm test`, rồi bấm **Tải thư viện** trong Studio. Commit mới tải vào một thư mục mới; thư mục cũ xoá tay được.

Danh mục lớp canvas thuộc provider (`lemo list --json`), không ghim ở đây.

## Ghi công và giấy phép

- Mã và tài liệu của lemo-opuscar: MIT.
- Ảnh khung và phim mẫu: CC BY 4.0, của **LemoLab**. Chân tab ghi công kèm link repo.
- Phim bạn làm bằng các phong cách này là của bạn.
- Thư viện tải về là dữ liệu của bên thứ ba. Studio không chạy, không import file nào trong đó, và chỉ hiện `STYLE.md` dạng chữ thuần.
