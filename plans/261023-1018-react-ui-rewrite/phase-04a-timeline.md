# Phase 4a: timeline (nguyên mẫu, điểm dừng, rồi đủ tính năng)

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui-timeline` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui-timeline`, cắt từ `origin/feat/react-ui` sau tag `ui-contracts-v1`. Giao bằng PR vào `feat/react-ui`, **không** vào `main`.
- **Cổng thử:** 4412. Gốc thử riêng: `/tmp/ms-react-root-4412`. Không dùng cổng khác, không đụng 4317.
- **Vùng trong `ui/ownership.json`:** `timeline`. Nhóm trong checklist: `4a`.
- **Effort:** 16h.
- **Phụ thuộc:** phase 3 (tag `ui-contracts-v1`). Chạy **song song** với các phase 4 khác. Đây là đường găng: phase 5 chờ phase này lâu nhất.

## Mục tiêu

Timeline mới trong khe `timeline` (`ui/src/timeline/index.tsx`, export `TimelineArea`), đủ mọi hành vi của `public/timeline.js`, `timeline-lanes.js`, `timeline-markers.js` (phần vẽ) và bộ phím tắt của `public/app.js:412-460`.

Làm theo ba bước, có điểm dừng ở giữa:

1. **Nguyên mẫu** đủ 12 mục `TL-PROTO-01`…`12` của checklist.
2. **Điểm dừng (kill criterion):** nguyên mẫu đạt cả 12 mục, và kéo playhead trên dự án `perf-60` (60 shot) đạt **≥ 50 fps** (trung vị 3 lần). Trượt thì orchestrator dừng mọi vùng và hỏi người dùng. Phương án dự phòng là áp theme và bố cục mới lên UI vanilla.
3. **Đủ tính năng:** ảnh shot, menu chuột phải, M/S, decorator, làn B-roll nhận thả, mốc phách và mốc từ kéo được, Hoàn tác mốc, phím tắt.

## Hiện trạng đã kiểm

- `public/timeline.js:1-18`: comment mô tả toàn bộ hành vi (Ripple/Roll, `move_line`, Shift+kéo câu, `move_event`, `update_music`, bấm để chọn, kéo thước để tua, menu chuột phải, hít N, làn nhạc, tầng SFX, waveform, ảnh shot, mốc, Ctrl/Cmd+cuộn, M/S, decorator).
- `public/timeline.js:27-37`: hằng `LABEL = 90`, `MIN_SHOT = 0.5`, `CLICK = 3`, `TRACK = 44`, `BROLL = 34`, `TIER = 20`, `THUMB_MIN = 48`, `round3`, `clampPps` (8–400), `GROUPS`, `DECO` (màu dải; token `--ms-deco-*` đã có từ phase 2), `clock`.
- `public/timeline.js:41`: `pps = 60`, `snapOn = true`, `mode = "ripple"`. Phase 3 đưa ba giá trị này vào store (`snap`, `mode`, `pps`).
- Hàm trong `public/timeline.js`: `zoomBy :51`, `fit :52`, `toggleSnap :58`, `showMode :63`, `toggleMode :69` (toast `Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên` / `Ripple: kéo mép shot đổi độ dài, các shot sau dời theo`, `:72`), wheel `:76`, `showSnap :90`, `targetsFor :96`, `drag :103-139`, `menuOn :140`, `shotThumb :151`, `shotBlock :162`, `voiceBlock :221`, `musicBlock :268`, `eventBlock :303`, `scrub :324`, `muteButtons :357`, `decorations :370`, `render :410`, các `ctx.on` ở `:474-477`.
- `public/index.html:41-48`: thanh timeline với chữ gợi ý `Kéo khối để dời · kéo mép để cắt · Shift+kéo câu dời cả câu sau · kéo phách/chấm từ để sửa mốc · R Ripple/Roll · S cắt shot · Space phát/dừng · N hít · Ctrl/Cmd+cuộn zoom`, nút `Ripple` (title ở `:44`), `Hoàn tác mốc` (title `Chưa sửa mốc phách hay mốc từ nào`), `Hít` (title `Hít vào mép shot, câu, SFX, playhead, phách, đầu từ (N)`), nút −, +, Vừa khung.
- `public/timeline-lanes.js:34-46`: `acceptDrop` (kiểu `MEDIA_DRAG`, chỉ khi `editable`, câu lỗi `Không đọc được file vừa thả`), `preview`, `brollBlocks`. Phase 2 chỉ port phần thuần (`musicLanes`, `sfxTiers`, `SFX_TIERS`, `SFX_W`, `SFX_LABEL_W`) sang `ui/src/core/timeline-lanes.ts`.
- `public/timeline-markers.js`: `beatLayer`, `wordDots` (phần vẽ, phase này viết lại). Phần logic đã ở `ui/src/core/markers.ts`; thực thể dùng chung là `markers` trong `ui/src/api/markers.ts` (phase 3).
- `public/app.js:412-460`: `keydown` toàn cục, bỏ qua khi có `dialog[open]` hay focus ở `[role="tablist"]`, gọi `keyAction` (`ui/src/core/timeline-edit.ts`, port của `public/timeline-edit.js:103`), rồi `runKey`.
- `README.md:58-72`: bảng phím tắt (Space, J/K/L, ←/→, Shift+←/→, Home/End, S, Delete, N, R, Shift+kéo câu, Shift+Z, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z).
- Hàm ghi đã có trong `ui/src/api/`: `actions.patch`, `actions.split`, `actions.undo`, `actions.redo`, `actions.directRemoveSfx`, `actions.transport`, hàm cho `/api/timeline/asset`; hook `useTimelineMedia`.

## Sở hữu file

**Chỉ được tạo hoặc sửa** (đúng glob của vùng `timeline` trong `ui/ownership.json`):

- `ui/src/timeline/**`
- `ui/src/core/timeline-geometry.ts`
- `tests/timeline-geometry.test.mjs`
- `ui/scripts/perf-playhead.mjs`
- `plans/261023-1018-react-ui-rewrite/reports/parity-timeline.md`, `plans/261023-1018-react-ui-rewrite/reports/phase-04-timeline-report.md`, `plans/261023-1018-react-ui-rewrite/reports/contract-requests-timeline.md`.

**Chỉ đọc (hợp đồng đóng băng, xem phase 3 mục "Hợp đồng đóng băng"):** `ui/package.json` và lockfile, `ui/src/styles/**`, `ui/src/components/ui/**`, `ui/src/lib/**`, `ui/src/store/**`, `ui/src/api/**`, `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**`, các file `ui/src/core/*.ts` có sẵn, `ui/scripts/**` có sẵn, mọi file ngoài `ui/` (gồm `public/`, `tests/` có sẵn, `docs/`, `README.md`, `server.mjs`, `routes/`, `lib/`), và `parity-checklist.md`.

**Cần đổi một file chỉ đọc:** không sửa. Ghi vào `reports/contract-requests-timeline.md` (file, thay đổi, lý do kèm `file:line`), báo orchestrator, làm tiếp phần không phụ thuộc. Khi orchestrator báo đã sửa trên `feat/react-ui`, chạy `git -C $W merge origin/feat/react-ui`.

**Không thêm dependency.** Cần thư viện mới thì đó là yêu cầu đổi hợp đồng.

**Luật code chung:**
- Không gọi `fetch` hay `EventSource` trong `ui/src/panels/**`, `ui/src/ext/**`, `ui/src/timeline/**`. Dùng hook và hàm của `ui/src/api/*`.
- Màu chỉ lấy từ token (`ui/src/styles/tokens.css`); test luật token chạy trong vitest. Giá trị dữ liệu (ví dụ màu khoá của nhân vật) ghi `token-exempt:` kèm lý do.
- Chữ hiển thị, câu toast, câu lỗi và trạng thái rỗng chép **nguyên văn** từ file cũ ghi ở "Hiện trạng đã kiểm".
- Đầu mỗi file port có comment `// Port of public/<file>.js; behaviour unchanged.` Không ghi mã phase hay mã task trong code, test hay commit.

## Luồng dữ liệu

```text
useProject(name) ─► m (manifest) ─► layout = laneLayout(m)  (core/timeline-geometry.ts)
                                      └► khối React, memo theo id + phiên bản manifest
useStudio.subscribe(t) ─► Playhead ref: style.transform = translateX(LABEL + t*pps)   (không render React)
pointerdown khối ─► useDrag: dưới CLICK px = bấm ─► actions.pick(kind,id)
                            trên CLICK px = kéo ─► xem trước bằng ref.style (left/width), hít = snap(snapTargets(...))
pointerup ─► ops = rollOps | resize_shot | rippleLineOps | move_line | move_event | musicDragOps ─► actions.patch(ops)  (MỘT patch)
thước / núm / chỗ trống ─► scrub ─► actions.transport.seek(t)
drop MEDIA_DRAG trên làn B-roll ─► readMediaDrag ─► hàm ghi /api/timeline/asset ─► SSE manifest ─► vẽ lại
mốc phách / chấm từ ─► markers.setBeat / setWord ─► bus "retimed" ─► store.retimed
keydown (window) ─► keyAction(e) ─► runKey ─► transport | actions | store (snap/mode/pps)
```

## Các task

### Task 4a.0 — Worktree, cài đặt, gốc thử

- **Mục tiêu:** worktree riêng trên đúng nhánh, có `node_modules` và gốc thử trên cổng 4412.
- **Các bước:**
  1. `git -C /Volumes/2/Motion-Studio fetch origin --tags`
  2. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/react-ui-timeline -b feat/react-ui-timeline origin/feat/react-ui`
  3. `npm --prefix $W/ui ci --no-audit --no-fund`
  4. `rm -rf /tmp/ms-react-root-4412 && node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4412`
- **Verify:**
  - `git -C $W merge-base --is-ancestor ui-contracts-v1 HEAD && echo ok` in `ok`.
  - `git -C $W branch --show-current` in `feat/react-ui-timeline`.
  - `lsof -nP -iTCP:4412 -sTCP:LISTEN | wc -l` in `0`. Khác `0` thì xem `lsof` có phải server do chính phase này bỏ lại không; phải thì `kill`, không phải thì theo Failure Protocol.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4a.1 — Hình học timeline (thuần, Node chạy được)

- **Mục tiêu:** mọi phép tính vị trí nằm ở một file thuần, test được bằng `node --test`.
- **File:** `ui/src/core/timeline-geometry.ts`, `tests/timeline-geometry.test.mjs`.
- **Các bước:**
  1. Chép hằng ở `public/timeline.js:27-33` (`LABEL`, `MIN_SHOT`, `CLICK`, `TRACK`, `BROLL`, `TIER`, `THUMB_MIN`, `round3`, `clampPps`).
  2. Hàm:
     - `xAt(t, pps) = LABEL + t * pps`; `tAt(x, pps) = (x - LABEL) / pps`, kẹp ≥ 0;
     - `fitPps(width, total)`, chép `fit()` (`:52-56`): `clampPps((width - LABEL - 60) / total)`;
     - `zoomAround({ pps, factor, pointerX, scrollLeft })` trả `{ pps, scrollLeft }` sao cho thời điểm dưới con trỏ đứng yên, chép phép tính của wheel ở `:76`;
     - `laneLayout(m)` trả `[{ lane: "shot"|"broll"|"voice"|"music"|"sfx", index, y, h }]`: shot `TRACK`, broll `BROLL`, voice `TRACK`, mỗi làn nhạc `TRACK` (số làn từ `musicLanes` của `core/timeline-lanes.ts`), SFX `TIER` × số tầng (từ `sfxTiers`). Thứ tự track như `render()` (`:410`).
  3. Import nội bộ dùng đường tương đối có đuôi `.ts`, không import React.
- **Đạt khi:** test xanh.
- **Verify:** `cd $W && node --test tests/timeline-geometry.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`. Test phải có ít nhất: `fitPps` khớp công thức cũ với 3 bộ số; `zoomAround` giữ `tAt(pointerX + scrollLeft)` không đổi (sai số < 1e-6); `clampPps(1000) === 400`; `laneLayout` của manifest có 2 nhạc chồng nhau và 3 SFX chồng nhau cho đúng 2 làn nhạc và 3 tầng SFX.

### Task 4a.2 — Nguyên mẫu: thước, playhead, năm track, kéo, hít, waveform, chọn

- **Mục tiêu:** đủ 12 mục `TL-PROTO-01`…`12` (phase 1, `parity-checklist.md`).
- **File:** `ui/src/timeline/index.tsx` (`TimelineArea`, giữ `data-testid="timeline-area"`), `ui/src/timeline/Toolbar.tsx`, `Ruler.tsx`, `Playhead.tsx`, `useDrag.ts`, `snap.ts`, `tracks/ShotTrack.tsx`, `tracks/BrollTrack.tsx`, `tracks/VoiceTrack.tsx`, `tracks/MusicTrack.tsx`, `tracks/SfxTrack.tsx`, `Wave.tsx`.
- **Các bước:**
  1. `TimelineArea` đọc `m` bằng `useProject(name)`; không có manifest thì `NeedManifest` (từ `shell/states.tsx`). Khung cuộn ngang; cột nhãn `LABEL` px dính trái.
  2. Khối là `div` định vị tuyệt đối theo `laneLayout` và `xAt`. Mỗi khối bọc `React.memo`, khoá theo `id` và giá trị của chính nó. `data-id`, `data-kind` như bản cũ (`byId :148`).
  3. `Playhead.tsx`: một vạch và một núm (`data-testid="playhead-knob"`). Vị trí ghi bằng `ref.current.style.transform` trong `useStudio.subscribe` theo `t` và `pps`. **Không** đọc `t` bằng selector render.
  4. `Ruler.tsx` (`data-testid="timeline-ruler"`): vạch giây theo `pps`. Kéo thước, núm, hay chỗ trống của làn thì tua, chép `scrub()` (`:324`): gọi `actions.transport.seek(t)`, hít khi `snap` bật.
  5. `useDrag.ts` chép `drag()` (`:103-139`): ngưỡng `CLICK`; trong lúc kéo chỉ đổi `style` của khối qua ref; nhả chuột thì gọi **một** `actions.patch(ops)`; dưới ngưỡng là bấm, gọi `actions.pick(kind, id)`.
  6. Op khi nhả, dùng nguyên hàm của `ui/src/core/timeline-edit.ts`:
     - mép phải shot: `mode === "ripple"` → `resize_shot` (bước 0,1 s, ≥ `MIN_SHOT`); `mode === "roll"` → `rollOps`, giới hạn bởi `rollRange`;
     - khối câu → `move_line`; giữ Shift → `rippleLineOps`;
     - SFX → `move_event` (thời điểm qua `eventStart`);
     - thân hoặc mép nhạc → `musicDragOps` (`update_music`).
  7. `snap.ts`: khi `snap` bật, đích hít từ `snapTargets(m, timing, t0, skip)`; vạch hít (`data-testid="snap-line"`) như `showSnap`/`hideSnap` (`:90-95`).
  8. `Toolbar.tsx`: chữ gợi ý và các nút đúng chữ, title của `public/index.html:41-48`; nút `Ripple`/`Roll` (`aria-pressed`, phím R, toast `:72`); nút `Hít` (`aria-pressed`); −, +, Vừa khung (`fitPps`). Ctrl/Cmd+cuộn gọi `zoomAround`.
  9. `Wave.tsx`: `canvas` trên khối giọng và khối nhạc, vẽ bằng `peaks` + `drawWave` của `ui/src/core/waveform.ts` (đệm IndexedDB qua `core/peaks-cache.ts`). Màu lấy theo `color` CSS của canvas (token `--ms-track-voice`, `--ms-track-music`).
  10. Màu khối từ token track (`shot`, `broll`, `voice`, `music`, `sfx`); khối đang chọn có viền `accent`.
- **Đạt khi:** typecheck sạch; test ở task 4a.6 phần nguyên mẫu xanh.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0. Rồi `cd $W/ui && npx vitest run src/timeline` thoát 0 và có `passed`.

### Task 4a.3 — Script đo fps khi kéo playhead

- **Mục tiêu:** một lệnh in số fps đo được trên `perf-60`.
- **File:** `ui/scripts/perf-playhead.mjs`.
- **Các bước:**
  1. `perf-playhead.mjs --base <url> --name perf-60 [--runs 3] [--min 50]`:
     - `playwright-core`, `chromium.launch({ channel: "chrome" })`, viewport 1440×900, `deviceScaleFactor: 1`;
     - mở `<base>/?name=perf-60`, chờ `[data-testid=playhead-knob]`;
     - cài bộ đếm `requestAnimationFrame` trong trang (`page.evaluate`);
     - kéo núm bằng `page.mouse` từ `x` đầu tới `x` cuối của `[data-testid=timeline-ruler]` trong 3 giây (180 bước `mouse.move`, mỗi bước chờ ~16 ms);
     - fps = số khung rAF / thời gian kéo; làm `runs` lần, lấy trung vị;
     - in `fps=<số, 1 chữ số thập phân> runs=<a,b,c>`; dòng cuối `ok` nếu trung vị ≥ `min`, `fail` nếu không; thoát 0 hoặc 1 tương ứng.
  2. Không dùng `networkidle` (SSE giữ kết nối mở).
- **Verify:** chạy được ở task 4a.4. Thêm `node $W/ui/scripts/perf-playhead.mjs --help; echo "exit $?"` in cách dùng và `exit 0`.

### Task 4a.4 — ĐIỂM DỪNG: 12 mục nguyên mẫu và ≥ 50 fps

- **Mục tiêu:** quyết định đi tiếp hay dừng cả plan, dựa trên bằng chứng.
- **Các bước:**
  1. `npm --prefix $W/ui run build`; background-run `node $W/ui/scripts/smoke-server.mjs $W 4412 /tmp/ms-react-root-4412`, ghi PID.
  2. Thử từng mục `TL-PROTO-01`…`12` trên `http://127.0.0.1:4412/?name=thuy-mau-demo`. Với mỗi mục kéo hay sửa, đọc lại kết quả bằng `curl -s "http://127.0.0.1:4412/api/log?name=thuy-mau-demo"` (op cuối cùng đúng loại, đúng một patch cho một lần kéo). Hoàn tác bằng Cmd+Z sau mỗi lần thử.
  3. `node $W/ui/scripts/perf-playhead.mjs --base http://127.0.0.1:4412 --name perf-60 --runs 3 --min 50`.
  4. Ghi mục **"Điểm dừng"** vào `reports/phase-04-timeline-report.md`: 12 dòng `| TL-PROTO-NN | có / không | bằng chứng |`, dòng `fps=…` nguyên văn, ảnh `timeline` và `timeline-perf60` ở 1440.
  5. Dừng server (`kill <PID>`), rồi báo orchestrator với khối `Status:`. **Chờ orchestrator trả lời trước khi làm task 4a.5.**
     - Đạt cả hai: orchestrator trả "đi tiếp".
     - Trượt một trong hai: orchestrator dừng mọi vùng 4b–4h và hỏi người dùng, với hai lựa chọn: (a) cho thêm thời gian sửa nguyên mẫu, hoặc (b) dự phòng: bỏ React, áp token và bố cục mới lên `public/`. Phase này không tự chọn.
- **Đạt khi:** 12 dòng `có`, trung vị fps ≥ 50.
- **Verify:**
  - `grep -cE "^\| TL-PROTO-[0-9]{2} \| có " $W/plans/261023-1018-react-ui-rewrite/reports/phase-04-timeline-report.md` in `12`.
  - Lệnh `perf-playhead.mjs` ở bước 3 in dòng cuối `ok` và thoát 0.

### Task 4a.5 — Đủ tính năng: ảnh shot, menu, M/S, decorator, B-roll, mốc

- **Mục tiêu:** mọi dòng `TL-` còn lại của checklist (nhóm `4a`).
- **File:** `ui/src/timeline/ShotThumb.tsx`, `BlockMenu.ts`, `MuteSolo.tsx`, `Decorations.tsx`, `BrollDrop.ts`, `markers/BeatLayer.tsx`, `markers/WordDots.tsx`, `TimingUndo.tsx`, cùng file track đã có.
- **Các bước:**
  1. Ảnh shot: chép `shotThumb` (`:151-160`) bằng `thumbAt` của `core/thumbs.ts` từ `useTimelineMedia(name).data.render`; shot hẹp hơn `THUMB_MIN` px thì không có ảnh; bản render cũ (`stale`) ghi như bản cũ, giờ theo `clock`.
  2. Menu chuột phải: mỗi loại khối đúng các mục và chữ như `menuOn` và các hàm `*Block` (`:140`, `:162-322`), mở bằng `openPointMenu` (`shell/PointMenu.tsx`). Mục "Nhờ đạo diễn sửa shot này" gọi `actions.pick("shot", id)` rồi `bus.emit("focus-note")` (`:216`).
  3. M/S: chép `muteButtons` (`:357-369`), ghi vào `store.toggleAudio`; nhóm theo `GROUPS` (`:34`). Chỉ đổi phần nghe thử trong player.
  4. Decorator: `getDecorators()` của registry + `decorationItems` của `core/timeline-edit.ts`; dải từ `t` tới `until` hay vạch mỏng tại `t`; màu theo `DECO` qua token `--ms-deco-*`.
  5. Làn B-roll: khối từ `brollBlocks` (chép lại logic của `public/timeline-lanes.js`, không đổi điều kiện); nhận thả chép `acceptDrop`/`preview` (`:34-46`) bằng `readMediaDrag` của `core/dnd.ts`, gọi hàm ghi `/api/timeline/asset`; dự án chỉ xem thì không nhận.
  6. Mốc: `BeatLayer` (phách trên thước) và `WordDots` (chấm từ trên khối giọng) chép `beatLayer`/`wordDots` của `public/timeline-markers.js`; kéo gọi `markers.setBeat` / `markers.setWord` của `useMarkers()`; bấm gọi `actions.pick("beat", musicId)` / `actions.pick("word", "<lineId>#<i>")`. Chỉ hiện khi dự án có `beats.json` / `words.json`.
  7. Nút `Hoàn tác mốc`: bật khi `markers.get().undo > 0`, chữ `Hoàn tác mốc (n)`, title như `public/index.html:45`; bấm gọi `markers.undo()`.
- **Đạt khi:** test ở task 4a.6 phần đủ tính năng xanh.
- **Verify:** `cd $W/ui && npx vitest run src/timeline` thoát 0, có `passed`, không `failed`.

### Task 4a.6 — Phím tắt và test component

- **File:** `ui/src/timeline/keys.ts`, `ui/src/timeline/*.test.tsx`, `ui/src/timeline/keys.test.ts`.
- **Các bước:**
  1. `keys.ts`: `useTimelineKeys()` gắn `keydown` trên `window` một lần (trong `TimelineArea`). Bỏ qua khi `document.querySelector('[role="dialog"], [role="menu"]')` có, hoặc `e.target.closest('[role="tablist"]')`. `inField` theo `input, textarea, select, [contenteditable]`. Gọi `keyAction(e, { inField })`; có kết quả thì `preventDefault()` và chạy `runKey`, chép `public/app.js:423-460` (`toggle`, `play`, `pause`, `back1`, `fwd1`, `prevFrame`, `nextFrame` theo `m.fps || 30`, `start`, `end`, `split`, `delete` chỉ với SFX thêm từ Studio, `undo`, `redo`, `zoomIn`, `zoomOut`, `fit`, `snap`, `mode`).
  2. Test, mỗi test dùng manifest nhỏ trong file test và `vi.mock("../api/actions")`:
     - kéo mép phải shot 30 px ở Ripple gọi `actions.patch` **một lần** với op `resize_shot`; ở Roll gọi với op đúng bằng `rollOps(...)` cho cùng đầu vào;
     - kéo câu gọi `move_line`; kéo câu khi giữ Shift gọi đúng `rippleLineOps(...)`;
     - kéo SFX gọi `move_event`; kéo nhạc gọi đúng `musicDragOps(...)`;
     - bấm (di chuyển 2 px) gọi `actions.pick` và không gọi `patch`;
     - `setT(5)` đổi `style.transform` của núm mà không render lại `ShotTrack` (đếm render bằng `vi.fn` trong một khối bọc test);
     - phím: mỗi dòng bảng `README.md:60-72` sinh đúng hành động; `=`/`+`, `-`, Ctrl+Y, Backspace cũng vậy; không có hành động khi focus ở `textarea`, khi có `[role=dialog]`, khi Alt được giữ;
     - thả `MEDIA_DRAG` JSON hỏng hiện toast `Không đọc được file vừa thả`;
     - dự án chỉ xem: kéo không gọi `patch`.
- **Verify:** `cd $W/ui && npx vitest run src/timeline` thoát 0, có `passed`, không `failed`. Tổng số test trong `src/timeline` (dòng `Tests` của vitest) ≥ 14.

### Task 4a.7 — Thử trực tiếp trên 4412, ảnh chụp, báo cáo parity của vùng

- **Mục tiêu:** mọi dòng nhóm `4a` trong `parity-checklist.md` được thử trên UI mới và ghi kết quả.
- **Các bước:**
  1. `npm --prefix $W/ui run build`
  2. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4412 /tmp/ms-react-root-4412`. Ghi PID vào báo cáo.
     Ngoài `thuy-mau-demo`, thử `perf-60` (60 shot) và `abm-intro` (chỉ xem).
  3. Mở `http://127.0.0.1:4412/?name=thuy-mau-demo` (dự án khác khi dòng checklist ghi rõ) và thử từng dòng nhóm `4a` theo cột "Cách thử". Đối chiếu với UI cũ trên 4411 (orchestrator giữ chạy) khi chữ hay hành vi chưa chắc.
  4. Ghi `plans/261023-1018-react-ui-rewrite/reports/parity-timeline.md`: mỗi dòng nhóm `4a` một dòng `| <ID> | có / không | <chỗ trong UI mới> | <ghi chú> |`. Dòng `không` phải có lý do và việc còn thiếu; còn dòng `không` thì task chưa đạt.
  5. Viết `/tmp/ms-react-views-timeline.json` cùng dạng với `ui/scripts/views-old.json` (`{ id, path, ready, steps? }`), gồm các view:
     - `timeline`: `/?name=thuy-mau-demo`, `ready` là `[data-testid=playhead-knob]`;
     - `timeline-perf60`: `/?name=perf-60`;
     - `timeline-readonly`: `/?name=abm-intro`;

     Rồi chạy `node $W/ui/scripts/shoot.mjs --base http://127.0.0.1:4412 --views /tmp/ms-react-views-timeline.json --out /Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/timeline --widths 1440,2560`.
  6. Dừng server: `kill <PID>`.
- **Verify:**
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *4a *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-timeline.md || echo "CHƯA $id"; done` không in gì.
  - Lệnh `shoot.mjs` in `ok 6` và thoát 0.
  - `lsof -nP -iTCP:4412 -sTCP:LISTEN | wc -l` in `0`.

### Task 4a.8 — Cổng chất lượng, commit, PR vào `feat/react-ui`

- **Các bước:**
  1. `git -C $W fetch origin && git -C $W merge origin/feat/react-ui` để lấy các sửa hợp đồng (nếu có). Xung đột trong file ngoài vùng là lỗi: theo Failure Protocol.
  2. Ghi `plans/261023-1018-react-ui-rewrite/reports/phase-04-timeline-report.md`: việc đã làm, số test, đường dẫn ảnh, các yêu cầu đổi hợp đồng (nếu có), và mục **"Ghi chú tài liệu"** cho phase 5: sửa `docs/timeline.md` (bỏ câu "JavaScript thuần trong `public/`, không có bước build và không dùng React" ở dòng 3; trỏ tới `ui/src/timeline/`) và bảng phím tắt `README.md:58-72` nếu có phím đổi.
  3. Commit theo từng phần, conventional commit, không nhắc AI, không có dòng Co-Authored-By:
     - `feat(ui): timeline geometry helpers with node tests`
     - `feat(ui): timeline tracks, ruler, playhead and drag edits`
     - `feat(ui): timeline lanes, markers, menus, decorators and b-roll drop`
     - `feat(ui): timeline keyboard shortcuts`
     - `test(ui): playhead drag frame-rate check`
  4. `git -C $W push -u origin feat/react-ui-timeline`
  5. `gh pr create --repo abm-dungtq/motion-studio --base feat/react-ui --head feat/react-ui-timeline --title "feat(ui): timeline in React with lanes, markers, snapping and keyboard shortcuts" --body-file plans/261023-1018-react-ui-rewrite/reports/phase-04-timeline-report.md` (chạy trong `$W`).
  6. Báo orchestrator, kết thúc bằng khối:

     ```text
     Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
     Summary: ...
     Concerns: ...
     ```
- **Verify:**
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
  - `cd $W && node ui/scripts/check-ownership.mjs timeline` in dòng bắt đầu bằng `ok timeline` và thoát 0.
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' panels ext timeline 2>/dev/null | wc -l` in `0`.
  - `git -C $W status --porcelain | wc -l` in `0`; `git -C $W ls-files ui/dist | wc -l` in `0`.
  - `gh pr view feat/react-ui-timeline --repo abm-dungtq/motion-studio --json baseRefName -q .baseRefName` in `feat/react-ui`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Nguyên mẫu không đạt 50 fps trên `perf-60` | Vừa | Cao | Playhead và xem trước kéo chỉ ghi `style` qua ref; khối bọc `memo`; đo bằng `perf-playhead.mjs` ngay ở task 4a.3, trước khi làm phần còn lại |
| Hành vi kéo lệch bản cũ (số làm tròn, ngưỡng, thứ tự op) | Vừa | Cao | Dùng nguyên hàm của `core/timeline-edit.ts`; không viết lại phép tính. Test so `ops` với kết quả của chính hàm đó |
| Phím tắt chạy khi đang mở hộp thoại Radix hay menu | Vừa | Vừa | Bỏ qua khi có `[role=dialog]` hay `[role=menu]` trong DOM, như `dialog[open]` của bản cũ; có test |
| Các vùng khác đã làm xong mà điểm dừng trượt, công bị bỏ | Thấp | Cao | Làm task 4a.2–4a.4 trước mọi việc khác; orchestrator dừng các vùng ngay khi nhận kết quả trượt |
| Cần đổi hợp đồng chung giữa chừng | Vừa | Vừa | Ghi `contract-requests-timeline.md`, báo orchestrator, làm phần khác; không sửa file hợp đồng |

## Hoàn tác

Vùng này chỉ thêm file trong glob của mình, nên hoàn tác là đóng PR và xoá nhánh: `gh pr close feat/react-ui-timeline --repo abm-dungtq/motion-studio --delete-branch`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/react-ui-timeline`. Nếu PR đã merge thì `git revert -m 1 <merge commit>` trên `feat/react-ui`. Không có dữ liệu nào ngoài `/tmp/ms-react-root-4412` bị đổi.

## Dừng và hỏi người dùng

Dừng và báo orchestrator để hỏi người dùng (không gọi kongming) khi:
- cần đổi API server;
- điểm dừng ở task 4a.4 trượt (nguyên mẫu chưa đủ 12 mục hoặc dưới 50 fps). Đây là kill criterion của cả plan;
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
