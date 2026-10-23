# Phase 5: tích hợp, parity đầy đủ, xoá `public/`, PR lên `main`

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui`. Chạy **nối tiếp**, một agent (orchestrator hoặc một agent được giao), không tỏa.
- **Cổng thử:** 4410 (UI mới, bản tích hợp), 4411 (UI cũ để đối chiếu). 4317 chỉ được đụng ở task 5.10, sau khi người dùng đồng ý.
- **Effort:** 10h.
- **Phụ thuộc:** cả tám phase 4a–4h đã có PR vào `feat/react-ui`, các PR xanh, và điểm dừng của 4a đã đạt.

## Mục tiêu

1. Gộp tám nhánh vùng vào `feat/react-ui`.
2. Chạy lại **toàn bộ** checklist parity trên bản tích hợp, tập trung vào các luồng đi qua nhiều vùng.
3. Đo lại fps trên `perf-60`.
4. Chụp mọi tab ở 1440 và 2560 px.
5. Thử clone sạch rồi `npm run setup` và `start`.
6. Xoá `public/` cùng nhánh phục vụ file tĩnh cũ, sửa tài liệu.
7. Mở **một** PR `feat/react-ui` → `main`. Sau khi người dùng duyệt và merge, chuyển Studio 4317 sang bản mới.

## Hiện trạng đã kiểm

- `server.mjs:51`: `const PUBLIC = join(HERE, "public")`. `:303-307`: `/` đọc `public/index.html` (phase 2 đã đổi sang `ui/dist`), và nhánh `PUBLIC_FILE.test(p) && existsSync(join(PUBLIC, …))` phục vụ `/<tên>.js|css` của `public/`. Phase này bỏ nhánh ở `:307` và hằng `PUBLIC`.
- `lib/routes.mjs:21`: `PUBLIC_FILE`. **Giữ** export này: `routes/extensions.mjs:6` vẫn import nó.
- `routes/extensions.mjs:12-17`: `listExtensions` bắt lỗi `readdirSync` và trả `{ scripts: [], styles: [] }` khi không có thư mục. Xoá `public/` không làm route lỗi; chỉ comment `:1-2` cần sửa.
- `tests/ui-extensions.test.mjs`:
  - `:18-26`: test `listExtensions` dùng thư mục tạm, vẫn đúng;
  - `:28-51`: test `GET /api/extensions` đòi có `/ext-agents.js` và `/ext.js`. Sau khi xoá thì phải đổi thành: trả `{ scripts: [], styles: [] }`, và `/ext.js` trả 404;
  - `:53-56`: test "every public/ file name…" đọc `public/`. Bỏ test này;
  - `:58-62`: `poolLines`, phase 2 đã chuyển sang `ui/src/core/pool-lines.ts`.
- `README.md:11`: `Node.js 20 trở lên. Không có dependency npm, không có bước build.` `:134-137`: hướng dẫn extension trỏ tới `public/ext-*.js`. `:58-72`: bảng phím tắt.
- `docs/extensions.md:8`, `:50-53`, `:88`, `:92`: nhắc `public/ext-*.js`, `public/ext.js`, `app.css`, `MEDIA_DRAG` trong `public/panels.js`.
- `docs/timeline.md:3`: `Timeline của Studio là JavaScript thuần trong public/, không có bước build và không dùng React.`
- `docs/transitions-and-effects.md:13`: bảng liệt kê file `public/` của fx.
- `PLAYER.md:35`: nhắc `studio/public/player.js`. Nay là `ui/src/core/player.ts`.
- `CHANGELOG.md`: mục `## Chưa phát hành` ở đầu file, mỗi thay đổi một gạch đầu dòng tiếng Việt.
- `package.json:10`: `"test"` đã đổi ở phase 2 thành `node --test tests/*.test.mjs && npm --prefix ui test`.
- `ui/scripts/check-ownership.test.mjs` (phase 3) chưa nằm trong `npm test`.

## Sở hữu file

Sau khi tám PR đã merge, không còn agent nào khác chạy, nên phase này sửa được mọi file trong danh sách:

- **Xoá:** `public/**`.
- **Sửa:** `server.mjs` (bỏ `PUBLIC` và nhánh `:307`), `routes/extensions.mjs` (chỉ comment), `tests/ui-extensions.test.mjs`, `ui/package.json` (chỉ script `test`, thêm `node --test scripts/check-ownership.test.mjs`), `parity-checklist.md` (cột "Mới"), `README.md`, `CHANGELOG.md`, `PLAYER.md`, `docs/extensions.md`, `docs/timeline.md`, `docs/transitions-and-effects.md`, và các file docs mà mục "Ghi chú tài liệu" của báo cáo vùng nêu tên.
- **Tạo:**
  - `ui/scripts/views-new.json`, `ui/scripts/fill-parity.mjs`;
  - `ui/src/integration.test.tsx`;
  - `plans/261023-1018-react-ui-rewrite/screens/*.jpg`;
  - `plans/261023-1018-react-ui-rewrite/reports/phase-05-report.md`.
- **Không đụng:** mọi route `/api/*`, `lib/**` (trừ khi Failure Protocol cho phép), plugin `~/.claude/skills/opus-video`.

## Luồng tích hợp

```text
8 PR vùng ──(merge commit, lần lượt)──► feat/react-ui ──► npm test sau mỗi merge
     │
     ├─► integration.test.tsx: loadAll thật → 7 tab đúng nhóm/thứ tự, 8 khe có nội dung
     ├─► fill-parity.mjs: reports/parity-*.md ──► cột "Mới" của parity-checklist.md
     ├─► thử tay các luồng liên vùng trên 4410 ──► reports/phase-05-report.md
     ├─► perf-playhead.mjs (perf-60) ──► fps ≥ 50
     ├─► shoot.mjs views-new.json 1440/2560 ──► ảnh + JPEG trong screens/
     ├─► clone sạch /tmp/ms-clean-clone ──► npm run setup ──► start (build lúc start) ──► smoke 4410
     ├─► xoá public/ + nhánh PUBLIC_FILE ──► sửa test, docs ──► npm test
     └─► PR feat/react-ui → main ──(người dùng duyệt, merge)──► chuyển 4317
```

## Các task

### Task 5.0 — Gộp tám nhánh vùng

- **Mục tiêu:** `feat/react-ui` có đủ code của 4a–4h, `npm test` xanh sau mỗi lần gộp.
- **Các bước:**
  1. `gh pr list --repo abm-dungtq/motion-studio --base feat/react-ui --state open --json number,headRefName` phải liệt kê đúng tám nhánh `feat/react-ui-{timeline,media,voice-music,director,export,anime,lemo,fx}`.
  2. Với mỗi PR, theo thứ tự `timeline`, `media`, `voice-music`, `director`, `export`, `anime`, `lemo`, `fx`:
     - chạy `node ui/scripts/check-ownership.mjs <vùng> --base origin/feat/react-ui` trong worktree của vùng; phải in `ok <vùng>`;
     - `gh pr merge <số> --repo abm-dungtq/motion-studio --merge`;
     - `git -C $W pull --ff-only && npm --prefix $W/ui ci --no-audit --no-fund && cd $W && npm test`.
  3. Có xung đột thì đó là lỗi sở hữu: theo Failure Protocol, không tự giải quyết bằng tay.
- **Verify:**
  - `gh pr list --repo abm-dungtq/motion-studio --base feat/react-ui --state open | wc -l` in `0`.
  - `gh pr list --repo abm-dungtq/motion-studio --base feat/react-ui --state merged --json headRefName -q '.[].headRefName' | grep -c '^feat/react-ui-'` in `9`: tám vùng cộng `feat/react-ui-parity` của phase 1.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.

### Task 5.1 — Test tích hợp với bộ nạp thật

- **Mục tiêu:** chứng minh các vùng cắm đúng vào hợp đồng khi chạy cùng nhau.
- **File:** `ui/src/integration.test.tsx`.
- **Các bước:** render `App` với `loadAll(createStudio())` thật (glob thật, không mock module vùng) và dữ liệu query giả của `thuy-mau-demo`. Test kiểm:
  - rail có đúng 7 tab theo thứ tự `media`, `styles-code`, `anime`, `fx`, `voice`, `music`, `library`, với 2 đường kẻ nhóm;
  - không có toast `Extension lỗi, đã bỏ qua`;
  - `useSections("media")` có `broll-search`; `useSections("export")` có `gates`, `jobs`, `files`, `receipts` theo thứ tự; `useSections("director")` có `chat`;
  - inspector shot có các mục theo thứ tự: lõi (order 0), B-roll (30), fx (40), lemo (50), biên nhận (60);
  - `useAgentRows()` có hai dòng, `panels/agent` trước `ext/agents`;
  - mỗi khe trong `SLOTS` có nội dung khác rỗng khi mở đúng chỗ.
- **Verify:** `cd $W/ui && npx vitest run src/integration.test.tsx` thoát 0 và có `passed`.

### Task 5.2 — Gộp kết quả parity vào checklist

- **Mục tiêu:** cột "Mới" của `parity-checklist.md` lấy từ báo cáo của từng vùng, không chép tay.
- **File:** `ui/scripts/fill-parity.mjs`.
- **Các bước:**
  1. `fill-parity.mjs <thư mục plan>`:
     - đọc `reports/parity-3.md` và `reports/parity-{timeline,media,voice-music,director,export,anime,lemo,fx}.md`, lấy mỗi dòng `| <ID> | có / không | <chỗ> | <ghi chú> |`;
     - với mỗi dòng của `parity-checklist.md`, ghi kết quả vào cột 7 ("Mới"), và cột 8 ("Chỗ trong UI mới") khi báo cáo có;
     - ID có trong checklist mà không có trong báo cáo nào thì in `THIẾU <ID>`; ID có trong hai báo cáo thì in `TRÙNG <ID>`;
     - thoát 1 khi có `THIẾU` hay `TRÙNG`.
  2. Chạy `node $W/ui/scripts/fill-parity.mjs $W/plans/261023-1018-react-ui-rewrite`.
- **Verify:**
  - Lệnh ở bước 2 không in `THIẾU` hay `TRÙNG`, và thoát 0.
  - `awk -F'|' '/^\| [A-Z]+-/ && $8 !~ /có/' $W/plans/261023-1018-react-ui-rewrite/parity-checklist.md | wc -l` in `0`.

### Task 5.3 — Thử các luồng liên vùng trên 4410

- **Mục tiêu:** các hành vi mà không vùng nào thử được một mình đều chạy trên bản tích hợp.
- **Các bước:**
  1. `npm --prefix $W/ui run build`; `rm -rf /tmp/ms-react-root-4410 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4410`; background-run `node $W/ui/scripts/smoke-server.mjs $W 4410 /tmp/ms-react-root-4410`, ghi PID.
  2. Thử và ghi vào `reports/phase-05-report.md` (mỗi mục một dòng `| <số>. <mục> | có / không | bằng chứng |`):
     1. kéo một dòng footage từ tab Chất liệu thả vào làn B-roll: một op trong `/api/log`, khối hiện trên làn;
     2. kéo một kết quả "Tìm trong footage" thả vào làn B-roll;
     3. bấm khối shot trên timeline: cột phải chuyển sang tab Shot, các mục theo đúng thứ tự của task 5.1;
     4. menu chuột phải của shot, "Nhờ đạo diễn sửa shot này": tab Shot mở và ô ghi chuyển động có focus;
     5. kéo một mốc phách: inspector hiện dòng nhắc duyệt lại animatic, chip cổng đổi sau khoảng 0,5 s;
     6. seed thẻ animatic (`node $W/ui/scripts/seed-gate-cards.mjs $W /tmp/ms-react-root-4410/thuy-mau-demo animatic`): chấm báo ở tab Đạo diễn hiện; bấm chip cổng mở tab Đạo diễn;
     7. nút "Giao việc cho AI" ở trạng thái rỗng của tab Lời & giọng (trên `viet-pro-intro` sau khi nhập) mở tab Đạo diễn;
     8. chọn shot ở tab Anime: timeline chọn shot đó và playhead tới đầu shot;
     9. tab `fx`: thư viện chuyển cảnh theo shot đang chọn trên timeline; nút "Mở thư viện chuyển cảnh" trong inspector mở tab `fx`;
     10. menu Xuất bản → "Xuất bộ lớp dựng": job hiện trong "Cổng & tệp đã xuất…", log chạy, file hiện khi xong;
     11. menu Xuất bản → "Xuất video": như trên, ra `renders/<dự án>-…-final.mp4` trong gốc thử;
     12. `?tab=ai` mở tab Đạo diễn; `?tab=output` mở hộp thoại xuất; `?tab=media` mở tab Chất liệu;
     13. Alt+1…7 chọn đúng 7 tab; mọi phím trong bảng `README.md:60-72` chạy; không phím nào chạy khi đang mở hộp thoại Dự án mới;
     14. thu gọn rồi mở lại, kéo đổi cỡ panel trái và cột phải; tải lại trang thì giữ cỡ (`autoSaveId`).
  3. Dừng server (`kill <PID>`).
- **Verify:**
  - `grep -cE "^\| [0-9]+\. .* \| có \|" $W/plans/261023-1018-react-ui-rewrite/reports/phase-05-report.md` in `14`. (Mỗi dòng bắt đầu bằng số thứ tự của mục.)
  - `lsof -nP -iTCP:4410 -sTCP:LISTEN | wc -l` in `0`.

### Task 5.4 — Đo lại fps trên bản tích hợp

- **Các bước:** background-run lại smoke server 4410 như task 5.3; `node $W/ui/scripts/perf-playhead.mjs --base http://127.0.0.1:4410 --name perf-60 --runs 3 --min 50`; chép dòng `fps=…` vào `reports/phase-05-report.md`; dừng server.
- **Verify:** lệnh in dòng cuối `ok` và thoát 0.

### Task 5.5 — Ảnh mọi tab ở 1440 và 2560

- **File:** `ui/scripts/views-new.json`, `plans/261023-1018-react-ui-rewrite/screens/`.
- **Các bước:**
  1. `views-new.json`, cùng dạng với `views-old.json`, `name=thuy-mau-demo`, 14 view:
     - 7 tab rail: `/?name=thuy-mau-demo&tab=<id>`, `ready` là `[data-slot=left] section, [data-slot=left] .empty, [data-slot=left] [role=status]`;
     - `director`: `/?name=thuy-mau-demo&tab=ai`;
     - `export`: `/?name=thuy-mau-demo&tab=output`;
     - `new-project`: bấm nút "Dự án mới";
     - `agent`: bấm chip agent;
     - `inspector-shot`: bấm khối shot đầu tiên (`[data-slot=timeline] [data-kind=shot]`);
     - `readonly`: `/?name=abm-intro&tab=media`;
     - `gate-card`: `/?name=thuy-mau-demo&tab=ai`, sau khi seed thẻ chọn hướng.
  2. Background-run smoke server 4410; seed thẻ chọn hướng; chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4410 --views $W/ui/scripts/views-new.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/final --widths 1440,2560`; dừng server.
  3. Bản nhúng PR: với mỗi ảnh PNG, `sips -s format jpeg -s formatOptions 75 <png> --out $W/plans/261023-1018-react-ui-rewrite/screens/<rộng>-<id>.jpg`. Chỉ làm khi người dùng không chọn khác ở câu hỏi mở 3 trong `plan.md`.
- **Verify:**
  - Lệnh `shoot.mjs` in dòng cuối `ok 28` và thoát 0.
  - `ls $W/plans/261023-1018-react-ui-rewrite/screens/*.jpg | wc -l` in `28`.
  - `du -sk $W/plans/261023-1018-react-ui-rewrite/screens | awk '{print ($1 < 8192) ? "ok" : "lớn"}'` in `ok` (dưới 8 MB).

### Task 5.6 — Clone sạch, `setup`, `start`

- **Mục tiêu:** người mới clone về, chạy `npm run setup` rồi `start` là dùng được, không cần bước tay nào khác.
- **Các bước:**
  1. `rm -rf /tmp/ms-clean-clone && git clone --branch feat/react-ui https://github.com/abm-dungtq/motion-studio /tmp/ms-clean-clone`.
  2. `cd /tmp/ms-clean-clone && npm run setup </dev/null; echo "exit $?"`. Không có terminal nên phần provider không cài gì: thoát 0 (provider đã có) hoặc 3 (chỉ in lệnh). Phần UI phải đã chạy `npm ci` và build.
  3. Kiểm đường build lúc start mà **không** chiếm 4317:
     - `touch /tmp/ms-clean-clone/ui/src/main.tsx` để nguồn mới hơn bản build;
     - kiểm bằng `lsof -nP -iTCP:4317 -sTCP:LISTEN`. Nếu 4317 đang có Studio của người dùng thì chạy `MOTION_STUDIO_STATE=/tmp/ms-clean-state.json node /tmp/ms-clean-clone/bin/motion-studio.mjs start 2>&1; echo "exit $?"`. Lệnh build lại rồi dừng ở bước kiểm cổng với mã 3, vì 4317 đã bận. Không dừng server 4317;
     - nếu 4317 trống thì **không** chạy `start` (nó sẽ chiếm 4317); thay bằng `node -e 'import("/tmp/ms-clean-clone/lib/ui-build.mjs").then(m=>m.ensureUi({dir:"/tmp/ms-clean-clone/ui",install:false})).then(r=>console.log(r.action))'` và đòi in `built`.
  4. Background-run `node /tmp/ms-clean-clone/ui/scripts/smoke-server.mjs /tmp/ms-clean-clone 4410 /tmp/ms-react-root-4410`; `curl` trang chủ; dừng server.
- **Verify:**
  - Bước 2 in `exit 0` hoặc `exit 3`, và `test -f /tmp/ms-clean-clone/ui/dist/index.html && echo ok` in `ok`.
  - Bước 3: output có `giao diện: build xong` và `exit 3`, hoặc lệnh `node -e` in `built`. Rồi `find /tmp/ms-clean-clone/ui/dist/index.html -newer /tmp/ms-clean-clone/ui/src/main.tsx | wc -l` in `1`.
  - Bước 4: `curl -s http://127.0.0.1:4410/ | grep -c 'content="smoke-4410"'` in `1`; sau khi dừng, `lsof -nP -iTCP:4410 -sTCP:LISTEN | wc -l` in `0`.
  - `git -C /tmp/ms-clean-clone status --porcelain | wc -l` in `0`: build không để lại file nào ngoài `.gitignore`.

### Task 5.7 — Xoá `public/` và nhánh phục vụ cũ

- **Các bước:**
  1. `git -C $W rm -r public`.
  2. `server.mjs`: bỏ `const PUBLIC = …` (`:51`) và nhánh `PUBLIC_FILE.test(p) && existsSync(join(PUBLIC, …))` (`:307`). Bỏ `PUBLIC_FILE` khỏi dòng import `:48` nếu không còn dùng trong `server.mjs`. Không đổi gì khác.
  3. `routes/extensions.mjs:1-2`: comment ghi route nay luôn trả danh sách rỗng, vì extension giao diện nằm trong `ui/src/ext/*/` và được build vào `ui/dist`; route giữ để không đổi API.
  4. `tests/ui-extensions.test.mjs`:
     - `:28-51`: đổi kỳ vọng: `r.json` là `{ scripts: [], styles: [] }`, `GET /ext.js` trả `404`;
     - bỏ test `:53-56`.
  5. `ui/package.json`: script `test` thành `tsc --noEmit && vitest run && node --test scripts/check-ownership.test.mjs`.
- **Verify:**
  - `test -d $W/public; echo $?` in `1`.
  - `grep -rn "public/" $W/server.mjs $W/lib $W/routes $W/bin $W/tests --include='*.mjs' | grep -v "^.*://" | wc -l` in `0`.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, phần vitest không có `failed`.

### Task 5.8 — Tài liệu

- **Các bước:**
  1. `README.md`:
     - `:11` thành: Node.js 22.18 trở lên; server không có dependency npm; giao diện ở `ui/` được build bằng Vite lúc `npm run setup`, và lại lúc `start` khi nguồn mới hơn bản build; lần cài đầu cần mạng;
     - `:134-137`: extension là thư mục `ui/src/ext/<tên>/index.ts` export `register(studio)`, cùng các hàm `registerTab`, `registerSection`, `registerInspectorSection`, `registerAgentRows`, `registerTimelineDecorator`;
     - bảng phím tắt `:58-72`: đối chiếu với báo cáo 4a; thêm `=`/`+`, `-` nếu UI mới có mà bảng chưa có.
  2. `docs/extensions.md`: viết lại mục "Giao diện" (`:48-99`) theo API mới, có ví dụ `ui/src/ext/hello/index.ts` dùng `registerTab`; bảng `:8`; mục "Kéo footage" trỏ `ui/src/core/dnd.ts`; bỏ câu về `app.css` (`:88`), thay bằng luật token.
  3. `docs/timeline.md:3`: timeline nay là React trong `ui/src/timeline/`; logic thuần ở `ui/src/core/timeline-edit.ts` và các file `core` khác; giữ bảng nguồn tham khảo.
  4. `docs/transitions-and-effects.md:13`: file nay là `ui/src/ext/fx/*`; thư viện chuyển cảnh ở tab "Chuyển cảnh & hiệu ứng".
  5. `PLAYER.md:35`: `studio/public/player.js` thành `ui/src/core/player.ts`.
  6. Các mục "Ghi chú tài liệu" trong tám báo cáo `reports/phase-04-*-report.md`.
  7. `CHANGELOG.md`, mục `## Chưa phát hành`, thêm một gạch đầu dòng ở đầu: giao diện viết lại bằng React + TypeScript + Tailwind + shadcn/ui, theme tối kiểu NLE, bố cục mới (thanh trên có menu Xuất bản; rail icon theo nhóm; cột phải Đạo diễn/Shot; panel thu gọn và đổi cỡ được; sân khấu đen), tab mới "Chuyển cảnh & hiệu ứng", cần Node 22.18, extension viết theo API mới.
- **Verify:**
  - `grep -rn "public/" $W/README.md $W/PLAYER.md $W/docs | wc -l` in `0`.
  - `grep -c "22.18" $W/README.md` in số ≥ `1`.
  - `grep -n "registerTab" $W/docs/extensions.md | wc -l` in số ≥ `1`.
  - `cd $W && node --test tests/provider.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0` (docs không có tên provider bị cấm).

### Task 5.9 — Commit và PR lên `main`

- **Các bước:**
  1. Commit, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `test(ui): integration test of every panel and extension through the real loader`
     - `chore(ui): parity results, final screenshots and fill script`
     - `refactor!: remove the vanilla public/ UI now served from ui/dist`
     - `docs: React UI, Node 22.18, extension API and new layout`
  2. `git -C $W push`.
  3. Ghi `reports/phase-05-report.md` thành thân PR:
     - tóm tắt;
     - số test trước (baseline task 2.0) và sau;
     - fps;
     - tỉ lệ parity;
     - bảng ảnh (link raw tới `screens/` hoặc đường dẫn ảnh);
     - mục **Breaking**: Node 22.18; `public/ext-*.js` không còn được nạp;
     - cách hoàn tác.
  4. `gh pr create --repo abm-dungtq/motion-studio --base main --head feat/react-ui --title "feat!: React UI with NLE layout" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-05-report.md` (chạy trong `$W`).
  5. **Dừng, báo người dùng link PR và chờ duyệt.** Không tự merge.
- **Verify:**
  - `gh pr view feat/react-ui --repo abm-dungtq/motion-studio --json baseRefName,state -q '.baseRefName+" "+.state'` in `main OPEN`.
  - `git -C $W log origin/main..HEAD --format=%B | grep -ciE "claude|co-authored-by|\bAI\b"` in `0`.

### Task 5.10 — Sau khi người dùng duyệt: merge, chuyển 4317, dọn

Chỉ làm khi người dùng đã nói rõ là đồng ý merge.

- **Các bước:**
  1. `gh pr merge feat/react-ui --repo abm-dungtq/motion-studio --merge`.
  2. Trong `/Volumes/2/Motion-Studio`: `git pull --ff-only`, rồi `npm run setup -- --yes`.
  3. Hỏi người dùng trước khi khởi động lại Studio. Được đồng ý thì `node bin/motion-studio.mjs stop && node bin/motion-studio.mjs start --background`.
  4. Dọn:
     - dừng server 4411 (`kill <PID>` đã ghi ở phase 1);
     - xoá worktree: `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-<vùng>` cho tám vùng và `react-ui-parity`, rồi `react-ui`;
     - xoá nhánh từ xa đã merge: `git push origin --delete feat/react-ui-<vùng>`;
     - `rm -rf /tmp/ms-react-root-* /tmp/ms-react-tools /tmp/ms-clean-clone /tmp/ms-clean-state.json /tmp/ms-react-views-*.json`.
- **Verify:**
  - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4317/` in `200`, và `curl -s http://127.0.0.1:4317/ | grep -c '/assets/'` in số ≥ `1` (trang từ `ui/dist`).
  - `for p in 4410 4411 4412 4413 4414 4415 4416 4417 4418 4419; do lsof -nP -iTCP:$p -sTCP:LISTEN; done | wc -l` in `0`.
  - `git -C /Volumes/2/Motion-Studio worktree list | grep -c react-ui` in `0`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Luồng liên vùng hỏng dù từng vùng xanh | Vừa | Cao | Task 5.1 (test với bộ nạp thật) và task 5.3 (14 luồng thử tay) |
| Xoá `public/` làm hỏng một test hay đường dẫn còn sót | Vừa | Vừa | Grep ở Verify task 5.7; `npm test` toàn bộ |
| Clone sạch không build được vì thiếu mạng hoặc cache npm | Thấp | Cao | Chạy khi có mạng; `ensureUi` giữ bản build cũ khi build lỗi (phase 2) |
| Ảnh chụp làm repo nặng | Thấp | Thấp | JPEG chất lượng 75, giới hạn 8 MB ở Verify; câu hỏi mở 3 cho phép bỏ |
| Chuyển 4317 làm gián đoạn phiên làm việc của người dùng | Thấp | Vừa | Chỉ làm sau khi người dùng đồng ý; hoàn tác bằng `git revert -m 1` rồi khởi động lại |

## Hoàn tác

- **Trước khi merge lên `main`:** đóng PR, `main` không đổi.
- **Sau khi merge:** `git revert -m 1 <sha merge>` trên `main` trả lại `public/` và server cũ. Sau đó, khi người dùng đồng ý, chạy `node bin/motion-studio.mjs stop && node bin/motion-studio.mjs start --background` trong `/Volumes/2/Motion-Studio`. Bản cũ không cần build.
- Không có dữ liệu người dùng nào đổi dạng: cùng API, cùng khoá `localStorage` `studio.tab`, cùng cache IndexedDB `ms-peaks` và `ms-thumbs`.

## Dừng và hỏi người dùng

Dừng và hỏi người dùng (không gọi kongming) khi:

- cần đổi API server;
- gặp lỗi vẫn không giải thích được sau một lượt Failure Protocol;
- cần xoá hay ghi đè file ngoài repo, trừ `/tmp/ms-react-*` và `/tmp/ms-clean-*`;
- trước khi merge PR lên `main`, và trước khi dừng hay khởi động lại server 4317.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc gặp việc ngoài sở hữu file của phase này: **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
