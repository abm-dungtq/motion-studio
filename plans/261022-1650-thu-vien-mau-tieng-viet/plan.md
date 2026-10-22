# Thư viện mẫu tiếng Việt (22/10/2026)

Trạng thái: xong.

## Kết quả cần có

Tab Thư viện mẫu của Studio có bốn mục: Video mẫu, Cảnh mẫu, Phong cách, Prompt mẫu. Mỗi mẫu có ảnh xem trước (nếu nguồn có), tên và giải thích tiếng Việt, prompt gốc kèm tác giả và link. Dùng được khi chưa mở dự án (đọc, chép prompt); khi đã mở dự án thì "Dùng cho dự án" gửi đạo diễn kèm prompt và phần giải thích.

## Quyết định của người dùng

- Tuyển khoảng 200 video mẫu để viết giải thích đầy đủ (tên, video làm gì, vì sao đáng học, cách dùng). Các mẫu còn lại có tên tiếng Việt ngắn.
- Tải ảnh bìa về máy một lần, để ngoài repo (`~/.cache/motion-studio/library/thumbs`).
- Dữ liệu nằm trong repo Motion Studio (`library/`), không sửa plugin opus-video.

## Nguồn (commit cố định, đều có LICENSE)

| Repo | Commit | Giấy phép | Lấy gì |
|---|---|---|---|
| yihui-dev/awesome-opus5-5-videos | 92aee2f | MIT | 703 video, prompt, ảnh bìa |
| chuspeeism/awesome-opus-5-5-videos | 028bc52 | MIT | 300 video, tóm tắt tiếng Trung |
| HiAPIAI/awesome-opus-5-5-video-styles | b1a796c | CC-BY-4.0 | 12 công thức phong cách, 425 video gắn phong cách, ảnh tĩnh |
| Li-Evan/awesome-opus-5.5-video-prompts | 7f73121 | CC-BY-4.0 | 334 prompt có lượt xem/lưu, loại prompt, ảnh bìa, bộ công cụ đạo diễn |
| PHY041/claude-motion-playbook | e056bf9 | CC-BY-4.0 | 233 video có danh sách kỹ thuật |
| X-RayLuan/awesome-opus-5-5-video-prompts | b952455 | MIT (không gồm nội dung bên thứ ba) | 83 mô tả và link mã nguồn |

Prompt và video thuộc về tác giả gốc: chỉ trích kèm tên và link, không phân phối lại video.

## Bước

1. `scripts/build-library.mjs`: đọc các bản clone, gộp theo id bài X, ghi `library/library.json` (video, phong cách, kỹ thuật, prompt mẫu) và `library/SOURCES.md`; nhận thêm file `library/vi.json` (phần tiếng Việt) khi gộp.
2. `scripts/library-thumbs.mjs`: tải ảnh bìa về cache, bỏ qua ảnh đã có.
3. Tuyển 200 video (lượt lưu/xem, có prompt đủ, có ảnh, cân thể loại) và viết `library/vi.json` theo lô.
4. Server: `GET /api/library?kind=&q=&cat=&offset=`, `GET /library/thumb/<id>`.
5. Giao diện: bốn mục, thẻ có ảnh, mở xem prompt, nút Chép prompt, Dùng cho dự án.
6. Test, chạy thử trên Studio cổng 4399, cập nhật README và CHANGELOG, commit.

## Tiêu chí xong

- Mục nào cũng trả kết quả khi chưa gõ từ khoá; tìm được bằng tiếng Việt và tiếng Anh.
- 200 video tuyển chọn có đủ bốn phần tiếng Việt; mọi video có tên tiếng Việt.
- Ảnh hiện offline sau khi tải; thiếu ảnh thì hiện khung trống, không lỗi.
- `npm test` qua.
