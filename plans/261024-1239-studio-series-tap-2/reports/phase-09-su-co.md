# Phase 09: sự cố (2026-10-24, Asia/Saigon)

## `film-stills` không khai báo, dòng Verify OK-DECLARED của task 9.1 trượt

Dòng Verify thứ hai của task 9.1 đòi `S/studio-series.json` khai báo cả `scene-preview` lẫn `film-stills`. Chỉ `scene-preview` được khai báo, nên lệnh in `FAIL-DECLARED exit=1`. Đây là quyết định có chủ đích, không phải lỗi bỏ sót.

Nguyên nhân:

1. `validateSeries` của plugin (`opus-video` `scripts/manifest.mjs:250`, main `062c309`) chỉ nhận một kiểu cho `positional`. Dạng `<project> <out.png> <t>...` mà plan mô tả không khai báo được. Muốn khai báo thì phải nới bộ kiểm của plugin (repo khác, ngoài phạm vi phase này) và mở rộng `buildArgv` của Studio.
2. `S/spikes/film-stills.mjs` không chạy đúng trên mẫu tập mới. Nó nạp rig bằng `import` tĩnh, lấy nền từ `<img class="src">` tĩnh và đọc `timing.json`, nên trên a-99 chỉ ra khung trống (xem `phase-09-tham-do.md`). Có khai báo thì đạo diễn cũng chỉ nhận một công cụ cho ảnh sai.

Lời khuyên của kongming (phương án A), đã làm theo:

- Không khai báo `film-stills`, không nới `validateSeries`, không mở rộng `buildArgv`.
- Ghi dòng Verify là trượt kèm nguyên nhân. Kỳ vọng trong plan sai, không phải mã.
- Ảnh ghép 6 khung được cắt từ chính clip nháp bằng ffmpeg (`fps=6/len,scale=640:-2,tile=3x2`), nên luôn khớp hình đã render.

Ảnh hưởng: không có. Thẻ "Nhóm cảnh" có ảnh ghép cho mọi cảnh đã dựng. Ở bước 9.5, `c1-stills.png` và `c2-stills.png` của a-99 đã được tạo.

Khôi phục, nếu sau này cần ảnh ghép theo mốc tuỳ ý: viết lại `film-stills` cho mẫu tập (đọc `scenes/cast.json` và khối TIMING), rồi khai báo nó với `positional` một kiểu và các mốc qua một cờ lặp, khi plugin hỗ trợ.

## Lệch nhỏ so với phần File sở hữu

- Kiểu dữ liệu của `/api/scenes` và `/api/gates/audio-*` nằm ngay trong `ScenesCard.tsx` và `AudioReview.tsx`, không thêm vào `api.ts` hay `types.ts` (hai file này không thuộc phần sở hữu của phase).
- Plugin giả của `tests/audio-review.test.mjs` dùng tham số `extra` của `fakePlugin` và tự ghi script trong test, không sửa `tests/fake-plugin.mjs`.
- Thêm `ui/src/ext/series/scenes-audio.test.tsx` (file mới) và sửa một dòng `ui/src/integration.test.tsx`. Hộp Xuất bản nay có thêm mục `series-audio-review`, mà test này so danh sách mục theo đúng thứ tự.
- Dựng lại cảnh chỉ chạy với dự án thuộc series có khai báo `scene-preview`. Dự án khác nhận 400 và không có nhánh `npx hyperframes snapshot`, vì trang xem trước cần công cụ của series.
