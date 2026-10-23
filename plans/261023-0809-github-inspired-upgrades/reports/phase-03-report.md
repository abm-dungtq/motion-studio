# Báo cáo phase 3: nâng cấp timeline

- PR: https://github.com/abm-dungtq/motion-studio/pull/6 (chưa merge)
- Nhánh: `feat/timeline-upgrade`, worktree `/Volumes/2/Motion-Studio/.claude/worktrees/timeline-upgrade`, đã rebase lên `main` (gồm #3 và #4)
- Trạng thái: xong

## Đã làm

- Roll / Ripple ở mép shot, đổi bằng phím R và nút "Ripple/Roll". Thêm "Roll điểm cắt về playhead" trong menu chuột phải. Roll gồm hai lệnh `resize_shot` nên độ dài video giữ nguyên.
- Shift+kéo câu thoại dời câu đó và các câu sau nó trong cùng shot (`move_line`).
- Làn nhạc: các bài chồng thời gian nằm trên làn riêng. SFX xếp tối đa 4 tầng (`stackLanes`, có tính cả nhãn). Làn B-roll nhận footage thả vào (`POST /api/timeline/asset`).
- Waveform: cache trong IndexedDB `ms-peaks` và LOD 25/50/200 điểm mỗi giây. Thumbnail khung render trên track Shot: cache `ms-thumbs`, nhãn "ảnh HH:MM", mờ đi khi bản render đã cũ.
- Mốc phách và mốc từ kéo được, sửa `beats.json` / `words.json`. Sau mỗi lần sửa chạy lệnh timing của provider để dựng lại TIMING, rồi player tải lại. Bản sao lưu nằm trong `.opus/timing-edits/` và có "Hoàn tác mốc". Inspector nhắc duyệt lại animatic và có nút "Kiểm khớp lời".
- `.agent-pop` có `max-height: calc(100vh - 72px)` và cuộn được (việc phase 1 dặn lại).
- `docs/timeline.md`: bảng "họ có / ta có / lấy gì", lý do tự viết thay vì nhúng, phím tắt đầy đủ, luồng dữ liệu và route. README chỉ thêm dòng R và dòng Shift+kéo, ở commit cuối.

## File

Mới:
- `lib/timing-edit.mjs`
- `routes/timing.mjs`
- `routes/timeline-assets.mjs`
- `public/peaks-cache.js`
- `public/thumbs.js`
- `public/timeline-lanes.js`
- `public/timeline-markers.js`
- `docs/timeline.md`
- `tests/timeline-ripple.test.mjs`
- `tests/timeline-lanes.test.mjs`
- `tests/timing-edit.test.mjs`

Sửa:
- `public/timeline.js`
- `public/timeline-edit.js`
- `public/waveform.js`
- `public/player.js`
- `public/app.js`
- `public/app.css`
- `public/index.html`
- `public/inspector.js`
- `README.md` (2 dòng)

Không sửa các file: `server.mjs`, `panels.js`, `agent.js`, `media.mjs`, `director.mjs`, `bundle.mjs`. Tên provider mặc định không xuất hiện trong file mới nào. Không có file nhị phân trong commit.

## Test

Chạy `npm test` sau khi rebase:

- 197 test: 196 pass, 0 fail, 1 skipped.
- Test bị bỏ qua là test đọc OTIO thật của #3; nó cũng bị bỏ qua trên `main`.
- `main` khi chưa có nhánh này có 175 pass, nên phase 3 thêm 21 test.

## Điều kiện đạt (thử trên 4403 với dự án `ms-smoke-3`)

| Điều kiện | Kết quả |
|---|---|
| Roll giữ độ dài video, shot thứ ba không đổi | Đạt (12 giây; s1 0–4,539, hít phách) |
| Ripple mép phải dời các shot sau | Đạt |
| Shift+kéo câu dời các câu sau trong cùng shot | Đạt (vo-02 5,5→5,9; vo-03 8,8→9,2; vo-01 đứng yên) |
| Kéo phách dựng lại TIMING | Đạt (beat0 0,039→0,089 trong `beats.json`, `timing.json`, `index.html`; iframe tải lại) |
| Kéo từ dựng lại TIMING | Đạt ("ba" 1,1→1,15; trong `timing.json` 1,6→1,65) |
| Hoàn tác mốc | Đạt (hai file về đúng sha ban đầu, nút bị vô hiệu) |
| Lần mở thứ hai không tải lại media | Đạt (không có request mp4; peaks đọc từ IndexedDB) |
| Hai làn nhạc, ba tầng SFX | Đạt |
| Popover agent cuộn được ở màn hình thấp | Đạt (ở viewport 700: cao 628 px, nội dung 669 px) |
| Phím tắt cũ trong bảng README | Đạt cả 11 dòng; kết quả từng dòng có trong PR |
| Giao diện vẫn chạy sau khi rebase | Đạt (ảnh 12) |
| Server 4403 đã dừng | Đạt; server 4317 không bị đụng tới |

Ảnh chụp nằm ở `/Volumes/2/Edit-Video/plans/reports/motion-studio-261023-timeline-shots/`:

- `01-overview.png`
- `02-lanes-sfx-music.png`
- `03-roll-drag.png`
- `04-beat-drag.png`
- `05-beat-inspector-retimed.png`
- `06-word-drag.png`
- `07-word-inspector.png`
- `08-second-load-thumbs.png`
- `09-broll-drop.png`
- `10-sfx-three-tiers.png`
- `11-agent-popover-max-height.png`
- `12-after-rebase.png`

## Chỗ lệch kế hoạch

- `media.mjs` không export `allowed()`, nên `routes/timeline-assets.mjs` viết lại luật realpath. Bản viết lại chặt hơn: chỉ nhận file trong dự án, hoặc trong `footage/` và `shared-assets/` của workspace. Nên gom hai bản về một khi có phase được sửa `media.mjs`.
- Agent-browser không thả được bằng HTML5 drag-and-drop, không giữ được Shift khi kéo, và không gửi được phím Cmd. Vì vậy thả footage, Shift+kéo và Cmd+Z / Cmd+Shift+Z được thử bằng `DragEvent` / `PointerEvent` / `KeyboardEvent` tự tạo, có kèm cờ bổ trợ.
- Khi roll, các câu của shot sau dời theo đầu shot đó. Đây là hành vi ripple của `resize_shot` trong gateway, không phải lỗi. Đã ghi lại trong `docs/timeline.md`.
- Nếu file đã được chép vào `assets/footage/` mà patch thất bại (ví dụ version lệch), file chép vẫn nằm lại.
- Làn overlay tự do không làm vì đã hoãn. Nếu manifest có `overlays` thì chỉ hiện, không sửa được.

## Còn lại trên máy

- Dự án thử `/Volumes/2/Edit-Video/ms-smoke-3` vẫn còn. Xoá nó cần người dùng đồng ý. Khi thử Cmd+Z, thao tác thả footage cũng bị hoàn tác, nên làn B-roll của dự án này giờ trống; file `assets/footage/ref-anime-samurai-duel.mp4` vẫn nằm trong dự án.
- `/tmp/ms-smoke-3.mjs` (script chạy server thử) và `/tmp/ms-ref` (các repo tham khảo) vẫn còn.
- Lúc merge cần thêm một dòng vào CHANGELOG.

Status: DONE_WITH_CONCERNS
Summary: Đã làm xong roll/ripple, Shift+kéo câu, làn nhạc/SFX/B-roll, cache waveform và thumbnail, mốc phách/từ kéo được có hoàn tác, và max-height cho popover agent. `npm test` 196 pass, 0 fail. PR #6 đã mở, chưa merge.
Concerns: Luật realpath bị lặp lại so với `media.mjs`. Thả footage, Shift+kéo và phím Cmd chỉ thử được bằng event tự tạo. `ms-smoke-3` chờ người dùng quyết định có xoá không.
