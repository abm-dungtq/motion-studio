# Phase 4b: Chất liệu (footage) và B-roll

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-media` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-media`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4413. Gốc thử riêng: `/tmp/ms-react-root-4413`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `media`. Nhóm trong checklist: `4b`.
- **Effort:** 6h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Tab `media` (rail nhóm `assets`, `order 10`, icon `LayoutGrid`, chữ "Chất liệu") đủ như view `media()` của `public/panels.js:131-192`, cộng phần B-roll của `ext-broll.js` và `broll-search.js`:
- mục "Tìm trong footage" ở cuối tab `media`;
- mục "Gợi ý B-roll" trong inspector của shot.

Mục "Sửa clip" của `ext-fx.js:12` **không** còn ở tab này; nó chuyển sang tab `fx` (phase 4h).

## Hiện trạng đã kiểm

- `public/panels.js:15`: tab `media`, lead `Thêm video quay sẵn, B-roll, ảnh. File nằm ngoài workspace sẽ được chép vào footage/raw.`
- `public/panels.js:131-192` (view `media`): ba mục `Footage đã thêm` (`/api/media`, `:135`), `Chọn file trên máy` (`/api/media/browse`, ô đường dẫn, nút lên, lần đầu mở `~/Movies` nếu có, `:160-170`; thêm bằng `/api/media/register`, `:145-153`), `File trong assets/` (`/api/files`). Chữ mục ở `:188-190`.
- `public/panels.js:506-517` (`mediaRow`): dòng footage kéo được, `setData(MEDIA_DRAG, { rel, kind, path })` và `text/plain`.
- `public/ext-broll.js:11`: section `media`, id `broll-search`, `order 40`, tiêu đề `Tìm trong footage`; `:51-66`: inspector `shot` "Gợi ý B-roll" (`/api/broll/suggest` top 5, "Đặt vào shot" → `/api/broll/apply`, ô "nhờ đạo diễn đặt clip vào cảnh").
- `public/broll-search.js` (124 dòng): tìm (`/api/broll/search`), kế hoạch phân tích (`/api/broll/plan`), chạy (`/api/broll/index`), theo dõi job (`/api/broll/job`); kéo kết quả với `{ rel: null, kind: "video", path, sha256, start, end }` (`:31-33`). Nút chú thích chỉ bật khi số lần gọi vision là chính xác (comment `:1-6`).
- Hàm dùng chung đã có: `setMediaDrag` (`core/dnd.ts`), `mb`, `when`, `fileUrl` (`core/ui-format.ts`), `Empty`, `NeedManifest` (`shell/states.tsx`).

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `media` trong `ui/ownership.json`):

- `ui/src/panels/media/**`
- `ui/src/ext/broll/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-media.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-media-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-media.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-media.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4b.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4413.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-media -b feat/react-ui-media origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4413 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4413`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-media`.
  - `lsof -nP -iTCP:4413 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4b.1 — Tab `media`

- **File:** `ui/src/panels/media/index.ts`, `MediaTab.tsx`, `Registered.tsx`, `Browser.tsx`, `Assets.tsx`.
- **Các bước:**
  1. `index.ts`: `export function register(studio)` gọi `studio.registerTab({ id: "media", label: "Chất liệu", icon: LayoutGrid, group: "assets", order: 10, lead: <chữ panels.js:15>, component: MediaTab })`.
  2. Chưa có manifest thì `NeedManifest`, như `:133`.
  3. Ba mục theo đúng thứ tự và chữ `:188-190`. Mỗi mục dùng hook trong `ui/src/api/queries.ts` cho `/api/media`, `/api/media/browse`, `/api/files`, hàm ghi cho `/api/media/register`. Toast và câu lỗi chép từ `:135-187`.
  4. Dòng footage: `draggable`, `onDragStart` gọi `setMediaDrag(e, { rel, kind, path })`.
  5. Dự án chỉ xem: nút thêm tắt như bản cũ.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4b.2 — B-roll: tìm, phân tích, gợi ý cho shot

- **File:** `ui/src/ext/broll/index.ts`, `Search.tsx`, `Analyse.tsx`, `Suggest.tsx`, `store.ts` (nếu cần giữ chữ tìm khi đổi tab).
- **Các bước:**
  1. `register(studio)`: `registerSection("media", { id: "broll-search", order: 40, component: Search })` và `registerInspectorSection({ kinds: ["shot"], order: 30, component: Suggest })`.
  2. `Search.tsx` + `Analyse.tsx`: port `broll-search.js` trọn vẹn, cùng chữ và cùng điều kiện bật nút. Job đang chạy theo dõi bằng hook của `/api/broll/job` (`refetchInterval` như khoảng chờ cũ), dừng khi job xong.
  3. Kết quả tìm kéo được: `setMediaDrag(e, { rel: null, kind: "video", path, sha256, start, end })`.
  4. `Suggest.tsx`: port `ext-broll.js:51-66`: top 5, "Đặt vào shot" gọi hàm ghi `/api/broll/apply`; ô đánh dấu nhờ đạo diễn dùng `actions.direct` với đúng chữ cũ.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4b.3 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/panels/media` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - ba tiêu đề mục đúng chữ và đúng thứ tự;
  - `dragstart` trên dòng footage đặt `text/x-ms-media` bằng JSON `{ rel, kind, path }` và `text/plain`;
  - dự án chỉ xem: nút thêm bị tắt;
  - `Search`: kết quả kéo có `sha256`, `start`, `end`;
  - `Analyse`: nút chú thích tắt khi kế hoạch còn file chưa phân tích offline;
  - `Suggest`: "Đặt vào shot" gọi hàm ghi `/api/broll/apply` với id shot và đoạn đã chọn.
- **Verify:** `cd $W/ui && npx vitest run src/panels/media src/ext/broll` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 6.

### Task 4b.4 — Thử trực tiếp trên 4413, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4b` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4413 /tmp/ms-react-root-4413`. Ghi PID vào báo cáo.
  3. Mở `http://127.0.0.1:4413/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4b` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-media.md`: mỗi dòng nhóm `4b` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-media.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `media`: `/?name=thuy-mau-demo&tab=media`;
     - `media-readonly`: `/?name=abm-intro&tab=media`;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4413 --views /tmp/ms-react-views-media.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/media --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4b *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-media.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 4` và thoát 0.
  - `lsof -nP -iTCP:4413 -sTCP:LISTEN | wc -l` in `0`.

### Task 4b.5 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-media-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/extensions.md` mục "Kéo footage" (`:90-99`; hằng `MEDIA_DRAG` nay ở `ui/src/core/dnd.ts`), và `docs/broll-index.md` nếu có nhắc file trong `public/`.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): media tab with registered footage, file browser and assets`
     - `feat(ui): b-roll search, footage analysis and shot suggestions`
  4. `git -C $W push -u origin feat/react-ui-media`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-media --title "feat(ui): media tab and b-roll search in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-media-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs media` in dòng bắt đầu bằng `ok media` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-media --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Trình duyệt tệp chậm hay lỗi ở thư mục lớn | Thấp | Vừa | Giữ đúng cách gọi `/api/media/browse` từng cấp như bản cũ; trạng thái `Loading` và `Fail` có sẵn |
| Kéo từ panel sang timeline không ăn vì kiểu dữ liệu lệch | Thấp | Cao | Chỉ dùng `setMediaDrag` của `core/dnd.ts`; test kiểm chuỗi JSON |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-media.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-media --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-media`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4413` bị đổi.

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
