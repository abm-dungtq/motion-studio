# Phase 05b: xem rộng bảng duyệt

Ngày 2026-10-24. Trạng thái: xong.

## PR

- motion-studio #29 https://github.com/abm-dungtq/motion-studio/pull/29, squash `a94fc4c` trên `main` (cha `4b39f6d`, #28). Thân commit sạch: không trailer, không nhắc AI, không mã phase.
- Làm trong worktree `~/.cache/ms-tap2/wt-board-wide` (nhánh `feat/asset-board-wide` từ `origin/main`), không đổi nhánh ở `/Volumes/2/Motion-Studio`. Phụ thuộc ui cài bằng `installUi()` của `lib/ui-build.mjs`. Sau merge đã gỡ worktree, xoá nhánh cục bộ và nhánh trên GitHub.

## File (đều trong vùng `series` của `ui/ownership.json`, cộng `CHANGELOG.md`)

- `ui/src/ext/series/Board.tsx`: nút "Xem rộng" (aria-label `Xem rộng <tên bảng>`) cạnh thanh 2×/4×/8×; `Dialog` với `DialogContent` `flex h-[88vh] max-w-[92vw] sm:max-w-[92vw]`. Phần đầu: tên bảng, một câu mô tả, cùng thanh phóng. Giữa: lưới `flex-wrap` trong một hộp `overflow-auto` (cuộn cả hộp). Dưới: cùng hai hàng nút và ô lý do. Zoom, ô đánh dấu, lý do, `busy` nằm trong `Board` và dùng chung cho cả cột trái và hộp thoại. Không tách `BoardDialog.tsx` riêng như đề xuất vì hộp thoại chỉ khoảng 15 dòng và cần mọi state của `Board`.
- `ui/src/ext/series/Zoom.tsx`: `PixelImage` nhận `fit: "cell" | "wide"` (mặc định `cell`); chỉ `cell` giữ `max-h-96 overflow-auto`; có `data-fit` để kiểm.
- `ui/src/ext/series/ConsentCard.tsx`: thêm dòng `extraTurnsText(n)` khi thẻ có `estimate.images`: "Chưa tính: mỗi ảnh còn 1–2 lượt đọc ảnh để tự kiểm (tốn lượt codex-pool nếu agy chưa sẵn); ảnh trượt tự kiểm được vẽ lại tự động một lần. Tối đa 2n lượt vẽ và 2n lượt đọc ảnh." Con số theo `runBatch` (`lib/assets/batch.mjs`: một lần vẽ, một lần đọc, trượt thì vẽ và đọc thêm một lần). Không sửa `estimateTitle` phía server, nên test node không đổi.
- `ui/src/ext/series/AssetsTab.test.tsx`: +2 test (mở hộp thoại thấy đủ ảnh của tờ ở `data-fit="wide"`, không `max-h-96`, 4× mặc định, đổi 8× trong hộp thoại thì bảng trái cũng 8×; đánh dấu và lý do trong hộp thoại hiện ra ở bảng trái, mở lại vẫn còn, "Duyệt cả bảng" trong hộp thoại gửi `ids: ["ngoi", "dung"]` rồi xoá đánh dấu), và kiểm dòng ước tính trên thẻ.
- `CHANGELOG.md`: một mục.
- Không đụng `docs/assets.md` (phase khác làm, đã có #28).

## Kiểm

- `npm test` exit 0: node 444 test (442 pass, 0 fail, 2 skip có sẵn), ui 41 file / 249 pass, kiểm sở hữu 6/6.
- Studio thử từ worktree ở cổng 4421 (4420 đang bận, pid 64586 của executor khác; 4317 pid 82168 không đổi), `MOTION_STUDIO_STATE=$T/wide/studio.json`, `MOTION_STUDIO_AGENT_PATH=$T/fakebin`, `OPUS_VIDEO_HOME=$OVC`, root `$T/root`, dự án `a-99` (series giả `$T/series-gia`). Chỉ xem, không bấm duyệt hay vẽ, không tốn lượt. Đã `stop`, cổng 4421 trống.
- Ảnh chụp (`ui/scripts/shoot.mjs`, 1440, không commit), trong `$T/wide/shots/1440/`:
  - `xem-rong-khoa-2x.png`: hộp thoại "Tờ nhân vật khoa", 3 tư thế cạnh nhau ở 2×, một ô đã đánh dấu.
  - `xem-rong-khoa.png`, `xem-rong-thu.png`: hộp thoại ở 4× mặc định (ảnh fixture 256 px nên 2 ô một hàng).
  - `bang-trai.png`: cột trái có nút "Xem rộng".

## Còn lại

- `$T/wide/` là đồ thử, xoá được.
