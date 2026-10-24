# Sửa lỗi Studio theo đánh giá 261024-1821

Ngày 2026-10-24 (Asia/Saigon). PR [#34](https://github.com/abm-dungtq/motion-studio/pull/34), squash-merge vào `main` thành `b3555ec`. Worktree `~/.cache/ms-tap2/wt-review-fix` đã gỡ, nhánh đã xoá. Thư mục `/Volumes/2/Motion-Studio` vẫn ở `main`, không đổi nhánh.

`npm test` ở worktree trước khi merge: node 493/493, ui 277/277 (gồm `tsc --noEmit`), ownership 6/6.

Mỗi lỗi đi theo cùng một quy trình: viết test tái hiện, chạy trên mã cũ và thấy trượt, xác nhận nguyên nhân, sửa, rồi chạy lại thấy qua. Output nằm ở `~/.cache/ms-tap2/fix-logs/` (các file `*-before.txt` và `*-after.txt`). Riêng các test giọng cũng được chạy từng cái một trên `origin/main` (`series-voice-before-isolated.txt`), để lỗi dây chuyền giữa các test không che kết quả.

## Từng lỗi

| Lỗi | Test tái hiện (trượt trên mã cũ) | Nguyên nhân đã xác nhận | Sửa |
|---|---|---|---|
| H1 thẻ ảnh | `asset-guards`: "a card runs only the batch it showed" | `answerCard` chạy action theo tên, không so nội dung; route trả lại thẻ đang chờ dù file đợt đã đổi | `lib/consent.mjs`: `digestOf`, `registerAction(name, fn, { digest, renew })`, `waitingCard`. Thẻ ghi `digest`; lúc đồng ý mà nội dung đã đổi thì huỷ thẻ (`stale: true`), trả 409 kèm thẻ mới (`consent`), không chạy gì |
| H1 giọng | `series-voice`: "a card voices only the text it showed" và "voice_design runs only for the role as the card showed it" | như trên | `routes/voice.mjs`: digest của id, người nói và lời từng câu; với Voice Design là mục vai |
| H1 giao nộp | `delivery`: thumbnail (đổi chữ, sửa file đợt sau thẻ); `drive-upload`: thêm file vào thư mục sau thẻ. Trên mã cũ: cùng thẻ cho chữ khác, và yes trả 200, tải 2 file cũ | thẻ không gắn nội dung | `routes/delivery.mjs`: digest của byte `thumbnail.json` cộng chữ; với Drive là tên, cỡ, mtime từng file cộng tài khoản và thư mục |
| H2 | `asset-guards`: "a redraw without a card is only for an image a card paid for; the count lives outside the project"; `series-voice`: "a line never voiced asks for a card even alone" | `asset_redo` và một câu `series_tts` chạy không cần thẻ cho bất kỳ id nào. Bộ đếm `ai_redos` nằm trong `.opus/assets/`, mà đạo diễn ghi được | `lib/ledger.mjs` mới: sổ ở `<thư mục state>/ledger/` (cạnh `studio.json`, mode 600). Vẽ lại không thẻ chỉ cho ảnh đã có bản vẽ qua thẻ; lồng lại không thẻ chỉ cho câu đã lồng qua thẻ. Test xoá state trong dự án, bộ đếm vẫn giữ |
| H4 | `asset-guards`: "a batch cut short is marked interrupted…" và "a state left running by a stopped Studio…"; `asset-approve`: trạng thái mồ côi trước đây là 409 mãi | trạng thái `running: true` còn lại sau khi job chết, nên mọi nút bị khoá | xem mục "Bị ngắt và chạy tiếp" dưới đây |
| M1 | `asset-guards`: "an image the reader could not read is not redrawn" | lỗi đọc ảnh bị coi như trượt kiểm, nên ảnh bị vẽ lại và tốn lượt | `check()` trả `unread`; ảnh lên bảng `needs_review` với `unchecked: true`, lý do "chưa kiểm được: …". UI ghi "cần xem · chưa kiểm được" |
| C' + D | `asset-guards`: "only a no_text or single_figure failure redraws", "right_character is checked only when a reference is the character's own", "the card's most turns follow the redraw rule" | mọi kiểm trượt đều vẽ lại; `right_character` bị hỏi cả khi tham chiếu chỉ là nét vẽ chung | `REDRAW_ON = ["no_text","single_figure"]`; `own_refs` (đường tham chiếu có thư mục `<id>` hay `<id>-hd`); `codex_max` tính 2 lượt chỉ cho ảnh có kiểm vẽ lại được |
| M5 | `series-tool`: "a director's tools change only the project of its request". Trên mã cũ `director:r-1` (job ở ep-01) chạy được `series/run` trên `direct` (200) | không có giới hạn dự án nào | `lib/scope.mjs`: Studio đối chiếu `actor: director:<id>` với job đạo diễn mà chính Studio giữ (403 nếu khác dự án hay id lạ), kiểm ở `server.mjs` cho mọi POST của route mở rộng. MCP: `--project` trong `serverArgs`/`studioMcp`, `--request` mặc định lấy `OPUS_STUDIO_REQUEST`; `callTool` từ chối tool `mutates` trên dự án khác. Tool chỉ đọc vẫn đọc được tập trước |
| M4 | `series-tool`: "series_file_put never replaces what the user approved"; `asset-approve`: sổ ghi file đã duyệt | `replace: true` ghi đè được `approval.json` và ảnh đã duyệt | 409 kèm lý do tiếng Việt cho mọi `approval.json` (kiểm trước khi tạo thư mục), ảnh trong `images` của `characters/*/approval.json`, và file có trong sổ (`recordApproved` lúc duyệt bảng). File khác trong cùng thư mục vẫn ghi được |
| M6 | `series-voice`: "a voice paid for whose mix failed is mixed again with --remix, never paid twice" và "without --remix declared the paid voice is not paid again" | lần chạy lại gọi lại cả lệnh có API | so sha file giọng trước và sau lần chạy. Đã trả tiền mà trộn lỗi thì ghi `pending_remix`; lần sau chạy `cast-tts --remix` (sha phải khớp). Series chưa khai cờ thì dừng với mã `no-remix` và lời nhắc |
| Prompt đạo diễn | `director-mcp`: luật series | câu luật cũ cho dùng `eleven.mjs sfx` và `music` nhưng không nói các lệnh khác bị chặn, cũng không nhắc record-audio-review | `director.mjs` `seriesRule`: "Của eleven.mjs chỉ được `eleven.mjs sfx` và `eleven.mjs music` cho hiệu ứng và nhạc nền (các lệnh khác bị chặn)…", cộng "Không tự chạy `make-demo --record-audio-review`…" |
| Env record-audio-review | `audio-review`: make-demo ghi lại hai biến; trên mã cũ nhận `["cli","cli"]` | `runFile` truyền nguyên env của Studio | `routes/gates-audio.mjs`: `reviewEnv()` bỏ `OPUS_STUDIO_RUNNER` và `MOTION_STUDIO_RUNNER` |

Các lỗ test tester nêu (đây là test cho hành vi đã có, không phải lỗi):

- `syncText`: test "the text file is written from the line when it is missing or differs" qua cả trên `origin/main`. Hành vi cũ đã đúng, nay có test giữ.
- Nhánh 409 BUSY: series (`direct đang chạy một công cụ series khác`), assets (đồng ý thẻ khi dự án đang có job `asset-batch`: 409, thẻ vẫn chờ, chạy được sau), delivery (`ep đang có việc export chạy`).
- Hạn chờ của `series_tool` (`lib/tools/series.mjs`): `waitJob` được export kèm tuỳ chọn `pollMs` và `slackMs`. Test dùng một Studio giả luôn trả "running". Mặc định vẫn là 1 giây và 60 giây.

## Bị ngắt và chạy tiếp

Một đợt thành "bị ngắt" theo ba lối:

1. Job kết thúc bất thường. `onExit` của job gọi `interruptStale`, và runner tự đánh dấu khi nhận SIGTERM (`trap`).
2. Studio khởi động lại. Trước khi phục vụ, `server.mjs` gọi `sweepInterrupted` cho mọi dự án không có job `asset-batch` đang chạy.
3. `GET /api/assets` và nút Duyệt bảng gặp một trạng thái mồ côi.

Khi đã bị ngắt:

- Trạng thái thành `running: false, stopped: true, interrupted: true`.
- Ảnh đang `queued`, `drawing`, `checking`, `keying` hay `waiting_quota` thành `interrupted` (việc đang dở ghi ở `interrupted_at`).
- Ảnh đã xong giữ nguyên, ảnh trong `assets/gen/raw/` không mất. Ảnh nào job đã vẽ thì được ghi vào sổ.
- Nút của bảng mở lại.

Nút "Chạy tiếp" (`POST /api/assets/resume`) chỉ hiện khi `can_resume`, tức là không có job đang chạy và digest của file đợt vẫn bằng digest của thẻ đã duyệt. Nó chạy đúng các ảnh `interrupted` và không cần thẻ mới. Ảnh bị ngắt lúc đang kiểm hay tách nền mà đã có ảnh vẽ thì đi tiếp từ bước đọc, không vẽ lại. File đợt đã đổi thì trả 409 và phải có thẻ mới. Tài liệu: `docs/assets.md`, mục "Bị ngắt và chạy tiếp".

## Phía series và plugin (không sửa ở đây)

- **S cần khai `"--remix": "bool"`** trong `tools.cast-tts.flags` của `studio-series.json` (Sóng Lag). Thiếu cờ này thì Studio không trả tiền lần hai: câu dừng với mã `no-remix` và lời nhắc. Nhưng câu đó cũng không tự trộn lại được cho tới khi khai cờ.
- Plugin: không sửa `~/.claude/skills/**` và không chạy setup. Chốt `director-guard.mjs` theo `OPUS_STUDIO_RUNNER` / `MOTION_STUDIO_RUNNER` là của PR opus-video #11. Studio chỉ sửa câu trong prompt và env của lần chạy do người dùng bấm. `VOICE_DENIED_TOOLS` và `STUDIO_API` (4) không đổi.
- a-01 không bị ghi. Mọi thử nghiệm chạy trong thư mục tạm với CLI giả, không tốn lượt Codex hay ElevenLabs, và không gọi tới cổng 4317.

## Status

Status: DONE_WITH_CONCERNS
Summary: Đã sửa H1, H2, H4, M1, C'+D, M4, M5, M6, thêm hai việc phía Studio của plugin và các test còn thiếu, trong PR https://github.com/abm-dungtq/motion-studio/pull/34 (squash `b3555ec`). Mỗi test tái hiện trượt trên mã cũ rồi qua sau khi sửa; `npm test` đạt node 493/493, ui 277/277, ownership 6/6.
Concerns/Blockers:
- `studio-series.json` của S chưa khai `"--remix": "bool"` cho `cast-tts`. Đến lúc đó, câu đã trả tiền mà trộn lỗi sẽ dừng và chờ khai cờ.
- Chặn dự án phía Studio dựa vào `actor` do server MCP tự khai. Nếu đạo diễn gọi thẳng HTTP của Studio bằng token trong `~/.config/motion-studio/studio.json` với `actor: "human"` thì vẫn lọt. Đây là lỗ có từ trước, nằm ngoài phạm vi PR này. Muốn đóng thì cần token riêng cho từng yêu cầu.
- `approval.json` cũ của Sóng Lag ghi ảnh đã duyệt trong `notes` (chữ tự do), không có mảng `images`. Vì vậy các ảnh đó chỉ được bảo vệ khi được duyệt lại qua Studio (vào sổ), hoặc khi ai đó thêm `images` vào file. Riêng `approval.json` thì luôn được bảo vệ.
- Chưa chạy thử Studio thật ở một cổng riêng. Mọi kiểm chứng là test HTTP trong tiến trình (`createServer` ở cổng ngẫu nhiên, state riêng).
