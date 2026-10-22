# Nguồn của thư viện mẫu

| Repo | Commit | Giấy phép |
|---|---|---|
| https://github.com/yihui-dev/awesome-opus5-5-videos | 92aee2f | MIT |
| https://github.com/chuspeeism/awesome-opus-5-5-videos | 028bc52 | MIT |
| https://github.com/HiAPIAI/awesome-opus-5-5-video-styles | b1a796c | CC-BY-4.0 |
| https://github.com/Li-Evan/awesome-opus-5.5-video-prompts | 7f73121 | CC-BY-4.0 |
| https://github.com/PHY041/claude-motion-playbook | e056bf9 | CC-BY-4.0 |
| https://github.com/X-RayLuan/awesome-opus-5-5-video-prompts | b952455 | MIT (tài liệu và công cụ của repo; nội dung bên thứ ba giữ quyền của tác giả) |

Video, ảnh và prompt thuộc về tác giả gốc; mỗi mẫu ghi tên tác giả và link bài gốc. Thư viện chỉ trích prompt kèm nguồn và không phân phối lại video. Ảnh bìa được tải về máy người dùng (`scripts/library-thumbs.mjs`), không nằm trong repo.

Phần tiếng Việt trong `library/vi/` do Motion Studio viết.

Dựng lại: clone từng repo vào một thư mục trống với tên `owner_repo`, checkout đúng commit, rồi chạy `node scripts/build-library.mjs --src <thư mục>`.
