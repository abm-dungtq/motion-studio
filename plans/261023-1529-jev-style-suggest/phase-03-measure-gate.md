# Phase 3: Script đo, lần đo đầu và bộ đếm lượt chọn thật

- **Nhánh:** chạy song song với phase 4 hoặc 5 thì dùng worktree `/Volumes/2/Motion-Studio/.claude/worktrees/suggest-eval` (gọi tắt `$W`), nhánh `feat/jev-style-suggest-eval`, cắt từ `feat/jev-style-suggest` sau phase 2. Chạy tuần tự thì làm thẳng trên checkout chính (`$W=/Volumes/2/Motion-Studio`) và bỏ task 3.0, task 3.6.
- **Phụ thuộc:** phase 2.
- **Song song:** với phase 4, 5 và 7. Phase này không chặn UI.
- **Effort:** 4h. Chi phí Jev ước tính dưới 0,05 USD.

## Mục tiêu

`scripts/suggest-eval.mjs` có hai chế độ:

1. **Lần đo đầu** trên 14 mục có nhãn và hai tập proxy. Kết quả chỉ ghi vào báo cáo để tham khảo, **không quyết định gì** và không đổi `DEFAULT_SOURCE`.
2. **`--picks`**: đọc log lựa chọn thật `<root>/*/.opus/suggest/picks.jsonl` (do route chọn ghi, xem phase 2 và 4). Script tính hit@1 và hit@3 của từng nguồn, áp ngưỡng 10 điểm hit@3, và in một dòng `decision: jev | deterministic | wait (<n>/30)`. Việc áp quyết định nằm ở phase 8, chạy khi log đủ 30 lượt.

Người dùng đã chọn cách đo này: "ghi lựa chọn thật, quyết sau 30 lượt". Trong lúc chờ, `DEFAULT_SOURCE` là `observe` (đặt ở phase 2), nên thẻ hiện cả hai nguồn.

## Hiện trạng đã kiểm (nhãn có được)

- **Nhãn vàng từ case (8 mục):** trường `cases` của từng hướng trong `directions.json`:
  - A1: `y:thegrootdev-966114`, `y:verbove-268381`;
  - A2: `y:twoclipping-496100`, `y:demonugc-525162`;
  - A3: `y:raphaelaubryy-687877`, `y:techhalla-498547`;
  - A4: `y:annacher-433425`, `y:demonugc-525162`;
  - A5: `y:koldo2k-778767`;
  - A6–A8: không có.
  `y:demonugc-525162` thuộc cả A2 và A4, nên tập nhãn của nó là `{A2, A4}`. Cả 8 case đều có `has_full_prompt: true`.
- **Nhãn vàng từ dự án:** `/Volumes/2/Edit-Video/*/BRIEF.md` có `direction:` ở 6 dự án:
  - `dratelling-dna-pixel-9x16` A8;
  - `gemini-argon-dot2-9x16` A2;
  - `ov2-e2e-daodien` A3;
  - `ov2-e2e-tunhac` A3;
  - `ov3-e2e-cuachinh` A5;
  - `thuy-mau-demo` A5.
  Dự án thứ 7, `bds-hoa-chu-9x16`, chỉ có `style_profile`.
- **Thiên lệch đã biết:**
  - 6 dự án chọn hướng từ ba pitch tất định, nên tất định gần như chắc trúng hit@3 trên chúng.
  - Gộp lại, tập vàng có 14 mục; một mục bằng 7,1 điểm. Nếu tất định trúng ≥ 13/14 thì Jev không thể hơn 10 điểm.
- **Style:** 7 dự án ghi `style_profile`:
  - `pixel-arcade`, `variety-captions`, `lemo-watercolor` không nằm trong `styles_goi_y` của hướng nào, nên không phương án nào chạm tới (lỗ dữ liệu);
  - còn lại `swiss-kinetic-editorial` và `kinetic-typography` (A3), `holographic-hud` (A5);
  - ở `gemini-argon-dot2-9x16`, BRIEF không ghi style.
- **Proxy theo category:** `cases.jsonl` có `category` (motion 529, explainer 171, 3d 141, interactive 107, story-music 86, product 74), cùng từ vựng với `directions[].categories`. Proxy này có lợi cho tất định, vì `scoreDirection` cộng 3 khi khớp category (`directions.mjs:129`).
- **Proxy theo genre:** `case-features.jsonl` có `genre`, do chính Jev gắn (`case-features.mjs:1-12`). Proxy này có lợi cho Jev.
- **Chế độ vận hành:** không có nhãn, nên không đo offline.

## Quyết định thiết kế phép đo

- **Lần đo đầu:** tính trên **tập vàng** (8 case + 6 dự án = 14 mục) và hai proxy. Cả ba chỉ để tham khảo; dòng tóm tắt là `baseline:`, không phải quyết định.
- **Phép đo quyết định (`--picks`):**
  - Một **lượt** là một cặp (dự án, `hash` state) có `jev` khác `null`. Nhiều lần bấm trên cùng brief (ví dụ `not_in_pitch` rồi chọn lại) chỉ giữ dòng cuối. Dòng không có `jev` (không khoá, Jev lỗi, nguồn `deterministic`) không tính, vì không so được hai nguồn trên cùng brief.
  - Trúng hit@k của một nguồn: `chosen.direction` nằm trong `k` id đầu của `directions` của nguồn đó.
  - Ngưỡng: `gateOf` như dưới, trên `n` lượt. `n < 30` thì `decision: wait`. Đủ 30 lượt: `pass` thì `jev`, không thì `deterministic`.
  - Style báo hit@1 và hit@3 để tham khảo, không vào quyết định (hợp đồng đã duyệt chỉ đặt cổng trên hướng).
  - Thiên lệch đã biết: thẻ quan sát có thể kéo người dùng về nguồn hiện trước. Phase 5 giảm bằng cách hiện hai cột ngang nhau và không chọn sẵn hướng nào trong chế độ quan sát. Báo cáo ghi rõ phần thiên lệch còn lại.
- "Trúng" nghĩa là danh sách top-k giao với tập nhãn khác rỗng.
- Hit@3 của tất định là ba hướng của `directions pick` (đúng sản phẩm đang chạy, mỗi tầng một hướng). Hit@1 là hướng `n: 1`.
- Hit@3 của Jev là ba hướng điểm cao nhất của `jevDirections`.
- Script in thêm `gate_reachable` để ai đọc cũng thấy khi nào cổng không thể đạt.
- State của dự án là `buildState` (đã bỏ `direction`, `style_profile`, `styleframe`…). State của case là `{ brief: { category, title }, script_head: <300 từ đầu prompt> }`. Hai phương án cùng nhận một input.
- Bảng `GENRE_MAP` (chỉ cho proxy genre, planner viết tay theo mô tả hướng; chép nguyên văn):
  ```js
  export const GENRE_MAP = {
    software_launch_demo: ["A2", "A1", "A4"], app_tutorial_walkthrough: ["A4", "A2"],
    product_promo_ad: ["A1", "A3"], brand_motion_intro: ["A1", "A3"], kinetic_typography: ["A3"], music_video: ["A3"],
    data_infographic: ["A6", "A8"], educational_explainer: ["A6", "A7", "A8"], news_recap: ["A7"], story_animation: ["A7"],
    scene_3d: ["A5"],
  };
  ```
  Genre không có trong bảng (`generative_art`, `game_interactive`, `footage_edit_recap`, `talking_head_podcast`, `other`) thì bỏ khỏi proxy.

## Sở hữu file

- Tạo: `scripts/suggest-eval.mjs`, `tests/suggest-eval.test.mjs`, `plans/261023-1529-jev-style-suggest/reports/suggest-eval-<YYMMDD>.json`.
- Không sửa file có sẵn nào. `lib/suggest.mjs` chỉ được đọc (import `readPickLog`, `suggest`…).
- Không chạm file của phase 4 và 5 (`gates.mjs`, `director.mjs`, `routes/**`, `lib/tools/**`, `lib/config.mjs`, `ui/**`).

## Các task

### Task 3.0 — Worktree (chỉ khi chạy song song với phase 4)

- **Goal:** worktree riêng trên nhánh riêng.
- **Steps:**
  1. `git -C /Volumes/2/Motion-Studio worktree add .claude/worktrees/suggest-eval -b feat/jev-style-suggest-eval feat/jev-style-suggest`
- **Verify:** `git -C /Volumes/2/Motion-Studio/.claude/worktrees/suggest-eval branch --show-current` in `feat/jev-style-suggest-eval`.
- Ghi chú: `npm test` cần `ui/`. Nếu chạy `npm test` trong worktree thì trước đó chạy `npm --prefix /Volumes/2/Motion-Studio/.claude/worktrees/suggest-eval/ui ci --no-audit --no-fund`. Các Verify của phase này chỉ dùng `node --test`, nên không bắt buộc.

### Task 3.1 — Hàm thuần của script

- **Goal:** các phép tính quyết định có test riêng, không cần mạng.
- **Target files:** `$W/scripts/suggest-eval.mjs` (mới). Export `hitAt`, `sampleBy`, `gateOf`, `pickStats`, `MIN_PICKS`, `GENRE_MAP`, `ASPECT_OF`.
- **Steps:**
  1. Comment đầu file:
     - cách dùng `node scripts/suggest-eval.mjs [--root <dir>] [--sample <n>] [--seed <n>] [--out <file>] [--no-jev]` (lần đo trên nhãn) và `node scripts/suggest-eval.mjs --picks [--root <dir>] [--min <n>] [--out <file>]` (lựa chọn thật);
     - nguồn nhãn và thiên lệch của từng tập (chép ý ở mục "Quyết định thiết kế phép đo"); nói rõ lần đo trên nhãn chỉ để tham khảo, còn `--picks` ra quyết định;
     - mã thoát: `0` chạy xong (kể cả `decision: wait`), `2` sai cú pháp, `3` không dùng được Jev (không khoá, hoặc hơn 20% câu gọi Jev lỗi) ở chế độ nhãn khi không có `--no-jev`. `--picks` không gọi Jev và không cần khoá.
     Không nêu tên plugin.
  2. `hitAt(ranked, labels, k)` trả `ranked.slice(0, k).some((id) => labels.includes(id))`.
  3. `sampleBy(rows, keyFn, perGroup, seed)`:
     - nhóm theo `keyFn`;
     - mỗi nhóm trộn bằng PRNG mulberry32 từ `seed`, giữ `perGroup` đầu;
     - nhóm duyệt theo tên sắp xếp; kết quả tất định với cùng `seed`.
  4. `gateOf({ n, detHits, jevHits, min = 10 })` trả:
     - `diff_points = round1((jevHits - detHits) / n * 100)`;
     - `reachable = (n - detHits) / n * 100 >= min`;
     - `pass = n > 0 && diff_points >= min`.
  5. `ASPECT_OF = { vertical: "9:16", horizontal: "16:9", multiple: "both" }` (thiếu khoá thì `"16:9"`). `GENRE_MAP` như trên.
  6. `export const MIN_PICKS = 30;` và `pickStats(entries, { min = MIN_PICKS } = {})`:
     - giữ dòng có `jev` khác `null`; gom theo `` `${project}\u0000${hash}` ``, giữ dòng có `at` lớn nhất;
     - `n` = số lượt; với mỗi nguồn `s` trong `det`, `jev`: `hit1` và `hit3` là số lượt trúng, dạng phần trăm một số lẻ;
     - style: chỉ các lượt có `chosen.style`, cùng cách tính, trả `styles: { n, det: { hit1, hit3 }, jev: { hit1, hit3 } }`;
     - `from`: đếm `direction_from` theo `jev`, `det`, `both`, `none`;
     - `gate = gateOf({ n, detHits: <số lượt det trúng hit@3>, jevHits: <số lượt jev trúng hit@3> })`;
     - `decision = n < min ? "wait" : gate.pass ? "jev" : "deterministic"`;
     - trả `{ n, min, det, jev, styles, from, gate, decision }`.
- **Verify:** no verification needed (task 3.3 kiểm).

### Task 3.2 — Chạy đo

- **Goal:** script chạy đầu cuối trên dữ liệu thật qua provider, ở cả hai chế độ.
- **Target files:** `$W/scripts/suggest-eval.mjs`, hàm `main` có guard `isMain` (mẫu ở `mcp/studio-mcp.mjs:85-87`).
- **Steps:**
  1. Đọc đối số. Mặc định: `--root /Volumes/2/Edit-Video`, `--sample 15`, `--seed 1`.
  2. Nạp dữ liệu:
     - `P = await loadProvider()`;
     - `candidates = loadCandidates(P)`;
     - đọc `P.library.casesFile`, `P.library.caseFeaturesFile` (JSON lines);
     - `key = readKey({ keyVar: P.jev.keyVar, envFile: P.jev.envFile })`;
     - không có khoá mà không có `--no-jev` thì in `jev: chưa có khoá` rồi thoát mã 3. Không in khoá.
  3. Dựng bốn tập:
     - `gold_cases`: case có id trong `candidates[].cases`; nhãn là các hướng liệt kê nó.
     - `gold_projects`: thư mục con của `--root` có `BRIEF.md` mà `frontmatterOf(...).direction` khớp `^A[1-8]$`; nhãn là `[direction]`.
     - `proxy_category`: `sampleBy` các case có `has_full_prompt`, không `upstream_removed`, không thuộc `gold_cases`, nhóm theo `category`, `perGroup = --sample`; nhãn là các hướng có `categories` chứa category của case.
     - `proxy_genre`: `sampleBy` các case cùng điều kiện, có `genre` thuộc khoá `GENRE_MAP`, nhóm theo `genre`; nhãn là `GENRE_MAP[genre]`.
  4. Với mỗi case:
     - `fm = { category, aspect: ASPECT_OF[feature.aspect] ?? "16:9", topic: title + " " + 60 từ đầu prompt }`;
     - `state = { brief: { category, title }, script_head: 300 từ đầu prompt }`;
     - `det = (await detDirections({ fm, topic: fm.topic, P })).map((x) => x.id)`;
     - `jev = (await jevDirections({ state, fm, candidates, key })).items?.map((x) => x.d.id) ?? null`.
  5. Với mỗi dự án vàng: `rec = await suggest({ dir, project, P, source: "observe" })`:
     - `det = rec.det.directions.map((x) => x.id)`;
     - `jev = rec.jev?.directions.map((x) => x.id) ?? null`.
     - Style: nhãn `fm.style_profile` khi có. Không có trong `styles_goi_y` của hướng nào thì ghi vào `unreachable`. Có thì tính hit@1 và hit@3 trên `rec.det.styles` và `rec.jev?.styles`.
  6. Chạy theo pool đồng thời 4. Mục nào `jev === null` thì đếm là lỗi Jev và không tính vào hit của Jev (mẫu số Jev là số mục có kết quả). Lỗi Jev trên 20% tổng mục thì thoát mã 3 sau khi in.
  7. Tính cho từng tập `{ n, det: { hit1, hit3 }, jev: { n, hit1, hit3 } }` dạng phần trăm một số lẻ. `gold` = `gold_cases` ∪ `gold_projects`. `baseline = gateOf({ n: gold.n, detHits: số mục vàng tất định trúng hit@3, jevHits: số mục vàng Jev trúng hit@3 })`.
  8. Ghi `--out` (JSON):
     ```text
     { at, seed, sample, sets: { gold, gold_cases, gold_projects, proxy_category, proxy_genre },
       styles: { n, unreachable: [...], det: { hit1, hit3 }, jev: { hit1, hit3 } },
       baseline: { set: "gold", n, det_hit3, jev_hit3, diff_points, reachable, pass },
       cost: { questions, input_tokens, usd } }
     ```
     `usd = input_tokens / 1e6 * 0.042`, theo giá trên `docs.typesafe.ai/models.md`.
  9. In ra stdout, mỗi tập một dòng `<tập> n=<n> tất định hit@1=<a>% hit@3=<b>% · Jev hit@1=<c>% hit@3=<d>%`, rồi dòng `styles n=<n> không chạm tới: <ids>`, rồi đúng một dòng:
     `baseline: pass` hoặc `baseline: fail`, kèm ` (tham khảo, không quyết định: Jev − tất định = <x> điểm hit@3 trên <n> mục vàng; có thể đạt: <có|không>)`. Với `--no-jev` thì in `baseline: n/a (không gọi Jev)`.
     Khoá `baseline` trong JSON chỉ để tham khảo.
  10. Có `--picks` thì bỏ qua các bước 2–9:
      - không nạp provider, không đọc khoá; mặc định `--root /Volumes/2/Edit-Video` (root Studio của người dùng);
      - với mỗi thư mục con trực tiếp của `--root`: `readPickLog(dir)` từ `../lib/suggest.mjs`, nối lại;
      - `r = pickStats(entries, { min: Number(--min ?? MIN_PICKS) })`;
      - in `picks n=<n>/<min> tất định hit@1=<a>% hit@3=<b>% · Jev hit@1=<c>% hit@3=<d>%`, rồi `picks style n=<n> …`, rồi `picks from jev=<x> det=<y> both=<z> none=<w>`, rồi đúng một dòng `decision: <jev|deterministic|wait> (<n>/<min> lượt; Jev − tất định = <x> điểm hit@3, cần ≥ 10)`;
      - có `--out` thì ghi `{ at, root, min, ...r }`.
- **Success criteria:** script chạy xong trên dữ liệu thật.
- **Verify:** làm ở task 3.4.

### Task 3.3 — Test `tests/suggest-eval.test.mjs`

- **Goal:** các phép tính cổng đúng.
- **Target files:** `$W/tests/suggest-eval.test.mjs` (mới).
- **Steps:**
  1. Test `hitAt`: `hitAt(["A1","A2","A3"], ["A3"], 3) === true`, `hitAt(["A1","A2","A3"], ["A3"], 1) === false`, `hitAt(["A4"], ["A2","A4"], 1) === true`.
  2. Test `sampleBy`: cùng seed thì cùng kết quả; mỗi nhóm không quá `perGroup`.
  3. Test `gateOf`:
     - `gateOf({ n: 14, detHits: 13, jevHits: 14 })` có `reachable === false`, `pass === false`;
     - `gateOf({ n: 14, detHits: 10, jevHits: 12 })` có `diff_points === 14.3`, `pass === true`;
     - `gateOf({ n: 14, detHits: 10, jevHits: 11 })` có `pass === false`.
  4. Test import script không tự chạy `main` (import xong không có output, không thoát).
  5. Test `pickStats`:
     - dựng 30 dòng có `jev`, mỗi dòng một `hash` khác nhau; 20 dòng `chosen.direction` nằm trong top 3 tất định, 26 dòng nằm trong top 3 Jev. Kết quả có `n === 30`, `gate.diff_points === 20`, `decision === "jev"`;
     - cùng bộ nhưng 25 dòng trúng Jev và 24 trúng tất định thì `decision === "deterministic"`;
     - 29 dòng thì `decision === "wait"`;
     - hai dòng cùng `project` và `hash` chỉ đếm một lượt, giữ dòng `at` mới hơn;
     - dòng có `jev: null` không tính vào `n`.
  6. Test `--picks` đầu cuối: thư mục tạm có hai dự án, mỗi dự án một `.opus/suggest/picks.jsonl` (tổng 3 lượt). `spawnSync(process.execPath, ["scripts/suggest-eval.mjs", "--picks", "--root", tmp])` thoát 0, stdout có dòng `decision: wait (3/30`.
- **Verify:** `cd $W && node --test tests/suggest-eval.test.mjs 2>&1 | command grep -E "^ℹ fail"` in đúng `ℹ fail 0`.

### Task 3.4 — Chạy thật và lưu kết quả

- **Goal:** có file kết quả lần đo đầu trong `reports/` và một dòng `baseline:`.
- **Steps:**
  1. `mkdir -p $W/plans/261023-1529-jev-style-suggest/reports`
  2. `cd $W && node scripts/suggest-eval.mjs --root /Volumes/2/Edit-Video --out plans/261023-1529-jev-style-suggest/reports/suggest-eval-$(date +%y%m%d).json > /tmp/suggest-eval.log 2>&1; echo "exit $?" >> /tmp/suggest-eval.log`
  3. Chỉ khi `/tmp/suggest-eval.log` có dòng `jev: chưa có khoá`: chạy lại với `--no-jev` và cùng `--out`, ghi đè `/tmp/suggest-eval.log` theo cùng cách. Ghi vào báo cáo là Jev chưa được đo.
- **Success criteria:** lần chạy cuối thoát mã 0; file JSON có khoá `baseline`.
- **Verify:**
  - `command grep -c "^exit 0$" /tmp/suggest-eval.log` in `1`.
  - `command grep -cE "^baseline: (pass|fail|n/a)" /tmp/suggest-eval.log` in `1`.
  - `node -e 'const f=require("fs").readdirSync(process.argv[1]).filter(x=>/^suggest-eval-\d{6}\.json$/.test(x)).sort().pop();const j=require(process.argv[1]+"/"+f);console.log("baseline" in j, j.sets.gold.n)' $W/plans/261023-1529-jev-style-suggest/reports` in `true 14`. Số khác 14 nghĩa là nhãn trong workspace đã đổi: ghi số thật vào báo cáo, không coi là lỗi.
  - `command grep -c "test-key\|Bearer" /tmp/suggest-eval.log` in `0`.

### Task 3.5 — Đếm lượt chọn thật hiện có và báo người dùng

- **Goal:** xác nhận chế độ `--picks` chạy trên workspace thật, rồi báo số liệu lần đo đầu. Phase này không đổi `DEFAULT_SOURCE`.
- **Steps:**
  1. `cd $W && node scripts/suggest-eval.mjs --picks --root /Volumes/2/Edit-Video > /tmp/suggest-picks.log 2>&1; echo "exit $?" >> /tmp/suggest-picks.log`
  2. Gửi người dùng (tiếng Việt), theo mẫu: "Lần đo đầu trên <n> mục có nhãn (chỉ để tham khảo): tất định hit@3 <b>%, Jev hit@3 <d>% (chênh <x> điểm). Studio đang chạy chế độ quan sát, thẻ hiện cả hai nguồn. Mỗi lần bạn bấm chọn trên thẻ, Studio ghi một dòng vào `.opus/suggest/picks.jsonl` của dự án. Đủ 30 lượt thì chạy `node scripts/suggest-eval.mjs --picks` để quyết định nguồn mặc định; hiện có <k>/30 lượt." Kèm hai proxy, các style không chạm tới, và chi phí.
  3. Làm tiếp các phase sau. Không chờ người dùng trả lời.
- **Success criteria:** dòng `decision:` có mặt; thường là `wait`, vì thẻ chưa phát hành.
- **Verify:**
  - `command grep -c "^exit 0$" /tmp/suggest-picks.log` in `1`.
  - `command grep -cE "^decision: (jev|deterministic|wait) \([0-9]+/30" /tmp/suggest-picks.log` in `1`.
  - `cd $W && node -e 'import("./lib/suggest.mjs").then(m=>console.log(m.DEFAULT_SOURCE, "OBSERVE_UNTIL" in m))'` in `observe false`.

### Task 3.6 — Commit và gộp

- **Steps:**
  1. `git -C $W add scripts/suggest-eval.mjs tests/suggest-eval.test.mjs plans/261023-1529-jev-style-suggest/reports/`
  2. `git -C $W commit -m "feat(suggest): measure suggestions on labelled briefs and on logged picks"`
  3. Chạy song song: `git -C /Volumes/2/Motion-Studio merge --no-ff feat/jev-style-suggest-eval -m "merge: suggest measurement"`, rồi `git -C /Volumes/2/Motion-Studio worktree remove .claude/worktrees/suggest-eval`.
- **Verify:** `git -C /Volumes/2/Motion-Studio log --oneline -3 | command grep -c "logged picks"` in `1`. `git -C /Volumes/2/Motion-Studio status --porcelain | wc -l` in `0`.

## Rủi ro và rollback

- Rủi ro: Jev 429 hàng loạt khi chạy 4 luồng. `ask` đã retry; tỉ lệ lỗi trên 20% thì thoát mã 3, theo Failure Protocol.
- Rủi ro: người đọc tưởng proxy là bằng chứng. Dòng in và báo cáo ghi rõ proxy lệch về phía nào.
- Rủi ro: log thưa vì người dùng ít bấm chọn, nên 30 lượt đến chậm. Chấp nhận: thẻ vẫn hiện cả hai nguồn trong lúc chờ; `decision: wait` không phải lỗi.
- Rollback: revert commit. Không đổi hành vi Studio, vì phase này chỉ thêm script.

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
