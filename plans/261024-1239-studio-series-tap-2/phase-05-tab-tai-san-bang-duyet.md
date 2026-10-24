---
phase: 5
title: "Tab Tài sản: thẻ đồng ý, bảng duyệt, phóng điểm ảnh (D)"
status: done
effort: 6h
depends_on: ["phase-04"]
---

# Phase 05: Tab Tài sản và bảng duyệt

## Bối cảnh

Người dùng đã chọn duyệt theo bảng: tờ nhân vật, bảng nền, bảng đạo cụ (tài liệu yêu cầu 3). Studio chưa có chỗ nào soi ảnh pixel ở 4× (`scout gap-check`, khoảng trống 5: không có `image-rendering: pixelated` trong `ui/src`). Phase này thêm một phần mở rộng giao diện `series` (tab "Tài sản") và route duyệt. Phase 07, 09, 10 thêm file vào cùng thư mục `ui/src/ext/series/`, tuần tự sau phase này.

Mẫu gần nhất là tab Anime: `ui/src/ext/anime/index.ts` (đăng ký tab), `Board.tsx` (bảng), `confirm.tsx` (hộp hỏi), `useJob.ts` (theo dõi job). Đọc bốn file đó trước khi viết.

## Repo, nhánh, PR

Motion Studio, nhánh `feat/asset-board`, PR "feat(ui): tab Tài sản duyệt ảnh theo bảng". Merge cuối phase.

## File sở hữu

- Tạo: `ui/src/ext/series/index.ts`, `ui/src/ext/series/AssetsTab.tsx`, `ui/src/ext/series/Board.tsx`, `ui/src/ext/series/Zoom.tsx`, `ui/src/ext/series/ConsentCard.tsx`, `ui/src/ext/series/api.ts`, `ui/src/ext/series/types.ts`, `ui/src/ext/series/AssetsTab.test.tsx`, `tests/asset-approve.test.mjs`.
- Sửa: `routes/assets.mjs` (route duyệt), `gates.mjs` (thêm `writeDemoNote`), `tests/studio-gates.test.mjs`, `ui/ownership.json` (vùng `series`: `ui/src/ext/series/**`), `CHANGELOG.md`.

## Tốn lượt

Không. Nút "Vẽ lại" gọi route của phase 04; trong test dùng CLI giả.

## Task 5.1: Ghi dòng duyệt vào DEMO.md phía trên `## Frames`

Bước:
1. Trong `gates.mjs` thêm `writeDemoNote(dir, line)`: chèn `- <line>` ngay trên dòng `## Frames` của `DEMO.md`; không có `## Frames` thì thêm vào cuối; không có `DEMO.md` thì tạo với tiêu đề `# DEMO`. Ghi nguyên tử như `writeApproval` (`gates.mjs:36-47`). Không bao giờ đụng dòng `approval:`.
2. Lý do đặt trên `## Frames`: `make-demo.mjs` giữ phần chữ phía trên `## Frames` khi viết lại DEMO.md và chỉ xóa các dòng `approval:`, `animatic:`, `scene_sheets:` (`OV/scripts/make-demo.mjs:51-63`).
3. Test trong `tests/studio-gates.test.mjs`: chèn đúng chỗ, hai lần chèn giữ thứ tự, dòng `approval:` không đổi.

Verify:
```bash
cd "$MS" && node --test tests/studio-gates.test.mjs 2>&1 | tail -3
```

## Task 5.2: Route duyệt bảng

Bước:
1. `POST /api/assets/approve { name, batch, board, ids, notes? }`, `board` ∈ `character:<id>`, `background`, `prop`:
   - mọi `ids` phải có trạng thái `keyed` (hoặc `needs_review` khi người dùng vẫn chọn duyệt);
   - `character:<id>`: chép `raw` của từng ảnh sang `target` của nó trong S (không ghi đè; đích đã có và khác sha thì từ chối, kèm lý do); ghi `S/characters/<id>/approval.json` = nội dung cũ (nếu có) cộng `{ approved: true, date: <YYYY-MM-DD>, by: "user@studio", notes, images: [đường các ảnh], previous: <bản cũ nếu có> }`. Thư mục nhân vật chưa có thì tạo chỉ với `approval.json`. Viết nguyên tử;
   - `background`: chép ảnh `keyed` sang `S/backgrounds/<tên>.png` và `assets/bg/<tên>.png` của dự án (tên = phần sau tiền tố `bg-` của id, hoặc `target` nếu có); không ghi đè ảnh khác sha;
   - `prop`: chép `keyed/<id>.pxl` sang `S/props/<tên>.pxl`, không ghi đè;
   - mọi bảng: `writeDemoNote(dir, "tài sản <bảng>: approved user@studio <ISO> <ids>")`; trạng thái ảnh thành `approved`; biên nhận `op: "asset-approve"`;
   - xếp yêu cầu tiếp cho đạo diễn: "Bảng <bảng> đã duyệt: <ids>. Làm tiếp: build-rig/props, sync-to-project, dùng tên mới trong scenes."
2. Đường ghi vào S lấy qua `seriesPath` và khóa `writable` của phase 03, không viết cứng.
3. `POST /api/assets/redo` đã có từ phase 04; route này nhận `reason` bắt buộc khi gọi từ bảng (một câu).
4. Test `tests/asset-approve.test.mjs` trên series giả của `tests/fixtures/series/`: duyệt tờ nhân vật mới tạo `approval.json` có `approved: true` và ngày; duyệt lại nhân vật đã có giữ `previous`; ảnh đích khác sha bị từ chối; DEMO.md có dòng đúng chỗ; không ảnh nào trong `assets/gen/raw/` bị xóa.

Verify:
```bash
cd "$MS" && node --test tests/asset-approve.test.mjs 2>&1 | tail -3
```

## Task 5.3: Tab "Tài sản"

Bước:
1. `ui/src/ext/series/index.ts`: `register(studio)` gọi `studio.registerTab({ id: "series-assets", label: "Tài sản", group: "assets", … })`. Tab chỉ hiện nội dung khi `GET /api/series?name=` trả series; không có series thì hiện một câu "Dự án này không thuộc series nào."
2. `AssetsTab.tsx` gồm, theo thứ tự từ trên xuống:
   - **Thẻ đang chờ đồng ý** (`ConsentCard.tsx`, dùng chung cho phase 07 và 10): tiêu đề, con số ước tính, quota tài khoản; nút "Đồng ý" và "Không". Câu chữ ví dụ: "Đợt bà nội: 4 ảnh, codex-pool, ước 4 lượt vẽ. acct1 còn 62% trong 5 giờ."
   - **Tờ nhân vật**, mỗi nhân vật một tờ; **Bảng nền**; **Bảng đạo cụ**. Mỗi ô: ảnh `keyed` (đường `/p/<name>/assets/gen/keyed/<id>.png`), id, trạng thái bằng chữ ("đang vẽ", "chờ lượt", "cần xem", "đã duyệt"), lý do của lần tự kiểm nếu trượt.
   - Mỗi bảng có nút "Duyệt cả bảng", ô đánh dấu trên từng ảnh, ô "Lý do vẽ lại" (bắt buộc, một câu) và nút "Vẽ lại ảnh đã đánh dấu".
3. `Zoom.tsx`: nút 2×, 4×, 8× đổi cỡ ảnh, ảnh luôn `image-rendering: pixelated`; mặc định 4× cho tờ nhân vật và đạo cụ, 2× cho nền.
4. Theo dõi job đợt bằng luồng sự kiện có sẵn (cách `useJob.ts` của Anime làm), tải lại bảng khi job `asset-batch` kết thúc.
5. Thêm vùng `series` vào `ui/ownership.json`.
6. Chữ trên giao diện tiếng Việt dễ hiểu, không chen tiếng Anh ngoài tên agent.
7. Test `AssetsTab.test.tsx` (vitest, theo nếp `ui/src/ext/anime/AnimeTab.test.tsx`): hiện thẻ chờ đồng ý, bấm "Đồng ý" gọi đúng route; "Vẽ lại" bị tắt khi chưa có lý do; nút phóng đổi lớp cỡ ảnh; ảnh có `image-rendering: pixelated`.

Tiêu chí thành công: `npm test` xanh (gồm `tsc`, vitest, kiểm sở hữu).

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
command grep -rn "pixelated" "$MS/ui/src/ext/series" | head -2
```

## Task 5.4: Kiểm tích hợp với CLI giả

Bước:
1. Chép series giả sang chỗ tạm: `cp -R "$MS/tests/fixtures/series" "$T/series-gia"` (phase 03 tạo nó; nếu thiếu `characters/`, `backgrounds/`, `props/` thì task 5.2 đã thêm khi viết test duyệt).
2. Trong `$T/root/a-99/BRIEF.md`, đổi dòng `series:` thành `series: $T/series-gia` (đường tuyệt đối đã thay biến). Như vậy mọi lệnh ghi vào series đều rơi vào bản tạm, không vào S thật.
3. Chạy Studio 4420 như task 4.5 (root `$T/root`, CLI giả trong `$T/fakebin`).
4. Nếu runtime có công cụ trình duyệt, mở `http://127.0.0.1:4420/`, chọn `a-99`, mở tab "Tài sản", xem thẻ và bảng, bấm phóng 4×, bấm "Duyệt cả bảng" trên tờ nhân vật. Nếu không có trình duyệt, làm qua route: `GET /api/assets?name=a-99` phải thấy đợt của task 4.5; rồi `POST /api/assets/approve` với `{ "name": "a-99", "batch": "<đợt>", "board": "character:thu", "ids": [<các id keyed>] }`.
5. Dừng Studio thử bằng `node "$MS/bin/motion-studio.mjs" stop` với đúng biến môi trường thử (`MOTION_STUDIO_PORT=4420`, `MOTION_STUDIO_STATE="$T/studio.json"`), rồi kiểm `lsof -i :4420` rỗng.

Tiêu chí thành công: `approval.json` của nhân vật giả có `approved: true` và ngày; S thật không có file nào đổi.

Verify (lấy dấu S trước bước 1, so sau bước 5):
```bash
dau() { find "$S/characters" "$S/backgrounds" "$S/props" -type f -newer "$PLAN/plan.md" 2>/dev/null | wc -l | tr -d ' '; }
before=$(dau)
# … bước 1 đến 5 …
node -e 'const a=require(process.argv[1]);process.exit(a.approved===true&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)?0:1)' "$T/series-gia/characters/thu/approval.json" && echo OK-APPROVAL
test "$(dau)" = "$before" && echo OK-S-UNTOUCHED
lsof -i :4420 >/dev/null || echo OK-STOPPED
```

## Rủi ro

- Phình phạm vi giao diện (Trung bình × Trung bình, rủi ro số một trong báo cáo kongming): tab chỉ gồm thẻ đồng ý, ba loại bảng, phóng ảnh, đánh dấu và hai nút. Không thêm sửa ảnh, kéo thả, hay thư viện series đầy đủ.
- Ghi đè ảnh đã duyệt của tập 1 trong `S/backgrounds` hay `S/props` (Thấp × Cao): route từ chối khi đích có sẵn và khác sha; test có ca này.

## Khôi phục

Revert PR. Nếu đã duyệt thật vào S (chỉ xảy ra ở phase 06), dùng `previous` trong `approval.json` và bản sao lưu của phase 06 để trả lại.

## Kết quả thực hiện (2026-10-24)

Mọi task 5.1–5.4 xong, mọi Verify qua; chi tiết ở `reports/phase-05-tab-tai-san-bang-duyet.md`. Tóm tắt:
- PR https://github.com/abm-dungtq/motion-studio/pull/26, squash-merge `f60d9ed` trên `main` (sau `42fefcb` của PR vá bảo mật #25, rebase sạch), thân commit sạch.
- 5.1: `studio-gates.test.mjs` 10 pass. 5.2: `asset-approve.test.mjs` 6 pass. 5.3: `npm test` node 443 test (441 pass, 2 skip có sẵn), ui 41 file / 247 pass, kiểm sở hữu 6/6; `pixelated` có trong `ui/src/ext/series/Zoom.tsx`.
- 5.4: Studio 4420 (pid 42022, đã dừng) root `$T/root`, CLI giả `$T/fakebin`, a-99 trỏ `series: $T/series-gia`. Đợt `thu-5` (2 tư thế `thu` + 1 nền) qua thẻ đồng ý, job exit 0, `keyed` cả 3. Bấm "Duyệt cả bảng" trên "Tờ nhân vật thu" bằng trình duyệt (ui/scripts/shoot.mjs): `OK-APPROVAL`, `OK-S-UNTOUCHED`, `OK-STOPPED`; một biên nhận `asset-approve`, quét chuỗi giống token chỉ thấy trường `sha256`. pid 4317 (82168) không đổi.
- Lệch so với phase: sửa thêm `ui/src/integration.test.tsx` (ghim danh sách tab trên rail, nay có `series-assets`); fixture `tests/fixtures/series/` không sửa, test chép rồi thêm `writable.backgrounds` và công cụ tách nền vào bản chép; "Duyệt cả bảng" duyệt ảnh `keyed`, ảnh `needs_review` chỉ khi được đánh dấu; `ui-card`, `thumbnail` không có bảng; `docs/assets.md` chưa ghi route duyệt (không thuộc file sở hữu).

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.
