# Phase 1: seam mở rộng và registry agent CLI

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/agent-registry`
- **Nhánh:** `feat/agent-registry`
- **Cổng server thử:** 4401
- **Trạng thái:** xong, chờ duyệt PR [#2](https://github.com/abm-dungtq/motion-studio/pull/2). Thực tế làm ở worktree `seams-agent-registry`, nhánh `feat/seams-agent-registry`. Báo cáo: [reports/phase-01-report.md](reports/phase-01-report.md)
- **Effort:** 10h
- **Ưu tiên:** P1, nền móng; người dùng nhấn mạnh phase này.
- **Phụ thuộc:** không có. Mọi phase khác phụ thuộc vào phase này.

## Mục tiêu

1. Sửa baseline về 112/112.
2. Dựng các seam để phase 2–7 chỉ thêm file mới:
   - route;
   - UI: tab, mục trong tab, inspector, popover agent, trang trí timeline;
   - tool;
   - biên nhận và kiểm chất lượng;
   - lệnh provider.
3. Dựng registry agent CLI:
   - quét CLI trên máy;
   - đọc phiên bản, trạng thái đăng nhập (không lộ token), khả năng (chữ, đọc ảnh, sinh ảnh) và quota;
   - có router `generateImage()`, `describeImages()` và `complete()` với fallback.
4. Hiện registry trong popover của chip agent.

## Hiện trạng đã kiểm (2026-10-23)

**Test baseline trượt.** `tests/provider.test.mjs:27` lặp qua `p.commands` và đòi giá trị khớp `/^\/.+\.mjs$/`. Plugin 2.5.0 trả `commands.choose = { file, args }`; adapter trải `...api.COMMANDS` vào (`lib/providers/opus-video.mjs`, cuối `create()`). `gates.mjs:21-24` đã xử lý dạng này.

**Route.** `server.mjs:263` là `route()`. Route được rẽ nhánh bằng chuỗi `if (p === …)`. Có 404 ở cuối nhánh GET (`server.mjs:369`) và cuối nhánh POST (`server.mjs:488`). Danh sách route chạy khi không có provider là `FREE` (`server.mjs:63`), dùng ở `server.mjs:269`.

**File tĩnh.** `server.mjs:275` chỉ phục vụ file phẳng `/^\/[a-z-]+\.(js|css)$/` trong `public/`. File UI mới phải đặt tên phẳng, kebab-case.

**UI.**
- Tab cố định ở `public/panels.js:10` (`TABS`, 6 tab). `public/panels.js:507` vẽ `views[tab]()`. Phím Alt+1…6 ở `public/panels.js:549` (`/^Digit([1-6])$/`).
- `public/icons.js:20` có `icon(name)`.
- `public/inspector.js:14` có `mountInspector`.
- `public/timeline.js:259` có `render()`.
- `public/app.js:194-198` gắn timeline, inspector, panels và agent.

**Agent.**
- `agent.mjs` chỉ biết `claude` (`--version`, `auth status` → `Boolean(loggedIn)`), cache 30 s, cùng ffprobe và ffmpeg.
- `GET /api/agent` ở `server.mjs:303`. Popover vẽ ở `public/agent.js`.

**Cài đặt.** `lib/config.mjs:17` có `SETTINGS = ["director", "root"]`. `settingsOf` chỉ giữ các khoá này, nên cài đặt agent phải thêm `"agents"` vào đây.

**CLI trên máy hôm nay.** Đã chạy `--version`, chỉ đọc phiên bản:

| CLI | Đường | Phiên bản | Ghi chú |
|---|---|---|---|
| `claude` | `~/.local/bin/claude` | 2.1.304 | `claude auth status` cho JSON có `loggedIn` |
| `codex` | `~/.local/bin/codex` | codex-cli 0.163.0 | `codex login status` in "Logged in using ChatGPT" |
| `codex-pool` | `~/.local/bin/codex-pool` | script Python | xem dòng dưới |
| `agy` | `~/.local/bin/agy` | 1.4.5 | Mach-O, Antigravity CLI. Có `-p`, `--output-format json/stream-json`, `--json-schema`, `--add-dir`, `--model`, `models` (liệt kê được model nghĩa là đã đăng nhập). Không có lệnh `auth`. Thư mục `~/.gemini/antigravity-cli` |
| `opencode` | `~/.opencode/bin/opencode` | v2.0.32 | `opencode auth list` liệt kê provider đã lưu |
| `goose` | `~/.local/bin/goose` | 1.45.0 | |
| `devin` | `~/.local/bin/devin` | 3000.10.27 | |
| `grok` | `~/.local/bin/grok` | 1.0.67 | |
| `pi` | `~/.local/bin/pi` | 1.0.0 | |
| `omp` | `~/.local/bin/omp` | 18.12.6 | |
| `openclaw` | `~/.local/bin/openclaw` | 2026.9.2 | |
| `hermes` | `~/.local/bin/hermes` | | shim hỏng: đích không tồn tại. Phải hiện là "lỗi", không làm sập quét |
| `gemini`, `cursor-agent` | | | không có trên PATH. Adapter vẫn phải có, báo "không thấy" |
| `cx-image-generate` | `~/.local/bin/cx-image-generate` | | script zsh gọi API ảnh, khoá lấy từ Keychain. Chỉ phát hiện; **không** đọc `~/.config/cx-image/config.json` |

`codex-pool`:
- Lệnh: `status`, `exec`, `use acct1|acct2|auto`, `setup-acct2`.
- Output của `status` có dạng `acctN: OK   ok; 5h 38% (reset 22/10 20:47); week 12% (reset 29/10 10:36)` và `pin=auto -> next: acct2`.
- `exec` tự đổi tài khoản khi gặp lỗi quota và thử lại một lần.

## Sở hữu file

**Tạo mới:**
- `lib/routes.mjs`
- `routes/agents.mjs`, `routes/extensions.mjs`
- `lib/tools.mjs`, `lib/tools/agents.mjs`
- `lib/receipts.mjs`, `lib/quality.mjs`, `lib/quality/basic.mjs`
- `lib/agents/index.mjs`, `lib/agents/run.mjs`, `lib/agents/redact.mjs`
- Mỗi CLI một adapter, đặt trong `lib/agents/cli/`: `claude.mjs`, `codex.mjs`, `codex-pool.mjs`, `agy.mjs`, `gemini.mjs`, `opencode.mjs`, `cursor-agent.mjs`, và `detect-only.mjs` (goose, devin, grok, pi, omp, openclaw, hermes, cx-image-generate)
- `public/ext.js`, `public/ext-agents.js`
- `docs/extensions.md`, `docs/agents.md`
- Test: `tests/agents-registry.test.mjs`, `tests/agents-router.test.mjs`, `tests/routes-seam.test.mjs`, `tests/ui-extensions.test.mjs`, `tests/receipts.test.mjs`, `tests/fake-cli.mjs` (helper tạo CLI giả trên PATH)

**Sửa:**
- `server.mjs`: nạp route mở rộng, `FREE` theo route.
- `agent.mjs`: thêm `agents` vào `agentStatus`.
- `lib/config.mjs`: thêm `"agents"` vào `SETTINGS`; thêm `hfSkills()`.
- `lib/provider.mjs`: chỉ sửa comment contract `commands`.
- `lib/providers/opus-video.mjs`: thêm lệnh.
- `public/app.js`, `public/panels.js`, `public/inspector.js`, `public/timeline.js`, `public/agent.js`, `public/icons.js`, `public/index.html` (nếu cần chỗ gắn).
- `tests/provider.test.mjs` (sửa baseline).
- `README.md`: mục "Tính năng mở rộng" trỏ tới `docs/`, cùng bảng env mới.

**Không đụng:** `director.mjs`, `bundle.mjs`, `media.mjs`, `jobs.mjs`, `gates.mjs`, `create.mjs`, plugin.

## Luồng dữ liệu

```text
Trình duyệt: chip agent / tab mở rộng
   │ GET /api/agents, /api/agent, /api/extensions
   ▼
server.mjs route() ── chưa khớp route có sẵn ──► lib/routes.mjs (routes/*.mjs)
   │                                                │
   │                                                ▼
   │                         lib/agents/index.mjs: listAgents() (cache 60 s; bấm Làm mới thì bỏ cache)
   │                           ├─ cli/*.mjs: detect() → { found, path, version, error }
   │                           ├─ auth()   → { logged_in: true | false | null, method }   (không có chuỗi bí mật)
   │                           ├─ quota()  → { accounts: [...], next } (codex-pool) | null
   │                           └─ caps     → { text, vision, image: "yes" | "no" | "unknown" }
   │
   └─ phase sau: generateImage / describeImages / complete
        → chọn agent theo studio.json agents.order[cap]; bỏ agent không có, chưa đăng nhập hoặc hết quota
        → lib/agents/run.mjs spawn (không shell, có timeout, nhóm process riêng)
        → lỗi quota (QUOTA_RE) thì sang agent kế; từ chối hoặc lỗi nội dung thì dừng, báo lý do
        → output ảnh: tìm PNG mới trong thư mục tạm → chuyển tới `out` → writeReceipt()
```

## Thiết kế seam

### 1. Route (`lib/routes.mjs`)

- `loadRoutes(dir = new URL("../routes/", import.meta.url))` nạp mọi `*.mjs` theo thứ tự tên, giống `lib/provider.mjs:35`.
- Mỗi module: `export const ROUTES = [{ method: "GET" | "POST", path: "/api/agents", prefix?: false, provider?: true, handler: async (c) => … }]`.
- `c = { req, res, url, q, body, send, projectDir, withManifest, root, token, P, why, startJob, runtimeFor }`. Các helper này đã có sẵn trong closure của `createServer`; truyền xuống, không viết lại.
- Trong `server.mjs`:
  - `createServer({ …, routesDir })`: test truyền thư mục riêng.
  - Route mở rộng được tra **sau** route có sẵn, ngay trước hai dòng 404 (`server.mjs:369`, `:488`). Route có sẵn không bị đè được.
  - Lúc nạp: một path mở rộng trùng path có sẵn, hoặc trùng path mở rộng khác, thì ném lỗi. Danh sách path có sẵn để trong một mảng `BUILTIN` mới, và có test chứng minh mảng này khớp các `if (p === …)` thật.
  - `provider: false` thay cho việc thêm vào `FREE`. Dòng `server.mjs:269` hỏi thêm `extFree(p)`.
  - Kiểm token POST (`server.mjs:267`) vẫn chạy trước mọi thứ.

### 2. UI (`public/ext.js` + `GET /api/extensions`)

- `routes/extensions.mjs` trả `{ scripts: ["/ext-agents.js", …], styles: ["/ext-anime.css", …] }`. Đó là các file `public/ext-*.js` / `ext-*.css` khớp regex `server.mjs:275`.
- `public/ext.js` có `loadExtensions(studio)`:
  - gắn `<link>` cho file css;
  - `await import()` từng file js, gọi `mod.register(studio)`;
  - một extension lỗi thì `toast` báo tên file, các extension khác vẫn chạy.
- `studio` được tạo trong `public/app.js`:

| Hàm | Cài ở | Việc |
|---|---|---|
| `ctx` | `app.js` | `api`, `send`, `patch`, `direct`, `on`, `emit`, `state`, `transport`, `editable` |
| `addTab({ id, label, lead, icon, view, badge })` | `panels.js` | Nối vào sau 6 tab có sẵn. Alt+1…9 (sửa regex `panels.js:549` thành `[1-9]`). `view(helpers)` nhận `{ h, empty, needManifest, loading, fail, select }` |
| `addSection(tabId, { id, order, view })` | `panels.js` | Nối vào cuối `views[tabId]()` (`panels.js:507`) |
| `addInspectorSection({ kinds: ["shot", "line", "music", "event"], view(pick, m) })` | `inspector.js` | Nối vào cuối khung inspector đang hiện |
| `addAgentRows(fn(data) → Node[])` | `agent.js` | Thêm dòng vào popover |
| `addTimelineDecorator(fn(m, state) → [{ t, until?, lane: "shot" \| "voice" \| "music" \| "sfx", label, kind }])` | `timeline.js` | Vẽ nhãn hoặc dải trên làn, chỉ để xem. Phase 3 phải giữ API này |
| `icon(name, svg?)` | `icons.js` | Nhận thêm SVG của extension; tên lạ thì dùng icon mặc định |

- Thứ tự gắn: `mountPanels`, `mountInspector`, `mountTimeline` và `mountAgent` chạy xong rồi mới `loadExtensions`. Tab mở rộng mà `?tab=` hay localStorage đã chọn sẵn được chọn lại sau khi nạp xong.

### 3. Tool (`lib/tools.mjs`)

- `loadTools(dir = lib/tools/)`. Mỗi module `export const TOOLS = [{ name, title, description, inputSchema, mutates, provider, run(args, env) }]`.
  - `name` khớp `^[a-z][a-z0-9_]{2,40}$` và không trùng.
  - `inputSchema` là JSON Schema dạng object.
  - `env = { root, P, projectDir(name), studio }`.
  - `studio` là client gọi API của Studio đang chạy: `studio.get(path)` và `studio.post(path, body)`.
    - Đọc `url` và `token` từ file trạng thái (`lib/config.mjs readState`, đã có `token` từ `bin/motion-studio.mjs:77`).
    - Tool cần job dài (render bundle, sinh ảnh) phải đi qua đây, để job hiện trong UI và tuân luật "một job mỗi loại mỗi dự án" của `jobs.mjs`. Việc này đúng dù tool chạy trong server hay trong process MCP của phase 5.
    - Studio chưa chạy thì trả lỗi rõ ràng "Studio chưa chạy".
- `callTool(name, args, env)`:
  - kiểm `required` và kiểu cơ bản (`string`, `number`, `boolean`, `array`, `object`);
  - không thêm thư viện validator, chỉ chừng đó là đủ;
  - trả `{ ok, result | error }`.
- Phase 1 có `lib/tools/agents.mjs` với 3 tool: `agents_list`, `image_generate`, `image_describe`. Phase 5 dựng MCP server phục vụ toàn bộ registry này.

### 4. Biên nhận và kiểm (`lib/receipts.mjs`, `lib/quality.mjs`)

- `writeReceipt(dir, { op, actor, inputs, outputs, params, tool, started, ended })`:
  - băm sha256 từng output (đọc stream);
  - gọi `runChecks(outputs)`;
  - ghi nguyên tử vào `<dir>/.opus/receipts/<yyyymmdd>/<op>-<id>.json`;
  - trả biên nhận.
- `.opus/` đã bị gitignore, và được phục vụ qua `/p/` (`server.mjs projectFile`).
- `runChecks` nạp `lib/quality/*.mjs`. Mỗi module `export const CHECKS = [{ id, applies(file, kind), run(file) → { pass, detail } }]`.
- Phase 1 có `lib/quality/basic.mjs` với 2 kiểm: `exists-nonempty` và `probe-readable` (dùng `probe` của `media.mjs`, chỉ import).
- `listReceipts(dir, { op?, limit })` cho UI và tool.

### 5. Lệnh provider (`lib/providers/opus-video.mjs`)

- Thêm vào `commands` với đường dự phòng của API 3: `timing` (timing.mjs), `beatGrid` (beat-grid.mjs), `wordSync` (word-sync.mjs), `sfxSync` (sfx-sync.mjs), `cut` (cut.mjs), `reframe` (reframe.mjs), `qc` (qc-mp4.mjs).
- Cả 7 script đã có trong `~/.claude/skills/opus-video/scripts/` (đã `ls`).
- `...api.COMMANDS` vẫn trải sau cùng, như hiện nay.
- Cập nhật comment contract ở `lib/provider.mjs`, dòng `commands:`.

### 6. Đường skill HyperFrames (`lib/config.mjs`)

`hfSkills()` đọc `MOTION_STUDIO_HF_SKILLS`, mặc định `~/.claude/skills`. Phase 6 đọc catalog chuyển cảnh ở `<hfSkills>/hyperframes-animation/transitions/`, còn phase 7 đọc ASR ở `<hfSkills>/media-use/scripts/transcribe.mjs`. Tên "hyperframes" không bị test chặn.

## Thiết kế registry agent CLI

**Adapter** (`lib/agents/cli/<id>.mjs`):

```js
export default {
  id, label, bins: ["codex"],
  caps: { text: "yes", vision: "yes", image: "yes" },
  detect(io), auth(io), quota?(io),
  run: { text?, vision?, image? },
}
```

- `run.*(io, req)` trả `{ ok, files?, text?, json?, error, quota?: true, refused?: true }`.

**Spawn** (`lib/agents/run.mjs`):
- `exec(cmd, args, { stdin, cwd, timeout, env })`: không shell, nhóm process riêng, `SIGTERM` rồi `SIGKILL`.
- Tìm binary trên `PATH` cộng `~/.local/bin`, `~/.opencode/bin`, `/opt/homebrew/bin`, vì Studio chạy từ launchd có thể thiếu PATH (giống `agent.mjs:17`).

**Che bí mật** (`lib/agents/redact.mjs`): `redact(text)` thay các mẫu sau bằng `<đã che>`:
- `sk-…`
- `eyJ…` (JWT)
- `ya29.…`
- `gh[pousr]_…`
- `Bearer …`
- chuỗi hex hoặc base64 từ 32 ký tự trở lên đứng sau `token|key|secret|auth`

Mọi output CLI đi vào log job, receipt hay API đều qua `redact()`.

**Trạng thái đăng nhập** (không đọc file bí mật, chỉ kiểm có hay không):

| CLI | Cách | Ra |
|---|---|---|
| claude | `claude auth status` (JSON) | `Boolean(loggedIn)`, như `agent.mjs` |
| codex | `codex login status` | `/logged in/i` → `true`, cách đăng nhập (`ChatGPT` hoặc `API key`) |
| codex-pool | `codex-pool status` | mỗi tài khoản: `{ name, state: "OK" \| …, h5, week, reset_h5, reset_week }`, `pin`, `next` |
| agy | `agy models` (timeout 20 s, cache 5 phút) | exit 0 và có ≥1 model → `true`; danh sách model giữ để hiện |
| opencode | `opencode auth list` | số provider "stored" (chỉ đếm dòng, không giữ nội dung) |
| gemini | có `~/.gemini/oauth_creds.json` hoặc env `GEMINI_API_KEY` khác rỗng | `true` hoặc `null`, không đọc nội dung |
| cursor-agent | `cursor-agent status` [UNVERIFIED: máy không có binary] | `/logged in/i` |
| detect-only | chỉ `--version` | `null` |

**Khả năng và cách chạy:**

| CLI | text | vision | image | Cách chạy (đã kiểm hay chưa) |
|---|---|---|---|---|
| claude | yes | yes (tool Read đọc ảnh) | no | `claude -p <prompt> --output-format json --allowedTools Read` trong thư mục chứa ảnh |
| codex / codex-pool | yes | yes (`-i`) | yes (tool image_generation) | `codex-pool exec --skip-git-repo-check -C <tmp> -i <ref>… -`, prompt qua **stdin**. Handoff, quyết định 3: có `-i` mà prompt ở đối số thì Codex hiểu prompt là đường ảnh. Ảnh ra là PNG mới trong `<tmp>` |
| agy | yes | unknown → probe | unknown → probe | `agy -p <prompt> --output-format json --add-dir <tmp> [--json-schema <file>] [--model <id>]`. Khả năng ảnh của agy [UNVERIFIED]; nút "Thử khả năng" trong popover tự kiểm và ghi kết quả |
| gemini | yes | yes | unknown | [UNVERIFIED: không có binary trên máy] |
| opencode | yes | unknown | no | `opencode run <prompt>` [UNVERIFIED cú pháp; kiểm bằng `opencode --help` ở bước 3] |
| cursor-agent | yes | unknown | no | [UNVERIFIED] |

**Router** (`lib/agents/index.mjs`):
- `order = readState().agents?.order ?? DEFAULT_ORDER`:
  - `image: ["codex-pool", "codex", "agy", "gemini"]`
  - `vision: ["agy", "codex-pool", "claude", "gemini"]`
  - `text: ["agy", "codex-pool", "claude", "opencode"]`
- `codex-pool` có thì `codex` thường bị bỏ qua, để không dùng tài khoản ngoài cơ chế cân quota.
- Agent bị bỏ khi: không thấy, `logged_in === false`, `caps[cap] === "no"`, hoặc mọi tài khoản `codex-pool` không OK.
- `"unknown"` được thử sau mọi agent `"yes"`.
- `QUOTA_RE = /out of credits|usage limit|rate limit|quota exceeded|429/i` → sang agent kế. Agent từ chối (refused) thì dừng và trả lý do, không chuyển sang agent khác.
- Một semaphore cho mỗi agent: không hai lệnh sinh ảnh cùng lúc trên một agent.
- `generateImage({ prompt, refs = [], edit = false, out, size? })`: tạo thư mục tạm riêng (`mkdtemp`), chép `refs` vào, chạy, lấy PNG mới nhất, chuyển tới `out` (không ghi đè: thêm `-2`, `-3` như `media.mjs copyFree`), rồi `writeReceipt`.
- `describeImages({ images, prompt, schema })`: trả JSON đã parse. agy dùng `--json-schema`. CLI khác thì nhắc trong prompt "chỉ trả JSON" rồi parse khối JSON đầu tiên.
- Kết quả "Thử khả năng" lưu ở `~/.config/motion-studio/agents.json` (chmod 600): `{ <id>: { vision: { ok, at }, image: { ok, at } } }`.

**API:**
- `GET /api/agents` (không cần provider) → `{ agents: [{ id, label, found, path, version, logged_in, method, caps, verified, quota, error }], order, at }`.
- `POST /api/agents/refresh` → bỏ cache, quét lại.
- `POST /api/agents/probe { id, cap }` → job `agent-probe`. Sinh một ảnh 256 px hoặc đọc một ảnh màu đặc sinh bằng ffmpeg. **Tốn quota**, nên chỉ chạy khi người dùng bấm.
- `GET /api/agent` (`server.mjs:303`) thêm `agents` (bản rút gọn từ cache), để chip đổi chấm và nhãn mà không cần gọi thêm.

**UI** (`public/ext-agents.js`, dùng `addAgentRows`):
- Bảng trong popover: CLI · phiên bản · đăng nhập · chữ/đọc ảnh/sinh ảnh (có / không / chưa rõ) · quota.
- `codex-pool` hiện `acct1 5h 38% · tuần 12%`, `acct2 …`, `kế tiếp: acct2`.
- Nút "Làm mới" và "Thử khả năng".
- Nhãn chip: `Claude Code 2.1.304 · 5 agent`.
- Không lộ email, tên tổ chức hay token.

## Các bước

0. **Baseline.** Sửa `tests/provider.test.mjs:27`: chuỗi thì phải là đường `.mjs` tuyệt đối; object thì phải có `file` là đường `.mjs` tuyệt đối và `args` là mảng chuỗi. Chạy `npm test` → `ℹ pass 112`, `ℹ fail 0`. Commit `test(provider): accept STUDIO_API 4 command objects`.
0b. **Sửa lỗi danh sách chuyển cảnh.**
   - `server.mjs:339` trả `seams: Object.keys(d.seams ?? {})`. Nhưng `d.seams` của provider là **mảng** object `{ id, kind, … }` (33 mục trong `data/directions.json`).
   - Vì vậy `GET /api/directions` đang trả `["0", "1", …, "32"]` (đã kiểm trên server 4317 đang chạy), và ô chọn chuyển cảnh trong inspector (`public/inspector.js:16`, `:37`) hiện số thứ tự thay vì tên.
   - Sửa: trả `seams: d.seams.map((s) => s.id)` và thêm `seam_items: d.seams.map(({ id, kind }) => ({ id, kind }))`. Giữ cả trường hợp provider cũ trả object (`Array.isArray` thì map, không thì `Object.keys`).
   - Bỏ mọi id thuộc `seam_classes.banned`.
   - Test trong `tests/routes-seam.test.mjs`: `/api/directions` với fakePlugin có `DIRECTIONS_FILE` mẫu trả đúng id.
   - Commit `fix(server): list transition ids, not array indexes`.
1. `lib/routes.mjs` + sửa `server.mjs` (mảng `BUILTIN`, `routesDir`, `extFree`, tra route trước 404). Test `tests/routes-seam.test.mjs`.
2. `routes/extensions.mjs`, `public/ext.js`, seam trong `app.js`, `panels.js`, `inspector.js`, `timeline.js`, `agent.js` và `icons.js`. Thêm vào đó: mỗi mục trong danh sách footage của tab "Footage & chất liệu" (`panels.js`) có `draggable` với `dataTransfer` kiểu `text/x-ms-media` = `{ rel, kind, path }`. Phase 3 (thả vào làn B-roll) và phase 7 (gợi ý B-roll) dùng chung định dạng này. Thêm một extension thử trong thư mục tạm, qua `createServer({ publicDir })` nếu cần, hoặc kiểm bằng hàm thuần. Test `tests/ui-extensions.test.mjs`.
3. `lib/agents/run.mjs`, `redact.mjs`, các adapter `cli/*.mjs`. Trước khi viết từng adapter, chạy `<cli> --help` (và `codex exec --help`, `opencode run --help`) để chốt cú pháp. Chỉ ghi cú pháp vào comment, không ghi gì của output auth.
4. `lib/agents/index.mjs`: `listAgents`, router, semaphore, `generateImage`, `describeImages`, `complete`.
5. `routes/agents.mjs`, sửa `agent.mjs`, `lib/config.mjs` (`SETTINGS` thêm `"agents"`, `hfSkills`).
6. `lib/tools.mjs` + `lib/tools/agents.mjs`. `lib/receipts.mjs` + `lib/quality.mjs` + `lib/quality/basic.mjs`.
7. Lệnh provider mới trong adapter và comment contract.
8. `public/ext-agents.js` (popover).
9. Docs: `docs/extensions.md` (cách thêm route, extension UI, tool, kiểm; ví dụ tối thiểu), `docs/agents.md`. README thêm mục "Tính năng mở rộng" và dòng `MOTION_STUDIO_HF_SKILLS` trong bảng env.
10. Thử thật trên cổng 4401 bằng `/tmp/ms-smoke-1.mjs` (mục "Cách chạy server thử" trong `plan.md`). `bin/motion-studio.mjs:33` ghim cổng 4317, nên không dùng `bin`, và server 4317 không được bị dừng. Mở popover, chụp ảnh, bấm "Thử khả năng" sinh ảnh với `codex-pool` một lần, rồi dừng server.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0` và `ℹ pass` ≥ 112 + số test mới (ghi số cụ thể trong PR).
- `tests/agents-registry.test.mjs`:
  - CLI giả trên `PATH` (`tests/fake-cli.mjs` tạo `claude`, `codex`, `codex-pool` và `agy` là script `#!/bin/sh` in output mẫu) → `listAgents()` ra đúng `found`, `version`, `logged_in`;
  - `codex-pool status` mẫu (hai dạng `OK` và `EXHAUSTED`) → `quota.accounts` đúng phần trăm;
  - binary hỏng (shim trỏ file không tồn tại, như `hermes`) → `found: true, error` khác rỗng, các CLI khác vẫn đủ;
  - CLI treo quá timeout thì bị giết, `error: "timeout"`;
  - output auth giả có chuỗi `sk-…`/JWT → kết quả API không chứa chuỗi đó.
- `tests/agents-router.test.mjs`:
  - thứ tự ưu tiên;
  - bỏ agent chưa đăng nhập;
  - lỗi quota sang agent kế;
  - từ chối thì dừng;
  - `generateImage` với `codex-pool` giả (ghi `out.png` vào cwd) chuyển file đến `out`, không ghi đè file có sẵn (ra `-2`), và có receipt trong `.opus/receipts/`;
  - prompt đi qua stdin khi có `refs`, khẳng định bằng file log mà CLI giả ghi.
- `tests/routes-seam.test.mjs`:
  - route mở rộng trả 200;
  - path trùng route có sẵn thì `createServer` ném lỗi;
  - `provider: false` vẫn chạy khi `OPUS_VIDEO_HOME=/nonexistent`;
  - POST không token → 403;
  - mảng `BUILTIN` khớp mọi `p === "…"` trong `server.mjs` (test đọc file nguồn).
- `tests/ui-extensions.test.mjs`: `GET /api/extensions` chỉ liệt kê `ext-*.js` khớp regex phục vụ file; file sai tên không có trong danh sách.
- `tests/receipts.test.mjs`: sha256 đúng, kiểm `exists-nonempty` trượt với file 0 byte, ghi nguyên tử (không để lại `.tmp`).
- `tests/provider.test.mjs`: xanh với plugin thật 2.5.0 và với `fakePlugin` API 3 (lệnh mới có đường dự phòng).

## Tiêu chí nghiệm thu

- `GET http://127.0.0.1:4401/api/agents` trên máy này có `claude`, `codex`, `codex-pool`, `agy`, `opencode` với `found: true` và đúng phiên bản trong bảng hiện trạng. `codex-pool` có `quota.accounts` dài 2. `gemini` và `cursor-agent` có `found: false`.
- Grep output API: `curl -s :4401/api/agents | grep -Eo 'sk-[A-Za-z0-9]{8}|eyJ[A-Za-z0-9_-]{10}|@[a-z0-9.-]+\.[a-z]{2,}'` ra 0 dòng.
- Popover chip hiện bảng agent. Ảnh chụp lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-agent-registry-shots/`.
- Một lần "Thử khả năng → sinh ảnh" với `codex-pool` ra PNG và receipt (tốn 1 ảnh quota; xem câu hỏi 2 trong `plan.md`).
- `docs/extensions.md` có ví dụ chạy được cho mỗi seam. Phase 2–7 chỉ cần đọc file này để cắm vào.
- Server 4401 đã dừng (`lsof -i :4401` rỗng). Server 4317 vẫn chạy, pid không đổi.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Seam UI làm vỡ phím tắt, tab hay redraw có sẵn | Vừa | Cao | Giữ nguyên 6 tab đầu và id của chúng; `addTab` chỉ nối thêm; chạy lại `tests/timeline-edit.test.mjs` và `gate-cards.test.mjs`; thử trình duyệt Alt+1…6 |
| Output CLI làm lộ email hoặc token | Thấp | Cao | `redact()` + chỉ giữ boolean và số; test chặn mẫu |
| `agy models` chậm hoặc cần mạng | Vừa | Thấp | timeout 20 s, cache 5 phút, quá hạn thì `logged_in: null` |
| Cú pháp CLI đổi giữa các bản | Vừa | Vừa | Adapter ghi phiên bản đã kiểm; lệnh lỗi → `caps` về `"unknown"` cùng thông báo |
| `codex exec` lưu ảnh ở chỗ khác thư mục `-C` | Vừa | Vừa | Bước 10 kiểm thật. Không thấy PNG trong `<tmp>` thì tìm theo câu trả lời cuối (đường file) trong output, rồi theo đường dẫn mà prompt dặn |
| Route mở rộng đè route có sẵn | Thấp | Cao | Tra sau route có sẵn + ném lỗi khi trùng + test |

## Hoàn tác

`git revert -m 1 <merge>`. Không có migration dữ liệu: `agents.json` và `.opus/receipts/` xoá được.

## PR upstream

Không cần. Mọi script mới mà adapter gọi đều đã có trong plugin 2.5.0.

## PR

Tiêu đề: `feat: extension seams and agent CLI registry`.

Commit gợi ý:
1. `test(provider): accept STUDIO_API 4 command objects`
2. `fix(server): list transition ids, not array indexes`
3. `feat(server): route modules under routes/`
4. `feat(ui): extension loader with tab, section, inspector and timeline hooks`
5. `feat(agents): detect coding CLIs, login state and quota`
6. `feat(agents): route image, vision and text work with fallback`
7. `feat(tools): tool registry, receipts and quality checks`
8. `feat(provider): timing, beat grid, sync, cut, reframe and qc commands`
9. `docs: extensions and agents`

Thân PR: tóm tắt, cách thử, `ℹ pass N`, ảnh chụp. Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt ở trên trượt, hoặc gặp việc ngoài sở hữu file của phase này: **dừng**, không tự ứng biến, không chạy lại mò. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- file liên quan, ghi `file:line`.

Áp dụng lời khuyên rồi chạy lại đúng bước Verify đó. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
