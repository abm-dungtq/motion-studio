# Báo cáo phase 5: bộ tool chung qua MCP, biên nhận và cổng chất lượng

- **PR:** https://github.com/abm-dungtq/motion-studio/pull/4 (chưa merge)
- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/agent-tools`, nhánh `feat/agent-tools`, tách từ `main` ở `f614d77`.
- **Kết quả test:** `npm test` đạt 157, lỗi 0. Nền là 141, nhánh thêm 16 test.
- **Ghép thử với `main` mới** (`aca73e6`, đã có phase 4): đạt 175, lỗi 0, bỏ qua 1. Test bị bỏ qua là test OTIO của phase 4, cần `opentimelineio` trong venv. Hai nhánh không xung đột.
- **Thay đổi:** 19 file, thêm 1608 dòng, bớt 10 dòng, 9 commit. Chỉ đụng file trong danh sách sở hữu của phase.

## Đã làm

1. Server MCP stdio: `lib/mcp/protocol.mjs` và `mcp/studio-mcp.mjs`.
   - Có `initialize`, `ping`, `tools/list`, `tools/call` và các notification.
   - Dòng không phải JSON trả `-32700`, server vẫn chạy tiếp. Server thoát khi stdin đóng.
   - Hai profile: `external` và `director`. Profile `director` ẩn các tool trùng tên với tool MCP của provider.
   - Mỗi tool khai `annotations.readOnlyHint`.
2. Tool dự án (`lib/tools/project.mjs`): `project_list`, `project_summary`, `project_get`, `project_log`, `project_patch`, `project_undo`.
   - Mọi lần sửa đi qua `P.gateway`, với actor `director`.
   - `project_patch` và `project_undo` đòi `base`.
   - Ghi chú lịch sử có id yêu cầu Studio.
3. Tool biên nhận (`lib/tools/receipts.mjs`): `receipts_list`, `receipt_get`, `media_check`, kèm verdict `pass`, `warn` hoặc `fail`.
4. Kiểm chất lượng: `lib/quality/video.mjs`, `audio.mjs` và `image.mjs`, đủ 9 kiểm trong bảng của phase.
   - Video dài hơn 10 phút được lấy mẫu ba đoạn 30 giây.
   - Ngưỡng đọc từ `studio.json` ở khoá `quality`.
   - Thông số mong đợi và các cờ `allow_*` khai bằng `withExpected()`.
5. Route:
   - `GET /api/receipts`, `GET /api/receipt`, `POST /api/media/check`;
   - `GET /api/mcp/config`, trả lệnh cho claude, codex (lệnh và khối TOML), agy, opencode, và khối JSON.
6. `director.mjs`:
   - mỗi yêu cầu ghi `.opus/studio-mcp.json`;
   - `claude -p` nhận `--mcp-config` và một luật allow `mcp__motion-studio__<tool>` cho mỗi tool;
   - `reader()` báo thiếu tool Studio;
   - prompt thêm đúng một luật, số 12, nên các luật cũ giữ số thứ tự;
   - cờ tắt là `director.studio_mcp: false`.
7. Giao diện:
   - `public/ext-receipts.js` thêm mục "Biên nhận" trong tab Xuất bản và mục biên nhận trong inspector của shot.
   - `public/receipts-view.js` dựng danh sách và chi tiết, có cache 5 giây cho mỗi dự án.
   - `public/ext-receipts.css` chứa style.
8. Docs: `docs/mcp.md` (cách nối từng CLI, bảng tool, đạo diễn) và `docs/receipts.md` (bảng kiểm, verdict, ngưỡng, mẫu biên nhận).

## Nghiệm thu

| Tiêu chí | Kết quả |
|---|---|
| Đạo diễn thật trên `ms-smoke-5`: log đủ tool provider và tool Studio, không có "THIẾU" | Đạt. Log ghi `đủ 7 tool opus-video + 8 tool motion-studio` |
| Đạo diễn gọi được `receipts_list` | Đạt. Log có `→ receipts_list`. Đạo diễn đóng yêu cầu bằng `studio_request_done`, receipt nêu đúng id `mvkcerlt-8c794f` và verdict `fail` |
| Client ngoài gọi được `tools/list` và `project_summary` | Đạt với Claude Code: `claude mcp add -s project` trong thư mục tạm, rồi `claude -p --mcp-config .mcp.json` với haiku. Kết quả "Version 1, 1 shot (s1), duration 10 giây". Cũng đạt với Codex (`codex exec -c mcp_servers…`): "Version 1, 1 shot, 10 seconds". Lệnh và output nằm trong PR |
| Tab Xuất bản hiện biên nhận ảnh thử khả năng của phase 1, kèm verdict | Đạt. Ảnh chụp ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-agent-tools-shots/`: `01-receipts-list.png` và `02-phase1-probe-receipt.png` |
| Server 4405 đã dừng, không còn `studio-mcp.mjs` | Đạt. `lsof -i :4405` rỗng, `pgrep -f studio-mcp.mjs` rỗng, 4317 vẫn là PID 63883 |

Quota đã tiêu:

- 1 lượt đạo diễn (`claude -p`, model mặc định);
- 1 lượt `claude -p` haiku;
- 2 lượt `codex exec` chữ, khoảng 46 nghìn token mỗi lượt;
- không sinh ảnh, không đọc ảnh.

## Lệch so với phase file

- **Verdict và mức của kiểm.** `runChecks` và `writeReceipt` của phase 1 chỉ lưu `pass` và `detail`, mà phase này không được sửa hai file đó. Vì vậy mức (`level`) được khai ngay cạnh mỗi kiểm trong `lib/quality/*.mjs`, và verdict được tính khi đọc biên nhận. Không có trường `verdict` trong file. Biên nhận cũ, kể cả của phase 1, cũng có verdict.
- **Thông số mong đợi.** `run(file, kind)` không nhận thông số của biên nhận. Vì vậy `duration-match` và `resolution-fps` đọc thông số từ một map trong `lib/quality/video.mjs`, đặt bằng `withExpected(files, { duration, width, height, fps, allow_black, allow_freeze, allow_silence }, fn)`. Phase 6 dùng `allow_freeze` theo cách này. Không có thông số thì hai kiểm chỉ ghi số đo và tính là đạt.
- **Helper ffmpeg dùng chung** (ngưỡng, `probeStreams`, `ffmpegLog`) nằm trong `lib/quality/video.mjs`. File `lib/quality/ffmpeg.mjs` riêng sẽ gọn hơn nhưng không có trong danh sách sở hữu.
- **`media_check` ghi chính các file được kiểm vào `outputs` của biên nhận `media-check`,** vì `writeReceipt` chỉ chạy kiểm trên `outputs`.
- **Kiểm theo yêu cầu chạy trong tiến trình server (bất đồng bộ), không thành job.** Video dài đã được lấy mẫu nên thời gian có giới hạn.
- **`GET /api/mcp/config` dán `/opt/homebrew/bin/node`** khi đường này trỏ cùng binary, thay cho đường Cellar có phiên bản. Mục đích là để đoạn cấu hình không hỏng khi nâng cấp node.
- **Thêm `annotations.readOnlyHint` cho tool.** Lý do: lần thử đầu, Codex dừng với "MCP tool call requires approval, but approval policy is never". Thêm annotation thì Codex gọi được tool chỉ đọc.
- **`director.test.mjs` không phải sửa.** Luật mới là số 12, nên kiểm `^11. BRIEF.md` vẫn đúng. Kiểm cho luật mới nằm trong `tests/director-mcp.test.mjs`.

## Dọn dẹp

- Server 4405 (PID 60087) và phiên trình duyệt `ms-smoke-5` đã tắt.
- Đã xoá thư mục tạm `/tmp/ms5*` và script `/tmp/ms-smoke-5.mjs`. `/tmp/ms-ref` là chỗ dùng chung của các phase, nên vẫn giữ.
- Dự án thử `/Volumes/2/Edit-Video/ms-smoke-5` vẫn còn. Trong đó có `project.json` (import), `renders/smoke-clip.mp4`, `assets/images/probe.png`, `.opus/receipts/`, `.opus/studio-mcp.json`, và một yêu cầu đạo diễn đã xong. Xoá dự án cần người dùng đồng ý.

Status: DONE_WITH_CONCERNS
Summary: Server MCP, 9 tool mới, 9 kiểm chất lượng có verdict, route, giao diện biên nhận và phần nối đạo diễn đã xong. Nghiệm thu thật đạt với đạo diễn, Claude Code và Codex. npm test đạt 157/0; PR #4 đã mở, chưa merge.
Concerns/Blockers:
- Khoá `quality` trong `studio.json` bị bỏ khi Studio khởi động lại, vì `SETTINGS` của `lib/config.mjs` chỉ giữ `director`, `root` và `agents`. Cần thêm `"quality"` vào `SETTINGS`; đó là sửa một dòng, nằm ngoài phạm vi sở hữu.
- Mọi biên nhận mới giờ chạy thêm kiểm media. Ảnh nhỏ hơn 512 px, như ảnh thử 256×256 của "Thử khả năng", sẽ có verdict `fail`.
- PR body có lệnh `claude mcp add` và chữ "Claude Code" vì nghiệm thu đòi lưu lệnh và output. Đó là tên công cụ, không phải ghi tác giả. Commit không nhắc AI.
- Dự án `ms-smoke-5` chờ người dùng đồng ý mới xoá.
