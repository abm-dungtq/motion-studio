# Phase 4d: Đạo diễn (chat, thẻ cổng) và inspector Shot

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-director` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-director`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4415. Gốc thử riêng: `/tmp/ms-react-root-4415`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `director`. Nhóm trong checklist: `4d`.
- **Effort:** 10h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Hai khe của cột phải:
- **`right.director`** (`registerSection("director", …)`): chat với đạo diễn, chép view `ai()` và các hàm `turn`, `gateCard`, `working`, `composer` của `public/panels.js`. Gồm thẻ chọn hướng và thẻ duyệt animatic, giữ nguyên cách chống "mất cú bấm" của `public/gate-cards.js`.
- **`right.shot`** (`registerInspectorSection`): inspector cho sáu loại khối `shot`, `line`, `music`, `event`, `beat`, `word`, chép `public/inspector.js`.

## Hiện trạng đã kiểm

- `public/panels.js:114-130` (`ai`):
  - gom request thành luồng theo `follows`, hiện 12 luồng cuối;
  - không có gì thì hiện `Chưa giao việc nào. Viết việc đầu tiên ở ô dưới rồi bấm Giao việc.`;
  - `details` "Storyboard" đọc `STORYBOARD.md`, thiếu thì `Chưa có STORYBOARD.md`. Nay đọc bằng `useProjectText`.
- `public/panels.js:388-408` (`turn`): bong bóng người dùng bên phải, đạo diễn bên trái, nút "Huỷ yêu cầu" (`ctx.cancelRequest`). Các trạng thái `queued`, `running`, `waiting_user`, `done`, `failed`; câu hỏi hết hạn có "Trả lời lại" (`reask`).
- `public/panels.js:409-479` (`liveCard`, `gateCard`): khoá thẻ `cardKey(name, r, again, rejecting)`, `lock`, `submit` (`ANSWER_TIMEOUT_MS`, `answerFailure`), ảnh đính kèm (`artifacts`), ô lý do khi Từ chối, nháp giữ khi vẽ lại.
- `public/panels.js:481-489` (`working`): `Đạo diễn đang làm…` cùng 3 dòng log cuối của job đạo diễn đang chạy (`tail3`, mặc định `Đang khởi động…`).
- `public/panels.js:491-505` (`composer`): ô giao việc, Cmd/Ctrl+Enter gửi (`:502`), chữ báo `Viết yêu cầu cho đạo diễn trước`.
- `public/panels.js:89-90`, `:568-572`: `cardCache()` và `pressGate()`. Trong lúc chuột hay Space đang nhấn trên panel, việc vẽ lại phải chờ; nhả trên cửa sổ hay khi `blur` thì chạy bản vẽ lại đang chờ.
- `ui/src/core/gate-cards.ts` (phase 2, port nguyên): `answerFailure`, `cardCache`, `cardKey`, `liveDirectorJob`, `pressGate`, `ANSWER_TIMEOUT_MS`. Test `tests/gate-cards.test.mjs` đã chạy trên bản này.
- `public/inspector.js:1-13`: mô tả từng loại. Các view: `shotView :46` (Tên, Số giây, Chuyển cảnh vào từ `/api/directions` `:22`, `motion_note`, "Áp dụng" = một patch `set_shot` + `resize_shot`, chất liệu dạng ảnh nhỏ, "Nhờ đạo diễn" tại playhead), `lineView :89`, `musicView :103` (một `update_music` chỉ với trường đã đổi), `eventView :149` (xoá chỉ với SFX thêm từ Studio), `beatView :179`, `wordView :201` (mốc, "Về gốc", "Hoàn tác mốc", "Kiểm khớp lời"). Khi `retimed`, mọi view mở đầu bằng dòng nhắc duyệt lại animatic (`:10-11`). Dự án chỉ xem thì mọi trường tắt.
- Tiêu đề view: `SHOT <n> · <a>–<b>`, `CÂU <id> · …`, `NHẠC · <file>`, `SFX <id> · <giờ>`, `MỐC PHÁCH · <file>`, `MỐC TỪ · "<chữ>"` (`inspector.js:75-223`).
- Phase 3 đã có: `useRequests`, `useJobs`/log job, `useProjectText`, `actions.direct/answer/reask/cancelRequest/patch`, `markers` (`useMarkers`), `bus` (`focus-note`, `retimed`), `store.directorDraft`, `store.retimed`.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `director` trong `ui/ownership.json`):

- `ui/src/panels/director/**`
- `ui/src/panels/inspector/**`
- `ui/src/core/inspector-ops.ts`
- `plans/261023-1018-react-ui-rewrite/reports/parity-director.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-director-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-director.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-director.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Luồng dữ liệu

```text
useRequests(name) ─► threads (follows) ─► 12 luồng cuối ─► Turn / GateCard
SSE request ─► cache requests đổi ─► usePressGate: đang nhấn thì giữ ảnh chụp danh sách cũ; nhả thì áp bản mới
GateCard key = cardKey(name, r, again, rejecting) ─► React giữ cùng nút DOM qua mỗi lần vẽ lại
bấm lựa chọn ─► lock ─► actions.answer(id, value) (timeout ANSWER_TIMEOUT_MS) ─► lỗi: answerFailure(...) hiện ngay trong thẻ
Composer (directorDraft trong store) ─► Cmd/Ctrl+Enter ─► actions.direct ─► request mới
pick (store) + m (useProject) ─► InspectorHost ─► section kind tương ứng ─► inspector-ops ─► actions.patch
```

## Các task

### Task 4d.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4415.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-director -b feat/react-ui-director origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4415 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4415`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-director`.
  - `lsof -nP -iTCP:4415 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4d.1 — Chat đạo diễn

- **File:** `ui/src/panels/director/index.ts`, `DirectorChat.tsx`, `Turn.tsx`, `Working.tsx`, `Composer.tsx`, `Storyboard.tsx`.
- **Các bước:**
  1. `register(studio)`: `registerSection("director", { id: "chat", order: 10, component: DirectorChat })`.
  2. Chưa có manifest thì `NeedManifest`.
  3. `DirectorChat`: `Storyboard` (shadcn không cần; dùng `details`), luồng theo `follows` như `:117-122`, 12 luồng cuối, `Working`, `Composer`. Cuộn theo cuối chat, trừ khi một thẻ đang sống được vẽ lại (giữ chỗ, như `:544`). `aria-live="polite"`.
  4. `Turn`: chép `turn()` `:388-408`, mọi trạng thái và nút, chữ nguyên văn.
  5. `Working`: chép `:481-489`; log lấy từ cache log job do `events.ts` nối.
  6. `Composer`: `Textarea` gắn `store.directorDraft`; Cmd/Ctrl+Enter gửi; gửi rỗng thì toast `Viết yêu cầu cho đạo diễn trước`; gửi xong thì xoá nháp.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4d.2 — Thẻ cổng: chọn hướng và duyệt animatic

- **File:** `ui/src/panels/director/GateCard.tsx`, `usePressGate.ts`.
- **Các bước:**
  1. `GateCard` chép `gateCard()` `:415-479`: tiêu đề, câu hỏi, ảnh `artifacts` (đường dẫn qua `fileUrl`), mỗi lựa chọn một nút; thẻ animatic có Xem (video), Duyệt, Từ chối kèm ô lý do; `lock` tắt mọi nút trong lúc gửi; lỗi hay quá giờ hiện chữ `answerFailure(...)` trong thẻ; `again` (hết hạn) gửi bằng `actions.reask`.
  2. Khi render danh sách, mỗi thẻ có `key={cardKey(name, r, again, rejecting)}`, nên React giữ cùng nút DOM khi luồng vẽ lại và video animatic không chạy lại từ đầu.
  3. `usePressGate(list)`: dùng `pressGate()` của `core/gate-cards.ts`; `pointerdown` hay `keydown` Space trong cột phải bật `press`; khi `press` bật, hook trả bản danh sách cũ; `pointerup` hay `keyup` trên `window`, hoặc `blur` của cửa sổ, thì áp bản mới bằng `setTimeout(…, 0)` sau sự kiện `click` (như `:568-572`).
  4. Chấm báo ở tab Đạo diễn đã có ở phase 3; không đổi.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4d.3 — Inspector cho sáu loại khối

- **File:** `ui/src/panels/inspector/index.ts`, `ShotView.tsx`, `LineView.tsx`, `MusicView.tsx`, `EventView.tsx`, `BeatView.tsx`, `WordView.tsx`, `RetimedNote.tsx`; `ui/src/core/inspector-ops.ts`; `ui/src/panels/inspector/inspector-ops.test.ts`.
- **Các bước:**
  1. `register(studio)`: sáu lần `registerInspectorSection({ kinds: [<kind>], order: 0, component })`. `order: 0` để phần lõi đứng trước phần của extension (mặc định 100).
  2. `core/inspector-ops.ts` (thuần, không React): `shotOps(m, id, form)` trả `set_shot` + `resize_shot` đúng như `shotView` gửi; `musicOps(before, form)` chỉ gồm trường đã đổi; `eventOps(m, id, at)` trả `move_event`; `canDeleteEvent(ev)` theo điều kiện cũ.
  3. Mỗi view chép view tương ứng trong `public/inspector.js` (tiêu đề, trường, nút, chữ). Danh sách "Chuyển cảnh vào" từ hook `/api/directions`. Mốc dùng `useMarkers()` (`get`, `line`, `setBeat`, `setWord`, `undo`, `wordSync`, `editable`).
  4. `RetimedNote` hiện đầu mọi view khi `store.retimed` là `true`, chữ như `inspector.js` ghi.
  5. `ShotView` nghe `bus.on("focus-note")` để focus ô `motion_note` (`data-role="motion-note"`).
  6. Dự án chỉ xem: mọi trường `disabled`; riêng ô ghi chú vẫn sửa được để gửi "Nhờ đạo diễn" (`inspector.js:57`).
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0. Rồi `cd $W/ui && npx vitest run src/panels/inspector/inspector-ops.test.ts` thoát 0.

### Task 4d.4 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/panels/director` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - luồng: request có `follows` nằm cùng luồng; có hơn 12 luồng thì chỉ hiện 12 luồng cuối;
  - Cmd+Enter trong ô giao việc gọi `actions.direct` một lần; ô rỗng thì toast `Viết yêu cầu cho đạo diễn trước`;
  - thẻ chọn hướng: bấm lựa chọn 2 gọi `actions.answer(id, <value của lựa chọn 2>)`; trong lúc chờ mọi nút tắt;
  - `answer` trả `{ timeout: true }`: thẻ hiện đúng chữ của `answerFailure`;
  - thẻ vẫn là **cùng một phần tử DOM** sau khi danh sách request đổi (so `===`);
  - `pointerdown` trên nút, rồi danh sách đổi, rồi `pointerup` + `click`: `answer` vẫn được gọi đúng một lần;
  - thẻ animatic: Từ chối mở ô lý do; gửi kèm lý do;
  - inspector: `shotOps` có cả `set_shot` và `resize_shot`; `musicOps` không chứa trường không đổi; xoá SFX chỉ hiện với SFX thêm từ Studio; `retimed` hiện dòng nhắc;
  - dự án chỉ xem: trường trong `ShotView` bị tắt, ô ghi chú vẫn sửa được.
- **Verify:** `cd $W/ui && npx vitest run src/panels/director src/panels/inspector` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 12.

### Task 4d.5 — Thử trực tiếp trên 4415, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4d` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4415 /tmp/ms-react-root-4415`. Ghi PID vào báo cáo.
     Trước khi thử thẻ: `node $W/ui/scripts/seed-gate-cards.mjs $W /tmp/ms-react-root-4415/thuy-mau-demo direction`, sau đó thử lại với `animatic`.
  3. Mở `http://127.0.0.1:4415/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4d` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-director.md`: mỗi dòng nhóm `4d` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-director.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `director`: `/?name=thuy-mau-demo&tab=ai`;
     - `gate-direction`: `/?name=thuy-mau-demo&tab=ai`, sau khi seed thẻ chọn hướng;
     - `inspector-shot`: bấm khối shot đầu tiên;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4415 --views /tmp/ms-react-views-director.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/director --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4d *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-director.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 6` và thoát 0.
  - `lsof -nP -iTCP:4415 -sTCP:LISTEN | wc -l` in `0`.

### Task 4d.6 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-director-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/extensions.md` mục inspector (`registerInspectorSection` thay `addInspectorSection`), và mục về thẻ cổng nếu có.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): director chat with threads, live job log and composer`
     - `feat(ui): direction and animatic gate cards that survive redraws`
     - `feat(ui): shot inspector for shots, lines, music, sound effects and markers`
  4. `git -C $W push -u origin feat/react-ui-director`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-director --title "feat(ui): director chat, gate cards and shot inspector in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-director-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs director` in dòng bắt đầu bằng `ok director` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-director --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Vẽ lại React làm mất cú bấm trên thẻ cổng (lỗi bản cũ đã sửa) | Vừa | Cao | `key` ổn định theo `cardKey` và `usePressGate` hoãn cập nhật khi đang nhấn; test `pointerdown` → SSE → `pointerup` vẫn ra một `answer` |
| Inspector gửi sai bộ op (thiếu `resize_shot`, gửi trường nhạc không đổi) | Vừa | Cao | Đưa phép dựng op vào `core/inspector-ops.ts` và test riêng từng loại |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-director.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-director --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-director`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4415` bị đổi.

## Dừng và hỏi người dùng

Dừng và báo orchestrator để hỏi người dùng (không gọi kongming) khi:
- cần đổi API server;
- gặp lỗi vẫn không giải thích được sau một lượt Failure Protocol;
- cần xoá hay ghi đè file ngoài repo, trừ `/tmp/ms-react-*`;
- cần đụng tới server 4317.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc gặp việc ngoài sở hữu file của phase này: **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
