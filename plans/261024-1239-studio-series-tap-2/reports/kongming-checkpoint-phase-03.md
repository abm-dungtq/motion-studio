# Kongming checkpoint sau phase 03 (2026-10-24)

Kết luận: **GO sang phase 05–06**, kèm hai việc nhỏ cần vá trước khi phase 06 chạy đạo diễn thật, và các sửa đã áp vào file phase 06 và 10.

## Bằng chứng đã kiểm (không lấy từ báo cáo)

- opus-video `$OVC` @ `17745d0` (squash PR #6): `node --test scripts/tests/*.test.mjs` → 563 pass, 0 fail. Diff: `scripts/manifest.mjs` thêm `SERIES_FILE`, `SERIES_SCHEMA`, `SERIES_FLAG_TYPES`, `validateSeries`, `seriesDirOf`; `validate` không đổi; `studio-api.mjs` re-export, `STUDIO_API` giữ 4.
- Motion Studio `main` @ `6a6543c` (squash PR #23): `npm test` → node 419 test / 417 pass / 2 skip (sẵn có) / 0 fail; ui 40 file / 240 pass; kiểm sở hữu 6/6. 28 file, +1184/−10, không file nhị phân.
- Code đọc trực tiếp: `lib/series-run.mjs`, `lib/series.mjs`, `routes/series.mjs`, `lib/tools/series.mjs`, diff `director.mjs`, `server.mjs`, `lib/config.mjs`, `jobs.mjs`; `S/studio-series.json` thật; `S/tools/new-episode.mjs` (dùng `parseArgs`, nhận `--cờ=giá trị`).
- Probe trên bản chép fixture (`$T/kong-probe`, không đụng repo): xác nhận lỗ hổng "positional path:read" bên dưới.

## Đánh giá bảo mật `series_tool`

Ngữ cảnh tin cậy: Studio chạy cùng user với đạo diễn; đạo diễn vốn chạy được `node $OV/scripts/*` và ghi trong cwd. Vì vậy "chạy mã" không phải leo thang; cái cần giữ là (1) không ghi ra ngoài dự án/S ngoài chỗ khai báo, (2) không ghi đè kho tập 1, (3) biên nhận đủ để truy.

Điểm tốt (đã kiểm trong mã):
- Cờ phải khai báo, giá trị theo kiểu, gửi dạng `--cờ=giá trị` một phần tử argv, `shell: false`, cwd = S (`series-run.mjs:93-107,138`; `jobs.mjs:38`).
- Đường: cấm tuyệt đối, `\`, `..`, `.`, đoạn bắt đầu bằng dấu chấm; `realish` giải realpath phần sâu nhất đã có rồi mới so `inside` (`series-run.mjs:42-53`); file công cụ cũng realpath và phải trong S (`:124`).
- `root` chỉ nhận root Studio hoặc `dirname(realpath(dự án))` (`:70-74`); `project` chỉ nhận dự án đang chạy (`:67-69`).
- `series_file_put`: khóa `writable` cố định, kiểm realpath hai lần (trước và sau `mkdir`), 409 khi đích đã có, `.bak-` khi `replace` (`routes/series.mjs:118-153`). `tools/` và `studio-series.json` không nằm trong `writable`.
- Timeout `timeout_s` → `cancel` SIGTERM rồi SIGKILL (`routes/series.mjs:78`, `jobs.mjs:69-78`). `drive.account` che (`series.mjs:90-93`). Log qua `redact`.
- `projectDir` của server không đòi `project.json` (`server.mjs:173-178`), nên `/api/series/episode` từ a-01 thật (chưa import) chạy được ở phase 06.

Lỗ hổng và rủi ro còn lại (theo mức):

1. **Positional `path:read` bỏ qua danh sách `read`** (đã tái hiện). Vòng kiểm `read` ở `series-run.mjs:130-137` chỉ duyệt `flags`, không duyệt `positional`. Một công cụ khai báo `positional: "path:read*"` sẽ nhận `S/studio-series.json`, `S/tools/fail.mjs`, mọi file trong S. Hôm nay không công cụ nào của S khai báo positional kiểu path (chỉ `hd-poses: id*`), nên chưa khai thác được; phase 10 từng định dùng positional path cho thumbnail. Sửa: chuyển kiểm `read` vào `value()` cho cả hai nhánh, thêm test positional. Một PR `fix/` nhỏ, 20 dòng, trước phase 10; không chặn 05–06.
2. **`actor` tự khai**: route lấy `b.actor` nếu khớp regex, mặc định `human` (`routes/series.mjs:29-32`); không kiểm `request id` có thật. Cùng nếp với `routes/agents.mjs:39`. Chấp nhận ở mức tin cậy này, nhưng phase 04 (thẻ đồng ý) không được dùng `actor` từ body làm cổng; `consent/answer` phải là route riêng chỉ người dùng/điều phối gọi, và biên nhận `consent` ghi `by` từ phía server.
3. **`seriesDirOf` tin dòng `series:` của BRIEF trỏ bất kỳ thư mục nào có `studio-series.json`**. Đạo diễn về lý thuyết ghi được BRIEF bằng `node` (ghi nhớ 2026-10-17: Edit deny không chặn node script), trỏ `series: ./x` trong dự án và cho Studio chạy `x/tools/*.mjs`. Không leo thang (cùng user), nhưng làm biên nhận trỏ "series" giả. Vá rẻ: `seriesFor` từ chối series dir nằm trong dự án (`inside(realpath(found), realpath(projectDir))` → 400). Làm cùng PR với mục 1.
4. **`rig_src` là mã đạo diễn viết, Studio chạy** (`characters/{char}/src/hd-poses.mjs` vừa là đích `series_file_put` vừa là `file` của công cụ `hd-poses`). Đây là thiết kế của plan (task 3.6), không phải lỗi; ghi rõ trong `docs/series.md` câu "công cụ series là mã tin cậy của người dùng" chưa nói tới trường hợp này. Canh ở phase 06: đọc `hd-poses.mjs` đạo diễn nộp trước khi cho `series_tool hd-poses` chạy; biên nhận `series-put` cho biết file nào vừa đổi.
5. **`writes: ["characters"]` của `import-sprite` quá rộng** trong `S/studio-series.json`: `--out S/characters/bo/src/hd-poses.mjs` được nhận và ghi dữ liệu sprite lên mã dựng của bố (phá rig tập 1, không phải chạy mã). Thu hẹp thành `characters/{char}` kèm `--char`, hoặc chỉ `{project}/assets/gen` rồi để `series_file_put` chép vào S khi duyệt (đúng tinh thần phase 04: "chưa chép gì vào S"). Sửa file khai báo, không sửa mã.
6. **Ghi qua symlink có sẵn trong S**: `copyFileSync` theo link; nếu `S/refs/x.png` là symlink ra ngoài thì `replace: true` ghi xuyên qua. Cần ai đó đặt link trong S trước, nên thấp. Vá một dòng: `lstatSync(target).isSymbolicLink()` → 400.
7. Nhỏ: `seriesFor` gọi `statSync(file)` không bắt lỗi → 500 nếu file bị xóa giữa `dirOf` và `stat`; `/api/series/run` trả `args` có đường tuyệt đối của S (localhost, chấp nhận).

## Lệch so với phase (đã đọc báo cáo, đồng ý)

- Kiểu `root` nhận hai thư mục thay vì một: cần thiết cho tập symlink; test có.
- `--cờ=giá trị`: tốt hơn plan, chặn `--title "--eval"`.
- `GET /api/series/job`: cần vì biên nhận ghi bất đồng bộ; không thêm bề mặt ghi.
- Trailer `Co-authored-by` trong squash #6 của opus-video: vi phạm ràng buộc "không nhắc AI" nhưng đã lên `main`; không force-push. Để nguyên, ghi vào báo cáo phase 11; các PR sau phải sạch (PR #23 đã sạch).

## Sửa đã áp vào file phase (chỉ câu lệnh/Verify, không đổi phạm vi)

- `phase-06` task 6.1 bước 2: `GET /api/jobs?name=a-02` → `GET /api/series/job?id=…` (job tạo tập đăng ký dưới `name: from` = `a-01`, `routes/series.mjs:175`; a-02 chưa tồn tại lúc job chạy).
- `phase-06` task 6.1 tiêu chí: "trả series `song-lag`" → `name` là "Sóng Lag", `dir` kết thúc `series/song-lag`.
- `phase-06` task 6.2 bước 3: body `{ value: "yes" }` → `{ ok: true }` theo hợp đồng task 4.2 của phase 04.
- `phase-06` task 6.5 bước 2: biên nhận `series-run` → `series-tool` (tên op thật).
- `phase-10` task 10.2 bước 6: bỏ `interpreter: python3` và positional nhiều kiểu (hợp đồng đã merge chỉ nhận `.mjs` + một kiểu positional); thay bằng bọc `make-thumbnail.mjs` gọi python3 với cờ có kiểu.
- Không sửa phase 04 (executor đang chạy). Phase 04 không có lỗi chặn; lưu ý duy nhất là mục 2 (actor) ở trên.

## GO/NO-GO

GO phase 05 và 06. Điều kiện kèm, không chặn:
- Trước phase 06 task 6.5 (đạo diễn nộp mã rig): mở PR `fix/series-path-guards` gồm mục 1, 3, 6 (khoảng 30 dòng + 3 test) và thu hẹp `writes` của `import-sprite` trong `S/studio-series.json` (mục 5). Có thể làm sau khi phase 04 merge để không đụng nhánh.
- Phase 04 `consent`: `by` của thẻ ghi từ server, không từ body.

## Rủi ro cần canh ở 05–06

- Phase 06 chạy trên a-01 thật qua symlink: mọi route chỉ GET trên a-01; `series/episode` ghi biên nhận vào tập mới (`after()` trả `dir: fresh`), nhưng nếu công cụ `new-episode` **thất bại** thì biên nhận rơi vào `from` = a-01 thật (`routes/series.mjs:18`, `:69` dùng `receipt.dir` khi `after` trả null). Đây là một đường ghi vào `$C/video/a-01/.opus/receipts/`. Chạy 6.1 một lần, kiểm `find "$C/video/a-01" -newer plan.md` ngay sau; nếu có file, đó là nguyên nhân.
- `new-episode` đọc `.gitignore` mẫu ở đường cứng `/Volumes/2/Edit-Video/scripts/templates/gitignore.template` (`new-episode.mjs:22`): thiếu thì dùng bản tối thiểu, không lỗi.
- `hd-poses` của bà nội là file đạo diễn viết; đọc trước khi chạy (mục 4).
