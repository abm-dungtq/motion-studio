# Vùng anime: tab Anime viết lại bằng React

Tab `anime` (nhóm `assets`, `order 30`, icon `Sparkles`, chữ "Anime") đã chạy trên React, thay `public/ext-anime.js`, `anime-board.js`, `anime-chars.js` và `anime-manifest.js`. Tab mở được với dự án chưa có `project.json`, như bản cũ. Mọi chữ hiển thị, câu toast và câu xác nhận chép nguyên văn từ bốn file cũ.

## Việc đã làm

Mọi file nằm trong `ui/src/ext/anime/`:

| File | Nội dung |
|---|---|
| `index.ts` | `register(studio)`: `registerTab` với lead cũ của `ext-anime.js:81` |
| `AnimeTab.tsx` | Ba tab con (`Tabs` của shadcn): Shot board, Nhân vật, Hoạt hình. Mở tab thì tải cả board, chars và manifest (như `load()` cũ). Chưa có dự án thì hiện `Empty` với chữ cũ. Mỗi tab con nằm trong một `ErrorBoundary` hiện "Lỗi giao diện: …". Báo kết thúc job (toast, tải lại) chạy ở đây, nên không phụ thuộc tab con đang mở |
| `Board.tsx` | Bốn cột theo giai đoạn và thẻ shot. Chọn shot phát `bus.emit("anime:shot", s)`; khi dự án có manifest thì gọi `actions.pick("shot", id)` và `actions.transport.seek(start)`. Có form "Sinh biến thể tư thế" |
| `Chars.tsx` | Thư viện nhân vật: sheet, màu khoá, bảng màu, Lưu vào thư viện, Sinh sheet, Sửa, Bỏ, form Thêm/Sửa nhân vật |
| `Manifest.tsx` | Sáu form (lipsync, blink, wind, keys, impacts, offsets) và ô JSON thô. "Lưu và build" gửi `base_sha`: 409 báo câu cũ và giữ nháp; 428 mở hộp xác nhận rồi gửi lại với `confirm: true`. Có khối build kèm dòng WARN, Build lại, Bỏ bản nháp |
| `store.ts` | Store Zustand của vùng: tab con, shot đang chọn, form biến thể, form nhân vật, mô tả sheet, nháp manifest, các job đang theo. Đổi dự án thì xoá hết trừ tab con (như `sync()` cũ); đổi tab rail hay query tải lại thì nháp vẫn còn |
| `useJob.ts` | `useFollow` theo job qua `useAnimeJob` với `refetchInterval` 1200 ms, dừng khi job xong hoặc sau `JOB_MAX_MS` (10 phút). `useJobView` đọc cùng cache để hiện log, không poll |
| `confirm.tsx` | Mọi `confirm()` cũ (tốn quota, bỏ nhân vật, xoá stack, 428) thành một `Dialog` với "Huỷ" / "Đồng ý" |
| `parts.tsx` | Field, Tag, Log, select gốc, và ô nhập chỉ ghi khi có sự kiện change (blur hoặc Enter), như `onchange` cũ |
| `types.ts` | Kiểu dữ liệu của `/api/anime/*`, thu hẹp từ `unknown` trong `queries.ts` |

Màu khoá mặc định `#0047FF` ghi `token-exempt: màu khoá chroma của sheet nhân vật`. Ô màu của nhân vật lấy màu từ dữ liệu qua `style`, không phải mã màu trong nguồn.

## Test

- Vitest `src/ext/anime`: 2 file, **23 test**, tất cả đạt. `AnimeTab.test.tsx` có 17 test, `Chars.test.tsx` có 6. Các test phủ:
  - ba tab con đúng chữ;
  - dự án chưa có `project.json` vẫn hiện bảng shot, không hiện `NeedManifest`;
  - chọn shot phát `anime:shot`, gọi `actions.pick("shot", id)` và tua khi có manifest, không đụng timeline khi không có;
  - lưu nhận 409: câu báo hiện, nháp còn;
  - lưu nhận 428: hộp xác nhận mở, Đồng ý thì gửi lại với `confirm: true`, Huỷ thì không gửi;
  - chữ đang gõ trong form nhân vật còn sau khi query `chars` tải lại;
  - Sinh biến thể và Sinh sheet đều mock bằng `vi.mock` (không sinh ảnh thật);
  - ô JSON hỏng chặn lưu; sửa ô về chữ ban đầu thì hết lỗi (lỗi hồi quy tìm ra khi thử trực tiếp, đã sửa);
  - đổi dự án bỏ nháp, giữ tab con.
- `npm test` ở gốc sau khi merge `origin/feat/react-ui`: `ℹ pass 315`, `ℹ fail 0`. Vitest: 28 file, 145 test, tất cả đạt. `tsc --noEmit` sạch.
- `node ui/scripts/check-ownership.mjs anime`: `ok anime`.
- Grep `fetch\(|new EventSource` trong `panels ext timeline`: 0. Lệnh này khớp cả `q.refetch(`, nên vùng tải lại qua `invalidateQueries` (hàm `reload` trong `store.ts`, đúng `A.load()` cũ).

## Thử trực tiếp trên 4417

Đủ **41/41** dòng nhóm `4f` (TAB-anime-01…26, API-05…11, STATE-01, 02, 06, 07, 10, 11, 12, 13), xem `reports/parity-anime.md`. Có hai lượt chạy, mỗi lượt trên gốc thử dựng lại sạch: một trên nhánh vùng, một sau khi merge `origin/feat/react-ui`. Cả hai lượt không có lỗi trang. Server đã dừng (PID 5447, 12687), `lsof` cổng 4417 rỗng.

Ảnh chụp (`shoot.mjs` in `ok 4`):

- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/anime/1440/anime-board.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/anime/1440/anime-noproject.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/anime/2560/anime-board.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/anime/2560/anime-noproject.png`

## Khác bản cũ (cố ý, nhỏ)

- `confirm()` của trình duyệt thành `Dialog` của shadcn (tiêu đề "Xác nhận", nút "Huỷ" / "Đồng ý"). Câu hỏi giữ nguyên văn.
- Mở trang chưa có dự án thì tab hiện ngay "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng.". Bản cũ để trống ở lần mở đầu và chỉ hiện câu này sau khi đóng dự án.
- Mô tả "Sinh sheet 4 góc" của từng nhân vật nằm trong store, nên còn sau khi danh sách tải lại. Bản cũ mất mô tả mỗi lần vẽ lại.
- Job kết thúc khi tab Anime đang đóng: toast và tải lại chạy khi mở lại tab (lúc đó hook đọc thấy job đã xong). Bản cũ chạy ngay vì timer nằm ngoài DOM.

## Yêu cầu đổi hợp đồng

Không có.

## Ghi chú tài liệu (cho phase 5)

- `docs/anime-motion-comic.md` chỉ tả hành vi người dùng thấy (mục Nhân vật, Shot board, Hoạt hình, nút "Sinh sheet", "Sinh biến thể", "Lưu và build", "Bật hệ lật ảnh"). Phần này vẫn đúng với UI mới, và file không nhắc `public/ext-anime.js` hay các file `anime-*.js`. Có thể thêm một câu: tab nằm ở nhóm Chất liệu của rail trái, và các câu hỏi xác nhận nay là hộp thoại.
- `docs/extensions.md` không có ví dụ nào nhắc `ext-anime.js`. Nếu phase 5 viết lại tài liệu extension theo `registerTab`, thì `ui/src/ext/anime/index.ts` là một ví dụ ngắn dùng được (một tab, có lead, icon Lucide).
