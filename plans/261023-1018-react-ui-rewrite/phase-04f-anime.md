# Phase 4f: Anime (motion comic)

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-anime` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-anime`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4417. Gốc thử riêng: `/tmp/ms-react-root-4417`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `anime`. Nhóm trong checklist: `4f`.
- **Effort:** 5h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Tab `anime` (nhóm `assets`, `order 30`, icon `Sparkles`, chữ "Anime"), chép `public/ext-anime.js`, `anime-chars.js`, `anime-board.js`, `anime-manifest.js`. Tab mở được với dự án **chưa có** `project.json`, như bản cũ.

## Hiện trạng đã kiểm

- `public/ext-anime.js:5-7`: `SUBS = [["board", "Shot board"], ["chars", "Nhân vật"], ["anim", "Hoạt hình"]]`, `POLL_MS = 1200`, `JOB_MAX_MS = 10 * 60000`. `:80-83`: tab `anime`, lead `Motion comic: nhân vật, shot board, biến thể tư thế và hoạt hình lật ảnh`. Comment `:3-6`: cần thư mục dự án, không cần `project.json`; một gốc cho mỗi dự án, không làm mất chữ đang gõ khi vẽ lại.
- `public/anime-board.js` (94 dòng): cột theo giai đoạn (`/api/anime/board`), thẻ shot có ảnh nền; chọn shot phát `anime:shot`, và khi dự án đang mở trong timeline thì chọn shot đó và tua tới đầu shot (`:38`); form "Sinh biến thể tư thế" (`/api/anime/variant`).
- `public/anime-chars.js` (72 dòng): thư viện nhân vật (`/api/anime/chars`): sheet, tên, màu khoá, bảng màu, ghi chú; sheet chưa có trong thư viện có nút "Lưu vào thư viện"; "Sinh sheet".
- `public/anime-manifest.js` (178 dòng): sáu form (lipsync, blink, wind, keys, impacts, offset theo tư thế) và ô JSON thô; nháp; "Lưu và build" gửi kèm `sha` (409 khi file đã đổi), hỏi lại khi dự án đã có video final (428), theo job build, liệt kê dòng WARN (`/api/anime/manifest`, `/api/anime/rebuild`, `/api/anime/enable`, `/api/anime/job`).
- Màu khoá mặc định `#0047FF` là dữ liệu, không phải màu giao diện: ghi `token-exempt: màu khoá chroma của sheet nhân vật`.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `anime` trong `ui/ownership.json`):

- `ui/src/ext/anime/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-anime.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-anime-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-anime.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-anime.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4f.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4417.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-anime -b feat/react-ui-anime origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4417 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4417`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-anime`.
  - `lsof -nP -iTCP:4417 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4f.1 — Tab `anime`

- **File:** `ui/src/ext/anime/index.ts`, `AnimeTab.tsx`, `Board.tsx`, `Chars.tsx`, `Manifest.tsx`, `store.ts`, `useJob.ts`.
- **Các bước:**
  1. `register(studio)`: `registerTab({ id: "anime", label: "Anime", icon: Sparkles, group: "assets", order: 30, lead: <ext-anime.js:81>, component: AnimeTab })`.
  2. `AnimeTab`: shadcn `Tabs` với ba tab con theo `SUBS`. Cần `store.name`, không cần manifest; chưa chọn dự án thì `Empty` như bản cũ.
  3. `store.ts`: nháp form và tab con theo từng dự án, giữ khi đổi tab rail hay khi query tải lại.
  4. `Board`, `Chars`, `Manifest` chép ba file tương ứng, chữ nguyên văn. Chọn shot: `bus.emit("anime:shot", s)`; nếu dự án có manifest thì `actions.pick("shot", s.id)` và `actions.transport.seek(<đầu shot>)`.
  5. `useJob.ts`: theo job bằng hook `/api/anime/job` với `refetchInterval: 1200`, dừng khi xong hay sau `JOB_MAX_MS`.
  6. Luồng lưu: 409 hiện câu báo cũ và giữ nháp; 428 hỏi xác nhận (shadcn `Dialog`) rồi gửi lại với cờ như bản cũ.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4f.2 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/ext/anime` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - ba tab con đúng chữ `Shot board`, `Nhân vật`, `Hoạt hình`;
  - dự án chưa có `project.json` vẫn hiện bảng shot (không hiện `NeedManifest`);
  - chọn shot phát `anime:shot` và gọi `actions.pick("shot", id)` khi có manifest;
  - lưu nhận 409: câu báo hiện, nháp còn nguyên;
  - lưu nhận 428: hộp xác nhận mở; xác nhận thì gửi lại;
  - chữ đang gõ trong form còn nguyên sau khi query `chars` tải lại.
- **Verify:** `cd $W/ui && npx vitest run src/ext/anime` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 6.

### Task 4f.3 — Thử trực tiếp trên 4417, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4f` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4417 /tmp/ms-react-root-4417`. Ghi PID vào báo cáo.
  3. Mở `http://127.0.0.1:4417/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4f` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-anime.md`: mỗi dòng nhóm `4f` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-anime.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `anime-board`: `/?name=thuy-mau-demo&tab=anime`;
     - `anime-noproject`: `/?name=viet-pro-intro&tab=anime`;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4417 --views /tmp/ms-react-views-anime.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/anime --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4f *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-anime.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 4` và thoát 0.
  - `lsof -nP -iTCP:4417 -sTCP:LISTEN | wc -l` in `0`.

### Task 4f.4 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-anime-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/anime-motion-comic.md`, và ví dụ extension trong `docs/extensions.md` nếu có nhắc `public/ext-anime.js`.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): anime tab with character library, shot board and animation manifest editor`
  4. `git -C $W push -u origin feat/react-ui-anime`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-anime --title "feat(ui): anime tab in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-anime-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs anime` in dòng bắt đầu bằng `ok anime` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-anime --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Chữ đang gõ trong form bị mất khi dữ liệu tải lại | Vừa | Vừa | State form nằm trong `ext/anime/store.ts` theo từng dự án, không lấy lại từ query khi đang sửa; có test |
| 409/428 xử lý sai làm ghi đè manifest | Thấp | Cao | Chép đúng luồng của `anime-manifest.js`; test cả hai mã |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-anime.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-anime --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-anime`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4417` bị đổi.

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
