# Timeline

Timeline của Studio viết bằng React, nằm trong `ui/src/timeline/`. Phép tính không cần React (kéo, hít, xếp làn, hình học của khối) nằm ở `ui/src/core/timeline-edit.ts`, `ui/src/core/timeline-geometry.ts`, `ui/src/core/timeline-lanes.ts` và các file khác trong `ui/src/core/`, nên Node chạy thẳng được trong test. Tài liệu này ghi lại những gì đã học từ các trình dựng mã nguồn mở, vì sao Studio tự viết thay vì nhúng, bảng phím tắt đầy đủ, luồng dữ liệu và các route HTTP mà timeline dùng.

## Đối chiếu với các dự án khác

| Dự án | Giấy phép | Họ có | Ta có | Lấy gì |
|---|---|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) `packages/studio` (commit `03ed146`) | Apache-2.0 | Timeline React/Zustand cho chính runtime ta render. Snap 8 px có thứ tự ưu tiên theo loại mốc. Waveform giảm điểm theo mức zoom. Lịch tạo thumbnail | Timeline tự viết, snap theo phách, mép shot và playhead | Thuật toán `decimatePeaks` (lấy max trong mỗi ô) cho waveform nhiều mức chi tiết (`ui/src/core/waveform.ts`). Không chép component |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) tag `v0.3.0` | MIT | `lib/ripple` (ripple theo hiệu số), `snap-utils.ts` (ngưỡng 10 px), `placement/overlap.ts` (đặt clip vào track đầu tiên không chồng) | Ripple ở mép phải shot, do gateway của provider làm | Ý tưởng xếp làn: track trống đầu tiên theo thứ tự bắt đầu, thành `stackLanes` (`ui/src/core/timeline-edit.ts`), dùng cho làn nhạc và tầng SFX. Nhánh `main` hiện tại của OpenCut là bản viết lại, chưa có timeline |
| [omniclip/omniclip](https://github.com/omni-media/omniclip) (commit `cbe581a`) | MIT | `filmstrip.ts`: `<video>` ẩn, seek, vẽ lên canvas | Chưa có thumbnail | Cách lấy khung hình: `<video>` ẩn, seek tuần tự theo từng URL, vẽ canvas 160×90 rồi lưu JPEG (`ui/src/core/thumbs.ts`) |
| [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) (commit `7b91435`) | MIT | `TimeEvent`: mốc thời gian có tên, kéo được trên timeline, mã đọc từ file meta | Mốc phách và mốc từ chỉ đọc | Ý tưởng mốc kéo được, lưu trong file nguồn rồi dựng lại TIMING (`lib/timing-edit.mjs`). Không chép mã |
| [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Giải mã và mux media trong trình duyệt | | Không dùng: `<video>` và Web Audio đã đủ cho waveform và thumbnail |

### Nhúng hay tự viết

Tự viết. HyperFrames Studio là ứng dụng React chạy bằng server riêng. Nhúng nó (iframe hoặc web component) nghĩa là chạy thêm một server và đồng bộ hai mô hình dữ liệu. Giao diện của Studio nay cũng là React, nhưng timeline vẫn tự viết vì nó đọc và sửa `project.json` qua cổng lệnh của provider, còn timeline của HyperFrames Studio giữ mô hình dữ liệu riêng. Thứ ta cần là thuật toán (snap, xếp làn, giảm điểm waveform, lấy khung hình), và các thuật toán đó ngắn, chép lại được kèm ghi nguồn.

## Phím tắt

Phím tắt không chạy khi con trỏ đang ở trong ô nhập, khi đang mở hộp thoại hay menu, hoặc khi focus đang ở rail tab (mũi tên trên rail chuyển tab). Tổ hợp có Alt không chạy phím timeline; Alt+1…9 chọn tab trên rail.

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| J / K / L | Lùi một giây / dừng / phát |
| ← / → | Lùi / tới một khung |
| Shift+← / Shift+→ | Lùi / tới một giây |
| Home / End | Về đầu / cuối video |
| S | Cắt shot đang chọn tại playhead |
| Delete / Backspace | Xoá SFX đang chọn (chỉ SFX thêm từ Studio) |
| C | Ghim ghi chú tại playhead: ô gõ mở ngay đó, Enter lưu, Esc bỏ. Ghi chú hiện thành dấu trên thước và trong tab Đạo diễn |
| N | Bật / tắt hít |
| R | Đổi chế độ kéo mép shot: Ripple hoặc Roll |
| = hoặc + / - | Phóng to / thu nhỏ timeline |
| Shift+Z | Vừa khung |
| Cmd/Ctrl+Z | Hoàn tác |
| Cmd/Ctrl+Shift+Z, Ctrl+Y | Làm lại |

Thao tác chuột:

| Thao tác | Việc |
|---|---|
| Kéo khối | Dời shot, câu thoại, SFX |
| Kéo mép phải shot (Ripple) | Đổi độ dài shot, các shot sau dời theo, video dài/ngắn đi |
| Kéo mép phải shot (Roll) | Dời điểm cắt giữa shot này và shot sau, độ dài video giữ nguyên |
| Chuột phải shot, "Roll điểm cắt về playhead" | Roll điểm cắt tới playhead |
| Shift+kéo câu thoại | Dời câu đó và các câu sau nó trong cùng shot |
| Kéo vạch phách | Sửa `beat0` của lưới phách, dựng lại TIMING |
| Kéo chấm từ | Sửa giờ bắt đầu của một từ trong `words.json`, dựng lại TIMING |
| Thả footage từ tab Chất liệu, hoặc một kết quả "Tìm trong footage", vào shot hoặc làn B-roll | Thêm file vào `assets` của shot |

## Các làn

| Làn | Nội dung |
|---|---|
| Shot | Khối shot. Shot rộng từ 48 px có ảnh khung giữa shot, lấy từ bản render mới nhất. Nhãn "ảnh HH:MM" cho biết giờ của bản render; mờ đi khi timeline đổi sau lần render đó |
| B-roll | File trong `assets` của từng shot (ảnh và video có ảnh nhỏ). Overlay tự do chưa làm; nếu manifest có `overlays` thì chỉ hiện, không sửa |
| Lồng tiếng | Câu thoại, waveform, chấm từ |
| Nhạc | Mỗi nhạc nền một làn khi chúng chồng thời gian. Vạch phách của lưới phách đầu tiên |
| SFX | Tối đa 4 tầng. Hai SFX vào hai tầng khi khối (và nhãn, từ 80 px/giây) của chúng chạm nhau |

Lớp QA (nút "Lớp QA" trên thanh timeline, mặc định bật, nhớ trong trình duyệt) vẽ lên làn Shot mỗi cảnh báo và lỗi có mốc thời gian của `QA.md`: dải vàng cho WARN, đỏ cho FAIL, nhãn là mã kiểm (FREEZE, SILENCE, SYNC…), rê chuột thấy cả dòng. Studio chỉ đọc mục qc-mp4 của bản render đang tính (tên có `final` trước, rồi bản mới nhất) cùng mục BALANCE, WORD, SYNC mới nhất; cảnh báo của bản render cũ đã sửa ở bản sau thì không hiện. Bộ đọc nằm ở `ui/src/core/qa-parse.ts`, lớp và chip ở `ui/src/ext/quality/`. `QA.md` được đọc lại mỗi khi một việc kết thúc.

## Luồng dữ liệu

- Mọi sửa đổi trên shot, câu và SFX đi qua `P.gateway.patch` với `base` là version Studio đang thấy. Version lệch thì server trả 409 và Studio tải lại.
- Roll là hai lệnh `resize_shot`: shot A thêm Δ, shot B bớt Δ. Gateway ripple các shot và câu sau mỗi lệnh, nên tổng độ dài giữ nguyên và các câu của shot B dời theo đầu shot B.
- Shift+kéo câu là một chuỗi `move_line`: câu đó và các câu sau nó trong cùng shot dời cùng một Δ.
- Mốc phách và mốc từ không sửa TIMING trực tiếp. Studio sửa file nguồn (`<nhạc>.beats.json`, `<giọng>.words.json`), rồi chạy lệnh timing của provider để dựng lại khối TIMING trong HTML và `timing.json`. Version manifest không đổi, nên player tải lại iframe. Sau đó inspector nhắc duyệt lại animatic.
- Mỗi lần sửa mốc lưu bản cũ vào `<dự án>/.opus/timing-edits/`. "Hoàn tác mốc" đặt lại bản mới nhất, chỉ khi file vẫn đúng như lúc sửa xong.
- Peaks waveform được lưu trong IndexedDB `ms-peaks` (khoá `url|size|mtime`), ảnh khung trong `ms-thumbs` (khoá `url|mtime|t`). Lần mở sau không tải lại file media nếu chúng chưa đổi.

## Hoàn tác lượt AI

Trước khi đạo diễn bắt đầu một yêu cầu, Studio chép mọi file chữ của dự án vào `<dự án>/.opus/snapshots/<id yêu cầu>/`. File chữ là `.html`, `.md`, `.json`, `.css`, `.js`, `.mjs`, `.txt` và `.srt`, mỗi file tối đa 2 MB. Các thư mục `renders/`, `demo/`, `capture/`, `node_modules/`, `.hyperframes/`, `.opus/` và `.git/` được bỏ qua.

- Media không được chép. Studio chỉ ghi kích thước và giờ sửa của chúng để biết file nào bị ghi đè.
- Một yêu cầu hỏi người dùng (`studio_ask`) và các lượt tiếp theo của nó dùng chung ảnh chụp của yêu cầu đầu.
- Với runner `cli`, ảnh chụp được lấy ngay trước khi chạy `claude`. Chạy lại vì `--resume` hỏng vẫn giữ ảnh chụp đầu.
- Với runner `mcp`, ảnh chụp được lấy lúc xếp hàng nếu dự án đang rảnh. Nếu không rảnh, Studio lấy ảnh chụp lúc thấy yêu cầu đang chạy và ghi chú "chụp sau khi AI đã bắt đầu, có thể thiếu".
- Lượt không đổi gì thì ảnh chụp bị xoá. Mỗi dự án giữ 10 ảnh chụp gần nhất.

Khi lượt kết thúc, dải dưới thanh trên cùng hiện "AI đã sửa N file, vX → vY" kèm ba nút:

- **Xem thay đổi** mở danh sách file và phần khác nhau của từng file. Chỉ xem, không sửa.
- **Giữ** đóng dải.
- **Hoàn tác** làm hai bước. Đầu tiên nó chép lại các file chữ và xoá file chữ mà lượt đó thêm. Sau đó nó ghi `project.json` cũ thành một version mới qua `restore` của cổng lệnh (actor `restore`, note "hoàn tác lượt AI <id>").
  - Nếu `project.json` đã có version mới hơn sau lượt AI, Studio hỏi "Hoàn tác cả các sửa sau đó?" trước khi làm.
  - Khi đạo diễn còn yêu cầu đang chạy, đang chờ hay đang chờ trả lời, Studio từ chối hoàn tác.
  - Giọng hay ảnh bị ghi đè ngay tại chỗ thì không lấy lại được. Dải sau khi hoàn tác nêu tên các file đó và các câu cần lồng tiếng lại.
  - Provider không có `restore` thì nút Hoàn tác bị ẩn.

## Route

| Route | Việc |
|---|---|
| `GET /api/timeline/media?name=` | Bản render mới nhất (`renders/` hoặc `demo/`) và `size`/`mtime` của các file media trong manifest |
| `POST /api/timeline/asset` `{name, shot, base, path}` | Thêm file vào `assets` của shot. File trong dự án dùng tại chỗ; file trong `footage/` hay `shared-assets/` của workspace được chép vào `assets/footage/` (không ghi đè, thêm hậu tố `-2`, `-3`); nơi khác trả 403 |
| `GET /api/timing?name=` | Lưới phách, từ của từng câu, giá trị gốc và số lần hoàn tác còn lại |
| `POST /api/timing/beat` `{name, music_id, base_sha, beat0}` | Sửa `beat0` rồi dựng lại TIMING |
| `POST /api/timing/word` `{name, line_id, index, base_sha, start?, end?}` | Sửa một từ rồi dựng lại TIMING |
| `POST /api/timing/undo` `{name}` | Hoàn tác lần sửa mốc gần nhất rồi dựng lại TIMING |
| `POST /api/timing/word-sync` `{name}` | Chạy kiểm khớp lời của provider |
| `GET /api/snapshots?name=` | Các lượt AI, mới nhất trước, và `can_restore`. Đóng ảnh chụp của các chuỗi yêu cầu đã xong trước khi trả |
| `GET /api/snapshots/diff?name=&id=` | Chữ trước và sau của từng file lượt đó đã đổi, cùng media bị ghi đè hay mới tạo |
| `POST /api/snapshots/keep` `{name, id}` | Giữ lượt AI, đóng dải |
| `POST /api/snapshots/restore` `{name, id, force?}` | Hoàn tác lượt AI. 409 khi đạo diễn còn việc, 409 `code: "NEWER"` khi có sửa sau lượt đó mà chưa có `force` |

Mã trạng thái của các route mốc: 400 dữ liệu sai, 404 không có từ hay file, 409 file đã đổi (`base_sha` lệch) hoặc đang có job đạo diễn hay timing chạy, 422 giá trị ngoài giới hạn (từ vượt từ kề hoặc ngắn hơn 10 ms, `beat0` ngoài `[0, beatLen)`), 423 dự án chỉ đọc.
