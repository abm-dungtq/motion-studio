# Vùng lemo: tab Phong cách bằng React

Tab `styles-code` (chữ "Phong cách", nhóm `assets`, `order 20`, icon `Palette`) giờ là React, chép từ `public/ext-lemo.js`, `lemo-gallery.js` và `lemo-mystyle.js`. Chữ hiển thị, câu confirm, toast và trạng thái rỗng giữ nguyên văn. Mọi dòng nhóm `4g` của checklist đã thử trực tiếp trên cổng 4418 và đạt (`reports/parity-lemo.md`).

## Việc đã làm

File mới, tất cả trong `ui/src/ext/lemo/`:

- `index.ts`: `register(studio)` đăng ký tab `styles-code`, mục `lemo-mine` (`order 10`) của tab, và mục inspector cho kind `shot` (`order 50`). Lead giữ nguyên câu của `ext-lemo.js:16`.
- `store.ts`: state dùng chung của tab, mục riêng và mục shot (chữ tìm sau debounce 200 ms, nhóm lọc, `busy`, `fetching`, STYLE.md đang xem), kiểu dữ liệu của `GET /api/lemo/styles`, và ba lệnh `fetchLibrary`, `applyStyle`, `showGuide`. Cả ba gọi qua `ui/src/api/queries.ts`, không gọi `fetch` trực tiếp. Khoá query có tên dự án, nên đổi dự án là tải lại danh sách (thay `ctx.on("project")`).
- `Gallery.tsx`: ô tìm, chọn nhóm, đếm, cảnh báo khi đọc thư viện, lưới thẻ có tiêu đề "Của bạn" và "Thư viện", trạng thái chưa tải thư viện, lỗi kèm "Thử lại", dòng ghi công LemoLab, và hộp thoại STYLE.md (Dialog của shadcn).
- `StyleCard.tsx`: một thẻ phong cách.
- `MyStyle.tsx`: "Phong cách riêng": nhờ đạo diễn phác thảo, xem bản nháp (khung, `CHANGES.md`), và "Giữ phong cách".
- `ShotStyle.tsx`: mục "Phong cách code" trong inspector shot.
- `fixtures.ts` và ba file test `Gallery.test.tsx`, `MyStyle.test.tsx`, `ShotStyle.test.tsx`.

An toàn:

- `STYLE.md` và `CHANGES.md` là chữ của bên thứ ba. Cả hai chỉ hiện dưới dạng chữ trong `pre` của React. Vùng không có `dangerouslySetInnerHTML`, và có test cho trường hợp chứa `<script>`.
- Link phim mẫu và link ghi công chỉ hiện khi URL bắt đầu bằng `https://`.
- Ghi công: thẻ và dòng cuối tab ghi "Ảnh và phim mẫu: LemoLab, CC BY 4.0, github.com/lemomo-ai/lemo-opuscar. Mã và tài liệu: MIT.". Đầu mỗi file có comment nguồn và giấy phép.
- Không file nào của thư viện lemo tải về bị chạy hay import.

## Test

- `npx vitest run src/ext/lemo`: 3 file, 21 test đạt. Có đủ các trường hợp phase yêu cầu:
  - tìm theo chữ lọc đúng thẻ, giữ focus, chỉ gọi một lần sau debounce;
  - lọc theo nhóm lọc đúng thẻ;
  - có phong cách riêng thì "Của bạn" đứng trước "Thư viện";
  - `<script>x</script>` trong STYLE.md hiện nguyên văn và không thêm phần tử `script`;
  - "Giữ phong cách" gọi `lemoKeep` đúng một lần;
  - mục "Phong cách code" hiện cho kind `shot` và không hiện cho `line`.
- Test thêm: áp có Huỷ, áp lớp canvas gặp 409 thì thay lớp cũ, nút tải thư viện hỏi lại tới khi có, lỗi kèm "Thử lại", và nhờ đạo diễn tạo phong cách riêng.
- Hàm ghi được mock bằng `vi.mock`, nên test không ghi gì ra đĩa. Đường dẫn phong cách riêng trong test là `/tmp/ms-react-lemo-test/my-styles`.
- `npm test` ở gốc repo (sau khi merge `origin/feat/react-ui` mới nhất): `ℹ pass 315`, `ℹ fail 0`. Vitest: 22 file, 94 test đạt. `tsc --noEmit` sạch.

## Thử trực tiếp

- Server thử: `node ui/scripts/smoke-server.mjs <worktree> 4418 /tmp/ms-react-root-4418`, PID 39442, đã dừng. `lsof` cổng 4418 rỗng.
- Server chạy với `LEMO_MY_STYLES=/tmp/ms-react-root-4418/my-styles`. Nhờ vậy "Giữ phong cách" được bấm thật mà chỉ ghi vào `/tmp`; `~/lemo-my-styles` không bị tạo.
- Bản nháp thử đặt tay trong `lemo-style/` của gốc thử. "Tải thư viện" được bấm thật, nhưng thư viện đã có trên máy nên server trả `fetched: true` ngay, không tải gì.
- Ảnh chụp (`shoot.mjs` in `ok 4`):
  - `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/lemo/1440/styles.png`
  - `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/lemo/1440/inspector-lemo.png`
  - `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/lemo/2560/styles.png`
  - `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/lemo/2560/inspector-lemo.png`
- File view: `/tmp/ms-react-views-lemo.json`. View `inspector-lemo` mở tab Shot ở cột phải rồi mở mục "Áp phong cách cho shot này". Nhánh này chưa có timeline (vùng 4a), nên chưa bấm được khối shot. Shot đang chọn là s1, do `syncPick` tự chọn shot đầu khi dự án nạp xong.

## Khác với UI cũ (nhỏ, có chủ ý)

- URL tìm bỏ `group=` khi rỗng, vì `params()` của `api/queries.ts` (hợp đồng) bỏ giá trị rỗng. Server đọc như cũ.
- Ô nhập tên và ô mô tả ở "Phong cách riêng" có thêm `aria-label` cho trình đọc màn hình. Chữ hiển thị không đổi.

## Yêu cầu đổi hợp đồng

Không có.

## Ghi chú tài liệu (cho phase 5)

- `docs/lemo-styles.md` không nhắc `public/lemo-*.js`, nên không cần sửa đường dẫn.
- Dòng 1 và dòng 3 gọi tab là **Phong cách code**. Tên mới trên rail là **Phong cách**, nên sửa chữ này. Mục inspector vẫn tên "Phong cách code", nên dòng 36 giữ nguyên.
- Câu "Chưa có phong cách nào: mở tab Phong cách code và tải thư viện." trong `ShotStyle.tsx` giữ nguyên văn từ code cũ, nên vẫn nhắc tên tab cũ. Phase 5 quyết có đổi thành "tab Phong cách" không.

## Việc còn lại cho phase 5

- Khi timeline (4a) đã vào: bấm khối shot s2, xem mục "Phong cách code" của shot đó (INSP-19), và chụp lại view `inspector-lemo` bằng thao tác bấm khối shot.
