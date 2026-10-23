# Phase 5: bộ tool chung cho đạo diễn và client MCP, biên nhận và cổng chất lượng

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/agent-tools`
- **Nhánh:** `feat/agent-tools`
- **Cổng server thử:** 4405
- **Effort:** 9h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1 (`lib/tools.mjs`, `lib/receipts.mjs`, `lib/quality.mjs`, client `studio`).

## Mục tiêu

1. **Một bộ tool dự án dùng chung.** Cùng registry `lib/tools/*.mjs` phục vụ hai phía:
   - (a) đạo diễn trong Studio (`claude -p`);
   - (b) client MCP ngoài: Claude Code, Codex, agy, opencode…

   Đây là cách OpenChatCut làm: agent tích hợp và MCP ngoài thấy cùng tool, đọc lại trước khi sửa, và dự án vẫn sửa tay được sau khi agent chạy.
2. **Biên nhận và cổng chất lượng cho thao tác media,** học từ kinocut ("Video Receipts", quality gates). Mọi thao tác ffmpeg hoặc sinh ảnh ghi một biên nhận có hash, thông số và kết quả kiểm. Studio hiện các biên nhận đó.

## Hiện trạng đã kiểm

**Đạo diễn** (`director.mjs`):
- `claudeArgs(p, prompt, sid)` ở `director.mjs:84-88`: `--allowedTools ...p.director.allowedTools` và `--disallowedTools ...p.director.deniedTools`.
- Tool MCP của đạo diễn hôm nay chỉ đến từ MCP server của provider: `P.director.mcpTools`, 7 tool (`project_get`, `project_log`, `project_patch`, `project_undo`, `studio_request_next`, `studio_request_done`, `studio_ask`), prefix `P.director.toolPrefix`.
- `reader()` báo "THIẾU tool MCP" khi `system/init` thiếu tool (`director.mjs:95-97`).

**Gateway:** `ACTORS = ["human", "director", "timing", "import", "undo", "redo"]` (`gateway.mjs:58` của plugin). Không có actor `agent`.

**Từ phase 1:** registry tool (`lib/tools.mjs`), `writeReceipt`/`listReceipts` (`lib/receipts.mjs`), `runChecks` (`lib/quality.mjs`), 2 kiểm cơ bản trong `lib/quality/basic.mjs`, client `studio` (url và token từ file trạng thái).

**Studio không có dependency npm,** nên MCP server phải tự viết, không dùng `@modelcontextprotocol/sdk`.

## Repo học hoặc chép

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) | AGPL-3.0 (repo học tập: được chép, ghi nguồn) | Một bộ tool cho agent trong app và MCP ngoài; tool đọc trước khi sửa; mô tả tool ngắn và chính xác |
| [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) | Apache-2.0, Python | Cấu trúc "Video Receipt" (input, lệnh, output, hash, probe, gate) và danh sách quality gate. Chép danh sách kiểm và ngưỡng, ghi nguồn |
| [ayushozha/AdobePremiereProMCP](https://github.com/ayushozha/AdobePremiereProMCP) | MIT | Registry tool "readback-first" gọn; cách chia tool đọc và tool sửa |
| [modelcontextprotocol/specification](https://github.com/modelcontextprotocol/modelcontextprotocol) | MIT | JSON-RPC stdio: `initialize`, `tools/list`, `tools/call`, `notifications/initialized`. Ghi phiên bản giao thức đã nhắm trong comment |

Clone vào `/tmp/ms-ref/<repo>`, chỉ đọc.

## Sở hữu file

**Sửa:** `director.mjs`. Thêm `--mcp-config <file>` trỏ tới MCP server của Studio, thêm tool Studio vào `--allowedTools`, và báo thiếu tool Studio trong `reader()`.

**Tạo mới:**
- `mcp/studio-mcp.mjs`: MCP stdio server
- `lib/mcp/protocol.mjs`: khung JSON-RPC
- `lib/tools/project.mjs`: `project_list`, `project_summary`, `project_get`, `project_patch`, `project_undo`, `project_log` qua `P.gateway` và `P.manifest`
- `lib/tools/receipts.mjs`: `receipts_list`, `receipt_get`, `media_check`
- `lib/quality/video.mjs`: `duration-match`, `resolution-fps`, `black-frames`, `frozen-frames`
- `lib/quality/audio.mjs`: `silence`, `loudness`, `clipping`
- `lib/quality/image.mjs`: `alpha-coverage` cho PNG đã tách nền, `min-size`
- `routes/receipts.mjs`: `GET /api/receipts`, `GET /api/receipt`, `POST /api/media/check`
- `routes/mcp.mjs`: `GET /api/mcp/config` trả đoạn cấu hình cho client ngoài
- `public/ext-receipts.js`, `public/receipts-view.js`, `public/ext-receipts.css`
- `docs/mcp.md`, `docs/receipts.md`
- Test: `tests/mcp-server.test.mjs`, `tests/tools-project.test.mjs`, `tests/quality-checks.test.mjs`, `tests/director-mcp.test.mjs`

**Không đụng:** `lib/tools.mjs`, `lib/receipts.mjs` và `lib/quality.mjs` của phase 1 (chỉ dùng); tool của phase khác; `server.mjs`.

## Thiết kế

**MCP server** (`mcp/studio-mcp.mjs`):
- Đọc JSON-RPC từng dòng trên stdin, ghi lên stdout; log sang stderr.
- Cờ:
  - `--root <dir>`, mặc định `rootDefault()`;
  - `--profile external|director`;
  - `--request <id>`: profile `director` truyền vào để biên nhận ghi actor kèm id yêu cầu.
- `tools/list` = `loadTools()`, lọc theo profile:
  - `external`: mọi tool;
  - `director`: bỏ tool trùng tên với tool MCP của provider (`P.director.mcpTools` bỏ prefix), để đạo diễn không thấy hai `project_patch`. Phần còn lại là tool riêng của Studio: `image_generate`, `image_describe`, `broll_search`, `nle_export`, `anime_*`, `fx_*`, `receipts_*`, `media_check`… (tool nào có thì hiện, nhờ cơ chế tự nạp).
- `tools/call` → `callTool` (phase 1) → `{ content: [{ type: "text", text: JSON }], isError }`.
- Tool sửa dự án (`mutates: true`) đòi tham số `base` (version vừa đọc), giống luật của đạo diễn ("Patch với đúng base vừa đọc").
- Actor của `project_patch` là `"director"`. Gateway không có `"agent"`; xem PR upstream có điều kiện.

**Đạo diễn** (`director.mjs`):
- `claudeArgs` thêm `--mcp-config <tmp>.json`. File này viết vào `.opus/studio-mcp.json` của dự án, chứa `{ mcpServers: { "motion-studio": { command: process.execPath, args: [<repo>/mcp/studio-mcp.mjs, "--profile", "director", "--root", root, "--request", req.id] } } }`.
- `--allowedTools` thêm `mcp__motion-studio__<tool>` cho mỗi tool của profile `director`.
- Plugin MCP vẫn nạp như cũ; không dùng `--strict-mcp-config`.
- Prompt **không đổi luật** (buildPrompt giữ nguyên). Chỉ thêm một luật: "Thao tác media (sinh ảnh, ffmpeg) dùng tool motion-studio để có biên nhận; ghi id biên nhận trong receipt cuối."
- `reader()` báo thiếu tool `mcp__motion-studio__*` như với tool của provider.

**Client ngoài:** `GET /api/mcp/config` trả cấu hình và lệnh mẫu, để người dùng tự dán:
- `claude mcp add motion-studio -- node <repo>/mcp/studio-mcp.mjs --profile external`;
- khối `[mcp_servers.motion-studio]` cho Codex `config.toml`;
- `agy mcp add …`.

Studio **không** tự ghi config của CLI khác.

**Cổng chất lượng.** Ngưỡng mặc định lấy từ kinocut, ghi nguồn; chỉnh trong `studio.json` `quality`:

| Kiểm | Áp cho | Lệnh | Đạt khi |
|---|---|---|---|
| `duration-match` | video, audio | ffprobe | lệch ≤ 1 khung so với `expected_duration` của receipt (nếu có) |
| `resolution-fps` | video | ffprobe | khớp `expected` (rộng, cao, fps) |
| `black-frames` | video | `blackdetect=d=0.5:pix_th=0.10` | không có đoạn đen ≥ 0,5 s, trừ khi params cho phép |
| `frozen-frames` | video | `freezedetect=n=-60dB:d=1` | không có đoạn đứng hình ≥ 1 s, trừ freeze-frame có chủ đích (phase 6 đặt `allow_freeze`) |
| `silence` | audio, video có tiếng | `silencedetect=n=-50dB:d=2` | không im lặng ≥ 2 s ở giữa (đầu và cuối được) |
| `loudness` | audio | `ebur128` | I trong [-23, -9] LUFS, chỉ cảnh báo, không chặn |
| `clipping` | audio | `astats` | peak < -0,1 dBFS |
| `alpha-coverage` | PNG RGBA | `alphaextract` + `signalstats` | phần trăm điểm đục trong [3 %, 97 %]: không trong suốt hết, không đục hết (key hỏng) |
| `min-size` | ảnh | ffprobe | ≥ 512 px cạnh ngắn |

Mỗi kiểm trả `{ pass, level: "fail" | "warn", detail }`. Receipt ghi `verdict` là `pass`, `warn` hoặc `fail`.

**UI** (`ext-receipts.js`):
- `addSection("output", …)`: danh sách 20 biên nhận gần nhất (op, giờ, verdict, file ra) và nút xem chi tiết (JSON có format, các dòng kiểm).
- `addInspectorSection({ kinds: ["shot"] })`: biên nhận liên quan đến file trong `shot.assets`.

## Các bước

1. Đọc OpenChatCut (tool set), kinocut (receipt, gate) và spec MCP. Ghi bảng "tool, đọc hay sửa, ai dùng" vào `docs/mcp.md`.
2. `lib/mcp/protocol.mjs` và `mcp/studio-mcp.mjs`, với `initialize` khai `capabilities.tools`.
3. `lib/tools/project.mjs`, cùng các tool receipt.
4. `lib/quality/{video,audio,image}.mjs`.
5. `routes/receipts.mjs`, `routes/mcp.mjs`, UI.
6. `director.mjs`: `--mcp-config` và allowedTools.
7. Thử thật:
   - `claude mcp add` vào một **thư mục tạm** (scope project) rồi gọi `tools/list` bằng client JSON-RPC nhỏ chạy từ test;
   - chạy một yêu cầu đạo diễn trên `ms-smoke-5` (cổng 4405), kiểm log có `đủ … tool` và tool `mcp__motion-studio__receipts_list` có trong `system/init`.
8. Docs: cách nối từng CLI; danh sách tool; mẫu biên nhận.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`; `tests/director.test.mjs` cũ vẫn đạt. Prompt đạo diễn chỉ thêm đúng một luật; test so chuỗi được cập nhật đúng chỗ đó.
- `tests/mcp-server.test.mjs` (spawn `mcp/studio-mcp.mjs`, nói JSON-RPC qua stdio):
  - `initialize` trả `protocolVersion` và `capabilities.tools`;
  - `tools/list` chứa `project_get` và `receipts_list`;
  - profile `director` **không** chứa tên trùng với `fakePlugin` MCP_TOOLS (`project_get`);
  - `tools/call` với tham số thiếu → `isError: true`;
  - dòng không phải JSON → lỗi `-32700`, server không thoát.
- `tests/tools-project.test.mjs` (plugin thật, như `studio-server.test.mjs`): `project_patch` với base cũ → lỗi CONFLICT; base đúng → version +1, lịch sử ghi actor `director`.
- `tests/quality-checks.test.mjs`, trên media sinh bằng ffmpeg `lavfi`:
  - 2 s đen → `black-frames` fail;
  - `testsrc` → pass;
  - 3 s im lặng giữa sine → `silence` fail;
  - PNG trong suốt hết → `alpha-coverage` fail;
  - PNG key đúng → pass;
  - receipt có `verdict` đúng.
- `tests/director-mcp.test.mjs`: `claudeArgs` chứa `--mcp-config` trỏ file có tồn tại; allowedTools có `mcp__motion-studio__receipts_list`; file config trỏ đúng `mcp/studio-mcp.mjs` của repo, `--profile director`.

## Tiêu chí nghiệm thu

- Một yêu cầu đạo diễn thật trên `ms-smoke-5`:
  - log job hiện đủ tool provider cộng tool Studio, không có dòng "THIẾU";
  - đạo diễn gọi được `receipts_list` (thấy trong log `→ receipts_list`).
- Một client ngoài gọi được `tools/list` và `project_summary`. Mặc định dùng Claude Code; nếu được thì thêm Codex. Lệnh và output lưu vào PR, đã che bí mật.
- Tab Xuất bản hiện biên nhận do phase 1 tạo (ảnh thử khả năng) với verdict.
- Server 4405 đã dừng. Không còn process `studio-mcp.mjs` nào chạy (`pgrep -f studio-mcp.mjs` rỗng).

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Đạo diễn thấy tool trùng và gọi nhầm | Vừa | Vừa | Profile `director` lọc trùng; test |
| `--mcp-config` làm hỏng nạp MCP của plugin | Thấp | Cao | Không dùng `--strict-mcp-config`; thử thật bước 7; lỗi thì có cờ `director.studio_mcp: false` trong `studio.json` để tắt |
| Client ngoài sửa dự án lúc người dùng đang sửa | Vừa | Vừa | Tool sửa đòi `base` (CONFLICT như UI); khoá dự án của provider vẫn áp |
| MCP server mồ côi khi client chết | Vừa | Thấp | Thoát khi stdin đóng (`end`); test |
| ffmpeg kiểm chậm trên file dài | Vừa | Thấp | Kiểm chạy trong job; video > 10 phút chỉ lấy mẫu 3 đoạn 30 s cho black/freeze |

## Hoàn tác

`git revert -m 1 <merge>`. `director.mjs` về như cũ. Biên nhận cũ trong `.opus/receipts/` vẫn đọc được (phase 1 định dạng). `.opus/studio-mcp.json` xoá được.

## PR upstream (có điều kiện)

Chỉ mở PR khi người dùng muốn lịch sử phân biệt "agent ngoài" với "đạo diễn": thêm `"agent"` vào `ACTORS` (`gateway.mjs:58`), cùng test. Studio dùng `"agent"` cho profile `external` khi `P.gateway.ACTORS.includes("agent")`, không thì dùng `"director"`.

## PR

Tiêu đề: `feat(tools): shared project tool set over MCP, media receipts and quality gates`.

Commit gợi ý:
1. `feat(mcp): stdio server for the Studio tool set`
2. `feat(tools): project tools through the provider gateway`
3. `feat(quality): video, audio and image checks for receipts`
4. `feat(director): give the director the Studio tools`
5. `feat(ui): receipts in the export tab`
6. `docs: MCP clients and receipts`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu: **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output, đã che bí mật;
- điều kiện đạt bị trượt;
- `file:line`.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
