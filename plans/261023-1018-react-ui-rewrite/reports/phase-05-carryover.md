# Việc phase 5 phải làm thêm (gom từ báo cáo các vùng)

- voice-music: bỏ lớp `div role="group" aria-label` tạm quanh thanh âm lượng trong `MusicTab`, vì Slider đã gắn `aria-label` lên thumb (commit dd4aa3d).
- fx: thử lại áp chuyển cảnh cho shot s3 chọn bằng cách bấm trên timeline (nhánh fx thử trên s1 vì chưa có timeline).
- fx: chụp lại `fx-noshot` với một dự án có manifest nhưng không có shot, để thấy đúng trạng thái "Chọn một shot trên timeline để áp chuyển cảnh".
- media: "Thêm" bị tắt ở dự án chỉ xem theo phase file (bản cũ không tắt); giữ như phase file. Sửa `docs/extensions.md` mục "Kéo footage": `MEDIA_DRAG` nay ở `ui/src/core/dnd.ts`. Bấm lại INSP-17 (Gợi ý B-roll) sau khi có timeline.
- shell: ScrollArea đã sửa gốc (viewport con là block); kiểm lại bằng mắt mọi panel với tên file dài.
- lemo: `docs/lemo-styles.md` dòng 1 và 3 đổi tên tab "Phong cách code" thành "Phong cách"; bấm shot s2 trên timeline rồi chụp lại `inspector-lemo` (INSP-19).
- director: bấm lại trên timeline thật các khối beat, word, line, music, event (bản 4d thử bằng hook trình duyệt); `docs/extensions.md` đổi `addInspectorSection` thành `registerInspectorSection`, thêm mục thẻ cổng.
- anime: job xong khi tab đóng thì toast chỉ hiện lúc mở lại tab (bản cũ hiện ngay), cân nhắc chuyển toast lên cấp shell; `docs/anime-motion-comic.md` thêm một câu về vị trí tab trên rail và hộp xác nhận.
- export: thử trực tiếp INSP-18 (biên nhận trong inspector) khi đã có timeline; sửa chữ "tab Xuất bản" ở `docs/receipts.md:15` và `docs/nle-export.md:3` thành menu Xuất bản trên thanh trên.
