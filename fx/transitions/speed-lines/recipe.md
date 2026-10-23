# Recipe: speed-lines (tia tốc độ tỏa tâm)

Chùm tia mảnh tỏa từ tâm (`cx`, `cy`), vẽ trên một canvas. Hình các tia đổi sau mỗi `hold` khung, mặc định hai khung một hình như hoạt hình Nhật. Ở 35 % cuối, tia lùi dần ra mép rồi tắt. Đặt ở điểm cắt để nối hai shot hành động, hoặc chồng lên một cú đánh.

## Gắn vào dự án

1. Chép `snippet.js` vào `assets/fx/speed-lines.js`, rồi nạp sau GSAP.
2. Chép `<canvas id="ms-speed-lines">` trong `snippet.html` vào `#root`, trên shot cần nhấn. Canvas phải có `width` và `height` bằng khung của dự án (1920×1080, hoặc 1080×1920 cho bản dọc). Truyền đúng `width` và `height` đó vào opts.
3. Gọi `MotionFx["speed-lines"].attach(tl, { canvas }, opts)`. `at` lấy từ `window.TIMING` hoặc mốc của shot.

## PLAN.md

Cột "Nối sang beat sau" ghi seam của provider đi kèm: `cinematic-zoom`. Gói Studio ghi ở cột "Hình / hiệu ứng", ví dụ "speed-lines 0,6 s tỏa từ nắm đấm".

## Luật tất định

- Mỗi lần cập nhật, canvas được xoá và vẽ lại toàn bộ từ `frame(t)`. Không cộng dồn giữa hai khung.
- Hình các tia của khung giữ thứ `k` sinh từ PRNG với `seed` và `k`.
- Không dùng nguồn ngẫu nhiên hay đồng hồ của trình duyệt, không tự chạy vòng vẽ riêng. GSAP của HyperFrames gọi `onUpdate` khi tua tới từng khung.

## Kiểm

- `npm run check` của dự án phải đạt.
- Snapshot hai lần ở khung `round((at + 0,1) × fps)` phải cho cùng `shasum`.
