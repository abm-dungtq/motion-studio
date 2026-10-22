# Ranh giới provider (22/10/2026)

Trạng thái: xong, chờ duyệt. Nhánh `feat/provider-boundary`, không commit, không push.

## Kết quả cần có

Studio không còn tự biết plugin nào. Mọi thứ Studio cần từ plugin đi qua một contract (`lib/provider.mjs`); adapter mặc định `lib/providers/opus-video.mjs` là file duy nhất còn tên plugin. Studio mở được trang khi chưa có provider và báo rõ "chưa có provider". Tên env và file trạng thái theo tên sản phẩm (`MOTION_STUDIO_*`, `~/.config/motion-studio/studio.json`), tên cũ vẫn chạy và cảnh báo một lần.

Tư vấn gốc: `/Volumes/2/Edit-Video/plans/reports/advisor-261022-1723-motion-studio-decouple-and-repo-research.md` (A1–A4, B).

## Quyết định của người dùng

1. Studio khởi động được khi chưa có provider (nạp lười).
2. Trạng thái ở `~/.config/motion-studio/studio.json`. Chưa có file mới mà có file cũ `~/.config/opus-video/studio.json` thì chép sang, không xoá file cũ. File `.env` khoá API vẫn thuộc plugin; Studio không in, không đọc, không chép.
3. Export NLE (FCPXML/xmeml) chưa làm.
4. Repo đã ở `/Volumes/2/Motion-Studio`, `MOTION_STUDIO_HOME` đặt trong `~/.zshrc`, không symlink.
5. Repo học tập: chép mã từ GitHub được, ghi nguồn và giấy phép trong comment.

## Ngoài phạm vi

Fork schema `project.json`; loader plugin động hay sandbox; đổi `OPUS_STUDIO_RUNNER`/`OPUS_STUDIO_REQUEST` (giao thức với MCP server của plugin); sửa plugin (A5 chỉ là bản nháp bên dưới).

## Bước

1. `lib/config.mjs`: `env(key)` đọc `MOTION_STUDIO_<key>` rồi tên cũ, cảnh báo một lần mỗi tên cũ. `stateFile()` (chép file cũ khi cần), `readSettings()`, `rootDefault()`, `compressScript(root)`, `hfRuntime()`. Đường cứng `/Volumes/2/Edit-Video` còn là fallback cuối của root, ghi ngày bỏ trong CHANGELOG.
2. `lib/provider.mjs`: contract và `loadProvider()` (nạp lười, giữ bản nạp thành công), `providerStatus()` cho API. Adapter mặc định chọn trong `lib/providers/` qua cờ `DEFAULT`, hoặc theo `MOTION_STUDIO_PROVIDER`.
3. `lib/providers/opus-video.mjs`: bọc `studio-api.mjs` (thay `lib/plugin.mjs`), giữ `NEED`, nhận `STUDIO_API` 3 và 4; `OPUS_VIDEO_HOME` đặt là thì chỉ dùng thư mục đó. Gom đoạn prompt, `childEnv`, danh sách tool, đường script, file thư viện.
4. `server.mjs`, `director.mjs`, `create.mjs`, `gates.mjs`, `bundle.mjs`: bỏ top-level await, lấy provider khi cần. Route cần provider trả 503 kèm hướng dẫn. Thêm `GET /api/status`; `/api/agent` có `provider`.
5. `bin/motion-studio.mjs`: dùng `lib/config.mjs`; giữ `root` cài đặt như `director` qua stop/start.
6. Giao diện: title, chip agent đỏ khi chưa có provider, banner; thư viện lấy nguồn và nhãn từ provider.
7. Test: env cũ (cảnh báo một lần), env mới (không cảnh báo), không có provider (server lên, API báo), chép file trạng thái, cấm chuỗi tên plugin ngoài adapter.
8. README, CHANGELOG, `package.json`.

## Tiêu chí xong

- `npm test` xanh (gốc 93 pass), có test mới.
- `grep -rn` tên plugin ngoài adapter, `tests/fixtures`, CHANGELOG, `plans/` không ra dòng nào (README chỉ nhắc ở chỗ gọi tên provider mặc định).
- `MOTION_STUDIO_HOME=/Volumes/2/Motion-Studio node ~/.claude/skills/opus-video/scripts/studio.mjs status` vẫn chạy.
- Chạy server ở cổng phụ với `OPUS_VIDEO_HOME=/nonexistent`: trang mở được, API báo không có provider.

## Rủi ro và hoàn tác

- Server 4317 đang chạy bằng mã cũ, ghi file trạng thái cũ. Mã mới chép file cũ sang file mới lần đầu, nên `status` vẫn thấy server đó. Không dừng server này.
- Hoàn tác: `git checkout main` (chưa commit gì); file `~/.config/motion-studio/studio.json` xoá được, file cũ còn nguyên.

## A5: bản nháp thay đổi upstream cho plugin (chưa làm, chưa mở PR)

1. `scripts/studio-api.mjs`: thêm `SKILLS` (mảng tên skill; adapter dựng dòng skill của prompt từ đó) và `COMMANDS.choose = { file, args }` (args có `{project}`, `{pick}`, ví dụ `["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"]`; gates.mjs dùng nó, không có thì về cú pháp make-pitch cũ). Ngoài ra: thêm `SKILLS` (skill đạo diễn dùng: ov-studio, ov-build, ov-script, ov-audio, ov-deliver) và `COMMANDS = { render, mix, pitch, import, demo, recipe, preflight, cases, styles }` (đường tuyệt đối), `DIRECTOR_PROMPT` (vai trò, luật về khoá API) để adapter không ghi cứng tên file; nâng `STUDIO_API = 4`. Adapter Studio đã nhận 3 và 4 và dùng `COMMANDS` khi có.
2. MCP server đọc `MOTION_STUDIO_RUNNER`/`MOTION_STUDIO_REQUEST` song song `OPUS_STUDIO_RUNNER`/`OPUS_STUDIO_REQUEST`; Studio đặt cả hai một thời gian rồi bỏ tên cũ.
3. Shim `scripts/studio.mjs`: thêm `/Volumes/2/Motion-Studio` không cần; chỉ đổi thông báo clone nếu đổi đường mặc định.
