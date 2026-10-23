# Phase 4: Tool `style_suggest`, route `/api/suggest` và đường chọn qua `choose`

- **Nhánh:** chạy song song với phase 3 thì dùng worktree `/Volumes/2/Motion-Studio/.claude/worktrees/suggest-route` (gọi tắt `$W`), nhánh `feat/jev-style-suggest-route`, cắt từ `feat/jev-style-suggest` sau phase 2. Chạy tuần tự thì `$W=/Volumes/2/Motion-Studio`, bỏ task 4.0 và bước gộp ở task 4.7.
- **Phụ thuộc:** phase 2.
- **Song song:** với phase 3 và 7.
- **Effort:** 4h.

## Mục tiêu

- Đạo diễn và client MCP ngoài gọi được tool `style_suggest`.
- UI đọc và chạy gợi ý qua `GET /api/suggest` và `POST /api/suggest`.
- Bấm chọn đi qua `POST /api/suggest/choose`, với ba kết cục `chosen`, `not_in_pitch`, `queued`. `BRIEF.md` chỉ được ghi bởi lệnh `choose` của provider.
- Mỗi lần chọn trả 200, route nối một dòng vào log lựa chọn thật `<dự án>/.opus/suggest/picks.jsonl` (hình dòng ở phase 2). Log này là đầu vào của quyết định sau 30 lượt (phase 3, phase 8).
- Có sẵn đường nâng cấp khi plugin phát hành hai tính năng ở phase 7. Route phát hiện tính năng qua provider: có thì dùng, không có thì giữ hành vi hiện tại.
- Không route có sẵn nào đổi.

## Hiện trạng đã kiểm

- `lib/tools.mjs:1-13`: mỗi `lib/tools/*.mjs` export `TOOLS = [{ name, title, description, inputSchema, mutates, provider, run(args, env) }]`; `env = { root, P, projectDir(name), studio }` (`:119-128`). `mcp/studio-mcp.mjs:61-83` phục vụ mọi tool. Profile `director` chỉ bỏ tool trùng tên với MCP của provider (`:32-37`).
- `lib/routes.mjs:4-14`: mỗi `routes/*.mjs` export `ROUTES = [{ method, path, handler(c) }]`; `c = { req, res, url, q, body, send, projectDir, withManifest, root, token, P, why, startJob, runtimeFor }`. `projectDir(name)` trả `{ dir }` hoặc `{ error, status }` (`server.mjs:167-180`). Handler trả giá trị thì server gửi 200 JSON; lỗi có `.status` thì gửi status đó.
- `gates.mjs:21-25` `chooseArgv(commands, dir, pick)`; `:28-31` `writeDirection(dir, pick, { run })`; `:65-88` `answerCard(dir, { id, value }, { run })`. Test cũ ở `tests/studio-gates.test.mjs:72-160` phải giữ nguyên và xanh.
- `server.mjs:477-485` (`/api/director/answer`) gọi `pump` sau khi trả lời 200. Route mới cũng phải khởi động đạo diễn khi rảnh.
- `routes/lemo.mjs:105-112` có hàm cục bộ `direct(c, name, dir, …)` (enqueue rồi `pump` khi runner là `cli` và đạo diễn rảnh), dùng ở `:180`, `:188`, `:194`, `:292`. Phase này chuyển hàm đó sang `director.mjs` để hai route dùng chung (DRY).
- `director.mjs:28` import `startJob, running` từ `./jobs.mjs`; `:25` import `runnerSetting`; `:171` `export function pump(p, name, dir)`; `:31` `KIND = "director"`.
- `lib/config.mjs:20` `SETTINGS = ["director", "root", "agents", "quality", "broll"]`; `:39-41` `readState`.
- Gateway nhận actor `human` cho sửa của người dùng (`server.mjs:436`). Op ghi `workflow_mode` chưa có (`P.suggest.canSetWorkflowMode === false`). Lệnh tạo pitch từ hướng đã chọn cũng chưa có (`P.suggest.pitchInit === null`). Cả hai khoá do phase 1 khai, tự đổi khi plugin có tính năng.
- Mẫu test route với plugin giả: `tests/lemo-routes.test.mjs:16-60` (`fakePlugin`, thay stub `load` và `enqueue` trong `studio-api.mjs`, `createServer({ root, token, runtime: null })`, `studio.json` với `director.runner = "mcp"` để không sinh tiến trình đạo diễn).

## Sở hữu file

- Tạo: `lib/tools/suggest.mjs`, `routes/suggest.mjs`, `tests/suggest-routes.test.mjs`.
- Sửa: `gates.mjs`, `director.mjs`, `routes/lemo.mjs` (chỉ thay `direct` bằng hàm dùng chung), `lib/config.mjs`, `tests/studio-gates.test.mjs` (thêm một test, không sửa test cũ).
- Không sửa `lib/suggest.mjs` (phase 3 sở hữu hai hằng của nó), `server.mjs`, `ui/**`.

## Hợp đồng HTTP (phase 5 dựa vào, giữ đúng tên)

```text
GET  /api/suggest?name=<dự án>
  200 { record: Record | null, picks: [{ n, id, style_profile, dir }] | null,
        source: "deterministic"|"observe"|"jev", source_setting: string | null,
        modes: [{ id, label }], can_save_mode: boolean, can_init_pitch: boolean }
POST /api/suggest { name, refresh?: boolean }
  200 cùng dạng GET (record vừa tính hoặc lấy từ cache) · 409 { error } khi thiếu BRIEF.md
POST /api/suggest/choose { name, direction, style?, mode? }
  200 { outcome: "chosen", direction, pick, style, answered: <id thẻ> | null, next: <id> | null, initialized: boolean, mode: Mode }
  200 { outcome: "not_in_pitch", picks, mode: Mode }
  200 { outcome: "queued", request, runner, job, mode: Mode }
  400 { error } đối số sai · 409 { error } chưa có project.json khi cần giao việc · 422 { error, stderr } choose lỗi
Mode = { saved: boolean, reason: string | null }
```

## Đường nâng cấp khi plugin có tính năng mới (phát hiện, không giả định)

| Tính năng plugin (PR ở phase 7) | Khoá provider (phase 1) | Có thì | Không có thì (hành vi hiện tại) |
|---|---|---|---|
| `make-pitch init --directions`, khai là `COMMANDS.pitchInit` | `P.suggest.pitchInit` khác `null` | Chưa có pitch: chạy `pitchInit` với hướng đã chọn đứng đầu, rồi `choose --pick 1`. Kết cục `chosen`, `initialized: true` | Kết cục `queued`: nhờ đạo diễn tạo pitch |
| Op gateway `set_workflow_mode`, có trong `OPS` | `P.suggest.canSetWorkflowMode === true` | `P.gateway.patch` với actor `human`, `mode.saved: true` | `mode.saved: false` kèm câu lý do; chế độ đi trong lời yêu cầu |

Studio không đọc số phiên bản plugin để quyết định; chỉ nhìn sự có mặt của khoá. Cả hai nhánh đều có test ở task 4.6.

## Các task

### Task 4.0 — Worktree (chỉ khi chạy song song với phase 3)

- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/suggest-route -b feat/jev-style-suggest-route feat/jev-style-suggest`
  2. `npm --prefix /Volumes/2/Motion-Studio/.claude/worktrees/suggest-route/ui ci --no-audit --no-fund`
- **Verify:** `git -C /Volumes/2/Motion-Studio/.claude/worktrees/suggest-route branch --show-current` in `feat/jev-style-suggest-route`.

### Task 4.1 — Thiết lập `suggest` trong `studio.json`

- **Goal:** `suggest.source` sống qua stop/start và đọc được.
- **Target files:** `$W/lib/config.mjs`, dòng 17-20 và một export mới.
- **Steps:**
  1. Thêm `"suggest"` vào cuối mảng `SETTINGS`. Thêm vào comment phía trên một câu: "suggest: { source: deterministic | observe | jev } picks where style_suggest takes its ranking (lib/suggest.mjs)".
  2. Thêm `export const suggestSetting = (file = stateFile()) => readState(file)?.suggest?.source ?? null;` ngay sau `runnerSetting`.
- **Verify:** `cd $W && node --test tests/config.test.mjs tests/broll-cache.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4.2 — Hàm giao việc dùng chung trong `director.mjs`

- **Goal:** một chỗ duy nhất xếp yêu cầu và khởi động đạo diễn.
- **Target files:** `$W/director.mjs` (thêm sau `pump`, khoảng dòng 182), `$W/routes/lemo.mjs:105-112`.
- **Steps:**
  1. Thêm vào `director.mjs`:
     ```js
     // Starts the director for the project when the runner is cli and no director job runs; else null.
     export function startIdle(p, name, dir) {
       return runnerSetting() === "mcp" || running(name, KIND) ? null : pump(p, name, dir);
     }

     // Queues a director request and starts the director when it is idle: { request, runner, job }.
     export function queueRequest(p, name, dir, { scope = "project", target = null, text }) {
       let request;
       try { request = p.requests.enqueue(dir, { scope, target, t: null, base: p.manifest.load(dir)?.version, text }); }
       catch (e) { throw Object.assign(new Error(e.message), { status: 400 }); }
       return { request, runner: runnerSetting(), job: startIdle(p, name, dir) };
     }
     ```
  2. Trong `routes/lemo.mjs`, xoá thân hàm `direct` (dòng 105-112) và thay bằng:
     `const direct = (c, name, dir, opts) => queueRequest(c.P, name, dir, opts);`
     Thêm `queueRequest` vào dòng import từ `../director.mjs` (dòng 29).
  3. Chạy `command grep -nE "\b(pump|runnerSetting|running|DIRECTOR)\b" $W/routes/lemo.mjs`. Tên nào chỉ còn xuất hiện trong dòng import thì bỏ tên đó khỏi import. Tên nào còn dùng ở chỗ khác thì giữ.
- **Success criteria:** hành vi lemo không đổi.
- **Verify:** `cd $W && node --test tests/lemo-routes.test.mjs tests/lemo-requests.test.mjs tests/director.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4.3 — Đối số style cho `choose`

- **Goal:** `chooseArgv`, `writeDirection`, `answerCard` nhận đối số thêm, mặc định giữ hành vi cũ.
- **Target files:** `$W/gates.mjs:18-31` và `:65-77`; `$W/tests/studio-gates.test.mjs` (thêm test ở cuối file).
- **Steps:**
  1. `export function chooseArgv(commands, dir, pick, extra = [])`: cả hai nhánh trả về mảng cũ nối thêm `...extra`. Comment trên hàm thêm: "extra (the provider's suggest.styleArgs with {style} filled in) goes after the declared or default arguments."
  2. `export async function writeDirection(dir, pick, { run = runFile, extra = [] } = {})`: truyền `extra` cho `chooseArgv`.
  3. `export async function answerCard(dir, { id, value }, { run = runFile, extra = [] } = {})`: truyền `{ run, extra }` cho `writeDirection` ở dòng 76; dòng 77 (thông báo lỗi) gọi `chooseArgv(p.commands, dir, v.pick, extra)`.
  4. Thêm test `"chooseArgv appends extra arguments after the declared and the default form"`:
     - `chooseArgv({ pitch: "/p/m.mjs" }, "/w/d", 2, ["--style-profile", "s1"])` bằng `["/p/m.mjs","choose","--project","/w/d","--pick","2","--accept-warnings","--style-profile","s1"]`;
     - với `choose: { file: "/p/c.mjs", args: ["x","{project}","{pick}"] }` thì kết quả bằng `["/p/c.mjs","x","/w/d","2","--style-profile","s1"]`;
     - không truyền `extra` thì bằng đúng kết quả cũ.
- **Verify:** `cd $W && node --test tests/studio-gates.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4.4 — `routes/suggest.mjs`

- **Goal:** ba route theo hợp đồng HTTP ở trên.
- **Target files:** `$W/routes/suggest.mjs` (mới).
- **Steps:**
  1. Comment đầu file: ba route; ba kết cục của choose; `BRIEF.md` chỉ do lệnh `choose` của provider ghi; chế độ vận hành ghi qua gateway với actor `human` khi provider có op, không thì đi trong lời yêu cầu.
  2. Import `existsSync`, `readFileSync` và `join`; `suggestCached`, `readRecord`, `effectiveSource`, `frontmatterOf`, `pickEntry`, `appendPick` từ `../lib/suggest.mjs`; `runFile` từ `../create.mjs`; `suggestSetting` từ `../lib/config.mjs`; `answerCard`, `writeDirection` từ `../gates.mjs`; `queueRequest`, `startIdle` từ `../director.mjs`.
  3. `const err = (status, msg) => Object.assign(new Error(msg), { status });`. Hàm `dirOf(c, name)`: `pd = c.projectDir(name)`, có `pd.error` thì throw `err(pd.status, pd.error)`.
  4. `view(P, dir)` trả object như hợp đồng GET:
     - `modes` = `Object.entries(P.suggest?.modes ?? {}).map(([id, m]) => ({ id, label: m.label }))`;
     - `can_save_mode` = `Boolean(P.suggest?.canSetWorkflowMode)`;
     - `can_init_pitch` = `Boolean(P.suggest?.pitchInit)`.
  5. `GET /api/suggest`: `view(c.P, dirOf(c, c.q("name")))`.
  6. `POST /api/suggest`:
     - thiếu `BRIEF.md` thì `err(409, "Dự án chưa có BRIEF.md nên chưa gợi ý được.")`;
     - `rec = await suggestCached({ dir, project: b.name, P: c.P, refresh: b.refresh === true, source: effectiveSource(suggestSetting()) })`;
     - `console.log` đúng một dòng `` `${new Date().toISOString()} suggest ${b.name} ${rec.source} ${rec.shown} ${rec.error?.code ?? "ok"} ${rec.ms}ms ${rec.questions}q` ``;
     - trả `view`.
  7. `saveMode(P, dir, mode)`:
     - không `mode` thì `{ saved: false, reason: null }`;
     - `!P.suggest?.canSetWorkflowMode` thì `{ saved: false, reason: "Chế độ vận hành chưa lưu vào project.json vì provider chưa có lệnh ghi trường này. Đạo diễn vẫn nhận chế độ trong lời yêu cầu." }`;
     - thiếu `project.json` thì `{ saved: false, reason: "Dự án chưa có project.json nên chưa lưu được chế độ vận hành." }`;
     - còn lại: `r = P.gateway.patch(dir, { actor: "human", base: P.manifest.load(dir).version, ops: [P.suggest.workflowModeOp(mode)], lockWaitMs: 300 })`. Có `r.code` thì `{ saved: false, reason: r.error }`, không thì `{ saved: true, reason: null }`.
  8. `POST /api/suggest/choose`:
     1. Kiểm đối số:
        - `direction` khớp `^[A-Z][0-9]{1,2}$`, sai thì `err(400, "Hướng không hợp lệ.")`;
        - `style` nếu có khớp `^[a-z0-9][a-z0-9-]{1,60}$`, sai thì `err(400, "Style không hợp lệ.")`;
        - `mode` nếu có là khoá của `P.suggest.modes`, sai thì `err(400, "Chế độ vận hành không hợp lệ.")`.
     2. `dir = dirOf(c, b.name)`, `picks = c.P.suggest.readPicks(dir)`, `mode = saveMode(c.P, dir, b.mode)`.
     3. **Chưa có pitch, plugin có `pitchInit`** (`picks === null && c.P.suggest.pitchInit`):
        - `fm = frontmatterOf(readFileSync(join(dir, "BRIEF.md"), "utf8"))`. Thiếu `fm.topic` thì bỏ qua nhánh này và đi bước 3b;
        - `rec = readRecord(dir)`; `side = rec ? (rec.shown === "jev" ? rec.jev : rec.det) : null`; `ids = [b.direction, ...(side?.directions ?? []).map((x) => x.id).filter((id) => id !== b.direction)].slice(0, 3)`;
        - `vars = { project: dir, topic: fm.topic, aspect: fm.aspect || "16:9", category: fm.category || "", energy: fm.energy || "", directions: ids.join(",") }`; `argv = [pitchInit.file, ...pitchInit.args.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)))]`;
        - `r = await runFile(process.execPath, argv, { cwd: dir, timeout: 120000 })`. `r.code !== 0` thì `c.send(422, { error: `Lệnh tạo pitch lỗi (exit ${r.code})`, stderr: <20 dòng cuối> })` rồi return;
        - đọc lại `picks = c.P.suggest.readPicks(dir)`, rồi đi tiếp bước 4 như khi đã có pitch, đánh dấu `initialized = true`. Hướng đã chọn đứng đầu nên thường là `n: 1`.
     3b. **Chưa có pitch, plugin chưa có `pitchInit`** (`picks === null`):
        - thiếu `project.json` thì `err(409, "Dự án chưa có project.json nên chưa giao việc cho đạo diễn được. Nhập dự án vào Studio trước.")`;
        - `text` = `` `Tạo pitch cho dự án này, rồi hỏi thẻ chọn hướng như thường lệ. Người dùng nghiêng về hướng ${b.direction}${b.style ? ` với style ${b.style}` : ""}${b.mode ? `, chế độ vận hành ${b.mode}` : ""}, chọn từ thẻ gợi ý. Không tự chọn thay người dùng.` ``;
        - trả `{ outcome: "queued", ...queueRequest(c.P, b.name, dir, { scope: "project", text }), mode }`.
     4. `row = picks.find((r) => r.id === b.direction)`. Không có thì trả `{ outcome: "not_in_pitch", picks, mode }`.
     5. `extra = b.style ? c.P.suggest.styleArgs.map((a) => a.replaceAll("{style}", b.style)) : []`.
     6. Tìm thẻ hướng đang chờ: `waiting` = `(c.P.requests.list(dir) ?? []).find((r) => r.status === "waiting_user" && r.ask?.gate === "direction" && r.ask?.kind === "choice" && (r.ask.options ?? []).some((o) => o.id === String(row.n)))`.
     7. Có `waiting`:
        - `r = await answerCard(dir, { id: waiting.id, value: String(row.n) }, { extra })`;
        - `r.status !== 200` thì `c.send(r.status, r.body)` rồi return;
        - không thì `startIdle(c.P, b.name, dir)`, trả `{ outcome: "chosen", direction: b.direction, pick: row.n, style: b.style ?? row.style_profile, answered: waiting.id, next: r.body.next, initialized, mode }`.
     8. Không có `waiting`:
        - `r = await writeDirection(dir, row.n, { extra })`;
        - `r.code !== 0` thì `c.send(422, { error: `Lệnh chọn hướng lỗi (exit ${r.code})`, stderr: String(r.stderr || r.stdout).trimEnd().split("\n").slice(-20).join("\n") })`;
        - không thì trả `{ outcome: "chosen", direction: b.direction, pick: row.n, style: b.style ?? row.style_profile, answered: null, next: null, initialized, mode }`.
     9. Trước mọi lần trả 200 (cả ba kết cục): `rec = readRecord(dir)`; có `rec` thì `appendPick(dir, pickEntry({ record: rec, project: b.name, chosen: { direction: b.direction, style: b.style ?? null, mode: b.mode ?? null }, outcome }))`. Lỗi khi ghi log chỉ `console.error` một dòng, không đổi câu trả lời. Không có `rec` (người dùng chọn khi chưa từng gợi ý) thì không ghi, vì dòng log cần cả hai bảng xếp hạng.
     10. `console.log` một dòng `` `${new Date().toISOString()} suggest-choose ${b.name} ${b.direction} ${outcome}` `` trước khi trả.
     Biến `initialized` khởi tạo `false` ở đầu handler.
- **Success criteria:** server nạp route không lỗi trùng path.
- **Verify:** `cd $W && node --test tests/routes-seam.test.mjs tests/studio-server.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4.5 — Tool `style_suggest`

- **Goal:** đạo diễn và client ngoài gọi được, nhận kết quả gọn.
- **Target files:** `$W/lib/tools/suggest.mjs` (mới).
- **Steps:**
  1. Comment đầu file: tool làm gì; dùng chung `lib/suggest.mjs` với route; ghi `.opus/suggest/latest.json` để thẻ trong tab Đạo diễn đọc; không ghi `BRIEF.md`; không chọn thay người dùng.
  2. Export `TOOLS` với một tool:
     - `name: "style_suggest"`, `title: "Gợi ý hướng, style và quy trình"`;
     - `description: "Xếp hạng hướng sáng tạo, style và chế độ vận hành cho một dự án, từ BRIEF.md và đầu kịch bản. Dùng Jev khi được bật, không thì dùng gợi ý tất định. Kết quả hiện thành thẻ trong tab Đạo diễn để người dùng tự chọn. Tool này không chọn thay người dùng và không ghi BRIEF.md."`;
     - `inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string", description: "Tên thư mục dự án (project_list)" }, refresh: { type: "boolean", description: "Tính lại dù brief không đổi" } } }`;
     - `mutates: true`, `provider: true`.
  3. `async run({ project, refresh = false }, env)`:
     - `dir = env.projectDir(project)`; thiếu `BRIEF.md` thì throw lỗi `` `dự án ${project} chưa có BRIEF.md` `` với `status: 409`;
     - `rec = await suggestCached({ dir, project, P: env.P, refresh, source: effectiveSource(suggestSetting()) })`;
     - `side = rec.shown === "jev" ? rec.jev : rec.det`;
     - trả `{ project, source: rec.source, shown: rec.shown, error: rec.error?.message ?? null, directions: side.directions.slice(0, 3).map(({ id, label, score, reason, source }) => ({ id, label, score, reason, source })), styles: side.styles.slice(0, 3).map(({ id, label, score, reason, source, directions }) => ({ id, label, score, reason, source, directions })), workflow: side.workflow, card: "Thẻ gợi ý đã hiện trong tab Đạo diễn. Chờ người dùng bấm chọn; không chạy lệnh chọn hướng." }`.
- **Verify:** `cd $W && node -e 'import("./lib/tools.mjs").then(async m=>{const t=(await m.loadTools()).find(x=>x.name==="style_suggest");console.log(Boolean(t), t.provider, t.mutates)})'` in đúng `true true true`.

### Task 4.6 — Test `tests/suggest-routes.test.mjs`

- **Goal:** route và tool có test với `fetch` giả: có khoá, không khoá, timeout, 5xx, ba kết cục choose, thẻ đang chờ.
- **Target files:** `$W/tests/suggest-routes.test.mjs` (mới).
- **Steps:**
  1. Trong `before`, theo mẫu `tests/lemo-routes.test.mjs:16-60`:
     - tạo `tmp`; đặt `process.env.HOME = tmp` trước khi nạp provider, để `P.jev.envFile` nằm trong `tmp`; lưu và trả lại các biến môi trường trong `after`;
     - ghi ba script giả vào `tmp`:
       - `fake-directions.mjs` in mảng pick ba hướng `A6`, `A8`, `A3` như ở test phase 2;
       - `fake-styles.mjs` in `[{ id: "data-editorial", ten_vi: "Báo chí dữ liệu", energy: 2, mo_ta_vi: "x" }, { id: "swiss-kinetic-editorial", ten_vi: "Chữ Thuỵ Sĩ", energy: 3, mo_ta_vi: "y" }]`;
       - `fake-choose.mjs` nối `JSON.stringify(process.argv.slice(2))` thành một dòng vào file `process.env.FAKE_CHOOSE_LOG`, rồi chèn `direction: pick-<n>` vào frontmatter `BRIEF.md` của `--project`, rồi thoát 0;
     - `fakePlugin({ schema: A.NEED.schema, api: 4, extra })` với `extra` khai `COMMANDS = { directions, styles, choose: { file: <fake-choose>, args: ["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"] } }`;
     - thay các stub trong `studio-api.mjs`: `load` đọc `project.json` và trả version 7; `enqueue` nối vào file `requests.jsonl` và trả `{ id: "r-1", status: "queued", ...r }`; `list` đọc mảng JSON từ `process.env.FAKE_REQUESTS` (thiếu thì `[]`); `answer` trả `{ next: { id: "r-2" } }`;
     - `studio.json` có `{ "director": { "runner": "mcp" }, "suggest": { "source": "observe" } }`, trỏ bằng `MOTION_STUDIO_STATE`;
     - dự án `demo`: chép `tests/fixtures/manifest`, rồi ghi `BRIEF.md` (frontmatter `topic`, `aspect: 16:9`, `category: explainer`, `energy: vua`) và `script/01.txt`.
  2. `beforeEach`:
     - xoá `demo/pitch` và `demo/.opus/suggest`;
     - xoá `process.env.TYPESAFE_API_KEY`;
     - xoá `FAKE_REQUESTS`;
     - đặt lại `globalThis.fetch` về fetch giả trả 200 với câu trả lời Score và Choice như ở test phase 2;
     - đếm số lần gọi.
     `after` trả lại `globalThis.fetch` gốc.
  3. Các test:
     - "GET /api/suggest answers no record and the pitch rows": ghi `demo/pitch/PICK.json` có `picks` `[{ n: 1, id: "A6" }, { n: 2, id: "A7" }]`. GET trả `record === null`, `picks.length === 2`, `source === "observe"`.
     - "POST /api/suggest with a key in observe mode stores both sources": `process.env.TYPESAFE_API_KEY = "test-key"`. Trả 200; `record.jev` khác null; `record.det.directions.length === 3`; tồn tại `demo/.opus/suggest/latest.json`.
     - "POST /api/suggest without a key falls back to the deterministic source": `record.error.code === "no-key"`, `record.shown === "det"`.
     - "a Jev timeout and a 5xx still answer 200 with the deterministic source": fetch ném `TimeoutError`, rồi fetch trả 503; mỗi lần `refresh: true`. Cả hai trả 200 với `record.shown === "det"`, mã lỗi lần lượt `timeout`, `http`.
     - "choose with a direction in the pitch runs choose with --pick and --style-profile": có `PICK.json` (`A6` là `n: 2`). POST `{ name: "demo", direction: "A6", style: "data-editorial" }` trả `outcome: "chosen"`, `pick: 2`. Dòng cuối của `FAKE_CHOOSE_LOG` chứa `"--pick","2"` và `"--style-profile","data-editorial"`. `BRIEF.md` có `direction: pick-2`.
     - "choose answers a waiting direction card": đặt `FAKE_REQUESTS` là `[{ id: "r-w", status: "waiting_user", ask: { gate: "direction", kind: "choice", options: [{ id: "1", label: "a" }, { id: "2", label: "b" }] } }]`. Kết quả có `answered: "r-w"`, `next: "r-2"`; `FAKE_CHOOSE_LOG` có thêm đúng 1 dòng.
     - "choose with a direction missing from the pitch lists the pitch rows": `direction: "A1"` thì `outcome: "not_in_pitch"`, `picks.length === 2`.
     - "choose before any pitch queues a director request with the user's preference": không có `pitch/`. Kết quả `outcome: "queued"`; dòng cuối `requests.jsonl` có `text` chứa `A6` và `data-editorial`.
     - "the operating mode is reported as not saved while the provider cannot write it": thêm `mode: "dao-dien"` thì `mode.saved === false` và `mode.reason` chứa `project.json`.
     - "bad arguments are 400": `direction: "x"` trả 400; `style: "../x"` trả 400; `mode: "khac"` trả 400.
     - "style_suggest through callTool returns the compact result": `callTool("style_suggest", { project: "demo" }, toolEnv({ root, P: await loadProvider() }))` có `ok === true`, `result.directions.length === 3`, `result.card` chứa `tab Đạo diễn`.
     - "the key never reaches the stored record or the answers": với `test-key`, nội dung `latest.json` và body mọi câu trả lời ở trên không chứa `test-key`.
     - "every choice with a stored suggestion appends one line to the pick log": POST `/api/suggest` (observe, có khoá) rồi POST choose `A6` có pitch; `readPickLog(demo)` có đúng 1 dòng với `chosen.direction === "A6"`, `outcome === "chosen"`, `jev` và `det` khác `null`, `direction_from` thuộc `["jev","det","both","none"]`. Một lần choose `not_in_pitch` nữa thì có 2 dòng.
     - "a choice without any stored suggestion writes no log line": xoá `.opus/suggest`, choose trả 200 mà `picks.jsonl` không tồn tại.
  4. Khối `describe("when the provider declares pitchInit and set_workflow_mode")`, server thứ hai trên plugin giả thứ hai (cùng mẫu `before`), với `extra` thêm `OPS = ["set_workflow_mode"]` và `COMMANDS.pitchInit = { file: <fake-pitch-init.mjs>, args: ["init", "--project", "{project}", "--topic", "{topic}", "--aspect", "{aspect}", "--directions", "{directions}"] }`. `fake-pitch-init.mjs` ghi argv vào `FAKE_INIT_LOG` và ghi `pitch/PICK.json` với `picks` lấy theo thứ tự `--directions` (`n` từ 1). Stub `patch` của `studio-api.mjs` ghi `JSON.stringify(arguments[1])` vào `FAKE_PATCH_LOG` và trả `{ version: 8 }`.
     - "choose before any pitch builds the pitch from the chosen direction and chooses it": không có `pitch/`, có record. POST `{ direction: "A8" }` trả `outcome: "chosen"`, `initialized: true`, `pick: 1`. `FAKE_INIT_LOG` có `"--directions","A8,` ở đầu danh sách; `FAKE_CHOOSE_LOG` có `"--pick","1"`.
     - "the operating mode is saved through the gateway as the user": POST có `mode: "nhanh"` trả `mode.saved === true`; dòng cuối `FAKE_PATCH_LOG` có `"actor":"human"` và `{"op":"set_workflow_mode","mode":"nhanh"}`.
     - "a brief without topic still queues instead of building a pitch": BRIEF bỏ `topic`, không có `pitch/`; kết quả `outcome: "queued"`, `FAKE_INIT_LOG` không có dòng mới.
- **Verify:** `cd $W && node --test tests/suggest-routes.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 4.7 — Toàn bộ test, commit, gộp

- **Steps:**
  1. `cd $W && npm test 2>&1 | tail -30`
  2. `git -C $W add lib/tools/suggest.mjs routes/suggest.mjs tests/suggest-routes.test.mjs gates.mjs director.mjs routes/lemo.mjs lib/config.mjs tests/studio-gates.test.mjs`
  3. `git -C $W commit -m "feat(director): add style_suggest and the suggest routes" -m "Choosing goes through the provider's choose command, answering a waiting direction card when there is one."`
  4. Nếu chạy song song: `git -C /Volumes/2/Motion-Studio merge --no-ff feat/jev-style-suggest-route -m "merge: suggest tool and routes"`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/suggest-route`.
- **Verify:**
  - `cd $W && node --test tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0` (chạy trước bước 4).
  - `cd /Volumes/2/Motion-Studio && node --test tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0` (chạy sau bước 4).
  - `git -C /Volumes/2/Motion-Studio status --porcelain | wc -l` in `0`.

## Rủi ro và rollback

- Rủi ro: hai đường cùng ghi hướng (thẻ gợi ý và thẻ hướng của đạo diễn). Đã xử lý: khi có thẻ hướng đang chờ, route trả lời luôn thẻ đó, nên `choose` chạy một lần và yêu cầu được đóng.
- Rủi ro: dời `direct` làm hỏng lemo. Test lemo chạy ở task 4.2.
- Rollback: revert commit; `routes/suggest.mjs` và tool tự biến mất khỏi registry; `gates.mjs` quay về chữ ký cũ, không ai khác gọi tham số mới.

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
