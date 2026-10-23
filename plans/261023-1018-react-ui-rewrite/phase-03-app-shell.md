# Phase 3: vỏ ứng dụng và hợp đồng chung

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/react-ui` (gọi tắt `$W`).
- **Nhánh:** `feat/react-ui`. Đây là xương sống: commit thẳng rồi `git push`, không mở PR riêng.
- **Cổng thử:** 4410 cho UI mới. 4411 chạy UI cũ để đối chiếu; orchestrator giữ server này.
- **Effort:** 12h.
- **Phụ thuộc:** phase 1 (PR `feat/react-ui-parity` đã merge vào `feat/react-ui`) và phase 2.
- **Chặn:** mọi phase từ 4a đến 4h. Orchestrator chỉ tỏa nhánh khi task 3.12 xong.

## Mục tiêu

Phase này làm hai việc.

1. **Dựng vỏ theo mockup:**
   - thanh trên: chọn dự án, Dự án mới, chip agent, chọn phiên bản, hoàn tác và làm lại, chip cổng, menu Xuất bản;
   - rail chỉ có icon, có tooltip, chia nhóm;
   - panel trái và cột phải thu gọn được và đổi cỡ được;
   - sân khấu đen có transport, hiện ảnh poster khi chưa có composition.
2. **Viết rồi đóng băng các hợp đồng chung.** Tám agent tỏa ra sau phase này chỉ **thêm file** trong vùng của mình, và không agent nào sửa file hợp đồng. Hợp đồng gồm:
   - hình dạng store Zustand;
   - file hook TanStack Query phủ đủ mọi route `/api`;
   - API `registerTab`/`registerSection` và các hàm đăng ký khác, cùng bộ nạp tự tìm thư mục;
   - file token (đã có từ phase 2; phase này chỉ xác nhận đóng băng);
   - các khe bố cục (layout slot), mỗi khe một tên;
   - bus sự kiện, kiểu dữ liệu kéo thả media, các component dùng chung;
   - bản đồ sở hữu file `ui/ownership.json` và script kiểm `ui/scripts/check-ownership.mjs`.

## Hiện trạng đã kiểm

**Trạng thái và lệnh của UI cũ:**

- `public/app.js:29-30`: `ctx.state` gồm `projects`, `name`, `entry`, `m`, `sel`, `pick`, `log`, `t`, `jobs`, `logs`, `requests`, `timing`, `audio { mute: Set, solo: Set }`, `gates`.
- `public/app.js:1-8`: `pick.kind` là một trong `shot`, `line`, `music`, `event`, `beat` (id là id nhạc), `word` (id là `"<id câu>#<chỉ số>"`).
- `public/app.js:156-165`: `ctx.pick` đặt `sel` theo kind. Kind `music` và `beat` giữ `sel` cũ.
- `public/app.js:30-180`: các hàm của `ctx`. Mỗi hàm có câu toast riêng, và phase này chép đúng chữ.
  - Gọi server: `api`, `send` (có `timeout`), `patch`, `undo`, `redo`.
  - Sửa timeline: `split`, `addSfx`, `directRemoveSfx`.
  - Đạo diễn: `direct`, `answer`, `reask`, `cancelRequest`.
  - Job và xuất: `cancelJob`, `exportVideo`, `exportBundle`.
  - Chọn và điều khiển: `pick`, `select`, `reload`, `seek`.

**Bus sự kiện (`public/app.js:32`, `ctx.on`/`ctx.emit`):**

| Sự kiện | Nơi nghe | Nơi phát |
|---|---|---|
| `project` | `agent.js:113`, `ext-anime.js:78`, `lemo-gallery.js:46`, `timeline-markers.js:182`, `panels.js:595` | `app.js` |
| `manifest` | `app.js:213`, `app.js:395`, `player.js:109`, `inspector.js:239`, `timeline.js:475`, `panels.js:600` | `app.js:241` |
| `select` | `inspector.js:240`, `timeline.js:476` | `app.js:192` |
| `retimed` | `app.js:214`, `inspector.js:241` | `timeline-markers.js:175` |
| `focus-note` | `inspector.js:242` | `timeline.js:216` |
| `time` | `app.js:411`, `timeline.js:474` | `player.js:22` |
| `timing` | `timeline.js:477` | `player.js:28` |
| `jobs` | `timeline-markers.js:163`, `panels.js:608` | `app.js` |
| `gates` | `panels.js:605` | `app.js:392` |
| `requests` | `panels.js:606` | `app.js:299` |
| `anime:shot` | — | `anime-board.js:38` |

Trong React, `project`, `manifest`, `jobs`, `gates` và `requests` thành query; `select` và `time` thành trường của store. Bus chỉ còn `retimed`, `focus-note`, `timing`, cùng các sự kiện có tiền tố vùng như `anime:shot`.

**Kéo thả, giá trị mặc định, hàm dùng chung:**

- `public/panels.js:25`: `MEDIA_DRAG = "text/x-ms-media"`.
  - Nguồn kéo: `panels.js:511-513` gửi `{ rel, kind, path }`; `broll-search.js:31-33` gửi `{ rel: null, kind: "video", path, sha256, start, end }`.
  - Đích thả: `timeline-lanes.js:34-46`, với câu lỗi `Không đọc được file vừa thả`.
- `public/timeline.js:41`: mặc định `pps = 60`, `snapOn = true`, `mode = "ripple"`.
- `public/panels.js:29-37` và `:73`: hàm định dạng dùng chung `safeUrl`, `clip`, `mb`, `mss`, `when`, `fileUrl`, `nfmt`.

**Extension cũ đăng ký vào đâu:**

| Extension | Đăng ký |
|---|---|
| `ext-broll.js` | `:11` section `media`; `:51` inspector |
| `ext-fx.js` | `:11` inspector `shot`; `:12` section `media` |
| `ext-lemo.js` | `:14` tab `styles-code`; `:19` section `styles-code`; `:20` inspector `shot` |
| `ext-receipts.js` | `:20` section `output`; `:37` inspector |
| `ext-anime.js` | `:80` tab `anime` |
| `ext-agents.js` | `:131` `addAgentRows` |

**Vỏ cũ:**

- `public/panels.js`:
  - `:13-20` mảng TABS;
  - `:83-110` rail và các trạng thái rỗng (`loading`, `fail`, `empty`, `needManifest`);
  - `:366-380` `addTab`/`addSection`, luật id `^[a-z][a-z0-9-]{1,30}$` và câu lỗi;
  - `:584-600` phím Alt+1…9 dùng `e.code`.
- `public/agent.js`: chip (chấm xanh, vàng, đỏ theo `level`), popover, gọi `/api/agent` mỗi 60 giây, `addRows`.
- `public/new-project.js`: hộp thoại Dự án mới; `MODES` (`:6`), `ASPECTS` (`:12`).
- `public/player.js:11`: `mountPlayer(ctx, el, { playBtn, timeEl })`. Player là iframe `/p/<tên>/<html>`, điều khiển qua `window.__player`, có mute/solo.
- `routes/timeline-assets.mjs:2-5`: `GET /api/timeline/media?name=` trả `render`, là mp4 mới nhất trong `renders/` hoặc `demo/`, có `mtime` và `stale`. Ảnh poster dùng route này.
- Phase 1 đã liệt kê 66 chuỗi `/api/…` khác nhau trong `public/*.js` (`phase-01…md:31`). Lệnh Verify ở task 3.1 đếm lại từ mã nguồn.

## Sở hữu file

**Tạo mới.** Mọi file dưới đây là file hợp đồng và đóng băng khi phase xong.

- Bản đồ sở hữu: `ui/ownership.json`, `ui/scripts/check-ownership.mjs`, `ui/scripts/check-ownership.test.mjs`.
- Bố cục: `ui/src/App.tsx`, `ui/src/App.test.tsx`, `ui/src/slots.ts`.
- Dữ liệu server: `ui/src/api/client.ts`, `queries.ts`, `events.ts`, `actions.ts`, `types.ts`, `markers.ts`.
- Store: `ui/src/store/studio.ts`, `ui/src/store/studio.test.ts`.
- Đăng ký: `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/ext/registry.test.ts`.
- Vỏ, trong `ui/src/shell/`, mỗi file kèm `*.test.tsx` khi cần:
  - thanh trên: `TopBar.tsx`, `ProjectSelect.tsx`, `NewProjectDialog.tsx`, `AgentChip.tsx`, `AgentDialog.tsx`, `VersionSelect.tsx`, `GateChip.tsx`, `ExportMenu.tsx`, `ExportDialog.tsx`, `Banner.tsx`;
  - khung: `Rail.tsx`, `LeftPanel.tsx`, `Stage.tsx`, `RightColumn.tsx`, `InspectorHost.tsx`, `SectionHost.tsx`;
  - phần dùng chung: `ErrorBoundary.tsx`, `states.tsx`, `PointMenu.tsx`, `controls.tsx`.
- Logic thuần: `ui/src/core/player.ts`, `dom.ts`, `agent-status.ts`, `new-project.ts`, `bus.ts`, `dnd.ts`, `ui-format.ts`.
- `ui/src/timeline/index.tsx`: khung trống. Từ khi phase 3 xong, file này thuộc phase 4a.
- `plans/261023-1018-react-ui-rewrite/reports/parity-3.md`.

**Sửa:** `ui/src/main.tsx`.

**Không đụng** (cần đổi thì theo Failure Protocol):

- `server.mjs`, `bin/`, `lib/`, `routes/`, `public/`, `tests/`;
- `ui/package.json` (dependency đã đủ từ phase 2);
- `ui/src/styles/**`, `ui/src/components/ui/**`;
- các file trong `ui/src/core/` do phase 2 tạo.

## Hợp đồng đóng băng

Sau commit cuối của phase này, các file dưới đây **chỉ đọc** với mọi phase 4x.

| Hợp đồng | File | Ai dùng |
|---|---|---|
| Dependency và build | `ui/package.json`, `ui/package-lock.json`, `ui/vite.config.ts`, `ui/tsconfig*.json`, `ui/components.json`, `ui/index.html` | tất cả |
| Token | `ui/src/styles/**` | tất cả |
| Component shadcn | `ui/src/components/ui/**`, `ui/src/lib/**` | tất cả |
| Store | `ui/src/store/**` | tất cả |
| Dữ liệu server | `ui/src/api/**` | tất cả |
| Đăng ký và nạp | `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/ext/registry.test.ts` | tất cả |
| Vỏ và khe bố cục | `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, `ui/src/shell/**` | tất cả |
| Logic thuần | các file `ui/src/core/*.ts` có sẵn khi phase 3 xong | 4a, 4d, 4e |
| Bản đồ sở hữu | `ui/ownership.json`, các file `ui/scripts/**` có sẵn khi phase 3 xong | orchestrator |
| Phần ngoài `ui/` | mọi file ngoài `ui/`, trừ báo cáo của vùng | phase 5 |

**Luật khi cần đổi hợp đồng:**

1. Agent của vùng **không sửa** file hợp đồng.
2. Agent ghi yêu cầu vào `reports/contract-requests-<vùng>.md` trong worktree của mình. Mỗi yêu cầu có ba mục: file, thay đổi, lý do kèm `file:line`.
3. Agent báo orchestrator, rồi làm tiếp phần không phụ thuộc vào yêu cầu đó.
4. Orchestrator gom các yêu cầu và sửa trên `feat/react-ui` bằng một commit `refactor(ui): …`.
5. Sau đó mỗi nhánh vùng tự chạy `git merge origin/feat/react-ui`.

### Hình dạng store (`ui/src/store/studio.ts`)

```ts
export type PickKind = "shot" | "line" | "music" | "event" | "beat" | "word";
export type Pick = { kind: PickKind; id: string } | null;
export type RightTab = "director" | "shot";
export type EditMode = "ripple" | "roll";
export type AudioGroup = "voice" | "music" | "sfx" | "broll";

export interface StudioState {
  name: string | null;                        // dự án đang mở (?name=)
  pick: Pick;                                 // khối hiện trong inspector
  sel: string | null;                         // id shot của khối đang chọn
  t: number;                                  // playhead, giây. Chỉ đọc bằng useStudio.subscribe
  playing: boolean;
  leftTab: string;  leftCollapsed: boolean;   // leftTab là id của một tab đã đăng ký
  rightTab: RightTab;  rightCollapsed: boolean;
  dialog: "export" | "new-project" | "agent" | null;
  snap: boolean;                              // mặc định true (timeline.js:41)
  mode: EditMode;                             // mặc định "ripple"
  pps: number;                                // mặc định 60, kẹp 8..400
  audio: { mute: AudioGroup[]; solo: AudioGroup[] };
  retimed: boolean;                           // đã kéo mốc nhưng chưa lồng tiếng lại
  directorDraft: string;                      // chữ trong ô giao việc, giữ khi đổi tab
  providerStatus: { ok: boolean; error?: string; setup?: string } | null;

  setName(n: string | null): void;
  setPick(kind: PickKind, id: string, m?: unknown): void;  // logic của ctx.pick
  setT(t: number): void;  setPlaying(p: boolean): void;
  setLeftTab(id: string): void;  toggleLeft(open?: boolean): void;
  setRightTab(t: RightTab): void;  toggleRight(open?: boolean): void;
  openDialog(d: StudioState["dialog"]): void;
  setSnap(on: boolean): void;  setMode(m: EditMode): void;  setPps(p: number): void;
  toggleAudio(kind: "mute" | "solo", g: AudioGroup): void;
  setRetimed(r: boolean): void;  setDirectorDraft(s: string): void;
}
export const useStudio: UseBoundStore<StoreApi<StudioState>>;
```

- **State riêng của vùng** không vào store chung. Vùng tự tạo store nhỏ trong thư mục của mình, ví dụ `ui/src/ext/anime/store.ts`.
- **Dữ liệu server** (manifest, log, job, request, cổng) không vào store. Nó nằm trong cache của TanStack Query.

### Dữ liệu server (`ui/src/api/`)

- `client.ts`: `api(path)` và `send(path, body, { timeout })`, chép từ `ctx.api` và `ctx.send`.
- `queries.ts` có hai phần:
  - **hook đọc:** mỗi route `GET` một hook `useXxx(...)`, khoá `[route, name, …]`;
  - **hàm ghi:** mỗi route `POST`, `PUT` hay `DELETE` một hàm `xxx(body)` trả `{ status, data?, error? }`, kèm danh sách khoá phải invalidate.
- `actions.ts`:
  - các hàm của `ctx` có toast: `patch`, `undo`, `redo`, `split`, `addSfx`, `directRemoveSfx`, `direct`, `answer`, `reask`, `cancelRequest`, `cancelJob`, `exportVideo`, `exportBundle`, `open`, `importProject`, `refreshQueue`, `refreshGates`;
  - `transport`, là ref do `Stage` gán.
- `events.ts`: `useProjectEvents(name)` nghe SSE `/api/events`.
- `markers.ts`: một thực thể `markers` duy nhất, tạo bằng `createMarkers(ctx)` của `core/markers.ts` (phase 2), cùng hook `useMarkers()`.
  - Timeline (4a) và inspector (4d) cùng dùng thực thể này, như `ctx.markers` của bản cũ (`public/inspector.js:177-219`, `public/app.js:213`).
  - `ctx` truyền vào được nối như sau: `state.name` và `state.m` đọc từ store và cache query; `editable` đọc từ dự án đang mở; `api`/`send` từ `client.ts`; `emit("retimed")` thành `bus.emit("retimed")`; `toast` từ `sonner`.
  - `useMarkers()` render lại khi mốc đổi, nghe `bus` sự kiện `markers` (thêm vào danh sách sự kiện chung).
- File trong dự án (`/p/<tên>/<đường dẫn>`): `useProjectText(name, path)` trả chữ của file hoặc `null` khi 404. Tab Đạo diễn đọc `STORYBOARD.md` bằng hook này, thay cho `fetch` ở `public/panels.js:128`.
- `types.ts`: kiểu của manifest, project, request, job, gate, timeline media. Lấy từ dữ liệu thật trên 4411; trường chưa rõ để `unknown`.
- **Luật:** component trong `ui/src/panels/**`, `ui/src/ext/**` và `ui/src/timeline/**` không gọi `fetch` hay `EventSource`. Ngoại lệ duy nhất là `core/waveform.ts` (phase 2), vì nó tải file âm thanh chứ không gọi API. Mọi lệnh gọi server đi qua `ui/src/api/*`. Task 3.11 kiểm luật này bằng grep, và phase 5 chạy lại.

### Đăng ký (`ui/src/ext/registry.ts`)

```ts
type Group = "assets" | "audio" | "library" | "extra";
registerTab({ id, label, icon, group = "extra", order = 100, lead, component, badge? }): void;
registerSection(hostId: string /* id tab | "director" | "export" */, { id, order = 100, component }): void;
registerInspectorSection({ kinds = ["shot"], order = 100, component /* props { pick, m } */ }): void;
registerAgentRows({ component, width? }): void;
registerTimelineDecorator(fn: (m, state) => Array<{ t, until?, lane, label, kind }>): void;
useTabs(); useSections(hostId); useInspectorSections(kind); useAgentRows(); getDecorators();
createStudio(): Studio;   // { registerTab, registerSection, registerInspectorSection, registerAgentRows,
                          //   registerTimelineDecorator, actions, api, send, toast, useStudio, bus }
```

- Luật id: `^[a-z][a-z0-9-]{1,30}$`. Trùng id thì ném lỗi. `ai` và `output` không được dùng làm id tab.
- **Bộ nạp** (`load.ts`) tìm hai nhóm thư mục. Mỗi thư mục có `index.ts` export `register(studio)`.
  - `ui/src/panels/*/index.ts`: phần có sẵn (media, voice, music, library, director, inspector, export, agent).
  - `ui/src/ext/*/index.ts`: extension (anime, broll, fx, lemo, receipts, agents).

  Nhóm `panels` nạp trước, rồi tới nhóm `ext`. Trong mỗi nhóm, thư mục xếp theo tên. Vì vậy không có file đăng ký chung nào mà hai agent cùng phải sửa.

### Khe bố cục (`ui/src/slots.ts`)

| Khe | Nằm ở | Ai lấp | Cách lấp |
|---|---|---|---|
| `rail` | cột 52 px bên trái | vỏ | `registerTab` |
| `left` | panel trái | vùng có tab | component của tab, rồi `useSections(tabId)` |
| `stage` | giữa | vỏ (`Stage.tsx`) | cố định |
| `right.director` | tab Đạo diễn | 4d | `registerSection("director", …)` |
| `right.shot` | tab Shot | 4b, 4d, 4e, 4g, 4h | `registerInspectorSection` |
| `export` | `ExportDialog` | 4e | `registerSection("export", …)` |
| `agent` | `AgentDialog` | 4e | `registerAgentRows` |
| `timeline` | hàng dưới cùng | 4a | `ui/src/timeline/index.tsx` export `TimelineArea` |

`slots.ts` export hằng `SLOTS` gồm đúng tám tên này. Test của `App` kiểm mỗi khe có một phần tử `data-slot="<tên>"`.

### Phần dùng chung khác

- `ui/src/core/bus.ts`: `bus.on(ev, fn)` trả hàm huỷ; `bus.emit(ev, ...args)`.
  - Sự kiện chung: `retimed`, `focus-note`, `timing`, `markers`.
  - Vùng được tự đặt sự kiện có tiền tố `<vùng>:` (ví dụ `anime:shot`) mà không cần đổi hợp đồng.
- `ui/src/core/dnd.ts`:
  - `MEDIA_DRAG = "text/x-ms-media"`;
  - `type MediaDrag = { rel: string | null; kind: string | null; path: string | null; sha256?: string; start?: number; end?: number }`;
  - `setMediaDrag(e, item)`, đặt thêm `text/plain` như `panels.js:512`;
  - `readMediaDrag(e)` trả `MediaDrag`, hoặc `null` khi JSON hỏng.
- `ui/src/core/ui-format.ts`: `safeUrl`, `clip`, `mb`, `mss`, `when`, `fileUrl`, `nfmt`, chép từ `panels.js:29-37` và `:73`.
- `ui/src/shell/controls.tsx`: `Button`, `Input`, `Textarea`, `Checkbox`.
- `ui/src/shell/states.tsx`: `Loading`, `Empty`, `NeedManifest`, `Fail`.
- `ui/src/shell/PointMenu.tsx`: `openPointMenu(x, y, items)`.

### Bản đồ sở hữu (`ui/ownership.json`)

```json
{
  "base": "origin/feat/react-ui",
  "areas": {
    "timeline":    ["ui/src/timeline/**", "ui/src/core/timeline-geometry.ts", "tests/timeline-geometry.test.mjs", "ui/scripts/perf-playhead.mjs"],
    "media":       ["ui/src/panels/media/**", "ui/src/ext/broll/**"],
    "voice-music": ["ui/src/panels/voice/**", "ui/src/panels/music/**"],
    "director":    ["ui/src/panels/director/**", "ui/src/panels/inspector/**", "ui/src/core/inspector-ops.ts"],
    "export":      ["ui/src/panels/export/**", "ui/src/ext/receipts/**", "ui/src/panels/library/**", "ui/src/core/library.ts", "ui/src/panels/agent/**", "ui/src/ext/agents/**"],
    "anime":       ["ui/src/ext/anime/**"],
    "lemo":        ["ui/src/ext/lemo/**"],
    "fx":          ["ui/src/ext/fx/**"]
  },
  "every_area": [
    "plans/261023-1018-react-ui-rewrite/reports/parity-{area}.md",
    "plans/261023-1018-react-ui-rewrite/reports/phase-04-{area}-report.md",
    "plans/261023-1018-react-ui-rewrite/reports/contract-requests-{area}.md"
  ]
}
```

File này cũng là nguồn cho bảng sở hữu trong `plan.md`. Hai vùng không có glob nào trùng nhau, và `check-ownership.test.mjs` kiểm điều đó.

## Luồng dữ liệu

```text
main.tsx → <QueryClientProvider><TooltipProvider><App/><Toaster/></…>
App mount:
  GET /api/status → store.providerStatus
  GET /api/projects (useProjects)
  loadAll(studio): panels/*/index.ts rồi ext/*/index.ts → register(studio) → registry
  ?tab= / localStorage["studio.tab"] → leftTab ; ?tab=ai → rightTab "director" ; ?tab=output → dialog "export"
  open(?name=) → store.name ; history.replaceState ?name=
Dự án mở (có project.json):
  useProject, useLog, useJobs, useRequests, useGates, useTimelineMedia (khoá [route, name])
  SSE /api/events?name=  manifest → invalidate project + log (khi version khác)
                         request  → setQueryData(requests) + toast done/failed (như setRequests)
                         job      → merge jobs + nối jobLogs + toast xuất (như onJob)
  manifest đổi → sau 1,5 s refetch gates ; bus "retimed" → setRetimed(true), sau 0,5 s refetch gates
Hành động:
  component vùng → actions.* hoặc hàm ghi trong queries.ts → send() → server → SSE → cache → render
  actions.pick(kind,id) → store.setPick (sel theo kind) + rightTab = "shot"
Playhead:
  Stage (iframe __player) → onTime(t) → store.setT(t) → subscribe trong Stage/timeline ghi vào ref (không render lại cây)
```

## Các task

### Task 3.0 — Gộp phase 1, chuẩn bị

- **Mục tiêu:** `feat/react-ui` có đủ kết quả của phase 1 và phase 2.
- **Các bước:**
  1. Orchestrator merge PR `feat/react-ui-parity` vào `feat/react-ui` bằng merge commit, không squash.
  2. `git -C $W pull --ff-only && npm --prefix $W/ui ci --no-audit --no-fund`.
  3. Từ đây, script `ui/scripts/*.mjs` nạp `playwright-core` từ `ui/node_modules`, không cần biến `MS_PLAYWRIGHT`.
- **Verify:**
  - `ls $W/ui/scripts/{smoke-server,make-test-root,seed-gate-cards,shoot}.mjs | wc -l` in `4`.
  - `test -f $W/plans/261023-1018-react-ui-rewrite/parity-checklist.md && echo ok` in `ok`.
  - `cd $W/ui && node -e "import('playwright-core').then(m=>console.log(typeof m.chromium.launch))"` in `function`.
  - `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 3.1 — Client API, kiểu, query đủ mọi route, SSE

- **Mục tiêu:** gọi server và báo lỗi giống hệt `public/app.js`. Mọi route mà UI cũ gọi đều có hook hoặc hàm trong `ui/src/api/`.
- **File:** `ui/src/api/client.ts`, `types.ts`, `queries.ts`, `events.ts`, `markers.ts`.
- **Các bước:**
  1. `client.ts`:
     - `TOKEN` đọc từ `meta[name="studio-token"]`;
     - `api(path)` chép `ctx.api` (`public/app.js:36-41`): lỗi thì ném `Error` có `.status`;
     - `send(path, body, { timeout })` chép `ctx.send` (`:43-51`). Hết giờ thì trả `{ status: 0, timeout: true, error: "Studio không trả lời kịp" }`; lỗi mạng thì trả `{ status: 0, network: true, error: … }`.
  2. Lập bảng route:
     - chạy ``grep -nE '"/api/|`/api/' $W/public/*.js`` để biết mỗi route được gọi ở đâu và theo phương thức nào;
     - mỗi route có một hook đọc hoặc một hàm ghi, đặt tên theo route (ví dụ `/api/broll/search` thành `brollSearch`);
     - đầu mỗi hook hay hàm có comment `// <route> — public/<file>:<line>`;
     - chuỗi route viết trong backtick (`` `/api/…` ``) để lệnh Verify tìm được.
  3. `useProject(name)` chỉ bật khi dự án có `has_manifest`. `project` và `log` dùng `staleTime: Infinity`, vì SSE làm mới chúng. `useAgent()` có `refetchInterval: 60000`.
  4. `useProjectText(name, path)` đọc `/p/<tên>/<đường dẫn>` qua `fetch` trong `client.ts`; 404 trả `null`.
  5. `markers.ts` theo mục "Dữ liệu server". `markers.load()` chạy khi manifest đổi, như `public/app.js:213`.
  6. `events.ts`: `useProjectEvents(name)` mở `EventSource` và đóng khi đổi dự án. Ba sự kiện xử lý như `subscribe`, `setRequests` và `onJob` của `public/app.js`, với cùng chữ toast. Dùng `toast` của `sonner`; lỗi dùng `toast.error`.
- **Đạt khi:** mọi route `/api/…` trong `public/*.js` có mặt trong `ui/src/api/`, và typecheck sạch.
- **Verify:**
  - ``cd $W && grep -ohE '"/api/[a-z0-9/_-]+|`/api/[a-z0-9/_-]+' public/*.js | tr -d '"`' | sort -u | grep -vx '/api/extensions' | while read r; do grep -rqF "\`$r" ui/src/api || echo "THIẾU $r"; done`` không in gì. Route `/api/extensions` (chỉ `public/ext.js` gọi) được bỏ qua có chủ ý: bộ nạp mới tìm extension lúc build bằng `import.meta.glob`, còn route vẫn giữ ở server (câu hỏi mở 1 trong `plan.md`).
  - ``cd $W && grep -ohE '"/api/[a-z0-9/_-]+|`/api/[a-z0-9/_-]+' public/*.js | tr -d '"`' | sort -u | wc -l`` in số khớp với số dòng `API` đếm ở phase 1, kỳ vọng `66`. Nếu ra số khác thì ghi số thật vào `reports/parity-3.md`; lệnh Verify ở trên vẫn phải không in gì.
  - `npm --prefix $W/ui run typecheck` thoát 0.

### Task 3.2 — Store, action, bus, kéo thả, định dạng

- **Mục tiêu:** store đúng hình dạng ở mục hợp đồng. Mọi hàm của `ctx` nằm ở một chỗ, đúng thứ tự gọi và đúng chữ toast.
- **File:** `ui/src/store/studio.ts`, `ui/src/store/studio.test.ts`, `ui/src/api/actions.ts`, `ui/src/core/bus.ts`, `ui/src/core/dnd.ts`, `ui/src/core/ui-format.ts`.
- **Các bước:**
  1. `studio.ts` dùng `create()` của Zustand, với đúng các trường và hàm ở mục "Hình dạng store".
     - `setLeftTab` ghi `localStorage["studio.tab"]` và tham số `?tab=`, như `readTab` (`panels.js:75`).
     - `setPps` kẹp giá trị trong 8–400, như `clampPps` của `public/timeline.js`.
     - `setPick(kind, id, m)` chép `ctx.pick` (`public/app.js:156-165`), rồi đặt `rightTab = "shot"`.
  2. `actions.ts` chép từng hàm của `ctx` (`public/app.js:52-180`), cùng `open`, `importProject`, `refreshQueue`, `refreshGates`. `reload()` được thay bằng `queryClient.invalidateQueries`.
     - `split` đọc playhead bằng `useStudio.getState().t`, rồi mở menu "Nhờ đạo diễn dựng shot mới" qua `openPointMenu`.
     - `actions.transport` là ref do `Stage` gán (task 3.7).
  3. Chép đúng từng chữ của mọi câu toast. Ví dụ:
     - `Dự án chỉ xem, sửa qua đạo diễn`;
     - `Đã có thay đổi mới, đã tải lại`;
     - `Không còn gì để hoàn tác`, `Không còn gì để làm lại`;
     - `Đang xuất video: render bản giao rồi nén`;
     - `Đang xuất bộ lớp dựng: render rồi cắt từng shot`;
     - `Viết yêu cầu cho đạo diễn trước`.
  4. Viết `bus.ts`, `dnd.ts` và `ui-format.ts` theo mục "Phần dùng chung khác". `dnd.ts` và `ui-format.ts` không import React, để Node chạy thẳng được.
  5. `studio.test.ts` kiểm:
     - `setPick("line", id, m)` đặt `sel` về shot của câu;
     - `setPick("music", id, m)` giữ `sel` cũ;
     - `setPick("word", "<line>#2", m)` đặt `sel` về shot của câu;
     - `setPps(1000)` cho ra `400`;
     - giá trị mặc định là `snap === true`, `mode === "ripple"`, `pps === 60`.
- **Đạt khi:** mọi chuỗi toast trong `public/app.js` có mặt nguyên văn trong `ui/src/api/*.ts`, và test store xanh.
- **Verify:**
  - ``cd $W && grep -ohE 'toast\((`[^`]*`|"[^"]*")' public/app.js | sed -E 's/^toast\(//' | sort -u | while read -r s; do q=$(printf %s "$s" | sed -E 's/\$\{[^}]*\}.*//' | tr -d '"`'); grep -rqF -- "$q" ui/src/api || echo "THIẾU $q"; done`` không in gì.
  - `cd $W/ui && npx vitest run src/store` thoát 0 và có `passed`.
  - `cd $W && for f in ui/src/core/bus.ts ui/src/core/dnd.ts ui/src/core/ui-format.ts; do node -e "import('./$f').then(()=>{},e=>{console.error('$f',e.message);process.exit(1)})" || echo "LỖI $f"; done` không in `LỖI`.

### Task 3.3 — Registry và bộ nạp tự tìm thư mục

- **Mục tiêu:** API component thay cho `studio.addTab` và các hàm cùng loại. Cả phần có sẵn lẫn extension đều là thư mục tự nạp, nên không có file đăng ký chung.
- **File:** `ui/src/ext/registry.ts`, `ui/src/ext/load.ts`, `ui/src/ext/registry.test.ts`.
- **Các bước:**
  1. `registry.ts` theo mục "Đăng ký" ở trên, với các câu lỗi:
     - `registerTab: id "<id>" không hợp lệ hoặc đã có` (chép `public/panels.js:367-368`, đổi `addTab` thành `registerTab`);
     - `registerTab <id>: cần label và component`;
     - `registerTab: id "<id>" đã dành cho chỗ khác` khi id là `ai` hoặc `output`;
     - `registerSection <hostId>/<id>: cần component`.

     `useTabs()` xếp tab theo nhóm (`assets`, `audio`, `library`, `extra`), rồi theo `order`, rồi theo thứ tự đăng ký.
  2. `load.ts`:
     - chữ ký `loadAll(studio, mods = { panels: import.meta.glob("../panels/*/index.ts", { eager: true }), ext: import.meta.glob("./*/index.ts", { eager: true }) })`;
     - duyệt `panels` trước, rồi `ext`; khoá trong mỗi nhóm đã sắp xếp;
     - mỗi module phải có `register(studio)`. Thiếu thì ghi lỗi `không có export register(studio)`;
     - mỗi lỗi gom thành `<tên thư mục>: <message>`. Có lỗi thì gọi `toast.error("Extension lỗi, đã bỏ qua: " + danh sách.join("; "))`, như `public/ext.js:33`. Các module khác vẫn nạp.
  3. Ở phase này chưa có thư mục nào trong `panels/` hay `ext/`. Glob trả rỗng, và app vẫn chạy với rail trống cùng các trạng thái rỗng.
  4. `registry.test.ts` (export `resetRegistry()` chỉ để test dùng) kiểm:
     - id sai hay trùng thì ném lỗi đúng câu;
     - id `ai` bị từ chối;
     - `useTabs` xếp đúng theo nhóm rồi theo `order`;
     - `useSections("media")` xếp theo `order`;
     - `loadAll` với `panels` gồm một module giả và `ext` gồm hai module, trong đó một `register` ném lỗi. Kết quả: module tốt được đăng ký, `panels` chạy trước `ext`, toast gọi đúng một lần và chuỗi có tên thư mục lỗi.
- **Đạt khi:** test xanh.
- **Verify:** `cd $W/ui && npx vitest run src/ext/registry.test.ts` thoát 0 và có `passed`.

### Task 3.4 — Bố cục, khe, rail và panel trái

- **Mục tiêu:** bố cục giống mockup. Rail chỉ có icon, có tooltip, chia nhóm. Panel trái và cột phải thu gọn và đổi cỡ được. Mỗi khe có `data-slot`.
- **File:** `ui/src/App.tsx`, `ui/src/slots.ts`, `ui/src/main.tsx`, và trong `ui/src/shell/`: `Rail.tsx`, `LeftPanel.tsx`, `SectionHost.tsx`, `ErrorBoundary.tsx`, `states.tsx`, `controls.tsx`.
- **Các bước:**
  1. `App.tsx`, dựng theo ảnh mockup `/Volumes/2/Edit-Video/plans/reports/advise-261023-1018-studio-ui-preview.png`:
     - hàng 1: `TopBar`, cao 44 px;
     - hàng 2: `Banner`;
     - hàng 3 chiếm phần cao còn lại:
       - `Rail`, rộng 52 px, nằm ngoài nhóm Resizable, `data-slot="rail"`;
       - tiếp theo là `ResizablePanelGroup direction="horizontal" autoSaveId="ms-layout"` gồm `LeftPanel` (`data-slot="left"`; `collapsible`, `defaultSize 22`, `minSize 15`, `maxSize 40`), một `ResizableHandle`, `Stage` (`data-slot="stage"`, `minSize 30`), một `ResizableHandle` nữa, và `RightColumn` (`collapsible`, `defaultSize 24`, `minSize 18`, `maxSize 40`);
     - hàng 4: `TimelineArea` (từ `ui/src/timeline/index.tsx`) trong `div data-slot="timeline"`. Rộng hết màn hình, cao theo nội dung nhưng tối đa 45 % chiều cao, có cuộn;
     - `App` gọi `loadAll(createStudio())` một lần khi mount.
  2. `main.tsx` render `<QueryClientProvider><TooltipProvider><App/><Toaster/></TooltipProvider></QueryClientProvider>`.
  3. `Rail.tsx`:
     - mỗi tab là nút icon (Lucide, 20 px) trong `Tooltip` có chữ `"<label> (Alt+<n>)"` khi n ≤ 9;
     - giữa các nhóm có đường kẻ;
     - `role="tablist"`, `aria-orientation="vertical"`, roving tabindex;
     - mũi tên lên/xuống, Home và End di chuyển như `panels.js`;
     - Alt+1…9 dùng `e.code` (`Digit1`…) và bỏ qua khi có Meta, Ctrl hay Shift, như `panels.js:584-600`;
     - hiện badge đếm khi `badge()` > 0;
     - bấm vào tab đang mở trong lúc panel thu gọn thì mở lại panel.
  4. Nhóm và thứ tự là cố định. Các vùng 4x đăng ký đúng id, nhóm và `order` dưới đây:

     | Nhóm | Tab (id: chữ tooltip, icon Lucide) | Vùng |
     |---|---|---|
     | `assets` | `media`: Chất liệu (`LayoutGrid`, order 10) | 4b |
     | `assets` | `styles-code`: Phong cách (`Palette`, 20) | 4g |
     | `assets` | `anime`: Anime (`Sparkles`, 30) | 4f |
     | `assets` | `fx`: Chuyển cảnh & hiệu ứng (`ArrowLeftRight`, 40) | 4h |
     | `audio` | `voice`: Lời & giọng (`Mic`, 10) | 4c |
     | `audio` | `music`: Nhạc & âm thanh (`Music`, 20) | 4c |
     | `library` | `library`: Thư viện mẫu (`Library`, 10) | 4e |

  5. Tham số `?tab=`:
     - `?tab=ai` đặt `rightTab = "director"` và mở cột phải;
     - `?tab=output` đặt `dialog = "export"`;
     - `?tab=<id lạ>` mở tab đầu tiên.
  6. `LeftPanel.tsx`:
     - đầu panel có tên tab, dòng `lead` màu `muted`, và nút thu gọn (`PanelLeftClose`, Tooltip "Thu gọn");
     - thân là `ScrollArea` chứa component của tab, rồi `SectionHost` của tab đó;
     - mỗi phần bọc trong `ErrorBoundary`. Phần lỗi hiện `Không tải được: <message>. Thử bấm lại mục này trên thanh trái.` (chữ của `fail()` trong `panels.js`), các phần khác vẫn chạy;
     - chưa có tab nào thì hiện `Empty` với chữ `Chưa có mục nào`.
  7. `states.tsx`: `Loading` ("Đang tải…"), `Empty({ text, action?, to? })`, `NeedManifest`, `Fail`, chép chữ của `panels.js:101-110`. Nút "Chọn dự án" đưa focus vào ô chọn dự án. Nút của `Empty` đi tới `to` theo id cũ: `to: "ai"` mở cột phải ở tab Đạo diễn; `to: "output"` mở `ExportDialog`; id khác gọi `setLeftTab(to)`. Nhờ vậy các vùng chép nguyên `empty(text, action, to)` của `panels.js:105`.
  8. `controls.tsx`: `Button` (biến thể `default`, `primary`, `ghost`, `icon`), `Input`, `Textarea`, `Checkbox`. Tất cả là thẻ HTML gốc với lớp token. Không thêm component shadcn nào khác.
- **Đạt khi:** test component ở task 3.8 xanh.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 3.5 — Thanh trên

- **Mục tiêu:** đủ các phần tử của `public/index.html:13-25`, theo mockup.
- **File:** trong `ui/src/shell/`: `TopBar.tsx`, `ProjectSelect.tsx`, `NewProjectDialog.tsx`, `AgentChip.tsx`, `AgentDialog.tsx`, `VersionSelect.tsx`, `GateChip.tsx`, `ExportMenu.tsx`, `ExportDialog.tsx`, `Banner.tsx`; thêm `ui/src/core/agent-status.ts` và `ui/src/core/new-project.ts`.
- **Các bước:**
  1. Thứ tự từ trái sang phải:
     - chữ "Motion Studio";
     - `ProjectSelect` (shadcn `Select`): mục đầu là "— chọn dự án —"; tên dự án có hậu tố " (chỉ xem)" hoặc " (chưa nhập)" như `loadProjects`;
     - nút "Dự án mới" (icon `Plus`) mở `NewProjectDialog`;
     - tiêu đề dự án;
     - khoảng trống;
     - `AgentChip`;
     - `VersionSelect`;
     - nút hoàn tác (`Undo2`) và làm lại (`Redo2`), với Tooltip `Hoàn tác (Ctrl/Cmd+Z)` và `Làm lại (Ctrl/Cmd+Shift+Z)`;
     - `GateChip`;
     - `ExportMenu`.
  2. `NewProjectDialog` (shadcn `Dialog`):
     - port `public/new-project.js`, đủ mọi trường, `MODES`, `ASPECTS` và giới hạn;
     - lỗi hiện ngay trong hộp thoại;
     - tạo xong thì đóng hộp thoại, nạp lại danh sách, mở dự án mới và toast `Đã tạo dự án <tên>`;
     - chế độ `video-co-san` mở tab `media`;
     - hằng và hàm kiểm thuần đặt trong `core/new-project.ts`.
  3. `AgentChip` và `AgentDialog`:
     - port phần chip và khung popover của `public/agent.js`. `level`, `usableAgents`, `semver`, `JOB` chuyển vào `core/agent-status.ts`;
     - chip có chấm màu theo `level` (token `ok`, `warn`, `danger`) và giữ nguyên chữ của bản cũ;
     - bấm chip mở `AgentDialog` (shadcn `Dialog`, `data-slot="agent"`). Thân hộp thoại chỉ gồm `useAgentRows()` theo thứ tự đăng ký. Nội dung popover cũ do 4e viết trong `ui/src/panels/agent/` và đăng ký bằng `registerAgentRows`;
     - chưa có hàng nào thì hiện `Loading`.
  4. `VersionSelect`: danh sách `v<n> · hiện tại` hoặc `v<n> · <actor>`, như `renderVersions`. Khi người dùng đổi lựa chọn thì toast `Danh sách chỉ để xem; quay lại bản trước bằng Hoàn tác` và trả về bản hiện tại. Không có dự án thì tắt.
  5. `GateChip`: ẩn khi cổng đạt hoặc chưa có dữ liệu cổng.
     - Chữ là `Cần duyệt lại animatic` hoặc `Chưa đủ cổng xuất`; Tooltip liệt kê các dòng FAIL.
     - Bấm khi cổng là `animatic`: đặt `rightTab = "director"` và mở cột phải nếu đang thu gọn. Với cổng khác: đặt `dialog = "export"`.
  6. `ExportMenu` (shadcn `DropdownMenu`) có nút chính chữ "Xuất bản" kèm `ChevronDown`, gồm các mục:
     - "Xuất video" gọi `actions.exportVideo()`;
     - "Xuất bộ lớp dựng" gọi `actions.exportBundle()`, title như `panels.js:354`;
     - một đường kẻ;
     - "Cổng & tệp đã xuất…" đặt `dialog = "export"`.

     Hai mục đầu tắt khi chưa có dự án.
  7. `ExportDialog` (shadcn `Dialog`, `max-w-3xl`, `data-slot="export"`, thân là `ScrollArea`): tiêu đề "Xuất bản", dòng lead của tab `output` cũ (`panels.js:19`), rồi `SectionHost hostId="export"`. 4e lấp nội dung.
  8. `Banner` có ba trạng thái, theo `open()` và `setManifest()`:
     - thiếu provider: chữ đậm là lỗi, tiếp theo là "Chạy `<lệnh setup>` trong thư mục Motion Studio, rồi tải lại trang.";
     - chỉ xem: `Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn`;
     - chưa có project.json: `Dự án chưa có project.json. ` kèm nút "Nhập dự án".

     Màu nền là token `warn` pha mờ.
- **Đạt khi:** test ở task 3.8 xanh.
- **Verify:** `npm --prefix $W/ui run typecheck` thoát 0.

### Task 3.6 — Menu tại điểm bấm

- **Mục tiêu:** thay `public/context-menu.js` bằng `DropdownMenu` neo tại toạ độ bấm.
- **File:** `ui/src/shell/PointMenu.tsx`.
- **Các bước:**
  1. `openPointMenu(x, y, items)`, với `items: [{ label, run, disabled? }]`. Hàm render một `DropdownMenu` có `open` điều khiển, và một trigger vô hình đặt `position: fixed` tại `(x, y)`.
  2. Mỗi lúc chỉ có một menu. Menu đóng khi bấm ra ngoài, khi bấm Escape, hoặc sau khi chạy một mục. Phím ↑/↓/Enter do Radix lo. Phím bấm trong menu không được lọt ra timeline: `onKeyDown` gọi `stopPropagation`.
- **Verify:** test của task 3.8 (mở menu, chạy mục, menu đóng) xanh.

### Task 3.7 — Sân khấu đen, transport, ảnh poster

- **Mục tiêu:** player chạy như cũ trên nền đen. Khi chưa có composition thì hiện khung hình của bản render mới nhất.
- **File:** `ui/src/shell/Stage.tsx`, `ui/src/core/player.ts`, `ui/src/core/dom.ts`.
- **Các bước:**
  1. Port `public/player.js` sang `core/player.ts` và giữ logic: iframe, `__playerReady`, `__player`, timeout 15 giây với câu "Không nạp được player", mute/solo. Chép hàm `h` của `public/dom.js` vào `core/dom.ts`.
  2. Thay vì tự ghi vào `playBtn`/`timeEl`, hàm port nhận `{ onTime(t), onState(playing), onTiming() }`. `onTiming` gọi `bus.emit("timing")`. Ghi chú thay đổi này ở comment đầu file.
  3. `Stage.tsx`:
     - nền `bg-stage`;
     - khung iframe giữ tỉ lệ `m.width:m.height`, căn giữa, viền đen;
     - transport nằm dưới khung, căn giữa: nút về đầu (`SkipBack`), phát/dừng (`Play`/`Pause`, nút tròn nền `text`), tới cuối (`SkipForward`), và đồng hồ `0:00.0 / 0:00.0` định dạng theo `fmt`;
     - đồng hồ cập nhật qua `useStudio.subscribe`, ghi thẳng vào `ref.current.textContent`, không qua state React;
     - mute/solo đọc từ `store.audio`;
     - gán `actions.transport = { play, pause, toggle, seek, step, time, duration }`.
  4. Ảnh poster:
     - hiện khi player chưa có composition (chưa chọn dự án, đang nạp, nạp lỗi, dự án chưa nhập, chưa có provider) và `useTimelineMedia(name).data.render` có giá trị;
     - ảnh là `<img>` lấy từ `thumbAt("/p/<tên>/<render.path>", render.mtime, t)`, với `t` là playhead (mặc định 0), kèm nhãn nhỏ `từ bản render <giờ>`;
     - không có bản render thì để nền đen với một dòng chữ: chữ của `player.clear(…)` cũ, hoặc `Chọn một dự án`.
- **Đạt khi:** trên 4410, dự án `thuy-mau-demo` chiếu được, và trước khi player sẵn sàng thì thấy ảnh poster lấy từ `demo/animatic.mp4`.
- **Verify:** ở task 3.10.

### Task 3.8 — Cột phải, các host, khung timeline, test component

- **File:** `RightColumn.tsx`, `InspectorHost.tsx`, `ui/src/timeline/index.tsx`, `ui/src/shell/*.test.tsx`, `ui/src/App.test.tsx`.
- **Các bước:**
  1. `RightColumn.tsx` dùng shadcn `Tabs` với hai tab `director` ("Đạo diễn") và `shot` ("Shot"), điều khiển bằng `store.rightTab`.
     - Tab Đạo diễn có chấm `bg-warn` khi `useRequests` có ít nhất một mục `status === "waiting_user"` (cùng điều kiện với `panels.js:520`). Chấm có `aria-label="Có thẻ đang chờ bạn"`.
     - Nội dung tab Đạo diễn là `SectionHost hostId="director"` trong `div data-slot="right.director"`.
     - Nội dung tab Shot là `InspectorHost` trong `div data-slot="right.shot"`.
     - Có nút thu gọn cột (`PanelRightClose`).
  2. `InspectorHost` lấy `pick` từ store và `m` từ `useProject`. Nó render các `useInspectorSections(pick.kind)` theo `order`, mỗi phần trong một `ErrorBoundary`. Không có `pick` thì hiện `Empty` với chữ `Chọn một khối trên timeline`.
  3. `ui/src/timeline/index.tsx`: `export function TimelineArea()` trả một `div` có `data-testid="timeline-area"` và một thanh trống cao 36 px. Phase 4a thay toàn bộ nội dung, nhưng giữ tên export và `data-testid`.
  4. Test (vitest và Testing Library), mỗi test một file `*.test.tsx` đặt cạnh component:
     - `App`: có đủ tám phần tử `data-slot` theo `SLOTS`. Test mở `ExportDialog` và `AgentDialog` để thấy hai khe `export` và `agent`;
     - `Rail`: đăng ký 7 tab giả đúng nhóm. Thứ tự `aria-label` khớp bảng ở task 3.4, có 2 đường kẻ giữa các nhóm, Tooltip có `(Alt+1)`, và `fireEvent.keyDown(window, { code: "Digit2", altKey: true })` chọn tab thứ hai;
     - `?tab=ai` (đặt bằng `window.history.replaceState` trước khi render) cho `rightTab = "director"`;
     - `ExportMenu`: mở menu thấy đúng ba mục, đúng chữ như trên;
     - `RightColumn`: khi `requests` có mục `waiting_user` thì có phần tử `aria-label="Có thẻ đang chờ bạn"`, khi không có thì không;
     - `VersionSelect`: đổi lựa chọn thì toast được gọi với đúng chữ;
     - `Banner`: ba trạng thái hiện đúng chữ;
     - `PointMenu`: mở menu, bấm một mục thì `run` được gọi đúng một lần và menu đóng;
     - `AgentDialog`: hai `registerAgentRows` giả hiện đúng thứ tự đăng ký.
- **Đạt khi:** mọi test vitest xanh.
- **Verify:** `cd $W/ui && npx vitest run` thoát 0, có `passed` và không có `failed`.

### Task 3.9 — Bản đồ sở hữu và script kiểm

- **Mục tiêu:** mỗi nhánh vùng tự kiểm được bằng một lệnh rằng mình chỉ sửa file của mình.
- **File:** `ui/ownership.json`, `ui/scripts/check-ownership.mjs`, `ui/scripts/check-ownership.test.mjs`.
- **Các bước:**
  1. `ownership.json` có đúng nội dung ở mục "Bản đồ sở hữu".
  2. `check-ownership.mjs <area> [--base <ref>]`:
     - đọc `ui/ownership.json` theo đường dẫn tính từ vị trí file script, không theo cwd;
     - danh sách file đã đổi là hợp của `git diff --name-only <base>...HEAD` và `git status --porcelain --untracked-files=all` (bỏ cột trạng thái đầu dòng);
     - `<base>` mặc định lấy từ trường `base`;
     - glob được đổi sang regex bằng một hàm nhỏ trong chính file, không dùng thư viện: `**` khớp mọi thứ, `*` khớp trong một đoạn đường dẫn, `{area}` thay bằng tên vùng;
     - mỗi file không khớp glob của vùng (tính cả `every_area`) được in thành `NGOÀI VÙNG <file>`;
     - có ít nhất một file ngoài vùng thì thoát 1. Nếu không, in `ok <area> <n> file` và thoát 0;
     - `<area>` không có trong bản đồ thì in `vùng lạ: <area>` và thoát 2.
  3. `check-ownership.test.mjs` chạy bằng `node --test` và không cần git:
     - script export `matches(glob, path)` và `overlaps(map)` để test gọi;
     - `matches("ui/src/ext/fx/**", "ui/src/ext/fx/a/b.tsx")` là `true`; với `"ui/src/ext/fxx/a.ts"` là `false`;
     - `overlaps(<bản đồ thật>)` trả mảng rỗng, tức là không có glob nào của một vùng khớp đường dẫn mẫu của vùng khác. Đường dẫn mẫu lấy từ glob, thay `**` bằng `x/y.tsx`.
  4. Test này chạy bằng `node --test` trực tiếp, vì `ui/package.json` không thuộc phase này. Phase 5 đưa nó vào `npm test`.
- **Verify:**
  - `cd $W && node --test ui/scripts/check-ownership.test.mjs 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`.
  - `cd $W && node ui/scripts/check-ownership.mjs nope; echo "exit $?"` in dòng cuối là `exit 2`.

### Task 3.10 — Thử trên 4410

- **Các bước:**
  1. `npm --prefix $W/ui run build`.
  2. Nếu `/tmp/ms-react-root-4410` chưa có thì tạo bằng `node $W/ui/scripts/make-test-root.mjs /tmp/ms-react-root-4410`.
  3. Background-run `node $W/ui/scripts/smoke-server.mjs $W 4410 /tmp/ms-react-root-4410` và ghi lại PID.
  4. Chụp `http://127.0.0.1:4410/?name=thuy-mau-demo` bằng `shoot.mjs`, với file view tạm `/tmp/ms-react-views-shell.json` gồm một view `shell` có `ready: "[data-testid=timeline-area]"`. Lưu ảnh vào `/Volumes/2/Edit-Video/plans/reports/react-ui-rewrite/shell/`.
  5. Đối chiếu ảnh 1440 với mockup: thanh trên, rail (ở phase này còn trống), sân khấu đen, cột phải hai tab, vùng timeline dưới cùng. Ghi một dòng nhận xét vào `reports/parity-3.md`.
  6. Thử tay trên 4410:
     - chọn dự án;
     - tạo dự án `ms-react-shell-test` bằng nút "Dự án mới". Nút này chạy `/tmp/ms-react-root-4410/scripts/new-project.sh`, nên dự án mới nằm trong `/tmp`;
     - bấm chip agent thì hộp thoại mở (thân còn trống, đúng với phase này);
     - hoàn tác và làm lại trên `thuy-mau-demo`;
     - mở `abm-intro` thấy banner chỉ xem; mở `viet-pro-intro` thấy banner nhập.
  7. Ghi `reports/parity-3.md`: mỗi dòng nhóm `3` trong `parity-checklist.md` có một dòng `| <ID> | có / không | <ghi chú> |`. Không sửa `parity-checklist.md`; phase 5 chép kết quả sang cột "Mới".
- **Verify:**
  - `curl -s http://127.0.0.1:4410/ | grep -c 'content="smoke-4410"'` in `1`.
  - Lệnh `shoot.mjs` in `ok 2` và thoát 0.
  - `cd $W/plans/261023-1018-react-ui-rewrite && awk -F'|' '$10 ~ /^ *3 *$/ {gsub(/ /,"",$2); print $2}' parity-checklist.md | while read id; do grep -qE "^\| $id \| có " reports/parity-3.md || echo "CHƯA $id"; done` không in gì.
  - Dừng server bằng `kill <PID>`; sau đó `lsof -nP -iTCP:4410 -sTCP:LISTEN | wc -l` in `0`.

### Task 3.11 — Kiểm luật hợp đồng

- **Mục tiêu:** trước khi đóng băng, chứng minh vỏ tự tuân theo các luật mà vùng sẽ phải theo.
- **Verify:**
  - `cd $W/ui/src && grep -rnE "fetch\(|new EventSource" --include='*.ts' --include='*.tsx' . | grep -vE '^./(api/|core/waveform.ts)' | wc -l` in `0`.
  - `cd $W/ui/src && grep -rn "import.meta.glob" . | wc -l` in `2`, là hai glob trong `ext/load.ts`.
  - `cd $W/ui && npx vitest run src/styles` thoát 0: luật token vẫn đạt khi đã có vỏ.

### Task 3.12 — Commit và đóng băng

1. `feat(ui): data layer, studio store and actions over the existing api`
2. `feat(ui): component registry with auto-discovered panels and extensions`
3. `feat(ui): app shell with top bar, grouped icon rail, resizable panels, black stage and right column`
4. `chore(ui): file ownership map and checker for parallel UI work`

Sau cùng:

- `git -C $W push`;
- `git -C $W tag ui-contracts-v1 && git -C $W push origin ui-contracts-v1`;
- báo orchestrator: "hợp đồng đã đóng băng ở `ui-contracts-v1`, tỏa 4a đến 4h được".

**Verify:**

- `cd $W && npm test 2>&1 | grep -E "^ℹ fail"` in `ℹ fail 0`, và phần vitest không có `failed`.
- `git -C $W status --porcelain | wc -l` in `0`.
- `git -C $W ls-remote --tags origin ui-contracts-v1 | wc -l` in `1`.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Hợp đồng thiếu một trường hay một route, làm vùng bị chặn | Vừa | Cao | Task 3.1 kiểm đủ 66 route; store lấy đủ trường từ `ctx.state`; có luật xin đổi hợp đồng qua orchestrator, gom nhiều yêu cầu vào một commit |
| Sót chữ toast hay luồng của `app.js` khi port | Vừa | Vừa | Verify của task 3.2 so từng chuỗi toast; checklist nhóm `3` |
| Playhead làm cả cây render lại | Vừa | Cao | `t` chỉ đọc qua `subscribe`; đồng hồ ghi bằng ref |
| Radix Dialog hay Menu cướp phím tắt của timeline | Vừa | Vừa | Phím tắt toàn cục bỏ qua khi có `[role=dialog]` đang mở (4a làm, như `dialog[open]` của bản cũ); `PointMenu` chặn lan phím |
| Hai vùng cùng sửa một file | Thấp | Cao | `ownership.json` không có glob trùng (có test); mỗi PR vùng chạy `check-ownership.mjs` |

## Hoàn tác

Chạy `git -C $W revert` các commit của phase và xoá tag `ui-contracts-v1` (`git push origin :refs/tags/ui-contracts-v1`). Không có dữ liệu nào bị đổi. Nếu các vùng đã tỏa ra thì phải dừng chúng trước khi hoàn tác.

## Dừng và hỏi người dùng

Dừng và hỏi người dùng (không gọi kongming) khi:

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
