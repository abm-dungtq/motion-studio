# Gợi ý hướng, style và quy trình

Tab **Đạo diễn** có một thẻ **Gợi ý cho dự án**, nằm trên khung chat. Thẻ đọc `BRIEF.md` và 300 từ đầu kịch bản của dự án. Từ đó thẻ xếp hạng ba thứ:

- hướng sáng tạo A1 đến A8;
- style: chỉ xét các style mà 2–3 hướng đầu gợi ý, và lọc theo `energy` của brief;
- chế độ vận hành: `dao-dien`, `nhanh`, `tu-nhac` hoặc `timeline`, kèm các bước sẽ chạy, các bước bỏ qua và lý do.

Mỗi mục có một câu lý do nêu trường BRIEF đã dùng. Bên Jev có thêm điểm 0–4. Khi Jev cho độ tin dưới 0,5, thẻ ghi "Jev chưa chắc".

Thẻ không chọn thay bạn. Bạn bấm một hướng, đổi style hay chế độ nếu muốn, rồi bấm **Chọn và tạo pitch**. Studio không tự ghi `BRIEF.md`. Hướng và style chỉ được ghi bằng lệnh `choose` của provider, giống thẻ chọn hướng của đạo diễn.

## Ba nguồn gợi ý

| Nguồn | Thẻ hiện gì |
|---|---|
| `deterministic` | Một cột tất định. Studio dùng lệnh `directions pick` và `styles suggest` của provider, không gọi mạng |
| `observe` | Hai cột ngang nhau, **Jev** và **Tất định**. Không hướng nào được chọn sẵn, và có một dòng so sánh hạng 1 của hai bên. Thứ tự hai cột suy từ hash của brief (xem dưới) |
| `jev` | Một cột Jev. Khi Jev lỗi, thẻ dùng cột tất định và ghi lý do |

Nguồn mặc định hiện tại là `observe`. Chip cạnh tiêu đề thẻ ghi "Jev và tất định, chưa chọn nguồn mặc định", để thẻ không nghiêng về bên nào trước khi có số liệu thật.

**Thứ tự cột.** Người dùng hay nghiêng về cột đọc trước. Vì vậy ở `observe`, Studio lấy chữ số hex cuối của hash brief: chẵn thì Jev bên trái, lẻ thì tất định bên trái. Một brief luôn có cùng một thứ tự. Trên nhiều brief, mỗi nguồn đứng bên trái khoảng một nửa số lần. Server tính thứ tự này (`columnsOf` trong `lib/suggest.mjs`) và trả trong trường `columns` của `GET` và `POST /api/suggest`. Thẻ xếp cột theo đúng trường đó, và log lựa chọn ghi lại cùng giá trị. Khi hướng bạn bấm có ở cả hai cột, style và chế độ đi theo cột bên trái.

Đặt nguồn khác trong `studio.json` (mặc định `~/.config/motion-studio/studio.json`, hoặc file ở `MOTION_STUDIO_STATE`):

```json
{ "suggest": { "source": "deterministic" } }
```

Giá trị lạ hay thiếu khoá thì Studio dùng nguồn mặc định.

Cột tất định luôn được tính. Jev không có khoá, mất mạng, quá 8 giây hay trả lỗi thì thẻ vẫn hiện gợi ý tất định, ghi một câu nói lý do và không chặn giao diện.

## Khoá TypeSafe

Studio đọc khoá Jev từ biến môi trường `TYPESAFE_API_KEY`. Không có biến này thì Studio đọc file khoá mà provider khai. Khoá không bao giờ nằm trong bản ghi gợi ý, log lựa chọn, log server hay câu trả lời của route.

## Ba kết cục của nút chọn

| Kết cục | Khi nào | Studio làm gì |
|---|---|---|
| `chosen` | Hướng đã chọn là một hàng của `pitch/PICK.json` | Chạy lệnh `choose` của provider với số pick đó, thêm style nếu bạn chọn. Nếu đạo diễn đang chờ ở thẻ chọn hướng, Studio trả lời luôn thẻ đó để lệnh chỉ chạy một lần |
| `not_in_pitch` | Có pitch nhưng pitch không có hướng này | Thẻ hiện các hướng đã có trong pitch, xếp theo điểm gợi ý, để bạn chọn lại |
| `queued` | Dự án chưa có pitch | Studio gửi đạo diễn yêu cầu tạo pitch, kèm hướng, style và chế độ bạn nghiêng về. Khi pitch xong, bạn bấm chọn lại trên thẻ |

Với hướng có trong pitch, `BRIEF.md` nhận `direction:` và `style_profile:`. Nếu BRIEF có `lemo_style`, lệnh `choose` của provider giữ style của lớp canvas đó.

## Case mẫu từ thư viện

Khi provider có lệnh gợi ý case (`COMMANDS.suggestCases` của plugin), thẻ hiện thêm mục **Case mẫu từ thư viện**: 2–3 video làm bằng Opus 5.5 hợp với brief, mỗi case có link bài gốc, một dòng mô tả, lý do và link **Xem video demo** (trang demo trong thư viện mẫu) khi case có trang demo khác bài gốc. Jev xếp hạng cả thư viện theo brief (đọc `BRIEF.case-query.json` nếu có, không thì `BRIEF.md`), mất khoảng 2–3 giây.

- Bấm **Gợi ý** chạy lệnh này cùng lúc với phần xếp hạng hướng, khi dự án chưa có `CASES.md`. **Gợi ý lại** chạy lại cả hai.
- Bấm chọn hướng trên dự án chưa có pitch cũng chạy lệnh này trước, vì lệnh tạo pitch của provider từ chối brief mới (`brief_version: 3`) khi người dùng chưa thấy gợi ý case.
- Jev không chạy (thiếu khoá, khoá sai, hết giờ) thì mục này hiện dòng cảnh báo màu đỏ và danh sách chỉ xếp theo từ khoá. Lệnh lỗi hẳn thì thẻ hiện lỗi kèm vài dòng cuối của stderr.
- Lệnh Studio chạy chỉ ghi `<dự án>/CASES.md` (cờ của provider), không ghi `BRIEF.md`; `CASES.md` đủ để lệnh tạo pitch nhận là người dùng đã thấy case. Studio chỉ chạy lệnh và đọc file.
- Link **Xem video demo** chỉ hiện khi case có trang demo riêng; video chỉ nằm trong bài gốc thì link tên case là đủ.
- Muốn làm theo một case, người dùng nhắn đạo diễn (ví dụ "theo case 2"). Đạo diễn dùng skill case của provider: viết prompt của case chuyển thể cho video này, giải thích vì sao dùng prompt đó và gửi lại link video demo trong biên nhận. Thẻ không có nút chọn case.

## Ba tính năng của provider, phát hiện tự động

Studio tự dò ba tính năng mới của provider và đổi hành vi theo đó, không cần sửa Studio:

- **`suggestCases`** (lệnh gợi ý case, mục trên). Khi chưa có, thẻ không có mục case.

- **`pitchInit`** (lệnh tạo pitch với hướng cho trước). Khi có, nút chọn trên dự án chưa có pitch sẽ tạo pitch với hướng bạn chọn đứng đầu, rồi chạy `choose` hàng 1. Kết cục khi đó là `chosen`, kèm `initialized: true`. Khi chưa có, kết cục vẫn là `queued`.
- **Op `set_workflow_mode`** của cổng lệnh. Khi có, chế độ vận hành được ghi vào trường `workflow_mode` của `project.json` qua cổng lệnh, với actor `human`. Khi chưa có, chế độ chỉ đi trong lời yêu cầu gửi đạo diễn, và thẻ nói rõ "chưa lưu vào project.json".

## Giới hạn hiện tại

Cho tới khi provider phát hành hai tính năng trên:

- chế độ vận hành chưa được lưu vào `project.json`;
- chọn một hướng khi dự án chưa có pitch phải nhờ đạo diễn tạo pitch trước.

## Log lựa chọn thật

Mỗi lần nút chọn trả 200 trên dự án đã có bản ghi gợi ý, Studio nối một dòng JSON vào `<dự án>/.opus/suggest/picks.jsonl`. Một dòng có các trường:

| Trường | Nghĩa |
|---|---|
| `at`, `project` | Giờ bấm và tên dự án |
| `hash`, `record_at`, `record_source` | Hash của brief đã gợi ý, giờ tạo bản ghi gợi ý, và nguồn lúc đó |
| `jev`, `det` | Top 3 hướng, top 3 style và chế độ của mỗi bên; `jev` là `null` khi Jev không chạy |
| `columns` | Thứ tự cột bạn thấy, từ trái sang phải, ví dụ `["det","jev"]`; một phần tử khi thẻ chỉ có một cột |
| `chosen` | Hướng, style và chế độ bạn đã bấm; style và chế độ là `null` khi không chọn |
| `direction_from`, `style_from` | Hướng hay style bạn chọn nằm trong top 3 của bên nào: `jev`, `det`, `both` hoặc `none` |
| `outcome` | `chosen`, `not_in_pitch` hoặc `queued` |

Thư mục `.opus/` đã nằm trong `.gitignore` của dự án.

Route ghi một dòng cho cả ba kết cục, `chosen`, `not_in_pitch` và `queued`. Dòng nào cũng có hướng bạn đã bấm trong `chosen.direction`. Lệnh chọn lỗi (422) hay yêu cầu sai (400, 409) không ghi dòng nào.

**Một lượt** là một cặp (dự án, hash của brief), và chỉ tính **lượt bấm đầu tiên** của cặp đó, bất kể kết cục. Lý do: lượt đầu là ý định thật của bạn. Nếu bạn bấm một hướng Jev mà pitch chưa có, kết cục là `not_in_pitch` và thẻ mời bạn bấm lại một hướng trong pitch. Các hàng pitch đến từ chính bên tất định, nên lượt bấm sau gần như luôn trúng tất định. Nếu đếm lượt cuối, log sẽ lệch có hệ thống về tất định. Khi hai dòng cùng giờ, dòng ghi trước được giữ. Nếu dòng đầu tiên không có Jev (Jev lỗi lúc đó, thẻ chỉ có cột tất định), cả lượt bị bỏ, vì bạn chưa thấy hai bên cạnh nhau khi chọn.

**Quyết định sau 30 lượt.** Chạy:

```bash
node scripts/suggest-eval.mjs --picks --root /Volumes/2/Edit-Video
```

Lệnh in đúng một dòng `decision: jev|deterministic|wait (<n>/30 …)` và không gọi Jev. Một bên trúng @3 khi hướng bạn chọn nằm trong 3 hướng đầu của bên đó.

- Chưa đủ 30 lượt thì in `wait`, và Studio giữ nguồn `observe`.
- Đủ 30 lượt và Jev hơn tất định ít nhất 10 điểm hit@3 thì nguồn mặc định thành `jev`.
- Đủ 30 lượt mà Jev hơn dưới 10 điểm thì nguồn mặc định thành `deterministic`. Đường Jev vẫn giữ trong code, và bạn bật lại được bằng `"suggest": { "source": "jev" }` hoặc `"observe"` trong `studio.json`.

Báo cáo đếm thêm `from`, tức hướng đã chọn đến từ nguồn nào. Dòng `picks position` đếm, trên các lượt có hai cột, hướng đã chọn nằm ở cột trái, cột phải, cả hai hay không cột nào, kèm số lượt Jev đứng bên trái và số lượt tất định đứng bên trái. Nếu cột trái thắng rõ dù hai nguồn đổi chỗ đều nhau, người dùng đang chọn theo vị trí. Dòng ghi trước khi có trường `columns` được đọc theo bố cục cũ: Jev bên trái khi `record_source` là `observe`.

Thẻ chọn sẵn style đầu tiên hợp với hướng đã bấm. Vì vậy cột style trong báo cáo phần lớn phản ánh mặc định đó, không hẳn là lựa chọn của bạn. Style không quyết nguồn mặc định.

## Lần đo đầu trên nhãn (chỉ để tham khảo)

Trước khi có lựa chọn thật, `node scripts/suggest-eval.mjs` đo trên các brief có nhãn. Kết quả nằm trong [`plans/261023-1529-jev-style-suggest/reports/suggest-eval-261023.json`](../plans/261023-1529-jev-style-suggest/reports/suggest-eval-261023.json). Lần đo này không quyết định gì và không đổi nguồn mặc định.

| Tập | Số mẫu | Tất định hit@1 / hit@3 | Jev hit@1 / hit@3 |
|---|---|---|---|
| Tập vàng (case và dự án có nhãn) | 14 | 7,1 / 64,3 | 42,9 / 71,4 |
| Proxy theo `category` | 78 | 61,5 / 100 | 61,5 / 94,9 |
| Proxy theo `genre` | 127 | 22,0 / 70,1 | 47,2 / 80,3 |

Trên tập vàng, Jev hơn tất định 7,1 điểm hit@3, dưới ngưỡng 10 điểm. Với 14 mẫu, một mẫu đã bằng 7,1 điểm, nên số này chưa đủ để quyết. Hai tập proxy lệch sẵn: tập `category` nghiêng về bên tất định, còn tập `genre` nghiêng về Jev vì nhãn `genre` do chính Jev gắn.

## Route và tool

- `GET /api/suggest?name=<dự án>`: bản ghi gợi ý đã lưu, thứ tự cột `columns` (`null` khi chưa có bản ghi), các hàng pitch, nguồn đang dùng, các chế độ của provider, và hai cờ `can_save_mode`, `can_init_pitch`.
- `POST /api/suggest` với `{ name, refresh? }`: xếp hạng, hoặc dùng lại bản ghi khi brief không đổi. Trả 409 khi dự án chưa có `BRIEF.md`.
- `POST /api/suggest/choose` với `{ name, direction, style?, mode? }`: lần bấm chọn của bạn, trả một trong ba kết cục ở trên. Chế độ vận hành chỉ được ghi sau khi biết kết cục, với `chosen` hoặc `queued`. Kết cục `not_in_pitch` và lệnh chọn lỗi không ghi chế độ.
- Tool MCP `style_suggest` với `{ project, refresh? }`: dùng chung phần xếp hạng với các route, ghi bản ghi vào `<dự án>/.opus/suggest/latest.json` để thẻ hiện, và trả `sources`: mỗi nguồn một mục có `source`, nhãn (`Jev` hoặc `Tất định`) và top 3 hướng, top 3 style cùng quy trình. Ở `observe` có cả hai nguồn, xếp theo thứ tự cột của thẻ, kèm câu `compare` nhắc đạo diễn nêu hai nguồn ngang nhau. Ở `deterministic`, `jev`, hay khi Jev lỗi, `sources` chỉ có nguồn đang hiện. Tool không chạy lệnh chọn và không ghi `BRIEF.md`. Xem [`mcp.md`](mcp.md).

## Chi phí

Một lần gợi ý gửi Jev hai request và dưới 25 câu hỏi. Lần chạy thật trên dự án mẫu dùng 15 câu hỏi, 5.672 token vào và 252 token ra. Theo giá 0,042 USD cho mỗi triệu token vào, một lần gợi ý tốn khoảng 0,0003 USD. Bản ghi `latest.json` lưu `questions` và `usage`, nên bạn xem được số thật của từng lần. Brief không đổi thì Studio dùng lại bản ghi cũ và không gọi Jev.
