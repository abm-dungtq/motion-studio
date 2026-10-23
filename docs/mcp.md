# Tool của Studio qua MCP

Studio có một bộ tool dự án dùng chung cho hai phía:

- đạo diễn AI chạy trong Studio (`claude -p`);
- client MCP ngoài: Claude Code, Codex, agy, opencode.

Cả hai thấy cùng tool trong `lib/tools/*.mjs`, nạp qua `lib/tools.mjs`. Sửa `project.json` vẫn chỉ đi qua cổng lệnh của provider. Nhờ vậy agent chạy xong, dự án vẫn sửa tay được trong Studio.

Server MCP là `mcp/studio-mcp.mjs`, chạy trên stdio (JSON-RPC 2.0, mỗi dòng một thông điệp), không cần dependency npm. Giao thức nhắm bản `2025-06-18`. Client hỏi `2025-03-26` hay `2024-11-05` thì server trả đúng bản đó.

```bash
node mcp/studio-mcp.mjs [--root <thư mục dự án>] [--profile external|director] [--request <id>]
```

- `--root`: thư mục gốc chứa các dự án. Bỏ trống thì Studio lấy thư mục gốc của lần chạy trước (`MOTION_STUDIO_ROOT`, rồi `studio.json`).
- `--profile external` (mặc định): mọi tool.
- `--profile director`: bỏ các tool trùng tên với server MCP của provider, để đạo diễn không thấy hai `project_patch`.
- `--request`: id yêu cầu Studio mà đạo diễn đang làm. Id này được ghi vào ghi chú lịch sử và actor của biên nhận.

Server thoát khi stdin đóng, nên client chết thì server không bị bỏ lại.

## Đọc trước khi sửa

Mọi tool sửa `project.json` (`project_patch`, `project_undo`) đòi `base`, là `version` vừa đọc bằng `project_summary` hay `project_get`. Sai base thì tool trả lỗi `CONFLICT`, giống khi sửa trong Studio. Gặp lỗi này thì đọc lại rồi làm lại. Khoá dự án của provider vẫn áp dụng, nên client ngoài và người dùng không ghi đè nhau.

Actor của mọi sửa đổi là `director`, vì cổng lệnh chưa có actor `agent`. Khi provider thêm `agent` vào `ACTORS`, profile `external` tự dùng actor đó.

## Danh sách tool

| Tool | Đọc / sửa | Ai dùng | Làm gì |
|---|---|---|---|
| `project_list` | đọc | cả hai | Các dự án có manifest: tên, version, độ dài, số shot |
| `project_summary` | đọc | cả hai | Version, kích thước, shot, câu thoại rút gọn, nhạc, 5 dòng lịch sử |
| `project_get` | đọc | client ngoài | Nguyên manifest |
| `project_log` | đọc | client ngoài | Lịch sử sửa mới nhất |
| `project_patch` | sửa, cần `base` | client ngoài | Op của cổng lệnh thành một version mới |
| `project_undo` | sửa, cần `base` | client ngoài | Hoàn tác thay đổi mới nhất |
| `receipts_list` | đọc | cả hai | Biên nhận mới nhất: op, actor, giờ, verdict, file ra |
| `receipt_get` | đọc | cả hai | Một biên nhận đầy đủ, từng kiểm có mức `fail` hay `warn` |
| `media_check` | ghi biên nhận | cả hai | Chạy kiểm chất lượng trên file trong dự án, ghi biên nhận `media-check` |
| `agents_list` | đọc | cả hai | Agent CLI trên máy, khả năng, quota |
| `image_generate` | ghi file | cả hai | Sinh một ảnh PNG thành job của Studio, có biên nhận. Cần Studio đang chạy |
| `image_describe` | đọc | cả hai | Cho agent đọc ảnh, trả JSON |

Các tool `project_get`, `project_log`, `project_patch` và `project_undo` cũng có trên server MCP của provider, nên profile `director` ẩn chúng. Đạo diễn dùng bản của provider như trước. Tool do các tính năng khác thêm vào `lib/tools/` tự hiện ở cả hai profile.

## Nối một client ngoài

`GET /api/mcp/config` trả sẵn lệnh và đoạn cấu hình theo máy đang chạy: đường `node`, đường `mcp/studio-mcp.mjs` và thư mục gốc. Studio không tự ghi cấu hình của CLI khác. Bạn tự dán.

```bash
curl -s http://127.0.0.1:4317/api/mcp/config
```

Kết quả có các khoá sau:

- `claude`: `claude mcp add motion-studio -- <node> <repo>/mcp/studio-mcp.mjs --profile external --root <gốc>`. Thêm `-s project` sau `add` để chỉ ghi `.mcp.json` của một thư mục.
- `codex`: lệnh `codex mcp add …`. `codex_toml` là khối `[mcp_servers.motion-studio]` để dán vào `~/.codex/config.toml`.
- `agy`: lệnh `agy mcp add motion-studio -- …`.
- `opencode`: khối `mcp` cho `opencode.json` (`type: "local"`, `command` là mảng).
- `json`: dạng `{ "mcpServers": { … } }`, dùng được với `--mcp-config` của Claude Code và các client đọc cùng định dạng.

Thử nhanh không cần client:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node mcp/studio-mcp.mjs --profile external
```

Mỗi tool khai `annotations.readOnlyHint`: tool chỉ đọc là `true`, tool ghi (`project_patch`, `project_undo`, `media_check`, `image_generate`) là `false`. Codex chạy `codex exec` với chính sách duyệt `never` thì chỉ gọi được tool chỉ đọc. Tool ghi cần chạy Codex ở chế độ có duyệt.

`image_generate` gửi việc cho Studio đang chạy, đọc url và token từ file trạng thái. Studio chưa chạy thì tool báo "Studio chưa chạy". Các tool khác chạy được khi Studio tắt.

## Đạo diễn trong Studio

Mỗi yêu cầu chạy bằng runner `cli` được Studio ghi một file `.opus/studio-mcp.json` trong dự án. File này trỏ tới `mcp/studio-mcp.mjs --profile director --root <gốc> --request <id>`. `claude -p` nhận thêm:

- `--mcp-config <dự án>/.opus/studio-mcp.json`;
- một luật `--allowedTools mcp__motion-studio__<tool>` cho mỗi tool của profile `director`.

Server MCP của provider vẫn nạp như cũ, vì Studio không dùng `--strict-mcp-config`. Prompt có thêm đúng một luật: thao tác media đi qua tool motion-studio để có biên nhận, và id biên nhận được ghi trong receipt cuối.

Dòng đầu của log job đạo diễn có dạng `Phiên … · đủ 7 tool … + 8 tool motion-studio`. Thiếu tool nào thì log ghi `THIẾU tool MCP: …`.

Tắt phần này (ví dụ khi `--mcp-config` gây lỗi) bằng `"director": { "studio_mcp": false }` trong `studio.json`. Khoá `director` được giữ qua các lần dừng và chạy lại Studio.
