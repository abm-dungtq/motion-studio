# Phase 6: Chạy thật ở cổng 4420, tài liệu, CHANGELOG, PR

- **Nhánh:** `feat/jev-style-suggest` trên checkout chính `/Volumes/2/Motion-Studio`.
- **Phụ thuộc:** phase 1 đến 5 đã gộp vào nhánh này.
- **Song song:** với phase 7.
- **Effort:** 3h.

## Mục tiêu

- Chứng minh luồng chạy thật trên một Studio thử ở cổng 4420, với bản sao dự án trong `/tmp` và khoá TypeSafe thật nếu máy có: gợi ý ở nguồn mặc định `observe`, xem thẻ hai cột, chọn hướng, rồi `BRIEF.md` của bản sao được cập nhật và log lựa chọn có một dòng.
- Ghi tài liệu, ghi CHANGELOG, mở PR.

## Hiện trạng đã kiểm

- `ui/scripts/smoke-server.mjs:1-13`:
  - chạy `<checkout> <port> <root>` với token `smoke-<port>`;
  - từ chối cổng 4317;
  - đặt `MOTION_STUDIO_STATE=<root>/studio.json`.
- `ui/scripts/make-test-root.mjs:1-10`: chép `thuy-mau-demo` (sửa được), `abm-intro` và `viet-pro-intro` vào root thử. Nguồn trong `/Volumes/2/Edit-Video` chỉ được đọc.
- `/Volumes/2/Edit-Video/thuy-mau-demo/pitch/PICK.json` có các hàng `A2`, `A1`, `A5`.
- `ui/scripts/shoot.mjs:1-25` nhận `--base <url> --views <file.json> --out <dir>`. Một view có dạng `{ id, path, ready, steps? }`.
- Tài liệu:
  - `docs/` có `mcp.md` (bảng tool ở `:31-38`), `lemo-styles.md` và các file khác;
  - `CHANGELOG.md:3` có mục `## Chưa phát hành`;
  - `plans/` được git theo dõi; báo cáo của plan nằm trong `plans/<plan>/reports/`.
- Remote: `origin https://github.com/abm-dungtq/motion-studio.git`.

## Sở hữu file

- Tạo: `docs/suggest.md`, `plans/261023-1529-jev-style-suggest/reports/live-4420.md`.
- Sửa: `docs/mcp.md` (một hàng trong bảng tool), `CHANGELOG.md` (một gạch đầu dòng trong `Chưa phát hành`).
- Tạm, không commit: `/tmp/ms-react-root-4420/`, `/tmp/suggest-views.json`, `/tmp/suggest-shots/`, `/tmp/suggest-4420.log`.

## Các task

### Task 6.1 — Build và root thử

- **Steps:**
  1. `cd /Volumes/2/Motion-Studio && npm --prefix ui run build 2>&1 | tail -5`
  2. `rm -rf /tmp/ms-react-root-4420 && node /Volumes/2/Motion-Studio/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4420`
  3. `printf '{"director":{"runner":"mcp"}}\n' > /tmp/ms-react-root-4420/studio.json`. Dùng runner `mcp` để route không sinh tiến trình đạo diễn. Không đặt `suggest`, để chạy đúng nguồn mặc định.
- **Verify:**
  - `test -f /tmp/ms-react-root-4420/thuy-mau-demo/pitch/PICK.json && test -f /tmp/ms-react-root-4420/thuy-mau-demo/BRIEF.md && echo ok` in `ok`.
  - `lsof -nP -iTCP:4420 -sTCP:LISTEN | wc -l` in `0`. Nếu khác `0`: tiến trình đó không do phiên này mở, nên dừng phase và báo người dùng, không tự kill.

### Task 6.2 — Mở Studio thử

- **Steps:**
  1. Chạy bằng công cụ chạy nền của harness, không dùng `&` tự do: `node /Volumes/2/Motion-Studio/ui/scripts/smoke-server.mjs /Volumes/2/Motion-Studio 4420 /tmp/ms-react-root-4420 > /tmp/suggest-4420.log 2>&1`.
  2. Ghi PID: `lsof -nP -tiTCP:4420 -sTCP:LISTEN`. Ghi PID vào `live-4420.md`.
- **Verify:** `curl -s -o /dev/null -w "%{http_code}" -H "x-studio-token: smoke-4420" "http://127.0.0.1:4420/api/suggest?name=thuy-mau-demo"` in `200`.

### Task 6.3 — Gợi ý thật

- **Steps:**
  1. `curl -s -X POST -H "x-studio-token: smoke-4420" -H "content-type: application/json" -d '{"name":"thuy-mau-demo","refresh":true}' http://127.0.0.1:4420/api/suggest > /tmp/suggest-run.json`
  2. `node -e 'const r=require("/tmp/suggest-run.json").record;console.log(r.source, r.shown, r.error?.code ?? "ok", r.det.directions.length, r.jev ? r.jev.directions.length : 0, r.ms)'`. Ghi dòng này vào `live-4420.md`.
- **Success criteria:**
  - Máy có `TYPESAFE_API_KEY`: in `observe jev ok 3 3 <ms>`.
  - Máy không có khoá: in `observe det no-key 3 0 <ms>`. Kết quả này cũng đạt; ghi rõ vào báo cáo rằng Jev chưa được gọi thật.
- **Verify:**
  - `node -e 'const r=require("/tmp/suggest-run.json").record;console.log(r.det.directions.length===3 && ["ok","no-key"].includes(r.error?.code ?? "ok"))'` in `true`.
  - `command grep -c "TYPESAFE\|Bearer" /tmp/suggest-run.json /tmp/suggest-4420.log /tmp/ms-react-root-4420/thuy-mau-demo/.opus/suggest/latest.json` in `0` cho cả ba file.

### Task 6.4 — Chọn hướng thật qua `choose`

- **Steps:**
  1. Lấy id hàng đầu của pitch: `D=$(node -e 'console.log(require("/tmp/ms-react-root-4420/thuy-mau-demo/pitch/PICK.json").picks[0].id)')`.
  2. Lấy style hạng 1 hợp với hướng đó từ `/tmp/suggest-run.json`. Không có style nào thì bỏ `style`: `S=$(node -e 'const r=require("/tmp/suggest-run.json").record;const s=(r.shown==="jev"?r.jev:r.det).styles.find(x=>(x.directions??[process.argv[1]]).includes(process.argv[1]));console.log(s?s.id:"")' "$D")`.
  3. `curl -s -X POST -H "x-studio-token: smoke-4420" -H "content-type: application/json" -d "{\"name\":\"thuy-mau-demo\",\"direction\":\"$D\"${S:+,\"style\":\"$S\"},\"mode\":\"dao-dien\"}" http://127.0.0.1:4420/api/suggest/choose > /tmp/suggest-choose.json`
  4. `command grep -nE "^(direction|style_profile):" /tmp/ms-react-root-4420/thuy-mau-demo/BRIEF.md`. Ghi kết quả vào báo cáo.
- **Verify:**
  - `node -e 'const r=require("/tmp/suggest-choose.json");console.log(r.outcome, r.mode.saved)'` in `chosen false`.
  - `command grep -cE "^direction:" /tmp/ms-react-root-4420/thuy-mau-demo/BRIEF.md` in `1`.
  - Nếu có `$S`: `command grep -c "^style_profile: $S" /tmp/ms-react-root-4420/thuy-mau-demo/BRIEF.md` in `1`.
  - `wc -l < /tmp/ms-react-root-4420/thuy-mau-demo/.opus/suggest/picks.jsonl | tr -d " "` in `1`, và `node -e 'const l=require("fs").readFileSync("/tmp/ms-react-root-4420/thuy-mau-demo/.opus/suggest/picks.jsonl","utf8").trim().split("\n").map(JSON.parse)[0];console.log(l.outcome, Boolean(l.det), l.chosen.direction===process.argv[1])' "$D"` in `chosen true true`.
  - `git -C /Volumes/2/Edit-Video/thuy-mau-demo status --porcelain 2>/dev/null | wc -l` in cùng số với trước phase (bản gốc không bị đụng). Nếu dự án gốc không phải repo git: `stat -f %m /Volumes/2/Edit-Video/thuy-mau-demo/BRIEF.md` không đổi so với lúc ghi ở task 6.1.

### Task 6.5 — Chụp thẻ

- **Steps:**
  1. Ghi `/tmp/suggest-views.json`: `[{"id":"suggest-card","path":"/?token=smoke-4420#/p/thuy-mau-demo","ready":"[data-role=suggest-card]"}]`. Trước khi ghi, kiểm đường dẫn mở dự án theo cách `ui/scripts/` hoặc báo cáo cũ trong `plans/` đang dùng; sửa `path` cho khớp.
  2. `node /Volumes/2/Motion-Studio/ui/scripts/shoot.mjs --base http://127.0.0.1:4420 --views /tmp/suggest-views.json --out /tmp/suggest-shots --widths 1440`
  3. Mở ảnh bằng công cụ đọc ảnh. Kiểm: thẻ nằm trên chat; khi có Jev thì hai cột `Jev` và `Tất định`, không hướng nào chọn sẵn, có dòng so sánh; khi không có khoá thì một cột tất định và câu lỗi; không có chữ "minh họa". Ảnh chụp sau task 6.4 nên thẻ hiện câu kết cục; chụp thêm một ảnh trước task 6.4 nếu cần thấy trạng thái chưa chọn. Ghi nhận xét vào báo cáo. Ảnh để ở `/tmp`, không commit.
- **Verify:** `ls /tmp/suggest-shots/*.png | wc -l` in số lớn hơn hoặc bằng `1`.

### Task 6.6 — Dừng Studio thử

- **Steps:** `kill <PID đã ghi ở task 6.2>`. Không dùng `pkill` theo mẫu rộng.
- **Verify:** `lsof -nP -iTCP:4420 -sTCP:LISTEN | wc -l` in `0`.

### Task 6.7 — Tài liệu và CHANGELOG

- **Target files:** `docs/suggest.md` (mới), `docs/mcp.md`, `CHANGELOG.md`.
- **Steps:**
  1. `docs/suggest.md`, tiếng Việt, câu đầy đủ, theo giọng của `docs/lemo-styles.md`. Gồm các mục:
     - thẻ gợi ý làm gì;
     - ba nguồn `deterministic`, `observe`, `jev`, và cách đặt `suggest.source` trong `studio.json`;
     - nguồn mặc định hiện tại là `observe`: thẻ hiện hai cột Jev và tất định, không chọn sẵn;
     - log lựa chọn thật: đường dẫn `<dự án>/.opus/suggest/picks.jsonl`, các trường của một dòng, định nghĩa "lượt", và cách quyết định sau 30 lượt bằng `node scripts/suggest-eval.mjs --picks` (ngưỡng 10 điểm hit@3; đạt thì `jev`, không thì `deterministic`, đường Jev vẫn bật lại được);
     - số liệu lần đo đầu trên nhãn, ghi rõ là để tham khảo (file `plans/261023-1529-jev-style-suggest/reports/suggest-eval-<YYMMDD>.json`);
     - hai tính năng plugin được phát hiện tự động (`pitchInit`, `set_workflow_mode`) và hành vi khi có và khi chưa có;
     - khoá TypeSafe đọc từ biến môi trường hoặc file khoá mà provider khai; không ghi đường dẫn file của plugin;
     - ba kết cục của nút chọn;
     - giới hạn hiện tại: chế độ vận hành chưa lưu vào `project.json`, và chọn hướng khi chưa có pitch phải nhờ đạo diễn, cho tới khi plugin phát hành hai tính năng trên;
     - ba route và tool `style_suggest`;
     - chi phí ước tính mỗi lần gợi ý, lấy số câu hỏi và token từ record.
  2. `docs/mcp.md`: thêm một hàng vào bảng tool, sau các hàng lemo hoặc ở cuối bảng: `` | `style_suggest` | sửa (ghi `.opus/suggest/`) | cả hai | Xếp hạng hướng, style và chế độ vận hành; hiện thẻ trong tab Đạo diễn, không chọn thay người dùng | ``.
  3. `CHANGELOG.md`: thêm một gạch đầu dòng cuối mục `## Chưa phát hành`, theo giọng các dòng có sẵn: thẻ gợi ý trong tab Đạo diễn; nguồn Jev (TypeSafe) hoặc tất định; chọn hướng đi qua lệnh `choose` của provider; tool `style_suggest`; xem `docs/suggest.md`.
  4. Kiểm cả ba file không có "minh họa" và không chứa tên plugin.
- **Verify:**
  - `command grep -c "minh họa\|minh hoạ" /Volumes/2/Motion-Studio/docs/suggest.md` in `0`.
  - `command grep -ci "opus-video" /Volumes/2/Motion-Studio/docs/suggest.md` in `0`.
  - `command grep -c "style_suggest" /Volumes/2/Motion-Studio/docs/mcp.md` in số lớn hơn hoặc bằng `1`.
  - `node --test /Volumes/2/Motion-Studio/tests/provider.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 6.8 — Báo cáo chạy thật

- **Target files:** `plans/261023-1529-jev-style-suggest/reports/live-4420.md`.
- **Steps:** ghi theo thứ tự sau:
  - ngày giờ (Asia/Saigon);
  - commit đã chạy;
  - PID và cổng;
  - dòng kết quả của task 6.3;
  - kết quả `outcome` và các dòng `BRIEF.md` của task 6.4;
  - nhận xét ảnh chụp ở task 6.5;
  - xác nhận đã dừng server;
  - nếu không có khoá thì ghi rõ "Jev chưa được gọi thật trong lần chạy này".

  Không chép nội dung khoá hay header Authorization.
- **Verify:** `command grep -c "Bearer\|TYPESAFE_API_KEY=" /Volumes/2/Motion-Studio/plans/261023-1529-jev-style-suggest/reports/live-4420.md` in `0`.

### Task 6.9 — Toàn bộ test, commit, PR

- **Steps:**
  1. `cd /Volumes/2/Motion-Studio && npm test 2>&1 | tail -15`
  2. `git -C /Volumes/2/Motion-Studio add docs/suggest.md docs/mcp.md CHANGELOG.md plans/261023-1529-jev-style-suggest/`
  3. `git -C /Volumes/2/Motion-Studio commit -m "docs(suggest): document the suggestion card, its sources and the live run"`
  4. `git -C /Volumes/2/Motion-Studio push -u origin feat/jev-style-suggest`
  5. `gh pr create --repo abm-dungtq/motion-studio --base main --head feat/jev-style-suggest --title "feat: gợi ý hướng, style và quy trình trong tab Đạo diễn" --body-file /tmp/suggest-pr.md`. Viết `/tmp/suggest-pr.md` bằng tiếng Việt trước khi chạy. Nội dung gồm:
     - tính năng làm gì;
     - nguồn mặc định `observe`, log lựa chọn thật, quyết định sau 30 lượt, và số liệu lần đo đầu (tham khảo);
     - ba kết cục của nút chọn;
     - giới hạn chế độ vận hành;
     - cách kiểm (lệnh test, kết quả chạy thật);
     - liên kết `docs/suggest.md`.
     Không có dòng ghi công AI, không có Co-Authored-By.
- **Verify:**
  - `cd /Volumes/2/Motion-Studio && node --test tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.
  - `gh pr view feat/jev-style-suggest --repo abm-dungtq/motion-studio --json state -q .state` in `OPEN`.
  - `git -C /Volumes/2/Motion-Studio log main..feat/jev-style-suggest --format=%B | command grep -ciE "co-authored-by|claude|\bAI\b"` in `0`.

## Rủi ro và rollback

- Rủi ro: lệnh `choose` thật từ chối vì `BRIEF.md` của bản sao đã có `direction`. Đây là lỗi của bước Verify ở task 6.4: áp Failure Protocol, không sửa tay `BRIEF.md`.
- Rủi ro: gọi TypeSafe thật tốn tiền. Mỗi lần chỉ hai request, khoảng vài nghìn token, theo giá $0.042 cho mỗi triệu token đầu vào.
- Rủi ro: Studio thử còn chạy sau phase. Task 6.6 dừng nó theo PID đã ghi.
- Rollback: đóng PR; revert commit docs. Root thử ở `/tmp` xoá được bất cứ lúc nào.

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
