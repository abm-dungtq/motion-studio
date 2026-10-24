# Vẽ ảnh theo đợt

Tập của một series (xem [series.md](series.md)) cần nhiều ảnh mới cùng lúc: tư thế nhân vật, nền, đạo cụ, thẻ màn hình, thumbnail. Studio vẽ chúng theo đợt: đạo diễn viết một file đợt, người dùng đồng ý một lần trên thẻ, Studio vẽ cả đợt song song qua agent ảnh ([agents.md](agents.md)), tự kiểm từng ảnh, tách nền bằng công cụ của series, rồi báo đạo diễn làm tiếp. Không có gì được chép vào thư mục series ở bước này: ảnh chỉ vào kho series khi người dùng duyệt bảng.

## File đợt

`assets/gen/batches/<đợt>.json` của dự án là một mảng, mỗi ảnh một phần tử:

```json
[
  { "id": "hero-sit-phone", "kind": "pose", "character": "hero", "prompt": "…",
    "refs": ["S/refs/hero/design.png"], "background": "green", "size": "1024x1024",
    "target": "S/refs/hero/poses/sit-phone.png", "import": { "height": 195 } }
]
```

| Khóa | Luật |
|---|---|
| tên đợt, `id` | `^[a-z0-9][a-z0-9-]{0,60}$`; `id` không trùng trong đợt; tối đa 50 ảnh một đợt |
| `kind` | `pose`, `background`, `prop`, `ui-card`, `thumbnail` |
| `prompt` | bắt buộc, tối đa 4000 ký tự; Studio thêm khuôn `image_styles[kind]` của series |
| `character` | id nhân vật; bắt buộc với `pose` |
| `refs` | tối đa 8 ảnh; `S/<đường>` trong một thư mục `read` của series, hoặc đường trong dự án |
| `background` | `green` (mặc định của `pose`, `prop`, `ui-card`) hoặc `none` (mặc định của `background`, `thumbnail`) |
| `size` | dạng `1024x1024`, tùy chọn |
| `target` | `S/<đường>.png` trong một thư mục `writable` của series (`{char}` lấy từ `character`); nơi ảnh được chép khi duyệt |
| `import` | `pose`, `prop`: `height` hoặc `width` (cỡ trong rig, bắt buộc một trong hai); `background`: `w`, `h` (mặc định 480×270) |

Đường không được có `..`, đoạn bắt đầu bằng dấu chấm, `\`, đường tuyệt đối, hay nằm dưới `S/build`.

## Thẻ đồng ý

`asset_batch` (hay `POST /api/assets/batch`) kiểm file đợt rồi ghi một thẻ đồng ý, chưa tốn lượt nào. Thẻ ghi số ảnh, agent sẽ vẽ, số lượt vẽ ước tính và mức dùng 5 giờ của từng tài khoản codex-pool, ví dụ "Đợt hero: 4 ảnh, codex-pool, ước 4 lượt vẽ; acct1 còn 62% trong 5 giờ". Một đợt chỉ có một thẻ đang chờ; gọi lại thì nhận lại thẻ đó.

Thẻ là file `.opus/consent/<id>.json`:

```json
{ "id": "c-…", "kind": "codex", "title": "…", "count": 4, "estimate": { … }, "quota": { … },
  "action": { "name": "asset-batch", "args": { "batch": "hero" } },
  "status": "waiting", "created": "…", "decided": null, "by": null }
```

`kind` là `codex`, `elevenlabs` hoặc `drive`; thẻ dùng chung cho mọi việc tốn lượt. Việc chạy khi đồng ý là một action đăng ký theo tên (`registerAction` của `lib/consent.mjs`), thẻ không chứa mã. Một thẻ chỉ trả lời được một lần; lần hai là 409. Đồng ý mà action lỗi (ví dụ dự án đang chạy một đợt khác) thì thẻ về lại `waiting` kèm `error`, hỏi lại được. Mỗi câu trả lời ghi biên nhận `consent` (ai, khi nào, việc gì, số ước tính).

## Chạy đợt

Đồng ý thẻ thì Studio chạy job `asset-batch` của dự án (`node lib/assets/batch.mjs run <json>`), một đợt mỗi dự án một lúc. Trong job:

1. Số ảnh vẽ cùng lúc là số lượt cùng lúc của agent ảnh đầu tiên chọn được ([agents.md](agents.md#số-lượt-chạy-cùng-lúc)): với codex-pool là số tài khoản còn lượt, chỉnh bằng `agents.parallel`.
2. Mỗi ảnh vẽ vào `assets/gen/raw/<id>.png`. Tên đã có thì thêm `-2`, `-3`; ảnh cũ không bị ghi đè hay xoá. Mỗi lần vẽ có biên nhận `image-generate`.
3. Agent đọc ảnh kiểm ảnh mới (cùng tối đa hai ảnh tham chiếu) và trả JSON: `right_character` (khi có `character`), `single_figure` (`pose`, `prop`), `flat_green` (khi nền xanh), `no_text`, `note`. Mỗi lần đọc có biên nhận `image-check`, vì agent đọc ảnh có thể là codex-pool.
4. Trượt kiểm thì vẽ lại tự động một lần, prompt thêm "Sửa lỗi lần trước: <note>". Trượt lần hai thì ảnh ở trạng thái `needs_review` cho bảng duyệt (vẫn được tách nền để xem).
5. Tách nền bằng công cụ của series, chạy như `series_tool` (cờ kiểm theo khai báo, biên nhận `series-tool`): `pose` và `prop` qua `import-sprite --in <raw> --out assets/gen/keyed/<id>.pxl --height|--width … --preview assets/gen/keyed/<id>.png` (`prop` ưu tiên `--width`); `background` qua `quantize --in <raw> --out assets/gen/keyed/<id>.png --w 480 --h 270`; `ui-card`, `thumbnail` giữ nguyên ảnh vẽ. Series phải khai báo `import-sprite` và `quantize` với các cờ đó.
6. Agent từ chối vẽ một ảnh thì ảnh đó `failed` kèm lý do, các ảnh khác vẫn chạy.
7. Hết lượt ở mọi agent: ảnh chuyển `waiting_quota`, Studio quét lại quota mỗi 60 giây, tối đa 30 phút kể từ lần hết lượt đầu tiên; quá hạn thì dừng đợt với thông báo tiếng Việt. Ảnh đã xong được giữ.

Dòng cuối của job là `RESULT {"ok", "batch", "counts", "passed", "review", "stopped", "message"}`.

Đợt do người dùng chạy (đồng ý thẻ, hay bấm vẽ lại) kết thúc thì đạo diễn nhận một yêu cầu mới: "Đợt <tên> xong: <a> ảnh đạt, <b> ảnh cần xem. Gọi asset_status rồi làm tiếp (nhập rig, nền, đạo cụ) sau khi người dùng duyệt bảng."

## Trạng thái

`.opus/assets/<đợt>.json`, ghi nguyên tử sau mỗi thay đổi:

```json
{ "batch": "hero", "started": "…", "ended": "…", "running": false, "stopped": false, "message": null,
  "items": { "hero-sit-phone": { "status": "keyed", "raw": "assets/gen/raw/hero-sit-phone.png",
    "keyed": "assets/gen/keyed/hero-sit-phone.pxl", "preview": "assets/gen/keyed/hero-sit-phone.png",
    "receipt": ".opus/receipts/…", "tries": 1, "reasons": [], "error": null, "check": { … }, "ai_redos": 0 } } }
```

| `status` | Nghĩa |
|---|---|
| `queued`, `drawing`, `checking`, `keying` | đang chạy |
| `keyed` | vẽ, qua kiểm, đã tách nền vào `assets/gen/keyed/` |
| `ready` | vẽ, qua kiểm, không cần tách (`ui-card`, `thumbnail`) |
| `needs_review` | trượt kiểm hai lần; người dùng xem trên bảng duyệt |
| `failed` | bị từ chối hoặc lỗi (xem `error`) |
| `waiting_quota` | chờ lượt, hoặc đợt dừng vì hết lượt |

## Vẽ lại

- `asset_redo { project, batch, id, reason }`: đạo diễn vẽ lại đúng một ảnh, không cần thẻ, chờ xong rồi trả trạng thái ảnh. Mỗi ảnh tối đa 3 lần vẽ lại do AI yêu cầu trong một đợt; lần thứ tư trả lỗi "cần người dùng xem". Đạo diễn tự vẽ lại thì không có yêu cầu mới xếp cho nó.
- `POST /api/assets/redo { name, batch, ids, reason }`: nút "Vẽ lại ảnh đã đánh dấu" của người dùng. Cú bấm là đồng ý, không cần thẻ thứ hai, không giới hạn số lần.

## Route và tool

| Route | Tool | Việc |
|---|---|---|
| `GET /api/assets?name=` | | Mọi đợt của dự án: ảnh, trạng thái, thẻ đang chờ, job đang chạy |
| `POST /api/assets/batch { name, batch }` | `asset_batch` | Kiểm file đợt, tạo thẻ đồng ý |
| `POST /api/assets/redo { name, batch, ids, reason? }` | `asset_redo` | Vẽ lại ảnh đã chọn |
| | `asset_status { project, batch? }` | Trạng thái từng ảnh; không có `batch` thì liệt kê đợt |
| `GET /api/consent?name=` (`&all=1`) | | Thẻ đang chờ (hay mọi thẻ) |
| `POST /api/consent/answer { name, id, ok }` | | Trả lời thẻ; `ok: true` chạy action và trả `{ card, job }` |

## Nơi lưu

| Đường (trong dự án) | Có gì |
|---|---|
| `assets/gen/batches/<đợt>.json` | file đợt |
| `assets/gen/raw/` | ảnh vẽ, không bao giờ bị ghi đè hay xoá |
| `assets/gen/keyed/` | ảnh đã tách nền (`.pxl` và ảnh xem trước, hoặc nền đã lượng tử hóa) |
| `.opus/assets/<đợt>.json` | trạng thái từng ảnh |
| `.opus/consent/<id>.json` | thẻ đồng ý |
| `.opus/receipts/` | biên nhận `image-generate`, `image-check`, `series-tool`, `consent` |
