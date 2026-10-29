# Ảnh và clip AI cho shot qua gflow-cli

Studio tạo một ảnh hoặc một clip AI cho một shot bằng [gflow-cli](https://github.com/ffroliva/gflow-cli) (lệnh `gflow`). gflow điều khiển Google Flow bằng trình duyệt, dùng tài khoản Google đã đăng nhập sẵn trong gflow. Studio chạy `gflow` như một tiến trình con, chờ nó xong rồi xử lý file. Ảnh vào `assets/gen/image/`, clip vào `assets/gen/video/`. Sau đó file được gắn vào shot thành một phiên bản mới, Undo được. Với clip, đạo diễn nhận thêm một yêu cầu đặt clip vào timeline, tắt tiếng.

Mỗi clip tốn credit Flow. Theo tài liệu gflow, ảnh nano miễn phí theo thực nghiệm nhưng có quota ngày. Studio chỉ gửi khi bạn bấm nút và xác nhận. Prompt và ảnh tham chiếu rời khỏi máy và đi lên Google Flow.

## Cần gì

- `gflow` bản 0.90 hoặc 0.91 (chạy thật với 0.90.0; 0.91.0 mới đối chiếu changelog và mã thoát), mặc định ở `~/.local/bin/gflow`. Bản khác vẫn chạy, nhưng chip agent ghi "chưa kiểm với Studio". Khi đó Studio không tin mã thoát mà luôn đối chiếu danh mục trước khi kết luận.
- Đã chạy `gflow auth login` một lần cho profile sẽ dùng.
- Một profile gflow: đặt `videogen.profile`, hoặc để trống thì Studio dùng profile mặc định của gflow.

Studio không đọc thư mục profile, cookie hay cấu hình của gflow. Của danh sách profile, Studio chỉ lấy tên. Email tài khoản không đi vào sổ, biên nhận, log job hay API.

Đừng để một app tự động hoá Flow khác và gflow cùng điều khiển một tài khoản Google một lúc.

## Cấu hình

Khoá `videogen` trong `studio.json`:

| Khoá | Mặc định | Nghĩa |
|---|---|---|
| `gflow_bin` | `~/.local/bin/gflow` | Đường dẫn tuyệt đối tới `gflow`; nhận `~/`. |
| `profile` | (profile mặc định của gflow) | Tên profile gflow. Chỉ chữ, số, `.`, `_`, `-`. |
| `model` | `veo-lite` | Model video mặc định: `omni-flash`, `veo-lite`, `veo-fast`, `veo-quality`. |
| `image_model` | `nano2` | Model ảnh mặc định: `nano2`, `nano2.1`, `nano-pro`, `nano2-lite`. |
| `daily_clips` | `20` | Số clip tối đa mỗi ngày gửi từ Studio (0–500). |
| `daily_images` | `30` | Số ảnh tối đa mỗi ngày gửi từ Studio (0–500). |

Chip agent (góc phải) có dòng "Google Flow (gflow)": có `gflow` chưa, phiên bản, profile, số video và ảnh hôm nay trên trần, Flow có đang chặn không. Nút "Kiểm đăng nhập" chạy `gflow auth status` (miễn phí, không mở trình duyệt). Lệnh chỉ chạy khi bạn bấm.

## Dùng thế nào

Chọn shot, mở mục "AI (Google Flow)" trong inspector, rồi chọn Ảnh hoặc Video. Mỗi phần giữ nguyên chữ đã gõ khi bạn chuyển qua lại.

**Ảnh**

1. Điền mô tả ảnh.
2. Chọn kiểu: Chỉ chữ hoặc Theo ảnh mẫu (lấy một ảnh đang gắn vào shot).
3. Chọn model và khung: 16:9, 9:16, 1:1, 4:3 hoặc 3:4.
4. Bấm "Tạo ảnh AI" rồi xác nhận.

Hai ảnh phải cách nhau ít nhất 30 s, vì Flow chặn khi tạo ảnh dồn dập. Ảnh đã gắn vào shot dùng được ngay làm ảnh đầu hoặc ảnh cuối cho clip.

**Video**

1. Điền mô tả chuyển động.
2. Chọn kiểu: Chỉ chữ, Ảnh đầu, hoặc Ảnh đầu + cuối.
3. Chọn model.
4. Chọn độ dài: 4, 6 hoặc 8 s. Riêng `omni-flash` có thêm 10 s. Mặc định là mức ngắn nhất phủ hết shot.
5. Chọn khung 16:9 hoặc 9:16. Riêng `omni-flash` chọn thêm chất lượng 720p hoặc 360p nháp; model khác không nhận chất lượng (gflow dừng nếu gửi `--resolution`).
6. Bấm "Tạo clip AI" rồi xác nhận.

Mỗi lúc chỉ có một lượt gflow trên toàn Studio, vì gflow giữ một khoá cho mỗi profile.

## Huỷ và "Ngừng chờ"

Đang tạo thì mục này hiện "Đang tạo … AI…" kèm một nút:

- **Huỷ**, trước khi prompt được điền: chưa gửi gì tới Flow, không tốn credit.
- **Huỷ**, khi prompt đã điền: nếu Flow kịp nhận lệnh thì vẫn tính credit. Lần đó thành "chưa rõ".
- **Ngừng chờ**, sau khi đã gửi: Studio dừng gflow, nhưng Flow vẫn tạo và vẫn tính credit. Không có hoàn credit. Với clip, Studio tự đối chiếu ngay (xem dưới), rồi bạn bấm "Tải về từ Flow" (miễn phí). Với ảnh, mở Flow, lưu ảnh rồi dùng "Nhập file đã tải".

Studio dừng gflow bằng SIGINT, để gflow tự đóng trình duyệt. Sau vài giây, nếu gflow hay trình duyệt còn sống, Studio giết cả cây tiến trình.

Khi gflow đã thoát mà trình duyệt nó mở vẫn còn sống, Studio giết trình duyệt ngay, để profile không bị khoá cho lượt sau.

Tắt Studio giữa lúc đang tạo cũng dừng gflow như trên. Lần đó thành "chưa rõ", lỗi ghi "Studio tắt…" để phân biệt với Huỷ hay Ngừng chờ của bạn, và Studio không tự đối chiếu; mở lại rồi bấm "Đối chiếu".

## Khi kết quả "chưa rõ"

Studio ghi một dòng vào sổ trước khi chạy gflow. Sổ nằm ngoài dự án, trong thư mục state, mỗi ngày một file. Mỗi dòng chỉ chạy gflow một lần. Studio theo dõi log của gflow để biết prompt đã điền chưa và lệnh đã gửi chưa. Mã thoát trước khi gửi (đăng nhập hết hạn, profile đang bận, hết credit…) được tính là không tốn. Lỗi sau khi gửi được tính là có thể đã tốn.

Trên flow.google.com, gflow không ghi sự kiện gửi cho ảnh. Vì vậy ảnh được coi là đã gửi ngay khi prompt đã điền.

Studio không bao giờ tự gửi lại. Với một lần chưa rõ hoặc đã tạo trên Flow, danh sách bên dưới cho các việc sau:

- **Đối chiếu** (miễn phí): Studio đọc danh mục cục bộ của gflow (`gflow data list`). Một dòng được coi là khớp khi cùng project Flow, đúng prompt, tạo không sớm hơn 5 s trước lúc gửi, không lỗi, và chưa có trong sổ. Thấy đúng một dòng khớp thì lần đó thành "đã tạo trên Flow, chưa tải về". Không thấy, hoặc thấy nhiều dòng, thì vẫn là "chưa rõ"; khi đó mở Flow kiểm.
- **Tải về từ Flow** (chỉ clip, miễn phí): chạy `gflow data download` rồi gắn clip vào shot. Tải hỏng thì đợi vài phút, vì Flow có thể còn đang tạo. Ảnh không tải lại được bằng gflow.
- **Nhập file đã tải**: chọn file bạn đã lưu từ Flow (`.mp4` cho clip; `.png`, `.jpg`, `.webp` cho ảnh). Studio chép file vào `assets/gen/<kind>/`, không ghi đè, rồi gắn vào shot.
- **Dùng file tạm**: hiện khi gflow đã ghi được file trước khi lượt tạo dừng hoặc lỗi sau lúc điền prompt. File đó có thể là kết quả đã trả tiền, nên Studio giữ lại thay vì xoá. Bấm để gắn file này vào shot như Nhập file.

Flow trả ảnh dạng JPEG, nên ảnh thường lưu là `.jpg`. Khi gflow trả nhiều kết quả, Studio giữ hết (`<shot>-<id>.jpg`, `<shot>-<id>-2.jpg`, ...) và gắn file đầu.
- **Tạo lại**: bấm lại nút tạo với đúng yêu cầu ấy. Studio hỏi thêm một lần vì có thể tốn credit lần hai.

"Đúng yêu cầu ấy" nghĩa là trùng shot, prompt, kiểu, model, khung, độ dài, chất lượng và nội dung ảnh tham chiếu. Studio chỉ xét lần mới nhất của yêu cầu đó trong 7 ngày:

- Lần đó là clip đã tạo trên Flow: Studio không cho tạo lại mà đề nghị tải về (miễn phí). Chỉ khi một lần tải về đã hỏng và lần tạo đã quá 10 phút (Flow có thể còn đang tạo) thì mới tạo lại được, sau khi xác nhận.
- Lần đó chưa rõ, hoặc là ảnh đã tạo trên Flow: tạo lại sau khi xác nhận lần hai.
- Lần đó đã có file: tạo lại không hỏi thêm, và tốn credit thêm lần nữa (mỗi lần ra một biến thể).

Nếu `history_prompts = "redacted"` trong cấu hình gflow, danh mục không lưu prompt, nên Đối chiếu luôn ra "chưa rõ".

## Flow chặn (WAF)

Khi gflow báo Flow chặn vì gửi quá nhiều (mã 10), Studio không gửi gì trong 45 phút. gflow tự khuyên chờ vài giờ; 45 phút chỉ là mức tối thiểu Studio chặn. Lần bị chặn lúc gửi tính là không tốn. Riêng ảnh: Flow tạo ảnh xong rồi mới tải về, nên nếu bị chặn sau khi đã điền prompt thì ảnh có thể đã được tạo. Studio vẫn chặn 45 phút, đồng thời đối chiếu danh mục và tính lần đó là có thể đã tốn.

## Project Flow

Mỗi dự án Studio có một project Flow riêng cho mỗi profile, tên `<tên dự án>-<6 ký tự>`. Studio tạo project ở lần tạo đầu tiên. Nếu project bị xoá trên Flow, lần sau gflow báo không tìm thấy; Studio quên project đó và lần bấm kế tiếp tạo project mới.

## Đạo diễn

Đạo diễn (`claude -p`) không chạy được gflow:

- `Bash(*gflow*)` nằm trong danh sách tool bị chặn;
- env của job trỏ `GFLOW_CLI_HOME` vào một thư mục rỗng, nên gflow không thấy profile nào và dừng trước khi mở trình duyệt.

Ảnh và clip AI chỉ được tạo qua nút của Studio.

## Biên nhận

File tạo xong có biên nhận `op: "videogen"`. File tải lại có `op: "videogen-recover"`, file nhập tay có `op: "videogen-import"`. Cả ba ghi `tool.name: "gflow"` (xem [receipts.md](receipts.md)). Clip có thể lệch độ dài vài khung so với độ dài đã chọn, nên biên nhận có thể báo `duration-match` fail. Đó chỉ là cảnh báo; clip vẫn dùng được.

## HTTP

| Route | Việc |
|---|---|
| `GET /api/videogen/status` | `gflow` có chưa, phiên bản, profile, số clip và ảnh hôm nay, WAF, job đang chạy |
| `POST /api/videogen/auth` | `gflow auth status` của profile (miễn phí) |
| `POST /api/videogen/shot` | Tạo clip (`name`, `shot`, `base`, `prompt`, `mode`, `model`, `aspect`, `seconds`, `resolution?`, `refs`, `again?`) |
| `POST /api/videogen/image` | Tạo ảnh (`name`, `shot`, `base`, `prompt`, `mode`, `model`, `aspect`, `refs`, `again?`) |
| `POST /api/videogen/recover` | Tải lại một clip đã tạo trên Flow |
| `POST /api/videogen/reconcile` | Đối chiếu một lần chưa rõ với danh mục gflow |
| `POST /api/videogen/cancel` | Huỷ hoặc ngừng chờ lượt đang chạy của dự án |
| `GET /api/videogen/items?name=` | Các lần tạo của dự án trong 7 ngày |
| `POST /api/videogen/attach` | Gắn file đã tải về |
| `POST /api/videogen/import` | Nhập file đã lưu từ Flow (`path`), hoặc file tạm của chính lượt đó (`part: true`) |

Mã lỗi của các route tạo:

| Mã | Khi nào |
|---|---|
| 503 | Không có `gflow` |
| 412 | Chưa có profile |
| 429 | Flow đang chặn, hoặc ảnh cách lần trước dưới 30 s |
| 403 | Quá trần ngày |
| 409 `DUPLICATE` | Lần trước của đúng yêu cầu ấy chưa rõ |
| 409 `RECOVERABLE` | Flow đã tạo clip; tải về thay vì tạo lại |
| 409 (không mã) | Đang có lượt khác |

## Giới hạn

- Mỗi lần một ảnh hoặc một clip, mỗi lúc một lượt trên toàn Studio.
- Chưa có nối dài clip, nâng độ phân giải, nhân vật hay `components`.
- Trần ngày chỉ đếm lượt gửi từ Studio, không đếm lượt tạo trên Flow hay script khác.
- Shot dài hơn độ dài clip chỉ được phủ phần đầu; nên tách shot.
- Bộ kiểm thử dùng một `gflow` giả (`tests/fake-gflow.mjs`) mô phỏng log, mã thoát và JSON của bản 0.90 và 0.91 (0.91 không đổi mã thoát, sự kiện hay JSON mà Studio đọc). Đã chạy thật một lần với gflow 0.90.0 (27/10/2026): ảnh nano2, một lượt huỷ, clip veo-lite 4 s từ ảnh đầu rồi Tải về từ Flow. Clip veo-lite về 1280x720 dù dự án 1920x1080; Studio không phóng to.

## Nguồn

[ffroliva/gflow-cli](https://github.com/ffroliva/gflow-cli): USAGE.md (mã thoát, biến môi trường) và mã nguồn bản 0.90, 0.91.
