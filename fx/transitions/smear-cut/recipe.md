# Recipe: smear-cut (cắt có khung nhoè kéo giãn)

Ở điểm cắt, khung cuối của cảnh cũ và khung đầu của cảnh mới bị kéo giãn và nhoè theo đúng một trục, theo hướng chuyển động. Mạnh nhất ngay điểm cắt, rồi về bình thường sau `frames` khung. Hợp với cú lia, cú vung, vật bay ngang qua điểm cắt.

## Gắn vào dự án

1. Chép `snippet.js` vào `assets/fx/smear-cut.js` của dự án, rồi nạp sau GSAP.
2. Chép bộ lọc SVG `#ms-smear` trong `snippet.html` vào `#root`, một lần cho cả dự án.
3. Gọi `MotionFx["smear-cut"].attach(tl, { from, to, blur, filterUrl }, opts)`:
   - `from` và `to` là hai shot hai bên điểm cắt;
   - `at` là giây của điểm cắt, lấy từ `window.TIMING` hoặc mốc của shot;
   - `dir` là hướng chuyển động của vật chính.
4. Việc đổi cảnh (`opacity`, `visibility`) vẫn là `tl.set` tại `at` như cũ. Gói này chỉ thêm các khung nhoè.

## PLAN.md

Cột "Nối sang beat sau" ghi seam của provider đi kèm: `whip-pan`. Gói Studio ghi ở cột "Hình / hiệu ứng", ví dụ "smear-cut 2 khung, hướng phải".

**Đừng** ghi `smear-cut` vào cột "Nối sang beat sau" khi provider chưa biết id này. Preflight sẽ đọc phần `cut` của tên thành seam bị cấm.

## Luật tất định

- Chỉ dùng `tl.set` tại nửa khung trước mỗi khung nhoè. Không tween, không callback.
- Độ nhoè là `stdDeviation` một trục của `feGaussianBlur`, không dùng `filter: blur()` (CSS blur nhoè cả hai trục).
- Không có nguồn ngẫu nhiên. `frame(t, opts)` là hàm thuần.
- Sau khung cuối, `transform` và `filter` của hai shot trở về mặc định.

## Kiểm

- `npm run check` của dự án phải đạt.
- Snapshot hai lần ở khung `round(at × fps) − 1` phải cho cùng `shasum`.
