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

`asset_batch` (hay `POST /api/assets/batch`) kiểm file đợt rồi ghi một thẻ đồng ý, chưa tốn lượt nào. Thẻ ghi số ảnh, agent sẽ vẽ, số lượt vẽ ước tính, số lượt Codex tối đa và mức dùng 5 giờ của từng tài khoản codex-pool, ví dụ "Đợt hero: 4 ảnh, codex-pool, ước 4 lượt vẽ, tối đa 16 lượt Codex (gồm một lần vẽ lại tự động khi ảnh có chữ hoặc sai số hình, và đọc ảnh tự kiểm); acct1 còn 62% trong 5 giờ". Mức tối đa (`estimate.codex_max`) theo đúng cách đợt chạy: ảnh có kiểm `no_text` hoặc `single_figure` tối đa 2 lượt vẽ và 2 lượt đọc, ảnh khác 1 lượt mỗi loại; lượt vẽ tính khi danh sách agent vẽ có một agent Codex, lượt đọc tính khi danh sách agent đọc ảnh có một agent Codex (agent đứng trước hết lượt thì việc rơi xuống Codex).

Thẻ duyệt đúng nội dung nó cho xem. Thẻ ghi `digest` (sha256 của file đợt lúc tạo thẻ). Lúc đồng ý, Studio tính lại; file đã đổi thì không vẽ gì, thẻ cũ thành `declined` với `stale: true`, và route trả 409 kèm thẻ mới theo file hiện tại (`consent` trong câu trả lời). Gọi `asset_batch` lại khi file chưa đổi thì nhận lại thẻ đang chờ; file đã đổi thì thẻ cũ bị huỷ và có thẻ mới. Cùng luật áp cho thẻ lồng tiếng, Voice Design, thumbnail và tải Drive ([series.md](series.md)).

Thẻ là file `.opus/consent/<id>.json`:

```json
{ "id": "c-…", "kind": "codex", "title": "…", "count": 4, "estimate": { … }, "quota": { … },
  "action": { "name": "asset-batch", "args": { "batch": "hero" } }, "digest": "<sha256>",
  "status": "waiting", "created": "…", "decided": null, "by": null }
```

`kind` là `codex`, `elevenlabs` hoặc `drive`; thẻ dùng chung cho mọi việc tốn lượt. Việc chạy khi đồng ý là một action đăng ký theo tên (`registerAction` của `lib/consent.mjs`), thẻ không chứa mã. Một thẻ chỉ trả lời được một lần; lần hai là 409. Đồng ý mà action lỗi (ví dụ dự án đang chạy một đợt khác) thì thẻ về lại `waiting` kèm `error`, hỏi lại được. Mỗi câu trả lời ghi biên nhận `consent` (ai, khi nào, việc gì, số ước tính).

## Chạy đợt

Đồng ý thẻ thì Studio chạy job `asset-batch` của dự án (`node lib/assets/batch.mjs run <json>`), một đợt mỗi dự án một lúc. Trong job:

1. Số ảnh vẽ cùng lúc là số lượt cùng lúc của agent ảnh đầu tiên chọn được ([agents.md](agents.md#số-lượt-chạy-cùng-lúc)): với codex-pool là số tài khoản còn lượt, chỉnh bằng `agents.parallel`.
2. Mỗi ảnh vẽ vào `assets/gen/raw/<id>.png`. Tên đã có thì thêm `-2`, `-3`; ảnh cũ không bị ghi đè hay xoá. Mỗi lần vẽ có biên nhận `image-generate`.
3. Agent đọc ảnh kiểm ảnh mới (cùng tối đa hai ảnh tham chiếu) và trả JSON: `right_character`, `single_figure` (`pose`, `prop`), `flat_green` (khi nền xanh), `no_text`, `note`. `right_character` chỉ được hỏi khi ảnh có `character` và một ảnh tham chiếu là của chính nhân vật đó (đường của nó có thư mục `<id>` hay `<id>-hd`, như `refs/<id>/…`, `characters/<id>/…`); tham chiếu chỉ là nét vẽ hay bảng màu chung thì không kiểm cái này. Mỗi lần đọc có biên nhận `image-check`, vì agent đọc ảnh có thể là codex-pool.
4. Chỉ trượt `no_text` hoặc `single_figure` mới vẽ lại tự động, một lần, prompt thêm "Sửa lỗi lần trước: <note>". Trượt các kiểm khác (`flat_green`, `right_character`), hay trượt lần hai, thì ảnh ở `needs_review` cho bảng duyệt (vẫn được tách nền để xem), không tốn thêm lượt.
   Đọc ảnh lỗi (agent không trả lời, JSON hỏng) không phải là trượt kiểm: ảnh không bị vẽ lại, lên bảng với `needs_review`, `unchecked: true` và lý do "chưa kiểm được: …"; bảng ghi "cần xem · chưa kiểm được".
5. Tách nền bằng công cụ của series, chạy như `series_tool` (cờ kiểm theo khai báo, biên nhận `series-tool`): `pose` và `prop` qua `import-sprite --in <raw> --out assets/gen/keyed/<id>.pxl --height|--width … --preview assets/gen/keyed/<id>.png` (`prop` ưu tiên `--width`); `background` qua `quantize --in <raw> --out assets/gen/keyed/<id>.png --w 480 --h 270`; `ui-card`, `thumbnail` giữ nguyên ảnh vẽ. Series phải khai báo `import-sprite` và `quantize` với các cờ đó.
6. Agent từ chối vẽ một ảnh thì ảnh đó `failed` kèm lý do, các ảnh khác vẫn chạy.
7. Hết lượt ở mọi agent: ảnh chuyển `waiting_quota`, Studio quét lại quota mỗi 60 giây, tối đa 30 phút kể từ lần hết lượt đầu tiên; quá hạn thì dừng đợt với thông báo tiếng Việt. Ảnh đã xong được giữ.

Dòng cuối của job là `RESULT {"ok", "batch", "counts", "passed", "review", "stopped", "message"}`.

### Bị ngắt và chạy tiếp

Đợt bị cắt giữa chừng (job bị huỷ hay chết, Studio dừng lúc đang vẽ) thành "bị ngắt", ở cả hai lối:

- Job kết thúc bất thường: lúc job dừng, Studio thấy trạng thái còn `running` thì đánh dấu ngay (runner tự đánh dấu khi nhận SIGTERM).
- Studio khởi động lại: mọi đợt còn `running` mà không có job chạy được đánh dấu trước khi phục vụ. `GET /api/assets` và nút Duyệt bảng cũng đánh dấu một trạng thái mồ côi như vậy.

Khi đó `running: false`, `stopped: true`, `interrupted: true`; ảnh đang `queued`, `drawing`, `checking`, `keying` hay `waiting_quota` thành `interrupted` (việc đang làm ghi ở `interrupted_at`); ảnh đã xong giữ nguyên, ảnh đã vẽ trong `assets/gen/raw/` không mất. Các nút của bảng mở lại. `message` nói còn bao nhiêu ảnh.

`POST /api/assets/resume { name, batch }` (nút "Chạy tiếp" ở tab Tài sản, hiện khi `can_resume`) chạy nốt đúng các ảnh `interrupted`, không cần thẻ mới, với điều kiện: không có job `asset-batch` nào của dự án đang chạy, và file đợt vẫn đúng nội dung thẻ đã duyệt (`digest` trong sổ của Studio). File đã đổi thì 409, cần thẻ mới. Ảnh bị ngắt lúc đang kiểm hay tách nền mà đã có ảnh vẽ thì đi tiếp từ bước đọc, không vẽ lại. Lượt đã tiêu không bị tính lại vào giới hạn vẽ lại.

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
| `needs_review` | trượt kiểm không vẽ lại được (xem bước 4), hoặc chưa kiểm được (`unchecked`); người dùng xem trên bảng duyệt |
| `failed` | bị từ chối hoặc lỗi (xem `error`) |
| `waiting_quota` | chờ lượt, hoặc đợt dừng vì hết lượt |
| `interrupted` | đợt bị ngắt trước khi xong ảnh này; "Chạy tiếp" làm nốt |
| `approved` | người dùng đã duyệt trên bảng; ảnh có thêm `approved: { at, by, board }` |

## Vẽ lại

- `asset_redo { project, batch, id, reason }`: đạo diễn vẽ lại đúng một ảnh, không cần thẻ, chờ xong rồi trả trạng thái ảnh. Chỉ vẽ lại được ảnh đã có một bản vẽ qua thẻ đồng ý (hay qua nút của người dùng); ảnh chưa vẽ lần nào là 409, lần vẽ đầu cần thẻ. Mỗi ảnh tối đa 3 lần vẽ lại do AI yêu cầu trong một đợt; lần thứ tư trả lỗi "cần người dùng xem". Đạo diễn tự vẽ lại thì không có yêu cầu mới xếp cho nó.
- Sổ đó (ảnh nào đã vẽ qua thẻ, nội dung thẻ đã duyệt, số lần AI yêu cầu vẽ lại) nằm ngoài dự án, ở `<thư mục state của Studio>/ledger/` (cạnh `studio.json`, mặc định `~/.config/motion-studio/ledger/`). Đạo diễn ghi được mọi thứ trong dự án, nên sửa `.opus/assets/<đợt>.json` không đặt lại được bộ đếm.
- `POST /api/assets/redo { name, batch, ids, reason }`: nút "Vẽ lại ảnh đã đánh dấu" của người dùng. Cú bấm là đồng ý, không cần thẻ thứ hai, không giới hạn số lần. Gửi từ bảng duyệt (`from: "board"`) thì bắt buộc có `reason`.

## Duyệt bảng

Đầu tab Tài sản là mọi thẻ đang chờ của dự án (`GET /api/consent`, không riêng thẻ của đợt ảnh), mỗi thẻ một lần. Tab Tài sản xếp ảnh của các đợt thành bảng: `character:<id>` gồm ảnh `pose` của nhân vật đó, `background` gồm ảnh `background`, `prop` gồm ảnh `prop`. `ui-card` và `thumbnail` không có bảng. "Duyệt cả bảng" gửi `POST /api/assets/approve { name, batch, board, ids, notes? }` với mọi ảnh `keyed` của bảng, cộng ảnh `needs_review` người dùng đã đánh dấu; mỗi đợt một lần gọi.

Route kiểm hết rồi mới ghi; một ảnh bị từ chối thì không ghi gì:

- `ids` có 1 đến 50 ảnh, đều thuộc bảng và ở `keyed` hoặc `needs_review`; `notes` tối đa 1000 ký tự. Đợt đang chạy là 409.
- Mọi đích trong series phải nằm trong một thư mục `writable` (so bằng `realpath`), không dưới `S/build`, không phải symlink. Đích đã có cùng nội dung thì nhận; khác nội dung thì 409, không bao giờ ghi đè ảnh đã duyệt. File đã chép vào series được ghi vào sổ của Studio (sha256 từng file); `series_file_put` không bao giờ ghi lên chúng, cũng như lên `approval.json` hay ảnh mà một `approval.json` liệt kê.
- Nhân vật: ảnh vẽ (`raw`) chép sang `target`; ảnh không có `target` thì chỉ ghi đường raw trong dự án vào `images`. Rồi ghi `<characters>/<id>/approval.json` (thư mục đó phải thuộc một khóa writable, như `rig_src`): nội dung cũ giữ nguyên, cộng `{ approved: true, date, by, notes, images, previous }`, với `previous` là bản cũ. File cũ hỏng JSON thì 409.
- Nền: ảnh đã lượng tử hóa chép sang `target`, không có thì `<writable.backgrounds>/<id bỏ bg->.png`, và sang `assets/bg/` của dự án.
- Đạo cụ: `.pxl` đã tách nền chép sang `<writable.props>/<tên>.pxl`, tên lấy từ `target` hoặc id bỏ `prop-`.

Series thiếu khóa writable cần dùng thì 400 nói rõ khóa nào. Sau khi chép, ảnh chuyển `approved`, `DEMO.md` có thêm dòng `- tài sản <bảng>: approved <ai> <giờ> <ids>` phía trên `## Frames`, có biên nhận `asset-approve`, và đạo diễn nhận yêu cầu "Bảng <bảng> đã duyệt: … Làm tiếp: build-rig/props, sync-to-project, dùng tên mới trong scenes." Ảnh trong `assets/gen/raw/` vẫn ở nguyên chỗ.

## Route và tool

| Route | Tool | Việc |
|---|---|---|
| `GET /api/assets?name=` | | Mọi đợt của dự án: ảnh, trạng thái, thẻ đang chờ, job đang chạy |
| `POST /api/assets/batch { name, batch }` | `asset_batch` | Kiểm file đợt, tạo thẻ đồng ý |
| `POST /api/assets/redo { name, batch, ids, reason? }` | `asset_redo` | Vẽ lại ảnh đã chọn |
| `POST /api/assets/resume { name, batch }` | | Chạy nốt các ảnh bị ngắt, không cần thẻ mới (xem [Bị ngắt và chạy tiếp](#bị-ngắt-và-chạy-tiếp)) |
| `POST /api/assets/approve { name, batch, board, ids, notes? }` | | Duyệt ảnh của một bảng và chép vào series (xem [Duyệt bảng](#duyệt-bảng)) |
| | `asset_status { project, batch? }` | Trạng thái từng ảnh; không có `batch` thì liệt kê đợt |
| `GET /api/consent?name=` (`&all=1`) | | Thẻ đang chờ (hay mọi thẻ) |
| `POST /api/consent/answer { name, id, ok }` | | Trả lời thẻ; `ok: true` chạy action và trả `{ card, job }`; nội dung đã đổi thì 409 `{ error, consent }` với thẻ mới |

## Nơi lưu

| Đường (trong dự án) | Có gì |
|---|---|
| `assets/gen/batches/<đợt>.json` | file đợt |
| `assets/gen/raw/` | ảnh vẽ, không bao giờ bị ghi đè hay xoá |
| `assets/gen/keyed/` | ảnh đã tách nền (`.pxl` và ảnh xem trước, hoặc nền đã lượng tử hóa) |
| `.opus/assets/<đợt>.json` | trạng thái từng ảnh |
| `.opus/consent/<id>.json` | thẻ đồng ý |
| `DEMO.md` | một dòng mỗi lần duyệt bảng |
| `.opus/receipts/` | biên nhận `image-generate`, `image-check`, `series-tool`, `consent`, `asset-approve` |

Ngoài dự án: `<thư mục state>/ledger/project-<sha>.json` và `series-<sha>.json`, sổ của Studio (thẻ đã duyệt, ảnh đã vẽ, số lần vẽ lại, câu đã lồng tiếng, file đã duyệt vào series). Chỉ mã của Studio ghi; mode 600.
