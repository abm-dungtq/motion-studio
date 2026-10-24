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
  "voices": { "cast": "voices/cast.json", "roles": "voices/roles.json" },
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

Với dự án thuộc series, prompt của đạo diễn có thêm một luật: công cụ series, vẽ ảnh, lồng tiếng, dựng cảnh và giao nộp chỉ đi qua tool của Studio; không gọi codex, cast-tts hay phần giọng của `eleven.mjs` trực tiếp. `eleven.mjs sfx` và `eleven.mjs music` vẫn dùng được.

## Thêm một series khác

Chỉ cần thêm `studio-series.json` vào thư mục series và dòng `series:` vào `BRIEF.md` của các tập. Studio không có đường dẫn hay tên series nào viết cứng.

## Chạy Studio thử cạnh Studio thật

`MOTION_STUDIO_PORT` đổi cổng (mặc định 4317). Luôn đặt kèm `MOTION_STUDIO_STATE` riêng, nếu không Studio thử ghi đè file trạng thái và token của Studio thật. Đạo diễn do Studio thử chạy nhận lại hai biến này trong cấu hình MCP, nên tool của nó gọi đúng Studio thử.

```bash
export MOTION_STUDIO_PORT=4420 MOTION_STUDIO_STATE="$HOME/.cache/studio-thu/studio.json"
node bin/motion-studio.mjs start --background --root <thư mục thử>
node bin/motion-studio.mjs stop
```
