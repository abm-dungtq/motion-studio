# Clip AI cho shot qua G-Labs Studio

Studio tạo một clip Omni Flash cho một shot. Việc tạo đi qua webhook của G-Labs Studio chạy trên cùng máy: Studio gửi yêu cầu, chờ G-Labs tạo xong, tải clip về `assets/gen/video/` rồi gắn clip vào shot thành một phiên bản mới (Undo được). Sau đó đạo diễn nhận yêu cầu đặt clip vào timeline với tiếng tắt.

Mỗi lần tạo tốn credit Flow của tài khoản trong G-Labs; chất lượng 1080p có thể tốn hơn, xem giá trong G-Labs. Studio chỉ gửi khi bạn bấm nút và xác nhận. Prompt và ảnh tham chiếu rời khỏi máy: G-Labs gửi chúng lên dịch vụ Flow.

## Cần gì

- G-Labs Studio đang mở, gói MAX, tab Webhook đã bấm Start (hoặc bật Auto-start).
- Khoá webhook của G-Labs. Studio tìm khoá theo thứ tự:
  1. biến môi trường `G_LABS_WEBHOOK_API_KEY`;
  2. file `glabs.env` nằm cạnh `studio.json` (mặc định `~/.config/motion-studio/glabs.env`), một dòng `G_LABS_WEBHOOK_API_KEY=...`, đặt `chmod 600`.

Nên dùng file khoá. Job đạo diễn (`claude -p`) thừa hưởng env của Studio, còn file thì không. File chấp nhận tiền tố `export ` và giá trị trong nháy đơn hoặc kép; mode khác 600 thì Studio in cảnh báo.

Tạo file mà không để khoá hiện ra màn hình:

```bash
read -s K && printf 'G_LABS_WEBHOOK_API_KEY=%s\n' "$K" > ~/.config/motion-studio/glabs.env && chmod 600 ~/.config/motion-studio/glabs.env && unset K
```

Chạy Studio thử với `MOTION_STUDIO_STATE` riêng thì file khoá phải nằm cạnh file state đó.

## Cấu hình

Khoá `videogen` trong `studio.json`:

| Khoá | Mặc định | Nghĩa |
|---|---|---|
| `glabs_url` | `http://127.0.0.1:8765` | Địa chỉ webhook. Chỉ nhận `http` tới máy này (`127.0.0.1`, `localhost`, `[::1]`). |
| `daily_clips` | `40` | Số clip tối đa mỗi ngày gửi từ Studio. |

Chip agent (góc phải) có dòng "G-Labs (clip AI)": webhook đang chạy hay chưa, có khoá chưa, số clip hôm nay trên trần.

## Dùng thế nào

1. Chọn shot, mở mục "Clip AI (G-Labs)" trong inspector.
2. Điền mô tả chuyển động.
3. Chọn kiểu: Chỉ chữ, Ảnh đầu, hoặc Ảnh đầu + cuối (ảnh lấy từ ảnh đang gắn vào shot).
4. Chọn độ dài (4, 6, 8, 10 s; mặc định là mức ngắn nhất phủ hết shot), chất lượng (720p, 720p + 1080p, 360p nháp chỉ cho Chỉ chữ) và khung 16:9 hoặc 9:16.
5. Bấm "Tạo clip AI" rồi xác nhận.

Mỗi lúc chỉ một clip được tạo trên toàn Studio. Đang tạo thì mục này hiện "Đang tạo clip AI…" kèm nút Huỷ. Huỷ sẽ báo G-Labs dừng task. Credit không được hoàn nếu G-Labs đã nhận task. Nếu G-Labs đã tạo xong và clip đã tải về thì clip vẫn gắn được.

Tắt Studio trong lúc đang tạo không huỷ task: G-Labs vẫn tạo tiếp. Mở Studio lại rồi bấm "Theo dõi tiếp" ở lần tạo đó.

Danh sách bên dưới là các lần tạo của shot trong 7 ngày, kèm việc làm được với từng lần: Gắn vào shot, Theo dõi tiếp, Nhập file đã tải.

## Khi kết quả "chưa rõ"

Studio ghi một dòng vào sổ (ngoài dự án, trong thư mục state, mỗi ngày một file) trước khi gửi, và chỉ gửi một lần cho mỗi dòng. Kết quả thành "chưa rõ" khi:

- G-Labs không trả lời lần gửi, và danh sách task của G-Labs không cho thấy đúng một task khớp;
- G-Labs báo không còn task đó (ví dụ G-Labs khởi động lại);
- Studio bị tắt giữa lúc đang gửi.

Studio không tự gửi lại. Lần chưa rõ có thể đã tốn credit. Kiểm trong G-Labs trước, rồi chọn một trong hai:

- "Nhập file đã tải": chọn file mp4 G-Labs đã lưu (thư mục lưu xem trong Cài đặt của G-Labs). Studio chép file vào `assets/gen/video/` và gắn vào shot.
- Bấm lại "Tạo clip AI" với đúng yêu cầu ấy: Studio hỏi thêm một lần vì có thể tốn credit lần hai.

"Đúng yêu cầu ấy" nghĩa là trùng shot, prompt, kiểu, khung, độ dài, chất lượng và nội dung ảnh. Studio chỉ hỏi thêm khi lần mới nhất của yêu cầu đó trong 7 ngày chưa rõ kết quả. Tạo lại sau khi đã có clip tải về thì Studio không hỏi, và lượt đó tốn credit thêm lần nữa (mỗi lần ra một biến thể).

Nếu G-Labs vẫn đang giữ task của đúng yêu cầu ấy, Studio không gửi lại mà đề nghị theo dõi tiếp task đó (không tốn thêm credit).

## Biên nhận

Clip tải về có biên nhận `op: "videogen"`, file nhập tay có `op: "videogen-import"` (xem [receipts.md](receipts.md)). Omni Flash có thể trả clip lệch độ dài vài khung, nên biên nhận có thể báo `duration-match` fail. Đó là cảnh báo; clip vẫn dùng được.

## HTTP

| Route | Việc |
|---|---|
| `GET /api/videogen/status` | Webhook, khoá, số clip hôm nay, job đang chạy |
| `POST /api/videogen/shot` | Tạo clip cho shot (`name`, `shot`, `base`, `prompt`, `mode`, `aspect`, `seconds`, `resolution`, `refs`, `again?`). 409 `DUPLICATE` khi lần trước chưa rõ, 409 `RESUMABLE` khi G-Labs còn task |
| `POST /api/videogen/resume` | Theo dõi tiếp một task đã gửi |
| `POST /api/videogen/cancel` | Huỷ clip đang tạo của dự án |
| `GET /api/videogen/items?name=` | Các lần tạo trong 7 ngày |
| `POST /api/videogen/attach` | Gắn clip đã tải về |
| `POST /api/videogen/import` | Nhập file mp4 cho lần chưa rõ, lỗi hoặc đã huỷ |

G-Labs đóng thì route tạo trả 503, thiếu khoá trả 412, quá trần ngày trả 403.

## Giới hạn

- Chỉ `omni_flash`; chưa có `components` hay nhân vật.
- Mỗi lúc một clip trên toàn Studio.
- Trần ngày chỉ đếm lượt gửi từ Studio, không đếm lượt tạo trong app G-Labs hay script khác.
- Studio không đọc dữ liệu trong thư mục của G-Labs (tài khoản, token, cấu hình).
- Shot dài hơn 10 s chỉ được phủ 10 s đầu; nên tách shot.

## Nguồn

[WEBHOOK_INTEGRATION.en.md](https://github.com/duckmartians/G-Labs-Studio/blob/main/WEBHOOK_INTEGRATION.en.md) của G-Labs Studio.
