# Timeline

Timeline của Studio là JavaScript thuần trong `public/`, không có bước build và không dùng React. Tài liệu này ghi lại những gì đã học từ các trình dựng mã nguồn mở, vì sao Studio tự viết thay vì nhúng, bảng phím tắt đầy đủ, luồng dữ liệu và các route HTTP mà timeline dùng.

## Đối chiếu với các dự án khác

| Dự án | Giấy phép | Họ có | Ta có | Lấy gì |
|---|---|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) `packages/studio` (commit `03ed146`) | Apache-2.0 | Timeline React/Zustand cho chính runtime ta render. Snap 8 px có thứ tự ưu tiên theo loại mốc. Waveform giảm điểm theo mức zoom. Lịch tạo thumbnail | Timeline vanilla, snap theo phách, mép shot và playhead | Thuật toán `decimatePeaks` (lấy max trong mỗi ô) cho waveform nhiều mức chi tiết (`public/waveform.js`). Không chép component |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) tag `v0.3.0` | MIT | `lib/ripple` (ripple theo hiệu số), `snap-utils.ts` (ngưỡng 10 px), `placement/overlap.ts` (đặt clip vào track đầu tiên không chồng) | Ripple ở mép phải shot, do gateway của provider làm | Ý tưởng xếp làn: track trống đầu tiên theo thứ tự bắt đầu, thành `stackLanes` (`public/timeline-edit.js`), dùng cho làn nhạc và tầng SFX. Nhánh `main` hiện tại của OpenCut là bản viết lại, chưa có timeline |
| [omniclip/omniclip](https://github.com/omni-media/omniclip) (commit `cbe581a`) | MIT | `filmstrip.ts`: `<video>` ẩn, seek, vẽ lên canvas | Chưa có thumbnail | Cách lấy khung hình: `<video>` ẩn, seek tuần tự theo từng URL, vẽ canvas 160×90 rồi lưu JPEG (`public/thumbs.js`) |
| [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) (commit `7b91435`) | MIT | `TimeEvent`: mốc thời gian có tên, kéo được trên timeline, mã đọc từ file meta | Mốc phách và mốc từ chỉ đọc | Ý tưởng mốc kéo được, lưu trong file nguồn rồi dựng lại TIMING (`lib/timing-edit.mjs`). Không chép mã |
| [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Giải mã và mux media trong trình duyệt | | Không dùng: `<video>` và Web Audio đã đủ cho waveform và thumbnail, thêm thư viện thì phải có bước build |

### Nhúng hay tự viết

Tự viết. HyperFrames Studio là ứng dụng React chạy bằng server riêng. Nhúng nó (iframe hoặc web component) nghĩa là chạy thêm một server, đồng bộ hai mô hình dữ liệu và kéo React vào một trang không có bước build. Thứ ta cần là thuật toán (snap, xếp làn, giảm điểm waveform, lấy khung hình), và các thuật toán đó ngắn, chép lại được kèm ghi nguồn.

## Phím tắt

Phím tắt không chạy khi con trỏ đang ở trong ô nhập.

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| J / K / L | Lùi một giây / dừng / phát |
| ← / → | Lùi / tới một khung |
| Shift+← / Shift+→ | Lùi / tới một giây |
| Home / End | Về đầu / cuối video |
| S | Cắt shot đang chọn tại playhead |
| Delete | Xoá SFX đang chọn (chỉ SFX thêm từ Studio) |
| N | Bật / tắt hít |
| R | Đổi chế độ kéo mép shot: Ripple hoặc Roll |
| Shift+Z | Vừa khung |
| Cmd/Ctrl+Z | Hoàn tác |
| Cmd/Ctrl+Shift+Z | Làm lại |

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
| Thả footage từ khung Footage vào shot hoặc làn B-roll | Thêm file vào `assets` của shot |

## Các làn

| Làn | Nội dung |
|---|---|
| Shot | Khối shot. Shot rộng từ 48 px có ảnh khung giữa shot, lấy từ bản render mới nhất. Nhãn "ảnh HH:MM" cho biết giờ của bản render; mờ đi khi timeline đổi sau lần render đó |
| B-roll | File trong `assets` của từng shot (ảnh và video có ảnh nhỏ). Overlay tự do chưa làm; nếu manifest có `overlays` thì chỉ hiện, không sửa |
| Lồng tiếng | Câu thoại, waveform, chấm từ |
| Nhạc | Mỗi nhạc nền một làn khi chúng chồng thời gian. Vạch phách của lưới phách đầu tiên |
| SFX | Tối đa 4 tầng. Hai SFX vào hai tầng khi khối (và nhãn, từ 80 px/giây) của chúng chạm nhau |

## Luồng dữ liệu

- Mọi sửa đổi trên shot, câu và SFX đi qua `P.gateway.patch` với `base` là version Studio đang thấy. Version lệch thì server trả 409 và Studio tải lại.
- Roll là hai lệnh `resize_shot`: shot A thêm Δ, shot B bớt Δ. Gateway ripple các shot và câu sau mỗi lệnh, nên tổng độ dài giữ nguyên và các câu của shot B dời theo đầu shot B.
- Shift+kéo câu là một chuỗi `move_line`: câu đó và các câu sau nó trong cùng shot dời cùng một Δ.
- Mốc phách và mốc từ không sửa TIMING trực tiếp. Studio sửa file nguồn (`<nhạc>.beats.json`, `<giọng>.words.json`), rồi chạy lệnh timing của provider để dựng lại khối TIMING trong HTML và `timing.json`. Version manifest không đổi, nên player tải lại iframe. Sau đó inspector nhắc duyệt lại animatic.
- Mỗi lần sửa mốc lưu bản cũ vào `<dự án>/.opus/timing-edits/`. "Hoàn tác mốc" đặt lại bản mới nhất, chỉ khi file vẫn đúng như lúc sửa xong.
- Peaks waveform được lưu trong IndexedDB `ms-peaks` (khoá `url|size|mtime`), ảnh khung trong `ms-thumbs` (khoá `url|mtime|t`). Lần mở sau không tải lại file media nếu chúng chưa đổi.

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

Mã trạng thái của các route mốc: 400 dữ liệu sai, 404 không có từ hay file, 409 file đã đổi (`base_sha` lệch) hoặc đang có job đạo diễn hay timing chạy, 422 giá trị ngoài giới hạn (từ vượt từ kề hoặc ngắn hơn 10 ms, `beat0` ngoài `[0, beatLen)`), 423 dự án chỉ đọc.
