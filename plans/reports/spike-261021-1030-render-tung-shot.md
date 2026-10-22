# Kiểm tra render từng shot (21/10/2026)

Câu hỏi: có xuất được từng shot thành MP4 riêng, nối lại khớp bản final theo từng khung, để làm "bộ lớp dựng" cho Concat, CapCut hay DaVinci không. Đây là điều kiện cần trước khi tích hợp Concat.

## Kết luận

Đạt. Cách làm khả thi là render cả composition một lần ra chuỗi PNG, cắt theo mốc shot đã làm tròn về khung, mã hoá từng shot. Bốn shot nối lại đủ 600 khung, đúng 20,0 giây, khớp vị trí từng khung với bản final và không có khung xấu ở mốc cắt.

HyperFrames không render được riêng một shot: `hyperframes render` (v0.8.149) không có tuỳ chọn khoảng thời gian, và dự án dùng một timeline GSAP chung cho mọi cảnh. Vì vậy "render từng shot" nghĩa là render một lần rồi cắt, không phải render shot độc lập.

## Cách đo

- Dự án: bản sao `thuy-mau-demo` trong `/tmp/shot-spike` (dự án gốc không bị sửa). 4 shot, 30 fps, 1920x1080, 20 giây.
- Render: `hyperframes render --quality delivery --format png-sequence`, 600 khung, mất 3 phút 40 giây.
- Cắt: khung vào = round(start x fps), khung ra = round(end x fps); mã hoá x264 CRF 12; nối bằng concat demuxer, không mã hoá lại.
- So sánh: SSIM từng khung giữa bản nối và (a) bản mã hoá liền một mạch từ cùng chuỗi PNG, (b) bản final đã giao.

## Số đo

| Shot | Khung | Mong đợi | Thực tế |
|---|---|---|---|
| s1 | 0 tới 195 | 195 | 195 |
| s2 | 195 tới 375 | 180 | 180 |
| s3 | 375 tới 525 | 150 | 150 |
| s4 | 525 tới 600 | 75 | 75 |

| So sánh | SSIM trung bình | SSIM thấp nhất |
|---|---|---|
| Bản nối với bản liền một mạch | 0,9953 | 0,9906 |
| Bản nối với bản final | 0,9900 | 0,9869 |
| Bản liền một mạch với bản final | 0,9901 | |
| Bản nối lệch 1 khung với bản final | 0,9655 | |

- Cắt shot không làm giảm chất lượng: bản nối và bản liền một mạch giống bản final ngang nhau. Mức 0,99 là do bản final nén mạnh hơn (7,8 Mb/s so với 9,5 Mb/s).
- Khung khớp đúng vị trí: lệch đi một khung thì SSIM tụt rõ.
- SSIM ở ba mốc cắt (khung 195, 375, 525) không thấp hơn phần còn lại.

## Mốc shot lệch lưới khung

4 trên 8 dự án có mốc shot không rơi đúng khung (ví dụ `abm-intro` có 4,24 s, tức khung 127,2). Sai số làm tròn lớn nhất là 0,5 khung (16,7 ms, ở `ov2-e2e-daodien` và `ov2-e2e-tunhac`). Vì mỗi mốc được làm tròn theo số khung tuyệt đối từ đầu video, không cộng dồn thời lượng từng shot, sai số không tích luỹ qua các shot.

## Điều cần biết khi làm bộ lớp dựng

- Chuyển cảnh nằm sẵn trong hình của từng shot. Ở `thuy-mau-demo`, cảnh trước mờ dần từ 6,3 s tới 6,9 s, nên 0,4 s đầu của s2 còn đuôi cảnh s1. Giữ nguyên thứ tự và độ dài thì không sao; cắt ngắn hay đảo shot trong NLE sẽ lộ phần đuôi đó.
- Âm thanh không cắt theo shot: dùng `audio-mix.mjs --stems` cho giọng, nhạc, SFX và đặt theo thời gian tuyệt đối.
- Chuỗi PNG 1080p tốn khoảng 1,5 GB cho 20 giây; video dài nên render ra MP4 chất lượng cao (CRF thấp) rồi cắt bằng cách mã hoá lại theo khung.

## Bước tiếp theo đề xuất

Viết lệnh xuất bộ lớp dựng (MP4 từng shot, stems, SRT, manifest) trong Motion Studio. Sau đó mới thử tạo dự án Concat từ bộ đó qua `concat --mcp headless` (cần tải Concat, hỏi người dùng trước).
