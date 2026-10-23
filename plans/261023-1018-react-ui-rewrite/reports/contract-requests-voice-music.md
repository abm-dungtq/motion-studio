# Yêu cầu đổi hợp đồng: vùng voice-music

## 1. `ui/src/components/ui/slider.tsx`: đưa `aria-label` tới thumb

- **File:** `ui/src/components/ui/slider.tsx:36` (`{...props}` đổ hết vào `SliderPrimitive.Root`) và `:52` (`SliderPrimitive.Thumb` không nhận prop nào từ ngoài).
- **Thay đổi đề nghị:** thêm prop tuỳ chọn (ví dụ `thumbLabel?: string`), hoặc tách `aria-label` khỏi `props` rồi gắn vào `SliderPrimitive.Thumb`. Radix chỉ đặt `aria-label` trên phần tử `role="slider"` khi nó được truyền cho `Thumb` (radix `react-slider` `dist/index.mjs:528`: `"aria-label": props["aria-label"] || label`).
- **Lý do:** UI cũ gắn `aria-label="Âm lượng <file>"` thẳng lên `input[type=range]` (`public/panels.js:217`). Với Slider hiện tại, thumb `role="slider"` không có tên truy cập.
- **Cách tạm trong vùng:** `MusicTab.tsx` bọc thanh trong `div role="group" aria-label="Âm lượng <file>"`, nên trình đọc màn hình vẫn đọc nhãn của nhóm. Khi hợp đồng đổi, chuyển nhãn sang Slider và bỏ nhóm.
- **Không chặn:** mọi dòng parity 4c đã đạt với cách tạm.
