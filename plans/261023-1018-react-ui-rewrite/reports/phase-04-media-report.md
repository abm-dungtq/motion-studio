# Vùng media: tab Chất liệu và B-roll trên React

PR này đưa tab "Chất liệu" và phần B-roll sang React. Đích là nhánh `feat/react-ui`. Mọi dòng nhóm `4b` trong `parity-checklist.md` đều đã thử và ghi `có`, chi tiết ở `reports/parity-media.md`.

## Việc đã làm

**Tab `media`** (`ui/src/panels/media/`): rail nhóm `assets`, order 10, icon `LayoutGrid`, chữ "Chất liệu", lead chép từ `public/panels.js:15`. Tab có ba mục theo đúng thứ tự cũ.

- "Footage đã thêm" (`Registered.tsx`): mỗi dòng kéo được qua `setMediaDrag` với `{ rel, kind, path }` và `text/plain`.
- "Chọn file trên máy" (`Browser.tsx`): duyệt từng cấp qua `/api/media/browse`. Lần đầu mở `~/Movies`. Có nút Lên và ô đường dẫn (Enter để mở). Thư mục đang xem được nhớ khi đổi tab. Nút "Thêm" gọi `mediaRegister`, có ba trạng thái Thêm, Đang thêm… và Đã thêm, với toast cũ.
- "File trong assets/" (`Assets.tsx`): lưới ảnh, video và tên file, bỏ `.json`. Khi rỗng thì có nút "Giao việc cho AI".
- Chưa có manifest thì hiện `NeedManifest`.

**B-roll** (`ui/src/ext/broll/`):

- `Search.tsx`: section `media/broll-search`, order 40, tiêu đề "Tìm trong footage". Tìm 250 ms sau khi ngừng gõ; đổi cỡ cảnh thì tìm ngay. Kết quả cũ giữ nguyên tới khi có câu trả lời mới. Thẻ kéo được với `{ rel: null, kind: "video", path, sha256, start, end }` (`HitCard.tsx`).
- `Analyse.tsx`: chi tiết "Phân tích footage" mở sẵn, có chọn phạm vi và dòng kế hoạch. Nút chú thích chỉ bật khi số lượt là chính xác, giữ đủ bốn nhánh của `paintPlan`. Job được theo bằng `refetchInterval` 1,5 s và dừng khi job xong; xong thì tải lại kế hoạch và kết quả tìm.
- `Suggest.tsx`: inspector `broll-suggest` cho shot, order 30, lấy top 5. "Đặt vào shot" gọi `brollApply` với timeout 11 phút. Ô "Nhờ đạo diễn đặt clip vào cảnh" gọi `actions.direct` với đúng câu cũ. Gợi ý được tải một lần cho mỗi (dự án, shot, phiên bản).
- `store.ts`: lưu chữ đang gõ, chữ đã tìm, cỡ cảnh, phạm vi và ô nhờ đạo diễn suốt đời trang, như object `st` cũ.
- `fixtures.ts`: chỉ dùng cho test, là dữ liệu theo đúng hình dạng phản hồi của `routes/broll.mjs`.

Không gọi `fetch` hay `EventSource` trong vùng này. Không thêm dependency. Màu đều lấy từ token.

## Test

- `npm test` ở gốc repo cho `ℹ pass 315`, `ℹ fail 0`. Vitest báo `Test Files 19 passed`, `Tests 85 passed`; `tsc --noEmit` sạch.
- Riêng vùng này, `npx vitest run src/panels/media src/ext/broll` cho 4 file và 28 test. Phần đã thử: thứ tự ba tiêu đề; dữ liệu kéo của dòng footage (`text/x-ms-media` cùng `text/plain`); nút Thêm tắt ở dự án chỉ xem; ba toast của Thêm; lần đầu mở Movies và nhớ thư mục; thư mục rỗng và đường dẫn hỏng; lưới assets bỏ `.json`; kéo kết quả tìm có `sha256`, `start`, `end`; debounce 250 ms; nút chú thích tắt khi còn file chưa phân tích offline, cùng ba nhánh còn lại; theo job tới khi xong; "Đặt vào shot" gửi id shot và đoạn `use` rồi nhờ đạo diễn; các trạng thái lỗi và rỗng.
- Không chạy captioning thật và không tốn lượt vision: `brollIndex` và `brollApply` được mock bằng `vi.mock`.

## Thử trực tiếp và ảnh chụp

Đã thử trên cổng 4413, gốc `/tmp/ms-react-root-4413`, với hai server PID 52809 và 94018; cả hai đã dừng và `lsof` trên cổng 4413 trống. Ảnh chụp (`shoot.mjs` in `ok 4`):

- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/media/1440/media.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/media/1440/media-readonly.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/media/2560/media.png`
- `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/media/2560/media-readonly.png`

## Chỗ khác bản cũ và việc cho phase 5

1. **Nút Thêm ở dự án chỉ xem bị tắt**, theo bước 4b.1.5 và test bắt buộc của phase. Bản cũ không tắt nút này (`public/panels.js:155-157`), và server vẫn nhận `/api/media/register` cho dự án chỉ xem. Muốn giữ đúng bản cũ thì bỏ `!editable` trong `Browser.tsx`.
2. **"Gợi ý B-roll" chưa bấm được trên UI**, vì chọn shot cần timeline của vùng 4a. Phần này đã thử bằng test component, dùng hình dạng phản hồi thật lấy từ 4413. Phase 5 cần bấm lại INSP-17 sau khi ghép timeline.
3. **Panel trái tràn ngang**: `ScrollArea` của shell bọc nội dung trong `display: table; min-width: 100%` (Radix), nên tên file dài làm cả panel rộng quá mép. Vùng này tự chặn bằng `[contain:inline-size]` ở các mục của mình. Tab của vùng khác có thể gặp lỗi tương tự; nên sửa gốc ở `ui/src/shell/LeftPanel.tsx` hoặc `components/ui/scroll-area.tsx`, ví dụ thêm `[&>div]:!block` cho viewport.
4. Hàm `params()` của `queries.ts` bỏ tham số `kind=` khi rỗng. Server đọc `c.q("kind") || null` (`routes/broll.mjs:60`), nên kết quả không đổi.

## Ghi chú tài liệu (cho phase 5)

- `docs/extensions.md` mục "Kéo footage" (`:90-99`): hằng `MEDIA_DRAG` nay nằm ở `ui/src/core/dnd.ts`, kèm `setMediaDrag`, `hasMediaDrag` và `readMediaDrag`. Ví dụ `import { MEDIA_DRAG } from "/panels.js"` cần đổi thành import từ `@/core/dnd.ts`. Kết quả tìm B-roll kéo thêm `sha256`, `start`, `end`.
- `docs/broll-index.md` không nhắc file nào trong `public/`, nên không cần sửa.

## Yêu cầu đổi hợp đồng

Không có.
