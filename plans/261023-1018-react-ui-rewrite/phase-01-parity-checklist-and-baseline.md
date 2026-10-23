# Phase 1: checklist parity và ảnh gốc của UI cũ

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-parity` (gọi tắt `$W`)
- **Nhánh:** `feat/react-ui-parity`, cắt từ `feat/react-ui` ngay sau commit của task 2.0. PR vào `feat/react-ui`, không vào `main`.
- **Cổng thử:** 4411 (UI cũ, từ checkout `main`). Không đụng 4317.
- **Effort:** 4h
- **Phụ thuộc:** task 2.0 (worktree `react-ui` và fixture lemo đã sửa). **Chạy song song với phase 2**, vì phase này chỉ đọc UI cũ và chỉ tạo file trong `ui/scripts/` và thư mục plan, là chỗ phase 2 không đụng.

## Mục tiêu

1. Một checklist parity đầy đủ, viết từ mã của UI cũ. Checklist liệt kê mọi tab, mục, phím tắt, route mà UI gọi, thẻ cổng, trạng thái rỗng và trạng thái lỗi. Mỗi dòng có `file:line` của bản cũ và cách thử. Đây là thước đo "xong" của cả plan.
2. Công cụ thử dùng chung cho mọi phase sau: server thử, thư mục gốc thử, thẻ cổng giả, script chụp ảnh.
3. Ảnh gốc của mọi tab UI cũ ở 1440 px và 2560 px.

## Hiện trạng đã kiểm

- Baseline test do task 2.0 ghi (sau khi sửa fixture lemo): `ℹ fail 0`, kỳ vọng `ℹ pass 298`.
- Tab có sẵn: `public/panels.js:13-20`, gồm `ai`, `media`, `voice`, `music`, `library`, `output`. View của chúng ở `panels.js:114` (`ai`), `:131` (`media`), `:193` (`voice`), `:212` (`music`), `:230` (`library`), `:316` (`output`).
- Tab và mục do extension thêm:
  - `public/ext-anime.js:80` thêm tab `anime`;
  - `public/ext-lemo.js:14` thêm tab `styles-code` và mục `lemo-mine` (`:19`);
  - `public/ext-broll.js:11` thêm mục `broll-search` vào `media`;
  - `public/ext-fx.js:12` thêm mục `fx-footage` vào `media`;
  - `public/ext-receipts.js:20` thêm mục `receipts` vào `output`.
- Mục inspector do extension thêm: `ext-fx.js:11`, `ext-lemo.js:20`, `ext-broll.js` (cuối file), `ext-receipts.js` (cuối file). Dòng popover agent: `ext-agents.js:131`.
- Phím tắt:
  - `public/timeline-edit.js:103-123` (`keyAction`);
  - `public/app.js:414-454` (`keydown`, `runKey`);
  - Alt+1…9 và mũi tên trên rail ở `public/panels.js:584-600`;
  - bảng README ở `README.md:58-72`.
- Route UI gọi: 66 chuỗi `/api/…` khác nhau trong `public/*.js`, cộng `/p/<dự án>/…`, `/library/thumb/…`, `/hf/runtime.js`.
- Trạng thái rỗng và lỗi: 41 chỗ có `class: "empty"` hoặc `"form-error"` trong `public/*.js`.
- Dự án thử phù hợp trong `/Volumes/2/Edit-Video`, chỉ đọc nguồn rồi chép:
  - `thuy-mau-demo`: sửa được, có mốc thời gian, 4 shot, 3 câu, 3 SFX, 1 nhạc, có `demo/animatic.mp4`, 40 MB;
  - `abm-intro`: chỉ xem (`editable: false`);
  - `viet-pro-intro`: chưa có `project.json`, dùng thử nút "Nhập dự án".

## Sở hữu file

**Tạo mới:**
- `ui/scripts/smoke-server.mjs`;
- `ui/scripts/make-test-root.mjs`;
- `ui/scripts/seed-gate-cards.mjs`;
- `ui/scripts/shoot.mjs`;
- `ui/scripts/views-old.json`;
- `plans/261023-1018-react-ui-rewrite/parity-checklist.md`.

**Không tạo hay sửa:** `ui/package.json`, `ui/package-lock.json` (thuộc phase 2). `playwright-core` của phase này cài ở `/tmp/ms-react-tools`.

**Ngoài repo, chỉ ghi vào:** `/tmp/ms-react-tools/`, `/tmp/ms-react-root-4411/`, `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/baseline/`.

**Không đụng:** `public/**`, `server.mjs` và mọi file khác.

## Các task

### Task 1.0 — Tạo worktree

- **Mục tiêu:** có worktree `react-ui-parity` cắt từ `feat/react-ui` sau task 2.0.
- **File:** không.
- **Các bước:**
  1. Kiểm task 2.0 đã commit: `git -C /Volumes/2/Motion-Studio log feat/react-ui --format=%s | grep -c '^test(lemo): create docs/frames before writing fixture frames$'` in `1`. Phase 2 có thể đã thêm commit sau đó; không sao, vì phase này chỉ tạo file mà phase 2 không đụng.
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-parity -b feat/react-ui-parity feat/react-ui`
  3. Từ đây mọi lệnh chạy trong `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-parity` (gọi tắt là `$W`).
- **Đạt khi:** worktree tồn tại và đang ở nhánh `feat/react-ui-parity`.
- **Verify:** `git -C /Volumes/2/Motion-Studio/.claude/worktrees/react-ui-parity branch --show-current` in đúng `feat/react-ui-parity`.

### Task 1.1 — `playwright-core` ngoài repo

- **Mục tiêu:** có thư viện điều khiển Chrome cho script chụp ảnh, mà không đụng `ui/package.json` (phase 2 đang sửa nó song song) và không tải trình duyệt.
- **File:** không có file trong repo.
- **Các bước:**
  1. `mkdir -p /tmp/ms-react-tools && npm --prefix /tmp/ms-react-tools install --no-audit --no-fund --save-exact playwright-core`
  2. Script trong `ui/scripts/` nạp thư viện bằng `const { chromium } = await import(process.env.MS_PLAYWRIGHT ?? "playwright-core");`. Trong phase này luôn chạy với `MS_PLAYWRIGHT=/tmp/ms-react-tools/node_modules/playwright-core/index.mjs`. Sau khi phase 2 merge, `ui/package.json` có `playwright-core`, nên không cần biến này nữa.
  3. Kiểm có Chrome: `ls "/Applications/Google Chrome.app"`. Script dùng `chromium.launch({ channel: "chrome" })`.
- **Đạt khi:** import được.
- **Verify:** `node -e "import('/tmp/ms-react-tools/node_modules/playwright-core/index.mjs').then(m=>console.log(typeof m.chromium.launch))"` in `function`.

### Task 1.3 — Server thử và thư mục gốc thử

- **Mục tiêu:** chạy được một Studio (UI cũ hoặc mới) trên cổng khác 4317, với thư mục gốc là bản chép trong `/tmp`, runner `mcp` (không gọi `claude -p`).
- **File:** `ui/scripts/smoke-server.mjs`, `ui/scripts/make-test-root.mjs`.
- **Các bước:**
  1. Viết `ui/scripts/smoke-server.mjs`:

     ```js
     // ui/scripts/smoke-server.mjs <checkout> <port> <root> [--no-provider]
     // A test Studio on its own port. Never 4317: that is the user's running Studio.
     import { join } from "node:path";
     import { pathToFileURL } from "node:url";
     const [checkout, port, root] = process.argv.slice(2);
     if (!checkout || !port || !root) { console.error("usage: smoke-server.mjs <checkout> <port> <root> [--no-provider]"); process.exit(2); }
     if (Number(port) === 4317) { console.error("cổng 4317 là Studio thật, không dùng"); process.exit(2); }
     process.env.MOTION_STUDIO_STATE = join(root, "studio.json");
     if (process.argv.includes("--no-provider")) process.env.OPUS_VIDEO_HOME = "/nonexistent";
     const { createServer } = await import(pathToFileURL(join(checkout, "server.mjs")).href);
     const s = createServer({ root, token: `smoke-${port}` });
     s.listen(Number(port), "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/ (checkout ${checkout}, root ${root})`));
     ```

  2. Viết `ui/scripts/make-test-root.mjs <root>`:
     - từ chối nếu `root` không khớp `^/tmp/ms-react-root-\d+$` (exit 2), hoặc đã tồn tại (exit 3, in lệnh `rm -rf <root>` để người chạy tự xoá);
     - chép `/Volumes/2/Edit-Video/thuy-mau-demo`, `/Volumes/2/Edit-Video/abm-intro` và `/Volumes/2/Edit-Video/viet-pro-intro` vào `<root>/<cùng tên>` bằng `cpSync(src, dst, { recursive: true, filter })`. `filter` bỏ mọi đường có đoạn `node_modules`, `.git`, `renders` hoặc `.hyperframes`. Giữ `demo/` để có `demo/animatic.mp4` cho thumbnail;
     - chép `thuy-mau-demo` lần nữa thành `<root>/perf-60`, rồi viết lại `project.json` của nó:
       - 60 shot `s1`…`s60`, mỗi shot dài 1 s, `start = i`, `end = i + 1`, `name = "Shot " + (i + 1)`, các trường khác lấy từ shot gốc đầu tiên;
       - `duration = 60`;
       - mỗi câu (`lines`): `shot` là shot chứa `start` của câu;
       - mỗi SFX (`events`): giờ tuyệt đối `t` = `start` của shot cũ cộng `offset`; `shot` mới là shot chứa `t`; `offset = t - start` của shot mới, làm tròn 3 số lẻ;
       - giữ `music`, `version`, `capabilities`;
     - chép `/Volumes/2/Edit-Video/scripts` thành `<root>/scripts` (52 KB). `new-project.sh` và `compress-final.sh` tìm thư mục gốc theo chỗ đặt script (`ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"`, `new-project.sh:10`), nên nút "Dự án mới" tạo dự án ngay trong gốc thử;
     - chép `/Volumes/2/Edit-Video/shared-assets` thành `<root>/shared-assets` (khoảng 1 MB; font, nhạc nền, `sfx/`). Thêm một file SFX thử: chép `<root>/thuy-mau-demo/assets/sfx/brush.mp3` thành `<root>/shared-assets/sfx/thu-brush.mp3`, để mục "Dùng chung" của "Thêm SFX tại đây…" có dữ liệu;
     - ghi `<root>/studio.json` = `{ "director": { "runner": "mcp" } }`;
     - tạo `<root>/footage/raw/`;
     - in `ok <root>`.
  3. Chạy `node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4411`.
  4. Chạy server UI cũ bằng background-run của harness, từ checkout `main`:
     `node $W/ui/scripts/smoke-server.mjs /Volumes/2/Motion-Studio 4411 /tmp/ms-react-root-4411`. Ghi PID.
- **Đạt khi:** server trả danh sách dự án và đọc được `perf-60` với 60 shot.
- **Verify:**
  - `curl -s http://127.0.0.1:4411/api/projects | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).map(p=>p.name+':'+p.editable+':'+p.has_manifest).join(' ')))"` in đúng `abm-intro:false:true perf-60:true:true thuy-mau-demo:true:true viet-pro-intro:false:false`.
  - `curl -s "http://127.0.0.1:4411/api/project?name=perf-60" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).shots.length))"` in `60`.
  - `lsof -nP -iTCP:4317 -sTCP:LISTEN` vẫn chỉ ra đúng PID của Studio người dùng, nếu nó đang chạy. Lệnh này không được đổi gì.

### Task 1.4 — Thẻ cổng giả cho dự án thử

- **Mục tiêu:** tạo thẻ "chọn hướng" và thẻ "duyệt animatic" đang chờ, không cần chạy đạo diễn thật.
- **File:** `ui/scripts/seed-gate-cards.mjs`.
- **Các bước:**
  1. Viết script `seed-gate-cards.mjs <checkout> <projectDir> <direction|animatic>`. Script làm đúng như hàm `waiting()` của `tests/studio-gates.test.mjs:31-38`:
     - nạp `loadProvider` từ `<checkout>/lib/provider.mjs`;
     - `P.requests.enqueue(dir, { scope: "project", base: P.manifest.load(dir).version, text: "Thử thẻ cổng" })`;
     - `P.requests.next(dir, "cli")`;
     - `P.requests.ask(dir, id, q)`.
  2. `q` cho `direction`: `{ kind: "choice", gate: "direction", question: "Chọn hướng?", options: [{ id: "1", label: "Tối giản" }, { id: "2", label: "Rực rỡ" }, { id: "3", label: "Cổ điển" }], artifacts: ["pitch/1.png", "pitch/2.png", "pitch/3.png"] }`. Ba ảnh này có sẵn trong `thuy-mau-demo/pitch/`.
  3. `q` cho `animatic`: `{ kind: "approve", gate: "animatic", question: "Duyệt animatic?", artifacts: ["demo/animatic.mp4"] }`.
  4. Script từ chối mọi `projectDir` không nằm dưới `/tmp/ms-react-root-` (exit 2).
  5. In `seeded <id> <kind>`.
- **Đạt khi:** `GET /api/requests` có một request `waiting_user`.
- **Verify:** `node $W/ui/scripts/seed-gate-cards.mjs /Volumes/2/Motion-Studio /tmp/ms-react-root-4411/thuy-mau-demo direction` in dòng bắt đầu bằng `seeded `. Sau đó `curl -s "http://127.0.0.1:4411/api/requests?name=thuy-mau-demo" | grep -c waiting_user` in số ≥ `1`.

### Task 1.5 — Viết checklist parity

- **Mục tiêu:** `plans/261023-1018-react-ui-rewrite/parity-checklist.md` phủ toàn bộ UI cũ.
- **File:** `parity-checklist.md` trong thư mục plan, trong worktree (`$W/plans/261023-1018-react-ui-rewrite/`).
- **Các bước:**
  1. Đầu file ghi `Baseline test: pass <N>, fail 0` (số do task 2.0 ghi trong `plans/261023-1018-react-ui-rewrite/reports/phase-02-report.md`; chưa có thì chạy `npm test` trong `$W` và ghi số thật) và commit gốc của `public/` (`git -C $W log -1 --format=%h -- public`).
  2. Một bảng duy nhất, mỗi dòng một mục, đủ các cột:

     `| ID | Khu | Mục | Nguồn cũ (file:line) | Cách thử | Cũ (4411) | Mới | Chỗ trong UI mới | Nhóm |`

     Cột "Nhóm" ghi phase chịu trách nhiệm dòng đó, theo bảng nhóm tỏa trong `plan.md`: `3` (vỏ), `4a` (timeline), `4b` (chất liệu + B-roll), `4c` (lời, giọng, nhạc), `4d` (đạo diễn, thẻ cổng, inspector), `4e` (xuất bản, biên nhận, thư viện, popover agent), `4f` (anime), `4g` (phong cách lemo), `4h` (chuyển cảnh, hiệu ứng). Mỗi dòng đúng một nhóm. Cột "Mới" để trống; phase 5 điền.

  3. Tiền tố ID và nội dung bắt buộc:
     - `SHELL-`: mọi phần tử của `public/index.html:12-56`; các banner (chưa có provider, chỉ xem, chưa có project.json + "Nhập dự án") ở `public/app.js` `open()` và `setManifest()`; toast; tiêu đề dự án; chip cổng (hai chữ, title là các dòng FAIL, bấm mở đúng chỗ).
     - `NEW-`: mọi trường, giới hạn và lỗi của hộp thoại Dự án mới (`public/new-project.js`), và luồng `onCreated` (mở dự án; chế độ `video-co-san` mở tab media).
     - `AGENT-`: chip agent (màu chấm, chữ), popover (`public/agent.js`), các dòng của `ext-agents.js` (bảng CLI, quota codex-pool, Làm mới, Thử khả năng, lần thử gần nhất).
     - `RAIL-`: mỗi tab (8 tab: 6 có sẵn và 2 extension), badge đếm, Alt+1…9, mũi tên/Home/End, `?tab=`, localStorage `studio.tab`.
     - `TAB-<id>-`: mỗi mục trong view của tab (theo `panels.js` và các file extension), mỗi nút và mỗi hành động gửi đi (`ctx.patch`, `ctx.direct`, `ctx.send`).
     - `DIR-`: chat đạo diễn: luồng (follows), các trạng thái `queued`, `running`, `waiting_user`, `done`, `failed`, hết hạn có "Trả lời lại"; huỷ; storyboard; log job đang chạy; ô giao việc, Cmd/Ctrl+Enter.
     - `GATE-`: thẻ chọn hướng (mỗi lựa chọn, ảnh đính kèm), thẻ duyệt animatic (Duyệt, Từ chối kèm lý do, Xem), trả lời lỗi hoặc quá giờ (`gate-cards.js` `answerFailure`, `ANSWER_TIMEOUT_MS`), giữ thẻ khi panel vẽ lại.
     - `INSP-`: inspector cho mỗi loại chọn (`shot`, `line`, `music`, `event`, `beat`, `word`; `public/inspector.js:46`, `:89`, `:103`, `:149`, `:179`, `:201`) và mọi mục inspector của extension.
     - `EXP-`: Xuất video, Xuất bộ lớp dựng, danh sách job xuất kèm log và huỷ, file đã xuất (render, bộ lớp dựng), các dòng FAIL của cổng, mục Biên nhận.
     - `TL-`: mọi hành vi trong comment đầu `public/timeline.js:1-18`, `timeline-lanes.js`, `timeline-markers.js`, các nút của `.timeline-bar` (`public/index.html:41-48`), menu chuột phải, M/S, thumbnail, waveform, decorator, thả footage vào làn B-roll.
     - `TL-PROTO-01`…`TL-PROTO-12`: tập con phải đạt ở checkpoint của phase 4a, đúng danh sách sau:
       1. đủ năm loại track với dữ liệu thật (Shot, B-roll, Lồng tiếng, Nhạc, SFX);
       2. kéo thước và núm playhead để tua;
       3. Ctrl/Cmd+cuộn zoom quanh con trỏ, nút −/+, "Vừa khung";
       4. kéo mép phải shot ở chế độ Ripple gửi đúng một `resize_shot`;
       5. chế độ Roll (phím R và nút) giữ nguyên `duration`;
       6. kéo khối câu gửi `move_line`;
       7. Shift+kéo câu dời cả các câu sau trong shot;
       8. kéo SFX gửi `move_event`;
       9. kéo thân hoặc mép nhạc gửi `update_music`;
       10. hít bật/tắt (N, nút "Hít"), có vạch hít;
       11. waveform trên khối giọng và khối nhạc;
       12. bấm một khối thì chọn nó và inspector hiện đúng mục.
     - `KEY-`: mỗi dòng của bảng `README.md:60-72`, cộng `=`/`+`, `-`, Ctrl+Y, Backspace, luật "không chạy khi đang ở ô nhập hay hộp thoại", phím trong menu chuột phải (↑/↓/Enter/Escape).
     - `API-`: mỗi route trong danh sách ở Verify dưới đây, ghi file gọi nó.
     - `STATE-`: mỗi chỗ `class: "empty"` hoặc `"form-error"` (41 chỗ), ghi đúng `public/<file>:<dòng>` và chữ hiển thị.
     - `EXT-`: mỗi hàm của đối tượng `studio` (`public/app.js:456-466`): `addTab`, `addSection`, `addInspectorSection`, `addAgentRows`, `addTimelineDecorator`, `icon`, `toast`, `ctx`; luật "một extension lỗi chỉ hiện toast" (`public/ext.js:29-32`).
  4. Cột "Chỗ trong UI mới" ghi chỗ theo bố cục mới. Ví dụ: tab `ai` → cột phải tab Đạo diễn; tab `output` → menu Xuất bản, mục "Cổng & tệp đã xuất…"; thư viện chuyển cảnh và "Sửa clip" → tab `fx`.
- **Đạt khi:** ba lệnh kiểm phủ dưới đây không in dòng `THIẾU` nào, và số dòng mỗi tiền tố đạt mức tối thiểu.
- **Verify** (chạy trong `$W`; `C=plans/261023-1018-react-ui-rewrite/parity-checklist.md`):
  1. Route:

     ```bash
     grep -ohE '"/api/[a-z0-9/_-]+|`/api/[a-z0-9/_-]+' public/*.js | tr -d '"`' | sort -u | while read r; do grep -qF "\`$r\`" "$C" || echo "THIẾU $r"; done
     ```

     Không in gì.
  2. Trạng thái rỗng và lỗi:

     ```bash
     grep -n 'class: "empty"\|"form-error"' public/*.js | cut -d: -f1,2 | while read l; do grep -qF "$l" "$C" || echo "THIẾU $l"; done
     ```

     Không in gì.
  3. Tab:

     ```bash
     for t in ai media voice music library output anime styles-code; do grep -q "RAIL-.*\`$t\`" "$C" || echo "THIẾU tab $t"; done
     ```

     Không in gì.
  4. Mỗi dòng có nhóm hợp lệ: `awk -F'|' '/^\| [A-Z]+-/ && $10 !~ /^ *(3|4[a-h]) *$/' "$C" | wc -l` in `0`.
  5. `for p in SHELL NEW AGENT RAIL TAB DIR GATE INSP EXP TL KEY API STATE EXT; do printf "%s %s\n" $p "$(grep -c "^| $p-" "$C")"; done` in số ≥ 1 cho mọi tiền tố. Thêm: `KEY` ≥ 18, `API` ≥ 66, `STATE` ≥ 41, `TL-PROTO` đúng 12 (`grep -c "^| TL-PROTO-" "$C"` in `12`).

### Task 1.6 — Script chụp ảnh và ảnh gốc

- **Mục tiêu:** ảnh mọi tab UI cũ ở 1440 và 2560 px.
- **File:** `ui/scripts/shoot.mjs`, `ui/scripts/views-old.json`.
- **Các bước:**
  1. `shoot.mjs --base <url> --views <file.json> --out <dir> --widths 1440,2560`:
     - dùng `playwright-core`, `chromium.launch({ channel: "chrome" })`;
     - viewport rộng 1440 thì cao 900; rộng 2560 thì cao 1440; `deviceScaleFactor: 1`;
     - mỗi view `{ id, path, ready, steps? }`: `goto(base + path)`, chờ selector `ready` (tối đa 15 s), chạy `steps` (mỗi bước `{ click: selector }` hoặc `{ press: key }`), chờ 800 ms, chụp `<out>/<width>/<id>.png`;
     - không dùng `networkidle`, vì SSE `/api/events` giữ kết nối mở mãi;
     - in `shot <đường>` cho mỗi ảnh, cuối cùng in `ok <số ảnh>`. Có view lỗi thì in `fail <id>: <lỗi>` và thoát 1.
  2. `views-old.json`, với `name=thuy-mau-demo`:
     - một view cho mỗi tab trong 8 tab: `path` là `/?name=thuy-mau-demo&tab=<id>`, `ready` là `#panel .group, #panel .empty, #panel section`;
     - view `new-project`: bấm `#new-btn`;
     - view `agent`: bấm `#agent-chip`;
     - view `inspector-shot`: bấm khối shot đầu tiên trên timeline, selector `#timeline .blk.shot`;
     - view `readonly`: `/?name=abm-intro&tab=media`;
     - view `gate-card`: `/?name=thuy-mau-demo&tab=ai`, sau khi đã chạy task 1.4.
  3. Chạy:
     `MS_PLAYWRIGHT=/tmp/ms-react-tools/node_modules/playwright-core/index.mjs node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4411 --views $W/ui/scripts/views-old.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/baseline --widths 1440,2560`
- **Đạt khi:** đủ ảnh cho mọi view ở cả hai cỡ.
- **Verify:** lệnh in dòng cuối `ok 26` (13 view × 2 cỡ) và thoát 0. Thêm `ls /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/baseline/1440/*.png | wc -l` in `13`.

### Task 1.7 — Đi checklist trên UI cũ

- **Mục tiêu:** cột "Cũ (4411)" ghi hành vi thật đã thấy, để phase sau so được.
- **File:** `parity-checklist.md`.
- **Các bước:**
  1. Với mỗi dòng, làm đúng "Cách thử" trên `http://127.0.0.1:4411`, dự án `thuy-mau-demo` (sửa được) hoặc `abm-intro` (chỉ xem).
  2. Ghi `có` kèm kết quả ngắn: patch nào được gửi (xem tab Network), toast hiện chữ gì, version đổi thành bao nhiêu. Dòng không làm được trên UI cũ thì ghi `không có trên UI cũ` kèm lý do. Đừng xoá dòng đó.
  3. Thao tác sửa đổi `project.json` của bản chép trong `/tmp`. Đó là chủ đích. Không bao giờ mở dự án trong `/Volumes/2/Edit-Video` để sửa.
  4. "Xuất video" và "Xuất bộ lớp dựng": bấm một lần, ghi kết quả (job chạy xong, hoặc toast "Thiếu cổng" kèm dòng FAIL). Phase 7 so với kết quả này trên cùng trạng thái dự án.
- **Đạt khi:** không còn ô "Cũ" nào trống.
- **Verify:** `awk -F'|' '/^\| [A-Z]+-/ && $7 ~ /^ *$/' $W/plans/261023-1018-react-ui-rewrite/parity-checklist.md | wc -l` in `0`.

### Task 1.8 — Dừng server, commit, PR vào `feat/react-ui`

- **Mục tiêu:** không còn process thử nào; công việc vào `feat/react-ui` qua PR.
- **Các bước:**
  1. `kill <PID 4411>`.
  2. `git -C $W add ui/scripts plans/261023-1018-react-ui-rewrite/parity-checklist.md`
  3. Commit: `test(ui): parity checklist, test server and screenshot tools for the UI rewrite`.
  4. `git -C $W push -u origin feat/react-ui-parity`, rồi `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-parity --title "test(ui): parity checklist and test tools for the UI rewrite" --body "<tóm tắt, số dòng mỗi tiền tố, đường dẫn ảnh gốc>"`.
  5. Báo orchestrator số PR. Orchestrator merge PR này vào `feat/react-ui`. Phase 3 không bắt đầu trước khi PR này merge.
- **Verify:** `lsof -nP -iTCP:4411 -sTCP:LISTEN | wc -l` in `0`. Thêm `git -C $W status --porcelain | wc -l` in `0`. Thêm `gh pr view feat/react-ui-parity --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Checklist thiếu mục | Vừa | Cao | Ba lệnh kiểm phủ cơ học (route, trạng thái, tab) cộng mức tối thiểu cho mỗi tiền tố |
| `perf-60` không qua kiểm manifest của provider | Thấp | Vừa | Verify task 1.3 đọc lại qua `/api/project`. Trượt thì theo Failure Protocol |
| Lỡ đụng Studio 4317 | Thấp | Cao | `smoke-server.mjs` từ chối 4317; trạng thái server thử nằm ở `<root>/studio.json` |

## Hoàn tác

Đóng PR, xoá nhánh `feat/react-ui-parity` và worktree. `rm -rf /tmp/ms-react-root-4411` (thư mục do plan này tạo).

## Dừng và hỏi người dùng

Các trường hợp dừng và hỏi người dùng (không gọi kongming): cần đổi API server; lỗi không giải thích được sau một lượt Failure Protocol; cần xoá hay ghi đè file ngoài repo, trừ `/tmp/ms-react-*`; cần đụng server 4317.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc gặp việc ngoài sở hữu file của phase này: **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
