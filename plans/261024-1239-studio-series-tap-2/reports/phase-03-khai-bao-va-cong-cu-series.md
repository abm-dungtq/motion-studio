# Phase 03: khai báo series và công cụ series

Ngày 2026-10-24. Trạng thái: xong, mọi Verify qua.

## PR

- opus-video #6 https://github.com/abm-dungtq/opus-video/pull/6, squash `17745d0` trên `main`; `$OVC` đã pull. Thân commit squash còn hai dòng `Co-authored-by` (một dòng nhắc Claude) vì merge trước khi có lời dặn bỏ trailer; không force-push `main`. Người điều phối quyết định có viết lại hay không.
- motion-studio #23 https://github.com/abm-dungtq/motion-studio/pull/23, squash `6a6543c` trên `main`, thân commit sạch.

## File

- Plugin: `scripts/manifest.mjs` (`SERIES_FILE`, `SERIES_SCHEMA`, `SERIES_FLAG_TYPES`, `validateSeries`, `seriesDirOf`; `validate` không đổi), `scripts/studio-api.mjs` (re-export, chú thích; `STUDIO_API` 4), `scripts/tests/manifest-series.test.mjs` (8 test), `CHANGELOG.md`.
- Studio: `lib/config.mjs` (`port`, `DEFAULT_PORT`), `bin/motion-studio.mjs` (`PORT = port()`, chú thích), `director.mjs` (`MCP_ENV` vào `env` của cấu hình MCP; luật 13 cho dự án series), `server.mjs` (`projectsOf` nhận symlink tới thư mục), `lib/providers/opus-video.mjs` (khối `series`), `lib/series.mjs`, `lib/series-run.mjs`, `lib/tools/series.mjs`, `routes/series.mjs`, `tests/fake-plugin.mjs` (tùy chọn `series: true`), `tests/fixtures/series/`, `tests/series-config.test.mjs` (6), `tests/series-tool.test.mjs` (12), `tests/projects-symlink.test.mjs` (2), `tests/config.test.mjs` (+2), `tests/director-mcp.test.mjs` (+2), `docs/series.md`, `docs/extensions.md`, `CHANGELOG.md`.
- Kho series: `S/studio-series.json` (mới). Sao lưu: `$BK/song-lag-p03-20261024/` tạo, rỗng vì file mới.

## Quyết định khi làm

- Kiểu `root`: root Studio hoặc `dirname(realpath(dự án))`, mọi thư mục khác 400 (theo chỉnh của người điều phối; ghi trong `docs/series.md`, test trong `series-tool.test.mjs`).
- Giá trị cờ gửi dạng `--cờ=giá trị`, mỗi giá trị một phần tử argv, để `--title "--eval"` không thành cờ. Chín công cụ của S đều dùng `parseArgs`, nhận dạng này.
- `path:write` nhận đường trong dự án hoặc trong `writes` của công cụ, đúng chữ của phase; `writes` có `{project}` vì vậy chỉ còn ý nghĩa tài liệu cho đường trong dự án.
- Thêm `GET /api/series/job?id=`: biên nhận ghi bất đồng bộ sau khi job thoát, tool chờ route này để trả `receipt`.
- Biên nhận nằm ở thư mục thật của dự án (đường ra đã qua `realpath`), `actor` dạng `director:<id yêu cầu>` khi đạo diễn gọi.
- Cache khai báo theo mtime + size của file; lỗi khai báo là 400 liệt kê lỗi.
- Test "tên provider chỉ trong adapter" buộc `docs/series.md` và `tests/fake-plugin.mjs` không ghi tên plugin; tài liệu ghi `<provider>/series@1`.
- Task 3.7: `/api/director` cần `project.json`, nên bản chép `$T/root/a-01` được nhập qua `POST /api/import` của Studio thử (chỉ ghi vào bản chép, không đụng `$C/video/a-01`).

## Kết quả Verify

- 3.1: test plugin 563 pass; `seriesDirOf(a-01)` in đường S (sau 3.2).
- 3.2: `SERIES OK`. `a01_import "$OVC"` exit 0, dòng đầu `shots=20 lines=43 music=10 events=45`, WARN khớp mốc rỗng (`OK-A01`).
- 3.3: 13 test pass; Studio 4420 root `$T/root` chạy, `/api/projects` liệt kê `a-01`, `a-99`; `OK-4317-UNTOUCHED`; dừng.
- 3.4: `series-config.test.mjs` 6/6.
- 3.5: `series-tool.test.mjs` 12/12.
- 3.6: `npm test` node 417 pass, 0 fail, 2 skip có sẵn (OTIO thật, clone API 4 không có trên máy); ui 40 file, 240 test pass.
- 3.7: `GET /api/series?name=a-01` → "Sóng Lag", 7 nhân vật, drive `xao…@gmail.com`; `validate --all` exit 0 ("OK"); `sync-to-project --project a-01` exit 0; `--eval` → 400 "công cụ validate không có cờ --eval (được: --char, --all)"; yêu cầu đạo diễn `r-20261024141601-17f5` `done`, báo 0 lỗi, biên nhận `actor: director:r-20261024141601-17f5`. Biên nhận `series-tool` 3, chuỗi giống token 0, `OK-A01`. Cấu hình MCP của đạo diễn có `env` `MOTION_STUDIO_STATE` + `MOTION_STUDIO_PORT=4420`. Studio thử đã dừng, cổng 4420 trống, pid 4317 (82168) không đổi.

## Còn lại

- `$T/root/a-01` (bản chép) giờ có `project.json`, `assets/rig/` và biên nhận từ bài kiểm; `$T/root/a-99` còn từ phase 02. Đều trong thư mục tạm, dựng lại được.
- `/api/series/run` trả về job có `args` gồm đường tuyệt đối của S (chỉ ở máy, qua 127.0.0.1); mã không viết cứng đường nào.
