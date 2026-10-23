# Phase 8: Quyết định nguồn mặc định sau 30 lượt chọn thật

- **Nhánh:** cắt nhánh mới `feat/suggest-default-source` từ `main` sau khi PR của phase 6 đã gộp.
- **Phụ thuộc:** phase 6 đã phát hành; log có ít nhất 30 lượt hợp lệ (định nghĩa "lượt" ở phase 3).
- **Song song:** không có. Phase chạy một mình, muộn hơn các phase khác (có thể sau nhiều tuần).
- **Effort:** 1h.
- **Điều kiện bắt đầu:** task 8.1 in `decision: jev` hoặc `decision: deterministic`. In `decision: wait` thì chưa tới lúc làm phase này. Đó không phải lỗi: dừng, ghi số lượt hiện có, và hẹn chạy lại.

## Mục tiêu

Áp quyết định mà người dùng đã chọn: "ghi lựa chọn thật, quyết sau 30 lượt".

- Jev hơn tất định ít nhất 10 điểm hit@3 trên các lượt thật thì `DEFAULT_SOURCE = "jev"`.
- Không đạt thì `DEFAULT_SOURCE = "deterministic"`. Đường Jev vẫn giữ nguyên trong code, và bật lại được bằng `"suggest": { "source": "observe" }` hoặc `"jev"` trong `studio.json`.

## Hiện trạng đã kiểm

- `lib/suggest.mjs` export `DEFAULT_SOURCE = "observe"` và `effectiveSource(setting)` (phase 2). Không có `OBSERVE_UNTIL`.
- `lib/config.mjs` có `suggestSetting()` đọc `studio.json` `suggest.source` (phase 4). Thiết lập này luôn thắng `DEFAULT_SOURCE`.
- `scripts/suggest-eval.mjs --picks` đọc `<root>/*/.opus/suggest/picks.jsonl` và in đúng một dòng `decision:` (phase 3).
- Root Studio của người dùng là `/Volumes/2/Edit-Video`.

## Sở hữu file

- Sửa: `lib/suggest.mjs` (chỉ dòng `DEFAULT_SOURCE` và comment ngay trên nó), `tests/suggest.test.mjs` (chỉ test mặc định của `effectiveSource`), `docs/suggest.md` (mục nguồn mặc định), `CHANGELOG.md` (một dòng).
- Tạo: `plans/261023-1529-jev-style-suggest/reports/suggest-picks-<YYMMDD>.json`.

## Các task

### Task 8.1 — Đo trên log thật

- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio switch main && git -C /Volumes/2/Motion-Studio pull --ff-only`
  2. `cd /Volumes/2/Motion-Studio && node scripts/suggest-eval.mjs --picks --root /Volumes/2/Edit-Video --out plans/261023-1529-jev-style-suggest/reports/suggest-picks-$(date +%y%m%d).json > /tmp/suggest-picks.log 2>&1; echo "exit $?" >> /tmp/suggest-picks.log`
  3. `command grep -E "^(picks|decision)" /tmp/suggest-picks.log`
- **Success criteria:** đúng một dòng `decision:`.
- **Verify:**
  - `command grep -c "^exit 0$" /tmp/suggest-picks.log` in `1`.
  - `command grep -cE "^decision: (jev|deterministic|wait) \([0-9]+/30" /tmp/suggest-picks.log` in `1`.
  - Dòng `decision:` là `wait`: dừng phase theo mục "Điều kiện bắt đầu" và báo người dùng số lượt hiện có. Đây không phải Verify trượt.

### Task 8.2 — Áp quyết định

- **Target files:** `lib/suggest.mjs`, dòng `export const DEFAULT_SOURCE`; `tests/suggest.test.mjs`, test "effectiveSource prefers the setting and falls back to observe".
- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio switch -c feat/suggest-default-source`
  2. `decision: jev` thì đặt `export const DEFAULT_SOURCE = "jev";`. `decision: deterministic` thì đặt `export const DEFAULT_SOURCE = "deterministic";`.
  3. Comment ngay trên dòng đó, tiếng Anh, không mã phase: `// Chosen from <n> real picks on <YYYY-MM-DD> (plans/261023-1529-jev-style-suggest/reports/suggest-picks-<YYMMDD>.json): Jev minus deterministic = <x> points hit@3, threshold 10. studio.json suggest.source overrides it.`
  4. Sửa test mặc định: đổi tên test thành "effectiveSource prefers the setting and falls back to the default source", và đổi `effectiveSource("x")` sang so với giá trị mới. Giữ `effectiveSource("observe") === "observe"` và `effectiveSource("jev") === "jev"`, vì đường Jev vẫn bật lại được.
  5. Không xoá `jevDirections`, `lib/jev.mjs` hay chế độ `observe`.
- **Verify:**
  - `cd /Volumes/2/Motion-Studio && node -e 'const d=require("fs").readFileSync("/tmp/suggest-picks.log","utf8").match(/^decision: (\w+)/m)[1];import("./lib/suggest.mjs").then(m=>console.log(m.DEFAULT_SOURCE===d, m.effectiveSource("observe"), m.effectiveSource("jev")))'` in `true observe jev`.
  - `cd /Volumes/2/Motion-Studio && node --test tests/suggest.test.mjs tests/suggest-routes.test.mjs 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.

### Task 8.3 — Tài liệu, báo người dùng, commit, PR

- **Steps:**
  1. `docs/suggest.md`, mục nguồn mặc định: ghi nguồn mới, số lượt, hit@1 và hit@3 của từng nguồn, số điểm chênh, và cách bật lại nguồn kia trong `studio.json`.
  2. `CHANGELOG.md`: một dòng trong `## Chưa phát hành`, nêu nguồn mặc định mới và lý do bằng số.
  3. Gửi người dùng (tiếng Việt):
     - jev: "Sau <n> lượt chọn thật, gợi ý của Jev trúng hướng bạn chọn (hit@3) <d>%, tất định <b>%, hơn <x> điểm. Từ bản này thẻ chỉ hiện gợi ý Jev, kèm nhãn nguồn. Muốn xem lại cả hai nguồn thì đặt `"suggest": { "source": "observe" }` trong `studio.json`."
     - deterministic: "Sau <n> lượt chọn thật, Jev trúng hướng bạn chọn (hit@3) <d>%, tất định <b>%, chênh <x> điểm, chưa tới 10 điểm. Từ bản này thẻ dùng gợi ý tất định. Đường Jev vẫn còn; muốn bật lại thì đặt `"suggest": { "source": "observe" }` hoặc `"jev"` trong `studio.json`."
  4. `git -C /Volumes/2/Motion-Studio add lib/suggest.mjs tests/suggest.test.mjs docs/suggest.md CHANGELOG.md plans/261023-1529-jev-style-suggest/reports/`
  5. `git -C /Volumes/2/Motion-Studio commit -m "feat(suggest): set the default source from real picks"`
  6. `git -C /Volumes/2/Motion-Studio push -u origin feat/suggest-default-source`, rồi `gh pr create --repo abm-dungtq/motion-studio --base main --head feat/suggest-default-source --title "feat(suggest): đặt nguồn gợi ý mặc định theo lựa chọn thật" --body-file /tmp/suggest-default-pr.md`. Body tiếng Việt gồm số liệu của task 8.1 và câu đã gửi người dùng. Không ghi công AI, không có Co-Authored-By.
- **Verify:**
  - `cd /Volumes/2/Motion-Studio && npm test 2>&1 | command grep -E "^ℹ fail"` in `ℹ fail 0`.
  - `gh pr view feat/suggest-default-source --repo abm-dungtq/motion-studio --json state -q .state` in `OPEN`.
  - `git -C /Volumes/2/Motion-Studio log -1 --format=%B | command grep -ciE "co-authored-by|claude"` in `0`.

## Rủi ro và rollback

- Rủi ro: log lệch về nguồn hiện trước. Thẻ quan sát đã hiện hai cột ngang nhau và không chọn sẵn (phase 5). Báo cáo ghi thêm `from` (số lượt người dùng chọn hướng chỉ có ở Jev, chỉ có ở tất định, có ở cả hai, hay không có ở đâu), để người đọc tự đánh giá.
- Rủi ro: 30 lượt dồn vào vài dự án. Báo cáo JSON có `project` từng dòng; số dự án khác nhau dưới 5 thì ghi rõ vào câu gửi người dùng.
- Rollback: revert commit; `DEFAULT_SOURCE` quay về `observe`. Thiết lập `studio.json` của người dùng không bị đụng.

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
