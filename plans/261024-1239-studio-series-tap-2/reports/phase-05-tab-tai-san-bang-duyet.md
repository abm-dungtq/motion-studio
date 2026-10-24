# Phase 05: tab Tài sản và bảng duyệt

Ngày 2026-10-24. Trạng thái: xong, mọi Verify qua.

## PR

- motion-studio #26 https://github.com/abm-dungtq/motion-studio/pull/26, squash `f60d9ed` trên `main`, thân commit sạch (không trailer, không nhắc AI). Nhánh rebase lên `42fefcb` (PR #25 vá bảo mật) trước khi merge, không xung đột; `npm test` chạy lại sau rebase vẫn xanh.

## File

- Sửa: `gates.mjs` (`writeDemoNote`), `routes/assets.mjs` (`POST /api/assets/approve`, `approveBoard`, `approvedText`; `redo` với `from: "board"` cần `reason`), `tests/studio-gates.test.mjs` (+2 test), `ui/ownership.json` (vùng `series`), `CHANGELOG.md`.
- Tạo: `ui/src/ext/series/{index.ts,AssetsTab.tsx,Board.tsx,Zoom.tsx,ConsentCard.tsx,api.ts,types.ts,AssetsTab.test.tsx}`, `tests/asset-approve.test.mjs` (6 test).
- Ngoài danh sách sở hữu: `ui/src/integration.test.tsx`. Test này ghim danh sách tab trên rail; thêm tab nào cũng phải sửa nó. Chỉ đổi mong đợi (`series-assets` sau `fx`, vẫn 2 đường kẻ nhóm). Không đụng file của PR vá bảo mật.

## Quyết định khi làm

- Bảng: `character:<id>` gồm ảnh `pose` của nhân vật đó; `background` gồm ảnh `background`; `prop` gồm ảnh `prop`. `ui-card` và `thumbnail` không có bảng, vì phase không định nghĩa bảng cho chúng và chúng không cần chép vào series.
- Route kiểm hết rồi mới chép: một ảnh bị từ chối thì không ghi gì (không chép, không `approval.json`, không DEMO.md, không biên nhận). Đích đã có cùng sha thì coi là đã có (nhận); khác sha thì 409 kèm sha ngắn; đích là symlink thì từ chối. Mọi đích trong S phải nằm trong một thư mục `writable` (realpath) và không dưới `S/build`. Chép bằng `COPYFILE_EXCL`.
- Đích: nhân vật chép `raw` sang `target` (ảnh không có `target` thì chỉ ghi vào `images` đường raw trong dự án); nền chép `keyed` sang `target` nếu có, nếu không thì `<writable.backgrounds>/<id bỏ bg->.png`, và sang `assets/bg/<cùng tên>`; đạo cụ chép `keyed` `.pxl` sang `<writable.props>/<tên>.pxl`, tên lấy từ `target` nếu có, nếu không thì id bỏ `prop-`. Series thiếu khóa `backgrounds`/`props` thì 400 nói rõ. `S/studio-series.json` thật có cả hai khóa.
- `approval.json` nằm ở `<characters>/<id>/` và phải thuộc một khóa writable (`rig_src`); nội dung = bản cũ + `{ approved, date (giờ máy, YYYY-MM-DD), by, notes, images, previous }`. File cũ hỏng JSON thì 409, không ghi đè.
- Duyệt bị chặn (409) khi đợt đang chạy (job hoặc `running` trong file trạng thái) hoặc ảnh không ở `keyed`/`needs_review`. Ảnh đã duyệt chuyển `approved` kèm `approved: { at, by, board }`.
- Giao diện: "Duyệt cả bảng" gửi mọi ảnh `keyed` của bảng cộng ảnh `needs_review` đã được đánh dấu (có dòng nhắc), mỗi đợt một yêu cầu. Ô đánh dấu cũng chọn ảnh để vẽ lại. Phóng bằng CSS `zoom` (lớp `[zoom:2|4|8]`) cộng `image-rendering: pixelated`. Theo dõi đợt: hỏi lại `/api/assets` mỗi 2 giây khi có đợt đang chạy (chạy được cả khi dự án chưa có `project.json`, lúc luồng sự kiện không mở), và tải lại khi danh sách job do luồng sự kiện ghi vào thay đổi; báo bằng toast khi đợt xong hoặc dừng.
- Fixture `tests/fixtures/series/` không sửa (PR vá bảo mật chạy song song có thể sửa nó); test chép fixture rồi thêm `writable.backgrounds`, `import-sprite`, `quantize` vào bản chép.

## Kết quả Verify

- 5.1: `node --test tests/studio-gates.test.mjs` 10 pass, 0 fail.
- 5.2: `node --test tests/asset-approve.test.mjs` 6 pass: tờ nhân vật mới tạo `approval.json` (`approved: true`, ngày, `previous: null`, thư mục nhân vật chỉ có `approval.json`); duyệt lại giữ nội dung cũ và `previous`; đích khác sha bị 409 và không ghi gì; nền vào S và `assets/bg/`, đạo cụ vào `props/`; cùng bytes thì nhận; DEMO.md có dòng đúng chỗ, theo thứ tự; `assets/gen/raw/` không mất file; yêu cầu sai (bảng lạ, ảnh đang vẽ, đợt đang chạy, vẽ lại từ bảng không lý do) bị từ chối.
- 5.3: `npm test` exit 0: node 443 test (441 pass, 2 skip có sẵn), ui 41 file / 247 pass, kiểm sở hữu 6/6. `command grep -rn pixelated ui/src/ext/series` thấy `Zoom.tsx`.
- 5.4: Studio 4420 (pid 42022) root `$T/root`, `MOTION_STUDIO_AGENT_PATH=$T/fakebin`, `OPUS_VIDEO_HOME=$OVC` (@17745d0), state `$T/studio.json` (đặt tạm `agents.order.vision: ["agy"]` và `director.runner: "mcp"`, đã xoá lại). `$T/series-gia` = fixture + `tools/key.mjs` (chép ảnh vào `--out`/`--preview`) + `writable.backgrounds` + `refs/thu/design.png`. `GET /api/assets?name=a-99` thấy đợt `thu-3` của task 4.5 và đợt mới `thu-5`. `POST /api/assets/batch` trả thẻ "Đợt thu-5: 3 ảnh, codex-pool, ước 3 lượt vẽ; acct1 còn 62% trong 5 giờ, acct2 còn 90% trong 5 giờ"; đồng ý thì job exit 0, 3 `keyed`. Trong Chrome (ui/scripts/shoot.mjs), mở tab Tài sản, bấm "Duyệt cả bảng" trên "Tờ nhân vật thu": toast "Đã duyệt 2 ảnh của tờ nhân vật thu", trạng thái "đã duyệt". In ra `OK-APPROVAL`, `OK-S-UNTOUCHED`, `OK-STOPPED`. Biên nhận `asset-approve` 1; chuỗi giống token chỉ khớp trường `sha256` (21 lần). pid 4317 (82168) không đổi.
- Ảnh chụp: `$T/p05-shots/1440/tai-san.png`, `tai-san-8x.png`, `duyet-thu.png` (không commit).

## Còn lại

- `docs/assets.md` chưa có `POST /api/assets/approve` và trạng thái `approved` (không thuộc file sở hữu của phase này). Nên thêm một dòng vào bảng route và bảng `status` ở một phase sau hoặc PR docs nhỏ.
- `$T/root/a-99/BRIEF.md` nay trỏ `series: $T/series-gia` (bản trước lưu ở `$T/a-99-BRIEF.p04.md`). Để vậy thì mọi lần thử sau trên a-99 không ghi vào S thật. Đợt `thu-3` cũ của a-99 không duyệt được trên series giả (ảnh tham chiếu ở S thật) và vẫn hiện trên bảng "Tờ nhân vật khoa".
- `$T/series-gia/`, `$T/p05-*` là đồ thử, dựng lại được, xoá được.
- Lần chạy `start` build lại `ui/` cục bộ (thư mục build bị gitignore, không commit).
