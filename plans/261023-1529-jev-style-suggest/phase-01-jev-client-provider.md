# Phase 1: Client Jev và khai báo provider

- **Nhánh:** `feat/jev-style-suggest`, cắt từ `main` (commit `296d3fe`). Làm trong checkout chính `/Volumes/2/Motion-Studio`.
- **Phụ thuộc:** không. Chạy song song được với phase 7.
- **Effort:** 2h.

## Mục tiêu

Studio có một client HTTP nhỏ cho TypeSafe Jev (`lib/jev.mjs`, không dependency) và provider khai báo mọi thứ của plugin mà các phase sau cần: tên biến khoá, đường file `.env`, lệnh `directions`, đường dữ liệu case, bảng chế độ vận hành, đối số style của `choose`, đọc `pitch/PICK.json`, và cờ ghi được `workflow_mode` hay chưa.

## Hiện trạng đã kiểm

- `lib/providers/opus-video.mjs:63-100` (`create`): trả `commands` (dòng 85-95, gộp `api.COMMANDS` ở dòng 94), `library: { directionsFile, stylesDir }` (dòng 96), `projectEnv` (dòng 98). File này đã import `readFileSync`, `existsSync`, `homedir`, `join`.
- `lib/provider.mjs:9-25`: comment mô tả hợp đồng provider. Phải ghi thêm các khoá mới.
- Plugin cài đặt: `~/.claude/skills/opus-video/scripts/studio-api.mjs:29-40` có `COMMANDS` (gồm `choose = { file, args: ["choose","--project","{project}","--pick","{pick}","--accept-warnings"] }`), không có `directions`, không export `OPS`.
- `make-pitch.mjs choose` nhận `--style-profile <id>` (`make-pitch.mjs:10-13`, `:328-331`). `parseArgs` của nó nhận cờ ở bất kỳ thứ tự nào (`:376-385`), nên nối thêm cờ sau `args` của `COMMANDS.choose` là hợp lệ.
- `pitch/PICK.json` có dạng `{ topic, aspect, category, energy, duration_s, picks: [{ n, id, tier, dir, why, scaffold, style_profile? }] }` (`make-pitch.mjs:230`; ví dụ thật: `/Volumes/2/Edit-Video/thuy-mau-demo/pitch/PICK.json`).
- Plugin `jev-client.mjs:13-21` đọc khoá từ `$TYPESAFE_API_KEY`, rồi file `~/.config/opus-video/.env`, dòng `TYPESAFE_API_KEY=...`, bỏ ngoặc kép hoặc ngoặc đơn.
- Docs TypeSafe hiện hành (đọc ngày 2026-10-23):
  - endpoint `POST https://api.typesafe.ai/v1/systemone`, header `Authorization: Bearer <key>`;
  - body `{ model, state, questions }`;
  - Score có `criteria` là mảng 1–10 mức, trả `score` (có thể lẻ), `confidence`, `legend`, `probabilities`;
  - Choice có `criteria` là object tên → mô tả (1–255 mục), trả `choice`, `confidence`, `probabilities`;
  - Noul trả `noul`;
  - model `jev-latest` hiện trỏ `jev-1.13.0`; giới hạn 64k token mỗi request, 32k mỗi câu hỏi;
  - mã lỗi: 400, 401, 413, 415, 422 không retry; 429 và 529 retry có backoff.
- Chỗ `jev-client.mjs:24-42` khác docs:
  - client cũ retry mọi 5xx và lỗi mạng, timeout 30 s; docs chỉ nêu 429 và 529 là retry được.
  - Dạng câu hỏi và dạng câu trả lời của client cũ khớp docs.

## Sở hữu file

- Tạo: `lib/jev.mjs`, `tests/jev.test.mjs`.
- Sửa: `lib/providers/opus-video.mjs`, `lib/provider.mjs` (chỉ comment), `tests/provider.test.mjs` (thêm một test, không sửa test cũ).
- Không chạm file nào khác.

## Các task

### Task 1.0 — Nhánh và mốc ban đầu

- **Goal:** nhánh `feat/jev-style-suggest` tồn tại, cây sạch, test gốc xanh trước khi sửa.
- **Target files:** không.
- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio switch -c feat/jev-style-suggest main`
  2. `npm --prefix /Volumes/2/Motion-Studio/ui ci --no-audit --no-fund`
  3. `cd /Volumes/2/Motion-Studio && npm test 2>&1 | tail -40`
- **Success criteria:** đang ở nhánh mới, test gốc không có test trượt.
- **Verify:**
  - `git -C /Volumes/2/Motion-Studio branch --show-current` in đúng `feat/jev-style-suggest`.
  - `cd /Volumes/2/Motion-Studio && node --test tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in đúng `ℹ fail 0`.

### Task 1.1 — `lib/jev.mjs`

- **Goal:** một module khoảng 40–60 dòng, chỉ dùng `fetch` của Node, không bao giờ throw, không bao giờ trả hay log khoá.
- **Target files:** `lib/jev.mjs` (mới). Export `API_URL`, `MODEL`, `readKey`, `ask`.
- **Steps:**
  1. Comment đầu file: mục đích; endpoint và dạng body theo docs; ghi rõ chỗ khác `jev-client.mjs` của plugin (timeout 8 s thay 30 s; không retry khi quá giờ để giữ giao diện nhanh; retry 429, 529 và 5xx; không retry 4xx khác). Không nêu tên plugin trong file này: viết "client cũ của provider" thay cho tên.
  2. `export const API_URL = "https://api.typesafe.ai/v1/systemone"; export const MODEL = "jev-latest";`
  3. `export function readKey({ env = process.env, keyVar, envFile } = {})`:
     - `keyVar` rỗng thì trả `""`;
     - `env[keyVar]` có giá trị thì trả nó;
     - không thì đọc `envFile` nếu tồn tại, tìm dòng khớp `^\s*<keyVar>\s*=\s*(.*?)\s*$` và bỏ ngoặc bao;
     - không có thì `""`;
     - lỗi đọc file thì `""`.
  4. `export async function ask(body, { key, fetchImpl = globalThis.fetch, timeoutMs = 8000, retries = 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {})`, luôn trả một trong hai dạng:
     - `{ ok: true, data, ms }`;
     - `{ ok: false, error, status?, ms }`, với `error` là một trong `"no-key"`, `"timeout"`, `"network"`, `"http"` (kèm `status`), `"malformed"`.
     Các bước bên trong:
     - không có `key` thì trả `{ ok: false, error: "no-key" }` ngay, không gọi fetch;
     - gửi `POST API_URL`, header `Authorization: Bearer ${key}` và `Content-Type: application/json`, body `JSON.stringify({ model: MODEL, ...body })`, `signal: AbortSignal.timeout(timeoutMs)`;
     - lỗi tên `TimeoutError` hoặc `AbortError` thì trả `timeout`, không retry;
     - lỗi mạng khác thì retry nếu còn lượt, hết lượt thì `network`;
     - status 429, 529 hoặc ≥ 500: chờ `300 * 2 ** attempt` ms rồi retry nếu còn lượt, hết lượt thì `http`;
     - status không ok khác thì trả `http` ngay;
     - JSON hỏng hoặc thiếu `answers` (không phải object) thì `malformed`.
  5. Không `console.log` gì trong module.
- **Success criteria:** module import được, không có import ngoài `node:`.
- **Verify:** `cd /Volumes/2/Motion-Studio && node -e 'import("./lib/jev.mjs").then(m=>console.log(typeof m.ask, typeof m.readKey, m.MODEL))'` in đúng `function function jev-latest`.

### Task 1.2 — Test `tests/jev.test.mjs`

- **Goal:** mọi nhánh của `ask` và `readKey` có test với `fetch` giả.
- **Target files:** `tests/jev.test.mjs` (mới).
- **Steps:**
  1. Dùng `node:test`, `node:assert/strict`, thư mục tạm `mkdtempSync`. Khoá giả là chuỗi `test-key`.
  2. Test `readKey`:
     - `env` có biến thì thắng file;
     - file có dòng `X_KEY="abc"` thì trả `abc`;
     - không có file thì trả `""`.
  3. Test `ask` với `fetchImpl` giả đếm số lần gọi, `sleep` giả trả ngay:
     - không khoá: `error` là `no-key`, gọi 0 lần;
     - 200 với `{ answers: { q: { score: 3 } }, usage: {} }`: `ok` true, gọi 1 lần, header `Authorization` là `Bearer test-key`;
     - 401: `error` `http`, `status` 401, gọi 1 lần;
     - 529 rồi 200: `ok` true, gọi 2 lần;
     - 503 hai lần: `error` `http`, `status` 503, gọi 2 lần;
     - fetch ném lỗi tên `TimeoutError`: `error` `timeout`, gọi 1 lần;
     - 200 với body không phải JSON: `error` `malformed`.
  4. Một test kiểm `JSON.stringify` của mọi kết quả `ask` ở trên không chứa `test-key`.
- **Success criteria:** tất cả test chạy qua.
- **Verify:** `cd /Volumes/2/Motion-Studio && node --test tests/jev.test.mjs 2>&1 | command grep -E "^ℹ (pass|fail)"` in `ℹ fail 0` và dòng `ℹ pass` có số ≥ 9.

### Task 1.3 — Khai báo trong provider

- **Goal:** `create()` trả thêm `commands.directions`, `library.casesFile`, `library.caseFeaturesFile`, khối `jev` và khối `suggest`.
- **Target files:** `lib/providers/opus-video.mjs`, hàm `create` (dòng 63-100); thêm hằng `MODES` và hàm `readPicks` ở mức module, trên `create`.
- **Steps:**
  1. Trong `commands`, ngay trước `...(api.COMMANDS ?? {})`, thêm `directions: s("directions.mjs"),` kèm comment một dòng: "directions pick | show (--json); not in COMMANDS yet".
  2. Đổi `library` thành `{ directionsFile: api.DIRECTIONS_FILE, stylesDir: join(home, "data", "styles"), casesFile: join(home, "data", "cases.jsonl"), caseFeaturesFile: join(home, "data", "case-features.jsonl") }`.
  3. Thêm `jev: { keyVar: "TYPESAFE_API_KEY", envFile: join(homedir(), ".config", "opus-video", ".env") },`. `homedir()` gọi bên trong `create()` để test đổi được `HOME`.
  4. Thêm hằng `MODES` (chép nguyên văn):
     ```js
     // The plugin's four ways of working (skills/opus-video/SKILL.md): desc is the Choice criterion
     // Jev reads, steps are command names of this provider in order, pitch says the three-styleframe pitch is part of it.
     const MODES = Object.freeze({
       "dao-dien": { label: "Đạo diễn đầy đủ", pitch: true, steps: ["pitch", "choose", "recipe", "timing", "beatGrid", "demo", "wordSync", "preflight", "render"],
         desc: "Full direction (default): brief, three styleframe pitches to choose a creative direction, script, voice, build and render. For a new video made from a topic or a brief." },
       nhanh: { label: "Nhanh theo mẫu", pitch: false, steps: ["cases", "recipe", "timing", "demo", "preflight", "render"],
         desc: "Fast, from a template: one reference case replaces the three-styleframe pitch, then script, voice, build and render. For 'make it quickly' or 'make it like this video'." },
       "tu-nhac": { label: "Từ nhạc hoặc footage", pitch: true, steps: ["beatGrid", "cut", "pitch", "choose", "timing", "demo", "preflight", "render"],
         desc: "From music or existing footage: measure the beat grid of the song or cut the footage first, then choose a direction, write the script and build. For music-driven videos or videos built on shot footage." },
       timeline: { label: "Sửa dự án đã có", pitch: false, steps: ["import", "timing", "wordSync", "preflight", "render"],
         desc: "Edit an existing project: import it into the timeline, change shots and lines through the gateway, re-voice only the changed lines and render. For a video that already exists." },
     });
     ```
  5. Thêm hàm:
     ```js
     // pitch/PICK.json of a project (make-pitch init): [{ n, id, style_profile, dir }] or null.
     function readPicks(dir) {
       try {
         const j = JSON.parse(readFileSync(join(dir, "pitch", "PICK.json"), "utf8"));
         return Array.isArray(j?.picks) ? j.picks.map((r) => ({ n: r.n, id: r.id, style_profile: r.style_profile ?? null, dir: r.dir ?? null })) : null;
       } catch { return null; }
     }
     ```
  6. Trong object trả về, thêm:
     ```js
     // style_suggest (lib/suggest.mjs, routes/suggest.mjs). styleArgs follow commands.choose's
     // argv; scriptDir holds script/*.txt. Two features are detected, not assumed: pitchInit is
     // the plugin's COMMANDS.pitchInit (a pitch from chosen directions, placeholders {project},
     // {topic}, {aspect}, {category}, {energy}, {directions}) or null; workflow_mode can be written
     // only once the gateway lists set_workflow_mode in OPS.
     suggest: {
       modes: MODES, styleArgs: ["--style-profile", "{style}"], scriptDir: "script", readPicks,
       pitchInit: api.COMMANDS?.pitchInit ?? null,
       canSetWorkflowMode: Array.isArray(api.OPS) && api.OPS.includes("set_workflow_mode"),
       workflowModeOp: (mode) => ({ op: "set_workflow_mode", mode }),
     },
     ```
     Hai khoá `pitchInit` và `canSetWorkflowMode` là chỗ phát hiện tính năng của plugin. Plugin hiện tại (API 4) không có cả hai, nên giá trị là `null` và `false`. Khi plugin phát hành bản có `COMMANDS.pitchInit` và `OPS` chứa `set_workflow_mode` (PR ở phase 7), hai khoá tự đổi mà không phải sửa Studio.
- **Success criteria:** provider thật nạp được và có các khoá mới.
- **Verify:** `cd /Volumes/2/Motion-Studio && node -e 'import("./lib/provider.mjs").then(async m=>{const p=await m.loadProvider();console.log(Boolean(p.commands.directions), p.jev.keyVar, Object.keys(p.suggest.modes).join(","), p.suggest.canSetWorkflowMode, p.suggest.pitchInit, Array.isArray(p.suggest.readPicks("/nonexistent")))})'` in đúng `true TYPESAFE_API_KEY dao-dien,nhanh,tu-nhac,timeline false null false`.

### Task 1.4 — Comment hợp đồng và test provider

- **Goal:** hợp đồng trong `lib/provider.mjs` ghi các khoá mới; một test mới khoá hình dạng của chúng.
- **Target files:** `lib/provider.mjs` (comment dòng 9-25), `tests/provider.test.mjs` (thêm test cuối file).
- **Steps:**
  1. Trong comment hợp đồng, sửa dòng `commands` để có `directions`, sửa `library` thành `{ directionsFile, stylesDir, casesFile, caseFeaturesFile }`, thêm hai dòng:
     `//   jev:      { keyVar, envFile },                  // where the TypeSafe key is read (never stored by Studio)`
     `//   suggest:  { modes, styleArgs, scriptDir, readPicks(dir), pitchInit, canSetWorkflowMode, workflowModeOp(mode) },`
  2. Thêm test `"suggest and jev declarations: every mode step is a command, style args carry {style}"`:
     - dùng `fakePlugin({ schema: A.NEED.schema, api: 4 })`, gọi `A.create({ OPUS_VIDEO_HOME: dir })`;
     - kiểm mọi phần tử `steps` của mọi mode nằm trong `Object.keys(p.commands)` hoặc bằng `"choose"`;
     - kiểm `p.suggest.styleArgs.some((a) => a.includes("{style}"))`;
     - kiểm `p.jev.keyVar` là chuỗi khác rỗng, `p.jev.envFile` tuyệt đối;
     - kiểm `p.suggest.canSetWorkflowMode === false` và `p.suggest.pitchInit === null`;
     - tạo plugin giả thứ hai bằng `fakePlugin({ schema: A.NEED.schema, api: 4, extra })`, với `extra` là chuỗi mã nguồn (mẫu `tests/lemo-routes.test.mjs:24`) export thêm `OPS = ["set_workflow_mode"]` và `COMMANDS.pitchInit = { file: "/x/make-pitch.mjs", args: ["init", "--project", "{project}", "--directions", "{directions}"] }`; kiểm `canSetWorkflowMode === true`, `pitchInit.args` chứa `"{directions}"`, và `workflowModeOp("nhanh")` bằng `{ op: "set_workflow_mode", mode: "nhanh" }`;
     - kiểm `p.suggest.readPicks(dir)` là `null` với thư mục không có `pitch/`;
     - xoá thư mục tạm trong `finally`.
- **Success criteria:** test mới và luật "tên plugin chỉ nằm trong adapter" đều qua.
- **Verify:** `cd /Volumes/2/Motion-Studio && node --test tests/provider.test.mjs tests/jev.test.mjs 2>&1 | command grep -E "^ℹ fail"` in đúng `ℹ fail 0`.

### Task 1.5 — Commit

- **Goal:** một commit sạch cho phase.
- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio add lib/jev.mjs tests/jev.test.mjs lib/providers/opus-video.mjs lib/provider.mjs tests/provider.test.mjs`
  2. `git -C /Volumes/2/Motion-Studio commit -m "feat(provider): declare the TypeSafe key source and suggest data" -m "Adds lib/jev.mjs, a dependency-free client with timeout, retry and typed failures."`
- **Verify:** `git -C /Volumes/2/Motion-Studio status --porcelain | wc -l` in `0`, và `git -C /Volumes/2/Motion-Studio log -1 --format=%B | command grep -ciE "claude|co-authored|ai-generated"` in `0`.

## Rủi ro và rollback

- Rủi ro: `fakePlugin` không có `data/` nên `library.casesFile` trỏ tới file không có. Không sao, chỉ phase 3 đọc nó qua plugin thật.
- Rollback: `git revert` commit của phase. Không có trạng thái nào khác.

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
