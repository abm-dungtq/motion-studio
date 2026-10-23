---
title: "Gợi ý hướng, style và quy trình bằng TypeSafe Jev trong Motion Studio"
description: "Tool style_suggest và route /api/suggest xếp hạng hướng A1–A8, style profile và chế độ vận hành bằng Jev, có đường tất định dự phòng; thẻ chọn trong tab Đạo diễn ghi kết quả qua lệnh choose có sẵn, ghi log lựa chọn thật và quyết nguồn mặc định sau 30 lượt."
status: pending
priority: P2
effort: 30h
branch: feat/jev-style-suggest
tags: [motion-studio, jev, typesafe, director, suggest, ui]
created: 2026-10-23
---

# Gợi ý hướng, style và quy trình bằng Jev

Plan lập ngày 2026-10-23 (Asia/Saigon) trên repo `/Volumes/2/Motion-Studio`, nhánh `main`, commit `296d3fe`. Plan viết theo kiểu handover (`--advice`) cho một executor khác đọc và chạy:

- mỗi task có Goal, Target files/symbols, Steps, Success criteria và Verify so sánh máy được;
- mỗi file phase có khối Failure Protocol riêng;
- một Verify trượt thì executor dừng phase đó. Dừng như vậy là đúng quy trình, không phải bị kẹt.

## Hợp đồng đã duyệt (không mở lại)

Nguồn: `/Volumes/2/Edit-Video/plans/reports/brainstorm-261023-1529-jev-style-suggest.md`, bản xem trước `...-preview.html` cùng thư mục.

- Đạo diễn gọi tool `style_suggest`. Tool xếp hạng hướng A1–A8, style (chỉ trong `styles_goi_y` của 2–3 hướng đầu, lọc theo energy) và chế độ vận hành (`dao-dien`, `nhanh`, `tu-nhac`, `timeline`).
- Thẻ trong tab Đạo diễn hiện điểm 0–4, một câu lý do nêu trường BRIEF, nhãn nguồn "Jev" hoặc "tất định". Bấm chọn thì đi qua lệnh `choose` của provider với `--pick` và `--style-profile`.
- Lọc bằng code trước, rồi Score 8 hướng, Score 6–12 style, một Choice cho 4 chế độ. Tổng dưới 25 câu hỏi. State là frontmatter BRIEF cộng 300 từ đầu kịch bản.
- Không khoá, mất mạng, quá giờ thì dùng gợi ý tất định, không chặn giao diện.
- Bản ghi quy trình `{mode, pitch, steps[], skip[], reason}`; `steps` là tên lệnh provider; `reason` nêu trường BRIEF.
- Ngưỡng: Jev phải hơn tất định ít nhất 10 điểm hit@3 mới thành nguồn mặc định; không đạt thì chạy tất định và báo người dùng.
- **Cập nhật của người dùng (2026-10-23), thay cho "đo trước khi làm UI" và "hai tuần quan sát":** đo bằng lựa chọn thật, quyết sau 30 lượt.
  - Lần đo đầu trên 14 mẫu có nhãn vẫn chạy, nhưng chỉ ghi số vào báo cáo, không quyết định gì, và không chặn UI.
  - Mặc định là `observe`: thẻ hiện cả gợi ý Jev lẫn gợi ý tất định.
  - Mỗi lần người dùng bấm chọn trên thẻ, Studio nối một dòng JSONL vào `<dự án>/.opus/suggest/picks.jsonl`.
  - Đủ 30 lượt thì `scripts/suggest-eval.mjs --picks` tính hit@1, hit@3 từng nguồn và áp ngưỡng 10 điểm. Đạt thì `DEFAULT_SOURCE = "jev"`; trượt thì `"deterministic"`, đường Jev vẫn giữ và bật lại được trong `studio.json`.
  - Bỏ hằng `OBSERVE_UNTIL`.
- Non-goals: không chấm phẳng 64 style, không tournament, không có đường ghi `BRIEF.md` mới, không gợi ý case trên thẻ, không tự chọn thay người dùng.

## Hai chỗ hợp đồng va vào code thật (đã kiểm, cách xử lý nằm trong phase)

1. **`choose` chỉ ghi được hướng có trong pitch.** `make-pitch.mjs choose` đọc `pitch/PICK.json` và chỉ nhận `--pick` là một dòng của file đó (`~/.claude/skills/opus-video/scripts/make-pitch.mjs:304-311`). Ba dòng do `pickDirections` tất định chọn, mỗi tầng một hướng (`directions.mjs:138-150`). Hướng Jev xếp đầu có thể không nằm trong ba dòng, và trước khi có pitch thì `choose` thoát mã 2.
   - Cách xử lý (phase 4): route `POST /api/suggest/choose` có ba kết cục.
     - Hướng có trong `PICK.json` thì chạy `choose` với số pick đó cộng `--style-profile`. Nếu đang có thẻ chọn hướng của đạo diễn chờ trả lời, route trả lời luôn thẻ đó.
     - Có `PICK.json` mà không có hướng đó thì thẻ hiện các hướng đã có pitch, xếp theo điểm gợi ý.
     - Chưa có pitch thì xếp một yêu cầu cho đạo diễn tạo pitch, kèm lựa chọn của người dùng.
   - Không ghi `BRIEF.md` bằng đường nào khác.
   - Đường nâng cấp: phase 7 đề xuất `make-pitch init --directions`, khai là `COMMANDS.pitchInit`. Provider phát hiện khoá này (`P.suggest.pitchInit`, phase 1). Có thì route tạo pitch với hướng đã chọn đứng đầu rồi chạy `choose --pick 1` (kết cục `chosen`, `initialized: true`); không có thì giữ `queued`.
2. **Gateway chưa có op ghi trường cấp dự án.** Op của gateway chỉ có `resize_shot` … `remove_shot` (`gateway.mjs:117-221`). `ACTORS` không có "user"; người dùng là `human` (`gateway.mjs:58`, `server.mjs:436`).
   - Cách xử lý (phase 1, 4): provider khai `suggest.canSetWorkflowMode`, tính từ `OPS` của plugin có chứa `set_workflow_mode`; hiện là `false`. Khi `false`, chế độ đi trong lời yêu cầu gửi đạo diễn, và thẻ nói rõ chưa lưu vào `project.json`. Khi plugin có op (PR ở phase 7), route ghi bằng `P.gateway.patch` với actor `human`, không phải sửa Studio.
   - Tên trường dùng `workflow_mode`, vì `create.mjs:14` đã ghi một `mode` khác nghĩa (`tu-dau`, `video-co-san`…) vào `BRIEF.md`.

## Phép đo: nói thẳng

- **Lần đo đầu (tham khảo):**
  - Nhãn thật ít: 8 case có trong `directions.json` `cases` (A1–A5) và 6 dự án có `direction:` trong `/Volumes/2/Edit-Video/*/BRIEF.md`. Cộng lại là 14 mục; một mục bằng 7,1 điểm.
  - 6 dự án đó chọn hướng từ ba pitch tất định, nên tất định gần như chắc trúng hit@3 trên chúng.
  - Hai tập proxy lệch theo hai phía: nhãn theo `category` có lợi cho tất định (tất định cộng +3 khi khớp category); nhãn theo `genre` do chính Jev gắn có lợi cho Jev.
  - 3/7 style đã ghi (`pixel-arcade`, `variety-captions`, `lemo-watercolor`) không nằm trong `styles_goi_y` của hướng nào; script báo đây là lỗ dữ liệu.
  - Vì các lệch trên, lần đo này không quyết định gì.
- **Phép đo quyết định (lựa chọn thật):**
  - Một lượt là một cặp (dự án, `hash` state) có cả hai bảng xếp hạng; nhiều lần bấm trên cùng brief chỉ giữ lần cuối.
  - Trúng hit@k: hướng người dùng chọn nằm trong `k` hướng đầu của nguồn đó.
  - Thiên lệch còn lại: người dùng có thể nghiêng về cột nằm trước. Thẻ quan sát hiện hai cột ngang nhau, không chọn sẵn; báo cáo ghi thêm `from` để người đọc tự đánh giá.
  - Không đo chế độ vận hành: lựa chọn chế độ được ghi vào log nhưng ngưỡng chỉ áp cho hướng, theo hợp đồng.

## Phase

| # | Phase | File | Phụ thuộc | Song song | Effort | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | Client Jev và khai báo provider (kèm phát hiện `pitchInit`, `set_workflow_mode`) | [phase-01-jev-client-provider.md](phase-01-jev-client-provider.md) | — | với 7 | 2h | pending |
| 2 | Lõi gợi ý `lib/suggest.mjs`, mặc định `observe`, log lựa chọn | [phase-02-suggest-core.md](phase-02-suggest-core.md) | 1 | với 7 | 5h | pending |
| 3 | Script đo: lần đo đầu (tham khảo) và chế độ `--picks` | [phase-03-measure-gate.md](phase-03-measure-gate.md) | 2 | với 4, 5, 7 | 4h | pending |
| 4 | Tool `style_suggest`, route `/api/suggest`, chọn qua `choose`, ghi log | [phase-04-tool-route-choose.md](phase-04-tool-route-choose.md) | 2 | với 3, 7 | 4h | pending |
| 5 | Thẻ gợi ý trong tab Đạo diễn (hai cột khi quan sát) | [phase-05-ui-suggest-card.md](phase-05-ui-suggest-card.md) | 4 | với 3, 7 | 5h | pending |
| 6 | Thử trực tiếp cổng 4420, docs, CHANGELOG, PR | [phase-06-live-docs-pr.md](phase-06-live-docs-pr.md) | 1–5 | với 7 | 3h | pending |
| 7 | PR upstream opus-video: `suggest`, `init --directions`, `set_workflow_mode` + `OPS` (ba commit) | [phase-07-upstream-suggest-command.md](phase-07-upstream-suggest-command.md) | — | với mọi phase | 6h | pending |
| 8 | Quyết định nguồn mặc định sau 30 lượt | [phase-08-decide-after-30-picks.md](phase-08-decide-after-30-picks.md) | 6 đã phát hành, log ≥ 30 lượt | — | 1h | pending |

Phase 3 không còn chặn UI. Phase 6 cần số liệu lần đo đầu của phase 3 để ghi vào tài liệu. Phase 8 chạy muộn, khi log đủ 30 lượt; trước đó task 8.1 in `decision: wait` và phase dừng đúng quy trình.

```text
1 ──► 2 ──┬──► 3 ─────────────┐
          └──► 4 ──► 5 ───────┴──► 6 ··· (đủ 30 lượt) ··► 8
7 (độc lập, không chặn ai; khi phát hành, Studio tự phát hiện)
```

## Sở hữu file (không hai phase song song nào chạm cùng file)

| Phase | Tạo mới | Sửa |
|---|---|---|
| 1 | `lib/jev.mjs`, `tests/jev.test.mjs` | `lib/providers/opus-video.mjs`, `lib/provider.mjs` (comment hợp đồng), `tests/provider.test.mjs` |
| 2 | `lib/suggest.mjs`, `tests/suggest.test.mjs`, `tests/fixtures/suggest/**` | — |
| 3 | `scripts/suggest-eval.mjs`, `tests/suggest-eval.test.mjs`, `plans/261023-1529-jev-style-suggest/reports/suggest-eval-*.json` | — |
| 4 | `lib/tools/suggest.mjs`, `routes/suggest.mjs`, `tests/suggest-routes.test.mjs` | `gates.mjs`, `director.mjs` (thêm `queueRequest`), `routes/lemo.mjs` (dùng `queueRequest`), `lib/config.mjs` (`SETTINGS`), `tests/studio-gates.test.mjs` |
| 5 | `ui/src/panels/director/SuggestCard.tsx`, `ui/src/panels/director/SuggestCard.test.tsx` | `ui/src/panels/director/index.ts`, `ui/src/api/queries.ts`, `ui/src/api/types.ts` |
| 6 | `docs/suggest.md`, `plans/261023-1529-jev-style-suggest/reports/live-4420.md` | `docs/mcp.md`, `CHANGELOG.md` |
| 7 | (repo opus-video, clone trong `/tmp`) `scripts/suggest.mjs` và ba file test | `scripts/studio-api.mjs`, `scripts/make-pitch.mjs`, `scripts/gateway.mjs`, `scripts/manifest.mjs`, `CHANGELOG.md` của bản clone |
| 8 | `plans/261023-1529-jev-style-suggest/reports/suggest-picks-*.json` | `lib/suggest.mjs` (dòng `DEFAULT_SOURCE`), `tests/suggest.test.mjs` (test mặc định), `docs/suggest.md`, `CHANGELOG.md` |

Phase 3 chạy song song với 4 hoặc 5 thì phase 3 dùng worktree riêng (lệnh ở đầu phase). Phase 3 không sửa file có sẵn nào, nên không chạm file của 4 và 5. Phase 8 sửa lại `lib/suggest.mjs`, `docs/suggest.md`, `CHANGELOG.md`, nhưng chạy một mình sau khi mọi phase khác đã gộp.

## Ràng buộc chung (mọi phase)

- Chỉ `lib/providers/opus-video.mjs` được nêu tên plugin, đường dẫn plugin, tên biến khoá và file `.env`. `tests/provider.test.mjs:73-89` kiểm luật này trên toàn repo (trừ `plans/`, `tests/fixtures/`, `CHANGELOG.md`, `README.md`).
- Server không có dependency npm. `lib/jev.mjs` chỉ dùng `fetch` có sẵn của Node.
- Không đổi route `/api/*` hiện có (danh sách ở `server.mjs:86-90`). Chỉ thêm `GET /api/suggest`, `POST /api/suggest`, `POST /api/suggest/choose`, qua `routes/suggest.mjs`.
- Không sửa `~/.claude/skills/**`. Phần plugin đi qua PR upstream (phase 7) từ một bản clone trong `/tmp`.
- Không dùng cổng 4317 (Studio thật của người dùng). Cổng thử là 4420.
- Không in, không `cat`, không `echo`, không commit khoá hay file `.env`. Test dùng khoá giả `test-key`.
- Commit theo conventional commits, không nhắc AI, không có dòng `Co-Authored-By`. Thân PR không có dòng ghi công AI. Đây là yêu cầu của người dùng, nên nó thắng mọi mẫu ghi công mặc định.
- Không ghi mã phase hay mã task (ví dụ "phase 3", "task 4.2") trong code, comment, tên test hay commit message.
- Lệnh shell không được chứa chữ ghép từ "node" + "_modules" (có hook chặn). Dùng `command grep` thay cho `grep`. Chạy `tsc` trong `ui/` (`cd ui && npx tsc --noEmit`).
- Mọi chữ tiếng Việt hiện trên UI là câu rõ ràng, có dấu, không dùng chữ "minh họa" hay "minh hoạ".

## Luồng dữ liệu

```text
BRIEF.md frontmatter (bỏ trường đã chọn) + 300 từ đầu script/*.txt ──► state
provider commands.directions "pick --json" ──► 3 hướng tất định (+ why)
directions.json (P.library.directionsFile) ──► 8 hướng ứng viên
  ├─ nguồn tất định: pick + "styles suggest --direction --energy --json" + luật chế độ ──► det
  └─ nguồn Jev (khi source ≠ deterministic và có khoá):
       request 1: 8 Score hướng ──► top 3
       request 2: ≤ 12 Score style (hợp styles_goi_y của top 3, lọc energy bằng "styles suggest") + 1 Choice chế độ
       lỗi / không khoá / quá giờ ──► jev = null, error = lý do
bản ghi { v, at, project, source, error, jev, det, usage, ms, questions } ──► <dự án>/.opus/suggest/latest.json
nguồn = studio.json suggest.source ?? DEFAULT_SOURCE ("observe" cho tới phase 8)
GET /api/suggest ──► { record, picks (PICK.json qua provider), source_setting, can_save_mode, can_init_pitch } ──► SuggestCard
  observe: hai cột Jev | Tất định, không chọn sẵn
bấm "Chọn và tạo pitch" ──► POST /api/suggest/choose
  ├─ hướng có trong PICK.json ──► choose --pick n + --style-profile s (trả lời thẻ hướng đang chờ nếu có) ──► BRIEF.md
  ├─ có PICK.json, không có hướng ──► { outcome: "not_in_pitch", picks }
  ├─ chưa có pitch, có P.suggest.pitchInit ──► init --directions <chọn,…> ──► choose --pick 1 ──► { outcome: "chosen", initialized: true }
  └─ chưa có pitch, không có pitchInit ──► requests.enqueue("tạo pitch …") ──► pump đạo diễn ──► { outcome: "queued" }
  chế độ: canSetWorkflowMode ? gateway.patch(actor human, set_workflow_mode) : { saved: false } (chế độ nằm trong lời yêu cầu)
  mọi 200 có bản ghi ──► nối 1 dòng { at, project, hash, jev top3, det top3, chosen {direction, style, mode}, direction_from, style_from, outcome }
                        vào <dự án>/.opus/suggest/picks.jsonl
scripts/suggest-eval.mjs --picks ──► đọc <root>/*/.opus/suggest/picks.jsonl ──► decision: jev | deterministic | wait (n/30) ──► phase 8
```

## Rủi ro

| Rủi ro | Khả năng × tác động | Giảm thiểu |
|---|---|---|
| Gợi ý tệ mà trông đẹp, người dùng tin điểm | Cao × Cao | Quan sát mặc định, hai cột ngang nhau, không chọn sẵn; nhãn nguồn trên từng mục; quyết nguồn bằng 30 lượt thật; trượt ngưỡng thì tất định |
| Log lựa chọn lệch về một cột, hoặc 30 lượt đến chậm | Trung bình × Trung bình | Không chọn sẵn; báo cáo ghi `from` và số dự án; `decision: wait` không phải lỗi, thẻ vẫn dùng được |
| Plugin phát hành chỉ một phần PR upstream | Trung bình × Thấp | Studio phát hiện từng tính năng riêng (`pitchInit`, `OPS`); thiếu cái nào thì giữ hành vi hiện tại cho cái đó |
| PR upstream tăng `STUDIO_API` làm Studio từ chối plugin | Thấp × Cao | Phase 7 cấm tăng (Studio nhận 3–4, `lib/providers/opus-video.mjs:19`, `:42-43`); Verify kiểm `STUDIO_API` vẫn là 4 |
| Hướng Jev chọn không có trong pitch | Cao × Trung bình | Kết cục `not_in_pitch` hoặc `queued`, câu giải thích trên thẻ |
| Logic miền của plugin chui vào Studio | Trung bình × Trung bình | Lọc energy và chọn hướng tất định đều gọi lệnh của provider; bảng chế độ và lệnh nằm trong provider; phase 7 mở đường chuyển về plugin |
| Độ trễ, chi phí khi brief dài | Trung bình × Thấp | State cắt 300 từ; ≤ 21 câu hỏi; timeout 8 s, retry 1; cache theo hash state |
| Lộ khoá qua log hay bản ghi | Thấp × Cao | `lib/jev.mjs` không trả, không log khoá; test grep khoá giả trong bản ghi và log |
| Brief quá ngắn làm điểm dồn về giữa | Trung bình × Trung bình | Bản ghi lưu `confidence`; thẻ ghi "Jev chưa chắc" khi confidence < 0,5 |

## Tương thích ngược và rollback

- Không đổi route, tool hay hàm public có sẵn. `chooseArgv`, `writeDirection`, `answerCard` chỉ nhận thêm tham số tuỳ chọn, mặc định giữ hành vi cũ (test cũ ở `tests/studio-gates.test.mjs:72-160` phải xanh nguyên).
- Thiết lập mới `suggest` trong `studio.json` là tuỳ chọn. Thiếu nó thì dùng `DEFAULT_SOURCE` (`observe` cho tới phase 8).
- Plugin cũ (không có `pitchInit`, không có `OPS`) vẫn chạy: Studio giữ kết cục `queued` và câu "chưa lưu". Plugin mới không tăng `STUDIO_API`, nên Studio đang phát hành vẫn nhận nó.
- Rollback từng phase bằng `git revert <commit>`. Phase 4 và 5 revert độc lập được: bỏ phase 5 chỉ mất thẻ; bỏ phase 4 thì phải bỏ cả phase 5. Không có migration dữ liệu. File `.opus/suggest/latest.json` và `.opus/suggest/picks.jsonl` vô hại khi bỏ code (đã nằm trong `.gitignore` qua `.opus/`). Phase 8 revert được độc lập; `DEFAULT_SOURCE` quay về `observe`.

## Ma trận test

| Lớp | Cái gì | Ở đâu |
|---|---|---|
| Unit | `readKey`, `ask`: không khoá, 200, 401 không retry, 529 rồi 200, 5xx hết retry, timeout, JSON hỏng | `tests/jev.test.mjs` |
| Unit | `suggest()`: có khoá, không khoá, timeout, 5xx, source deterministic không gọi fetch, observe trả cả hai, ≤ 25 câu hỏi, reason nêu trường; `effectiveSource` mặc định `observe`; `pickEntry`, `appendPick`, `readPickLog` | `tests/suggest.test.mjs` |
| Unit | Script đo: `hitAt`, `gateOf`, `pickStats` (30 lượt đạt, trượt, 29 lượt chờ, gộp trùng, bỏ dòng thiếu Jev), `--picks` đầu cuối | `tests/suggest-eval.test.mjs` |
| Tích hợp | Route GET/POST `/api/suggest`, `/api/suggest/choose` ba kết cục, ghi log mỗi lần chọn, tool `style_suggest` qua `callTool`, `chooseArgv` với style; plugin giả có `pitchInit` và `set_workflow_mode` | `tests/suggest-routes.test.mjs`, `tests/studio-gates.test.mjs` |
| Component | Thẻ: quan sát hai cột không chọn sẵn, chỉ tất định, bấm chọn, `queued`, `not_in_pitch`, chưa có bản ghi, plugin có hai tính năng mới | `ui/src/panels/director/SuggestCard.test.tsx` |
| Upstream | `suggest`, `init --directions`, `set_workflow_mode` + `OPS`; Studio phát hiện được trên bản clone | `scripts/tests/*.test.mjs` của bản clone, task 7.5 |
| Đầu cuối | Server thử cổng 4420, khoá thật, gọi `/api/suggest`, chọn, đọc `BRIEF.md` và `picks.jsonl` của bản sao, ảnh chụp thẻ | phase 6 |

## Tiêu chí đạt (đo được)

1. `node scripts/suggest-eval.mjs --root /Volumes/2/Edit-Video --out <file>` in hit@1 và hit@3 của Jev và tất định trên tập vàng và hai tập proxy, và đúng một dòng `baseline: pass|fail|n/a`. Kết quả nằm trong `plans/261023-1529-jev-style-suggest/reports/`. Lần đo này không đổi `DEFAULT_SOURCE`.
2. `lib/suggest.mjs` export `DEFAULT_SOURCE === "observe"` và không export `OBSERVE_UNTIL` cho tới phase 8.
3. Mỗi lần `POST /api/suggest/choose` trả 200 trên dự án có bản ghi gợi ý, `<dự án>/.opus/suggest/picks.jsonl` có thêm đúng một dòng. Dòng đó có `at`, `project`, `jev` (top 3 hướng, style, chế độ), `det`, `chosen` (hướng, style, chế độ), `direction_from` và `outcome`. Kiểm bằng test route và bằng lần chạy thật ở cổng 4420.
4. `node scripts/suggest-eval.mjs --picks --root <root>` in đúng một dòng `decision: jev|deterministic|wait (<n>/30 …)`. Test cho thấy: 30 lượt với Jev hơn ≥ 10 điểm hit@3 thì `jev`; hơn dưới 10 điểm thì `deterministic`; dưới 30 lượt thì `wait`.
5. `npm test` ở gốc repo kết thúc không có dòng `ℹ fail` khác `ℹ fail 0` và vitest báo không test nào trượt. Test có khoá, không khoá, timeout, 5xx đều trả bản ghi có `det`.
6. Trên cổng 4420, chọn một hướng có pitch thì `BRIEF.md` của bản sao có `direction:` và `style_profile:` đúng giá trị đã bấm. Có ảnh chụp thẻ.
7. Ở nguồn `observe`, thẻ hiện hai cột `Jev` và `Tất định`, không hướng nào được chọn sẵn, và có dòng so sánh hạng 1.
8. Có một PR lên opus-video với ba commit (`suggest`, `init --directions`, `set_workflow_mode` + `OPS`), `STUDIO_API` vẫn là 4. Trên bản clone, provider của Studio in `pitchInit` khác `null` và `canSetWorkflowMode === true`. PR của Studio không chờ PR này.
9. Khi có đủ 30 lượt (phase 8): `DEFAULT_SOURCE` bằng đúng `decision` của `--picks`; đường Jev vẫn chạy được khi đặt `suggest.source` trong `studio.json`.

## Câu hỏi đã có trả lời (2026-10-23)

1. Cách đo: ghi lựa chọn thật, quyết sau 30 lượt (phase 2, 3, 4, 5, 8).
2. `make-pitch init --directions`: có, trong PR upstream (phase 7, commit 2).
3. Op gateway `workflow_mode` kèm `OPS`: có, trong cùng PR (phase 7, commit 3). Tên op là `set_workflow_mode`.
4. Giữ đường Jev khi trượt ngưỡng: có, bật lại bằng `studio.json` (phase 8).

## Câu hỏi mở

1. Nếu sau một thời gian dài log vẫn chưa đủ 30 lượt, có muốn hạ ngưỡng số lượt, hay chờ tiếp? Plan hiện chờ tiếp và không đổi gì.
