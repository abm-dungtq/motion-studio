---
phase: 4
title: "Vẽ ảnh theo đợt qua Codex, có thẻ đồng ý (C)"
status: done
effort: 6h
depends_on: ["phase-03"]
---

# Phase 04: Vẽ ảnh theo đợt

## Bối cảnh

Studio đã có `generateImage` (codex-pool → codex → agy → gemini, chuyển agent khi hết lượt, dừng khi bị từ chối, có biên nhận; `lib/agents/index.mjs:248-281`). Ba chỗ chặn quy trình đợt ảnh của tài liệu (mục 5.2):

1. Route ảnh chỉ một việc `image` mỗi dự án (`routes/agents.mjs:41`) và chỉ nhận ảnh tham chiếu trong dự án (`routes/agents.mjs:38`).
2. Trong một tiến trình, mỗi agent chỉ chạy một lượt một lúc (`lib/agents/index.mjs:159-167`), nên chạy nhiều ảnh trong một job vẫn thành tuần tự.
3. Chưa có thẻ đồng ý trước khi tốn lượt.

Phase này thêm job "đợt ảnh" chạy N ảnh song song trong một tiến trình con, khóa agent có N chỗ, thẻ đồng ý dùng chung (phase 07 và 10 dùng lại), tự kiểm từng ảnh, tách nền bằng công cụ series, và báo đạo diễn khi đợt xong.

## Repo, nhánh, PR

Motion Studio, nhánh `feat/asset-batch`, PR "feat(assets): vẽ ảnh theo đợt có thẻ đồng ý và tự kiểm". Merge cuối phase.

## File sở hữu

- Sửa: `lib/agents/index.mjs` (khóa nhiều chỗ), `lib/agents/cli/codex-pool.mjs` (hàm `parallel`), `lib/config.mjs` (khóa `agents.parallel` trong SETTINGS nếu chưa có chỗ), `tests/agents-registry.test.mjs`, `tests/fake-cli.mjs` (chế độ hết lượt theo tài khoản), `docs/agents.md`, `CHANGELOG.md`.
- Tạo: `lib/consent.mjs`, `lib/assets/batch.mjs`, `lib/tools/assets.mjs`, `routes/assets.mjs`, `routes/consent.mjs`, `tests/consent.test.mjs`, `tests/asset-batch.test.mjs`, `docs/assets.md`.

## Tốn lượt

Không trong phase này. Mọi phép kiểm dùng `tests/fake-cli.mjs`. Lần chạy thật là phase 06.

## Task 4.1: Khóa agent có N chỗ

Bước:
1. Đổi `locked(id, fn)` thành hàng đợi có `slots` chỗ chạy cùng lúc. `slots` lấy theo thứ tự: `studio.json agents.parallel[id]` (số nguyên 1–4); hàm `parallel(scan)` của adapter nếu có; mặc định 1.
2. `codex-pool.mjs`: `parallel(scan)` trả số tài khoản `ok` trong `quota.accounts` của lần quét (tối thiểu 1, tối đa 4). Đây là mặc định "N bằng số tài khoản còn lượt" của tài liệu; tập 1 chạy 4 việc qua hai tài khoản, nên `agents.parallel["codex-pool"]: 4` chỉnh được.
3. Cập nhật chú thích đầu `lib/agents/index.mjs` ("One run at a time per agent" thành câu mới đúng) và `docs/agents.md`.
4. Test: hai lời gọi `codex-pool` với hai tài khoản `OK` chạy chồng thời gian; với một tài khoản thì tuần tự; agent khác vẫn một chỗ.

Verify:
```bash
cd "$MS" && node --test tests/agents-registry.test.mjs tests/agents-router.test.mjs 2>&1 | tail -3
```

## Task 4.2: Thẻ đồng ý dùng chung (`lib/consent.mjs`, `routes/consent.mjs`)

Bước:
1. Một thẻ là file `.opus/consent/<id>.json`: `{ id, kind: "codex"|"elevenlabs"|"drive", title, count, estimate, quota, action: { name, args }, status: "waiting"|"approved"|"declined", created, decided, by }`. Ghi nguyên tử (file tạm rồi đổi tên).
2. `registerAction(name, fn)` để các phase đăng ký việc chạy khi thẻ được đồng ý (`asset-batch` ở đây; `tts-batch`, `voice-design`, `thumbnail`, `drive-upload` ở phase sau).
3. Route: `GET /api/consent?name=` (thẻ đang chờ), `POST /api/consent/answer { name, id, ok }` → `ok: true` chạy `action` và trả `{ job }`; `ok: false` ghi `declined`. Một thẻ chỉ trả lời được một lần (409 lần hai).
4. Mỗi lần trả lời ghi biên nhận `op: "consent"` (ai, khi nào, việc gì, con số ước tính).
5. Test `tests/consent.test.mjs`: tạo, đồng ý chạy đúng action, từ chối không chạy, trả lời lần hai bị 409, thẻ lạ 404.

Verify:
```bash
cd "$MS" && node --test tests/consent.test.mjs 2>&1 | tail -3
```

## Task 4.3: File đợt và trình chạy đợt (`lib/assets/batch.mjs`)

Bước:
1. File đợt: `assets/gen/batches/<đợt>.json` là một mảng JSON, mỗi ảnh một dòng (đúng mục 5.2 bước 1 của tài liệu):
   ```json
   { "id": "ba-noi-sit-phone", "kind": "pose", "character": "ba-noi", "prompt": "…", "refs": ["S/refs/ba-noi-hd/design.png"],
     "background": "green", "size": "1024x1024", "target": "S/refs/ba-noi-hd/poses/sit-phone.png",
     "import": { "height": 195 } }
   ```
   `kind` ∈ `pose|background|prop|ui-card|thumbnail`; `id` khớp `^[a-z0-9][a-z0-9-]{0,60}$`, không trùng; `refs` tối đa 8, mỗi cái là `S/<rel>` trong `read` của series hoặc đường trong dự án; `target` là `S/<rel>` trong một khóa `writable`.
2. `estimate(batch, scan)` → `{ images, codex_turns: images, accounts: [{ name, h5, reset_h5 }] }`. Thẻ hiện: "Đợt <tên>: <n> ảnh, codex-pool, ước <n> lượt vẽ; acct1 còn <100−h5>% trong 5 giờ".
3. `runBatch({ projectDir, series, batch, ids?, reason?, actor })` trong tiến trình con `node lib/assets/batch.mjs run <json>` (cách `routes/agents.mjs:41` gọi `INDEX generate`):
   - chạy song song tối đa `slots` của agent ảnh đầu tiên chọn được;
   - prompt = `item.prompt` + khuôn `image_styles[kind]` + (có lý do vẽ lại thì) "Sửa theo góp ý: <lý do>";
   - `generateImage({ prompt, refs: <tuyệt đối>, out: <dự án>/assets/gen/raw/<id>.png, project, actor })`; tên đã có thì `placeFree` thêm `-2`, không ghi đè, không xóa ảnh cũ;
   - tự kiểm bằng `describeImages` với schema `{ right_character, single_figure, flat_green, no_text, note }` (bỏ `flat_green` khi `background: "none"`); ghi biên nhận `op: "image-check"` cho mỗi lần đọc ảnh, vì agent đọc ảnh có thể là codex-pool;
   - trượt thì vẽ lại tự động một lần với `note` thêm vào prompt; trượt lần hai thì để trạng thái `needs_review` cho bảng duyệt;
   - tách nền và nhập: `pose`, `prop` nền xanh → công cụ series `import-sprite --in raw --out assets/gen/keyed/<id>.pxl --height|--width … --preview assets/gen/keyed/<id>.png` (`--width` cho `prop`); `background` → `quantize --in raw --out assets/gen/keyed/<id>.png --w 480 --h 270`; `ui-card`, `thumbnail` → không xử lý. Lệnh dựng bằng `buildArgv` của phase 03, chạy bằng `spawnSync` trong tiến trình con. Không dùng `despill` (bàn giao tập 1, "Viền tách nền");
   - hết lượt ở mọi agent: trạng thái `waiting_quota`, chờ 60 giây rồi quét lại quota, tối đa 30 phút, sau đó dừng đợt với thông báo tiếng Việt;
   - trạng thái từng ảnh ghi nguyên tử vào `.opus/assets/<đợt>.json`: `{ items: { <id>: { status, raw, keyed, receipt, tries, reasons, error } } }`.
   - Chưa chép gì vào S ở phase này: chép `raw` sang `target` chỉ xảy ra khi duyệt (phase 05), để ảnh chưa duyệt không lẫn vào kho series.
4. In một dòng `RESULT {…}` cuối cùng (theo `RESULT_PREFIX` của `lib/agents/index.mjs`) để tool đọc kết quả.

Verify:
```bash
cd "$MS" && node --test tests/asset-batch.test.mjs 2>&1 | tail -3
```

## Task 4.4: Tool và route của đợt

Bước:
1. `lib/tools/assets.mjs`:
   - `asset_batch { project, batch }`: kiểm file đợt, tạo thẻ đồng ý `kind: "codex"` với `action: { name: "asset-batch", args: { batch } }`, trả `{ waiting_consent: true, consent, estimate, message: "Chờ người dùng bấm Đồng ý ở tab Tài sản" }`;
   - `asset_redo { project, batch, id, reason }`: vẽ lại đúng một ảnh, không cần thẻ (tài liệu yêu cầu 4: làm lại một ảnh lẻ thì AI tự chạy);
   - `asset_status { project, batch }`: trả trạng thái từng ảnh.
2. `routes/assets.mjs`:
   - `GET /api/assets?name=` (mọi đợt và trạng thái);
   - `POST /api/assets/redo { name, batch, ids, reason }` cho nút "Vẽ lại ảnh đã đánh dấu" của phase 05 (người dùng bấm là đồng ý, không cần thẻ thứ hai);
   - action `asset-batch` đăng ký với `lib/consent.mjs`: `startJob({ kind: "asset-batch" })`, một đợt mỗi dự án một lúc.
3. Job đợt kết thúc → xếp một yêu cầu tiếp cho đạo diễn bằng `queueRequest` (`director.mjs:189-194`): "Đợt <tên> xong: <a> ảnh đạt, <b> ảnh cần xem. Gọi asset_status rồi làm tiếp (nhập rig, nền, đạo cụ) sau khi người dùng duyệt bảng." Làm vậy để "Claude dựng tiếp" mà người dùng không phải gõ gì.
4. `docs/assets.md`: file đợt, thẻ đồng ý, trạng thái, nơi lưu (`assets/gen/raw`, `assets/gen/keyed`, `.opus/assets`, `.opus/consent`).

Tiêu chí thành công (kiểm của mục C trong tài liệu, bằng CLI giả):
- đợt 7 ảnh `pose` chạy xong với 7 biên nhận `image-generate` và 7 ảnh trong `assets/gen/keyed/`;
- khi tài khoản thứ nhất của codex-pool giả bắt đầu trả "out of credits" giữa đợt, đợt vẫn xong;
- số ảnh chạy cùng lúc không vượt `slots`;
- `asset_batch` không tốn lượt nào khi chưa có câu trả lời của thẻ.

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
```

## Task 4.5: Kiểm tích hợp với CLI giả trên Studio thử

Bước:
1. Dựng CLI giả dạng file chạy được trong `$T/fakebin/`: `codex-pool` (lệnh `status` in hai dòng tài khoản đúng dạng ở chú thích đầu `lib/agents/cli/codex-pool.mjs`; lệnh `exec … -i <ảnh>` ghi một PNG 256×256 nền #00FF00 có một khối màu đặc ở giữa (để `import-sprite` có hình để tách) vào thư mục hiện tại và in đường file), `agy` (đọc ảnh, in JSON `{"right_character":true,"single_figure":true,"flat_green":true,"no_text":true,"note":""}`). Viết bằng node, theo hành vi của `fakeAgents` trong `tests/fake-cli.mjs`. `tests/fake-cli.mjs` là adapter trong tiến trình, không phải file chạy, nên phải dựng file riêng.
2. Chạy Studio 4420 với root `$T/root` và `MOTION_STUDIO_AGENT_PATH="$T/fakebin"` (`lib/agents/run.mjs:15-17`: biến này thay cả danh sách đường tìm CLI).
3. Trên `$T/root/a-99` (từ phase 02): viết một file đợt 3 ảnh `pose`; gọi tool bằng `node --input-type=module -e` với `callTool("asset_batch", …, toolEnv({ root: "$T/root" }))` của `lib/tools.mjs` (cùng biến môi trường thử để `studioClient` gọi 4420); đồng ý thẻ qua `POST /api/consent/answer`; chờ job `asset-batch` hết chạy (`GET /api/jobs?name=a-99`).
4. Dừng Studio thử.

Verify:
```bash
node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Object.values(s.items).map(i=>i.status).join(","))' "$T/root/a-99/.opus/assets/<đợt>.json"   # mọi ảnh keyed hoặc needs_review
ls "$T/root/a-99/.opus/receipts"/*/image-generate-*.json | wc -l    # 3
```

## Rủi ro

- Song song làm hai ảnh cùng ghi một file tạm (Thấp × Trung bình): mỗi lượt chạy trong thư mục tạm riêng (`mkdtempSync`, `lib/agents/index.mjs:183`), tên ra qua `placeFree` với `COPYFILE_EXCL`.
- Agent đọc ảnh chấm sai (Trung bình × Thấp): tối đa một lần vẽ lại tự động, rồi bảng duyệt là chốt chặn (tài liệu mục 10).
- Đạo diễn gọi `asset_redo` lặp vô hạn (Thấp × Trung bình): mỗi ảnh tối đa 3 lần vẽ lại qua `asset_redo` trong một đợt, lần thứ tư trả lỗi "cần người dùng xem".

## Khôi phục

Revert PR. Thư mục `assets/gen/` và `.opus/` của dự án thử xóa được; không có gì ghi vào S trong phase này.

## Kết quả thực hiện (2026-10-24)

Mọi task 4.1–4.5 xong, mọi Verify qua; chi tiết ở `reports/phase-04-ve-anh-theo-dot.md`. Tóm tắt:
- PR https://github.com/abm-dungtq/motion-studio/pull/24, squash-merge `bcb7478` trên `main`, thân commit sạch. `npm test`: node 431 test (429 pass, 2 skip có sẵn, 0 fail), ui 240 pass.
- 4.1: `agents-registry` + `agents-router` 14/14; hai tài khoản chạy chồng (`ssee`), một tài khoản và `codex` tuần tự (`sese`), `agents.parallel` thắng, giá trị ngoài 1–4 bị bỏ.
- 4.2: `consent.test.mjs` 4/4. 4.3–4.4: `asset-batch.test.mjs` 7/7 (đợt 7 tư thế, acct1 hết giữa đợt, 7 biên nhận `image-generate`, 7 `.pxl`, chồng tối đa đúng slots; `asset_batch` 0 lượt trước khi đồng ý; `asset_redo` lần thứ tư bị chặn).
- 4.5: Studio 4420 (pid 18910, đã dừng) root `$T/root`, CLI giả `$T/fakebin`; đợt `thu-3` trên `a-99`: `keyed,keyed,keyed`, 3 biên nhận `image-generate`, 0 chuỗi giống token, không file nào vào S. pid 4317 (82168) không đổi.
- Lệch so với phase: thêm `POST /api/assets/batch` để tool tạo thẻ qua Studio; khóa kiểm phụ thuộc loại ảnh (`right_character` khi có `character`, `single_figure` cho `pose`/`prop`); ảnh `needs_review` vẫn được tách nền để bảng duyệt xem; `$T/fakebin` có thêm `codex` giả vì adapter codex-pool cần `codex` trên PATH.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.
