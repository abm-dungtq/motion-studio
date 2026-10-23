# Recipe: impact-frame (khung va chạm anime)

Hai đến ba khung đặc biệt ngay điểm cắt của một đòn đánh. Mỗi khung là âm bản (`invert`) của sân khấu, hoặc bóng đen của nhân vật trên nền trắng (`silhouette`). Kèm theo là tia tốc độ tỏa từ tâm đòn, đổi hình mỗi khung.

## Gắn vào dự án

1. Chép `snippet.js` của gói này vào `assets/fx/impact-frame.js` của dự án, rồi nạp sau GSAP: `<script src="assets/fx/impact-frame.js"></script>`.
2. Chép khối markup trong `snippet.html` vào `#root`, ngay sau phần tử sân khấu (`#stage` hoặc wrapper của các shot). Lớp tia phải nằm **ngoài** phần tử bị đảo màu.
3. Trong script dựng timeline, sau khi đã có `tl`:
   - `at` là giây của điểm cắt vào shot, lấy từ `window.TIMING` hoặc mốc của shot, không gõ tay số giây;
   - gọi `MotionFx["impact-frame"].attach(tl, els, opts)` như ví dụ trong `snippet.html`.
4. Chế độ `silhouette`: `target` là lớp tư thế của nhân vật (đổi thành `brightness(0)`). `card` là một div nền trắng đặt ngay trước nhân vật, trong cùng shot.

## PLAN.md

Cột "Nối sang beat sau" ghi seam của provider đi kèm: `beat-cut`. Gói Studio ghi ở cột "Hình / hiệu ứng", ví dụ "impact-frame 2 khung âm bản tại tâm đòn". Lý do: preflight chỉ nhận seam có trong danh sách seam của provider.

## Luật tất định

- Chỉ dùng `tl.set` tại `at + (k − 0,5)/fps`, không tween opacity, không `onComplete`. Tua tới, tua lui hay nhảy khung đều cho cùng một hình.
- Hình các tia sinh từ PRNG có `seed`. Đổi `seed` thì đổi hình, giữ `seed` thì giữ hình.
- Không dùng nguồn ngẫu nhiên hay đồng hồ của trình duyệt. `frame(t, opts)` là hàm thuần.
- Sau `frames` khung, `filter` của `target` trở về `none` và các lớp phủ ẩn.

## Kiểm

- `npm run check` của dự án phải đạt.
- Snapshot hai lần ở khung `round(at × fps)` phải cho cùng `shasum`.
