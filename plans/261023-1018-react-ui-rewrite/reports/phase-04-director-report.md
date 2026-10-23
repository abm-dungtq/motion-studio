# Vùng director: chat đạo diễn, thẻ cổng và inspector Shot

Nhánh `feat/react-ui-director`, cắt từ `feat/react-ui` sau tag `ui-contracts-v1`, đã merge `origin/feat/react-ui` mới nhất (gồm sửa hợp đồng `a8a4ed4`).

## Việc đã làm

**Tab Đạo diễn** (`ui/src/panels/director`, khe `right.director`, `registerSection("director", { id: "chat", order: 10 })`), chép từ `public/panels.js`:

- `DirectorChat.tsx`: Storyboard, chat gom luồng theo `follows` (`threads.ts`), 12 luồng cuối, khối đang làm, ô giao việc. Chat bám cuối, kể cả khi nội dung còn giãn ra sau lần vẽ đầu. Khi một thẻ đang sống được vẽ lại thì giữ đúng chỗ của thẻ. Có `aria-live="polite"`.
- `Turn.tsx`: mọi trạng thái `queued`, `running`, `waiting_user`, `done` (có hoặc không có câu hỏi), `failed`, kể cả câu hỏi hết hạn với nút "Trả lời lại". Nút "Huỷ yêu cầu".
- `GateCard.tsx`: thẻ chọn hướng có ảnh theo từng lựa chọn, thẻ duyệt animatic (video, link, "Chưa được" mở ô lý do, "Duyệt") và thẻ trả lời chữ. Trong lúc gửi, `lock` tắt mọi nút. Lỗi hiện ngay trong thẻ bằng `answerFailure`. Câu hỏi hết hạn gửi qua `actions.reask`. Thẻ render với `key={cardKey(...)}` nên React giữ nguyên nút DOM.
- `usePressGate.ts`: dùng `pressGate()` của `core/gate-cards.ts`. Khi chuột hoặc Space đang nhấn trong cột phải thì giữ nguyên danh sách request và job cũ. Khi nhả, hoặc cửa sổ `blur`, thì áp danh sách mới bằng `setTimeout(…, 0)`, sau sự kiện `click`.
- `memo.ts`: store riêng của vùng, giữ `reopen`, `rejecting` và nháp của thẻ khi vẽ lại hay đổi tab.
- `Working.tsx`: dòng "Đạo diễn đang làm…" kèm 3 dòng log cuối, hoặc "Đang khởi động…" khi chưa có log.
- `Composer.tsx`: nội dung ô gắn với `store.directorDraft`; Cmd/Ctrl+Enter để gửi, gửi xong thì xoá.
- `Thumb.tsx`: ảnh nhỏ của file dự án, chép từ `thumb()` trong `public/dom.js`.

**Tab Shot** (`ui/src/panels/inspector`, khe `right.shot`): sáu lần `registerInspectorSection`, mỗi loại một view với `order: 0`, chép từ `public/inspector.js`:

- Các view `ShotView`, `LineView`, `MusicView`, `EventView`, `BeatView` và `WordView`, cùng `RetimedNote` ở đầu mỗi view.
- Phần dựng op tách ra `ui/src/core/inspector-ops.ts`, gồm các hàm thuần `shotOps`, `musicForm`, `musicOps`, `eventOps`, `canDeleteEvent` và `wordFields`.
- Dự án chỉ xem thì mọi trường bị khoá, chỉ ô ghi chú chuyển động và nút "Nhờ đạo diễn" vẫn dùng được.
- `bus` `focus-note` đưa con trỏ vào ô `motion-note`.

## Test

- `npm test` ở gốc repo: node `pass 315`, `fail 0`. Vitest `160 passed` (sau khi merge các vùng khác), `tsc --noEmit` sạch.
- Test của vùng: 38 test trong 4 file. `inspector-ops.test.ts` có 7 test, `DirectorChat.test.tsx` 10, `GateCard.test.tsx` 10 và `Inspector.test.tsx` 11. Chúng kiểm:
  - luồng theo `follows` và giới hạn 12 luồng;
  - Cmd+Enter gửi đúng một lần, ô trống thì hiện toast;
  - bấm lựa chọn 2 gửi `value "2"` và mọi nút bị khoá trong lúc chờ;
  - hết giờ thì hiện đúng chữ của `answerFailure`;
  - thẻ vẫn là cùng một phần tử DOM (`===`) sau khi danh sách đổi;
  - chuỗi `pointerdown` → danh sách đổi → `pointerup` → `click` chỉ gửi `answer` đúng một lần;
  - nhánh từ chối animatic, giữ nháp, lỗi 500, trả lời lại câu hỏi hết hạn;
  - `shotOps` và `musicOps`;
  - nút xoá SFX chỉ hiện với SFX thêm từ Studio;
  - `retimed`, dự án chỉ xem, `focus-note`, view mốc phách và mốc từ.

## Thử trực tiếp

Trên cổng 4415 (PID 89747, đã dừng, `lsof` trống), mọi dòng nhóm `4d` đều đạt `có`; chi tiết ở `reports/parity-director.md`. Không chạy `claude -p` lần nào (runner `mcp`). Thẻ cổng dùng `seed-gate-cards.mjs`.

Ảnh chụp (`shoot.mjs` in `ok 6`): `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/director/{1440,2560}/{director,gate-direction,inspector-shot}.png`.

## Yêu cầu đổi hợp đồng

- `ui/src/shell/InspectorHost.tsx`: cần fallback "Mục mở rộng lỗi: <message>" cho mục inspector bị lỗi (STATE-29, EXT-03). Orchestrator đã sửa ở `a8a4ed4`, nhánh này đã merge. Chi tiết ở `reports/contract-requests-director.md`.

## Ghi chú tài liệu (cho phase 5)

- `docs/extensions.md`, mục inspector:
  - `studio.addInspectorSection({ kinds, view(pick, m) })` nay là `registerInspectorSection({ id?, kinds, order?, component })`;
  - `component` nhận `{ pick, m }`;
  - phần lõi đăng ký với `order: 0`, extension mặc định `100`;
  - mục ném lỗi chỉ hỏng phần của nó và hiện "Mục mở rộng lỗi: …".
- Mục về thẻ cổng:
  - thẻ là `GateCard`, khoá bằng `cardKey`;
  - chat không đổi trong lúc đang nhấn (`usePressGate`);
  - extension thêm phần vào tab Đạo diễn bằng `registerSection("director", …)`, phần lõi ở `order: 10`.

## Ghi chú khác

- Số lựa chọn "Chuyển cảnh vào" lấy theo `/api/directions` của provider đang cài: 37 seam cộng "(không)". Checklist cũ ghi 97 trên 4411; công thức không đổi.
- Lớp `.sel` trên khối shot khi chọn câu hoặc SFX (INSP-24) do timeline vẽ từ `store.sel`; phần của vùng này là `setPick` đặt đúng `sel` (đã thử: chọn `sfx-whoosh` thì `sel` = `s1`).
