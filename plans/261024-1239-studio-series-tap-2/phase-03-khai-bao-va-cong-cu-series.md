---
phase: 3
title: "Khai báo series và công cụ series cho đạo diễn (A, B)"
status: done
effort: 6h
depends_on: ["phase-01", "phase-02"]
---

# Phase 03: Khai báo series và công cụ series

## Bối cảnh

Studio chưa biết gì về series (`scout gap-check`, khoảng trống 8). Đạo diễn `claude -p` chỉ chạy được `node $OV/scripts/*` (`scripts/studio-api.mjs:63`) và chỉ ghi được trong dự án (`director.mjs:5-6`), nên không chạy được `S/tools/*` và không ghi được vào `S/`. Phase này thêm file khai báo `S/studio-series.json`, phần kiểm của plugin, và các tool Studio chạy công cụ series theo khai báo, có biên nhận. Không sửa `ALLOWED_TOOLS`.

Phase này cũng thêm `MOTION_STUDIO_PORT`, vì từ đây mọi phép kiểm tích hợp chạy Studio thử ở 4420.

## Repo, nhánh, PR

1. opus-video (`$OVC`): nhánh `feat/series-declaration`, PR "feat(manifest): kiểm file khai báo series và dòng series trong BRIEF". Merge trước bước Studio.
2. Motion Studio (`$MS`): nhánh `feat/series-tools`, PR "feat(series): công cụ series cho đạo diễn và cổng chạy thử". Merge cuối phase.
3. Kho series: `S/studio-series.json` (file mới).

## File sở hữu

- opus-video: `scripts/manifest.mjs` (thêm export, không đổi `validate`), `scripts/studio-api.mjs` (thêm re-export và một dòng chú thích), `scripts/tests/manifest-series.test.mjs` (mới), `CHANGELOG.md`.
- Motion Studio: `lib/config.mjs`, `bin/motion-studio.mjs`, `director.mjs` (cấu hình MCP và một luật trong prompt), `lib/providers/opus-video.mjs` (một khối `series`), `lib/series.mjs` (mới), `lib/series-run.mjs` (mới), `lib/tools/series.mjs` (mới), `routes/series.mjs` (mới), `tests/fake-plugin.mjs`, `tests/series-config.test.mjs` (mới), `tests/series-tool.test.mjs` (mới), `tests/fixtures/series/` (mới: một series giả nhỏ), `tests/config.test.mjs`, `tests/director-mcp.test.mjs`, `docs/series.md` (mới), `docs/extensions.md` (một dòng trỏ tới series.md), `CHANGELOG.md`.
- Kho series: `S/studio-series.json`.

## Tốn lượt

Không có Codex hay ElevenLabs. Task 3.7 chạy đạo diễn thật một lần (`claude -p`), dùng lượt Claude Code của máy, không tốn quota hình hay giọng.

## Task 3.1: Plugin kiểm file khai báo và tìm series của dự án

Bước:
1. Trong `scripts/manifest.mjs` thêm:
   - `SERIES_FILE = "studio-series.json"`, `SERIES_SCHEMA = "opus-video/series@1"`;
   - `validateSeries(obj) → [lỗi tiếng Việt]` theo hợp đồng ở task 3.2;
   - `seriesDirOf(projectDir) → đường tuyệt đối | null`: đọc frontmatter `series:` của `BRIEF.md` (tuyệt đối, hoặc tương đối với dự án); không có thì đọc dòng `- Thư mục series: <đường>` dưới `## series_bible` (a-01 dùng dạng này, `a-01/BRIEF.md` mục series_bible). Chỉ trả về khi thư mục có `studio-series.json`.
2. Trong `scripts/studio-api.mjs` re-export ba tên trên cùng chỗ với `load, validate`. Không tăng `STUDIO_API`; thêm một câu vào chú thích đầu file theo cách đã ghi cho `OPS` (thêm mà không đổi hình dạng gì đã có).
3. Test `scripts/tests/manifest-series.test.mjs`: file hợp lệ không lỗi; thiếu `name`, tool có `..`, đường tuyệt đối, cờ sai dạng, kiểu cờ lạ, `timeout_s` ngoài 1–3600 đều ra lỗi; `seriesDirOf` đọc được cả hai dạng BRIEF; BRIEF không có series trả `null`.
4. Commit, PR, merge, `git -C "$OVC" pull`.

Tiêu chí thành công: test plugin xanh; `seriesDirOf` trên a-01 thật trả về S.

Verify:
```bash
cd "$OVC" && node --test scripts/tests/*.test.mjs 2>&1 | tail -3
node -e 'import("'"$OVC"'/scripts/studio-api.mjs").then(m=>console.log(m.seriesDirOf(process.argv[1])))' "$C/video/a-01"   # in ra đường S sau task 3.2
```

## Task 3.2: `S/studio-series.json`

Bước:
1. Sao lưu: `mkdir -p "$BK/song-lag-p03-$(date +%Y%m%d)"`; file này mới nên không có gì để chép, chỉ ghi vào báo cáo.
2. Viết file theo hợp đồng (mọi đường tương đối với thư mục S; `{project}` là thư mục dự án; `{char}` là id nhân vật đã kiểm dạng):
   ```json
   {
     "schema": "opus-video/series@1",
     "name": "Sóng Lag",
     "characters": "characters",
     "voices": { "cast": "voices/cast.json", "roles": "voices/roles.json", "previews": "voices/previews" },
     "read": ["refs", "characters", "backgrounds", "props", "voices", "palette", "fonts", "style", "kenh-youtube", "templates"],
     "writable": { "refs": "refs", "rig_src": "characters/{char}", "backgrounds": "backgrounds", "props": "props" },
     "episode": { "tool": "new-episode", "name": "a-{NN}" },
     "delivery_dir": "kenh-youtube/tap-{N}",
     "drive": { "account": "<email tài khoản Drive>", "folder": "song-lag" },
     "image_styles": { "pose": "…", "background": "…", "prop": "…", "ui-card": "…", "thumbnail": "…" },
     "tools": {
       "validate":        { "file": "tools/validate.mjs", "flags": { "--char": "id", "--all": "bool" }, "writes": [], "timeout_s": 120 },
       "build-rig":       { "file": "tools/build-rig.mjs", "flags": { "--char": "id", "--all": "bool", "--props": "bool" }, "writes": [], "timeout_s": 300 },
       "sync-to-project": { "file": "tools/sync-to-project.mjs", "flags": { "--project": "project" }, "writes": ["{project}/assets/rig"], "timeout_s": 120 },
       "check-palette":   { "file": "tools/check-palette.mjs", "flags": { "--dir": "path:read", "--every": "int", "--scale": "int", "--exclude-y": "range", "--max-report": "int" }, "writes": [], "timeout_s": 600 },
       "import-sprite":   { "file": "tools/import-sprite.mjs", "flags": { "--in": "path:read", "--out": "path:write", "--height": "int", "--width": "int", "--ramps": "word", "--slot": "slot*", "--preview": "path:write" }, "writes": ["{project}/assets/gen", "characters"], "timeout_s": 120 },
       "quantize":        { "file": "tools/quantize.mjs", "flags": { "--in": "path:read", "--out": "path:write", "--w": "int", "--h": "int", "--dither": "word", "--fit": "word", "--preview4x": "path:write" }, "writes": ["{project}/assets/gen"], "timeout_s": 120 },
       "hd-poses":        { "file": "characters/{char}/src/hd-poses.mjs", "positional": "id*", "flags": { "--preview": "path:write" }, "writes": ["characters/{char}", "{project}/assets/gen"], "timeout_s": 300 },
       "lipsync":         { "file": "tools/lipsync.mjs", "flags": { "--words": "path:read", "--out": "path:write", "--offset": "number" }, "writes": ["{project}/assets/voice"], "timeout_s": 60 },
       "new-episode":     { "file": "tools/new-episode.mjs", "flags": { "--root": "root", "--episode": "int", "--title": "text", "--name": "id" }, "writes": ["{root}"], "timeout_s": 120 }
     }
   }
   ```
   Các tool lồng tiếng, cảnh và giao nộp được thêm ở phase 07, 09, 10.
3. Khuôn `image_styles` lấy từ `S/spikes/gen-hd-poses.sh` (biến `STYLE`, bỏ phần mô tả riêng Sóng, giữ "Match the attached reference character and style exactly … flat solid pure green #00FF00 background, no ground shadow, no text"), `S/style/direction.json` (`prompt_suffix`, cho nền) và `S/spikes/gen-backgrounds.sh`. `thumbnail` chừa 45% bên phải trống cho chữ.
4. Kiểu cờ hợp lệ: `bool`, `int`, `number`, `id` (`^[a-z0-9][a-z0-9-]{0,40}$`), `word` (`^[A-Za-z0-9._-]{1,40}$`), `text` (chuỗi một dòng tối đa 200 ký tự), `range` (`^\d+:\d+$`), `slot` (`^[a-z]+:\d+,\d+$`), `path:read`, `path:write`, `project`, `root`. Đuôi `*` cho phép lặp.

Tiêu chí thành công: `validateSeries` của plugin không báo lỗi trên file này.

Verify:
```bash
node -e 'import("'"$OVC"'/scripts/studio-api.mjs").then(m=>{const fs=require("fs");const e=m.validateSeries(JSON.parse(fs.readFileSync(process.argv[1],"utf8")));console.log(e.length?e.join("\n"):"SERIES OK")})' "$S/studio-series.json"
```

## Task 3.3: Cổng và file trạng thái cho Studio thử

Bước:
1. `lib/config.mjs`: thêm `port(source) = Number(env("PORT", source)) || 4317` theo nếp các hàm `env(...)` ở đó.
2. `bin/motion-studio.mjs`: thay hằng `PORT = 4317` (dòng 37) bằng giá trị từ `port()`, dùng ở `url()`, `listen`, `portOwner` và các thông báo. Chú thích đầu file ghi biến mới.
3. `director.mjs`, hàm `studioMcp`: nếu tiến trình có `MOTION_STUDIO_STATE` hay `MOTION_STUDIO_PORT`, ghi chúng vào `env` của server MCP trong `.opus/studio-mcp.json`, để tool của đạo diễn gọi đúng Studio thử.
4. Test: `tests/config.test.mjs` (mặc định 4317, biến môi trường 4420), `tests/director-mcp.test.mjs` (env xuất hiện trong cấu hình MCP khi đặt, không xuất hiện khi không đặt).
5. `server.mjs`, hàm `projectsOf` (dòng 121-135): `readdirSync(root, { withFileTypes: true })` không theo symlink, nên `e.isDirectory()` là `false` với một symlink trỏ tới thư mục và dự án đó không hiện trong `/api/projects`, dù `projectDir` (dòng 167-172, dùng `statSync`) và `toolEnv.projectDir` (`lib/tools.mjs:121-126`) vẫn mở được nó. Sửa điều kiện thành: entry là thư mục, hoặc là symlink mà `statSync(join(root, e.name)).isDirectory()` (symlink hỏng thì bỏ qua, không ném lỗi). Lý do: Studio 4317 giữ root `/Volumes/2/Edit-Video` (ở đó có `scripts/compress-final.sh`, `shared-assets/sfx`, `scripts/new-project.sh` mà các route xuất bản, thư viện âm thanh và Dự án mới đọc theo root; `$C/video` không có), còn các tập của series được nối vào root bằng symlink `a-01`, `a-02` (phase 11). Chú thích đầu `bin/motion-studio.mjs` thêm một câu: dự án có thể là symlink tới thư mục ở nơi khác.
6. Test `tests/projects-symlink.test.mjs`: tạo root tạm có một dự án thật và một symlink tới một dự án ở thư mục tạm khác (có `project.json` giả và `index.html`); `createServer` cổng 0; `GET /api/projects` liệt kê cả hai; `GET /p/<tên symlink>/index.html` trả 200; một symlink hỏng không làm route lỗi.

Tiêu chí thành công: Studio thử chạy ở 4420 với root `$T/root`; pid của Studio 4317 không đổi; file `~/.config/motion-studio/studio.json` không đổi; dự án qua symlink hiện trong danh sách.

Verify:
```bash
cd "$MS" && node --test tests/config.test.mjs tests/director-mcp.test.mjs tests/projects-symlink.test.mjs 2>&1 | tail -3
before=$(shasum ~/.config/motion-studio/studio.json | cut -c1-12); pid=$(lsof -ti tcp:4317 -sTCP:LISTEN)
mkdir -p "$T/root" && rsync -a --exclude=renders --exclude=demo --exclude=build --exclude=qa "$C/video/a-01/" "$T/root/a-01/"
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json" OPUS_VIDEO_HOME="$OVC"; node "$MS/bin/motion-studio.mjs" start --background --root "$T/root"; node "$MS/bin/motion-studio.mjs" status )
curl -s http://127.0.0.1:4420/api/projects | head -c 300; echo
test "$(shasum ~/.config/motion-studio/studio.json | cut -c1-12)" = "$before" && test "$(lsof -ti tcp:4317 -sTCP:LISTEN)" = "$pid" && echo OK-4317-UNTOUCHED
( export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$T/studio.json"; node "$MS/bin/motion-studio.mjs" stop )
```

## Task 3.4: `lib/series.mjs` và khối `series` của provider

Bước:
1. `lib/providers/opus-video.mjs` (chỗ duy nhất được nêu tên plugin): thêm `series: api.seriesDirOf ? { file: api.SERIES_FILE, dirOf: api.seriesDirOf, validate: api.validateSeries } : null` vào đối tượng provider.
2. `tests/fake-plugin.mjs`: thêm ba export tương ứng để test Studio không cần plugin thật.
3. `lib/series.mjs` export:
   - `seriesFor(P, projectDir) → { dir, config } | null`, ném lỗi 400 tiếng Việt khi file khai báo có lỗi (liệt kê lỗi của `validate`); đọc lại khi mtime của file khai báo đổi;
   - `seriesPath(series, rel, vars)`: thay `{project}`, `{char}`, `{root}`, `{N}`, `{NN}`, nối với `series.dir`, từ chối `..`;
   - `listSeries(P, root)`: các series khác nhau tìm được qua mọi dự án con của root.
4. Test `tests/series-config.test.mjs` dùng `tests/fixtures/series/` (một series giả gồm `studio-series.json`, `tools/echo-args.mjs` in đối số và ghi một file vào đường `--out`, `tools/fail.mjs` thoát 3) và hai dự án giả (một có `series:` trong BRIEF, một có `## series_bible`).

Verify:
```bash
cd "$MS" && node --test tests/series-config.test.mjs 2>&1 | tail -3
```

## Task 3.5: `lib/series-run.mjs`: dựng lệnh và từ chối đối số lạ

Bước:
1. `buildArgv({ series, projectDir, root, tool, flags, positional }) → { cmd, argv, cwd, timeoutMs, writes }`:
   - `tool` phải có trong `config.tools`; cờ phải có trong `flags` của tool; giá trị phải đúng kiểu;
   - đường (`path:read`, `path:write`): dạng `S/<rel>` nghĩa là trong S, còn lại là tương đối với dự án; không nhận đường tuyệt đối, `\`, đoạn `..`, `.` hay đoạn bắt đầu bằng dấu chấm; giải `realpath` như `insideProject` (`lib/tools.mjs:180-193`);
   - `path:read` phải nằm trong dự án hoặc một thư mục trong `read`; `path:write` phải nằm trong dự án hoặc một thư mục trong `writes` của tool; không đường nào được nằm dưới `S/build` (công cụ tự ghi vào đó, đối số thì không);
   - `project` chỉ nhận đúng thư mục dự án đang chạy; `root` chỉ nhận root của Studio;
   - `cmd` là `process.execPath`; `cwd` là S;
   - không bao giờ ghép chuỗi qua shell (`startJob` đã chạy `shell: false`, `jobs.mjs:42`).
2. Test `tests/series-tool.test.mjs`: từ chối cờ không khai báo, `node -e` giả dạng cờ, `--out ../x`, `--out /tmp/x`, `--out S/build/x`, `--in S/../../etc/passwd`, kiểu `int` nhận chữ; nhận một lệnh đúng và trả `argv` đúng thứ tự.

Verify:
```bash
cd "$MS" && node --test tests/series-tool.test.mjs 2>&1 | tail -3
```

## Task 3.6: Tool và route series

Bước:
1. `routes/series.mjs`:
   - `GET /api/series?name=` → `{ name, dir, characters, roles, tools: [{ name, flags }], image_styles: [kind], delivery_dir }` (không trả `drive.account` ra giao diện ngoài một chuỗi đã che, ví dụ `xao…@gmail.com`);
   - `POST /api/series/run { name, tool, flags, positional, actor }` → `startJob({ kind: "series", … })`, trả `{ job }`; job xong thì `writeReceipt(projectDir, { op: "series-tool", actor, tool: { name, file }, params: { flags, positional }, outputs: <các path:write có thật sau khi chạy> })`;
   - `POST /api/series/put { name, from, to, char?, replace? }`: chép một file trong dự án sang một khóa của `writable` (`to` là `rig_src/<tên file>`, `refs/<đường>` …); file đích đã có thì từ chối trừ khi `replace: true`, khi đó chép file cũ thành `<tên>.bak-<yyyymmddHHMM>` trước; ghi biên nhận `op: "series-put"`;
   - `POST /api/series/episode { from, episode, title }`: `from` là một dự án đã có để tìm series; chạy tool `episode.tool` với `--root <thư mục thật chứa from>`, tức `dirname(realpathSync(projectDir(from)))` (các tập của một series nằm cạnh nhau ở `$C/video`, không phải ở root Studio, vì `from` có thể là symlink trong root). Khi thư mục đó khác root Studio, sau khi job xong tạo symlink `<root>/<tên tập>` trỏ tới thư mục thật (đã có tên đó trong root thì trả 409, không ghi đè); job xong thì ghi biên nhận vào dự án mới. Test trong `tests/series-tool.test.mjs`: `from` là symlink → tập mới nằm cạnh thư mục thật và root có symlink mới; `from` nằm thẳng trong root → không tạo symlink.
2. `lib/tools/series.mjs` export `TOOLS`: `series_list`, `series_tool`, `series_file_put`, `series_episode_new`. Tool chạy lâu gọi route qua `env.studio.post(...)` rồi chờ job như `image_generate` (`lib/tools/agents.mjs:38-50`), trả `{ ok, code, tail, receipt }`. Mô tả tool viết tiếng Việt, nói rõ cờ được phép lấy từ `series_list`.
3. `director.mjs`, `buildPrompt`: khi `seriesFor` tìm thấy series, thêm một luật: "Dự án thuộc series <name>. Công cụ series, vẽ ảnh, lồng tiếng, dựng cảnh và giao nộp chỉ đi qua tool motion-studio (series_*, asset_*, voice_*, scene_*, deliver_*). Không gọi codex, cast-tts, `eleven.mjs tts` hay `eleven.mjs voice*` trực tiếp (giọng chỉ qua series_tts, voice_design). `eleven.mjs sfx` và `eleven.mjs music` vẫn dùng được cho hiệu ứng và nhạc nền (tập 1 làm vậy, `a-01/assets/bgm`, `assets/sfx`); trước khi gọi, ưu tiên thư viện `shared-assets/sfx` của root và file đã có trong dự án, và ghi số lượt đã dùng vào project_log. File cần ghi vào kho series thì viết trong dự án rồi dùng series_file_put." Lý do tách tts khỏi sfx/music: cấm cả `eleven.mjs` thì tập 2 không có đường nào sinh SFX và nhạc nền mới, vì plan không có tool Studio cho việc đó.
4. `docs/series.md`: hợp đồng file khai báo, kiểu cờ, luật đường, ví dụ series khác chỉ cần thêm file của mình. Thêm một dòng vào bảng của `docs/extensions.md`.
5. Test thêm vào `tests/series-tool.test.mjs`: chạy `echo-args` qua route trên server tạo bằng `createServer` (cổng 0), có biên nhận, biên nhận không chứa chuỗi giống token; `series_file_put` không ghi đè khi không có `replace`, có `.bak-` khi có; `fail.mjs` trả `ok: false` kèm mã thoát.

Tiêu chí thành công: `npm test` xanh (cả `ui`).

Verify:
```bash
cd "$MS" && npm test 2>&1 | tail -5
```

## Task 3.7: Kiểm tích hợp trên bản chép a-01

Bước (Studio thử 4420, root `$T/root`, như Verify của task 3.3; luôn dừng ở cuối):
1. `GET /api/series?name=a-01` trả `name` là "Sóng Lag".
2. `POST /api/series/run` với `validate --all` → job xong exit 0, có biên nhận trong `$T/root/a-01/.opus/receipts/`.
3. `POST /api/series/run` với `sync-to-project --project <a-01 bản chép>` → exit 0.
4. `POST /api/series/run` với cờ lạ `--eval` → 400 kèm lý do tiếng Việt.
5. Đạo diễn thật: `POST /api/director { name: "a-01", text: "Dùng series_list rồi series_tool chạy validate --all của series, báo số lỗi. Không sửa file nào." }`, chờ yêu cầu xong (`GET /api/requests?name=a-01`), kiểm biên nhận có `actor` là id yêu cầu.

Gọi route POST cần token của Studio thử. Đọc nó vào biến mà không in: `TOKEN=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).token)' "$T/studio.json")`, rồi `curl -s -H "x-studio-token: $TOKEN" -H 'content-type: application/json' -d '{…}' http://127.0.0.1:4420/api/series/run`. Không `echo $TOKEN`.

Tiêu chí thành công: bốn bước đầu đúng như trên; yêu cầu đạo diễn kết thúc `done` và biên nhận có `op: "series-tool"`.

Verify:
```bash
ls "$T/root/a-01/.opus/receipts"/*/series-tool-*.json | wc -l     # >= 3
command grep -lE '(sk-[A-Za-z0-9]{20}|eyJ[A-Za-z0-9_-]{20}|ya29\.|xi-api-key)' -r "$T/root/a-01/.opus/receipts" | wc -l   # 0
a01_import "$OVC" 2>&1 | command grep '^WARN' | diff - "$PLAN/reports/a01-import-moc-warn.txt" && echo OK-A01
```

## Rủi ro

- Kiểm đường chỉ ở mức đối số: một công cụ series có thể tự ghi ra chỗ khác (Trung bình × Trung bình). Công cụ series là mã tin cậy của người dùng; Studio chặn đối số đường lạ, không làm sandbox. Ghi điều này trong `docs/series.md`.
- `series_episode_new` ghi `BRIEF.md` mới qua công cụ, trong khi đạo diễn không được sửa BRIEF (Thấp × Trung bình). Chấp nhận vì công cụ từ chối khi dự án đã có; nó không đụng `direction:` hay `approval:` của dự án nào.
- Server MCP của đạo diễn gọi nhầm Studio 4317 (Trung bình × Cao): task 3.3 bước 3 và Verify của task 3.7 bắt lỗi này.

## Khôi phục

Revert hai PR. Xóa `S/studio-series.json`. Studio 4317 không đổi trong phase này.

## Kết quả thực hiện (2026-10-24)

Mọi task 3.1–3.7 xong, mọi Verify qua; chi tiết ở `reports/phase-03-khai-bao-va-cong-cu-series.md`. Tóm tắt:
- Plugin: PR https://github.com/abm-dungtq/opus-video/pull/6, squash-merge `17745d0`; test plugin 563 pass. `seriesDirOf` trên a-01 thật trả đúng S (qua dòng `## series_bible`). `a01_import "$OVC"` exit 0, WARN rỗng như mốc.
- `S/studio-series.json` mới, `validateSeries` in `SERIES OK`. Thư mục sao lưu `$BK/song-lag-p03-20261024/` (rỗng, file mới).
- Studio: PR https://github.com/abm-dungtq/motion-studio/pull/23, squash-merge `6a6543c`; `npm test` node 417 pass / 2 skip có sẵn, ui 240 pass.
- Tích hợp 4420 trên `$T/root/a-01` (bản chép, đã import trong bản chép để `/api/director` có `project.json`): series "Sóng Lag", `validate --all` và `sync-to-project` exit 0, `--eval` 400, đạo diễn thật `done` với biên nhận `actor: director:<id yêu cầu>`; 3 biên nhận `series-tool`, 0 chuỗi giống token. pid 4317 và `~/.config/motion-studio/studio.json` không đổi; Studio thử đã dừng.
- Lệch so với phase: kiểu cờ `root` nhận root Studio hoặc thư mục thật chứa dự án (theo chỉnh của người điều phối); giá trị cờ gửi dạng `--cờ=giá trị`; thêm `GET /api/series/job` để tool chờ biên nhận; `tests/fixtures/series/` có thêm `tools/slow.mjs`, `tools/new-episode.mjs`.
- Commit squash của PR #6 còn trailer `Co-authored-by` (đã merge trước khi có chỉnh); PR #23 sạch.

## Failure Protocol

Theo mục "Quy trình khi Verify trượt" của `plan.md`.
