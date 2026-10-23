# Mở bộ lớp dựng trong phần mềm dựng

"Bộ lớp dựng" (`bundle.mjs`, nút **Xuất bộ lớp dựng** ở tab Xuất bản) ghi thêm ba file timeline cạnh các lớp:

| File | Định dạng | Mở bằng |
|---|---|---|
| `timeline.fcpxml` | FCPXML 1.10 (tuỳ chọn 1.8) | Final Cut Pro, DaVinci Resolve 18+ |
| `timeline.xml` | xmeml v5 (Final Cut 7 XML) | Premiere Pro, DaVinci Resolve |
| `timeline.otio` | OpenTimelineIO JSON | Resolve 18.5+, các công cụ đọc OTIO |

Cả ba xếp giống nhau:

- **Hình (V1):** các `shots/NN-<shot>.mp4` nối nhau từ khung 0. Tổng số khung bằng `frames` của `manifest.json`.
- **Tiếng:** mỗi stem một track, dài cả video, đặt từ 0: `voice.wav` (A1), `music.wav` (A2), `sfx.wav` (A3), file nào có thì ghi file đó. Dự án không tách được stem thì chỉ có `mix.wav`.
- **Marker:** mỗi câu thoại một marker, tên là 40 ký tự đầu của câu, câu đầy đủ nằm ở ghi chú. Mỗi SFX một marker mang nhãn của nó; SFX không có nhãn thì lấy tên file tiếng. Marker đặt ở khung `round(t × fps)`.

Thời gian tính bằng số khung nguyên rồi đổi ra phân số chính xác (`lib/nle/time.mjs`). 29,97 fps là `30000/1001`, 23,976 là `24000/1001`, nên timeline không trôi.

## Chạy tay

```bash
node bundle.mjs --project <dự án> [--nle fcpxml,xmeml,otio | none] [--fcpxml-version 1.10 | 1.8]
```

- `--nle` chọn định dạng. Mặc định ghi cả ba; `none` không ghi file timeline nào.
- `--fcpxml-version 1.8` dành cho bản Final Cut hay Resolve cũ không nhận 1.10.
- `manifest.json` vẫn là schema `motion-studio/bundle@1`, chỉ thêm trường `nle`: `{ "fcpxml": "timeline.fcpxml", "xmeml": "timeline.xml", "otio": "timeline.otio", "absolute_paths": true }`. Định dạng không ghi thì là `null`. Với `--nle none` thì cả trường là `null`.
- Ghi timeline lỗi thì bundle xử lý như mọi bước khác: xoá cả thư mục bundle và thoát với mã 1.

Tool `nle_export` (`lib/tools/nle.mjs`) làm cùng việc cho đạo diễn và client MCP. Tool gọi `POST /api/bundle` của Studio đang chạy, chờ job xuất xong, rồi trả thư mục bundle và đường tuyệt đối của ba file.

## Mở trong từng phần mềm

**DaVinci Resolve:** File → Import → Timeline… (`Cmd+Shift+I`), chọn `timeline.fcpxml` hoặc `timeline.xml`. Để Resolve tự thêm media vào Media Pool. Nếu Resolve báo thiếu media, chọn thư mục bundle khi được hỏi. Resolve 18.5 trở lên đọc được cả `timeline.otio`.

**Premiere Pro:** File → Import…, chọn `timeline.xml`. Premiere tạo một bin chứa sequence, các shot và stem tiếng. Marker nằm trên sequence.

**Final Cut Pro:** File → Import → XML…, chọn `timeline.fcpxml`. Final Cut tạo event và project cùng tên tiêu đề dự án. Stem tiếng là các connected clip dưới shot đầu, mang role Dialogue, Music và Effects. Marker nằm trong shot chứa nó.

**OpenTimelineIO:** `otioview timeline.otio`, hoặc `otio.adapters.read_from_file("timeline.otio")` trong Python. Đường media là đường tương đối với thư mục bundle.

## Giới hạn

- **Chuyển cảnh nằm sẵn trong hình.** HyperFrames render cả composition một lần rồi mới cắt ra shot, nên chuyển cảnh đã nằm trong hình của các shot mà nó vắt qua. Timeline không có transition riêng. Giữ thứ tự và độ dài shot thì hình liền mạch.
- **Đường dẫn tuyệt đối.** FCPXML và xmeml bắt buộc dùng URL `file://` tuyệt đối. Chuyển hay chép thư mục bundle sang máy khác thì phải relink trong phần mềm dựng: trỏ về thư mục bundle mới, tên file vẫn giữ nguyên. Chỉ `timeline.otio` dùng đường tương đối nên vẫn mở được sau khi chuyển.
- **Timecode non-drop.** Kể cả ở 29,97 fps. Số khung vẫn chính xác, chỉ cách hiển thị timecode khác drop-frame.
- **Mỗi stem là một clip stereo 48 kHz trên một track.** Premiere có thể hiện stem thành hai track mono, tuỳ cài đặt.
- **Chưa thử mở trong NLE thật.** Máy làm tính năng này không có Resolve, Premiere hay Final Cut. Các file đã được kiểm như sau:
  - FCPXML hợp lệ theo DTD 1.10 và 1.8 của Apple (`xmllint --dtdvalid`);
  - xmeml là XML hợp lệ;
  - `timeline.otio` đọc được bằng OpenTimelineIO 0.18.1, đúng số shot, số khung và số marker.

## Nguồn

Không vendor thư viện nào, vì [ChatOctopus/timeline](https://github.com/ChatOctopus/timeline) (MIT, commit `352d8f8`) không đủ ba điều kiện vendor:

- có dependency runtime (`fast-xml-parser`);
- viết bằng TypeScript, cần bước build;
- khoảng 8.100 dòng.

Vì vậy ba bộ ghi trong `lib/nle/` được tự viết. Chúng chép cấu trúc XML và cách tính thời gian hữu tỉ của repo đó, có ghi nguồn ở đầu file. Schema OTIO lấy theo [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) (Apache-2.0, commit `eee67fd`). Thứ tự phần tử và thuộc tính FCPXML lấy theo DTD 1.8 và 1.10 của Apple, bản trong [CommandPost](https://github.com/CommandPost/CommandPost) (`src/extensions/cp/apple/fcpxml/dtd/`).

Test ở `tests/nle-export.test.mjs`, với manifest mẫu và file vàng ở `tests/fixtures/nle/`. Sửa bộ ghi có chủ ý thì sinh lại file vàng rồi xem diff trước khi commit.
