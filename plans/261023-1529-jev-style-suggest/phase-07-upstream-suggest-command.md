# Phase 7: PR upstream opus-video, ba thay đổi trong một PR

- **Nơi làm:** bản clone tạm `/tmp/opus-video-suggest`, nhánh `feat/studio-suggest-support`. Không sửa `~/.claude/skills/**`; bản cài chỉ được đọc.
- **Phụ thuộc:** không. Phase này độc lập và không chặn phase nào.
- **Song song:** với mọi phase.
- **Effort:** 6h.

## Mục tiêu

Một PR lên `abm-dungtq/opus-video`, gồm ba commit, mỗi commit một thay đổi:

1. Lệnh `suggest` tất định, khai trong `COMMANDS.suggest`.
2. `make-pitch init --directions <A?,A?,…>`, để tạo pitch từ hướng người dùng đã chọn khi dự án chưa có pitch. Lệnh khai trong `COMMANDS.pitchInit`.
3. Op gateway `set_workflow_mode`, ghi `workflow_mode` vào `project.json`, kèm export `OPS` liệt kê mọi op.

Studio đã có sẵn đường phát hiện hai thay đổi sau (phase 1: `P.suggest.pitchInit`, `P.suggest.canSetWorkflowMode`; phase 4 và 5 dùng chúng). Khi PR được gộp và phát hành, Studio tự đổi hành vi mà không phải sửa code. Phase này **không** đổi Studio. Việc Studio dùng lệnh `suggest` thay cho `directions` + `styles` nằm ngoài plan này.

## Hiện trạng đã kiểm (bản cài, chỉ đọc)

- `scripts/studio-api.mjs:19`: `STUDIO_API = 4`. Comment `:3-6`: API được tăng khi một export Studio dựa vào đổi hình dạng.
- Studio chỉ nhận `STUDIO_API` từ 3 đến 4 (`/Volumes/2/Motion-Studio/lib/providers/opus-video.mjs:19`, `:42-43`). Vì vậy PR **không được** tăng `STUDIO_API`: tăng lên 5 sẽ làm Studio đang phát hành từ chối plugin. Ba thay đổi đều là thêm khoá hoặc thêm cờ, không đổi hình dạng export cũ.
- `scripts/studio-api.mjs:29-40`: `COMMANDS` gồm `render`, `mix`, `pitch`, `import`, `demo`, `recipe`, `preflight`, `cases`, `styles` và `choose: { file, args }`. `:14` re-export `patch, undo, redo, …, ACTORS` từ `./gateway.mjs`; chưa có `OPS`.
- `scripts/directions.mjs`:
  - `:44` `loadDirections`;
  - `:126` `scoreDirection(d, { category, aspect, energy, topic })`;
  - `:138-150` `pickDirections(opts, data)` trả `[{ n, id, tier, score, why, direction }]`, một hướng mỗi tầng;
  - `:40-41` `TIERS`, `TIER_VI`.
- `scripts/styles.mjs`: `:106` `loadProfiles`; `:385-388` `suggestStyles(direction, energy, profiles)`; `:66` `ENERGY_RANGE`.
- `scripts/make-pitch.mjs`:
  - `:5-7` cú pháp `init` (`--topic`, `--aspect` bắt buộc);
  - `:51` `frontmatter` từ `./check-viet-pro.mjs`;
  - `:183-199` `init(o, data, up)`, dòng `:199` gọi `pickDirections({ category, aspect, energy, topic, exclude })`, `exclude` lấy từ `brand.banned_directions`;
  - `:304-311` `choose` đòi `pitch/PICK.json`;
  - `:376-385` `parseArgs` nhận mọi `--tên giá-trị`.
- `scripts/gateway.mjs`:
  - `:58` `ACTORS`;
  - `:76` `applyOps(m, ops, { html })`;
  - `:115-238` `switch (op?.op)` với 11 op từ `resize_shot` tới `remove_shot`; `:237-238` op lạ thì ném `OpError`.
- `scripts/manifest.mjs:4-19`: hình dạng `project.json`; chưa có trường `workflow_mode`.
- Test nằm ở `scripts/tests/*.test.mjs` (48 file).
- Remote: `https://github.com/abm-dungtq/opus-video.git`.

## Sở hữu file (trong bản clone)

| Commit | Tạo | Sửa |
|---|---|---|
| 1 `suggest` | `scripts/suggest.mjs`, `scripts/tests/suggest.test.mjs` | `scripts/studio-api.mjs` (khoá `suggest`) |
| 2 `init --directions` | `scripts/tests/make-pitch-directions.test.mjs` | `scripts/make-pitch.mjs`, `scripts/studio-api.mjs` (khoá `pitchInit`) |
| 3 `set_workflow_mode` | `scripts/tests/gateway-workflow-mode.test.mjs` | `scripts/gateway.mjs`, `scripts/manifest.mjs` (comment hình dạng và kiểm giá trị), `scripts/studio-api.mjs` (re-export `OPS`) |
| cả PR | — | `CHANGELOG.md` (một dòng mỗi commit) |

Ba commit làm tuần tự trên cùng nhánh. `studio-api.mjs` được ba commit sửa ở ba chỗ khác nhau.

## Hợp đồng Studio dựa vào

```text
COMMANDS.suggest   = { file: <suggest.mjs>,    args: ["--project", "{project}", "--json"] }
COMMANDS.pitchInit = { file: <make-pitch.mjs>, args: ["init", "--project", "{project}", "--topic", "{topic}",
                       "--aspect", "{aspect}", "--category", "{category}", "--energy", "{energy}",
                       "--directions", "{directions}"] }
OPS                = [..., "set_workflow_mode"]          // mảng tên op, đóng băng
op                 = { op: "set_workflow_mode", mode: "dao-dien" | "nhanh" | "tu-nhac" | "timeline" }
```

Studio thay `{category}` và `{energy}` bằng chuỗi rỗng khi BRIEF không có. Lệnh `init` phải chấp nhận `--category ""` và `--energy ""` (hiện `parseArgs` đã nhận, và `init` dùng `o.energy || "vua"`, `o.category || ""`).

## Các task

### Task 7.1 — Clone và baseline

- **Steps:**
  1. `rm -rf /tmp/opus-video-suggest && git clone https://github.com/abm-dungtq/opus-video.git /tmp/opus-video-suggest`
  2. `git -C /tmp/opus-video-suggest switch -c feat/studio-suggest-support`
  3. `cd /tmp/opus-video-suggest && node --test scripts/tests/*.test.mjs 2>&1 | command grep -E "^ℹ (pass|fail)"`. Ghi số pass làm baseline.
  4. Đối chiếu các dòng trích ở "Hiện trạng đã kiểm" với bản clone: `command grep -n "export function pickDirections\|export function suggestStyles\|choose: Object.freeze\|export function init\|function parseArgs\|case \"remove_shot\"\|export const STUDIO_API" scripts/*.mjs`. Lệch dòng thì dùng vị trí trong bản clone.
  5. `git -C ~/.claude/skills/opus-video status --porcelain 2>/dev/null | wc -l > /tmp/opus-installed-before.txt`
- **Verify:** bước 3 in `ℹ fail 0`.

### Task 7.2 — Commit 1: lệnh `suggest`

- **Goal:** lệnh tất định, không gọi mạng, không ghi file.
- **Target files:** `scripts/suggest.mjs` (mới), `scripts/tests/suggest.test.mjs` (mới), `scripts/studio-api.mjs:29-40`.
- **Steps:**
  1. Comment đầu `suggest.mjs`:
     - lệnh làm gì;
     - không gọi mạng, không ghi file;
     - Studio đọc qua `COMMANDS.suggest`;
     - cách dùng `--project <dir> --json`;
     - đầu ra: `{ "v": 1, "directions": [{ "id", "tier", "tier_vi", "name", "score", "why": [string] }], "styles": { "<id>": [style id] }, "energy": string | null }`;
     - mã thoát: 0 in được, 2 sai đối số hoặc thiếu `BRIEF.md`.
  2. Đọc `BRIEF.md` bằng `frontmatter` từ `./check-viet-pro.mjs`. Lấy `category`, `aspect`, `energy`, `topic`. Lấy `exclude` từ brand theo đúng cách `make-pitch.mjs` làm. Nếu hàm tìm brand của `make-pitch.mjs` không được export, export nó (không đổi hành vi) thay vì chép lại.
  3. `picks = pickDirections({ category, aspect, energy, topic, exclude }, loadDirections())`. Mỗi hướng ra `{ id, tier, tier_vi: TIER_VI[tier], name: direction.ten_vi, score, why }`; `why` lấy thẳng từ `pickDirections`.
  4. `styles[id] = suggestStyles(direction, ENERGY_RANGE[energy] ? energy : "", loadProfiles())`.
  5. Có `--json` thì in JSON một dòng; không có thì in bảng ngắn tiếng Việt. Dùng `wantsHelp`/`helpText` từ `./cli-help.mjs`.
  6. Trong `COMMANDS`, thêm ngay sau `styles`: `suggest: Object.freeze({ file: script("suggest.mjs"), args: Object.freeze(["--project", "{project}", "--json"]) }),`. Comment trên `COMMANDS` thêm: "suggest prints three directions (one per tier) and their styles as JSON."
  7. Test:
     - "prints three directions, one per tier, for a brief": BRIEF tạm `category: explainer`, `aspect: 16:9`, `energy: vua`; 3 hướng, tầng đúng `fit`, `continuous`, `bold`, mỗi hướng có `why` là mảng;
     - "styles follow the energy": `energy: em`; mọi style trả về có energy nằm trong `ENERGY_RANGE.em`;
     - "exits 2 without BRIEF.md";
     - "same brief, same answer": hai lần chạy cùng stdout;
     - "the command is declared for Studio": `COMMANDS.suggest.args` chứa `{project}`, file tồn tại.
  8. Thêm một dòng vào mục chưa phát hành của `CHANGELOG.md`.
  9. `git add scripts/suggest.mjs scripts/tests/suggest.test.mjs scripts/studio-api.mjs CHANGELOG.md` (và `make-pitch.mjs` nếu phải export hàm brand), rồi `git commit -m "feat(studio-api): declare a deterministic suggest command" -m "Prints three directions, one per tier, with the reasons and the styles that fit the energy, as JSON."`
- **Verify:**
  - `cd /tmp/opus-video-suggest && node scripts/suggest.mjs --project /Volumes/2/Edit-Video/thuy-mau-demo --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.v, r.directions.length, r.directions.map(d=>d.tier).join(","))})'` in `1 3 fit,continuous,bold`.
  - `cd /tmp/opus-video-suggest && node --test scripts/tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 7.3 — Commit 2: `make-pitch init --directions`

- **Goal:** tạo pitch từ danh sách hướng cho trước thay vì ba hướng tất định, để Studio chọn được hướng không nằm trong pitch tất định.
- **Target files:** `scripts/make-pitch.mjs` (comment cú pháp `:5-7`, comment `init` `:19-28`, hàm `init` `:183-199`), `scripts/studio-api.mjs`, `scripts/tests/make-pitch-directions.test.mjs` (mới).
- **Steps:**
  1. Cú pháp: thêm `[--directions <A?,A?,…>]` vào dòng `init` ở comment đầu file. Thêm vào comment `init`: "--directions replaces the pick: 1 to 3 direction ids in the given order become picks 1..n, each keeps its own tier; ids must exist, be unique, fit --aspect and not be banned by the brand (exit 2 otherwise)."
  2. Trong `init`, thay dòng `:199` bằng:
     - `o.directions` có giá trị: tách theo dấu phẩy, `trim`. Số id ngoài 1–3, id trùng, id không có trong `data.directions`, id có `aspects` không chứa `o.aspect` (đúng luật lọc của `pickDirections`, `directions.mjs:140`), hoặc id nằm trong `banned_directions` của brand thì trả `{ code: 2, msg: <câu nêu id và lý do> }`. Còn lại `picks = ids.map((id, i) => { const d = data.directions.find((x) => x.id === id); const s = scoreDirection(d, { category, aspect, energy, topic }); return { n: i + 1, id, tier: d.tier, score: s.score, why: s.why, direction: d }; })`.
     - không có `o.directions`: giữ nguyên lời gọi `pickDirections`.
     - Kiểm bằng đọc code rằng `scoreDirection` trả `{ score, why }`. Nếu không, dùng đúng hình nó trả và ghi vào mô tả PR.
  3. Phần còn lại của `init` không đổi: `PICK.json`, thư mục `pitch/<n>-<slug>/`, style mặc định mỗi pick.
  4. Trong `COMMANDS`, thêm sau `choose`: `pitchInit: Object.freeze({ file: script("make-pitch.mjs"), args: Object.freeze(["init", "--project", "{project}", "--topic", "{topic}", "--aspect", "{aspect}", "--category", "{category}", "--energy", "{energy}", "--directions", "{directions}"]) }),`. Comment trên `COMMANDS` thêm: "pitchInit builds the pitch from directions the user already chose ({directions}: comma-separated ids, first is pick 1); Studio fills {topic}, {aspect}, {category}, {energy} from BRIEF.md, empty when missing."
  5. Test, theo mẫu test `make-pitch` có sẵn trong `scripts/tests/`. Nếu `init` đòi skill HyperFrames có trên máy (`up.anim`, `up.faceless`, `up.creative`), gọi thẳng `init(o, data, up)` với `up` giả có ba trường đó:
     - "--directions keeps the given order and each direction's tier": `--directions A8,A6` thì `PICK.json` có `picks[0].id === "A8"`, `picks[0].n === 1`, `picks[1].id === "A6"`, và `tier` khớp `directions.json`;
     - "--directions rejects unknown, repeated or too many ids": `A9`, `A6,A6`, `A1,A2,A3,A4` đều trả `code 2`;
     - "--directions rejects a direction banned by the brand": brand giả có `banned_directions: ["A8"]` thì `--directions A8` trả `code 2`;
     - "without --directions the pick is unchanged": cùng đầu vào, `PICK.json` giống hệt khi chạy bản trước thay đổi (so `id` và `n`);
     - "empty --category and --energy are accepted": `{ category: "", energy: "" }` không trả `code 2`;
     - "pitchInit is declared with every placeholder Studio fills": `COMMANDS.pitchInit.args` chứa đủ `{project}`, `{topic}`, `{aspect}`, `{category}`, `{energy}`, `{directions}`.
  6. Thêm một dòng `CHANGELOG.md`. `git add scripts/make-pitch.mjs scripts/studio-api.mjs scripts/tests/make-pitch-directions.test.mjs CHANGELOG.md`, rồi `git commit -m "feat(make-pitch): build a pitch from chosen directions" -m "init --directions takes one to three direction ids in order; COMMANDS.pitchInit declares it for Studio."`
- **Verify:**
  - `cd /tmp/opus-video-suggest && node --test scripts/tests/make-pitch-directions.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.
  - `cd /tmp/opus-video-suggest && node --test scripts/tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 7.4 — Commit 3: op `set_workflow_mode` và export `OPS`

- **Goal:** gateway ghi được chế độ vận hành của dự án, và Studio đọc được danh sách op.
- **Target files:** `scripts/gateway.mjs` (`:58` gần `ACTORS`, `:115-238` `switch`), `scripts/manifest.mjs` (`:4-19` comment hình dạng, hàm kiểm), `scripts/studio-api.mjs:14`, `scripts/tests/gateway-workflow-mode.test.mjs` (mới).
- **Steps:**
  1. Trong `gateway.mjs`, ngay dưới `ACTORS`:
     - `export const WORKFLOW_MODES = Object.freeze(["dao-dien", "nhanh", "tu-nhac", "timeline"]);`
     - `export const OPS = Object.freeze([<11 tên op hiện có theo thứ tự trong switch>, "set_workflow_mode"]);`
     - comment: "OPS names every op applyOps accepts; Studio checks it before sending one."
  2. Thêm nhánh trước `default:`:
     ```js
     case "set_workflow_mode": {
       if (!WORKFLOW_MODES.includes(op.mode)) throw new OpError(`workflow_mode phải là một trong ${WORKFLOW_MODES.join(", ")}`);
       receipt.push(`chế độ vận hành: ${next.workflow_mode ?? "chưa đặt"} → ${op.mode}`);
       next.workflow_mode = op.mode;
       break;
     }
     ```
     Đọc `applyOps` để chắc `next` là bản sao và `receipt` là tên biến đúng. Lệch thì dùng đúng tên có trong code.
  3. Thêm test (cùng file test) rằng mọi tên trong `OPS` có nhánh `case` trong `applyOps`: với mỗi tên khác `set_workflow_mode`, gọi `applyOps` với op thiếu tham số thì lỗi **không** phải `op không hợp lệ`.
  4. `manifest.mjs`: thêm `workflow_mode?` vào comment hình dạng (`"dao-dien"|"nhanh"|"tu-nhac"|"timeline"`, tuỳ chọn). Trong hàm kiểm, khi trường có mặt mà không thuộc danh sách thì thêm lỗi tiếng Việt. Import danh sách từ `gateway.mjs` nếu không tạo vòng import; có vòng thì đặt `WORKFLOW_MODES` trong `manifest.mjs` và để `gateway.mjs` import từ đó.
  5. `studio-api.mjs:14`: thêm `OPS` vào dòng re-export từ `./gateway.mjs`. Comment API thêm: "OPS lists the gateway ops (set_workflow_mode writes project.json workflow_mode); added without a STUDIO_API bump because nothing existing changes shape."
  6. Test:
     - "set_workflow_mode writes the mode and a receipt": manifest mẫu, `applyOps(m, [{ op: "set_workflow_mode", mode: "nhanh" }])` cho `workflow_mode === "nhanh"`, receipt có `nhanh`;
     - "an unknown mode is refused": `mode: "khac"` ném `OpError`;
     - "patch by the human actor bumps the version": `patch(dir, { actor: "human", base, ops: [{ op: "set_workflow_mode", mode: "dao-dien" }] })` thành công và `version` tăng 1;
     - "a manifest without workflow_mode still validates, a wrong one does not";
     - "OPS lists every op applyOps accepts" (bước 3);
     - "OPS is exported to Studio": `import("../studio-api.mjs")` có `OPS.includes("set_workflow_mode")`.
  7. Thêm một dòng `CHANGELOG.md`. `git add scripts/gateway.mjs scripts/manifest.mjs scripts/studio-api.mjs scripts/tests/gateway-workflow-mode.test.mjs CHANGELOG.md`, rồi `git commit -m "feat(gateway): add set_workflow_mode and export OPS" -m "Writes project.json workflow_mode through the gateway; OPS lets Studio check an op before sending it."`
- **Verify:**
  - `cd /tmp/opus-video-suggest && node -e 'import("./scripts/studio-api.mjs").then(m=>console.log(m.STUDIO_API, m.OPS.includes("set_workflow_mode"), Boolean(m.COMMANDS.suggest), Boolean(m.COMMANDS.pitchInit)))'` in `4 true true true`.
  - `cd /tmp/opus-video-suggest && node --test scripts/tests/*.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`, và số pass lớn hơn baseline.

### Task 7.5 — Kiểm Studio nhận bản plugin mới

- **Goal:** chứng minh Studio phát hiện đúng hai tính năng trên bản clone mà không sửa Studio.
- **Steps:**
  1. `cd /Volumes/2/Motion-Studio && OPUS_VIDEO_HOME=/tmp/opus-video-suggest node -e 'import("./lib/provider.mjs").then(async m=>{const p=await m.loadProvider();console.log(p.api, Boolean(p.suggest.pitchInit), p.suggest.canSetWorkflowMode)})'`
  2. Chỉ chạy khi phase 1 đã có trên nhánh đang checkout của Studio. Chưa có thì ghi "chưa kiểm được, phase 1 chưa gộp" vào mô tả PR và bỏ Verify của task này.
- **Verify:** bước 1 in `4 true true`.

### Task 7.6 — Push và PR

- **Steps:**
  1. `git -C /tmp/opus-video-suggest log --oneline origin/main..HEAD`, phải đúng 3 commit.
  2. `git -C /tmp/opus-video-suggest push -u origin feat/studio-suggest-support`. Bị từ chối quyền thì `gh repo fork abm-dungtq/opus-video --remote --remote-name fork`, rồi push lên `fork`.
  3. Viết `/tmp/opus-suggest-pr.md` bằng tiếng Việt. Nội dung gồm:
     - ba thay đổi, mỗi thay đổi một đoạn, nêu commit tương ứng;
     - hợp đồng ở mục "Hợp đồng Studio dựa vào";
     - lý do không tăng `STUDIO_API` (Studio chỉ nhận 3–4);
     - cách kiểm và kết quả task 7.5.
     Không ghi công AI, không có Co-Authored-By.
  4. `gh pr create --repo abm-dungtq/opus-video --base main --head <owner>:feat/studio-suggest-support --title "feat: hỗ trợ thẻ gợi ý của Studio (suggest, init --directions, set_workflow_mode)" --body-file /tmp/opus-suggest-pr.md`
  5. Không cài bản clone vào `~/.claude/skills`. Để lại `/tmp/opus-video-suggest`.
- **Verify:**
  - `git -C /tmp/opus-video-suggest log --oneline origin/main..HEAD | wc -l` in `3` (chạy trước bước 2).
  - `gh pr list --repo abm-dungtq/opus-video --head feat/studio-suggest-support --json state -q '.[0].state'` in `OPEN`.
  - `git -C /tmp/opus-video-suggest log origin/main..HEAD --format=%B | command grep -ciE "co-authored-by|claude"` in `0`.
  - `git -C ~/.claude/skills/opus-video status --porcelain 2>/dev/null | wc -l | diff - /tmp/opus-installed-before.txt && echo same` in `same`.

## Rủi ro và rollback

- Rủi ro: chủ repo chỉ nhận một phần PR. Mỗi commit đứng riêng được: Studio phát hiện từng tính năng độc lập (`pitchInit`, `OPS`), thiếu cái nào thì giữ hành vi hiện tại cho cái đó.
- Rủi ro: `init --directions` tạo pitch có hướng không hợp `energy`. `choose` của plugin vẫn kiểm phối và trả cảnh báo như cũ; Studio chạy `choose` với `--accept-warnings` như hiện nay.
- Rủi ro: thêm trường `workflow_mode` làm plugin cũ báo lỗi `project.json`. Hàm kiểm hiện tại không từ chối trường lạ (`manifest.mjs` không có luật trường lạ). Test "a manifest without workflow_mode still validates" giữ chiều ngược lại.
- Rollback: đóng PR hoặc revert từng commit. Bản cài không bị đụng; Studio không đổi.

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
