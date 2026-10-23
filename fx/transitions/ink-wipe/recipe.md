# Recipe: ink-wipe (loang mực)

Mực loang từ điểm (`ox`, `oy`) cho tới khi phủ kín khung. Hai shot đổi chỗ dưới lớp mực, đúng giữa thời lượng. Sau đó mực thủng các lỗ, lỗ lớn dần và mở ra shot mới. Mép mực sần nhờ `feTurbulence` và `feDisplacementMap` với `seed` cố định.

## Vì sao là SVG, không phải shader

Gói `@hyperframes/shader-transitions` chỉ nhận tên shader có sẵn trong registry của nó, không nhận GLSL tuỳ biến. Vì vậy ink-wipe dựng bằng SVG. Bộ lọc SVG chạy được cả khi xem thử lẫn khi render, và cho cùng một kết quả ở cả hai.

## Gắn vào dự án

1. Chép `snippet.js` vào `assets/fx/ink-wipe.js`, rồi nạp sau GSAP.
2. Chép lớp `<svg id="ms-ink">` trong `snippet.html` vào `#root`, đặt trên mọi shot (`z-index` cao). Muốn đổi màu mực thì sửa `fill` của blob và cover.
3. Tạo đủ `blobs` vòng tròn cho mỗi nhóm, rồi gọi `MotionFx["ink-wipe"].attach(tl, els, opts)` như ví dụ:
   - `at` là giây bắt đầu, sao cho `at + duration/2` rơi đúng điểm cắt trong `window.TIMING`;
   - `from` và `to` là hai shot.
4. Đừng tween thêm `opacity` cho hai shot. Gói đã đặt `autoAlpha` bằng `tl.set` ở giữa thời lượng.

## PLAN.md

Cột "Nối sang beat sau" ghi seam của provider đi kèm: `domain-warp`. Gói Studio ghi ở cột "Hình / hiệu ứng", ví dụ "ink-wipe 0,9 s, loang từ góc trái".

## Luật tất định

- Hình mỗi khung chỉ phụ thuộc thời điểm. Tween proxy `{ t }` gọi `frame(t)` rồi ghi `cx`, `cy`, `r`; không cộng dồn gì giữa hai khung.
- Vị trí, cỡ và độ trễ của vệt sinh từ PRNG có `seed`; `seed` của nhiễu ghi vào `feTurbulence` một lần lúc dựng.
- Không dùng nguồn ngẫu nhiên hay đồng hồ của trình duyệt.

## Kiểm

- `npm run check` của dự án phải đạt.
- Snapshot hai lần ở khung `round((at + 0,3) × fps)` phải cho cùng `shasum`.
