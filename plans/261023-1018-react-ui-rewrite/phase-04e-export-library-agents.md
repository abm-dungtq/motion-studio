# Phase 4e: Xuất bản, biên nhận, Thư viện mẫu, popover agent

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-export` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-export`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4416. Gốc thử riêng: `/tmp/ms-react-root-4416`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `export`. Nhóm trong checklist: `4e`.
- **Effort:** 9h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Bốn phần, cùng một vùng vì cùng là "đầu ra và trạng thái":
1. **Khe `export`** (`ExportDialog`, mở từ menu Xuất bản → "Cổng & tệp đã xuất…"): chép view `output()` của `public/panels.js:316-360`.
2. **Biên nhận:** mục cuối khe `export`, cộng mục trong inspector shot (`ext-receipts.js`, `receipts-view.js`).
3. **Tab `library`:** "Thư viện mẫu", nhóm `library`, `order 10`, icon `Library`; chép view `library()` `:230-315`.
4. **Khe `agent`** (`AgentDialog`): nội dung popover của `public/agent.js`, rồi bảng Agent CLI của `ext-agents.js`.

## Hiện trạng đã kiểm

- `public/panels.js:19`: lead tab `output`. Phase 3 đã đặt dòng này trong `ExportDialog`.
- `public/panels.js:316-360` (`output`):
  - các dòng FAIL của cổng, tiêu đề `Cần duyệt lại animatic` / `Chưa đủ cổng xuất` (`:348`);
  - mục `Việc đang chạy` với log và nút huỷ (`:355`; log chỉ nối thêm dòng, `:607-617`);
  - mục `File đã xuất` (`:356`): bản render và bộ lớp dựng, mỗi thư mục bộ lớp dựng là một dòng (`:321`).
- `public/ext-receipts.js:20-36`: section `output` "Biên nhận" (20 biên nhận mới nhất, nút tải lại, bấm xem từng kiểm tra và JSON); `:37-55`: inspector `shot` (biên nhận của các file trong `shot.assets`). `public/receipts-view.js`: danh sách, chi tiết, bộ đệm theo dự án (`/api/receipts`, `/api/receipt`). Mọi chữ là text node.
- `public/panels.js:18`: lead tab `library`. `:39-73`: hằng và hàm chữ của thư viện (`LIB_EXCERPT`, `promptExcerpt`, `use(row)`, `copy(row)`, `nfmt`). `:230-315`: ô tìm, chọn thể loại (`Mọi thể loại`), bốn mục, phân trang `/api/library`, "Chép" (toast `Đã chép vào bộ nhớ tạm` / `Trình duyệt không cho chép`), "Dùng cho dự án" (`ctx.direct`), ảnh `/library/thumb/<id>`, thẻ toolkit, dòng nguồn.
- `public/agent.js`: phần thân popover (dòng trạng thái claude, provider, runner, job gần nhất, ffprobe/ffmpeg); tải lại khi mở popover.
- `public/ext-agents.js:131-148`: `addAgentRows` "Agent CLI": bảng CLI (phiên bản, đăng nhập, khả năng), quota codex-pool (`poolLines`, nay ở `ui/src/core/pool-lines.ts`), thứ tự định tuyến; "Làm mới" (`/api/agents/refresh`), "Thử khả năng" (`/api/agents/probe`, theo job tới khi xong). Không hiện email, tổ chức, token, cách đăng nhập (comment `:5-6`).
- Bộ nạp chạy `panels/*` trước `ext/*`, nên dòng của `panels/agent` đứng trước dòng của `ext/agents`, như thứ tự cũ.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `export` trong `ui/ownership.json`):

- `ui/src/panels/export/**`
- `ui/src/ext/receipts/**`
- `ui/src/panels/library/**`
- `ui/src/core/library.ts`
- `ui/src/panels/agent/**`
- `ui/src/ext/agents/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-export.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-export-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-export.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-export.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4e.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4416.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-export -b feat/react-ui-export origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4416 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4416`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-export`.
  - `lsof -nP -iTCP:4416 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4e.1 — Khe `export`: cổng, việc đang chạy, file đã xuất

- **File:** `ui/src/panels/export/index.ts`, `GateFails.tsx`, `Jobs.tsx`, `Exported.tsx`.
- **Các bước:**
  1. `register(studio)`: `registerSection("export", { id: "gates", order: 10, component: GateFails })`, `{ id: "jobs", order: 20, component: Jobs }`, `{ id: "files", order: 30, component: Exported }`.
  2. Chép `:316-360`, chữ nguyên văn. Huỷ job gọi `actions.cancelJob`. Log của job đọc từ cache log job (phase 3, `events.ts`).
  3. Liên kết file dùng `fileUrl`; không có gì thì trạng thái rỗng đúng chữ cũ.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4e.2 — Biên nhận

- **File:** `ui/src/ext/receipts/index.ts`, `ReceiptList.tsx`, `ReceiptDetail.tsx`, `ShotReceipts.tsx`.
- **Các bước:**
  1. `register(studio)`: `registerSection("export", { id: "receipts", order: 40, component: ReceiptList })` và `registerInspectorSection({ kinds: ["shot"], order: 60, component: ShotReceipts })`.
  2. Chép `ext-receipts.js` và `receipts-view.js`. Bộ đệm của bản cũ thay bằng cache TanStack Query (hook `/api/receipts`, `/api/receipt`); nút tải lại gọi `refetch`.
  3. Chữ từ file biên nhận chỉ render như text (không `dangerouslySetInnerHTML`).
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4e.3 — Tab `library`

- **File:** `ui/src/core/library.ts`, `ui/src/panels/library/index.ts`, `LibraryTab.tsx`, `LibraryCard.tsx`.
- **Các bước:**
  1. `core/library.ts` (thuần): chép `:39-73` (hằng, `promptExcerpt`, chữ `use(row)` và `copy(row)` của bốn mục, `nfmt` lấy từ `core/ui-format.ts`).
  2. `index.ts`: `registerTab({ id: "library", label: "Thư viện mẫu", icon: Library, group: "library", order: 10, lead: <panels.js:18>, component: LibraryTab })`.
  3. `LibraryTab` chép `:230-315`: tìm, thể loại (shadcn `Select`), bốn mục, "Xem thêm" (trang tiếp), ảnh, thẻ toolkit, dòng nguồn (`safeUrl`). "Chép" dùng `navigator.clipboard.writeText` với toast cũ. "Dùng cho dự án" gọi `actions.direct` với chữ `use(row)`.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4e.4 — Dòng của hộp thoại agent

- **File:** `ui/src/panels/agent/index.ts`, `AgentStatus.tsx`; `ui/src/ext/agents/index.ts`, `AgentTable.tsx`.
- **Các bước:**
  1. `panels/agent`: `registerAgentRows({ component: AgentStatus })`. Chép phần thân popover của `public/agent.js` (dòng trạng thái, chữ nguyên văn); dữ liệu từ `useAgent()`; mở hộp thoại thì `refetch`.
  2. `ext/agents`: `registerAgentRows({ component: AgentTable, width: <như bản cũ> })`. Chép `ext-agents.js:131-148`: bảng, `poolLines` từ `ui/src/core/pool-lines.ts`, "Làm mới", "Thử khả năng" (theo job tới khi xong, rồi tải lại bảng). Inline style cũ đổi sang lớp Tailwind theo token.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4e.5 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/panels/export` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - `GateFails`: cổng `animatic` hiện tiêu đề `Cần duyệt lại animatic`, cổng khác hiện `Chưa đủ cổng xuất`, kèm mỗi dòng FAIL;
  - `Jobs`: nút huỷ gọi `actions.cancelJob(id)`; không có job thì chữ rỗng đúng;
  - `Exported`: hai file MP4 trong cùng thư mục bộ lớp dựng chỉ ra một dòng;
  - biên nhận: chữ `<b>x</b>` trong dữ liệu hiện nguyên văn, không thành thẻ HTML;
  - thư viện: "Dùng cho dự án" gọi `actions.direct` với chuỗi bằng `use(row)`; "Chép" gọi clipboard với `copy(row)` rồi toast `Đã chép vào bộ nhớ tạm`;
  - agent: dữ liệu giả có `email` và `token`, DOM không chứa giá trị của hai trường đó;
  - thứ tự dòng trong `AgentDialog`: `AgentStatus` trước `AgentTable`.
- **Verify:** `cd $W/ui && npx vitest run src/panels/export src/ext/receipts src/panels/library src/panels/agent src/ext/agents` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 8.

### Task 4e.6 — Thử trực tiếp trên 4416, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4e` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4416 /tmp/ms-react-root-4416`. Ghi PID vào báo cáo.
     Trước khi thử mục xuất: bấm "Xuất bộ lớp dựng" một lần trên `thuy-mau-demo` để có job và file thật trong gốc thử.
  3. Mở `http://127.0.0.1:4416/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4e` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-export.md`: mỗi dòng nhóm `4e` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-export.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `export`: `/?name=thuy-mau-demo&tab=output`;
     - `library`: `/?name=thuy-mau-demo&tab=library`;
     - `agent`: bấm chip agent;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4416 --views /tmp/ms-react-views-export.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/export --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4e *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-export.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 6` và thoát 0.
  - `lsof -nP -iTCP:4416 -sTCP:LISTEN | wc -l` in `0`.

### Task 4e.7 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-export-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/receipts.md`, `docs/agents.md`, `docs/nle-export.md` và các mục "Biên nhận", "Agent CLI" của `docs/extensions.md` (`:147-178`) nếu có nhắc `public/`.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): export dialog sections for gates, running jobs and exported files`
     - `feat(ui): receipts in the export dialog and the shot inspector`
     - `feat(ui): template library tab`
     - `feat(ui): agent status and agent cli rows in the agent dialog`
  4. `git -C $W push -u origin feat/react-ui-export`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-export --title "feat(ui): export dialog, receipts, template library and agent rows in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-export-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs export` in dòng bắt đầu bằng `ok export` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-export --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Bảng agent lỡ hiện trường nhạy cảm | Thấp | Cao | Chỉ hiện đúng các cột bản cũ hiện; test kiểm không có chữ `@` hay `token` trong DOM với dữ liệu giả có các trường đó |
| Log job dài làm hộp thoại giật | Thấp | Vừa | Log là `pre` trong `ScrollArea`, chỉ nối dòng mới, không render lại cả danh sách |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-export.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-export --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-export`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4416` bị đổi.

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
