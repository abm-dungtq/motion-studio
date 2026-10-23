# Phase 4c: Lời & giọng, Nhạc & âm thanh

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-voice-music` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-voice-music`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4414. Gốc thử riêng: `/tmp/ms-react-root-4414`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `voice-music`. Nhóm trong checklist: `4c`.
- **Effort:** 3h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác.

## Mục tiêu

Hai tab nhóm `audio`:
- `voice`: "Lời & giọng", `order 10`, icon `Mic`, có badge đếm câu `stale`;
- `music`: "Nhạc & âm thanh", `order 20`, icon `Music`.

Hai tab chép đúng view `voice()` và `music()` của `public/panels.js:193-229`.

## Hiện trạng đã kiểm

- `public/panels.js:16-17`: lead của `voice` (`Sửa lời từng câu. Câu đã sửa cần qua cổng viet-pro và lồng tiếng lại.`) và `music` (`Nhạc nền và hiệu ứng âm thanh gắn theo shot.`).
- `public/panels.js:193-211` (`voice`): không có câu thì `empty("Chưa có câu thoại. Giao việc cho AI viết kịch bản.", "Giao việc cho AI", "ai")`. Mỗi câu một thẻ:
  - `textarea` có `aria-label` `Câu <n>`, badge `gate`;
  - nút "Lưu lời": không đổi thì toast `Không có gì thay đổi`; đổi thì `patch set_line_text` rồi toast `Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại`;
  - câu `stale` có dòng nhắc và nút "Nhờ duyệt và lồng tiếng lại", gọi `ctx.direct({ scope: "line", target, text })` với chữ ở `:208`.
- `public/panels.js:212-229` (`music`): mục `Nhạc nền` (thanh trượt 0–100, `change` → `patch set_music gain = value/100`, nhãn `%`) và mục `Hiệu ứng âm thanh` (nhãn, `shot + offset` theo `fmtS`, tên file âm thanh). Câu rỗng chép đúng `:226-227`.
- `public/panels.js:521`: badge `voice` = số câu `gate === "stale"`.
- `Empty` của phase 3 hiểu `to: "ai"` (mở tab Đạo diễn ở cột phải).

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `voice-music` trong `ui/ownership.json`):

- `ui/src/panels/voice/**`
- `ui/src/panels/music/**`
- `plans/261023-1018-react-ui-rewrite/reports/parity-voice-music.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-voice-music-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-voice-music.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-voice-music.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Các task

### Task 4c.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4414.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-voice-music -b feat/react-ui-voice-music origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4414 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4414`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-voice-music`.
  - `lsof -nP -iTCP:4414 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4c.1 — Tab `voice` và tab `music`

- **File:** `ui/src/panels/voice/index.ts`, `VoiceTab.tsx`; `ui/src/panels/music/index.ts`, `MusicTab.tsx`.
- **Các bước:**
  1. `voice/index.ts`: `registerTab({ id: "voice", label: "Lời & giọng", icon: Mic, group: "audio", order: 10, lead, component: VoiceTab, badge: () => <số câu stale của manifest đang mở> })`. `badge` đọc manifest từ cache query (`queryClient.getQueryData`), không fetch.
  2. `VoiceTab.tsx` chép `:193-211`, dùng `actions.patch` và `actions.direct`, chữ nguyên văn.
  3. `music/index.ts`: `registerTab({ id: "music", label: "Nhạc & âm thanh", icon: Music, group: "audio", order: 20, lead, component: MusicTab })`.
  4. `MusicTab.tsx` chép `:212-229`: shadcn `Slider` (0–100, bước 1), nhãn `%` đổi theo `onValueChange`, gửi patch trong `onValueCommit`.
  5. Dự án chỉ xem: `textarea`, nút và thanh trượt tắt.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 4c.2 — Test component

- **File:** `*.test.tsx` cạnh từng component của vùng (`ui/src/panels/voice` và các thư mục khác của vùng).
- **Các bước:** dùng vitest và Testing Library; mock `ui/src/api/queries` và `ui/src/api/actions` bằng `vi.mock`, dữ liệu là JSON nhỏ trong file test (lấy hình dạng từ phản hồi thật trên 4411). Phải có:
  - Lưu lời khi không đổi: toast `Không có gì thay đổi`, không gọi `patch`;
  - Lưu lời khi đổi: `patch([{ op: "set_line_text", id, text }])`, rồi toast đúng chữ;
  - câu `stale`: có nút "Nhờ duyệt và lồng tiếng lại", và nút gọi `actions.direct` với đúng chuỗi của `panels.js:208`;
  - `badge()` trả số câu `stale`;
  - không có câu: chữ rỗng và nút "Giao việc cho AI";
  - nhạc: commit thanh trượt ở 40 gửi `set_music` với `value: 0.4`; kéo giữa chừng không gửi.
- **Verify:** `cd $W/ui && npx vitest run src/panels/voice src/panels/music` thoát 0, có `passed`, không `failed`; dòng `Tests` của vitest ≥ 6.

### Task 4c.3 — Thử trực tiếp trên 4414, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4c` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4414 /tmp/ms-react-root-4414`. Ghi PID vào báo cáo.
  3. Mở `http://127.0.0.1:4414/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4c` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-voice-music.md`: mỗi dòng nhóm `4c` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-voice-music.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `voice`: `/?name=thuy-mau-demo&tab=voice`;
     - `music`: `/?name=thuy-mau-demo&tab=music`;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4414 --views /tmp/ms-react-views-voice-music.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/voice-music --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4c *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-voice-music.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 4` và thoát 0.
  - `lsof -nP -iTCP:4414 -sTCP:LISTEN | wc -l` in `0`.

### Task 4c.4 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-voice-music-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: vùng này không có tài liệu riêng; ghi "không cần sửa" nếu đúng như vậy.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): voice tab with line edits and the viet-pro gate`
     - `feat(ui): music tab with background music volume and sound effects`
  4. `git -C $W push -u origin feat/react-ui-voice-music`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-voice-music --title "feat(ui): voice and music tabs in React" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-voice-music-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs voice-music` in dòng bắt đầu bằng `ok voice-music` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-voice-music --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Thanh trượt gửi patch liên tục khi kéo | Vừa | Vừa | Dùng `onValueCommit` của shadcn `Slider`, giống sự kiện `change` của bản cũ; có test |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-voice-music.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-voice-music --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-voice-music`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4414` bị đổi.

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
