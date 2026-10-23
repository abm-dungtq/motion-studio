# Báo cáo phase 1: seam mở rộng và registry agent CLI

- **PR:** https://github.com/abm-dungtq/motion-studio/pull/2 (chưa merge)
- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/seams-agent-registry`, nhánh `feat/seams-agent-registry`, tách từ main. Tên này theo lệnh của orchestrator, không theo `agent-registry` ghi trong phase file.
- **Kết quả test:** `npm test` đạt 141, lỗi 0. Baseline sau bước 0 là 112, nên nhánh thêm 29 test.
- **Thay đổi:** 42 file, thêm 2794 dòng, bớt 43 dòng, 14 commit.

## Đã làm

1. Bước 0: `tests/provider.test.mjs` nhận lệnh `{ file, args }` của STUDIO_API 4, baseline về 112/112.
2. Bước 0b: `/api/directions` trả id chuyển cảnh (`seams`, `seam_items`) thay vì chỉ số mảng, và lọc `seam_classes.banned`.
3. Route module: `routes/*.mjs` và `lib/routes.mjs`. Route mở rộng chạy sau route có sẵn, ngay trước 404.
4. Extension giao diện: `public/ext.js` cùng các hook trong panels, inspector, agent, timeline và icons.
5. Biên nhận và kiểm chất lượng: `lib/receipts.mjs`, `lib/quality.mjs`, `lib/quality/basic.mjs`.
6. Registry agent CLI: `lib/agents/` (run, redact, index, cli/*), `routes/agents.mjs`, và trường `agents` trong `/api/agent`.
7. Tool registry: `lib/tools.mjs` và `lib/tools/agents.mjs`.
8. Lệnh provider mới: `timing`, `beatGrid`, `wordSync`, `sfxSync`, `cut`, `reframe`, `qc`.
9. Popover chip agent: `public/ext-agents.js`.
10. Docs: `docs/extensions.md`, `docs/agents.md`, mục README "Tính năng mở rộng" và hai dòng env.
11. Smoke test trên cổng 4401, ảnh chụp, và hai lượt thử thật (1 ảnh, 1 lượt đọc ảnh).

## Seam API cho các phase sau

Đọc `docs/extensions.md` trước. Mỗi mục dưới đây có ví dụ chạy được trong file đó.

### Route: `routes/<tên>.mjs`

```js
export const ROUTES = [{ method: "GET" | "POST", path: "/api/…", prefix?: false, provider?: true, handler: async (c) => … }];
```

- `c = { req, res, url, q(k), body, send(status, body, headers?), projectDir(name), withManifest(name), root, token, P, why, startJob, runtimeFor }`.
- `projectDir` và `withManifest` trả `{ dir }` hoặc `{ status, error }`.
- Trả một giá trị thì Studio gửi 200 JSON. Ném lỗi có `.status` thì Studio trả status đó.
- Đường trùng route có sẵn (`BUILTIN` trong `server.mjs`) hoặc trùng route mở rộng khác thì `createServer` ném lỗi "trùng".
- `lib/routes.mjs` export `loadRoutes(dir)`, `checkRoutes(routes, builtin)`, `findRoute(routes, method, p)`, `PUBLIC_FILE`, `DEFAULT_DIR`.
- Trong test: `createServer({ root, token, routes })`. Tuỳ chọn `routes` thay cho `routesDir` mà phase file dự kiến.

### Giao diện: `public/ext-<tên>.js` và `public/ext-<tên>.css`

`export function register(studio)` nhận `studio = { ctx, h, toast, addTab, addSection, addInspectorSection, addAgentRows, addTimelineDecorator, icon }`:

- `addTab({ id, label, lead, icon, view(helpers), badge() })`. Helpers là `{ h, empty, needManifest, loading, fail, select, render }`.
- `addSection(tabId, { id, order, view(helpers) })`.
- `addInspectorSection({ kinds: ["shot" | "line" | "music" | "event"], view(pick, m) })`.
- `addAgentRows(fn(data, { reload, h }) → Node[], { width })`.
- `addTimelineDecorator(fn(m, state) → [{ t, until?, lane: "shot" | "voice" | "music" | "sfx", label, kind }])`. Dấu chỉ để xem.
- `icon(name, shapes)`: `shapes` là chuỗi path hoặc mảng `[tag, attrs]`.
- `MEDIA_DRAG = "text/x-ms-media"` (`public/panels.js`), dữ liệu JSON `{ rel, kind, path }`.
- `h()` của `/dom.js` nhận `style` là **object**, không nhận chuỗi CSS.

`GET /api/extensions` trả `{ scripts, styles }`. Tên file phải khớp `^ext-[a-z-]+\.(js|css)$`.

### Tool: `lib/tools/<tên>.mjs`

```js
export const TOOLS = [{ name, title, description, inputSchema, mutates, provider, run(args, env) }];
```

- `env = { root, P, projectDir(name), studio }`.
- `lib/tools.mjs` export `loadTools(dir)`, `checkArgs(schema, args)`, `callTool(name, args, env, { dir })` → `{ ok, result | error }`, `studioClient({ state, fetchFn })` (get/post; 503 khi Studio chưa chạy), `insideProject(dir, rel, what, { mustExist })`, `toolEnv({ root, P, studio })`, `TOOL_NAME`, `DEFAULT_DIR`.
- Tool có sẵn: `agents_list`, `image_generate` (POST `/api/agents/image` rồi chờ dòng `RESULT` của job), `image_describe`.
- Chưa có server MCP hay director nào gọi `callTool`. Phase 5 nối phần đó.

### Kiểm chất lượng: `lib/quality/<tên>.mjs`

```js
export const CHECKS = [{ id, applies(file, kind), run(file, kind) → { pass, detail } }];
```

`kind` là `image`, `video`, `audio` hoặc `other`. Kiểm có sẵn: `exists-nonempty`, `probe-readable`. `lib/quality.mjs` export `loadChecks(dir)`, `runChecks(outputs, { dir })`, `kindOf(file)`.

### Biên nhận: `lib/receipts.mjs`

- `writeReceipt(dir, { op, actor, inputs, outputs: [đường tuyệt đối], params, tool, started, ended, checksDir })` ghi `<dir>/.opus/receipts/<yyyymmdd>/<op>-<id>.json` và trả `{ file, id, pass, checks, outputs: [{ path, size, sha256 }] }`.
- `op` khớp `^[a-z][a-z0-9-]{1,40}$`.
- Module còn export `listReceipts(dir, { op, limit })` (mới nhất trước), `sha256File`, `receiptsDir`.

### Agent: `lib/agents/index.mjs`

- `generateImage({ prompt, refs, edit, out, size, project, agent, actor, timeout, env })` → `{ ok, file, agent, receipt, tried }`. Không ghi đè file có sẵn, thêm `-2`, `-3` vào tên.
- `describeImages({ images, prompt, schema, agent, timeout, env })` → `{ ok, json, text, agent, tried }`.
- `complete({ prompt, schema, agent, timeout, env })` → `{ ok, text, json, agent, tried }`.
- `listAgents({ refresh, env })` → `{ agents, order, at }`, cache 60 giây.
- Các export khác: `peekAgents`, `summarize`, `dropCache`, `pick(cap, agents, order)`, `orderOf(env)`, `probe(id, cap)`, `probeDir`, `readVerified`, `effectiveCaps`, `CAPS`, `DEFAULT_ORDER`, `QUOTA_RE`, `REFUSE_RE`, `RESULT_PREFIX = "RESULT "`.
- HTTP: `GET /api/agents` (`?refresh=1`), `POST /api/agents/refresh`, `POST /api/agents/probe {id, cap}` (job `agent-probe`, chủ job tên `"(agents)"`), `POST /api/agents/image {name, prompt, out, refs?, edit?, size?, agent?, actor?}` (job `image` của dự án, dòng cuối `RESULT <json>`).
- Dòng lệnh: `node lib/agents/index.mjs probe <id> <cap>` và `node lib/agents/index.mjs generate <json>`.
- Thứ tự thử đặt trong `studio.json` ở khoá `agents.order[cap]`. Studio đọc lại ở mỗi lượt gọi.
- Adapter mới đặt ở `lib/agents/cli/<tên>.mjs` (xem `docs/agents.md`).

### Provider và đường dẫn

- `P.commands.{render, mix, pitch, import, demo, recipe, preflight, cases, styles, timing, beatGrid, wordSync, sfxSync, cut, reframe, qc}` là đường `.mjs` tuyệt đối, chạy bằng `process.execPath`.
- `choose` có thể là `{ file, args }`. API 3 dùng tên file dự phòng; `COMMANDS` của plugin vẫn được ưu tiên khi plugin khai báo.
- `lib/config.mjs`: `hfSkills()` (`MOTION_STUDIO_HF_SKILLS`, mặc định `~/.claude/skills`, chỉ đọc), `agentsFile()`, `agentPath()` (`MOTION_STUDIO_AGENT_PATH`). `SETTINGS` có thêm `"agents"`.

## Kết quả quét CLI trên máy (chỉ trạng thái)

| CLI | Phiên bản | Đăng nhập | Chữ / Đọc ảnh / Sinh ảnh |
|---|---|---|---|
| claude | 2.1.304 | có | có / có / không |
| agy | 1.4.5 | có (13 model) | có / **có ✓** (đã thử) / chưa rõ |
| codex-pool | codex-cli 0.163.0 | có (2 tài khoản) | có / có / **có ✓** (đã thử) |
| codex | codex-cli 0.163.0 | có (ChatGPT) | có / có / có |
| opencode | v2.0.32 | có | có / chưa rõ / không |
| gemini, cursor-agent | không có trên máy | | |

- **Chỉ dò:** goose 1.45.0, devin 3000.10.27, grok 1.0.67, pi 1.0.0, omp 18.12.6, openclaw 2026.9.2. cx-image-generate thấy nhưng không chạy. hermes có shim hỏng (exit 126) nên hiện "lỗi".
- **Quota codex-pool lúc nghiệm thu:** acct1 5h 38% · tuần 12%, acct2 5h 2% · tuần 0%, kế tiếp acct2.
- **Thứ tự mặc định:** sinh ảnh codex-pool → codex → agy → gemini. Đọc ảnh agy → codex-pool → claude → gemini. Chữ agy → codex-pool → claude → opencode. Nay agy đã được xác minh đọc ảnh, nên luồng đọc ảnh thật đi agy trước.
- **Grep bí mật** trên output `/api/agents` (sk-, eyJ, ya29., gh*_, Bearer, email, *_token, api_key): 0 dòng.

## Nghiệm thu

| Tiêu chí | Kết quả |
|---|---|
| `/api/agents` trên 4401 có đủ 5 CLI với đúng phiên bản; `quota.accounts` dài 2; gemini và cursor-agent `found: false` | Đạt |
| Grep bí mật ra 0 dòng | Đạt |
| Popover hiện bảng agent, có ảnh chụp | Đạt: `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-agent-registry-shots/` gồm `01-agent-popover.png`, `02-probe-running.png`, `03-probe-done.png` |
| "Thử khả năng → Sinh ảnh" với codex-pool ra PNG và biên nhận | Đạt: PNG 256×256, 56 KB, 45 giây. Biên nhận `image-generate-mvkbqq0g-a221bb.json`, `exists-nonempty` và `probe-readable` đều đạt |
| `docs/extensions.md` có ví dụ chạy được | Đạt: ví dụ route (GET 200, POST 200 khi có provider, 503 khi không), tool và kiểm đã chạy thử. Ví dụ giao diện dùng đúng API mà `ext-agents.js` đang chạy trong trình duyệt |
| Server 4401 đã dừng, 4317 giữ nguyên PID | Đạt: `lsof -i :4401` rỗng, 4317 vẫn PID 63883 |

Quota đã tiêu: 1 ảnh (codex-pool), 1 lượt đọc ảnh (agy), 1 lượt chữ ngắn (agy, để biết dạng JSON trả về). Tất cả trong hạn mức 3 ảnh và 2 lượt đọc ảnh.

## Lệch so với phase file

- Thêm route `POST /api/agents/image` và lệnh `generate` để tool `image_generate` chạy thành job thấy được trong Studio.
- Thêm lệnh `{ file, args }` cho `choose` vào contract comment của `lib/provider.mjs`.
- Phát hiện và sửa một lỗi có từ trước: `public/ext.js` gọi `ctx.toast` nhưng `ctx` không có hàm này. Nay `ext.js` import `toast` từ `/dom.js`, và `studio` có thêm `h` và `toast`.
- Popover dùng style inline vì `app.css` thuộc phase 3. Popover cao khoảng 670 px ở viewport 1440×900. Màn hình thấp có thể cần `max-height` và cuộn trong `app.css` (phase 3).
- codex chạy không có `--output-schema` vì codex đòi schema chặt. Schema được đưa vào prompt, rồi `firstJson` đọc câu trả lời.

## Dọn dẹp

- Server 4401 (PID 15950) và phiên trình duyệt `ms-smoke-1` đã tắt.
- Đã xoá `/tmp/ms-docs-check`. Script `/tmp/ms-smoke-1.mjs` vẫn còn ở `/tmp`, nằm ngoài repo.
- Dự án thử `/Volumes/2/Edit-Video/ms-smoke-1` vẫn còn. Xoá cần người dùng đồng ý.
- Ảnh thử và biên nhận nằm trong `~/.cache/motion-studio/agent-probe/`. Kết quả thử nằm trong `~/.config/motion-studio/agents.json`.

Status: DONE_WITH_CONCERNS
Summary: Seam route, giao diện, tool, kiểm chất lượng, biên nhận và lệnh provider đã xong. Registry agent CLI có bảng trong popover và nút thử thật. npm test đạt 141/0 và PR #2 đã mở, chưa merge.
Concerns/Blockers: Popover chưa có max-height (cần CSS ở phase 3). Dự án thử ms-smoke-1 chờ người dùng đồng ý mới xoá. gemini, opencode và cursor-agent chưa kiểm khi chạy thật, chỉ có test với CLI giả.
