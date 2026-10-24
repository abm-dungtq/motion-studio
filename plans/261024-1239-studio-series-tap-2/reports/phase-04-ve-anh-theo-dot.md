# Phase 04: vẽ ảnh theo đợt

Ngày 2026-10-24. Trạng thái: xong, mọi Verify qua.

## PR

- motion-studio #24 https://github.com/abm-dungtq/motion-studio/pull/24, squash `bcb7478` trên `main`, thân commit sạch (không trailer, không nhắc AI). Repo không có CI.

## File

- Sửa: `lib/agents/index.mjs` (`locked(id, slots, fn)` hàng đợi FIFO nhiều chỗ, `slotsOf`, `MAX_SLOTS`, chú thích đầu file), `lib/agents/cli/codex-pool.mjs` (`parallel(row)`), `lib/config.mjs` (chú thích `agents.parallel`; `agents` đã có trong SETTINGS), `tests/agents-registry.test.mjs` (+1 test), `tests/fake-cli.mjs` (`FAKE_POOL=one`, `FAKE_POOL_CREDITS`, `FAKE_DELAY`, `FAKE_AGY=check` + `FAKE_AGY_FAILS`), `docs/agents.md`, `CHANGELOG.md`.
- Tạo: `lib/consent.mjs`, `lib/assets/batch.mjs`, `lib/tools/assets.mjs`, `routes/assets.mjs`, `routes/consent.mjs`, `tests/consent.test.mjs` (4), `tests/asset-batch.test.mjs` (7), `docs/assets.md`.
- Ngoài file sở hữu: không. Không ghi vào S, `$C/video/a-01` hay `~/.claude/skills`.

## Quyết định khi làm

- Thêm `POST /api/assets/batch`: tool `asset_batch` chạy trong tiến trình MCP, nên tạo thẻ qua Studio để kiểm file đợt và quét quota ở cùng một chỗ. Một đợt chỉ có một thẻ đang chờ.
- Thẻ đồng ý: action lỗi khi đồng ý (ví dụ BUSY) thì thẻ về `waiting` kèm `error`, vì chưa có gì chạy. Thẻ đã trả lời là 409.
- Khóa kiểm theo loại ảnh: `right_character` khi có `character`, `single_figure` cho `pose`/`prop`, `flat_green` khi nền xanh, `no_text` luôn có. Agent đọc ảnh nhận ảnh mới cùng tối đa hai ảnh tham chiếu.
- Ảnh trượt kiểm hai lần (`needs_review`) vẫn được tách nền, để bảng duyệt phase 05 có ảnh xem trước.
- Hết lượt: ảnh coi là chờ lượt khi lần vẽ hỏng và có agent báo quota (hoặc không agent nào vẽ được). Hết hạn 30 phút tính từ lần hết lượt đầu, đặt lại khi một ảnh vẽ được. Coi là "có lượt lại" khi codex-pool quay lại danh sách chọn, hoặc có agent ảnh `có` chưa báo quota.
- Giới hạn `asset_redo`: đếm `ai_redos` theo ảnh trong file trạng thái, tiến trình con tự cộng; route chặn ở lần thứ tư (409 "cần người dùng xem"). Vẽ lại do đạo diễn không xếp yêu cầu mới cho đạo diễn; đợt do người dùng chạy thì có.
- Tách nền ghi biên nhận `series-tool` cho mỗi lần chạy `import-sprite`/`quantize`.

## Kết quả Verify

- 4.1: `node --test tests/agents-registry.test.mjs tests/agents-router.test.mjs` 14 pass, 0 fail.
- 4.2: `node --test tests/consent.test.mjs` 4 pass.
- 4.3: `node --test tests/asset-batch.test.mjs` 7 pass: đợt 7 `pose` với `FAKE_POOL_CREDITS="3 20"` (acct1 hết sau 3 ảnh, 4 ảnh còn lại sang acct2), 7 biên nhận `image-generate`, 7 `image-check`, 7 `series-tool`, 7 `.pxl`; tối đa 2 ảnh cùng lúc với hai tài khoản, 3 khi `agents.parallel["codex-pool"]: 3`; vẽ lại tự động một lần; dừng sau hạn khi hết lượt, chạy tiếp khi có lượt lại.
- 4.4: `npm test` node 431 test (429 pass, 2 skip có sẵn: OTIO thật, clone API 4), 0 fail; ui 40 file, 240 pass.
- 4.5: Studio 4420 (pid 18910) root `$T/root`, `MOTION_STUDIO_AGENT_PATH=$T/fakebin`, `OPUS_VIDEO_HOME=$OVC` (@17745d0). `asset_batch` qua `callTool` trả thẻ "Đợt thu-3: 3 ảnh, codex-pool, ước 3 lượt vẽ; acct1 còn 62% trong 5 giờ, acct2 còn 90% trong 5 giờ", 0 lời gọi `exec` trước khi đồng ý; đồng ý qua `POST /api/consent/answer` → job `asset-batch` exit 0. Verify in `keyed,keyed,keyed` và `3`. Biên nhận: 3 `image-generate`, 3 `image-check`, 3 `series-tool` (công cụ `import-sprite` thật của S), 1 `consent`; quét chuỗi giống token: 0. `S/refs/khoa-hd/poses/` không có file mới. Studio thử đã dừng, cổng 4420 trống, pid 4317 (82168) không đổi.

## Còn lại

- Sau đợt trên `a-99`, Studio không xếp được yêu cầu cho đạo diễn ("base phải là số phiên bản") vì `a-99` không có `project.json`; Studio ghi một dòng vào log và job vẫn xong. Đường xếp yêu cầu đã kiểm bằng plugin giả trong `asset-batch.test.mjs`; với plugin thật nó chạy lần đầu ở phase 06 trên `a-02` (cần `project.json`, nếu không cũng chỉ mất bước báo đạo diễn).
- Thứ tự đọc ảnh mặc định là agy → codex-pool → claude, agy "chưa rõ" nên đứng sau codex-pool. Trên máy thật, lần kiểm ảnh đầu sẽ đi codex-pool (tốn lượt đọc) trừ khi agy đã qua "Thử khả năng" hoặc `agents.order.vision` được đặt. Bài kiểm 4.5 đặt tạm `agents.order.vision: ["agy"]` trong `$T/studio.json` rồi đã xoá lại.
- `$T/fakebin/` (codex-pool, codex, agy giả bằng node, `png.mjs`) và `$T/root/a-99/assets/gen/`, `.opus/` còn lại từ bài kiểm; dựng lại được, xoá được.
