# Parity vùng timeline (4a)

Thử trên `http://127.0.0.1:4412` (server `smoke-server.mjs`, gốc thử `/tmp/ms-react-root-4412` mới tạo, có `beats.json` từ `beat-grid.mjs --min-bpm 120 --write`), sau khi merge `origin/feat/react-ui` (f300dc7, rồi 6991dd7 có bản sửa PointMenu). Trình duyệt: Chrome qua `playwright-core`, 1440×900. Dự án `thuy-mau-demo` dài 20,0 s (checklist cũ ghi 20,601 s), nên số giây khác cột Cũ; dạng op và số patch giống. Script thử: `/tmp/ms-4a-probe/parity.mjs`, kết quả `/tmp/ms-4a-probe/parity-out.json`.

| ID | Đạt | Chỗ trong UI mới | Ghi chú |
|---|---|---|---|
| TL-01 | có | khe timeline, `timeline/index.tsx` + `tracks/*` | nhãn Shot, B-roll, Lồng tiếng, Nhạc, SFX; shot 4, B-roll 4, câu 3, nhạc 1, SFX 3; ghi chú Shot "ảnh 13:18" |
| TL-02 | có | `timeline/index.tsx` (vừa khung lần đầu mỗi dự án) | tl-inner 1440 px trong khung cuộn 1440 px |
| TL-03 | có | `timeline/Ruler.tsx` | vạch `0s,1s,2s,3s` |
| TL-04 | có | `Ruler.tsx` + `useDrag.ts` startScrub | kéo thước → `0:07.7 / 0:20.0`, playhead theo |
| TL-05 | có | `useDrag.ts` startScrub | đang phát (nút "Dừng") kéo thước → nút thành "Phát" trong lúc kéo, thả ra → "Dừng" (phát tiếp) |
| TL-06 | có | `timeline/Playhead.tsx` | kéo núm → `0:10.6 / 0:20.0` |
| TL-07 | có | `Playhead.tsx` (ghi transform qua subscribe, không render React) | giờ 10,0 s ở pps 64,5 → `translateX(734px)` = 90 + 10×64,5 − 1 |
| TL-08 | có | `index.tsx` TrackRow, làn `lane-sfx` | bấm chỗ trống làn SFX → `0:10.8 / 0:20.0` |
| TL-09 | có | `timeline/Toolbar.tsx` | + → 1440→1762,5 px (×1,25), − hai lần → 1182 px; pps kẹp 8–400 (`clampPps`, test `timeline-geometry`) |
| TL-10 | có | `Toolbar.tsx` "Vừa khung" | → 1440 px, scrollLeft 0 |
| TL-11 | có | `index.tsx` onWheel + `zoomAround` | Ctrl+cuộn lên: vạch thứ hai 64.5px → 74.175px; Cmd+cuộn xuống → 64.5px; giờ dưới con trỏ giữ (test `zoomAround`) |
| TL-12 | có | `tracks/ShotTrack.tsx` | nhãn "3 · Kéo dài cảnh, tranh co giãn theo", bấm s3 → khối có `.sel`, inspector "SHOT 3 · 12.5s–17.5s" |
| TL-13 | có | `ShotTrack.tsx` mép phải, Ripple | kéo mép s1 +40 px → 1 POST `[{"op":"resize_shot","id":"s1","duration":7.1}]` |
| TL-14 | có | `keys.ts` R, `Toolbar.tsx` nút mode | R → toast "Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên"; nút "Roll" aria-pressed=true; title mép "Kéo để dời điểm cắt (Roll)" |
| TL-15 | có | `ShotTrack.tsx` + `rollOps` | kéo mép s2 −30 px ở Roll → `[{resize_shot s2 5.5},{resize_shot s3 5.5}]`, tổng 20 → 20 |
| TL-16 | có | `ShotTrack.tsx` | shot cuối ở Roll: title "Shot cuối: Roll cần shot kế tiếp, kéo sẽ không đổi gì" |
| TL-17 | có | `timeline/ShotThumb.tsx` | ảnh nền 4/4 shot; ghi chú "ảnh 13:18", title "Ảnh từ demo/animatic.mp4, 13:18:06 23/10/2026" (gốc thử mới nên chưa có đuôi "cũ hơn lần sửa timeline gần nhất"; lượt thử trước trên gốc cũ có đuôi đó) |
| TL-18 | có | `timeline/BlockMenu.ts` shotMenu | menu ["Cắt tại playhead (S)","Roll điểm cắt về playhead","Nhờ đạo diễn sửa shot này"]; mục cuối chọn s2 và focus ô `data-role=motion-note` |
| TL-19 | có | `keys.ts` S → `actions.split` | s1, playhead 3 s, S → 1 POST `[{resize_shot s1 3},{add_shot after s1 3.5 "Lớp thuỷ màu mới (sau)"},{move_event sfx-whoosh 6.3}]`, toast "Đã cắt shot. Shot mới trống, cần đạo diễn dựng cảnh. Câu vắt qua điểm cắt vẫn thuộc shot trước", menu ["Nhờ đạo diễn dựng shot mới"] (không bấm để khỏi mở job thật); Cmd+Z → "Đã hoàn tác (v6)", lại 4 shot |
| TL-20 | có | `actions.split` | 0,2 s → [lỗi] "Điểm cắt phải cách hai mép shot ít nhất 0,5 giây"; 15 s (ngoài s1) → [lỗi] "Đặt playhead trong shot cần cắt"; 0 POST |
| TL-21 | có | `tracks/VoiceTrack.tsx` | kéo vo-01 +20 px → `[{"op":"move_line","id":"vo-01","start":0.8}]` (làm tròn 0,1 s) |
| TL-22 | có | `VoiceTrack.tsx` + `rippleLineOps` | Shift+kéo vo-02 → 1 POST `[{"op":"move_line","id":"vo-02","start":7.133}]` (s2 chỉ một câu; thả hít vào mốc TIMING) |
| TL-23 | có | `VoiceTrack.tsx` click → pick | inspector "CÂU vo-02 · 6.9s–10.6s" |
| TL-24 | có | `BlockMenu.ts` lineMenu | menu ["Chọn câu"], Enter chạy → "CÂU vo-01 · 0.5s–5.0s" |
| TL-25 | có | `markers/WordDots.tsx` | pps 123 → 32 chấm `word-dot` kéo được |
| TL-26 | có | `tracks/MusicTrack.tsx` + `musicDragOps` | nhạc phủ hết video: kéo thân 0 POST; mép phải −20 px → `[{update_music bgm end 19.69}]`; khi đó kéo thân +40 px → `[{update_music bgm start 0.31 end 20}]`; mép trái +30 px → `[{update_music bgm start 0.5 media_start 0.5}]` |
| TL-27 | có | `BlockMenu.ts` musicMenu | menu ["Đưa về đầu video","Chạy tới hết video"] |
| TL-28 | có | `tracks/SfxTrack.tsx` | vừa khung (pps 64,5): top 4px,4px,4px, 0 nhãn; pps ≥ 80: nhãn "Nét cọ đầu t", "Máy quay bay", "Bụi lau tiền" |
| TL-29 | có | `SfxTrack.tsx` | kéo sfx-brush-2 +25 px → `[{"op":"move_event","id":"sfx-brush-2","start":13.12}]` |
| TL-30 | có | `SfxTrack.tsx` click → pick | inspector "SFX sfx-whoosh · 0:06.3" |
| TL-31 | có | `BlockMenu.ts` sfxMenu | SFX đạo diễn → ["Nhờ đạo diễn xoá SFX này"]; SFX thêm từ Studio (sfx-1) → ["Xoá SFX"] |
| TL-32 | có | `BlockMenu.ts` sfxLaneMenu → `actions.addSfx` | chuột phải làn SFX trống → ["Thêm SFX tại đây…"]; chọn → 6 mục "Dự án · assets/…" + "Dùng chung · thu-brush.mp3"; chọn Dùng chung → POST /api/sounds/import 200, patch `[{add_event start 15.504 sound assets/sfx/thu-brush.mp3 id sfx-1}]`, toast "Đã thêm sfx-1 lúc 15.50s" |
| TL-33 | có | `actions.addSfx` | /api/sounds rỗng → [lỗi] "Chưa có file âm thanh trong assets/ hay shared-assets/sfx"; 500 → [lỗi] "Không đọc được danh sách âm thanh: lỗi thử âm thanh" |
| TL-34 | có | `keys.ts` Delete → `actions.deletePicked` | SFX đạo diễn → "SFX này do đạo diễn đặt; bấm "Nhờ đạo diễn xoá SFX này" ở khung bên phải"; đang chọn shot → "Delete chỉ xoá SFX; xoá shot hay câu nhờ đạo diễn"; 0 POST; SFX Studio → `[{remove_event sfx-1}]` |
| TL-35 | có | `Toolbar.tsx`, `keys.ts` N, `snap.ts` | N → "Hít: tắt", nút Hít → "Hít: bật" aria-pressed=true; kéo sfx-brush-1: `snap-line` hiện; thả `[{move_event sfx-brush-1 start 5}]` |
| TL-36 | có | `useDrag.ts`, `round3` | thả khi hít giữ giờ đích 3 số lẻ (TL-35, TL-22 7.133); kéo tự do làm tròn 0,1 s (TL-21) |
| TL-37 | có | `timeline/MuteSolo.tsx` → store `toggleAudio` → player `setMute` | đầu: mọi audio bật; M Nhạc → bgm tắt; S Lồng tiếng → chỉ vo-01..03 bật (bgm, 3 SFX tắt); tắt lại → tất cả bật. Chỉ đổi `<audio>.muted` trong khung xem trước, không POST |
| TL-38 | có | `tracks/BrollTrack.tsx` | 4 ô s1–s4, ô trống title "Thả footage vào đây để thêm cho sN"; sau khi thả: s1 chip "1.png" có ảnh, s4 chip "2.mp4" có khung video (gốc thử mới chưa có B-roll sẵn như gốc cũ) |
| TL-39 | có | `BrollTrack.tsx` click → pick shot | bấm ô s2 → "SHOT 2 · 6.5s–12.5s", inspector "Chất liệu (0)" |
| TL-40 | có | `timeline/BrollDrop.ts` | thả `pitch/1.png` lên ô B-roll s1 → POST /api/timeline/asset 200, toast "Đã thêm 1.png vào s1"; thả `pitch/2.mp4` lên khối shot s4 → 200, "Đã thêm 2.mp4 vào s4"; JSON hỏng → [lỗi] "Không đọc được file vừa thả" |
| TL-41 | có | `timeline/Decorations.tsx` | vitest `timeline.test.tsx` "draws the decorators' bands and marks, view only": dải (t→until, màu `--ms-deco-<kind>`) và vạch, pointer-events none, 2 mục. Gốc thử không có extension đăng ký decorator nên không thử trực tiếp |
| TL-42 | có | `markers/BeatLayer.tsx` | kéo vạch phách +12 px → POST /api/timing/beat 200 `beat0: 0.19`, toast "Đã dời lưới phách, beat0 0.190s; đang dựng lại TIMING…" |
| TL-43 | có | `BeatLayer.tsx` | có beats.json → 43 vạch `beat-line` kéo được, title "Phách 2 · 0.950s · kéo để dời cả lưới"; không có thì vạch TIMING chỉ xem (vitest) |
| TL-44 | có | `markers/WordDots.tsx` | kéo chấm từ +15 px → POST /api/timing/word 200 `{line_id vo-01, index 1, start 0.301}`, toast "Đã dời từ "thuỷ"; đang dựng lại TIMING…" |
| TL-45 | có | `markerDrag.ts` click → pick | bấm chấm từ → inspector "MỐC TỪ · "thuỷ""; bấm vạch phách → "MỐC PHÁCH · bgm.mp3.beats.json" |
| TL-46 | có | `timeline/TimingUndo.tsx` | nút "Hoàn tác mốc (1)" bật, title "Trả lại lần sửa mốc gần nhất (còn 1)"; bấm → POST /api/timing/undo 200, toast "Đã hoàn tác mốc (assets/voice/01.mp3.words.json); đang dựng lại TIMING…" (và bản beats.json tương tự) |
| TL-47 | có | `api/markers.ts` (job timing) + inspector | job xong → toast "Đã dựng lại TIMING. Animatic cần duyệt lại"; inspector ghi "Mốc đã đổi, TIMING đã dựng lại: animatic cần duyệt lại trước khi xuất" |
| TL-48 | có | inspector mốc từ (`WordView.tsx`) → `markers.wordSync` | Kiểm khớp lời → POST /api/timing/word-sync 200, toast [lỗi] "Lỗi running" (job TIMING trước còn chạy, như bản cũ), rồi "Khớp lời: 1 đạt, 0 cảnh báo, 0 lệch (log ở tab Xuất bản)" |
| TL-49 | có | `index.tsx` `.readonly`, `editable` ở mọi track | abm-intro: 5 mép shot vẫn vẽ, `.tl-inner.readonly`; kéo mép shot và kéo câu: 0 POST; bấm câu → "CÂU el-01-hook-voice · 0.0s–4.2s"; bấm shot → "SHOT 1 · 0.0s–4.2s" |
| TL-50 | có | `index.tsx` | mở `/` → "Chưa có timeline" |
| TL-51 | có | `BlockMenu.ts` → `openPointMenu` | một lúc một menu (chuột phải vo-01 khi menu shot đang mở → còn 1 menu ["Chọn câu"]); đóng khi bấm ngoài, Escape, Tab, hay sau khi chạy mục |
| TL-52 | có | `timeline/index.tsx` (useTimelineMedia) | GET /api/timeline/media khi vẽ timeline |
| TL-PROTO-01 | có | như TL-01 | xem `phase-04-timeline-report.md` mục Điểm dừng |
| TL-PROTO-02 | có | như TL-04, TL-06 | thước → 0:07.7, núm → 0:10.6 |
| TL-PROTO-03 | có | như TL-09..11 | Ctrl/Cmd+cuộn 64.5px → 74.175px → 64.5px; + 1762,5, − 1182, Vừa khung 1440 |
| TL-PROTO-04 | có | như TL-13 | đúng 1 POST, `resize_shot s1 7.1` |
| TL-PROTO-05 | có | như TL-14..16 | tổng 20 → 20 |
| TL-PROTO-06 | có | như TL-21 | `move_line vo-01 0.8` |
| TL-PROTO-07 | có | như TL-22 | `move_line vo-02 7.133` |
| TL-PROTO-08 | có | như TL-29 | `move_event sfx-brush-2 13.12` |
| TL-PROTO-09 | có | như TL-26 | thân 0 POST khi phủ hết; mép và thân gửi update_music |
| TL-PROTO-10 | có | như TL-35 | snap-line hiện khi kéo |
| TL-PROTO-11 | có | `timeline/Wave.tsx` | canvas có cỡ 3/3 câu, 1/1 nhạc |
| TL-PROTO-12 | có | click → `actions.pick` → inspector 4d | shot → "SHOT 3 · 12.5s–17.5s"; line → "CÂU vo-02 · 6.9s–10.6s"; music → "NHẠC · bgm.mp3"; event → "SFX sfx-whoosh · 0:06.3" (thử lại sau khi merge vùng inspector) |
| KEY-01 | có | `timeline/keys.ts` | Space → nút "Dừng" (đang phát), Space lần nữa → "Phát" |
| KEY-02 | có | `keys.ts` | J từ 5 s → 0:04.0 / 0:20.0 |
| KEY-03 | có | `keys.ts` | K → dừng (nút "Phát") |
| KEY-04 | có | `keys.ts` | L → phát (nút "Dừng") |
| KEY-05 | có | `keys.ts` | ← hai lần từ 5 s → 0:04.9 (hai khung 1/30 s; bản cũ ghi 0:05.0 vì làm tròn hiển thị khác vị trí bắt đầu) |
| KEY-06 | có | `keys.ts` | → từ 5 s → 0:05.0 (một khung, hiển thị làm tròn 0,1) |
| KEY-07 | có | `keys.ts` | Shift+← hai lần từ 5 s → 0:03.0 |
| KEY-08 | có | `keys.ts` | Shift+→ từ 5 s → 0:06.0 |
| KEY-09 | có | `keys.ts` | Home → 0:00.0 / 0:20.0 |
| KEY-10 | có | `keys.ts` | End → 0:20.0 / 0:20.0 |
| KEY-11 | có | `keys.ts` → `actions.split` | toast "Đã cắt shot. Shot mới trống, cần đạo diễn dựng cảnh. Câu vắt qua điểm cắt vẫn thuộc shot trước" |
| KEY-12 | có | `keys.ts` → `actions.deletePicked` | Delete trên SFX Studio → `[{"op":"remove_event","id":"sfx-1"}]` |
| KEY-13 | có | `keys.ts` | Backspace trên SFX đạo diễn → toast "SFX này do đạo diễn đặt; bấm "Nhờ đạo diễn xoá SFX này" ở khung bên phải" |
| KEY-14 | có | `keys.ts` | N → "Hít: tắt", N lần nữa → "Hít: bật" |
| KEY-15 | có | `keys.ts` | R → "Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên", R lần nữa → "Ripple: kéo mép shot đổi độ dài, các shot sau dời theo" |
| KEY-16 | có | `VoiceTrack.tsx` | xem TL-22 |
| KEY-17 | có | `keys.ts` | Shift+Z → 1440 px |
| KEY-21 | có | `keys.ts` | = 1440→1762,5 px, + (Shift+=) → 2165,6 |
| KEY-22 | có | `keys.ts` | - → 1762,5 |
| KEY-23 | có | `keys.ts` (bỏ qua khi focus ở ô nhập) | gõ `s`, Space, Home trong ô Chuyển động của inspector: 0 POST, giờ giữ 0:00.0 → 0:00.0, chữ vào ô ("s ") |
| KEY-25 | có | `core keyAction` bỏ tổ hợp Alt | Alt+S không cắt shot: số mục log 12 → 12 |
| KEY-26 | có | `shell/PointMenu.tsx` (bản sửa 6991dd7 trên feat/react-ui) | mở menu shot → focus "Cắt tại playhead (S)"; ↓ → "Roll điểm cắt về playhead"; ↑ → "Cắt tại playhead (S)"; ↑ ở mục đầu vòng tới "Nhờ đạo diễn sửa shot này", ↓ ở mục cuối vòng về mục đầu; L trong menu không chạy timeline (nút vẫn "Phát", giờ giữ) |
| KEY-27 | có | `shell/PointMenu.tsx` | chuột phải vo-01, Enter ngay → chạy "Chọn câu": "CÂU vo-01 · 0.5s–5.0s", menu đóng |
| KEY-28 | có | `shell/PointMenu.tsx` | Escape đóng (true), Tab đóng (true), bấm ra ngoài (làn timeline) đóng (true) |
| API-56 | có | `actions.addSfx` → `Q.soundsQuery` | GET /api/sounds khi chọn "Thêm SFX tại đây…" (TL-32) |
| API-57 | có | `actions.addSfx` → `Q.soundsImport` | POST /api/sounds/import `{file: thu-brush.mp3}` 200 rồi add_event (TL-32) |
| API-59 | có | `BrollDrop.ts` → `Q.timelineAsset` | POST /api/timeline/asset 200 cho s1 (ảnh) và s4 (video) (TL-40) |
| API-60 | có | `index.tsx` | GET /api/timeline/media khi vẽ (TL-52) |
| API-61 | có | `api/markers.ts` | GET /api/timing khi mở dự án; lưới phách và chấm từ dùng nó (TL-43, TL-25) |
| API-62 | có | `BeatLayer.tsx` → `markers.setBeat` | POST /api/timing/beat 200 (TL-42) |
| API-63 | có | `TimingUndo.tsx` → `markers.undo` | POST /api/timing/undo 200 (TL-46) |
| API-64 | có | `WordDots.tsx` → `markers.setWord` | POST /api/timing/word 200 (TL-44) |
| API-65 | có | inspector mốc từ → `markers.wordSync` | POST /api/timing/word-sync 200 (TL-48) |
| EXT-05 | có | `Decorations.tsx` + `registerTimelineDecorator` | vitest: decorator vẽ một vạch info và một dải warn, chỉ xem (TL-41) |
