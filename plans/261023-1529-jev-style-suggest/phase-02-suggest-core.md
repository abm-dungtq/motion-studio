# Phase 2: Lõi gợi ý `lib/suggest.mjs`

- **Nhánh:** `feat/jev-style-suggest`, checkout chính.
- **Phụ thuộc:** phase 1 (cần `lib/jev.mjs`, `P.jev`, `P.suggest`, `P.commands.directions`).
- **Song song:** với phase 7.
- **Effort:** 5h.

## Mục tiêu

Một module duy nhất tính gợi ý cho một dự án, dùng chung cho tool, route và script đo:

- đọc state;
- tính nguồn tất định qua lệnh của provider;
- tính nguồn Jev theo đúng trình tự đã duyệt (8 Score hướng, rồi tối đa 15 Score style cộng 1 Choice chế độ);
- dựng bản ghi quy trình `{mode, pitch, steps[], skip[], reason}`;
- lưu và đọc bản ghi;
- ghi log lựa chọn thật của người dùng (mỗi lần bấm chọn trên thẻ một dòng JSONL), để sau 30 lượt quyết định nguồn mặc định.

Module không bao giờ throw khi Jev hỏng. Nó không chép logic chấm điểm của plugin: hướng tất định lấy từ `directions pick`, lọc energy của style lấy từ `styles suggest`.

## Hiện trạng đã kiểm

- `directions.mjs pick --aspect <a> [--category c] [--energy e] [--topic t] --json` in mảng `[{ n, id, tier, score, why: string[], ten_vi, mo_ta_vi }]`, ba hướng, mỗi tầng `fit`/`continuous`/`bold` một hướng (`~/.claude/skills/opus-video/scripts/directions.mjs:138-150`, `:303-307`). Thiếu `--aspect` thì thoát mã 2 (`:304`).
- `why` chỉ có ba loại câu: `hợp nhóm <category>`, `chủ đề có "<từ>"`, `hợp nhịp <energy>` (`directions.mjs:126-136`).
- `styles.mjs suggest --direction <id> [--energy em|vua|don-dap] --json` in `[{ id, ten_vi, energy, mo_ta_vi }]` (`styles.mjs:464-470`). Lọc energy ở `styles.mjs:385-388`.
- `directions.json` (qua `P.library.directionsFile`) có `directions[]` với `id, slug, ten_vi, mo_ta_vi, hook_vi, tier, categories, topic_keywords, aspects, energy, tags, styles_goi_y` (mỗi hướng 4 style; hợp của cả 8 là 28 style).
- Studio tự ghi `mode` vào frontmatter `BRIEF.md` lúc tạo dự án, giá trị `tu-dau | video-co-san | theo-nhac | mau-nhanh` (`create.mjs:14`, `:74`).
- `runFile(cmd, args, opts)` của `create.mjs:19-23` chạy lệnh không qua shell và không bao giờ reject.
- `.opus/` của dự án đã bị `.gitignore` chặn, và đã là chỗ Studio ghi sidecar (`lib/receipts.mjs:3-14`).
- Kịch bản nằm trong `script/*.txt` của dự án (ví dụ `/Volumes/2/Edit-Video/thuy-mau-demo/script/01.txt`), tên thư mục lấy từ `P.suggest.scriptDir`.

## Sở hữu file

- Tạo: `lib/suggest.mjs`, `tests/suggest.test.mjs`, `tests/fixtures/suggest/directions.json`.
- Không sửa file nào có sẵn.

## Hợp đồng của module (các phase sau dựa vào, giữ đúng tên)

```js
export const SOURCES = ["deterministic", "observe", "jev"];
export const DEFAULT_SOURCE = "observe";   // đổi sang "jev" hoặc "deterministic" khi log đủ 30 lượt (scripts/suggest-eval.mjs --picks)
export const MAX_QUESTIONS = 24;
export function effectiveSource(setting) → "deterministic" | "observe" | "jev"
export function frontmatterOf(text) → object
export function buildState(dir, P) → { fm, state: { brief, script_head }, hash }
export function loadCandidates(P) → direction[]
export async function detDirections({ fm, topic, P, run }) → [{ id, tier, why, ten_vi, mo_ta_vi }]
export async function jevDirections({ state, fm, candidates, key, fetchImpl, timeoutMs }) → { ok, items?, error?, status?, usage?, ms }
export async function suggest({ dir, project, P, source, fetchImpl, run, env, now }) → record
export async function suggestCached({ dir, project, P, refresh, source, fetchImpl, run, env, now }) → record
export const recordPath = (dir) => join(dir, ".opus", "suggest", "latest.json");
export function readRecord(dir) → record | null
export function saveRecord(dir, record) → void   // ghi tmp rồi rename
export const picksLogPath = (dir) => join(dir, ".opus", "suggest", "picks.jsonl");
export function pickEntry({ record, project, chosen, outcome, now }) → PickEntry
export function appendPick(dir, entry) → void    // nối đúng một dòng JSON
export function readPickLog(dir) → PickEntry[]   // bỏ qua dòng hỏng
```

Không còn hằng `OBSERVE_UNTIL`: chế độ quan sát không hết hạn theo ngày, mà kết thúc khi log đủ 30 lượt và người vận hành chạy bước quyết định (phase 8).

Bản ghi (`v: 1`):

```text
{ v, at, project, hash, source, shown: "jev" | "det", error: null | { code, message },
  det: Side, jev: Side | null, usage: { input_tokens, output_tokens } | null, ms, questions }
Side     = { directions: Item[], styles: Item[], workflow: Workflow }
Item     = { id, label, score: number | null, confidence: number | null, reason, fields: string[],
             source: "jev" | "det", directions?: string[] }
Workflow = { mode, label, pitch, steps: string[], skip: { step, reason }[], reason, source, p?: number }
```

Dòng log lựa chọn (`v: 1`), file `<dự án>/.opus/suggest/picks.jsonl`. Chọn `.opus/` vì đó là chỗ Studio đã ghi sidecar của dự án và đã bị `.gitignore` chặn (`lib/receipts.mjs:3-14`, `routes/lemo.mjs:56`); repo không có thư mục `.motion-studio/` nào trong dự án.

```text
PickEntry = { v, at, project, hash, record_at, record_source: "deterministic"|"observe"|"jev",
              jev: Ranked | null, det: Ranked,
              chosen: { direction, style: string | null, mode: string | null },
              direction_from: "jev"|"det"|"both"|"none", style_from: "jev"|"det"|"both"|"none"|null,
              outcome: "chosen"|"not_in_pitch"|"queued" }
Ranked    = { directions: string[3], styles: string[≤3], mode }   // id theo thứ hạng, top 3
```

`direction_from` là nguồn có hướng đã chọn trong top 3 của nó: cả hai thì `both`, không nguồn nào thì `none`. `style_from` tính tương tự trên top 3 style; `null` khi người dùng không chọn style.

## Các task

### Task 2.1 — Fixture hướng

- **Goal:** test không phụ thuộc plugin cài trên máy.
- **Target files:** `tests/fixtures/suggest/directions.json` (mới).
- **Steps:**
  1. Sinh fixture từ file thật, chỉ giữ các trường cần:
     `cd /Volumes/2/Motion-Studio && node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.env.HOME+"/.claude/skills/opus-video/data/directions.json","utf8"));const keep=["id","slug","ten_vi","mo_ta_vi","hook_vi","tier","categories","topic_keywords","aspects","energy","tags","styles_goi_y"];fs.mkdirSync("tests/fixtures/suggest",{recursive:true});fs.writeFileSync("tests/fixtures/suggest/directions.json",JSON.stringify({directions:d.directions.map(x=>Object.fromEntries(keep.map(k=>[k,x[k]])))},null,1)+"\n")'`
- **Success criteria:** fixture có 8 hướng.
- **Verify:** `cd /Volumes/2/Motion-Studio && node -e 'console.log(require("./tests/fixtures/suggest/directions.json").directions.length)'` in `8`.

### Task 2.2 — State, frontmatter, nguồn

- **Goal:** state đúng hợp đồng, không lộ trường đã chọn.
- **Target files:** `lib/suggest.mjs`: `frontmatterOf`, `buildState`, `effectiveSource`, các hằng.
- **Steps:**
  1. Comment đầu file:
     - module làm gì;
     - trình tự lọc → Score hướng → Score style → Choice chế độ;
     - bản ghi lưu ở đâu;
     - Studio không chép logic chấm của provider.
     Không nêu tên plugin.
  2. `frontmatterOf(text)`:
     - lấy khối giữa cặp `---` đầu tiên;
     - mỗi dòng `^([A-Za-z0-9_]+):\s*(.*)$` thành `key → value`, value đã `trim` và bỏ một cặp ngoặc kép hoặc ngoặc đơn bao ngoài;
     - không có khối thì trả `{}`.
  3. Hằng `STRIP = ["direction", "direction_swaps", "style_profile", "styleframe", "creative_selection", "creative_override", "word_budget", "music_only_s", "brand", "voice_id", "tts_model", "palette", "case_search"]`. Đây là các trường ghi lại một lựa chọn đã có, không đưa vào state.
  4. `buildState(dir, P)`:
     - đọc `BRIEF.md` (thiếu thì `""`), `fm = frontmatterOf(text)`, `brief = fm` bỏ các khoá trong `STRIP`;
     - `script_head`: các file `.txt` và `.md` trong `join(dir, P.suggest?.scriptDir ?? "script")`, sắp theo tên, nối lại, tách theo khoảng trắng, giữ 300 từ đầu, nối bằng một dấu cách;
     - `hash` = 12 ký tự đầu của sha256 hex của `JSON.stringify({ brief, script_head })`;
     - trả `{ fm, state: { brief, script_head }, hash }`.
  5. `effectiveSource(setting)` trả `SOURCES.includes(setting) ? setting : DEFAULT_SOURCE`. Giá trị `studio.json` `suggest.source` luôn thắng mặc định.
- **Success criteria:** hàm chạy được, chưa cần test riêng (task 2.6 test).
- **Verify:** no verification needed (task 2.6 kiểm).

### Task 2.3 — Nguồn tất định

- **Goal:** `detDirections` và phần tất định của `suggest` chỉ dùng lệnh của provider.
- **Target files:** `lib/suggest.mjs`: `loadCandidates`, `detDirections`, `detStyles` (nội bộ), `detMode` (nội bộ), `workflowFor` (nội bộ), `fieldsOf` (nội bộ).
- **Steps:**
  1. `loadCandidates(P)`: `JSON.parse(readFileSync(P.library.directionsFile, "utf8")).directions ?? []`; lỗi thì `[]`.
  2. Hàm nội bộ `runJson(run, file, args)`:
     - gọi `run(process.execPath, [file, ...args], { timeout: 15000 })`;
     - `code !== 0` hoặc JSON hỏng thì trả `null`.
     Mặc định `run = runFile` import từ `../create.mjs`.
  3. Hàm chuẩn hoá: `aspectOf(fm)` trả `fm.aspect` nếu thuộc `["16:9","9:16","both"]`, không thì `"16:9"`. `energyOf(fm)` trả `fm.energy` nếu thuộc `["em","vua","don-dap"]`, không thì `""`.
  4. `detDirections({ fm, topic, P, run })`:
     - có `P.commands.directions` thì chạy `pick --aspect <aspectOf> [--category fm.category] [--energy energyOf] --topic <topic> --json` và trả mảng in ra, theo thứ tự;
     - không có lệnh, hoặc lệnh trả `null`, thì trả 3 hướng đầu của `loadCandidates(P)` với `why: []`.
  5. `fieldsOf(fm, d, why = [])` trả mảng chuỗi dạng `` `category: explainer` ``:
     - `category` khi `d.categories` có `fm.category`;
     - `energy` khi `d.energy` có `fm.energy`;
     - `topic` khi một câu `why` bắt đầu bằng `chủ đề có` và `fm.topic` có giá trị.
  6. `detStyles({ fm, directionIds, P, run })`:
     - với mỗi id: chạy `suggest --direction <id> --energy <e> --json` (bỏ `--energy` khi rỗng);
     - kết quả rỗng mà có energy thì chạy lại không có `--energy` và đánh dấu `energyFit = false`;
     - gộp theo id style, giữ mảng `directions` của mọi hướng gợi ý nó;
     - trả `[{ id, ten_vi, energy, mo_ta_vi, directions, energyFit }]`.
  7. `detMode(fm, dir)` theo thứ tự, luật đầu tiên khớp thì dừng:
     1. có `project.json` trong `dir` và `fm.direction` → `timeline`, lý do `` BRIEF đã có `direction` và dự án đã có project.json. ``
     2. `fm.mode` thuộc `{ "tu-dau": "dao-dien", "video-co-san": "tu-nhac", "theo-nhac": "tu-nhac", "mau-nhanh": "nhanh" }` → giá trị tương ứng, lý do `` Trường `mode: <v>` của BRIEF. ``
     3. `/nhanh/i.test(fm.creative_override ?? "")` → `nhanh`, lý do `` Trường `creative_override` ghi cách làm nhanh. ``
     4. còn lại → `dao-dien`, lý do ``BRIEF không có `mode` hay `creative_override` chỉ cách làm khác, nên dùng cách mặc định.``
  8. `workflowFor(mode, fm, dir, P, source, reason)`:
     - `m = P.suggest.modes[mode]`, `steps = [...m.steps]`, `skip = []`;
     - có `fm.direction` thì đưa `pitch` và `choose` ra khỏi `steps`, mỗi cái vào `skip` với lý do `` BRIEF đã có `direction: <v>`. ``;
     - `cut` trong `steps` mà không có file nào trong `footage/raw` hay `assets/footage` của dự án thì bỏ, lý do `Dự án chưa có footage trong footage/raw hay assets/footage.`;
     - `beatGrid` trong `steps` mà không có file `.mp3`, `.wav` hay `.m4a` trong `assets/bgm` thì bỏ, lý do `Chưa có nhạc trong assets/bgm.`;
     - `fm.aspect === "both"` và `P.commands.reframe` có thì chèn `reframe` ngay trước `render`. Không thì thêm `{ step: "reframe", reason }` vào `skip`, với `reason` là `` `aspect: <v>` chỉ cần một khung. `` hoặc `` BRIEF chưa có `aspect`, nên coi là một khung. ``;
     - trả `{ mode, label: m.label, pitch: m.pitch && steps.includes("pitch"), steps, skip, reason, source }`.
- **Success criteria:** dùng được trong task 2.5.
- **Verify:** no verification needed (task 2.6 kiểm).

### Task 2.4 — Nguồn Jev

- **Goal:** đúng hai request, tổng câu hỏi ≤ `MAX_QUESTIONS`, mọi lỗi trả về dạng `{ ok: false, error }`.
- **Target files:** `lib/suggest.mjs`: `jevDirections`, `jevStylesAndMode` (nội bộ), các hằng tiêu chí.
- **Steps:**
  1. Chép nguyên văn các hằng tiêu chí:
     ```js
     const DIRECTION_FIT = [
       "The direction clashes with the brief: its look and storytelling fight the video's purpose, audience or tone.",
       "Weak fit: only a generic technique is shared; purpose, content and tone point elsewhere.",
       "Possible fit: it could carry the brief, but another kind of visual storytelling would suit the content better.",
       "Good fit: the visual storytelling suits the brief's purpose and content; a director would shortlist it.",
       "Excellent fit: the obvious way to tell this brief in pictures; content, purpose, energy and tone all point to it.",
     ];
     const STYLE_FIT = [
       "The look clashes with the brief's subject, audience or energy.",
       "Weak: only loosely related to what the brief needs.",
       "Usable, but a different look would suit the brief better.",
       "Good: the palette, type and motion suit the brief's subject and energy.",
       "Excellent: the look a designer would pick first for this brief.",
     ];
     const STATE_NOTE = "The state is the brief of a short video we must produce: its frontmatter fields and the start of its script (mostly Vietnamese).";
     ```
  2. `jevDirections({ state, fm, candidates, key, fetchImpl, timeoutMs })`:
     - lọc `candidates` có `aspects` chứa `aspectOf(fm)` (thiếu `aspects` thì giữ);
     - câu hỏi `d<i>` cho từng ứng viên: `{ type: "score", instructions: { candidate_direction: { name: d.ten_vi, description: d.mo_ta_vi, hook: d.hook_vi, categories: d.categories, energy: d.energy, tags: d.tags }, question: `${STATE_NOTE} \`candidate_direction\` is one creative direction: how the story is told in pictures. How well does it fit this brief?` }, criteria: DIRECTION_FIT }`;
     - gọi `ask({ state, questions }, { key, fetchImpl, timeoutMs })` của `lib/jev.mjs`;
     - lỗi thì trả nguyên lỗi;
     - mọi `answers["d<i>"].score` phải là số, không thì `{ ok: false, error: "malformed" }`;
     - trả `{ ok: true, items: [{ d, score, confidence }] }`, sắp `score` giảm, rồi `confidence` giảm, rồi theo thứ tự trong `candidates`; kèm `usage` và `ms`.
  3. `jevStylesAndMode({ state, styles, modes, key, fetchImpl, timeoutMs })`:
     - `styles` cắt còn tối đa `MAX_QUESTIONS - 8 - 1` (= 15) mục;
     - câu hỏi `s<i>`: `{ type: "score", instructions: { candidate_style: { name: s.ten_vi, description: s.mo_ta_vi, energy_1_to_5: s.energy }, question: `${STATE_NOTE} \`candidate_style\` is a visual style (palette, type, material, motion). How well does this look fit the brief?` }, criteria: STYLE_FIT }`;
     - câu hỏi `mode`: `{ type: "choice", instructions: `${STATE_NOTE} Which way of working fits this project best?`, criteria: Object.fromEntries(Object.entries(modes).map(([k, v]) => [k, v.desc])) }`;
     - một lần `ask`;
     - kiểm `score` là số cho mọi `s<i>`, `answers.mode.choice` là một khoá của `modes`; sai thì `malformed`;
     - trả `{ ok, styles: [{ s, score, confidence }], mode: { id, p: probabilities[id], confidence }, usage, ms }`.
  4. Hằng câu lỗi tiếng Việt, theo mã `error` của `ask`:
     - `no-key`: `Chưa có khoá TypeSafe, nên đang dùng gợi ý tất định.`
     - `timeout`: `Jev không trả lời kịp trong 8 giây, nên đang dùng gợi ý tất định.`
     - `network`: `Không kết nối được tới Jev, nên đang dùng gợi ý tất định.`
     - `http`: `Jev báo lỗi HTTP ${status}, nên đang dùng gợi ý tất định.`
     - `malformed`: `Jev trả về dữ liệu không đọc được, nên đang dùng gợi ý tất định.`
- **Success criteria:** dùng được trong task 2.5.
- **Verify:** no verification needed (task 2.6 kiểm).

### Task 2.5 — `suggest`, `suggestCached`, lưu và đọc

- **Goal:** một hàm trả bản ghi đầy đủ cho mọi trường hợp: có khoá, không khoá, timeout, 5xx.
- **Target files:** `lib/suggest.mjs`: `suggest`, `suggestCached`, `recordPath`, `readRecord`, `saveRecord`, `picksLogPath`, `pickEntry`, `appendPick`, `readPickLog`.
- **Steps:**
  1. `suggest({ dir, project, P, source = DEFAULT_SOURCE, fetchImpl = globalThis.fetch, run = runFile, env = process.env, now = new Date() })`:
     1. `t0 = Date.now()`; `{ fm, state, hash } = buildState(dir, P)`; `topic = fm.topic || state.script_head.split(" ").slice(0, 60).join(" ")`.
     2. Phần tất định:
        - `picks = await detDirections(...)`;
        - `det.directions` = `picks.map((p) => ({ id: p.id, label: p.ten_vi, score: null, confidence: null, fields, reason, source: "det" }))`, với `fields = fieldsOf(fm, candidate, p.why)`;
        - `reason` là `` `${p.why.join("; ")} (trường ${fields.join(", ")}).` `` khi có `fields`, không thì ``` `Hướng tất định cho tầng ${p.tier}; BRIEF chưa có `category`, `energy` hay `topic` nào khớp hướng này.` ```;
        - `det.styles` = `detStyles` cho cả 3 id, mỗi mục `score: null`, `reason` `` `Hướng ${dirs} gợi ý style này${energyFit ? `, hợp \`energy: ${fm.energy}\`` : ""}.` ``;
        - `det.workflow` = `workflowFor(detMode(...).mode, …, "det", lý do của detMode)`.
     3. `key = readKey({ env, keyVar: P.jev?.keyVar, envFile: P.jev?.envFile })`.
     4. Nếu `source === "deterministic"`: `jev = null`, `error = null`, không gọi fetch.
     5. Nếu không:
        - `r1 = await jevDirections(...)`;
        - lỗi thì `jev = null`, `error = { code, message }`;
        - ok thì `top = r1.items.slice(0, 3)`; `styles = await detStyles({ directionIds: top.map(x => x.d.id) })` (danh sách ứng viên vẫn đi qua lệnh của provider); `r2 = await jevStylesAndMode(...)`;
        - `r2` lỗi thì `jev = null`, `error` theo `r2`;
        - cả hai ok thì dựng `jev`:
          - `directions` cho cả 8 mục, `source: "jev"`, `score` làm tròn 2 số lẻ;
          - `reason` của hướng: `` `Jev chấm ${score}/4. Khớp ${fields.join(", ")}.` `` khi có `fields`; không thì `` `Jev chấm ${score}/4 khi đọc ${fm.topic ? "`topic`" : "đầu kịch bản (BRIEF chưa có `topic`)"}.` ``;
          - `confidence < 0.5` thì nối thêm ` Jev chưa chắc (độ tin ${confidence.toFixed(2)}).`;
          - `styles` tương tự, giữ `directions`;
          - `workflow = workflowFor(mode.id, …, "jev", reason)` với `reason` là `` `Jev chọn ${mode.id} (xác suất ${p.toFixed(2)}) từ các trường ${present.join(", ")} của BRIEF.` ``, `present` là các trường có giá trị trong `["mode","topic","category","aspect","duration_s","voice_source"]`, viết dạng `` `tên` ``. Gắn thêm `p`.
     6. `shown = jev && source !== "deterministic" ? "jev" : "det"`.
     7. Trả `{ v: 1, at: now.toISOString(), project, hash, source, shown, error, det, jev, usage, ms: Date.now() - t0, questions }`:
        - `usage` cộng từ hai request, `null` khi không gọi;
        - `questions` là số câu hỏi đã gửi (0 khi không gọi).
  2. `recordPath(dir)`; `readRecord(dir)` (JSON hỏng hoặc thiếu thì `null`); `saveRecord(dir, rec)` (`mkdirSync` recursive, ghi `<file>.<pid>.tmp` rồi `renameSync`).
  3. `suggestCached(args)`:
     - `old = readRecord(dir)`;
     - không `refresh`, `old?.hash === buildState(dir, P).hash` và `old.source === args.source` thì trả `old`;
     - không thì `rec = await suggest(args)`, `saveRecord(dir, rec)`, trả `rec`.
  4. Log lựa chọn:
     - `pickEntry({ record, project, chosen, outcome, now = new Date() })` là hàm thuần. `ranked(side)` = `{ directions: side.directions.slice(0, 3).map((x) => x.id), styles: side.styles.slice(0, 3).map((x) => x.id), mode: side.workflow.mode }`. Trả đúng hình `PickEntry` ở trên, với `jev = record.jev ? ranked(record.jev) : null`, `det = ranked(record.det)`, `chosen.style` và `chosen.mode` là `null` khi không có.
     - `fromOf(id, det, jev, key)`: `null` khi `id` rỗng; còn lại so `det[key].includes(id)` và `jev?.[key].includes(id)` ra `both`, `det`, `jev` hoặc `none`.
     - `appendPick(dir, entry)`: `mkdirSync(dirname(picksLogPath(dir)), { recursive: true })`, rồi `appendFileSync(picksLogPath(dir), JSON.stringify(entry) + "\n")`.
     - `readPickLog(dir)`: thiếu file thì `[]`; tách dòng, `JSON.parse` từng dòng, dòng hỏng thì bỏ qua, chỉ giữ dòng có `v === 1`.
- **Success criteria:** dùng được trong task 2.6.
- **Verify:** no verification needed (task 2.6 kiểm).

### Task 2.6 — Test `tests/suggest.test.mjs`

- **Goal:** mọi nhánh có test với `fetch` giả và `run` giả, không phụ thuộc plugin cài trên máy.
- **Target files:** `tests/suggest.test.mjs` (mới).
- **Steps:**
  1. Dựng `P`:
     - `fakePlugin({ schema: A.NEED.schema, api: 4 })` rồi `A.create({ OPUS_VIDEO_HOME })` để lấy `suggest.modes` thật;
     - ghi đè `commands.directions = "/fake/directions.mjs"`, `commands.styles = "/fake/styles.mjs"`;
     - `library.directionsFile` = fixture;
     - `jev = { keyVar: "SUGGEST_TEST_KEY", envFile: join(tmp, "none.env") }`.
  2. `run` giả nhận `(cmd, args)`:
     - `args[0] === "/fake/directions.mjs"` thì trả `{ code: 0, stdout: JSON.stringify([{ n: 1, id: "A6", tier: "fit", score: 4, why: ["hợp nhóm explainer"], ten_vi: "x", mo_ta_vi: "x" }, { n: 2, id: "A8", tier: "continuous", score: 3, why: [], ten_vi: "y", mo_ta_vi: "y" }, { n: 3, id: "A3", tier: "bold", score: 0, why: [], ten_vi: "z", mo_ta_vi: "z" }]) }`;
     - `args[0] === "/fake/styles.mjs"` thì trả 4 style lấy theo `styles_goi_y` của hướng `--direction` trong fixture, mỗi style `energy: 3`.
  3. Dự án tạm có:
     - `BRIEF.md` với frontmatter `topic: dòng tiền cho chủ doanh nghiệp nhỏ`, `aspect: 16:9`, `category: explainer`, `energy: vua`, `duration_s: 60`, `direction: A1`, `style_profile: glass-keynote`;
     - `script/01.txt` dài 400 từ.
  4. `fetch` giả đọc `JSON.parse(init.body).questions`:
     - mỗi `d<i>` trả `{ type: "score", score: <4 khi ứng viên thứ i có id A6, 3 khi A7, 1 còn lại>, confidence: 0.8 }`;
     - mỗi `s<i>` trả `score: 2`, `confidence: 0.4`;
     - `mode` trả `{ type: "choice", choice: "dao-dien", probabilities: { "dao-dien": 0.7, nhanh: 0.1, "tu-nhac": 0.1, timeline: 0.1 }, confidence: 0.6 }`;
     - kèm `usage: { input_tokens: 100, output_tokens: 0 }`.
     Bản lỗi: một hàm ném lỗi tên `TimeoutError`; một hàm trả 503.
  5. Các test (tên mô tả hành vi, không có mã phase):
     - "deterministic source never calls Jev, even with a key": `env = { SUGGEST_TEST_KEY: "test-key" }`, `source: "deterministic"`. Kiểm fetch gọi 0 lần, `jev === null`, `shown === "det"`, `det.directions.length === 3`.
     - "observe with a key returns both sources and stays under the question budget": `source: "observe"`. Kiểm fetch gọi 2 lần, `jev.directions[0].id === "A6"`, `det.directions[0].id === "A6"`, `questions <= 24`, `shown === "jev"`.
     - "no key falls back with the reason": `env = {}`. Kiểm `error.code === "no-key"`, `jev === null`, `det.directions.length === 3`.
     - "a timeout falls back": `error.code === "timeout"`.
     - "a 503 after the retry falls back and names the status": `error.code === "http"`, `error.message` chứa `503`.
     - "every reason names a BRIEF field or the script": mọi `reason` của `det` và `jev` (hướng, style, workflow) khớp `` /`[a-z_]+|kịch bản/ ``.
     - "the state leaves chosen fields out and keeps 300 script words": `buildState(...).state.brief` không có `direction` hay `style_profile`; `state.script_head.split(" ").length === 300`.
     - "a direction already set skips pitch and choose": `det.workflow.skip` có `pitch` và `choose`.
     - "the cache is reused for the same brief and refreshed on request": gọi `suggestCached` hai lần thì fetch không tăng ở lần hai; thêm `refresh: true` thì tăng.
     - "effectiveSource prefers the setting and falls back to observe": `effectiveSource("x")` bằng `"observe"`; `effectiveSource("jev")` bằng `"jev"`; `effectiveSource(null)` bằng `DEFAULT_SOURCE`; module không export `OBSERVE_UNTIL`.
     - "a pick entry records both rankings and where the choice came from": với record observe ở trên (Jev hạng 1 `A6`), `pickEntry({ record, project: "demo", chosen: { direction: "A7", style: null, mode: "dao-dien" }, outcome: "queued" })` có `jev.directions.length === 3`, `det.directions` bằng `["A6","A8","A3"]`, `direction_from === "jev"` (với `fetch` giả ở bước 4, top 3 của Jev là `A6`, `A7` và một hướng điểm 1; top 3 tất định không có `A7`), `style_from === null`.
     - "the pick log appends one line per choice and skips broken lines": `appendPick` hai lần, nối thêm một dòng rác bằng `appendFileSync`; `readPickLog(dir).length === 2`.
     - "the key never reaches the record": `JSON.stringify(record)` không chứa `test-key`.
- **Success criteria:** test qua; luật provider vẫn qua.
- **Verify:** `cd /Volumes/2/Motion-Studio && node --test tests/suggest.test.mjs tests/provider.test.mjs 2>&1 | command grep -E "^ℹ fail"` in đúng `ℹ fail 0`.

### Task 2.7 — Commit

- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio add lib/suggest.mjs tests/suggest.test.mjs tests/fixtures/suggest/directions.json`
  2. `git -C /Volumes/2/Motion-Studio commit -m "feat(suggest): rank directions, styles and workflow with a deterministic fallback"`
- **Verify:** `git -C /Volumes/2/Motion-Studio status --porcelain | wc -l` in `0`.

## Ghi chú thực thi (2026-10-23)

- Hai câu dự phòng ban đầu (lý do hướng tất định khi không trường nào khớp, và luật chế độ cuối cùng) không nêu trường BRIEF nào, nên test "every reason names a BRIEF field or the script" trượt với fixture cố định. Theo tư vấn của kongming, hai câu đã đổi để nêu đúng các trường đã kiểm; test giữ nguyên.

## Rủi ro và rollback

- Rủi ro: `styles suggest` trả rỗng cho mọi hướng đầu (energy lệch). Đã có bước chạy lại không có `--energy` và lý do ghi rõ.
- Rủi ro: mỗi lần gợi ý chạy tới 7 tiến trình `node` (1 pick + 3 style cho tất định + 3 style cho Jev). Chấp nhận được (mỗi lần dưới 1 s), và có cache theo hash.
- Rollback: `git revert` commit; chưa có code nào khác dùng module.

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
