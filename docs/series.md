# Series: kho dùng chung của nhiều tập

Một series là một thư mục chứa dàn nhân vật, giọng, nền, đạo cụ và công cụ dùng chung cho nhiều tập. Mỗi tập là một dự án Studio bình thường; Studio biết tập thuộc series nào nhờ provider, và chỉ chạy công cụ series theo file khai báo `studio-series.json` nằm ở gốc thư mục series. Đạo diễn AI không ghi được ngoài dự án và không chạy được script tùy ý, nên mọi việc với kho series đi qua tool của Studio, có biên nhận.

## Tập thuộc series nào

Provider mặc định (`P.series.dirOf`) đọc `BRIEF.md` của dự án:

1. Dòng `series: <thư mục>` trong frontmatter (đường tuyệt đối, hoặc tương đối với dự án).
2. Không có thì dòng `- Thư mục series: <thư mục>` dưới mục `## series_bible` (tập cũ).

Thư mục đó phải có `studio-series.json`, nếu không dự án không thuộc series nào. Thư mục series nằm trong chính dự án (so bằng `realpath`, kể cả `series: .`) bị từ chối với 400: series là kho dùng chung nằm ngoài các tập, và ai sửa được dự án không được tự chọn công cụ nào Studio chạy. File khai báo có lỗi thì mọi route series trả 400 kèm danh sách lỗi; Studio đọc lại file khi nó đổi.

Tập có thể nằm ngoài thư mục gốc của Studio, cạnh các tập khác của series. Khi đó thư mục gốc chứa một symlink tới tập; Studio liệt kê symlink tới thư mục như một dự án (symlink hỏng thì bỏ qua).

## File khai báo

```json
{
  "schema": "<provider>/series@1",
  "name": "Tên series",
  "characters": "characters",
  "voices": { "cast": "voices/cast.json", "roles": "voices/roles.json", "previews": "voices/previews" },
  "read": ["refs", "characters", "backgrounds"],
  "writable": { "refs": "refs", "rig_src": "characters/{char}" },
  "episode": { "tool": "new-episode", "name": "a-{NN}" },
  "delivery_dir": "kenh/tap-{N}",
  "drive": { "account": "ten@example.com", "folder": "ten-thu-muc" },
  "image_styles": { "pose": "…", "background": "…" },
  "tools": {
    "validate": { "file": "tools/validate.mjs", "flags": { "--char": "id", "--all": "bool" }, "writes": [], "timeout_s": 120 },
    "sync-to-project": { "file": "tools/sync-to-project.mjs", "flags": { "--project": "project" }, "writes": ["{project}/assets/rig"], "timeout_s": 120 }
  }
}
```

- Mọi đường tương đối với thư mục series. Không nhận đường tuyệt đối, `\`, `..`, `.` hay đoạn bắt đầu bằng dấu chấm.
- Chỗ thay: `{char}` là id nhân vật (`^[a-z0-9][a-z0-9-]{0,40}$`), `{N}` và `{NN}` là số tập (hai chữ số), `{project}` là thư mục dự án và `{root}` là thư mục gốc của tập; hai chỗ sau chỉ đứng đầu một đường trong `writes`. Một thư mục của `read` hay `writes` có `{char}` chỉ tính khi lần chạy có nhân vật (`char` của yêu cầu, hoặc cờ `--char`); không có nhân vật thì thư mục đó không mở.
- `read`: thư mục series mà đối số kiểu `path:read` được trỏ vào (ngoài dự án).
- `writable`: khóa ghi được cho `series_file_put`.
- `episode`: công cụ tạo tập mới và khuôn tên tập.
- `drive.account` không bao giờ trả ra giao diện nguyên văn, chỉ dạng `ten…@example.com`.
- `tools`: mỗi công cụ là một file `.mjs` chạy bằng `node <file> …` với thư mục làm việc là thư mục series, không qua shell. `timeout_s` 1–3600 (mặc định 120); quá hạn thì Studio dừng việc.

Provider kiểm file bằng `P.series.validate` (hàm `validateSeries` của provider mặc định); tên schema đúng do provider đặt và lỗi kiểm nói rõ nó.

## Kiểu cờ

| Kiểu | Nhận | Gửi cho công cụ |
|---|---|---|
| `bool` | `true` / `false` | `--cờ` khi `true`, bỏ khi `false` |
| `int`, `number` | số nguyên / số hữu hạn (hoặc chuỗi chữ số) | `--cờ=7` |
| `id` | `^[a-z0-9][a-z0-9-]{0,40}$` | `--cờ=giá-trị` |
| `word` | `^[A-Za-z0-9._-]{1,40}$` | |
| `text` | một dòng, tối đa 200 ký tự | |
| `range` | `^\d+:\d+$` | |
| `slot` | `^[a-z]+:\d+,\d+$` | |
| `path:read`, `path:write` | đường theo luật dưới đây | đường tuyệt đối |
| `project` | tên dự án đang chạy (hoặc đúng thư mục của nó) | thư mục thật của dự án |
| `root` | thư mục gốc của Studio, hoặc thư mục thật chứa dự án | đường tuyệt đối |

Đuôi `*` cho cờ (hay danh sách đối số vị trí, khóa `positional`) nhận một mảng; mỗi giá trị thành một phần tử argv. Mọi giá trị đi dưới dạng `--cờ=giá trị` trong một phần tử argv, nên một giá trị như `--eval` không bao giờ thành cờ khác. Cờ không khai báo, kể cả dạng `-e`, bị từ chối với lỗi 400.

Kiểu `root` nhận đúng hai thư mục: thư mục gốc của Studio, và thư mục thật chứa dự án (`dirname(realpath(dự án))`, nơi các tập của series nằm cạnh nhau khi dự án là symlink). Mọi thư mục khác bị từ chối.

## Luật đường

- `S/<đường>` là trong thư mục series; mọi đường khác là tương đối với dự án.
- `realpath` của phần sâu nhất đã có phải nằm trong thư mục tương ứng (symlink không đưa ra ngoài được).
- `path:read` nằm trong dự án hoặc một thư mục của `read`, dù là cờ hay đối số vị trí.
- `path:write` nằm trong dự án hoặc một thư mục trong `writes` của công cụ.
- Không đối số nào được nằm dưới `S/build`: công cụ tự ghi vào đó, đối số thì không.

Kiểm đường chỉ ở mức đối số. Công cụ series là mã tin cậy của người dùng: Studio chặn đối số đường lạ, không làm sandbox, nên một công cụ vẫn tự ghi ra chỗ khác được nếu mã của nó làm vậy.

## Route và tool

| Route | Tool | Việc |
|---|---|---|
| `GET /api/series?name=<dự án>` | `series_list` | Series của dự án: nhân vật, vai, công cụ và cờ, khóa ghi được, loại khuôn ảnh; không có `name` thì mọi series trong thư mục gốc |
| `POST /api/series/run` | `series_tool` | Chạy một công cụ, việc `series` của dự án (một việc một lúc), biên nhận `series-tool` |
| `GET /api/series/job?id=` | | Trạng thái việc và biên nhận khi đã ghi |
| `POST /api/series/put` | `series_file_put` | Chép một file của dự án vào `<khóa writable>/<đường>`; file đã có thì 409 trừ khi `replace: true`, khi đó file cũ thành `<tên>.bak-<yyyymmddHHMM>`; đích là symlink (kể cả symlink hỏng) thì 400, Studio không ghi xuyên qua; biên nhận `series-put` |
| `POST /api/series/episode` | `series_episode_new` | Chạy công cụ `episode.tool` với `--root` là thư mục thật chứa tập nguồn; nếu thư mục đó khác thư mục gốc của Studio thì nối symlink `<gốc>/<tên tập>`; tên đã có là 409; biên nhận `series-episode` trong tập mới |

Biên nhận nằm ở `.opus/receipts/` của dự án (thư mục thật), `actor` là `director:<id yêu cầu>` khi đạo diễn gọi. Chuỗi giống khóa trong tham số bị che (`lib/agents/redact.mjs`).

Với dự án thuộc series, prompt của đạo diễn có thêm một luật: công cụ series, vẽ ảnh, lồng tiếng, dựng cảnh và giao nộp chỉ đi qua tool của Studio; không gọi codex, cast-tts hay phần giọng của `eleven.mjs` trực tiếp. `eleven.mjs sfx` và `eleven.mjs music` vẫn dùng được. Phần giọng còn bị chặn bằng quyền: provider khai `director.voiceDeniedTools` (provider mặc định: `VOICE_DENIED_TOOLS`, gồm `eleven.mjs tts` và `eleven.mjs audio-meta`), và Studio nối danh sách đó vào `--disallowedTools` của đạo diễn khi dự án thuộc series. Dự án thường không bị chặn.

## Lồng tiếng theo vai

Mỗi câu của tập có thể có `speaker`, id một vai trong `voices.roles` của series (provider đọc từ `scenes/roles.json` của dự án khi import và ghi lại khi đổi). Tab "Lời & giọng" có ô người nói cho từng câu, chấm màu suy từ id vai; đổi người nói gửi op `set_line_speaker` và câu thành `stale`. Ô chỉ sửa được khi dự án thuộc series, provider có op (`can_set_speaker`) và dự án sửa được.

Lồng tiếng đi qua hai công cụ của series, khai báo như mọi công cụ khác:

```json
"cast-tts": { "file": "tools/cast-tts.mjs", "flags": { "--role": "id", "--text-file": "path:read", "--out": "path:write", "--mix-out": "path:write", "--visemes-out": "path:write", "--speed": "number" }, "writes": ["{project}/assets"], "timeout_s": 300 },
"voice-design": { "file": "tools/voice-design.mjs", "positional": "word", "flags": { "--role": "id", "--pick": "int" }, "writes": ["voices"], "timeout_s": 300 }
```

- `cast-tts` nhận `--role <speaker> --text-file script/NN.txt --out assets/voice/NN.mp3 --mix-out assets/mix/voice-NN.mp3 --visemes-out assets/voice/NN.visemes.json`, chạy cổng viet-pro trước khi gọi ElevenLabs (`OV` là thư mục plugin của provider) và thoát mã 4 khi cổng chặn. Studio ghi lời câu vào `script/NN.txt` trước, đo file mix, gửi op `set_line_audio` (provider tính lại `gate` từ dấu cổng), rồi chạy lệnh `timing` của provider một lần.
- `voice-design design --role <id>` tạo 3 giọng thử vào `voices.previews/<id>/`; `voice-design save --role <id> --pick <n>` ghi giọng đã chọn vào `voices.cast`. Cờ đứng trước từ lệnh (`buildArgv`), nên công cụ phải đọc từ lệnh như một đối số vị trí ở bất kỳ chỗ nào.

| Route | Tool | Việc |
|---|---|---|
| `POST /api/voice/tts { name, ids }` | `series_tts` | Một câu chạy ngay (việc `tts`, tool chờ kết quả). Từ hai câu: thẻ đồng ý `elevenlabs` "Lồng tiếng N câu bằng giọng cast của series, ước X ký tự ElevenLabs", action `tts-batch`, cùng tập câu thì nhận lại thẻ cũ. Câu chưa có người nói là 400 "Chọn người nói trước"; vai chưa có trong cast là 400. Câu bị cổng chặn trả `gate: "blocked"` và không thử lại; các câu sau vẫn chạy. Biên nhận `series-tts` mỗi câu |
| `POST /api/voice/design { name, role }` | `voice_design` | Thẻ `elevenlabs` "Tạo 3 giọng thử cho <tên>, 1 lượt Voice Design", action `voice-design`. Vai không có trong roles là 400, vai đã có giọng là 409. Đồng ý thì việc `voice-design` chạy `design`, chép 3 bản vào `.opus/voice-design/<id>/` của dự án và ghi biên nhận `voice-design` |
| `GET /api/voice/previews?name=` | | Vai có 3 bản nghe thử mà chưa có giọng trong cast, và `can_set_speaker` |
| `POST /api/voice/pick { name, role, pick }` | | Lựa chọn của người dùng (bấm "Chọn giọng này" là đồng ý): chạy `save`, biên nhận `voice-pick`, rồi đạo diễn nhận yêu cầu lồng tiếng các câu của vai đó bằng `series_tts`. Đạo diễn không có tool chọn giọng |

Thẻ đồng ý của mọi việc (ảnh, giọng, giao nộp) đọc từ `GET /api/consent?name=` và hiện ở đầu tab Tài sản và dưới tab "Lời & giọng". Thẻ "Chọn giọng cho <tên>" có 3 trình phát và hiện ở tab Tài sản, tab "Lời & giọng" và cột Đạo diễn. Nút "Lồng tiếng lại" của một câu `stale` gọi `/api/voice/tts` với câu đó; "Lồng tiếng các câu cũ" gửi mọi câu `stale` và ra thẻ đồng ý.

Studio không đọc khóa ElevenLabs; khóa chỉ nằm trong công cụ series. Đuôi log của việc và biên nhận đi qua `lib/agents/redact.mjs`. Với dự án series, Claude Code từ chối `node <OV>/scripts/eleven.mjs tts …` và `… audio-meta …` của đạo diễn (quyền `--disallowedTools`, xem trên). Quyền chỉ khớp theo dạng lệnh: một lệnh viết khác đi (qua biến, qua script khác) vẫn lọt, nên vẫn kiểm sau mỗi tập: mọi file giọng mới phải có biên nhận `series-tts` (hoặc `voice-design`) tương ứng.

## Dựng lại một cảnh, duyệt nhóm cảnh

Tập có `scenes` trong `project.json` (provider đọc từ `scenes/scenes.json` khi import: mỗi cảnh là id `cN`, nhãn và danh sách shot) được dựng lại và duyệt theo từng cảnh, không phải render cả tập. Series khai báo công cụ `scene-preview`:

```json
"scene-preview": { "file": "tools/scene-preview.mjs", "flags": { "--project": "project", "--scene": "word", "--from": "number", "--to": "number", "--out": "path:write" }, "writes": ["{project}/demo"], "timeout_s": 120 }
```

Công cụ kiểm cue các shot trong khoảng `[from, to)` (lỗi thì thoát mã 3 với dòng `ERROR shot@<t0> …`), rồi ghi trang xem trước `demo/scenes/preview-cN.html` chỉ chạy khoảng đó (`<base href="../../">`, `window.PREVIEW={from,to,scene}`, `data-duration` là độ dài cảnh, tiếng tắt). Studio chạy công cụ trong việc `scene` của dự án (một cảnh một lúc), render trang đó bằng `npx hyperframes render --quality draft` ra `demo/scenes/cN.mp4`, cắt 6 khung thành `demo/scenes/cN-stills.png` bằng ffmpeg, ghi `.opus/scenes/cN.json` (khoảng giây, giờ dựng, clip, ảnh ghép) và biên nhận `scene-rebuild`. Dự án không thuộc series, hoặc series chưa khai báo `scene-preview`, nhận 400.

| Route | Tool | Việc |
|---|---|---|
| `GET /api/scenes?name=` | `scene_list` | Mọi cảnh: id, nhãn, `from`/`to`, shot, lần dựng cuối (`built`, `clip`, `stills`), `current` (lần dựng khớp khoảng giây hiện giờ; dời một câu là dời mốc cảnh), dòng duyệt và `approved_current`; `job` là việc `scene` đang chạy; `can_rebuild` |
| `POST /api/scenes/rebuild { name, scene }` | `scene_rebuild` | Dựng lại một cảnh; đang có việc thì 409. Tool chờ xong rồi trả dòng `RESULT` |
| `POST /api/scenes/approve { name, scenes, note? }` | | Lựa chọn của người dùng: mỗi cảnh một dòng `- cảnh N: approved user@studio <ISO> <nhãn>` phía trên `## Frames` của `DEMO.md`, biên nhận `scene-approve`, đạo diễn nhận yêu cầu "Người dùng duyệt cảnh N…". Cảnh chưa dựng, hoặc đã đổi mốc sau lần dựng cuối, là 409. Đạo diễn không có tool duyệt |

Thẻ "Nhóm cảnh" hiện ở cột Đạo diễn và tab Tài sản: nhãn, khoảng giây, "Dựng lại cảnh này", ảnh ghép, trình phát clip nháp, ô chọn (chỉ cảnh đã dựng đúng khoảng giây hiện giờ) và "Duyệt các cảnh đã chọn". Thẻ tự tải lại khi việc `scene` đang chạy.

Hình dựng bằng mã (`capabilities.picture_from_code` của manifest): mốc shot đi theo lời, nên timeline giấu tay kéo mép shot, menu shot bỏ mục sửa mép và phím S (cắt shot) chỉ báo "Hình dựng bằng mã: mốc shot đi theo lời. Dời câu thì được." Provider cũng từ chối `resize_shot` qua `/api/patch`.

## Nghe lại khi tiếng đã đổi

Lồng tiếng lại một câu sau khi animatic đã duyệt mà hình không đổi thì cổng cuối của provider chỉ cảnh báo "tiếng đã đổi sau animatic"; `GET /api/gates` trả thêm `audio_changed: true`. Hộp thoại Xuất bản khi đó có thẻ "Tiếng đã đổi sau animatic":

- "Đo tiếng": `POST /api/gates/audio-check { name }` chạy lệnh `mixBalance` của provider trong việc `audio-check`, chờ xong và trả `{ level, line, code, tail }`, `line` là dòng `PASS|WARN|FAIL BALANCE … dB` (đích 4–7 dB nhạc dưới giọng). Không tốn lượt.
- "Nghe rồi, được": `POST /api/gates/audio-review { name }` chạy `make-demo --record-audio-review user@studio` của provider (dòng `audio_review:` của `DEMO.md` ghi theo tiếng hiện giờ; dòng `approval:` giữ nguyên) và biên nhận `audio-review`.

Đổi mốc cảnh hay đổi người nói của một câu vẫn làm cổng FAIL như trước: khi đó dựng lại và duyệt lại cảnh.

## Giao nộp

Năm việc giao nộp của một tập ghi vào thư mục `delivery_dir` của series, `{N}` là dòng `episode:` trong frontmatter `BRIEF.md` (thiếu thì 400). Studio không bao giờ ghi đè: file cùng tên mà khác sha thì thêm `-2`, `-3`; cùng sha thì coi như đã giao; đích là symlink thì 409. Mỗi việc ghi biên nhận `deliver-<việc>` với tên file, kích thước, sha256.

| Route | Tool | Việc |
|---|---|---|
| `GET /api/delivery?name=` | `delivery_status` | Thư mục giao nộp, file đã có, trạng thái và lỗi gần nhất của năm dòng, bản final mới nhất, Drive (email đã che), thẻ đồng ý đang chờ, việc đang chạy |
| `POST /api/delivery/text` | `deliver_text` | Lần đầu ghi `delivery/tieu-de-mo-ta.md` của dự án từ bản nháp `<thư mục cha của delivery_dir>/tap-<N>-tieu-de-mo-ta.md` (không có thì khung `## title`, `## description`), thêm mốc chương `m:ss <nhãn>` mỗi cảnh vào cuối mục mô tả (dòng đầu `0:00`; mô tả đã có mốc thì giữ nguyên). Chạy `COMMANDS.platform youtube` và `lint-vietnamese-content.mjs` cạnh nó; ERROR thì trả dòng lỗi và không chép. Lần sau dùng bản trong dự án (đạo diễn sửa được) |
| `POST /api/delivery/captions` | `deliver_captions` | Cần `CAPTIONS.md` ở gốc dự án có mục `## Facebook` và `## TikTok`. `COMMANDS.captions` ra `delivery/<dự án>.srt`, rồi `COMMANDS.vietPro --stage delivery`; qua thì chép SRT và `CAPTIONS.md` |
| `POST /api/delivery/export { name, input? }` | `deliver_export` | Việc `export` (một mỗi dự án): `COMMANDS.export --target youtube,facebook,tiktok --no-thumb` trên `renders/*-final.mp4` mới nhất, chỉ cho nền tảng chưa có file; mã 5 là "cổng final chặn" kèm dòng preflight; xong chép ba file |
| `POST /api/delivery/thumbnail { name, line1, line2, accent?, prompt? }` | `deliver_thumbnail` | Ghi đợt ảnh `thumbnail` (3 ảnh `kind: "thumbnail"`, khuôn `image_styles.thumbnail`) và thẻ đồng ý `codex` action `thumbnail`; chưa tốn lượt. Đồng ý thì việc `asset-batch` vẽ cả đợt (`runBatch`) rồi chạy công cụ series `make-thumbnail` cho mỗi ảnh ra `delivery/thumb-<i>.jpg` (`--tag` là "<TÊN SERIES> · TẬP N") |
| `POST /api/delivery/thumbnail/pick { name, n }` | | Lựa chọn của người dùng: `delivery/thumb-<n>.jpg` thành `thumbnail.jpg` của thư mục giao nộp |
| `POST /api/delivery/drive { name, dry_run? }` | `drive_upload` | Không `dry_run`: thẻ đồng ý `drive` "Tải <n> file (<MB>) lên Drive <email đã che>/<thư mục>", action `drive-upload`. `dry_run: true`: chạy ngay, không cần thẻ |
| `POST /api/delivery/ask { name, row }` | | Nhờ đạo diễn sửa dòng `text` hoặc `captions` (xếp một yêu cầu kèm lỗi gần nhất) |

Công cụ `make-thumbnail` của series nhận `--in` (ảnh vẽ), `--out` (`.jpg`, không ghi đè), `--line1`, `--line2`, `--accent red|yellow|cyan`, `--tag`:

```json
"make-thumbnail": { "file": "kenh-youtube/make-thumbnail.mjs", "flags": { "--in": "path:read", "--out": "path:write", "--line1": "text", "--line2": "text", "--accent": "word", "--tag": "text" }, "writes": ["{project}/delivery"], "timeout_s": 120 }
```

Hộp thoại Xuất bản có bảng "Giao nộp" năm dòng (Video, Thumbnail, Tiêu đề và mô tả, Phụ đề, Drive): trạng thái ("chưa có", "đã có trong tap-N", "lỗi: …"), nút chạy, thẻ đồng ý của thumbnail và Drive ngay dưới dòng của nó, ba ảnh thumbnail để chọn, và "Nhờ đạo diễn sửa" khi tiêu đề hay phụ đề lỗi.

### Drive

`lib/drive.mjs` tải lên bằng gws (Google Workspace CLI); Studio không giữ khóa Google nào. Lệnh gws là `MOTION_STUDIO_GWS` (đường file; `.mjs`/`.js` chạy bằng node) hoặc `gws` trong các đường tìm CLI của agent; mọi lần gọi không qua shell:

1. `gws drive about get`: tài khoản đang đăng nhập khác `drive.account` của series thì dừng trước mọi lệnh ghi, lời nhắn có hai email đã che.
2. Tìm thư mục `drive.folder` ở gốc My Drive; không có thì tạo một lần.
3. Mỗi file `mp4`, `jpg`, `srt`, `md` của thư mục giao nộp (bỏ file ẩn): file cùng tên và cùng cỡ đã có trên Drive thì bỏ qua; còn lại `gws drive files create --upload <tên>` với cwd là thư mục giao nộp, rồi so `size` Drive trả về với file trên máy.

`dry_run` thêm `--dry-run` của gws cho mọi lệnh ghi (tạo thư mục, tải file): gws kiểm lệnh tại chỗ và không gửi; lệnh đọc vẫn chạy. Biên nhận `drive-upload` chỉ có tài khoản đã che, thư mục, và mỗi file: tên, cỡ, cỡ trên Drive, link, kết quả; không giữ đầu ra thô của gws.

## Cần xử lý ngoài

Một bước chạy công cụ lỗi hai lần liền cùng mã thì thử lại trong Studio khó qua. `lib/handoff.mjs` đếm lỗi theo bước trong `.opus/failures.json`: `series_tool` (bước là tên công cụ, ví dụ `build-rig`), `asset_batch` (`asset-batch`), `series_tts` (`tts`; câu bị cổng viet-pro chặn không tính), `scene_rebuild` (`scene-cN`), bốn việc giao nộp (`deliver-text`, `deliver-captions`, `deliver-export`, `deliver-thumbnail`) và `drive-upload`. Lỗi ném ra có mã HTTP thì mã là `http-<mã>`. Lần thành công xoá đếm.

Lần thứ hai cùng mã: Studio ghi `.opus/handoff/<bước>.md` (bước, lệnh đã chạy, mã, 30 dòng cuối đã che khóa, đường dự án, câu để dán vào Claude Code ở terminal, dòng hướng dẫn thêm `resolved: <ghi chú>`), biên nhận `handoff`, và kết quả của tool có `handoff` để đạo diễn dừng thử lại. Không ghi biến môi trường nào.

| Route | Việc |
|---|---|
| `GET /api/handoff?name=` | Thẻ đang mở: file trong `.opus/handoff/` chưa có dòng `resolved:` |
| `POST /api/handoff/resolve { name, step, note? }` | Thêm `resolved: user@studio <ISO> <ghi chú>`; không có thẻ là 404, đã xử lý là 409 |

Thẻ đỏ "Cần xử lý ngoài: <bước>" ở đầu cột Đạo diễn có câu để dán, nút "Chép" và "Đã xử lý". Dòng `resolved:` thêm bằng tay hay do Claude Code thêm cũng tắt thẻ. Bước đó lỗi lại hai lần sau khi đã xử lý thì file cũ đổi tên thành `<bước>.resolved-<giờ>.md` và có file mới.

## Thêm một series khác

Chỉ cần thêm `studio-series.json` vào thư mục series và dòng `series:` vào `BRIEF.md` của các tập. Studio không có đường dẫn hay tên series nào viết cứng.

## Chạy Studio thử cạnh Studio thật

`MOTION_STUDIO_PORT` đổi cổng (mặc định 4317). Luôn đặt kèm `MOTION_STUDIO_STATE` riêng, nếu không Studio thử ghi đè file trạng thái và token của Studio thật. Đạo diễn do Studio thử chạy nhận lại hai biến này trong cấu hình MCP, nên tool của nó gọi đúng Studio thử.

```bash
export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$HOME/.cache/studio-thu/studio.json"
node bin/motion-studio.mjs start --background --root <thư mục thử>
node bin/motion-studio.mjs stop
```
