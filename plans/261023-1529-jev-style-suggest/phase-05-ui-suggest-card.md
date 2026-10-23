# Phase 5: Thẻ gợi ý trong tab Đạo diễn

- **Nhánh:** `feat/jev-style-suggest` trên checkout chính `/Volumes/2/Motion-Studio`.
- **Phụ thuộc:** phase 4 (hợp đồng HTTP). Không chờ phase 3: nguồn mặc định là `observe` ngay từ phase 2, và quyết định nguồn chờ log đủ 30 lượt.
- **Song song:** với phase 3 và 7. Chạy song song với phase 3 thì phase 3 dùng worktree của nó; phase này làm trên checkout chính.
- **Effort:** 5h.

## Mục tiêu

Tab Đạo diễn có thẻ gợi ý nằm trên khung chat. Thẻ cho thấy:
- 3 hướng xếp hạng;
- style hợp với hướng đang chọn;
- chế độ vận hành, gồm các bước sẽ chạy và các bước bỏ qua.

Trong chế độ `observe` (mặc định cho tới khi log đủ 30 lượt), thẻ hiện hai cột ngang nhau, Jev và Tất định, và không chọn sẵn hướng nào. Lý do: mỗi lần bấm chọn được ghi vào log để so hai nguồn (phase 3, phase 8), nên thẻ không được kéo người dùng về một nguồn. Người dùng bấm "Chọn và tạo pitch". Thẻ gọi `POST /api/suggest/choose` và báo đúng một trong ba kết cục bằng câu tiếng Việt rõ ràng.

## Hiện trạng đã kiểm

- `ui/src/panels/director/index.ts:6-8`: `studio.registerSection("director", { id: "chat", order: 10, component: DirectorChat })`. Thẻ mới đăng ký `order: 5` để nằm trên chat.
- `ui/src/api/queries.ts`:
  - `keys` ở `:24-56` (ví dụ `requests` ở `:29`, `lemoStyles` ở `:52`);
  - đọc theo mẫu `lemoGuideQuery`/`useLemoGuide` ở `:305-309`;
  - `write()` ở `:336-342` invalidate sau khi trả 200;
  - `queue(name)` ở `:345`;
  - mẫu write `lemoApply` ở `:400`.
- Panel không gọi `fetch` trực tiếp mà đi qua `queries.ts`.
- `DirectorChat.tsx:24-26` lấy tên dự án bằng `useStudio((s) => s.name)` và đọc `useProject(name)`.
- Test:
  - `ui/src/shell/test-utils.tsx:41-51` có `mockFetch(routes)` theo pathname và `renderUi`;
  - mẫu mock module và `queryClient.setQueryData` ở `ui/src/panels/director/GateCard.test.tsx:1-27`;
  - fixture `NAME`, `openProject`, `routes` ở `ui/src/panels/director/fixtures.ts`.

## Sở hữu file

- Tạo: `ui/src/panels/director/SuggestCard.tsx`, `ui/src/panels/director/SuggestCard.test.tsx`.
- Sửa: `ui/src/panels/director/index.ts`, `ui/src/api/queries.ts` (chỉ thêm), `ui/src/api/types.ts` (chỉ thêm).
- Không sửa `DirectorChat.tsx`, `GateCard.tsx` và mọi file server.

## Câu chữ hiển thị (chép đúng, không dùng "minh họa")

| Chỗ | Câu |
|---|---|
| Tiêu đề thẻ | `Gợi ý cho dự án` |
| Chưa có gợi ý | `Chưa có gợi ý. Bấm Gợi ý để xếp hạng hướng, style và quy trình cho dự án này.` |
| Nút chạy | `Gợi ý` khi chưa có record, `Gợi ý lại` khi đã có |
| Nút chọn | `Chọn và tạo pitch` |
| Chip nguồn | `Jev` hoặc `Tất định` |
| Dòng so sánh khi observe | `Gợi ý tất định: <nhãn hạng 1>. Trùng với Jev ở hạng 1.` hoặc `Gợi ý tất định: <nhãn hạng 1>. Khác với Jev ở hạng 1.` |
| Dòng bước bỏ qua | `Bỏ qua: <bước> (<lý do>)`, mỗi bước một dòng |
| Kết cục chosen | `Đã chọn hướng <id> với style <style>. BRIEF.md đã được cập nhật.` |
| Kết cục chosen khi `initialized` | `Đã tạo pitch với hướng <id> đứng đầu và chọn hướng này. BRIEF.md đã được cập nhật.` |
| Tiêu đề hai cột khi observe | `Jev` và `Tất định` |
| Nút chọn bị khoá khi observe chưa chọn hướng | `Chọn một hướng ở một trong hai cột để tiếp tục.` |
| Ghi chú dưới ô chế độ khi `can_save_mode` là `false` | `Chế độ này đi kèm lời yêu cầu gửi đạo diễn, chưa lưu vào project.json.` |
| Kết cục queued | `Dự án chưa có pitch. Đã nhờ đạo diễn tạo pitch trước. Khi pitch xong, bạn bấm chọn lại trên thẻ này.` |
| Kết cục not_in_pitch | `Pitch hiện có không gồm hướng này. Chọn một trong các hướng đã có trong pitch bên dưới.` |
| Chế độ chưa lưu | hiện nguyên `mode.reason` từ server |
| Lỗi Jev | hiện nguyên `record.error.message` |
| Lỗi ghi | `Chưa chọn được: <error>` |

## Các task

### Task 5.1 — Kiểu dữ liệu

- **Goal:** TS mô tả đúng record của phase 2 và câu trả lời của phase 4.
- **Target files:** `ui/src/api/types.ts` (thêm ở cuối).
- **Steps:**
  1. Thêm các kiểu sau, kèm comment một dòng trỏ tới `lib/suggest.mjs` và `routes/suggest.mjs`:
     - `SuggestItem { id; label; score: number | null; confidence: number | null; reason: string; source: "jev" | "det"; fields?: string[]; directions?: string[] }`;
     - `SuggestWorkflow { mode; label; pitch: boolean; steps: string[]; skip: { step: string; reason: string }[]; reason: string; source: "jev" | "det"; p?: number }`;
     - `SuggestSide { directions: SuggestItem[]; styles: SuggestItem[]; workflow: SuggestWorkflow }`;
     - `SuggestRecord { v: number; at: string; project: string; hash: string; source: "deterministic" | "observe" | "jev"; shown: "jev" | "det"; error: { code: string; message: string } | null; det: SuggestSide; jev: SuggestSide | null; ms: number; questions: number }`;
     - `SuggestPick { n: number; id: string; style_profile: string | null; dir: string | null }`;
     - `SuggestResponse { record: SuggestRecord | null; picks: SuggestPick[] | null; source: SuggestRecord["source"]; source_setting: string | null; modes: { id: string; label: string }[]; can_save_mode: boolean; can_init_pitch: boolean }`;
     - `SuggestMode { saved: boolean; reason: string | null }`;
     - `SuggestChooseResult` là union theo `outcome` (`chosen` | `not_in_pitch` | `queued`), các trường đúng như hợp đồng ở phase 4.
- **Verify:** `cd /Volumes/2/Motion-Studio/ui && npx tsc --noEmit 2>&1 | wc -l` in `0`.

### Task 5.2 — Query và write

- **Goal:** panel đọc và ghi gợi ý qua `queries.ts`.
- **Target files:** `ui/src/api/queries.ts`: thêm khoá vào `keys` (sau `lemoGuide`, `:53`), thêm khối đọc sau `useLemoGuide` (`:309`), thêm khối ghi sau `lemoKeep` (`:404`).
- **Steps:**
  1. `suggest: (name: string | null) => ["/api/suggest", name] as const,`
  2. Khối đọc:
     ```ts
     // `/api/suggest` — routes/suggest.mjs (the stored ranking, the pitch rows, the modes)
     export const suggestQuery = (name: string | null) => queryOptions({
       queryKey: keys.suggest(name),
       queryFn: () => api<SuggestResponse>(`/api/suggest?name=${enc(name ?? "")}`),
     });
     export const useSuggest = (name: string | null) => useQuery({ ...suggestQuery(name), enabled: Boolean(name) });
     ```
  3. Khối ghi:
     ```ts
     // `/api/suggest` — routes/suggest.mjs (rank now; refresh skips the cache)
     export const suggestRun = (b: NameBody) => write(`/api/suggest`, b, [keys.suggest(b.name)], { timeout: 30000 });
     // `/api/suggest/choose` — routes/suggest.mjs (choose through the provider, or queue a pitch request)
     export const suggestChoose = (b: NameBody) => write(`/api/suggest/choose`, b, [keys.suggest(b.name), keys.projectText(b.name), ...edits(b.name), ...queue(b.name)], { timeout: 150000 });
     ```
  4. Thêm `SuggestResponse` vào dòng import kiểu từ `./types.ts`.
- **Success criteria:** timeout 30 s đủ cho hai request Jev 8 s, mỗi request có 1 lần retry. Timeout 150 s của lệnh chọn đủ cho `pitchInit` (120 s ở server) khi plugin có lệnh đó.
- **Verify:** `cd /Volumes/2/Motion-Studio/ui && npx tsc --noEmit 2>&1 | wc -l` in `0`.

### Task 5.3 — `SuggestCard.tsx`

- **Goal:** thẻ hiển thị và hành động như mô tả ở phần Mục tiêu.
- **Target files:** `ui/src/panels/director/SuggestCard.tsx` (mới).
- **Steps:**
  1. Comment đầu file: thẻ làm gì; dữ liệu đến từ `/api/suggest`; chỉ người dùng bấm chọn; `BRIEF.md` do lệnh `choose` của provider ghi.
  2. Lấy `name = useStudio((s) => s.name)`. Không có `name` thì trả `null`. Đọc `useSuggest(name)` và `useRequests(name)`.
  3. Làm mới khi đạo diễn xong việc: `useEffect` theo số request ở trạng thái `done`. Khi số này tăng, gọi `queryClient.invalidateQueries({ queryKey: Q.keys.suggest(name) })`, để pitch vừa tạo hiện ra trong `picks`.
  4. Chọn side để hiện:
     - `observe = record.source === "observe" && record.jev !== null`;
     - khi `observe`: hiện cả `record.jev` và `record.det` thành hai cột; `dirSel` mặc định `null`; style và chế độ lấy theo cột chứa hướng vừa bấm (hướng có ở cả hai cột thì lấy cột Jev cho style, vì style của hai cột cùng đến từ `styles_goi_y`);
     - không `observe`: `side = record.shown === "jev" ? record.jev : record.det`, một cột; `dirSel` mặc định là hướng hạng 1.
     State cục bộ gồm `dirSel`, `styleSel` (mặc định là style hạng 1 hợp với `dirSel`, `null` khi chưa có `dirSel`) và `modeSel` (mặc định `workflow.mode` của cột đang dùng, khi chưa có `dirSel` thì của `record.det`).
  5. Bố cục, gắn `data-role` để test và shoot:
     - Khung ngoài `<section data-role="suggest-card" aria-label="Gợi ý cho dự án">`.
     - Dòng đầu: tiêu đề, chip nguồn `data-role="suggest-source"`, nút chạy `data-role="suggest-run"`.
     - Nếu có `record.error`: một dòng chữ lỗi `role="status"`.
     - Hướng: mỗi cột tối đa 3 nút radio `data-role="suggest-direction"`, gắn thêm `data-source="jev"` hoặc `"det"`. Khi `observe`, hai cột đặt trong `data-role="suggest-columns"`, cùng độ rộng, mỗi cột có tiêu đề `Jev` hoặc `Tất định`. Mỗi nút gồm nhãn, thanh điểm 4 ô (`score` 1-10 chia 4 mức, `null` thì không vẽ) và `reason` ở dòng dưới. Bấm một hướng ở cột nào cũng đặt `dirSel`; hướng trùng ở cột kia cũng hiện là đã chọn.
     - Style: các nút radio `data-role="suggest-style"`, lọc theo `item.directions?.includes(dirSel) ?? true`, tối đa 3. Không còn style nào thì hiện `Chưa có style hợp với hướng này. Lệnh chọn hướng sẽ dùng style mặc định của hướng.`
     - Quy trình `data-role="suggest-workflow"`:
       - một `<select>` các `modes` từ server, giá trị `modeSel`; khi `can_save_mode` là `false` thì hiện câu ghi chú tương ứng ở dưới;
       - danh sách `steps` của chế độ đang hiện, nối bằng ` → `;
       - các dòng `Bỏ qua: …`;
       - `workflow.reason`.
     - Khi `record.source === "observe" && record.jev`: dòng so sánh theo bảng câu chữ, so `record.det.directions[0].id` với `record.jev.directions[0].id`.
     - Nút `Chọn và tạo pitch`, bị khoá khi đang gửi và khi `dirSel` là `null` (khi đó hiện câu "Chọn một hướng ở một trong hai cột để tiếp tục.").
  6. Bấm chọn:
     - gọi `Q.suggestChoose({ name, direction: dirSel, style: styleSel ?? undefined, mode: modeSel })`;
     - `status !== 200` thì hiện `Chưa chọn được: <error>`;
     - còn lại hiện câu theo `data.outcome` (với `chosen` có `initialized: true` thì dùng câu riêng ở bảng);
     - nếu `data.mode.saved === false && data.mode.reason` thì hiện thêm reason;
     - với `not_in_pitch`, hiện danh sách `picks` dạng nút. Bấm một nút thì đặt `dirSel` về `id` đó.
  7. Bấm chạy: gọi `Q.suggestRun({ name, refresh: Boolean(record) })`. Lỗi thì hiện `Chưa gợi ý được: <error>`.
  8. Dùng các thành phần và lớp CSS có sẵn mà `GateCard.tsx` đang dùng. Không thêm thư viện.
  9. Đường nâng cấp: thẻ không tự biết plugin có gì; nó chỉ đọc `can_save_mode` và `can_init_pitch` từ `GET /api/suggest` và đọc `initialized`, `mode.saved` trong câu trả lời chọn. Khi plugin phát hành `pitchInit` và `set_workflow_mode` (phase 7), thẻ tự đổi câu báo mà không phải sửa code: kết cục `queued` nhường chỗ cho `chosen` với `initialized: true`, và câu "chưa lưu" biến mất. `can_init_pitch` chỉ dùng để chọn câu ghi chú dưới nút: `false` và `picks === null` thì hiện `Dự án chưa có pitch, nên bấm chọn sẽ nhờ đạo diễn tạo pitch trước.`; `true` thì không hiện gì.
- **Verify:** `cd /Volumes/2/Motion-Studio/ui && npx tsc --noEmit 2>&1 | wc -l` in `0`.

### Task 5.4 — Đăng ký section

- **Target files:** `ui/src/panels/director/index.ts`.
- **Steps:**
  1. Import `SuggestCard`.
  2. Thêm `studio.registerSection("director", { id: "suggest", order: 5, component: SuggestCard });` trước dòng `chat`.
  3. Comment đầu file thêm cụm "the suggest card above the chat".
- **Verify:** `command grep -c 'id: "suggest", order: 5' /Volumes/2/Motion-Studio/ui/src/panels/director/index.ts` in `1`.

### Task 5.5 — Test `SuggestCard.test.tsx`

- **Goal:** bảy tình huống chạy bằng vitest với `mockFetch`.
- **Target files:** `ui/src/panels/director/SuggestCard.test.tsx` (mới).
- **Steps:**
  1. Theo mẫu `GateCard.test.tsx:1-27`:
     - mock `@/api/queries.ts`, giữ phần gốc, thay `suggestChoose` và `suggestRun` bằng `vi.fn()`;
     - đặt dự án bằng `openProject()` từ `fixtures.ts`;
     - nạp dữ liệu bằng `queryClient.setQueryData(Q.keys.suggest(NAME), resp)`.
  2. Fixture trong file:
     - `det` có hướng `A6`, `A8`, `A3`; style `data-editorial` có `directions: ["A6"]` và `swiss-kinetic-editorial` có `directions: ["A3"]`; workflow `dao-dien` có một bước bỏ qua `cut`;
     - `jev` giống `det` nhưng hướng hạng 1 là `A8`;
     - `modes` gồm 4 chế độ.
  3. Các test:
     - "observe shows both columns, picks nothing, and compares rank one": record `source: "observe"`, `shown: "jev"`. Có `[data-role=suggest-columns]` với 3 nút `data-source="jev"` (đầu là `A8`) và 3 nút `data-source="det"` (đầu là `A6`); không nút hướng nào ở trạng thái checked; nút `Chọn và tạo pitch` bị khoá và có câu `Chọn một hướng ở một trong hai cột để tiếp tục.`; có dòng chứa `Khác với Jev ở hạng 1`. Bấm `A8` ở cột Jev thì nút mở khoá.
     - "deterministic only shows no comparison line": `source: "deterministic"`, `jev: null`. Chip ghi `Tất định`; không có chữ `Jev ở hạng 1`.
     - "styles follow the chosen direction": chọn `A3` thì hiện `swiss-kinetic-editorial` và không hiện `data-editorial`.
     - "choose sends the direction, style and mode": bấm `Chọn và tạo pitch`, `suggestChoose` được gọi đúng một lần với `{ name: NAME, direction: "A6", style: "data-editorial", mode: "dao-dien" }` (chạy trên record det-only để hạng 1 là `A6`). Mock trả `{ status: 200, data: { outcome: "chosen", direction: "A6", pick: 2, style: "data-editorial", mode: { saved: false, reason: "Chế độ vận hành chưa lưu vào project.json vì provider chưa có lệnh ghi trường này. Đạo diễn vẫn nhận chế độ trong lời yêu cầu." } } }`. Thẻ hiện `Đã chọn hướng A6` và câu reason.
     - "queued and not_in_pitch show their sentences": mock trả lần lượt `queued`, rồi `not_in_pitch` với `picks` gồm `A7`. Thẻ hiện câu `Dự án chưa có pitch…`, rồi câu `Pitch hiện có không gồm hướng này…` kèm nút `A7`.
     - "a provider that builds pitches and saves the mode changes the sentences": resp có `can_save_mode: true`, `can_init_pitch: true`, `picks: null`. Không có câu `chưa lưu vào project.json` dưới ô chế độ, không có câu `nhờ đạo diễn tạo pitch trước`. Mock trả `{ outcome: "chosen", direction: "A6", pick: 1, style: "data-editorial", initialized: true, mode: { saved: true, reason: null } }`; thẻ hiện `Đã tạo pitch với hướng A6 đứng đầu`.
     - "no record shows the empty sentence and a Gợi ý button": `record: null`. Thẻ hiện câu `Chưa có gợi ý…`; bấm `Gợi ý` thì gọi `suggestRun` với `{ name: NAME, refresh: false }`.
- **Verify:**
  - `cd /Volumes/2/Motion-Studio/ui && npx vitest run src/panels/director/SuggestCard.test.tsx 2>&1 | command grep -E "Tests +[0-9]+ (passed|failed)"` in `Tests  7 passed (7)`. Không được có chữ `failed`.
  - `cd /Volumes/2/Motion-Studio/ui && npx vitest run src/panels/director 2>&1 | command grep -c "failed"` in `0`.

### Task 5.6 — Kiểm câu chữ, toàn bộ UI, commit

- **Steps:**
  1. `command grep -c "minh họa\|minh hoạ" /Volumes/2/Motion-Studio/ui/src/panels/director/SuggestCard.tsx`
  2. `cd /Volumes/2/Motion-Studio/ui && npx tsc --noEmit && npx vitest run 2>&1 | tail -8`
  3. `git -C /Volumes/2/Motion-Studio add ui/src/panels/director/SuggestCard.tsx ui/src/panels/director/SuggestCard.test.tsx ui/src/panels/director/index.ts ui/src/api/queries.ts ui/src/api/types.ts`
  4. `git -C /Volumes/2/Motion-Studio commit -m "feat(ui): show the style suggestion card in the director tab" -m "The card ranks directions, styles and the operating mode, and chooses through the suggest route."`
- **Verify:**
  - Bước 1 in `0`.
  - `cd /Volumes/2/Motion-Studio/ui && npx vitest run 2>&1 | command grep -E "Test Files .*failed" | wc -l` in `0`.
  - `git -C /Volumes/2/Motion-Studio status --porcelain | wc -l` in `0`.

## Rủi ro và rollback

- Rủi ro: thẻ chiếm chỗ trên khung chat ở màn hẹp. Giảm thiểu: chỉ hiện 3 mục mỗi nhóm. Phase 6 chụp màn hình để kiểm.
- Rủi ro: chế độ chọn trên thẻ có thể khác chế độ đạo diễn đang theo. Giảm thiểu: chế độ chỉ đi kèm lời yêu cầu hoặc được ghi qua gateway khi provider có op; thẻ không tự chạy bước nào.
- Rollback: revert commit. Section biến mất khỏi registry; server không đổi.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
