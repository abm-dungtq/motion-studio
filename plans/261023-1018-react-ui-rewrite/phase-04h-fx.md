# Phase 4h: Chuyển cảnh & hiệu ứng (fx)

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-fx` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-fx`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4419. Gốc thử riêng: `/tmp/ms-react-root-4419`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `fx`. Nhóm trong checklist: `4h`.
- **Effort:** 5h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Tab mới `fx` (nhóm `assets`, `order 40`, icon `ArrowLeftRight`, chữ "Chuyển cảnh & hiệu ứng"), chép `public/ext-fx.js`, `fx-gallery.js`, `fx-footage.js`. Chỗ đặt mới theo hợp đồng:
- "Thư viện chuyển cảnh" cho shot đang chọn: trước nằm trong inspector, nay trong tab `fx`;
- "Sửa clip" cho mọi video đã đăng ký: trước nằm trong tab `media`, nay trong tab `fx`;
- "Sửa clip của shot" vẫn ở inspector shot, kèm nút "Mở thư viện chuyển cảnh" mở tab `fx`.

## Hiện trạng đã kiểm

- `public/ext-fx.js:1-13`: inspector `shot` gồm `gallerySection` + `shotClipsSection` (`:11`); section `media` id `fx-footage` `order 60` (`:12`, cần manifest). Ô "Chuyển cảnh vào" của inspector lõi giữ nguyên (thuộc 4d).
- `public/fx-gallery.js` (83 dòng): tiêu đề `Thư viện chuyển cảnh (<n>)` (`:30`); `/api/fx/catalog` (nhãn nguồn, bộ lọc, chip nguồn); gói Studio có xem thử trong `iframe` với `sandbox: "allow-scripts"`, `loading: "lazy"`, `title: "Xem thử <id>"` (`:63`); "Áp dụng cho shot" → `/api/fx/apply-transition`.
- `public/fx-footage.js` (182 dòng): "Sửa clip" (`:164-171`) và "Sửa clip của shot" (`:180`): cắt, đổi tốc độ, đứng hình, chỉnh màu (LUT `/api/fx/luts` hay preset), reframe; render trước bằng `/api/fx/footage` (job `fx`, ra `footage/cut/`); xong thì xem trước/sau bằng hai `video` (`/api/fx/clip`) cùng biên nhận; "Dùng trong shot" → `/api/fx/use-clip`. Danh sách video từ `/api/media`; theo job bằng `/api/jobs`.
- `store.sel` (phase 3) là shot đang chọn; `store.setLeftTab("fx")` mở tab.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `fx` trong `ui/ownership.json`):

- `ui/src/ext/fx/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-fx.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-fx-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-fx.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-fx.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4h.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4419.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-fx -b feat/react-ui-fx origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4419 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4419`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-fx`.
  - `lsof -nP -iTCP:4419 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4h.1 — Tab `fx` và mục shot

- **File:** `ui/src/ext/fx/index.ts`, `FxTab.tsx`, `Gallery.tsx`, `Footage.tsx`, `ClipEditor.tsx`, `ShotClips.tsx`, `useJob.ts`.
- **Các bước:**
  1. `register(studio)`: `registerTab({ id: "fx", label: "Chuyển cảnh & hiệu ứng", icon: ArrowLeftRight, group: "assets", order: 40, lead: "Chuyển cảnh cho shot đang chọn và sửa clip footage (cắt, tốc độ, đứng hình, màu, reframe).", component: FxTab })`; `registerInspectorSection({ kinds: ["shot"], order: 40, component: ShotClips })`.
  2. `FxTab`: chưa có manifest thì `NeedManifest`. Mục 1 `Gallery` cho `store.sel`; không có shot thì `Empty` với chữ `Chọn một shot trên timeline để áp chuyển cảnh`. Mục 2 `Footage` ("Sửa clip").
  3. `Gallery` chép `fx-gallery.js`, giữ thuộc tính `iframe` y như `:63`.
  4. `Footage` + `ClipEditor` chép `fx-footage.js`, dùng chung cho tab và cho `ShotClips`.
  5. `ShotClips`: "Sửa clip của shot" cho video trong `shot.assets`, cộng nút "Mở thư viện chuyển cảnh" gọi `setLeftTab("fx")` và `toggleLeft(true)`.
  6. `useJob.ts`: theo job `fx` qua cache job (`useJobs`) tới khi xong.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4h.2 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/ext/fx` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - không chọn shot: tab hiện `Chọn một shot trên timeline để áp chuyển cảnh`;
  - chọn shot: tiêu đề `Thư viện chuyển cảnh (<n>)` với `n` bằng số mục catalog giả;
  - `iframe` xem thử có `sandbox="allow-scripts"` và không có `allow-same-origin`;
  - "Áp dụng cho shot" gọi hàm ghi `/api/fx/apply-transition` với id shot đang chọn;
  - "Dùng trong shot" gọi hàm ghi `/api/fx/use-clip`;
  - nút "Mở thư viện chuyển cảnh" đặt `leftTab = "fx"`.
- **Verify:** `cd $W/ui && npx vitest run src/ext/fx` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 6.

### Task 4h.3 — Thử trực tiếp trên 4419, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4h` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4419 /tmp/ms-react-root-4419`. Ghi PID vào báo cáo.
  3. Mở `http://127.0.0.1:4419/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4h` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-fx.md`: mỗi dòng nhóm `4h` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-fx.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `fx`: `/?name=thuy-mau-demo&tab=fx`, đã chọn shot đầu tiên;
     - `fx-noshot`: `/?name=thuy-mau-demo&tab=fx`;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4419 --views /tmp/ms-react-views-fx.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/fx --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4h *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-fx.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 4` và thoát 0.
  - `lsof -nP -iTCP:4419 -sTCP:LISTEN | wc -l` in `0`.

### Task 4h.4 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-fx-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/transitions-and-effects.md` (bảng ở `:13` liệt kê `public/ext-fx.js`, `fx-gallery.js`, `fx-footage.js`, `ext-fx.css`) và ghi chỗ mới của thư viện chuyển cảnh.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): transitions and effects tab with the transition gallery and clip edits`
  4. `git -C $W push -u origin feat/react-ui-fx`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-fx --title "feat(ui): transitions and effects tab in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-fx-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs fx` in dòng bắt đầu bằng `ok fx` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-fx --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Xem thử gói Studio chạy script ngoài sandbox | Thấp | Cao | Giữ nguyên `sandbox="allow-scripts"` (không `allow-same-origin`); test kiểm thuộc tính |
| Người dùng không thấy thư viện chuyển cảnh ở chỗ mới | Vừa | Thấp | Nút "Mở thư viện chuyển cảnh" trong inspector shot; chưa chọn shot thì tab ghi rõ cần chọn shot |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-fx.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-fx --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-fx`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4419` bị đổi.

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
