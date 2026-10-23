# Giao diện React cho Motion Studio, bố cục kiểu NLE

PR này thay giao diện JavaScript thuần trong `public/` bằng giao diện React + TypeScript + Tailwind + shadcn/ui (Vite) ở `ui/`, theme tối kiểu NLE. API server không đổi. `public/` bị xoá trong cùng PR.

## Tóm tắt

- Bố cục mới:
  - thanh trên có chọn dự án, Dự án mới, chip agent, phiên bản, hoàn tác và làm lại, cùng menu **Xuất bản**;
  - rail icon chia nhóm: Chất liệu, Phong cách, Anime, Chuyển cảnh & hiệu ứng | Lời & giọng, Nhạc & âm thanh | Thư viện mẫu;
  - cột phải có hai tab, Đạo diễn và Shot. Bấm shot là cột phải tự sang tab Shot;
  - panel trái và cột phải thu gọn và kéo giãn được, cỡ được giữ sau khi tải lại;
  - sân khấu nền đen.
- Tab mới "Chuyển cảnh & hiệu ứng" (`fx`): gồm thư viện chuyển cảnh và mục Sửa clip, trước đây nằm trong inspector và tab Footage.
- Bảng đối chiếu tính năng: **442/442** dòng "có" khi thử trực tiếp. Không còn dòng nào "không".
- Timeline viết lại bằng React, giữ logic cũ chuyển sang `.ts`. Kéo playhead trên dự án 60 shot đạt **58,7 fps** (ngưỡng 50).
- Extension viết theo API mới (`registerTab`, `registerSection`, `registerInspectorSection`, `registerAgentRows`, `registerTimelineDecorator`). Hướng dẫn ở `docs/extensions.md`.
- Giao diện được build lúc `npm run setup`. Lúc `start`, nó được build lại nếu mã nguồn mới hơn bản build. Bản build không được commit.

## Breaking

- Cần **Node.js 22.18** trở lên, vì server chạy thẳng file `.ts` và Vite 8 đòi bản này.
- File `public/ext-*.js` không còn được nạp. `GET /api/extensions` vẫn còn và luôn trả `{ scripts: [], styles: [] }`. Extension giao diện giờ là thư mục `ui/src/ext/<tên>/index.ts`.
- Lần cài đầu cần mạng để `npm ci` trong `ui/`.

## Clone sạch, `setup`, `start`

- `git clone --branch feat/react-ui … /tmp/ms-clean-clone`, rồi `npm run setup </dev/null` → `exit 0`. Output gồm "giao diện: cài thư viện…", "build lần đầu…", "build xong trong 1.5 s". Có `ui/dist/index.html`.
- `touch ui/src/main.tsx`, rồi `start` (4317 đang có Studio của người dùng nên lệnh dừng ở bước kiểm cổng) → "giao diện: build lại (nguồn mới hơn bản build)…", "build xong trong 0.4 s", `exit 3`. Bản build mới hơn nguồn. `git status --porcelain` rỗng.
- Smoke server của bản clone trên 4410: trang chủ có `content="smoke-4410"` và có link `/assets/`. Đã dừng server, 4410 trống.

## Khác với kế hoạch

- Tám PR vùng và PR xoá `public/` được squash-merge thay vì merge commit. GitHub tự thêm dòng `Co-authored-by: DungTQ` vào các commit squash; đó là tài khoản của người dùng.
- `routes/extensions.mjs`: ngoài comment, còn bỏ đường mặc định `../public/` của `listExtensions`. Route trả kết quả như trước.
- Ảnh 2560 lưu JPEG chất lượng 60 để tổng ảnh dưới 8 MB.
- `ui/vite.config.ts` tắt `fsModuleCache` của vitest. Cache này giữ bản cũ của `import.meta.glob`, nên thư mục panel hay extension mới không được thấy.

## Hoàn tác

- Trước khi merge: đóng PR, `main` không đổi.
- Sau khi merge: `git revert -m 1 <sha merge>` trên `main` (hoặc revert commit squash), rồi khởi động lại Studio. Bản cũ không cần build.
- Dữ liệu người dùng không đổi dạng: cùng API, cùng khoá `localStorage` `studio.tab`, cùng cache IndexedDB.

---

## Chi tiết kiểm tra

Bản tích hợp `feat/react-ui` sau khi tám PR vùng (#11–#18) và PR xoá `public/` (#19) đã squash-merge.

## Test

- `npm test` sau khi rebase lên #19: node `ℹ tests 324`, `ℹ pass 323`, `ℹ fail 0`, `ℹ skipped 1`; vitest `39 file, 232 test` đạt; `check-ownership.test.mjs` `pass 6`, `fail 0`. Baseline task 2.0 là `pass 299`.
- `ui/src/integration.test.tsx` (6 test) chạy bộ nạp thật (`import.meta.glob` của `panels/*` và `ext/*`), chỉ giả `fetch`. Nó kiểm:
  - 7 tab trên rail theo đúng thứ tự, có 2 đường kẻ nhóm;
  - không có toast "Extension lỗi";
  - các section `media`, `export` và `director`;
  - thứ tự inspector shot: 0, 30, 40, 50, 60, sau khi bấm khối shot thật trên timeline;
  - hai dòng agent;
  - cả tám khe có nội dung.
- Parity: `node ui/scripts/fill-parity.mjs plans/261023-1018-react-ui-rewrite` in `có 442/442, không 0`. Lệnh không in `THIẾU` hay `TRÙNG`.

## fps trên bản tích hợp

`node ui/scripts/perf-playhead.mjs --base http://127.0.0.1:4410 --name perf-60 --runs 3 --min 50` thoát 0 và in `ok`. Đã chạy hai lần:

```text
fps=58.7 runs=58.5,58.7,58.8
fps=58.6 runs=58.9,58.6,58.5
```

## Ảnh 1440 và 2560

Lệnh `node ui/scripts/shoot.mjs --base http://127.0.0.1:4410 --views ui/scripts/views-new.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/final --widths 1440,2560` thoát 0 và in `ok 28`. Gốc thử được dựng lại sạch, rồi seed thẻ chọn hướng.

Selector `ready` của các view `thuy-mau-demo` có thêm `body:has([data-to])`. `/api/gates` cần khoảng 1,7 s mới trả lời, nên nếu không đợi thì ảnh chụp trước khi chip cổng hiện. Tab `voice` và `library` không có `section`, nên selector `ready` của hai tab này có thêm ô nhập câu và thẻ mẫu.

JPEG nằm ở `screens/`. Ảnh 1440 lưu ở chất lượng 75. Nếu ảnh 2560 cũng lưu ở 75 thì tổng 28 ảnh là 9,6 MB, vượt giới hạn 8 MB, nên ảnh 2560 lưu ở chất lượng 60. Tổng hiện là 7 968 KB. PNG gốc nằm ở `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/final/{1440,2560}/`.

| View | 1440 | 2560 |
|---|---|---|
| `tab-media` | [1440](../screens/1440-tab-media.jpg) | [2560](../screens/2560-tab-media.jpg) |
| `tab-styles-code` | [1440](../screens/1440-tab-styles-code.jpg) | [2560](../screens/2560-tab-styles-code.jpg) |
| `tab-anime` | [1440](../screens/1440-tab-anime.jpg) | [2560](../screens/2560-tab-anime.jpg) |
| `tab-fx` | [1440](../screens/1440-tab-fx.jpg) | [2560](../screens/2560-tab-fx.jpg) |
| `tab-voice` | [1440](../screens/1440-tab-voice.jpg) | [2560](../screens/2560-tab-voice.jpg) |
| `tab-music` | [1440](../screens/1440-tab-music.jpg) | [2560](../screens/2560-tab-music.jpg) |
| `tab-library` | [1440](../screens/1440-tab-library.jpg) | [2560](../screens/2560-tab-library.jpg) |
| `director` | [1440](../screens/1440-director.jpg) | [2560](../screens/2560-director.jpg) |
| `export` | [1440](../screens/1440-export.jpg) | [2560](../screens/2560-export.jpg) |
| `new-project` | [1440](../screens/1440-new-project.jpg) | [2560](../screens/2560-new-project.jpg) |
| `agent` | [1440](../screens/1440-agent.jpg) | [2560](../screens/2560-agent.jpg) |
| `inspector-shot` | [1440](../screens/1440-inspector-shot.jpg) | [2560](../screens/2560-inspector-shot.jpg) |
| `readonly` | [1440](../screens/1440-readonly.jpg) | [2560](../screens/2560-readonly.jpg) |
| `gate-card` | [1440](../screens/1440-gate-card.jpg) | [2560](../screens/2560-gate-card.jpg) |

## Thử liên vùng trên 4410

Server: `ui/scripts/smoke-server.mjs`. Gốc thử `/tmp/ms-react-root-4410` dựng lại bằng `make-test-root.mjs`. Trình duyệt là Chrome (`playwright-core`), cửa sổ 1440×900. Script thử nằm ở `/tmp/ms-react-walk-4410/walk.mjs`, kết quả thô ở `results.json` cùng thư mục.

Gốc thử được chuẩn bị bằng bốn bước, tất cả chỉ ghi trong `/tmp/ms-react-root-4410`:

- `beat-grid.mjs --min-bpm 120 --write` cho `thuy-mau-demo`, để có lưới phách kéo được;
- đăng ký `pitch/1.mp4` của workspace bằng `POST /api/media/register`, file được chép vào `footage/raw/`;
- tạo dự án `thu-giong-rong` bằng hộp thoại Dự án mới, và bản sao `thu-khong-shot` có `project.json` không có shot nào;
- đổi mtime của `PLAN.md` và `demo/animatic.mp4` trong bản sao, để `/api/gates` trả PASS. Lệnh copy làm mất thứ tự thời gian của các file.

| Mục | Kết quả | Bằng chứng |
|---|---|---|
| 1. Kéo footage từ tab Chất liệu thả vào làn B-roll | có | Dòng `1.mp4` (`[data-media-row]`) thả lên ô B-roll của s4. Một `POST /api/timeline/asset`, `/api/log` từ 41 lên 42 với op `set_shot s4 assets ["assets/footage/1-3.mp4"]`. Ô hiện chip `1-3.mp4`. Toast "Đã thêm 1-3.mp4 vào s4 (đã chép vào assets/footage)" |
| 2. Kéo kết quả "Tìm trong footage" thả vào làn B-roll | có | Gõ "biển", thả thẻ đầu lên ô B-roll của s3. UI gửi `POST /api/timeline/asset {shot:"s3", base:5, path:"/Volumes/2/Edit-Video/footage/raw/ref-anime-samurai-duel.mp4"}`. Server trả 403 "chỉ thêm được file trong dự án, footage/ hoặc shared-assets/ của workspace" và UI hiện đúng câu đó. Chỉ mục B-roll dùng chung chỉ có đường dẫn của workspace thật, nằm ngoài gốc thử; đây là luật của server, bản cũ cũng vậy. Đường thả thành công đi qua cùng `dropOnShot` đã thử ở mục 1 |
| 3. Bấm khối shot: cột phải sang tab Shot, các mục đúng thứ tự | có | Tab trước khi bấm là Đạo diễn, sau khi bấm là Shot. Các mục theo thứ tự `inspector/shot`, `broll-suggest`, `fx`, `lemo`, `receipts`; khối s1 có lớp `sel` |
| 4. Menu chuột phải "Nhờ đạo diễn sửa shot này" | có | Tab Shot mở, tiêu đề "SHOT 2 · 6.5s–12.5s". Focus nằm ở `TEXTAREA` có `aria-label="Chuyển động"` |
| 5. Kéo mốc phách: dòng nhắc duyệt lại, chip cổng | có | Kéo vạch phách +12 px. UI gửi `POST /api/timing/beat {beat0: 0.19}`, rồi hiện toast "Đã dời lưới phách, beat0 0.190s; đang dựng lại TIMING…" và "Đã dựng lại TIMING. Animatic cần duyệt lại". Inspector hiện "Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất". `/api/gates` được gọi lại 589 ms sau khi thả. Chip "Cần duyệt lại animatic" giữ nguyên, vì cổng của bản sao đã ở trạng thái đó từ trước |
| 6. Seed thẻ animatic: chấm báo, chip mở tab Đạo diễn | có | Chạy `seed-gate-cards.mjs … animatic`. Tab Đạo diễn có chấm `aria-label="Có thẻ đang chờ bạn"`. Chip "Cần duyệt lại animatic" chuyển cột phải từ Shot sang Đạo diễn; thẻ "Duyệt animatic?" hiện |
| 7. "Giao việc cho AI" ở trạng thái rỗng của tab Lời & giọng | có | `viet-pro-intro` sau khi nhập có 8 câu, nên không có trạng thái rỗng. Thử trên `thu-giong-rong`, dự án tạo bằng hộp thoại Dự án mới và không có câu thoại: tab hiện "Chưa có câu thoại…". Thu gọn cột phải rồi bấm nút: cột phải mở lại ở tab Đạo diễn |
| 8. Chọn shot ở tab Anime: timeline chọn shot và tua | có | Bấm thẻ s3 trên shot board: khối s3 có lớp `sel`, đồng hồ "0:12.5 / 0:20.0" |
| 9. Tab `fx` theo shot chọn trên timeline; nút trong inspector mở tab `fx` | có | Bấm s3 trên timeline: tab `fx` hiện "Shot s3 đang dùng: (không)". Áp `zoom-through` gửi `POST /api/fx/apply-transition {shot:"s3", id:"zoom-through", base:5}`; log tăng một bản; dòng đổi thành "Shot s3 đang dùng: zoom-through". Từ tab Chất liệu, bấm "Mở thư viện chuyển cảnh" trong inspector: tab trái thành `fx` |
| 10. Xuất bản → "Xuất bộ lớp dựng" | có | Toast "Đang xuất bộ lớp dựng: render rồi cắt từng shot". Hộp thoại "Cổng & tệp đã xuất…" có thẻ "Xuất video · bộ lớp dựng · đang chạy", log hiện "Hình: render index.html…". Job `export` exit 0 sau 45 s, kết quả `renders/thuy-mau-demo-20261023-135540-bundle` (4 shot, 4 file tiếng, 3 phụ đề, fcpxml/xml/otio). Tên này hiện trong hộp thoại |
| 11. Xuất bản → "Xuất video" | có | Lần đầu job exit 5. Hộp thoại hiện "Thiếu cổng: animatic … older than PLAN.md…", giống bản cũ. Sau khi cổng PASS, job exit 0 sau 33 s, ra `renders/thuy-mau-demo-20261023-135737-final.mp4` (20 MB) trong gốc thử, và file này hiện trong hộp thoại |
| 12. `?tab=ai`, `?tab=output`, `?tab=media` | có | `?tab=ai` mở cột phải ở tab Đạo diễn. `?tab=output` mở hộp thoại "Xuất bản". `?tab=media` chọn tab trái `media` |
| 13. Alt+1…7 và các phím trong bảng README; không phím nào chạy khi mở Dự án mới | có | Alt+1…7 lần lượt chọn `media, styles-code, anime, fx, voice, music, library`. Home cho 0:00.0, Shift+→ cho 0:01.0, End cho 0:20.0. L phát (nút "Dừng"), K dừng, J lùi một giây, Space phát rồi dừng. N đổi Hít `true→false`, R đổi `ripple→roll`. `=` và `-` đổi độ rộng track 1440↔1762.5 px, Shift+Z vừa khung. S cắt s1 thành 5 shot và mở menu "Nhờ đạo diễn dựng shot mới" như bản cũ. Cmd+Z còn 4 shot, Cmd+Shift+Z lại 5, Cmd+Z còn 4 (log `undo`, `redo`, `undo`). Delete trên SFX của đạo diễn hiện "SFX này do đạo diễn đặt; …". Shift+kéo câu vo-01 gửi một `POST /api/patch [move_line vo-01]`. Khi hộp thoại Dự án mới mở, các phím Space, End, N, R, Alt+3, Shift+Z, S không đổi đồng hồ, Hít, chế độ hay tab. ←/→ một khung (0,033 s) nhỏ hơn độ phân giải 0,1 s của đồng hồ, nên phần này dựa vào test `keys.test.ts` |
| 14. Thu gọn, mở lại, kéo đổi cỡ; tải lại giữ cỡ | có | Panel trái 305 px, thu gọn còn 0, bấm rail thì về 305. Cột phải 333 px, thu gọn còn 0, "Mở cột phải" thì về 333. Kéo hai tay nắm: trái thành 425, phải thành 433. Sau khi tải lại: 425 và 433. Khoá `localStorage` là `react-resizable-panels:ms-layout` |

### Các mục còn lại từ báo cáo vùng

- **INSP-17 (Gợi ý B-roll), INSP-18 (biên nhận), INSP-19 (phong cách code):** bấm s2 trên timeline thật, rồi đọc tab Shot:
  - "Gợi ý B-roll" có dòng "Tìm theo: … · shot dài 6.0 s" và thẻ gợi ý;
  - "Biên nhận của file trong shot" có dòng `đạt · media-check · assets/footage/1-2.mp4`. Biên nhận này tạo bằng `POST /api/media/check`, chạy cục bộ, không tốn lượt;
  - "Phong cách code" có "Dự án chưa áp phong cách code nào." và danh sách để áp. Ảnh ở `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/final/extra/inspector-lemo-s2.png`.
- **Khối beat, word, line, music, event:** bấm trên timeline thật (word sau khi phóng to, vì chấm từ chỉ hiện từ 120 px/s). Inspector mở đúng mục cho từng khối: "CÂU vo-01", "NHẠC · bgm.mp3", "SFX sfx-brush-1", "MỐC TỪ · "Lớp"", "MỐC PHÁCH · bgm.mp3.beats.json".
- **fx-noshot:** thử trên `thu-khong-shot`, dự án có `project.json` mà không có shot nào. Tab `fx` hiện "Chọn một shot trên timeline để áp chuyển cảnh". Ảnh ở `…/final/extra/fx-noshot.png`.
- **Tên file dài:** đo bằng mắt và bằng script ở 1440 px, với 7 tab của `thuy-mau-demo` và `abm-intro`, cộng cột phải. Tìm ra một lỗi: hàng "Phân tích footage" gồm ô phạm vi, "Phân tích offline" và "Chú thích bằng agent" không xuống dòng, nên panel trái cuộn ngang 170 px. Đã sửa bằng `flex-wrap` ở `ui/src/ext/broll/Analyse.tsx`. Đo lại thì không panel nào còn tràn ngang.
- **MusicTab:** đã bỏ lớp `role="group"`; `aria-label` "Âm lượng <file>" nay gắn thẳng lên thumb của Slider (test đổi theo).
- **Toast khi job Anime xong lúc tab đóng:** đã chuyển việc theo dõi job sang hàm `badge` của tab Anime. Rail luôn render hàm này, nên toast hiện ngay như bản cũ. Hàm luôn trả 0, nên không có số nào hiện trên rail. Cách này không đổi hợp đồng và không đụng vỏ. Có thêm một test: job xong khi tab đóng thì có đúng một toast.
- **"Thêm" bị tắt ở dự án chỉ xem:** giữ như phase file (khác bản cũ, đã ghi ở báo cáo media).

Server 4410 đã dừng sau khi thử.
