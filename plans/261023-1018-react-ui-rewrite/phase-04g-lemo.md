# Phase 4g: Phong cách (lemo)

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-lemo` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-lemo`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4418. Gốc thử riêng: `/tmp/ms-react-root-4418`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `lemo`. Nhóm trong checklist: `4g`.
- **Effort:** 5h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Tab `styles-code` (nhóm `assets`, `order 20`, icon `Palette`, chữ "Phong cách"), chép `public/ext-lemo.js`, `lemo-gallery.js`, `lemo-mystyle.js`:
- thư viện 59 phong cách lemo-opuscar cùng phong cách riêng, có tìm và lọc;
- mục "Phong cách riêng" cuối tab;
- mục "Phong cách code" trong inspector shot.

## Hiện trạng đã kiểm

- `public/ext-lemo.js:14-20`: tab `styles-code` (chữ cũ `Phong cách code`, nay `Phong cách` theo hợp đồng), lead `59 phong cách phim dựng bằng code của lemo-opuscar và phong cách riêng của bạn. Áp cho dự án hoặc một shot.`; section `styles-code` id `lemo-mine` `order 10`; inspector `shot`.
- `public/lemo-gallery.js` (192 dòng): tìm và lọc theo nhóm, `Của bạn` / `Thư viện` (`:131-143`), áp cho dự án (`/api/lemo/apply`), tải về (`/api/lemo/fetch`), hướng dẫn (`/api/lemo/guide`), danh sách (`/api/lemo/styles`). `STYLE.md` là chữ của bên thứ ba: chỉ hiện bằng `textContent`, không bao giờ là HTML (comment `:4`). Mục inspector "Phong cách code" ở `:166`. State dùng chung giữa tab, mục riêng và mục shot.
- `public/lemo-mystyle.js` (61 dòng): "Phong cách riêng": nhờ đạo diễn phác thảo (`/api/lemo/draft`), xem khung và `CHANGES.md`, "Giữ" (`/api/lemo/keep`, chỉ nút này lưu).
- Nguồn và giấy phép đã ghi trong comment file cũ (lemo-opuscar, khung và phim CC BY 4.0 của LemoLab, `MY-STYLES.md` MIT). Chép nguyên các dòng ghi nguồn sang file mới.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `lemo` trong `ui/ownership.json`):

- `ui/src/ext/lemo/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-lemo.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-lemo-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-lemo.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-lemo.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4g.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4418.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-lemo -b feat/react-ui-lemo origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4418 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4418`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-lemo`.
  - `lsof -nP -iTCP:4418 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4g.1 — Tab `styles-code`, mục riêng, mục shot

- **File:** `ui/src/ext/lemo/index.ts`, `Gallery.tsx`, `StyleCard.tsx`, `MyStyle.tsx`, `ShotStyle.tsx`, `store.ts`.
- **Các bước:**
  1. `register(studio)`: `registerTab({ id: "styles-code", label: "Phong cách", icon: Palette, group: "assets", order: 20, lead: <ext-lemo.js:16>, component: Gallery })`; `registerSection("styles-code", { id: "lemo-mine", order: 10, component: MyStyle })`; `registerInspectorSection({ kinds: ["shot"], order: 50, component: ShotStyle })`.
  2. `store.ts`: state dùng chung của ba phần (chữ tìm, nhóm lọc, phong cách đang xem), như `lemo-gallery.js:5`.
  3. Ba component chép ba phần tương ứng, chữ nguyên văn, cùng các dòng ghi nguồn và giấy phép.
  4. Tải lại danh sách khi đổi dự án (thay `ctx.on("project")` ở `lemo-gallery.js:46` bằng khoá query theo `name`).
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0. Rồi `grep -rn "dangerouslySetInnerHTML" $W/ui/src/ext/lemo | wc -l` in `0`.

### Task 4g.2 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/ext/lemo` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - tìm theo chữ lọc đúng thẻ; lọc theo nhóm đúng thẻ;
  - có phong cách riêng thì có tiêu đề `Của bạn` trước `Thư viện`;
  - `STYLE.md` chứa `<script>x</script>` hiện nguyên văn, không có phần tử `script` mới trong DOM;
  - "Giữ" gọi hàm ghi `/api/lemo/keep` một lần;
  - mục shot "Phong cách code" hiện cho kind `shot`.
- **Verify:** `cd $W/ui && npx vitest run src/ext/lemo` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 5.

### Task 4g.3 — Thử trực tiếp trên 4418, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4g` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4418 /tmp/ms-react-root-4418`. Ghi PID vào báo cáo.
  3. Mở `http://127.0.0.1:4418/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4g` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-lemo.md`: mỗi dòng nhóm `4g` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-lemo.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `styles`: `/?name=thuy-mau-demo&tab=styles-code`;
     - `inspector-lemo`: bấm khối shot đầu tiên, cuộn tới mục Phong cách code;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4418 --views /tmp/ms-react-views-lemo.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/lemo --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4g *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-lemo.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 4` và thoát 0.
  - `lsof -nP -iTCP:4418 -sTCP:LISTEN | wc -l` in `0`.

### Task 4g.4 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-lemo-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/lemo-styles.md` nếu có nhắc `public/lemo-*.js`.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): film style gallery, own styles and the shot style section`
  4. `git -C $W push -u origin feat/react-ui-lemo`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-lemo --title "feat(ui): code-made film styles tab in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-lemo-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs lemo` in dòng bắt đầu bằng `ok lemo` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-lemo --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| `STYLE.md` của bên thứ ba bị render thành HTML | Thấp | Cao | Chỉ render chuỗi trong `pre`/`p` của React; cấm `dangerouslySetInnerHTML` trong vùng; có test |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-lemo.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-lemo --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-lemo`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4418` bị đổi.

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
