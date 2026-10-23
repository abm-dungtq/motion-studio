# Yêu cầu sửa hợp đồng từ vùng timeline

## 1. `ui/src/shell/PointMenu.tsx`: bàn phím của menu chuột phải chưa giống bản cũ

Dòng parity bị ảnh hưởng: KEY-26, KEY-27, KEY-28 (và TL-24 phần Enter).

Bản cũ (`public/context-menu.js:31-56`): mở menu thì focus mục đầu (`focusAt(0)`); ↓/↑ đi vòng (`(i + l.length) % l.length`); Escape **hoặc Tab** đóng menu.

Bản mới, thử trên 4412 (`thuy-mau-demo`, Chrome 1440×900):

- Mở bằng chuột phải thì focus nằm ở khung menu, không ở mục đầu: `document.activeElement.textContent` là cả ba nhãn ghép lại. Bấm ↓ mới tới "Cắt tại playhead (S)", bấm ↑ vẫn ở đó.
- Chuột phải vo-01 rồi bấm Enter ngay thì không có gì chạy và menu vẫn mở. Bản cũ chọn câu ("CÂU vo-01 · …").
- Tab không đóng menu, vì Radix `MenuContent` chặn Tab bằng `preventDefault`.
- Escape đóng, bấm ra ngoài đóng, một lúc chỉ có một menu, phím L trong menu không lọt ra timeline: các phần này đã giống bản cũ.

Đề xuất sửa trong `PointMenuHost`, không đổi API `openPointMenu`:

```tsx
<DropdownMenuContent
  loop
  onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus(); }}
  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Tab") { e.preventDefault(); closePointMenu(); } }}
  …
```

Test kèm trong `PointMenu.test.tsx`: mở xong `document.activeElement` là mục đầu; Enter chạy mục đó; ↑ ở mục đầu nhảy tới mục cuối; Tab đóng menu.

Vùng timeline không sửa file này (nó là hợp đồng chỉ đọc).

**Trạng thái: đã xử lý.** Orchestrator sửa ở `feat/react-ui` commit 6991dd7 (`loop`, focus mục đầu bằng useEffect + setTimeout vì DropdownMenuContent không nhận `onOpenAutoFocus`, Tab đóng menu, có test). Thử lại trên 4412 sau khi merge: KEY-26, KEY-27, KEY-28 đạt.
