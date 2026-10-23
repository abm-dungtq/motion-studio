# Phase 4: export NLE (FCPXML, xmeml, OTIO)

- **Worktree:** `/Volumes/2/Motion-Studio/.claude/worktrees/nle-export`
- **Nhánh:** `feat/nle-export`
- **Cổng server thử:** 4404
- **Effort:** 6h
- **Ưu tiên:** P2
- **Phụ thuộc cứng:** phase 1 (seam tool, để có tool `nle_export`). Không cần agent CLI.

## Mục tiêu

"Bộ lớp dựng" (`bundle.mjs`) ghi thêm ba file timeline mở thẳng được trong phần mềm dựng:

- `timeline.fcpxml`: FCPXML, cho Final Cut Pro và DaVinci Resolve;
- `timeline.xml`: xmeml v5, cho Premiere và Resolve;
- `timeline.otio`: OpenTimelineIO JSON.

Ba file cùng xếp các shot `shots/NN-*.mp4` nối nhau trên track hình, các stem tiếng trên track tiếng, và marker cho câu thoại và SFX.

## Hiện trạng đã kiểm

**`bundle.mjs`:**
- `main()` ở `bundle.mjs:125`.
- Ghi `shots/NN-<shot>.mp4`, các stem `audio/{mix,voice,music,sfx}.wav`, `captions.srt` (`bundle.mjs:206`) và `manifest.json` (`bundle.mjs:208-220`, schema `motion-studio/bundle@1`).
- Manifest đã có đủ dữ liệu để dựng timeline NLE: `fps`, `width`, `height`, `frames`, `shots[{ id, name, file, frame_in, frame_out }]`, `audio[{ kind, file }]`, `lines[{ start, end, text }]` và `events[{ start, label }]`.
- Lỗi giữa chừng thì xoá cả thư mục (`bundle.mjs:225-227`).

**Route và UI:**
- `POST /api/bundle` (`server.mjs`, nhánh `/api/bundle`) chạy `bundle.mjs` như một job `export`.
- UI tab Xuất bản liệt kê file của thư mục render.
- Vì thế **không cần route mới**: chỉ cần `bundle.mjs` ghi thêm file.

**Test:** `tests/bundle.test.mjs` có 8 test. Test đầy đủ cần ffmpeg (`bundle.test.mjs:80`).

**Máy:** có `xmllint` (`/usr/bin/xmllint`), không có `otiotool`. Python `opentimelineio` chưa cài [UNVERIFIED trong venv `~/.claude/skills/.venv`].

## Repo học hoặc chép

| Repo | Giấy phép | Lấy gì |
|---|---|---|
| [ChatOctopus/timeline](https://github.com/ChatOctopus/timeline) | MIT, ESM, Node ≥ 18 | Bộ ghi FCPXML 1.8, xmeml v5 và OTIO; thời gian hữu tỉ không trôi. Bước 1 quyết định vendor hay chỉ học (xem dưới) |
| [AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Apache-2.0 | Schema JSON: `Timeline.1`, `Stack.1`, `Track.1`, `Clip.2`, `ExternalReference.1`, `RationalTime.1`, `TimeRange.1`, `Marker.2`. Dùng làm mẫu đối chiếu khi viết test |

**Quyết định vendor** (bước 1):
- Vendor vào `lib/vendor/chatoctopus-timeline/`, giữ `LICENSE`, ghi URL và commit ở đầu mỗi file, khi đủ cả ba điều kiện:
  - không có dependency runtime;
  - < 2.000 dòng;
  - test của chính nó chạy xanh trong `/tmp/ms-ref`, chỉ đọc kết quả.
- Nếu không đủ, tự viết ba bộ ghi trong `lib/nle/`, chép cấu trúc XML từ repo đó, có ghi nguồn. Ba định dạng này đủ nhỏ để tự viết.

## Sở hữu file

**Sửa:** `bundle.mjs` (thêm bước 6 "Timeline NLE", cờ `--nle`, thêm trường `nle` vào manifest), `tests/bundle.test.mjs` (chỉ thêm khẳng định trong test ffmpeg có sẵn).

**Tạo mới:**
- `lib/nle/index.mjs`: `writeNle(manifest, outDir, formats)`
- `lib/nle/time.mjs`: thời gian hữu tỉ
- `lib/nle/fcpxml.mjs`, `lib/nle/xmeml.mjs`, `lib/nle/otio.mjs`
- `lib/vendor/chatoctopus-timeline/` (nếu vendor)
- `lib/tools/nle.mjs`: tool `nle_export`, gọi job bundle qua Studio API, giống `POST /api/bundle`
- `docs/nle-export.md`
- Test: `tests/nle-export.test.mjs`
- Fixture `tests/fixtures/nle/` (manifest mẫu; file `.fcpxml/.xml/.otio` vàng)

**Không đụng:** `server.mjs`, `panels.js` và các file khác.

## Luồng dữ liệu

```text
bundle.mjs main()
  bước 1–5 như cũ → manifest (object trong bộ nhớ)
  bước 6: writeNle(manifest, out, formats = ["fcpxml", "xmeml", "otio"])
     time.mjs: fps → rational (30 → 30/1; 29.97 → 30000/1001; 23.976 → 24000/1001); khung → "N/Ds"
     track hình V1: shot i = clip [frame_in, frame_out) của shots/NN.mp4, đặt nối tiếp từ 0
     track tiếng A1..A3: voice.wav, music.wav, sfx.wav (có file nào thì ghi file đó), cả độ dài, từ 0;
                         không có stem nào thì chỉ ghi mix.wav
     marker: mỗi câu (tên = 40 ký tự đầu của câu), mỗi SFX (label), ở khung round(t × fps)
     đường media: URL file:// tuyệt đối (FCPXML và xmeml đòi tuyệt đối); OTIO: target_url tương đối với thư mục bundle
  → out/timeline.fcpxml, out/timeline.xml, out/timeline.otio
  manifest.nle = { fcpxml, xmeml, otio, absolute_paths: true }
  lỗi ở bước 6 → như mọi bước khác: xoá cả bundle, exit 1
```

## Các bước

1. Clone ChatOctopus/timeline và OpenTimelineIO vào `/tmp/ms-ref/`. Đọc, rồi chốt vendor hay tự viết theo ba điều kiện ở trên. Ghi quyết định vào `docs/nle-export.md`.
2. `lib/nle/time.mjs`: `rational(fps)`, `frames(n, fps) → "n*den/num s"` rút gọn bằng UCLN, `tc(n, fps)`.
3. Ba bộ ghi. Thoát ký tự XML (`& < > " '`) và giữ đúng tiếng Việt có dấu (UTF-8).
   - **FCPXML** (`version="1.10"`; Resolve 18+ đọc được 1.8–1.10): `resources` (`format`, `asset` cho từng file), `library > event > project > sequence > spine`, `asset-clip` của shot nối nhau, `asset-clip lane="-1…-3"` cho tiếng, `marker`.
   - **xmeml v5:** `sequence > media > video > track > clipitem` (có `file` với `pathurl`), `audio > track`, `rate { timebase, ntsc }`, `marker`.
   - **OTIO:** JSON với `OTIO_SCHEMA` như trên; `global_start_time` là 0.
4. Gắn vào `bundle.mjs`:
   - cờ `--nle fcpxml,xmeml,otio | none` (mặc định cả ba);
   - giữ schema `motion-studio/bundle@1` và chỉ thêm trường `nle`, nên bản cũ đọc manifest vẫn chạy;
   - cập nhật comment đầu file.
5. Tool `lib/tools/nle.mjs`.
6. Docs: cách mở trong Resolve, Premiere và Final Cut; giới hạn. Giới hạn chính: chuyển cảnh đã nằm sẵn trong hình, và đường dẫn là tuyệt đối nên chuyển thư mục bundle thì phải relink. Mục "Bộ lớp dựng" của README thêm một dòng về ba file mới, ở commit cuối khi rebase.
7. Thử thật trên 4404 với một dự án render nhanh, ví dụ `ms-smoke-4` từ `new-project.sh`. Bấm "Xuất bộ lớp dựng", kiểm ba file.

## Test (điều kiện đạt cơ học)

- `npm test`: `ℹ fail 0`; 8 test cũ của `bundle.test.mjs` vẫn đạt.
- `tests/nle-export.test.mjs` (không cần ffmpeg; dùng manifest fixture):
  - `rational(29.97)` = `30000/1001`;
  - `frames(45, 30)` = `"3/2s"`;
  - tổng độ dài các clip V1 = `frames` của manifest, không lệch khung nào;
  - FCPXML và xmeml: `xmllint --noout` exit 0, bỏ qua kèm lý do nếu không có xmllint; đếm `asset-clip` trên spine = số shot; `marker` = số câu + số SFX; chữ "Công ty bạn" (có dấu) giữ nguyên;
  - OTIO: `JSON.parse` được; `OTIO_SCHEMA` gốc = `Timeline.1`; số clip của track Video = số shot; `source_range.duration.value` cộng lại = `frames`;
  - so với file vàng trong `tests/fixtures/nle/` (byte-for-byte; ngày giờ cố định qua tham số `now`);
  - tiêu đề có `&` và `<` được thoát đúng.
- `tests/bundle.test.mjs` (test ffmpeg có sẵn): thêm khẳng định có `timeline.fcpxml`, `timeline.xml`, `timeline.otio`, `manifest.nle.fcpxml === "timeline.fcpxml"`; `--nle none` không ghi file nào trong ba file.
- Nếu `~/.claude/skills/.venv/bin/python3 -c "import opentimelineio"` chạy được: test đọc `timeline.otio` bằng OTIO thật, đếm clip. Không có thì skip, ghi lý do. Không cài gói vào môi trường global.

## Tiêu chí nghiệm thu

- Bộ lớp dựng thật trên 4404 có đủ ba file, và mọi test trên đạt.
- **Thử mở thật** (nếu máy có Resolve hay Premiere; kiểm `ls /Applications | grep -Ei "resolve|premiere|final cut"`): import `timeline.fcpxml` hoặc `timeline.xml` ra timeline đúng số shot, độ dài khớp từng khung với `manifest.frames`. Chụp ảnh lưu ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-nle-shots/`. Máy không có NLE thì ghi "chưa thử mở trong NLE" trong PR và báo người dùng.
- Server 4404 đã dừng.

## Rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Resolve hay Premiere từ chối file vì lệch phiên bản DTD | Vừa | Vừa | Theo đúng cấu trúc của ChatOctopus/timeline (đã thử với NLE); FCPXML có tuỳ chọn `--fcpxml-version 1.8` |
| Trôi thời gian với 29.97 | Thấp | Cao | Thời gian hữu tỉ theo khung; test tổng khung |
| Đường tuyệt đối gãy khi chuyển bundle | Chắc chắn nếu chuyển | Thấp | Ghi trong docs; OTIO dùng đường tương đối |
| Bước 6 lỗi làm mất bundle đã render | Thấp | Vừa | Bộ ghi là hàm thuần, đã test bằng fixture; lỗi vẫn theo luật "không để bundle dở" |

## Hoàn tác

`git revert -m 1 <merge>`. Bundle cũ vẫn đọc được, vì schema giữ `@1`.

## PR upstream

Không cần.

## PR

Tiêu đề: `feat(bundle): FCPXML, xmeml and OTIO timelines`.

Commit gợi ý:
1. `feat(nle): rational time and timeline writers`
2. `feat(bundle): write NLE timelines next to the layers`
3. `docs(nle): open the bundle in an editor`

Không nhắc AI, không Co-Authored-By.

## Failure Protocol

Nếu một điều kiện đạt trượt, hoặc cần sửa file ngoài sở hữu: **dừng**, không tự ứng biến. Gọi subagent `kongming` và đưa:

- phase và bước;
- lệnh đã chạy;
- lệnh lỗi kèm toàn bộ output;
- điều kiện đạt bị trượt;
- `file:line`.

Áp dụng lời khuyên rồi chạy lại Verify. Không gọi được `kongming` thì dừng và báo người dùng kèm bằng chứng.
