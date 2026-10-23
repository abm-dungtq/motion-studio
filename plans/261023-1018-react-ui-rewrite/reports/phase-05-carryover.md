# Việc phase 5 phải làm thêm (gom từ báo cáo các vùng)

- voice-music: bỏ lớp `div role="group" aria-label` tạm quanh thanh âm lượng trong `MusicTab`, vì Slider đã gắn `aria-label` lên thumb (commit dd4aa3d).
- fx: thử lại áp chuyển cảnh cho shot s3 chọn bằng cách bấm trên timeline (nhánh fx thử trên s1 vì chưa có timeline).
- fx: chụp lại `fx-noshot` với một dự án có manifest nhưng không có shot, để thấy đúng trạng thái "Chọn một shot trên timeline để áp chuyển cảnh".
- media: "Thêm" bị tắt ở dự án chỉ xem theo phase file (bản cũ không tắt); giữ như phase file. Sửa `docs/extensions.md` mục "Kéo footage": `MEDIA_DRAG` nay ở `ui/src/core/dnd.ts`. Bấm lại INSP-17 (Gợi ý B-roll) sau khi có timeline.
- shell: ScrollArea đã sửa gốc (viewport con là block); kiểm lại bằng mắt mọi panel với tên file dài.
