# Yêu cầu đổi hợp đồng: vùng export

Trạng thái: mục 1 đã được orchestrator sửa trên `feat/react-ui` (`61397b3`), đã merge và thử lại trên 4416: đạt.

## 1. Escape đóng hộp thoại agent phải trả focus về chip (AGENT-15)

- **File:** `ui/src/shell/AgentDialog.tsx` (và một thuộc tính nhận diện trên nút ở `ui/src/shell/AgentChip.tsx`).
- **Hiện tượng (thử trên 4416):** mở chip, bấm Escape: hộp thoại đóng nhưng `document.activeElement` là `body`. Bản cũ trả focus về `#agent-chip` (`public/agent.js:94-100`, `close(true)` gọi `chip.focus()`).
- **Nguyên nhân:** Radix Dialog ở chế độ modal chặn auto-focus mặc định khi đóng và chỉ focus `context.triggerRef`, tức là một `DialogTrigger`. Chip mở hộp thoại bằng `useStudio.getState().openDialog("agent")` (`ui/src/shell/AgentChip.tsx:21`), không phải `DialogTrigger`, nên `triggerRef` rỗng và focus rơi về `body`. `ui/src/components/ui/dialog.tsx` không xử lý `onCloseAutoFocus`.
- **Đề xuất:**
  - `AgentChip.tsx`: thêm `data-agent-chip` vào nút.
  - `AgentDialog.tsx`, trên `DialogContent`:
    `onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLElement>("[data-agent-chip]")?.focus(); }}`
  - Hộp thoại Xuất bản có cùng hiện tượng: menu "Cổng & tệp đã xuất…" không phải `DialogTrigger`. Checklist không có dòng nào cho focus của hộp thoại đó, nên đây chỉ là ghi chú.
- **Tác động lên vùng này:** không đổi file nào của vùng export. Khi sửa xong, AGENT-15 thử lại bằng Escape trên 4416.
