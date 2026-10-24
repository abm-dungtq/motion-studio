# Kongming checkpoint sau phase 04–05 và PR vá #25 (2026-10-24)

Kết luận: **GO sang phase 07** (phase 06 đang chạy, không đụng). Mã đã merge đúng hợp đồng mục C, D; consent một lần, chờ lượt 30 phút, không xoá raw đều được kiểm bằng mã và test. Có một lỗ hổng spec ở phase 07/10 (thẻ đồng ý ngoài đợt ảnh không hiện ở tab Tài sản) đã sửa trong phase file. Bảng duyệt ở panel trái hẹp không đủ để duyệt tờ 7 tư thế ở 4×; đề xuất một PR nhỏ "xem rộng" (cỡ S) làm trước task 7.5.

## 1. Bằng chứng đã kiểm

- `main` của Motion Studio: `bcb7478` (#24), `42fefcb` (#25), `f60d9ed` (#26); cây làm việc sạch (chỉ `plans/` chưa theo dõi).
- `npm test` chạy lại 2026-10-24: node 443 test, 441 pass, 0 fail, 2 skip có sẵn; ui 41 file / 247 pass; kiểm sở hữu 6/6.
- Diff #24: 15 file, +1377/−22 (`lib/agents/index.mjs` khoá N chỗ, `lib/consent.mjs`, `lib/assets/batch.mjs`, `routes/assets.mjs`, `routes/consent.mjs`, test). Diff #25: 6 file (`lib/series-run.mjs`, `lib/series.mjs`, `routes/series.mjs`, +4 test). Diff #26: 15 file, +908/−10 (`routes/assets.mjs` approve, `gates.mjs` `writeDemoNote`, `ui/src/ext/series/*`).

## 2. Đúng hợp đồng (tài liệu mục C, D)

| Yêu cầu | Mã | Kết luận |
|---|---|---|
| C: `asset_batch { batch }` đọc file đợt bước 5.2, chạy song song theo số tài khoản còn lượt | `lib/tools/assets.mjs` → `POST /api/assets/batch`; `batch.mjs` `runBatch` chạy `Math.min(slots, queue.length)` worker, `slots = slotsOf(agent ảnh đầu)`; `codex-pool.parallel(row)` = số tài khoản `ok` (1–4) | Đạt |
| C: nới "một việc ảnh mỗi dự án" thành N | Giới hạn job vẫn một `asset-batch` mỗi dự án (`startJob` BUSY → 409), nhưng N ảnh chạy trong một tiến trình con; khoá agent `locked(id, slots, fn)` FIFO | Đạt theo cách plan đã chọn (điểm 4 "tài liệu sai so với mã") |
| C: hiện số lượt ước tính trước khi chạy | `estimate()` + `estimateTitle()` → thẻ "Đợt X: n ảnh, codex-pool, ước n lượt vẽ; acct1 còn …%" | Đạt. Ước tính không cộng lượt đọc ảnh (`image-check`), xem mục 5 |
| C kiểm: 7 tư thế, 7 biên nhận, 7 ảnh tách nền, tắt một tài khoản giữa chừng vẫn xong | `tests/asset-batch.test.mjs` (7 pass): `FAKE_POOL_CREDITS="3 20"`, 7 `image-generate`, 7 `.pxl`, chồng tối đa đúng slots | Đạt (CLI giả; thật ở phase 06) |
| D: tab Tài sản có tờ nhân vật, bảng nền, bảng đạo cụ | `AssetsTab.boardsOf()`: `character:<id>` từ `pose`, `background`, `prop` | Đạt. `ui-card`, `thumbnail` không có bảng (hợp lý, không chép vào S) |
| D: phóng 2×/4×/8× `image-rendering: pixelated` | `Zoom.tsx`: CSS `zoom` + `imageRendering: pixelated`, mặc định 4× tờ nhân vật/đạo cụ, 2× nền | Đạt về kỹ thuật; về dùng được xem mục 6 |
| D: "Duyệt cả bảng", "Vẽ lại ảnh đã đánh dấu" kèm lý do | `Board.tsx`; redo từ bảng gửi `from: "board"`, route 400 khi thiếu `reason` | Đạt |
| D: duyệt ghi `approval.json` và `DEMO.md` | `approveBoard()`: `approval.json` = cũ + `{approved, date, by, notes, images, previous}`; `writeDemoNote` chèn trên `## Frames` | Đạt; `tests/asset-approve.test.mjs` 6 pass |

## 3. An toàn

- **Consent một lần.** `answerCard`: thẻ không `waiting` hoặc đang trả lời → 409; `answering` Set chặn trả lời chồng trong cùng tiến trình; ghi nguyên tử; action lỗi thì thẻ về `waiting` kèm `error` (chưa chạy gì, hỏi lại được). Biên nhận `op: "consent"` mỗi câu trả lời. Test `consent.test.mjs` 4 pass.
- **Actor ghi từ server.** Duyệt bảng: `by: BY` (`gates.mjs:14`, `"user@studio"`), không nhận từ body. Thẻ đồng ý: route nhận `by` từ body nhưng ép qua regex `ACTOR` và mặc định `human`; giao diện không gửi `by`. Đạo diễn không có tool nào gọi `/api/consent/answer` (không có trong `lib/tools/*.mjs`), Bash của đạo diễn chỉ `node $OV/scripts/*` và `npx hyperframes`, nên không curl được. Mọi POST cần `X-Studio-Token`. Rủi ro còn lại là rủi ro cũ số 18 của plan (đạo diễn chạy được `eleven.mjs`), không mới.
- **Chờ hết lượt 30 phút.** `QUOTA_WAIT_MS = 60000`, `QUOTA_MAX_MS = 30*60000`; `deadline` tính từ lần hết lượt đầu, đặt lại `null` khi một ảnh vẽ được; hết hạn → `stopped: true`, thông báo tiếng Việt, ảnh dở thành `waiting_quota`, exit 3. Test "with every account out the batch waits, then stops after the limit; turns coming back let it finish" pass.
- **Không xoá raw.** `generateImage` → `placeFree(src, out)` `COPYFILE_EXCL`, tên đã có thì `-2`, `-3` (`lib/agents/index.mjs:245-250`); test "the first drawing is not deleted". Duyệt chỉ `copyFileSync(..., COPYFILE_EXCL)` sang S, khác sha → 409, không ghi gì; test "assets/gen/raw/ không mất file".
- **Đường S.** #25 đóng ba lỗ (positional `path:read` lọt `S/tools`, series nằm trong dự án, `series/put` xuyên symlink). `batch.mjs` `refPath`/`targetPath` kiểm realpath trong `read`/`writable` và chặn `S/build`; `approveBoard.writableFile` thêm kiểm symlink đích bằng `lstat`.

## 4. Lỗ hổng spec đã sửa trong phase 07 và 10 (ghi lại theo quyền được giao)

Tab Tài sản hiện chỉ hiện thẻ gắn với một đợt ảnh: `GET /api/assets` → `consent: waitingCard(dir, batch)` lọc `action.name === "asset-batch"` (`routes/assets.mjs`), và `AssetsTab` đọc `batches[].consent`. Thẻ `elevenlabs` của `series_tts`/`voice_design` (phase 07), thẻ `thumbnail` và `drive` (phase 10) sẽ không hiện ở đâu cả nếu chỉ "dùng lại `ConsentCard`" như phase 07 task 7.5 bước 2 viết. Đã thêm vào phase 07 task 7.5 bước 2 yêu cầu `useConsent(name)` đọc `GET /api/consent?name=` (route đã có, `provider: false`) và render ở đầu tab Tài sản thay cho `batches[].consent`, cộng ở tab "Lời & giọng"; thêm vào phase 10 task 10.5 bước 1 rằng `DeliveryPanel` dùng cùng query. Không đổi route, không đổi hợp đồng.

Các lệnh Verify phase 07–11 còn lại đã rà: tên route, export `OPS`/`COMMANDS`/`STUDIO_API` của `studio-api.mjs` (có thật ở `$OVC`), hàm `a01_import`, body `/api/consent/answer` đều khớp mã hiện tại. Không sửa gì thêm.

## 5. Điểm nhỏ nên biết, không chặn

- Ước tính trên thẻ chỉ đếm lượt vẽ (`codex_turns = images`); mỗi ảnh còn 1–2 lượt đọc ảnh (`image-check`) và có thể 1 lượt vẽ lại tự động, và lần đọc đầu đi codex-pool khi agy chưa qua "Thử khả năng" (báo cáo phase 04). Với đợt 7 ảnh thực tế có thể là 7–14 vẽ + 7–14 đọc. Nên sửa chữ trên thẻ thành "ước n lượt vẽ, tối đa 2n kể cả vẽ lại; thêm n–2n lượt đọc ảnh nếu agy không sẵn" (một dòng, `estimateTitle`), làm chung PR "xem rộng" ở mục 6. Phase 06 đang chạy với ngưỡng "trên 10 lượt thì không đồng ý" là an toàn vì đợt chỉ 2 ảnh.
- `docs/assets.md` chưa có `POST /api/assets/approve` và trạng thái `approved` (báo cáo phase 05 đã ghi). Gộp vào PR mục 6.
- Sau đợt trên dự án chưa có `project.json`, `queueRequest` lỗi "base phải là số phiên bản" chỉ ghi log. a-02 ở phase 06 có `project.json` (task 6.1 bước 3) nên không gặp.

## 6. Giao diện: panel trái có đủ để duyệt tờ 7 tư thế không

Không đủ. Số đo:
- Panel trái mặc định 22% (`App.tsx`, `defaultSize="22%"`, tối đa 40%), ở 1440 px là khoảng 300 px, kéo hết cỡ được khoảng 550 px.
- Ảnh xem trước là bản `--preview` của `import-sprite` ở cỡ art px của rig (ví dụ `--height 195`; tập 1 dùng 195 cho nhân vật đứng). Ở 4× một tư thế cao 780 px, rộng 300–450 px; `PixelImage` bọc trong `max-h-96 overflow-auto` (384 px) nên người dùng thấy một mảnh có thanh cuộn, không thấy cả người. Ảnh chụp `tai-san.png` (fixture 256 px) đã lộ việc này: một ô chiếm cả cột và bị cắt.
- Tờ 7 tư thế là 7 ô xếp dọc, mỗi ô cuộn riêng; so hai tư thế cạnh nhau (việc chính khi duyệt một tờ nhân vật) là không làm được.

Đề xuất: **chế độ xem rộng bằng Dialog**, không đổi tab, không đổi route, không đổi hợp đồng D.
- Mỗi bảng thêm nút "Xem rộng" cạnh thanh 2×/4×/8×. Bấm mở `Dialog` (đã có `components/ui/dialog.tsx`, mẫu `ExportDialog.tsx`) với `DialogContent` rộng khoảng `max-w-[92vw] h-[88vh]`, bên trong là cùng `Board` (lưới `flex-wrap`, mỗi ô `min-w` theo cỡ ảnh × zoom, cuộn cả hộp thay vì cuộn từng ô: bỏ `max-h-96` khi ở chế độ rộng). Zoom, ô đánh dấu, lý do vẽ lại, hai nút dùng chung state với bảng trong panel (nâng state lên `Board`, truyền xuống). Mặc định mở ở 4×, 7 ô cao 780 px xếp 3–4 ô một hàng ở 1440 px, cuộn một lần là thấy hết tờ.
- Không làm: vẽ lên vùng giữa (Stage), vì Stage gắn player và `actions.transport` trong `useEffect` một lần (`Stage.tsx`), thay nội dung ở đó phải thêm cơ chế "stage override" vào registry, đụng shell và test `integration.test.tsx`; tốn gấp 3 mà chỉ hơn Dialog ở chỗ thấy timeline cùng lúc, điều không cần khi duyệt ảnh.
- Không làm: thay panel trái bằng layout mới hay thư viện ảnh riêng (rủi ro phình phạm vi đã ghi ở phase 05).
- Cỡ việc: S, khoảng 2–3 giờ: `Board.tsx` (nút + nâng state), `BoardDialog.tsx` mới, `Zoom.tsx` (prop `fit: "cell" | "wide"`), `AssetsTab.test.tsx` (+2 test: mở dialog thấy đủ ô; đánh dấu trong dialog thì nút ở panel cũng bật), `CHANGELOG.md`, và hai dòng `docs/assets.md` còn thiếu ở mục 5.
- Phase gánh: không nhét vào phase 07 (đã 8 giờ, hai repo). Làm thành một PR riêng `feat/asset-board-wide` trong khung phase 05 (đánh dấu "05b" trong `plan.md`, 3 giờ), bắt đầu ngay khi phase 06 báo xong, trước task 7.5 vì 7.5 cũng sửa `ui/src/ext/series/index.ts` và `api.ts`. Phase 06 không cần nó: executor đang duyệt thay bằng Read ở 4× và chỉ có 2 ảnh. Người dùng cần nó ở bước 7 (7 tư thế Sóng, bố, mẹ; 6 nền; hơn 25 đạo cụ).

## 7. GO/NO-GO

GO sang phase 07 sau khi phase 06 kết thúc, với hai điều kiện đã ghi vào phase file: (1) task 7.5 làm `useConsent` theo mục 4; (2) PR "xem rộng" (05b) merge trước task 7.5 để hai PR không cùng sửa `ui/src/ext/series/`. Mốc dừng 3 (`STUDIO_API`) không bị chạm: phase 07 chỉ thêm trường tuỳ chọn và op mới.

## Giả định

- Rig bà nội và các nhân vật tập 2 nhập với `--height` cỡ tập 1 (khoảng 195 art px) — mức tin cậy trung bình; nếu rig nhỏ hơn 100 px thì panel hẹp vẫn tạm dùng được ở 2×, nhưng đề xuất Dialog vẫn đúng cho nền 480×270 ở 2× (960 px rộng).
- Màn hình người dùng khoảng 1440 px như ảnh chụp — mức tin cậy cao (ảnh chụp ở thư mục `1440/`).
- Phase 06 không sửa mã (đúng như phase file: "Không đổi mã"); nếu phase 06 phải mở PR `fix/...` chạm `ui/src/ext/series/`, PR 05b phải rebase sau nó — mức tin cậy cao.
